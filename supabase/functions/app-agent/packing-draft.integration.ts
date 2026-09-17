import { createClient } from 'npm:@supabase/supabase-js@2';
import { bindRunClient, releaseRunClient, getJourneyDetails, listGear, preparePackingDraft, readPackingDraftTool, repairPackingDraft, commitPackingDraft } from './tools.ts';
import { bindPackingDraftStore, releasePackingDraftStore } from './packing-draft-store.ts';
import type { AgentContext } from './types.ts';

const url = `http://127.0.0.1:${Deno.env.get('KONG_HTTP_PORT') || '8010'}`;
const admin = createClient(url, Deno.env.get('SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const client = createClient(url, Deno.env.get('ANON_KEY')!, { auth: { persistSession: false } });
async function checked(query: any) { const result = await query; if (result.error) throw result.error; return result.data; }
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function invoke(tool: any, context: AgentContext, args: unknown) {
  const result = await tool.invoke({ context }, JSON.stringify(args));
  return typeof result === 'string' ? JSON.parse(result) : result;
}
let userId: string | undefined;
const journeyId = `draft-test-${crypto.randomUUID()}`, threadId = crypto.randomUUID(), runId = crypto.randomUUID();
try {
  const email = `draft-test-${crypto.randomUUID()}@example.test`, password = crypto.randomUUID();
  userId = (await checked(admin.auth.admin.createUser({ email, password, email_confirm: true }))).user.id;
  const signed = await checked(client.auth.signInWithPassword({ email, password }));
  const scoped = createClient(url, Deno.env.get('ANON_KEY')!, { global: { headers: { Authorization: `Bearer ${signed.session.access_token}`, 'x-kaipa-agent-run-id': runId } }, auth: { persistSession: false } });
  await checked(client.from('journeys').insert({ id: journeyId, user_id: userId, name: '草稿恢复测试', region: '杭州', lng: 120.1, lat: 30.2, tone: 'forest', total_days: 1 }));
  await checked(client.from('companions').insert({ journey_id: journeyId, user_id: userId, name: '测试', ini: '测', color: '#448866', is_host: true, is_self: true }));
  await checked(client.from('agent_threads').insert({ id: threadId, user_id: userId, current_journey_id: journeyId }));
  await checked(client.from('agent_runs').insert({ id: runId, thread_id: threadId, user_id: userId, status: 'running', agent_version: 'draft-test' }));
  const makeContext = (): AgentContext => ({ userId: userId!, threadId, runId, currentJourneyId: journeyId, originalUserMessage: '完整清单', task: { runId, journeyId, outcome: null, decision: {
    objective: 'Packing', mode: 'execute', operations: ['add_packing_items'], requiredOperations: ['add_packing_items'], packingMode: 'full', authorizationQuote: '完整清单',
    continuation: false, destination: '杭州', plannedDate: null, dateUndecided: true, days: 1, trackAttachmentName: null, constraints: [],
  } } });
  let context = makeContext();
  bindRunClient(runId, scoped); bindPackingDraftStore(runId, admin);
  const names = ['徒步背包', '徒步鞋', '速干上衣', '瓶装矿泉水', '能量棒', '离线地图手机', '移动电源', '头灯', '防晒霜', '碘伏棉签', '无菌纱布片', '弹性绷带', '水泡贴', '救生哨'];
  const items = names.map(name => ({ name, quantity: name === '能量棒' ? 5 : 1, weightKg: 0.1, weightEstimated: true, carryStatus: 'packed',
    ...(name === '能量棒' ? { attributes: [{ name: '单份净重', value: '50g' }], estimatedEnergyKcalPerUnit: 210 } : {}),
    ...(name === '移动电源' ? { attributes: [{ name: '容量', value: '10000mAh' }] } : {}),
  }));
  await invoke(getJourneyDetails, context, { journeyId, sections: ['journey', 'track', 'itinerary', 'packing'] });
  await invoke(listGear, context, {});
  const first = await invoke(preparePackingDraft, context, { journeyId, planProfile: { accommodation: 'day_trip', waterRefill: 'none', mealPreparation: 'no_cook' }, items });
  assert(first.status === 'needs_repair', 'Invalid draft unexpectedly ready');
  assert((await checked(client.from('journey_packing_lists').select('id').eq('journey_id', journeyId))).length === 0, 'Draft wrote a checklist');
  const invalidCommit = await invoke(commitPackingDraft, context, { revision: 1 });
  assert(invalidCommit.status === 'needs_repair', 'Invalid draft was committed');
  releaseRunClient(runId); releasePackingDraftStore(runId);
  context = makeContext(); bindRunClient(runId, scoped); bindPackingDraftStore(runId, admin);
  const restored = await invoke(readPackingDraftTool, context, {});
  assert(restored.revision === first.revision && restored.itemCount === first.itemCount, 'Draft did not survive runtime recreation');
  const patch = { revision: 1, changes: [{ id: 'item-4', patch: { attributes: [{ name: '容量', value: '1.5L' }], weightKg: 1.5 } }],
    additions: [{ name: '防水外套', quantity: 1, weightKg: 0.2, weightEstimated: true, carryStatus: 'packed' }], removals: [] };
  const repaired = await invoke(repairPackingDraft, context, patch);
  assert(repaired.status === 'ready', JSON.stringify(repaired));
  const replayPatch = await invoke(repairPackingDraft, context, patch);
  assert(replayPatch.revision === repaired.revision && replayPatch.itemCount === repaired.itemCount, 'Retried patch duplicated additions');
  await invoke(getJourneyDetails, context, { journeyId, sections: ['journey', 'track', 'itinerary', 'packing'] });
  await invoke(listGear, context, {});
  await checked(client.from('journeys').update({ name: '手动修改后的旅程' }).eq('id', journeyId));
  const staleCommit = await commitPackingDraft.invoke({ context } as never, JSON.stringify({ revision: repaired.revision }));
  assert(String(staleCommit).includes('已被修改'), 'Stale draft commit was not rejected');
  assert((await checked(client.from('journey_packing_lists').select('id').eq('journey_id', journeyId))).length === 0, 'Conflict partially saved the draft');
  await invoke(getJourneyDetails, context, { journeyId, sections: ['journey', 'track', 'itinerary', 'packing'] });
  await invoke(listGear, context, {});
  const committed = await invoke(commitPackingDraft, context, { revision: repaired.revision });
  assert(committed.added === items.length + 1, JSON.stringify(committed));
  const repeated = await invoke(commitPackingDraft, context, { revision: repaired.revision });
  assert(repeated.added === committed.added, 'Commit receipt was not replayed');
  const receipts = await checked(client.from('agent_tool_calls').select('id').eq('run_id', runId).eq('tool_name', 'add_packing_items').eq('status', 'completed'));
  assert(receipts.length === 1, 'Duplicate canonical write receipt');
  const lists = await checked(client.from('journey_packing_lists').select('id').eq('journey_id', journeyId));
  const rows = await checked(client.from('journey_packing_items').select('id').in('list_id', lists.map((list: any) => list.id)));
  assert(rows.length === items.length + 1, 'Duplicate or partial business write');
  console.log('Persisted invalid draft, runtime recovery, field-only repair, patch replay and atomic commit replay passed.');
} finally {
  releaseRunClient(runId); releasePackingDraftStore(runId);
  if (userId) {
    await checked(admin.from('journeys').delete().eq('id', journeyId));
    await checked(admin.auth.admin.deleteUser(userId));
    console.log('Disposable draft account and journey removed.');
  }
}
