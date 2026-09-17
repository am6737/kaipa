import { loadSavedPlanPreview, previewJourneyId } from './plan-preview.ts';

Deno.test('journey card survives creation-only, partial and failed planning', () => {
  const created = { tool_name: 'create_journey', status: 'completed', output: { id: 'new' } };
  if (previewJourneyId([created]) !== 'new') throw new Error('creation card missing');
  const failed = { tool_name: 'add_itinerary_items', status: 'failed', arguments: { journeyId: 'wrong' } };
  if (previewJourneyId([failed], 'bound') !== 'bound') throw new Error('partial card missing');
  if (previewJourneyId([], 'bound') !== 'bound') throw new Error('existing journey missing');
  if (previewJourneyId([{ ...created, undone_at: 'now' }]) !== undefined) throw new Error('undone creation shown');
  if (previewJourneyId([failed]) !== undefined) throw new Error('failed write invented card');
});

Deno.test('empty journeys have a card; deleted, missing or RLS-hidden journeys do not', async () => {
  for (const visible of [true, false]) {
    const filters: unknown[][] = [];
    const chain = {
      select: () => chain, eq: () => chain, order: () => chain,
      is: (...args: unknown[]) => { filters.push(args); return chain; },
      maybeSingle: () => ({ data: visible ? { id: 'bound', name: '哈天线' } : null, error: null }),
      range: () => ({ data: [], error: null }),
    };
    const result = await loadSavedPlanPreview({ from: () => chain }, 'bound');
    if (visible ? result?.journeyId !== 'bound' || result.days.length !== 0 : result !== undefined) throw new Error('wrong card visibility');
    if (!filters.some(args => args[0] === 'deleted_at' && args[1] === null)) throw new Error('missing deletion filter');
  }
});

Deno.test('saved preview reads all pages and orders days and times, not the last tool batch', async () => {
  let pages = 0;
  const rows = Array.from({ length: 501 }, (_, index) => ({ id: String(index), day: index === 500 ? 'Day 1' : 'Day 2', title: `Item ${index}`, time_mins: index === 500 ? 540 : 600, time_end_mins: null }));
  const client = { from(table: string) {
    const chain = {
      select: () => chain, eq: () => chain, is: () => chain, order: () => chain,
      maybeSingle: () => ({ data: { id: 'journey', name: 'Full plan', planned_date: '2026-09-09' }, error: null }),
      range: (from: number, to: number) => { pages++; return { data: table === 'timeline_rows' ? rows.slice(from, to + 1) : [], error: null }; },
    };
    return chain;
  } };
  const result = await loadSavedPlanPreview(client, 'journey');
  if (pages !== 2 || result?.days[0].label !== 'Day 1' || result.days[1].items.length !== 500) throw new Error('Incomplete or misordered preview');
});
