// Official itineraries in the chat planning pipeline.
//
// When the journey's route has a published official plan, the plan stage does
// not ask a model to split the days: the itinerary comes from the plan, laid
// out the same way create_journey_from_itinerary writes it, and the pipeline
// keeps doing everything around it (travel intake, round-trip transport, save,
// reply). Day 1 and the last day stay for the round trip to the plan's town.
import { planDocumentSchema, type PlanDocument } from './plan-document.ts';

type Client = any;
type Transfer = { from: string; to: string; mode: string; duration: string | null; costRef: string | null; position: 'start' | 'end' };
type Day = { kind: 'access_in' | 'hike' | 'rest' | 'access_out'; title: string; transfers: Transfer[]; stay: { name: string } | null; tip: string | null };
export type OfficialPlan = {
  id: string; version: number; route_id: string; is_default: boolean;
  payload: { name: string; summary: string; notes: string[]; days: Day[] };
};
export type OfficialSelection = {
  plan: OfficialPlan; routeId: string; routeName: string; travelDays: number; totalDays: number;
  /** The user's total, kept only to say the plan changed it. */
  requestedDays: number | null;
};

const MODE_LABEL: Record<string, string> = { charter: '包车', shared: '拼车', bus: '班车', shuttle: '景区观光车' };

export async function loadOfficialPlans(admin: Client, routeId: string): Promise<{ routeName: string; plans: OfficialPlan[] } | null> {
  const [plans, route] = await Promise.all([
    admin.from('route_itineraries').select('id,version,route_id,is_default,payload')
      .eq('route_id', routeId).eq('status', 'published'),
    admin.from('routes').select('name').eq('id', routeId).maybeSingle(),
  ]);
  if (plans.error) throw plans.error;
  if (route.error) throw route.error;
  if (!plans.data?.length || !route.data) return null;
  return { routeName: route.data.name, plans: plans.data };
}

/** The plan whose length plus the round-trip days is closest to the user's total. */
export function chooseOfficialPlan(plans: OfficialPlan[], totalDays: number | null, travelDays: number): OfficialPlan | null {
  const hikeDays = (plan: OfficialPlan) => plan.payload.days.filter(day => day.kind === 'hike').length;
  const distance = (plan: OfficialPlan) => totalDays == null ? 0 : Math.abs(plan.payload.days.length + travelDays - totalDays);
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
    start: first?.transfers.find(transfer => transfer.position === 'start')?.from ?? (first ? nodes(first.title)[0] ?? null : null),
    end: last?.transfers.filter(transfer => transfer.position === 'end').at(-1)?.to
      ?? last?.stay?.name ?? (last ? nodes(last.title).at(-1) ?? null : null),
  };
}

// No arrow in the title: the presentation step would rename an arrowed row
// after its location and push the mode, duration and cost into the day note.
function transferTitle(transfer: Transfer) {
  let title = `${MODE_LABEL[transfer.mode] ?? ''}从${transfer.from}到${transfer.to}`;
  if (transfer.duration) title += `（${transfer.duration}）`;
  if (transfer.costRef) title += `（参考 ${transfer.costRef}）`;
  return title.slice(0, 120);
}

export function officialPlanDocument(selection: OfficialSelection): PlanDocument {
  const { plan, travelDays, totalDays, requestedDays } = selection;
  const offset = travelDays > 0 ? 1 : 0;
  const towns = officialTowns(plan);
  const items: Array<Record<string, unknown>> = [];
  const groupNotes: Array<{ day: string; note: string }> = [];
  const place = (day: string, title: string, name = title, kind: 'activity' | 'stay' = 'activity') =>
    items.push({ day, title: title.slice(0, 120), kind, location: { name: name.slice(0, 160), source: 'custom' } });
  const transfer = (day: string, value: Transfer) => place(day, transferTitle(value), value.to);

  // Day 1 is titled with the town alone: the main-transport merge drops Day 1
  // rows starting with 前往 or 从 when the user already lives in the hub city.
  if (offset && towns.start) {
    place('Day 1', towns.start);
    groupNotes.push({ day: 'Day 1', note: `前往${towns.start}，当晚在${towns.start}住宿，第二天开始按官方方案出发。` });
  }
  plan.payload.days.forEach((entry, index) => {
    const day = `Day ${index + 1 + offset}`;
    const starts = entry.transfers.filter(value => value.position === 'start');
    for (const value of starts) transfer(day, value);
    const stops = nodes(entry.title);
    stops.forEach((node, nodeIndex) => {
      if (starts.some(value => node === value.from || node === value.to)) return;
      if (nodeIndex === stops.length - 1 && node === entry.stay?.name) return;
      place(day, node);
    });
    for (const value of entry.transfers.filter(value => value.position === 'end')) transfer(day, value);
    if (entry.stay) place(day, entry.stay.name, entry.stay.name, 'stay');
    const intro = index === 0
      ? [plan.payload.summary, ...plan.payload.notes.map((note, noteIndex) => `${noteIndex + 1}. ${note}`)].filter(Boolean).join('\n')
      : '';
    const note = [intro, entry.tip].filter(Boolean).join('\n\n').slice(0, 900);
    if (note) groupNotes.push({ day, note });
  });
  if (offset && towns.end) {
    const day = `Day ${totalDays}`;
    place(day, towns.end);
    groupNotes.push({ day, note: `从${towns.end}出发返程。` });
  }

  return planDocumentSchema.parse({
    journey: null, mapLocation: null, transport: null, packingProfile: null, endpoints: [],
    schedule: { totalDays, plannedDate: null, dayAssignments: [] },
    itineraryItems: items,
    groupNotes,
    assumptions: [
      `逐日行程按开爬官方方案「${plan.payload.name}」编排，全程 ${totalDays} 天${offset ? '（首尾两天为往返交通）' : ''}。`,
      ...(requestedDays != null && requestedDays !== totalDays ? [`你填写的是 ${requestedDays} 天，官方方案没有正好 ${requestedDays} 天的版本，已按最接近的方案调整为 ${totalDays} 天。`] : []),
    ],
    unverified: [], blocker: null, pendingQuestion: null,
  });
}
