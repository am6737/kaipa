import { buildItineraryCard, choosePlan, matchingRoute, type ItineraryBrief } from './itinerary-card.ts';

function assert(value: unknown, message: string) { if (!value) throw new Error(message); }
const routes = [{ id: 'genie', name: '格聂牧场线' }, { id: 'yading', name: '亚丁大转山' }];
const plan = (id: string, route_id: string, count: number, is_default = false) => ({
  id, route_id, version: 1, is_default, payload: { name: id, days: Array.from({ length: count }, () => ({ kind: 'hike' })) },
});
const plans = [plan('short', 'genie', 3, true), plan('long', 'genie', 5), plan('yading', 'yading', 4, true)];
const input = { message: '10 月底想走格聂', temporalContext: '用户本地日期：2026-10-16\n用户时区：Asia/Shanghai' };

Deno.test('route matching normalizes names and rejects ambiguity', () => {
  assert(matchingRoute('格聂', routes)?.id === 'genie', 'short name matches full route');
  assert(matchingRoute('亚丁转山', routes) === null, 'missing internal character is not substring');
  assert(matchingRoute('亚丁大转山', routes)?.id === 'yading', 'full name matches');
  assert(matchingRoute('格', routes) === null, 'single character rejected');
  assert(matchingRoute('格聂', [...routes, { id: 'other', name: '格聂南线' }]) === null, 'two routes ambiguous');
});

Deno.test('plan choice uses hiking days, then default, then shortest', () => {
  assert(choosePlan(plans.slice(0, 2), 5)?.id === 'long', 'closest');
  assert(choosePlan(plans.slice(0, 2), 4)?.id === 'short', 'tie uses default');
  assert(choosePlan(plans.slice(0, 2), null)?.id === 'short', 'unspecified uses default');
  assert(choosePlan([plan('a', 'genie', 3), plan('b', 'genie', 5)], 4)?.id === 'a', 'tie uses shortest');
});

Deno.test('journey-bound turn skips all I/O', async () => {
  let calls = 0;
  const card = await buildItineraryCard({ ...input, currentJourneyId: 'journey' }, {
    extract: async () => { calls++; throw Error('called'); },
    loadPlans: async () => { calls++; return plans; }, loadRoutes: async () => { calls++; return routes; },
  });
  assert(card === null && calls === 0, 'no model or database call');
});

Deno.test('vague date stays null and a hit exits before reservation', async () => {
  let reservations = 0;
  const brief: ItineraryBrief = { routeName: '格聂', trekStartDate: null, hikeDays: 5 };
  const card = await buildItineraryCard(input, { extract: async () => brief,
    loadPlans: async () => plans, loadRoutes: async () => routes });
  if (!card) reservations++;
  assert(card?.trekStartDate === null && card.planId === 'long' && card.preferredHikeDays === 5, 'vague date and preference');
  assert(reservations === 0, 'hit never enters reservation branch');
});

Deno.test('model failure is a miss', async () => {
  let logged = false;
  const card = await buildItineraryCard(input, { extract: async () => { throw Error('timeout'); },
    loadPlans: async () => plans, loadRoutes: async () => routes, log: () => { logged = true; } });
  assert(card === null && logged, 'failure logged and missed');
});
