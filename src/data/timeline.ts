// timeline.ts — the unified 行程 model (faithful port of the prototype's
// journey-timeline.jsx `kpBuildTimeline`). ONE concept: a checkable, day-grouped
// list of rich records. There is no item TYPE — every row is just a record whose
// body is text today but can later carry photos / videos (each row has an
// optional `media` array). Progress = how many rows are checked off. The same
// timeline reads as a plan or a record-in-progress depending on journey status;
// checks are purely manual (the app never auto-tracks position — 记录到第几天
// 完全由用户勾选). Gear checklist stays separate.
import { Poi, JourneyStatus } from './pois';

export type DayKey = 'pre' | 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'post';

export interface TLMedia {
  tone: string;
  video?: boolean;
}
export interface TLRow {
  id: string;
  title: string;
  day: DayKey;
  media?: TLMedia[];
  synth?: boolean;
  custom?: boolean;
  checked?: boolean;
}
export interface TLGroup {
  key: DayKey;
  label: string;
  rows: TLRow[];
}
export interface Timeline {
  groups: TLGroup[];
  rows: TLRow[];
  defaults: Record<string, boolean>;
  dayIndex: number;
  total: number;
}

export const DAY_ORDER: DayKey[] = ['pre', 'D1', 'D2', 'D3', 'D4', 'D5', 'post'];
export const DAY_RANK: Record<DayKey, number> = { pre: 0, D1: 1, D2: 2, D3: 3, D4: 4, D5: 5, post: 99 };
export const DAY_LABEL: Record<DayKey, string> = { pre: '出发前', post: '返程', D1: 'Day 1', D2: 'Day 2', D3: 'Day 3', D4: 'Day 4', D5: 'Day 5' };

// Synthesized starter entries — deterministic, seeded into every "my" journey so
// the timeline reads as a real, lived-in plan rather than empty scaffolding. No
// type: each is just a rich record. A couple carry placeholder media to show how
// photos / videos hang off an entry.
const SYNTH: TLRow[] = [
  { id: 'i-map', title: '保存离线地图', day: 'pre' },
  { id: 'i-book', title: '确认营地预订', day: 'pre' },
  { id: 'i-wx', title: '出发前查看天气窗口', day: 'pre' },
  { id: 'i-fam', title: '给家人留一份行程', day: 'pre' },
  { id: 'i-camp', title: '日落前抵达营地', day: 'D1' },
  { id: 'i-water', title: '营地旁有溪水，可补给', day: 'D1', media: [{ tone: 'river' }] },
  { id: 'i-fuel', title: '冲顶前补充能量', day: 'D2' },
  { id: 'i-sun', title: '在主峰看日出', day: 'D2', media: [{ tone: 'dusk' }, { tone: 'snow', video: true }] },
  { id: 'i-knee', title: '下撤路滑，注意膝盖', day: 'D3' },
  { id: 'i-up', title: '上传轨迹与照片', day: 'post' },
];

// Build the grouped timeline + a defaults map (id → done) for store seeding.
export function buildTimeline(info: Poi, status: JourneyStatus, customItems: TLRow[]): Timeline {
  const dayIndex = status === 'ongoing' ? info.dayIndex || 2 : 0;
  const isRecorded = !!info.photoUris;
  const defDone = (day: DayKey): boolean => {
    if (status === 'completed') return true;
    if (status === 'ongoing') return day === 'pre' || (DAY_RANK[day] || 0) < dayIndex;
    return false; // planning
  };

  const rows: TLRow[] = [];
  if (!isRecorded) SYNTH.forEach((it) => rows.push({ ...it, synth: true }));
  (customItems || []).forEach((it) => rows.push({ ...it, custom: true }));

  // defaults
  const defaults: Record<string, boolean> = {};
  rows.forEach((r) => {
    defaults[r.id] = defDone(r.day);
  });
  // planning: pre-seed one obvious "done" so progress isn't a flat zero
  if (status === 'planning') defaults['i-map'] = true;

  // group by day, ordered
  const groups: TLGroup[] = [];
  DAY_ORDER.forEach((dk) => {
    const inDay = rows.filter((r) => r.day === dk);
    if (!inDay.length) return;
    groups.push({ key: dk, label: DAY_LABEL[dk] || dk, rows: inDay });
  });

  return { groups, rows, defaults, dayIndex, total: rows.length };
}
