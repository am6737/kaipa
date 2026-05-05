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
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 4096, messages: [{ role: "user", content: prompt }] }),
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
        body: JSON.stringify({ model, max_tokens: 4096, messages: [{ role: "user", content: prompt }] }),
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
        body: JSON.stringify({ model: "deepseek-chat", max_tokens: 4096, response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }),
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

  return `你是一位经验丰富的户外徒步向导和行程规划专家。请根据以下路线信息、天气预报和出行日期，为用户生成一份详细的徒步行程时间线和待办清单。

## 路线信息
- 名称: ${r.name}
- 距离: ${r.distance_km} km
- 累计爬升: ${r.elevation_gain_m} m
- 最高海拔: ${r.max_altitude_m ?? "未知"} m
- 难度: ${r.difficulty}
- 预计总时长: ${r.estimated_duration_hours} 小时
- 沿途水源: ${r.has_water_source ? "有" : "无"}
${r.region ? `- 地区: ${r.region}` : ""}

## 天气预报 (出行日期: ${req.planned_date})
- 温度: ${w.min_temp_c}°C ~ ${w.max_temp_c}°C
- 降水概率: ${(w.max_pop * 100).toFixed(0)}%
- 最大风速: ${w.max_wind_speed_ms.toFixed(1)} m/s
- 降雨风险: ${w.has_rain_risk ? "有" : "无"}${w.summary ? `\n- 概况: ${w.summary}` : ""}${hourSummary}

## 行程天数: ${req.day_count} 天

## 任务生成要求

请生成以下类别的任务，按时间顺序排列：

### prep（出发前准备）
- 提前检查的事项（装备打包、充电、下载离线地图、告知亲友路线等）

### milestone（关键里程碑）
- 几点出发（考虑天气，避开最热/最冷的时段，充分利用日照）
- 预计几点到达关键节点（垭口、山顶、补水点等）
- 根据路线距离和爬升合理分配各段时间

### weather（天气提醒）
${w.has_rain_risk ? "- **关键**: 下午可能有恶劣天气，必须在天气恶化前完成关键路段或扎营" : "- 根据温度提醒防晒或保暖"}
- 给出具体的建议时间窗口

### camp（营地相关）
${req.day_count >= 2 ? "- 建议扎营时间（必须在天黑前，且考虑天气恶化时间）" : "- 单日路线，无需扎营"}
- 营地选择建议

### safety（安全提醒）
- 高海拔注意高反
- 长距离注意体力分配
- 其他安全提示

### gear（装备提醒）
- 关键装备检查提醒

## 输出格式
请严格按以下 JSON 格式返回（不要包含任何其他文字）:
{
  "tasks": [
    {
      "category": "prep|milestone|weather|camp|safety|gear",
      "title": "任务标题（简短有力）",
      "description": "详细说明（1-2句话，解释为什么和怎么做）",
      "suggested_time": "06:30 或 null（如果是具体时间点）",
      "sort_order": 1
    }
  ],
  "summary": "一句话总结本次行程的关键注意事项"
}

## 时间规划原则
- 夏季: 尽量早出发(6-7点)，避开中午高温
- 冬季: 稍晚出发(7-8点)，充分利用日照温度
- 如果下午有降雨/降雪风险，倒推最晚扎营时间
- 上升速度按 300-400m/h 估算，平地 4-5km/h
- 每 2-3 小时安排一次休息
- 天黑时间按季节估算（夏季约19:30，春秋约18:00，冬季约17:00）
- 必须在日落前 1-2 小时完成扎营

请确保任务数量在 8-15 条之间，覆盖行前、出发、途中、扎营、收尾全流程。`;
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

    let jsonStr = rawText.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();

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
