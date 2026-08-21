import { kaipaAllTools, kaipaGlobalTools, kaipaJourneyTools } from './tools.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function toolNames(tools: typeof kaipaGlobalTools | typeof kaipaJourneyTools) {
  return tools.map((item) => item.name);
}

Deno.test('agent modes expose every registered tool without duplicates', () => {
  const expected = [...toolNames(kaipaAllTools)].sort();
  for (const [mode, tools] of [['global', kaipaGlobalTools], ['journey', kaipaJourneyTools]] as const) {
    const names = toolNames(tools);
    assert(new Set(names).size === names.length, `${mode} tools contain duplicates`);
    assert(JSON.stringify([...names].sort()) === JSON.stringify(expected), `${mode} mode hides registered tools`);
  }
});

Deno.test('journey tool set exposes both destructive operations', () => {
  const names = toolNames(kaipaJourneyTools);
  assert(names.includes('delete_itinerary_items'), 'journey tools must include itinerary deletion');
  assert(names.includes('delete_packing_items'), 'journey tools must include packing deletion');
});

Deno.test('global tool set preserves journey creation and follow-up writes', () => {
  const names = toolNames(kaipaGlobalTools);
  assert(names.includes('create_journey'), 'global tools must include journey creation');
  assert(names.includes('add_itinerary_items'), 'global tools must include itinerary writes');
  assert(names.includes('set_itinerary_group_endpoints'), 'global tools must include itinerary endpoint writes');
  assert(names.includes('add_packing_items'), 'global tools must include packing writes');
});
