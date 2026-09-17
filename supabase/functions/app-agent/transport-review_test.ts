import { reviewTransportPlan, type TransportLeg, type TransportPlan } from './transport-review.ts';
import { latestTravelContext, travelContextSchema } from './travel-context-schema.ts';
import { reviewTransport } from './transport-tool.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
const leg = (from: string, to: string, departure: number, arrival: number, overrides: Partial<TransportLeg> = {}): TransportLeg => ({
  from, to, departure, arrival, bufferBefore: 15, mode: 'taxi', verified: false, sourceUrl: null, fallback: null, ...overrides,
});
function plan(overrides: Partial<TransportPlan> = {}): TransportPlan {
  return { direction: 'round_trip', origin: 'Home', returnDestination: 'Home', trailStart: 'Trail A', trailFinish: 'Trail B',
    hikeStart: 450, hikeEnd: 970, arrivalBuffer: 20, departureBuffer: 40,
    outbound: [leg('Home', 'Station', 300, 330), leg('Station', 'Trail A', 350, 425)],
    inbound: [leg('Trail B', 'Other station', 1020, 1100), leg('Other station', 'Home', 1130, 1200)], vehicleRetrieval: null, ...overrides };
}

Deno.test('complete chains can use different hubs and preserve unverified facts', () => {
  const input = plan();
  const before = JSON.stringify(input);
  const result = reviewTransportPlan(input);
  assert(result.consistent && result.unverified.length === 4);
  assert(!result.requiresExtraTravelDay);
  assert(JSON.stringify(input) === before, 'Review must not mutate saved/proposed data');
});

Deno.test('detects missing final mile, mismatched hubs and short connections', () => {
  for (const outbound of [[], [leg('Home', 'Station', 300, 330)],
    [leg('Home', 'Station', 300, 330), leg('Airport', 'Trail A', 350, 425)],
    [leg('Home', 'Station', 300, 345), leg('Station', 'Trail A', 350, 425)]]) {
    assert(!reviewTransportPlan(plan({ outbound })).consistent);
  }
});

Deno.test('rejects late outbound and early return without moving hiking times', () => {
  assert(!reviewTransportPlan(plan({ outbound: [leg('Home', 'Trail A', 300, 440)] })).consistent);
  assert(!reviewTransportPlan(plan({ inbound: [leg('Trail B', 'Home', 990, 1200)] })).consistent);
  assert(!reviewTransportPlan(plan({ inbound: [leg('Trail B', 'Home', 1010, 1200, { bufferBefore: 60 })] })).consistent);
});

Deno.test('one-way and different return destinations do not imply a round trip', () => {
  assert(reviewTransportPlan(plan({ direction: 'outbound', inbound: [], returnDestination: null })).consistent);
  assert(reviewTransportPlan(plan({ direction: 'return', outbound: [], origin: null })).consistent);
  assert(!reviewTransportPlan(plan({ direction: 'outbound' })).consistent);
  assert(reviewTransportPlan(plan({ returnDestination: 'Hotel', inbound: [leg('Trail B', 'Hotel', 1020, 1100)] })).consistent);
});

Deno.test('previous-evening and next-day travel are flagged, not authorized', () => {
  const previous = reviewTransportPlan(plan({ outbound: [leg('Home', 'Trail A', -300, -100)] }));
  assert(previous.consistent && previous.requiresExtraTravelDay);
  const next = reviewTransportPlan(plan({ inbound: [leg('Trail B', 'Home', 1020, 1500)] }));
  assert(next.consistent && next.requiresExtraTravelDay);
});

Deno.test('carpool fallback and point-to-point car retrieval are required', () => {
  assert(!reviewTransportPlan(plan({ outbound: [leg('Home', 'Trail A', 300, 425, { mode: 'carpool' })] })).consistent);
  assert(reviewTransportPlan(plan({ outbound: [leg('Home', 'Trail A', 300, 425, { mode: 'carpool', fallback: 'Reserved taxi' })] })).consistent);
  const driving = plan({ outbound: [leg('Home', 'Trail A', 300, 425, { mode: 'self_drive' })] });
  assert(!reviewTransportPlan(driving).consistent);
  assert(reviewTransportPlan({ ...driving, vehicleRetrieval: 'Booked driver returns car to Trail B' }).consistent);
});

Deno.test('claims without sources remain unverified', () => {
  const result = reviewTransportPlan(plan({ outbound: [leg('Home', 'Trail A', 300, 425, { verified: true, sourceUrl: 'invented' })] }));
  assert(result.unverified.length === 3);
});

Deno.test('travel state restores confirmations, corrections, refusal and journey boundaries', () => {
  const state = travelContextSchema.parse({ journeyId: 'j', origin: 'Hangzhou', returnDestination: 'Shanghai', direction: 'round_trip',
    preferences: ['rail'], bookings: ['User supplied ticket'], locationDeclined: true, latitude: 30 });
  assert(!('latitude' in state), 'Do not persist GPS as confirmed travel context');
  assert(latestTravelContext([{ ui: {} }, { ui: { travelContext: state } }], 'j')?.origin === 'Hangzhou');
  assert(latestTravelContext([{ ui: { travelContext: state } }], 'other') === null);
  assert(latestTravelContext([{ ui: { travelContext: null } }, { ui: { travelContext: state } }], 'j') === null);
  const corrected = { ...state, origin: 'Nanjing' };
  assert(latestTravelContext([{ ui: { travelContext: corrected } }, { ui: { travelContext: state } }], 'j')?.origin === 'Nanjing');
  assert(latestTravelContext([{ ui: { travelContext: { origin: 'invalid' } } }], 'j') === null);
});

Deno.test('review tool exposes the consistency result without database writes', async () => {
  const result = await reviewTransport.invoke({} as never, JSON.stringify(plan()));
  assert(JSON.stringify(result).includes('consistent'));
});
