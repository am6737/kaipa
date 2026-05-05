import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─── Types ──────────────────────────────────────────────────────────

interface GearItem {
  id: string;
  name: string;
  category_name: string;
  category_id: string;
  brand?: string;
  weight_g?: number;
  condition?: string;
  is_favorite: boolean;
  use_count: number;
}

interface RouteInfo {
  name: string;
  distance_km: number;
  elevation_gain_m: number;
  max_altitude_m?: number;
  difficulty: string;
  difficulty_grade?: string;
  estimated_duration_hours: number;
  has_water_source: boolean;
  description?: string;
  region?: string;
  tags?: string[];
}

interface WeatherInfo {
  min_temp_c: number;
  max_temp_c: number;
  max_pop: number;
  max_wind_speed_ms: number;
  has_rain_risk: boolean;
  summary?: string;
}

interface RequestBody {
  route: RouteInfo;
  weather?: WeatherInfo;
  gear_items: GearItem[];
  provider?: string;
}

interface AiGearSelection {
  item_id: string;
  reason: string;
}

interface AiWarning {
  level: "alert" | "warn";
  title: string;
  body: string;
}

interface AiResponse {
  selected_items: AiGearSelection[];
  warnings: AiWarning[];
  summary: string;
}

// ─── Provider abstraction ───────────────────────────────────────────

interface ProviderConfig {
  name: string;
  apiKey: string;
  call: (prompt: string, apiKey: string) => Promise<string>;
}

const providers: Record<
  string,
  { envKey: string; call: (prompt: string, apiKey: string) => Promise<string> }
> = {
  anthropic: {
    envKey: "ANTHROPIC_API_KEY",
    call: async (prompt, apiKey) => {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2048,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.content?.[0]?.text ?? "";
    },
  },

  openai: {
    envKey: "OPENAI_API_KEY",
    call: async (prompt, apiKey) => {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          max_tokens: 2048,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? "";
    },
  },

  google: {
    envKey: "GOOGLE_AI_API_KEY",
    call: async (prompt, apiKey) => {
      const model = "gemini-2.5-flash";
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 2048, responseMimeType: "application/json" },
        }),
      });
      if (!res.ok) throw new Error(`Google AI ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    },
  },

  deepseek: {
    envKey: "DEEPSEEK_API_KEY",
    call: async (prompt, apiKey) => {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          max_tokens: 2048,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? "";
    },
  },

  openrouter: {
    envKey: "OPENROUTER_API_KEY",
    call: async (prompt, apiKey) => {
      const model = Deno.env.get("OPENROUTER_MODEL") || "tencent/hunyuan-turbos-latest:free";
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? "";
    },
  },
};

const providerPriority = ["anthropic", "openai", "google", "deepseek", "openrouter"];

function resolveProvider(preferred?: string): ProviderConfig {
  // If caller specified a provider, try it first
  if (preferred && providers[preferred]) {
    const p = providers[preferred];
    const key = Deno.env.get(p.envKey);
    if (key) return { name: preferred, apiKey: key, call: p.call };
  }

  // Auto-detect: use the first provider whose API key is configured
  for (const name of providerPriority) {
    const p = providers[name];
    const key = Deno.env.get(p.envKey);
    if (key) return { name, apiKey: key, call: p.call };
  }

  throw new Error(
    "No AI provider configured. Set one of: " +
      Object.values(providers).map((p) => p.envKey).join(", "),
  );
}

// ─── Prompt builder ─────────────────────────────────────────────────

function buildPrompt(req: RequestBody): string {
  const route = req.route;
  const weather = req.weather;
  const items = req.gear_items;

  const categoryGroups: Record<string, GearItem[]> = {};
  for (const item of items) {
    const cat = item.category_name;
    if (!categoryGroups[cat]) categoryGroups[cat] = [];
    categoryGroups[cat].push(item);
  }

  let gearInventory = "";
  for (const [cat, catItems] of Object.entries(categoryGroups)) {
    gearInventory += `\n【${cat}】\n`;
    for (const item of catItems) {
      const parts = [`- ${item.name} (ID: ${item.id})`];
      if (item.brand) parts.push(`品牌: ${item.brand}`);
      if (item.weight_g) parts.push(`重量: ${item.weight_g}g`);
      if (item.condition) parts.push(`状态: ${item.condition}`);
      if (item.is_favorite) parts.push("(收藏)");
      if (item.use_count > 0) parts.push(`使用${item.use_count}次`);
      gearInventory += parts.join(", ") + "\n";
    }
  }

  let weatherSection = "天气数据: 暂无";
  if (weather) {
    weatherSection = `天气预报:
- 温度范围: ${weather.min_temp_c}°C ~ ${weather.max_temp_c}°C
- 最大降水概率: ${(weather.max_pop * 100).toFixed(0)}%
- 最大风速: ${weather.max_wind_speed_ms.toFixed(1)} m/s
- 降雨风险: ${weather.has_rain_risk ? "有" : "无"}${weather.summary ? `\n- 概况: ${weather.summary}` : ""}`;
  }

  return `你是一位经验丰富的户外徒步装备顾问。用户即将进行一次徒步活动，请根据路线信息、天气预报以及用户现有的装备库，智能推荐应该携带哪些装备。

## 路线信息
- 名称: ${route.name}
- 距离: ${route.distance_km} 公里
- 累计爬升: ${route.elevation_gain_m} 米
- 最高海拔: ${route.max_altitude_m ?? "未知"} 米
- 难度: ${route.difficulty}${route.difficulty_grade ? ` ${route.difficulty_grade}` : ""}
- 预计时长: ${route.estimated_duration_hours} 小时
- 沿途水源: ${route.has_water_source ? "有" : "无"}${route.region ? `\n- 地区: ${route.region}` : ""}${route.description ? `\n- 描述: ${route.description}` : ""}${route.tags && route.tags.length > 0 ? `\n- 标签: ${route.tags.join(", ")}` : ""}

## ${weatherSection}

## 用户装备库
以下是用户拥有的所有装备，请从中选择合适的:
${gearInventory}

## 任务
1. 从用户装备库中选择本次徒步应携带的装备，返回每件装备的 ID 和选择理由
2. 如果发现用户装备库中缺少关键装备，在 warnings 中提醒（level 为 "alert"）
3. 如果有需要注意但不紧急的建议，在 warnings 中提醒（level 为 "warn"）
4. 给出一句简短的整体搭配总结

## 选择原则
- 安全第一：必要的安全装备（头灯、急救包等）优先
- 适应天气：根据温度和降水选择合适的衣物层
- 轻量化：在满足安全的前提下，选择更轻的装备
- 用户偏好：优先选择用户收藏的和使用频率高的装备
- 路线适配：根据难度、距离、海拔调整装备选择

请严格按以下 JSON 格式返回（不要包含任何其他文字）:
{
  "selected_items": [
    {"item_id": "装备ID", "reason": "选择理由（简短）"}
  ],
  "warnings": [
    {"level": "alert或warn", "title": "标题", "body": "详细说明"}
  ],
  "summary": "整体搭配总结（一句话）"
}`;
}

// ─── Handler ────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const body: RequestBody = await req.json();

    if (!body.route || !body.gear_items || body.gear_items.length === 0) {
      return jsonResponse({ error: "Missing route or gear_items" }, 400);
    }

    const provider = resolveProvider(body.provider);
    console.log(`Using AI provider: ${provider.name}`);

    const prompt = buildPrompt(body);
    const rawText = await provider.call(prompt, provider.apiKey);

    // Extract JSON (handle markdown fences some models return)
    let jsonStr = rawText.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    const parsed: AiResponse = JSON.parse(jsonStr);

    // Validate item IDs exist in the input
    const validIds = new Set(body.gear_items.map((i) => i.id));
    parsed.selected_items = parsed.selected_items.filter((s) =>
      validIds.has(s.item_id),
    );

    return jsonResponse({ ...parsed, provider: provider.name });
  } catch (err) {
    console.error("Edge function error:", err);
    return jsonResponse(
      { error: "AI service error", message: String(err) },
      502,
    );
  }
});
