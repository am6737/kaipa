import "jsr:@supabase/functions-js/edge-runtime.d.ts";

interface RouteInput {
  name: string;
  distance_km: number;
  elevation_gain_m: number;
  max_altitude_m?: number;
  difficulty: string;
  estimated_duration_hours: number;
  has_water_source: boolean;
  region?: string;
}

interface WeatherInput {
  min_temp_c: number;
  max_temp_c: number;
  max_pop: number;
  max_wind_speed_ms: number;
  has_rain_risk: boolean;
  summary?: string;
  hourly?: Array<{
    time: string;
    temp_c: number;
    pop: number;
    wind_ms: number;
    weather_code: number;
  }>;
}

interface RequestBody {
  route: RouteInput;
  weather: WeatherInput;
  planned_date: string; // YYYY-MM-DD
  day_count: number;    // how many days
}

interface TimelineTask {
  category: "prep" | "milestone" | "weather" | "gear" | "safety" | "camp" | "custom";
  title: string;
  description: string;
  suggested_time: string | null; // HH:MM
  suggested_day: number | null;  // 1-indexed day number
  sort_order: number;
}

interface AiResponse {
  tasks: TimelineTask[];
  summary: string;
}

// ─── Provider setup (same as ai-gear-recommend) ──────────────────────

const providers: Record<string, { envKey: string; call: (prompt: string, apiKey: string) => Promise<string> }> = {
  anthropic: {
    envKey: "ANTHROPIC_API_KEY",
    call: async (prompt, apiKey) => {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 8192, messages: [{ role: "user", content: prompt }] }),
      });
      if (!res.ok) throw new Error(`Anthropic ${res.status}`);
      const data = await res.json();
      return data.content?.[0]?.text ?? "";
    },
  },
  openrouter: {
    envKey: "OPENROUTER_API_KEY",
    call: async (prompt, apiKey) => {
      const model = Deno.env.get("OPENROUTER_MODEL") || "google/gemini-2.0-flash-001";
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, max_tokens: 8192, messages: [{ role: "user", content: prompt }] }),
      });
      if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? "";
    },
  },
  deepseek: {
    envKey: "DEEPSEEK_API_KEY",
    call: async (prompt, apiKey) => {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: "deepseek-chat", max_tokens: 8192, response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }),
      });
      if (!res.ok) throw new Error(`DeepSeek ${res.status}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? "";
    },
  },
};

const providerPriority = ["anthropic", "deepseek", "openrouter"];

function resolveProvider() {
  for (const name of providerPriority) {
    const p = providers[name];
    const key = Deno.env.get(p.envKey);
    if (key) return { name, apiKey: key, call: p.call };
  }
  throw new Error("No AI provider configured");
}

// ─── Prompt builder ─────────────────────────────────────────────────

function buildPrompt(req: RequestBody): string {
  const r = req.route;
  const w = req.weather;

  let hourSummary = "";
  if (w.hourly && w.hourly.length > 0) {
    const dangerous = w.hourly.filter(h => h.pop > 0.5 || h.wind_ms > 10);
    if (dangerous.length > 0) {
      hourSummary = `\n关键天气时段:\n${dangerous.map(h => `  ${h.time}: 降雨${(h.pop*100).toFixed(0)}% 风速${h.wind_ms.toFixed(1)}m/s`).join('\n')}`;
    }
  }

  const isMultiDay = req.day_count >= 2;
  const month = new Date(req.planned_date).getMonth() + 1;
  let season = "春秋";
  if (month >= 6 && month <= 8) season = "夏季";
  else if (month >= 11 || month <= 2) season = "冬季";

  return `你是户外行程规划 AI。根据路线数据和天气，生成一份**具体到时刻**的行进计划。

## 核心原则
- 你在排**行军时刻表**，不是写安全手册
- 每条事项必须绑定**具体时间**和**具体地点/行动**
- 禁止输出"注意安全""关注天气变化"等笼统建议
- 所有时间必须通过路线数据推算，不许凭空编

## 路线数据
- 名称: ${r.name}
- 总距离: ${r.distance_km} km | 累计爬升: ${r.elevation_gain_m} m
- 最高海拔: ${r.max_altitude_m ?? "未知"} m | 难度: ${r.difficulty}
- 预计行走时长: ${r.estimated_duration_hours} 小时
- 水源: ${r.has_water_source ? "有" : "无"}
${r.region ? `- 地区: ${r.region}` : ""}

## 天气 (${req.planned_date}, ${season})
- ${w.min_temp_c}°C ~ ${w.max_temp_c}°C | 降水${(w.max_pop * 100).toFixed(0)}% | 风速${w.max_wind_speed_ms.toFixed(1)}m/s${hourSummary}

## 行程天数: ${req.day_count} 天

## 计算规则
- 上升: 300m/h | 平路: 4.5km/h | 下降: 500m/h
- 每2.5h休息15min
- ${season === "夏季" ? "日出约05:30，建议06:00前出发避热" : season === "冬季" ? "日出约07:00，建议07:30出发" : "日出约06:15，建议06:30出发"}
- ${season === "夏季" ? "日落约19:30" : season === "冬季" ? "日落约17:30" : "日落约18:00"}，扎营必须在日落前1.5h完成
${w.has_rain_risk ? `- ⚠️ 有降雨风险，需在雨前完成暴露路段或扎营` : ""}

## 你需要生成的内容

**以 milestone 为主（占70%以上），生成具体行进节点：**
- 出发时间和地点
- 每隔1-2小时一个途经点（按距离/爬升推算到达时间，写清楚"预计已行进Xkm，爬升Xm"）
- 关键地形节点（垭口、山顶、河流、补水点等）的预计到达时间
- 休息点和午餐时间
${isMultiDay ? "- 每天的扎营时间和建议营地位置\n- 第二天及以后的出发时间" : "- 预计返回/结束时间"}

**仅在以下情况添加非 milestone 事项（最多2-3条）：**
- weather: 仅当存在具体危险天气窗口时（写清几点到几点有什么风险，要做什么）
- camp: 仅多日行程，写具体扎营时间和选址要求
- prep: 仅1条，出发前夜的具体准备（写清楚几点之前完成什么）
- safety/gear: 仅当路线有特殊风险时（如高海拔>4000m需要提醒高反预案，渡河段需要提醒涉水装备）
- 不要输出任何通用建议（"注意保暖""携带雨具""通知亲友"之类全部禁止）

## JSON 格式
严格返回以下格式（不要包含其他文字）:
{
  "tasks": [
    {
      "category": "milestone",
      "title": "06:30 从登山口出发",
      "description": "沿主步道向北，前方3km为缓坡上升段，预计1h到达第一个岔路口",
      "suggested_time": "06:30",
      "suggested_day": 1,
      "sort_order": 1
    }
  ],
  "summary": "全程约Xh，核心难点在XX段，需在XX点前通过"
}

注意：
- suggested_time 格式为 "HH:MM"（不带秒），无具体时间则为 null
- suggested_day 为第几天（从1开始）${isMultiDay ? "" : "，单日行程全部填 1"}
- sort_order 按时间先后排列
- 生成 ${isMultiDay ? "每天6-8条，总计" + (req.day_count * 7) + "条左右" : "8-12条"}
- summary 用一句话点出此行程的核心时间节点和关键风险`;
}

// ─── JSON repair for truncated AI responses ────────────────────────

function repairTruncatedJson(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^`{3,}(?:json)?\s*\n?/i, '').replace(/\n?`{3,}\s*$/i, '');
  if (!s.startsWith('{')) {
    const start = s.indexOf('{');
    if (start === -1) throw new Error("No JSON object found in response");
    s = s.slice(start);
  }

  try {
    JSON.parse(s);
    return s;
  } catch (_) {
    // truncated — attempt repair
  }

  // Remove trailing incomplete key-value: a comma or key fragment at the end
  s = s.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, '');
  // Remove trailing incomplete object in an array
  s = s.replace(/,\s*\{[^}]*$/, '');

  // Close open brackets/braces
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  for (const ch of s) {
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }

  if (inString) s += '"';
  while (stack.length > 0) {
    const open = stack.pop();
    s += open === '{' ? '}' : ']';
  }

  return s;
}

// ─── Handler ────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const body: RequestBody = await req.json();
    if (!body.route || !body.weather || !body.planned_date) {
      return new Response(JSON.stringify({ error: "Missing route, weather, or planned_date" }), {
        status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    const provider = resolveProvider();
    console.log(`Using AI provider: ${provider.name}`);

    const prompt = buildPrompt(body);
    const rawText = await provider.call(prompt, provider.apiKey);
    const jsonStr = repairTruncatedJson(rawText);
    const parsed: AiResponse = JSON.parse(jsonStr);

    return new Response(JSON.stringify({ ...parsed, provider: provider.name }), {
      status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: "AI service error", message: String(err) }), {
      status: 502, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
});
