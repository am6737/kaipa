import { canonicalJourneyDay, journeyDayOrdinal, resolveJourneyDay } from './journey-days.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('journey day parser accepts app and AI day formats', () => {
  assert(journeyDayOrdinal('Day 1') === 1, 'expected canonical day');
  assert(journeyDayOrdinal('第1天') === 1, 'expected numeric Chinese day');
  assert(journeyDayOrdinal('第一天') === 1, 'expected textual Chinese day');
  assert(journeyDayOrdinal('第二十天') === 20, 'expected compound Chinese day');
});

Deno.test('journey day normalization preserves custom groups', () => {
  assert(canonicalJourneyDay('第 2 天') === 'Day 2', 'expected canonical storage key');
  assert(canonicalJourneyDay('返程') === '返程', 'expected custom group to remain unchanged');
});

Deno.test('journey day resolution reuses an existing equivalent group', () => {
  assert(resolveJourneyDay('第1天', ['第一天', 'Day 2']) === '第一天', 'expected existing first day group');
  assert(resolveJourneyDay('第三天', ['第一天', 'Day 2']) === 'Day 3', 'expected new canonical group');
});
