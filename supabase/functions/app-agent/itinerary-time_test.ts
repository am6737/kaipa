import { itineraryMinutes } from './itinerary-time.ts';

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
}

Deno.test('converts HH:mm itinerary times to minutes from midnight', () => {
  assertEquals(itineraryMinutes('04:00'), 240);
  assertEquals(itineraryMinutes('05:30'), 330);
  assertEquals(itineraryMinutes('21:00'), 1260);
});

Deno.test('preserves valid legacy minute values', () => {
  assertEquals(itineraryMinutes(240), 240);
  assertEquals(itineraryMinutes(1439), 1439);
});

Deno.test('rejects malformed or out-of-range itinerary times', () => {
  assertEquals(itineraryMinutes('4:00'), undefined);
  assertEquals(itineraryMinutes('24:00'), undefined);
  assertEquals(itineraryMinutes('04:60'), undefined);
  assertEquals(itineraryMinutes(1440), undefined);
});
