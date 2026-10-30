// Official itineraries in the chat planning pipeline.
//
// When the journey's route has a published official plan, the plan stage does
// not ask a model to split the days: the itinerary comes from the plan, laid
// out the same way create_journey_from_itinerary writes it, and the pipeline
// keeps doing everything around it (travel intake, getting there, save,
// reply). Whether the trip needs a day to reach the plan's town is decided by
// the live timetable against the plan's meeting time (see
// collectOfficialTransport), not reserved up front. The trip ends where the
// walk ends; a way home is only added when the user asks for one in chat.
import { planDocumentSchema, type PlanDocument } from './plan-document.ts';
import { rangeMetrics, routeTrackFacts, type RouteTrackFacts } from './track-metrics.ts';
import type { PlanStop } from './official-stops.ts';

type Client = any;
type Transfer = { from: string; to: string; mode: string; duration: string | null; costRef: string | null; booking?: string | null; position: 'start' | 'end' };
type Stay = { name: string; type?: string | null; altitudeM?: number | null; water?: string | null; costRef?: string | null; signal?: string | null };
type Day = {
  kind: 'access_in' | 'hike' | 'rest' | 'access_out'; title: string; transfers: Transfer[]; stay: Stay | null; tip: string | null;
  distanceKm?: number | null; ascentM?: number | null; descentM?: number | null; duration?: string | null;
  supply?: string | null; bailout?: string | null;
  /** Named places on the route's own track, in the route's stated km. */
  stops?: PlanStop[];
};
export type PlanStation = { name: string; note?: string | null };
/** Where the plan's shared ride leaves from, and the latest train arrival that still makes it. */
export type PlanAccess = { town: string; meetingPoint: string; arriveBy: string; stations: PlanStation[] };
/** Where the walk's ride out ends, and from when a train home can be caught.
 * Kept with the plan for a later request to add the way home. */
export type PlanExit = { town: string; readyAt: string; stations: PlanStation[] };
export type OfficialPlan = {
  id: string; version: number; route_id: string; is_default: boolean;
  payload: {
    name: string; summary: string; notes: string[]; days: Day[]; access?: PlanAccess | null; exit?: PlanExit | null;
    difficulty?: string | null; audience?: string | null; bestMonths?: number[] | null;
  };
};
export type OfficialSelection = {
  plan: OfficialPlan; routeId: string; routeName: string;
  /** The route track the plan's stops are measured on. */
  track: RouteTrackFacts | null;
  /** Whether the trip includes getting to the plan's town. */
  withTravel: boolean;
  /** A day spent reaching the town before the walk. */
  accessDay: boolean;
  totalDays: number;
  /** Why the travel days came out this way, from the timetable. */
  travelBasis: string[];
  /** The user's total, kept only to say the plan changed it. */
  requestedDays: number | null;
};

const MODE_LABEL: Record<string, string> = { charter: '包车', shared: '拼车', bus: '班车', shuttle: '景区观光车' };

export async function loadOfficialPlans(admin: Client, routeId: string): Promise<{ routeName: string; track: RouteTrackFacts | null; plans: OfficialPlan[] } | null> {
  const [plans, route] = await Promise.all([
    admin.from('route_itineraries').select('id,version,route_id,is_default,payload')
      .eq('route_id', routeId).eq('status', 'published'),
    admin.from('routes').select('name,track_elevation,track_waypoints').eq('id', routeId).maybeSingle(),
  ]);
  if (plans.error) throw plans.error;
  if (route.error) throw route.error;
  if (!plans.data?.length || !route.data) return null;
  return { routeName: route.data.name, track: routeTrackFacts(route.data.track_elevation, route.data.track_waypoints), plans: plans.data };
}

/** The travel day a plan is expected to need before the timetable is read:
 * none when the plan says where and when to meet (an early train usually
 * makes it), otherwise a day to get there. */
export function expectedTravelDays(plan: OfficialPlan, withTravel: boolean) {
  return withTravel && !plan.payload.access ? 1 : 0;
}

/** The plan whose length plus the travel day is closest to the user's total. */
export function chooseOfficialPlan(plans: OfficialPlan[], totalDays: number | null, withTravel: boolean): OfficialPlan | null {
  const hikeDays = (plan: OfficialPlan) => plan.payload.days.filter(day => day.kind === 'hike').length;
  const distance = (plan: OfficialPlan) => totalDays == null ? 0 : Math.abs(plan.payload.days.length + expectedTravelDays(plan, withTravel) - totalDays);
  return [...plans].sort((a, b) => distance(a) - distance(b)
    || Number(b.is_default) - Number(a.is_default)
    || hikeDays(a) - hikeDays(b)
    || a.id.localeCompare(b.id))[0] ?? null;
}

const nodes = (title: string) => title.split('→').map(node => node.trim()).filter(Boolean);

/** Where the plan starts and ends off the trail: the town the round trip connects to. */
export function officialTowns(plan: OfficialPlan): { start: string | null; end: string | null } {
  const days = plan.payload.days;
  const first = days[0];
  const last = days.at(-1);
  return {
    start: plan.payload.access?.town ?? first?.transfers.find(transfer => transfer.position === 'start')?.from ?? (first ? nodes(first.title)[0] ?? null : null),
    end: plan.payload.exit?.town ?? last?.transfers.filter(transfer => transfer.position === 'end').at(-1)?.to
      ?? last?.stay?.name ?? (last ? nodes(last.title).at(-1) ?? null : null),
  };
}

// No arrow in the title, and at most 40 characters: presentation renames a
// longer or arrowed row after its location and, when the day has a note,
// drops the original text. Cost and booking advice go to the day note instead.
function transferTitle(transfer: Transfer) {
  const title = `${MODE_LABEL[transfer.mode] ?? ''}从${transfer.from}到${transfer.to}`;
  const timed = transfer.duration ? `${title}（${transfer.duration}）` : title;
  return (timed.length <= 40 ? timed : title).slice(0, 120);
}

// Day notes follow the trip-report shape walkers already read on 小红书:
// one line of numbers, a short paragraph, then 交通 / 住宿 / 补给 lists with
// prices. The plan overview opens Day 1; 注意事项 and the cost total close
// the last day.
const STAY_LABEL: Record<string, string> = { camp: '营地', homestay: '民宿', inn: '客栈', hotel: '酒店' };
const NOTE_LIMIT = 1000;
const list = (heading: string, lines: string[]) => lines.length ? `${heading}：\n${lines.map(line => `- ${line}`).join('\n')}` : '';
const clause = (parts: Array<string | null | undefined | false>) => parts.map(part => part && part.trim()).filter(Boolean).join('，');
const round = (value: number) => Math.round(value * 10) / 10;

function transferLine(transfer: Transfer) {
  const mode = MODE_LABEL[transfer.mode] ?? '';
  // "拼车约 60～70 元/人" under a 拼车 line would say the mode twice.
  const cost = transfer.costRef && mode && transfer.costRef.startsWith(mode) ? transfer.costRef.slice(mode.length) : transfer.costRef;
  const details = clause([cost, transfer.duration, transfer.booking]);
  return `${mode ? `${mode} ` : ''}${transfer.from} → ${transfer.to}${details ? `：${details}` : ''}`;
}

function stayLine(stay: Stay) {
  const label = stay.type ? STAY_LABEL[stay.type] : null;
  const facts = clause([label && !stay.name.includes(label) && label, stay.altitudeM != null && `海拔 ${stay.altitudeM} m`]);
  const details = clause([stay.costRef, stay.water, stay.signal && `手机信号${stay.signal}`]);
  return `${stay.name}${facts ? `（${facts}）` : ''}${details ? `：${details}` : ''}`;
}

/** 4～6 月、9～11 月 */
function monthsText(months: number[]) {
  const sorted = [...new Set(months)].filter(month => month >= 1 && month <= 12).sort((a, b) => a - b);
  const runs: number[][] = [];
  for (const month of sorted) {
    const run = runs.at(-1);
    if (run && month === run.at(-1)! + 1) run.push(month);
    else runs.push([month]);
  }
  return runs.map(run => run.length > 1 ? `${run[0]}～${run.at(-1)} 月` : `${run[0]} 月`).join('、');
}

/** The per-person price range a cost reference states, or null when it states none. */
function costRange(text: string | null | undefined): [number, number] | null {
  if (!text) return null;
  const range = /(\d+(?:\.\d+)?)\s*[～~至-]\s*(\d+(?:\.\d+)?)\s*元\s*\/\s*人/.exec(text);
  if (range) return [Number(range[1]), Number(range[2])];
  const single = /(\d+(?:\.\d+)?)\s*元\s*\/\s*人/.exec(text);
  if (single) return [Number(single[1]), Number(single[1])];
  return /^免费/.test(text.trim()) ? [0, 0] : null;
}

/** Shuttles and stays summed per person, only when every one of them states a price. */
function costTotal(days: Day[]) {
  const refs = days.flatMap(day => [...day.transfers.map(value => value.costRef), ...(day.stay ? [day.stay.costRef] : [])]);
  const ranges = refs.map(costRange);
  if (!ranges.length || ranges.some(range => !range)) return null;
  const [low, high] = ranges.reduce<[number, number]>((sum, range) => [sum[0] + range![0], sum[1] + range![1]], [0, 0]);
  return `费用参考：接驳和住宿合计约 ${low === high ? low : `${low}～${high}`} 元/人，不含餐食、门票和往返车票。`;
}

/** Sections in priority order; whatever no longer fits the note is left out whole. */
function fitNote(sections: string[]) {
  let note = '';
  for (const section of sections.filter(Boolean)) {
    const next = note ? `${note}\n\n${section}` : section;
    if (next.length <= NOTE_LIMIT) note = next;
  }
  return note;
}

/** The walking range of a hike day: its first and last stop. */
export function dayRange(day: Day): { from: PlanStop; to: PlanStop } | null {
  const stops = day.stops;
  return day.kind === 'hike' && Array.isArray(stops) && stops.length >= 2 ? { from: stops[0], to: stops.at(-1)! } : null;
}

export function officialPlanDocument(selection: OfficialSelection): PlanDocument {
  const { plan, totalDays, requestedDays, withTravel, accessDay, track } = selection;
  const { access } = plan.payload;
  const offset = accessDay ? 1 : 0;
  const towns = officialTowns(plan);
  const items: Array<Record<string, unknown>> = [];
  const groupNotes: Array<{ day: string; note: string }> = [];
  const endpoints: Array<Record<string, unknown>> = [];
  const place = (day: string, title: string, name = title, kind: 'activity' | 'stay' | 'custom' = 'activity') =>
    items.push({ day, title: title.slice(0, 120), kind, location: { name: name.slice(0, 160), source: 'custom' } });
  const transfer = (day: string, value: Transfer) => place(day, transferTitle(value), value.to);

  // The town night is a stay, not a walking stop: a day boundary is only
  // owed to days that walk the track. A title ending in 住宿 reads as generic
  // lodging and is dropped by presentation, taking the day's only row with it.
  const days = plan.payload.days;
  const walks = days.map(entry => {
    const range = dayRange(entry);
    const measured = range && track ? rangeMetrics(track, range.from.km, range.to.km) : null;
    return entry.kind === 'hike' ? {
      distanceKm: measured?.distanceKm ?? entry.distanceKm ?? null,
      ascentM: measured?.ascentM ?? entry.ascentM ?? null,
      descentM: measured?.descentM ?? entry.descentM ?? null,
    } : null;
  });
  const hiking = walks.filter(walk => walk != null);
  const sum = (key: 'distanceKm' | 'ascentM') => hiking.length && hiking.every(walk => walk[key] != null)
    ? round(hiking.reduce((total, walk) => total + walk[key]!, 0)) : null;
  const totalKm = sum('distanceKm'), totalAscent = sum('ascentM');
  const { difficulty, audience, bestMonths } = plan.payload;
  const overview = [
    `${selection.routeName} | ${plan.payload.name}`,
    clause([totalKm != null && `全程约 ${totalKm} km`, totalAscent != null && `累计爬升约 ${Math.round(totalAscent)} m`,
      difficulty && `强度${difficulty}`, !!bestMonths?.length && `最佳 ${monthsText(bestMonths)}`]),
    audience ? `适合${audience.replace(/^适合/, '')}` : '',
  ].filter(Boolean).join('\n');
  const closing = [list('注意事项', plan.payload.notes), costTotal(days) ?? ''];

  if (accessDay && towns.start) {
    place('Day 1', `在${towns.start}住一晚`, towns.start, 'stay');
    groupNotes.push({ day: 'Day 1', note: fitNote([overview, `前往${towns.start}，当晚在${towns.start}住宿。`]) });
  }
  days.forEach((entry, index) => {
    const day = `Day ${index + 1 + offset}`;
    const starts = entry.transfers.filter(value => value.position === 'start');
    for (const value of starts) transfer(day, value);
    const stops = Array.isArray(entry.stops) && entry.stops.length ? entry.stops.map(stop => stop.name) : nodes(entry.title);
    stops.forEach((node, nodeIndex) => {
      if (starts.some(value => node === value.from || node === value.to)) return;
      if (nodeIndex === stops.length - 1 && node === entry.stay?.name) return;
      place(day, node);
    });
    for (const value of entry.transfers.filter(value => value.position === 'end')) transfer(day, value);
    if (entry.stay) place(day, entry.stay.name, entry.stay.name, 'stay');
    const range = dayRange(entry);
    if (range) endpoints.push({ day, officialStop: { itineraryId: plan.id, version: plan.version, dayIndex: index } });
    const walk = walks[index];
    const stats = walk ? clause([walk.distanceKm != null && `徒步约 ${walk.distanceKm} km`, walk.ascentM != null && `爬升约 ${walk.ascentM} m`,
      walk.descentM != null && `下降约 ${walk.descentM} m`, entry.duration && `用时${entry.duration}`]) : entry.kind === 'rest' ? '休整日' : '';
    const meeting = index === 0 && access
      ? `${withTravel && !accessDay ? `当天乘早班车到${access.town}，` : ''}${access.arriveBy} 前到${access.meetingPoint}集合` : null;
    const note = fitNote([
      index === 0 && !accessDay ? overview : '',
      stats,
      entry.tip ?? '',
      list('交通', [...(meeting ? [meeting] : []), ...entry.transfers.map(transferLine)]),
      entry.stay ? list('住宿', [stayLine(entry.stay)]) : '',
      entry.supply ? `补给：${entry.supply}` : '',
      entry.bailout ? `下撤：${entry.bailout}` : '',
      ...(index === days.length - 1 ? closing : []),
    ]);
    if (note) groupNotes.push({ day, note });
  });
  const travel = accessDay ? '（第 1 天前往集合地）' : '';
  return planDocumentSchema.parse({
    journey: null, mapLocation: null, transport: null, packingProfile: null, endpoints,
    schedule: { totalDays, plannedDate: null, dayAssignments: [] },
    itineraryItems: items,
    groupNotes,
    assumptions: [
      `逐日行程按开爬官方方案「${plan.payload.name}」编排，全程 ${totalDays} 天${travel}。`,
      ...selection.travelBasis,
      ...(requestedDays != null && requestedDays !== totalDays ? [`你填写的是 ${requestedDays} 天，官方方案没有正好 ${requestedDays} 天的版本，已按最接近的方案调整为 ${totalDays} 天。`] : []),
    ].slice(0, 12),
    unverified: [], blocker: null, pendingQuestion: null,
  });
}
