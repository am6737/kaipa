// Turns pasted text or screenshots of an itinerary into a structured draft.
// The model only transcribes: it may not add days, stops or numbers the
// source doesn't state. All judgement about the plan happens in the app
// (src/lib/itineraryCheck.ts), so the same draft always gets the same report.

export type RouteOption = { id: string; name: string; region: string | null };

export type ImportedItem = {
  title: string;
  kind: 'activity' | 'transport' | 'stay';
  timeStart: string | null;
  timeEnd: string | null;
};

export type ImportedDay = {
  title: string;
  date: string | null;
  kind: 'access' | 'hike' | 'rest' | 'other';
  distanceKm: number | null;
  ascentM: number | null;
  descentM: number | null;
  stay: string | null;
  sleepAltitudeM: number | null;
  items: ImportedItem[];
};

export type ImportedItinerary = {
  name: string;
  routeId: string | null;
  startDate: string | null;
  days: ImportedDay[];
  unreadable: string[];
};

export const MAX_DAYS = 30;
export const MAX_ITEMS_PER_DAY = 30;

export function buildPrompt(routes: RouteOption[], text: string, imageCount: number) {
  const catalog = routes.map((route) => `${route.id}\t${route.name}${route.region ? `\t${route.region}` : ''}`).join('\n');
  return `你是行程整理助手。把用户提供的行程（文字${imageCount ? `和 ${imageCount} 张截图` : ''}）原样整理成逐日结构，只做转写，不做规划。

规则：
- 只写来源里明确出现的内容。不要补充来源没有的天数、地点、住宿、时间或数字。
- 数字字段（distanceKm 公里、ascentM 爬升米、descentM 下降米、sleepAltitudeM 当晚住宿海拔米）来源没写就填 null，不要估算。
- date 只在来源写明日期时填写，格式 YYYY-MM-DD；只写了月日时，按最近的未来年份补全年份。startDate 是第一天的日期，没有就填 null。
- kind：进山、出山、大交通日为 access；徒步日为 hike；休整、适应日为 rest；其他为 other。
- items 是当天按顺序的安排，kind 为 transport（交通）、stay（住宿）或 activity（其他）；timeStart、timeEnd 用 24 小时制 HH:MM，没写填 null。
- stay 是当晚住宿地名称，没写填 null。
- routeId：行程明确对应下面目录中的某条线路时填它的 id，否则填空字符串。
- name 是简短的行程名，例如线路名加天数。
- unreadable 列出看不清或无法确定的部分（每条一句话），没有则为空数组。

线路目录（id、名称、地区）：
${catalog || '（空）'}

只输出 JSON：{"name":"","routeId":"","startDate":null,"days":[{"title":"","date":null,"kind":"hike","distanceKm":null,"ascentM":null,"descentM":null,"stay":null,"sleepAltitudeM":null,"items":[{"title":"","kind":"activity","timeStart":null,"timeEnd":null}]}],"unreadable":[]}

用户的行程文字：
${text.trim() || '（无，见截图）'}`;
}

export function parseModelJson(text: string): unknown {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch { /* fall through to the fenced or embedded object */ }
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/) || trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('model_returned_no_json');
  return JSON.parse(match[1] || match[0]);
}

const str = (value: unknown, max: number) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
const optStr = (value: unknown, max: number) => str(value, max) || null;
const num = (value: unknown, max: number) => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max ? Math.round(value * 10) / 10 : null;

export function isoDate(value: unknown): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof value === 'string' ? value.trim() : '');
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]) ? match[0] : null;
}

function clock(value: unknown): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(typeof value === 'string' ? value.trim() : '');
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

export function normalizeItinerary(value: unknown, routes: RouteOption[]): ImportedItinerary {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const routeIds = new Set(routes.map((route) => route.id));
  const days = (Array.isArray(raw.days) ? raw.days : []).slice(0, MAX_DAYS).map((entry): ImportedDay => {
    const day = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    const items = (Array.isArray(day.items) ? day.items : []).slice(0, MAX_ITEMS_PER_DAY).map((itemEntry): ImportedItem => {
      const item = (itemEntry && typeof itemEntry === 'object' ? itemEntry : {}) as Record<string, unknown>;
      return {
        title: str(item.title, 120),
        kind: oneOf(item.kind, ['activity', 'transport', 'stay'] as const, 'activity'),
        timeStart: clock(item.timeStart),
        timeEnd: clock(item.timeEnd),
      };
    }).filter((item) => item.title);
    return {
      title: str(day.title, 120),
      date: isoDate(day.date),
      kind: oneOf(day.kind, ['access', 'hike', 'rest', 'other'] as const, 'other'),
      distanceKm: num(day.distanceKm, 200),
      ascentM: num(day.ascentM, 9000),
      descentM: num(day.descentM, 9000),
      stay: optStr(day.stay, 80),
      sleepAltitudeM: num(day.sleepAltitudeM, 8900),
      items,
    };
  }).filter((day) => day.title || day.items.length);
  const routeId = str(raw.routeId, 80);
  return {
    name: str(raw.name, 60),
    routeId: routeIds.has(routeId) ? routeId : null,
    startDate: isoDate(raw.startDate) ?? days[0]?.date ?? null,
    days,
    unreadable: (Array.isArray(raw.unreadable) ? raw.unreadable : []).map((note) => str(note, 120)).filter(Boolean).slice(0, 5),
  };
}
