import { z } from 'npm:zod@4.1.12';
import type { AgentMessageUi } from './types.ts';
import type { createAgentRuntime } from './agent.ts';

export const itineraryBriefSchema = z.object({
  routeName: z.string().nullable(),
  trekStartDate: z.string().nullable(),
  hikeDays: z.number().int().min(1).max(30).nullable(),
});
export type ItineraryBrief = z.infer<typeof itineraryBriefSchema>;
type PublishedPlan = { id: string; version: number; route_id: string; is_default: boolean;
  payload: { name: string; days: Array<{ kind: string }> } };
type Route = { id: string; name: string };
export type ItineraryCard = NonNullable<AgentMessageUi['itineraryCard']>;

export async function extractItineraryBrief(runtime: ReturnType<typeof createAgentRuntime>, input: {
  message: string; temporalContext: string;
}): Promise<ItineraryBrief> {
  const agent = runtime.stageAgent({ name: 'Kaipa Itinerary Brief',
    instructions: '从本轮用户消息抽取线路名、徒步首日和明确的徒步天数偏好。只抽取用户说过的线路，不能猜测。徒步首日仅在用户指定可唯一确定的具体日期时填写 YYYY-MM-DD；“10 月底”“国庆”等宽泛时段必须为 null。相对日期依据提供的用户本地日期和时区换算。不要把出行总天数当徒步天数。未知字段返回 null。',
    tools: [], outputType: itineraryBriefSchema, model: runtime.flashModel, stage: 'itinerary_brief', temperature: 0 });
  const result = await runtime.runner.run(agent, JSON.stringify(input), { maxTurns: 1, signal: AbortSignal.timeout(30000) });
  return itineraryBriefSchema.parse(result.finalOutput);
}

const normalize = (name: string) => name.normalize('NFKC').replace(/[\p{White_Space}\p{P}\p{S}]/gu, '').replace(/线$/u, '').toLocaleLowerCase();

export function matchingRoute(name: string | null, routes: Route[]): Route | null {
  if (!name) return null;
  const needle = normalize(name);
  if (needle.length < 2) return null;
  const hits = routes.filter(route => {
    const candidate = normalize(route.name);
    return Math.min(needle.length, candidate.length) >= 2
      && (needle.includes(candidate) || candidate.includes(needle));
  });
  return hits.length === 1 ? hits[0] : null;
}

export function choosePlan(plans: PublishedPlan[], hikeDays: number | null): PublishedPlan | null {
  const days = (plan: PublishedPlan) => plan.payload.days.filter(day => day.kind === 'hike').length;
  return [...plans].sort((a, b) =>
    (hikeDays === null ? 0 : Math.abs(days(a) - hikeDays) - Math.abs(days(b) - hikeDays))
    || Number(b.is_default) - Number(a.is_default)
    || days(a) - days(b)
    || a.id.localeCompare(b.id)
  )[0] || null;
}

function validDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

export async function buildItineraryCard(input: {
  message: string; temporalContext: string; currentJourneyId?: string | null;
}, io: {
  extract: (input: { message: string; temporalContext: string }) => Promise<ItineraryBrief>;
  loadPlans: () => Promise<PublishedPlan[]>;
  loadRoutes: (ids: string[]) => Promise<Route[]>;
  log?: (error: unknown) => void;
}): Promise<ItineraryCard | null> {
  if (input.currentJourneyId) return null;
  try {
    const brief = itineraryBriefSchema.parse(await io.extract({ message: input.message, temporalContext: input.temporalContext }));
    if (!brief.routeName) return null;
    const plans = await io.loadPlans();
    const routes = await io.loadRoutes([...new Set(plans.map(plan => plan.route_id))]);
    const route = matchingRoute(brief.routeName, routes);
    if (!route) return null;
    const plan = choosePlan(plans.filter(plan => plan.route_id === route.id), brief.hikeDays);
    if (!plan) return null;
    return { routeId: route.id, routeName: route.name, planId: plan.id, planVersion: plan.version,
      planName: plan.payload.name, hikeDays: plan.payload.days.filter(day => day.kind === 'hike').length,
      trekStartDate: validDate(brief.trekStartDate), preferredHikeDays: brief.hikeDays };
  } catch (error) {
    (io.log || ((failure: unknown) => console.warn('[AppAgent] itinerary card miss', failure)))(error);
    return null;
  }
}
