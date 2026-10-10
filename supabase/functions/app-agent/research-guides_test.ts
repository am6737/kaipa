import { collectRouteEvidence, runResearch, runRespond, type CatalogRoute, type PipelineDeps } from './pipeline.ts';
import { researchBriefSchema, planDocumentSchema } from './plan-document.ts';
import { guideEvidence, guidesFingerprint, recordGuideGaps } from './trusted-guides.ts';
import { fixtureGuide, gapAdmin } from './guide-fixtures.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
const signal = new AbortController().signal;
function researchHarness(covered = true, gapFailure: 'error' | 'throw' | 'hang' | null = null) {
  const catalog = [{ id: 'fixture-route', name: '测试路线', dist: '42 km', track_duration_ms: 2 * 86400000,
    track_coords: [[101, 30], [102, 31]], track_waypoints: covered ? [{ name: '营地', km: 12 }] : [] }];
  let guide = fixtureGuide();
  let previous: unknown[] = [];
  const telemetry = gapAdmin(gapFailure);
  const modelInputs: string[] = [];
  const factCalls: string[] = [];
  const stages: unknown[] = [];
  const pipeline = {
    runId: crypto.randomUUID(), userId: 'user', attempt: 1, signal,
    context: { userId: 'user', threadId: 'thread', runId: 'unused' },
    task: { decision: { destination: '测试路线', requiredOperations: [] } },
    userInput: '请规划测试路线', agentInput: '请规划测试路线',
    guideLookup: () => guide,
    stageAgent: (options: unknown) => options,
    invoke: async (_agent: unknown, input: unknown) => {
      modelInputs.push(String(input));
      return researchBriefSchema.parse({ destination: '测试路线', routes: [{ name: '测试路线', summary: '基于可信指南的结论' }],
        factSuggestions: [{ routeId: 'fixture-route', category: 'lodging', title: '模型建议，应清空' }] });
    },
    client: { from(table: string) {
      assert(table === 'routes');
      let exactNames: string[] | null = null;
      const chain = { select: () => chain, limit: () => chain,
        in: (_key: string, names: string[]) => { exactNames = names; return chain; },
        ilike: () => chain,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: exactNames ? catalog.filter(row => exactNames!.includes(row.name)) : catalog, error: null }).then(resolve),
      };
      return chain;
    } },
    admin: {
      rpc(name: string, args: unknown) {
        if (name === 'get_route_facts') { factCalls.push(name); return Promise.resolve({ data: [], error: null }); }
        assert(name === 'record_route_guide_gaps', 'unexpected trusted store write');
        return telemetry.rpc(name, args);
      },
      from(table: string) {
        if (table === 'agent_tool_calls') return telemetry.from(table);
        assert(table === 'agent_stages');
        let update: unknown;
        const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: () => chain,
          update: (value: unknown) => { update = value; stages.push(value); return chain; },
          then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: update ? [] : previous, error: null }).then(resolve),
        };
        return chain;
      },
    },
  } as unknown as PipelineDeps;
  return { pipeline, telemetry, modelInputs, stages, factCalls,
    setGuide(value: typeof guide | null) { guide = value as typeof guide; },
    setPrevious(artifact: unknown) { previous = [{ artifact, route_facts: [], updated_at: new Date().toISOString() }]; },
  };
}

Deno.test('research reads trusted guides into the model-free brief while preserving GPX geometry', async () => {
  const h = researchHarness();
  const brief = await runResearch(h.pipeline, signal, false);
  assert(h.modelInputs.length === 0, 'GPX coverage still skips synthesis');
  assert(brief.guideEvidence[0].markdown.includes(fixtureGuide().markdown));
  assert(brief.guideEvidence[0].markdown.includes('章节引用') && brief.guideEvidence[0].markdown.includes('observedOn'));
  assert(brief.routes[0].hikingDays === 2 && brief.routes[0].distanceKm === 42 && brief.routes[0].waypoints.length === 1);
  assert(brief.routes[0].guideComplete && brief.routes[0].unresolved.length === 0);
  assert(brief.guideFingerprint?.length === 64 && brief.factSuggestions.length === 0);
  assert(h.telemetry.calls.length === 0 && h.factCalls.length === 1);
});

Deno.test('synthesis receives markdown, asOf and section citations and cannot write fact suggestions', async () => {
  const h = researchHarness(false);
  const brief = await runResearch(h.pipeline, signal, false);
  assert(h.modelInputs.length === 1);
  const input = h.modelInputs[0];
  assert(input.includes(fixtureGuide().markdown) && input.includes('2026-09-04') && input.includes('章节引用'));
  assert(input.includes('factSuggestions') && input.includes('必须输出空数组'));
  assert(brief.factSuggestions.length === 0 && brief.guideEvidence.length === 1);
  assert(h.telemetry.calls.length === 0, 'no suggestion write RPC is allowed');
});

Deno.test('missing research guide discloses and records the correct service-role RPC only once per route/run', async () => {
  const h = researchHarness();
  h.setGuide(null);
  const brief = await runResearch(h.pipeline, signal, false);
  await runResearch(h.pipeline, signal, false);
  assert(brief.routes[0].summary === '' && brief.routes[0].unresolved[0].includes('路线指南尚未覆盖'));
  assert(brief.unresolved[0].includes('不能据此估算或编造'));
  assert(h.telemetry.calls.length === 1);
  assert(JSON.stringify(h.telemetry.calls[0]) === JSON.stringify({ name: 'record_route_guide_gaps',
    args: { p_route_id: 'fixture-route', p_sections: ['*'], p_run_id: h.pipeline.runId } }));
});

Deno.test('partial guides disclose named required sections and remain unresolved after synthesis', async () => {
  const h = researchHarness(false);
  h.setGuide({ ...fixtureGuide(), sections: fixtureGuide().sections.filter(section => section.key !== 'access' && section.key !== 'overnight') });
  const brief = await runResearch(h.pipeline, signal, false);
  assert(brief.routes[0].unresolved[0].includes('交通、住宿与营地'));
  assert(!brief.routes[0].guideComplete && brief.unresolved[0].includes('尚未覆盖'));
  assert(h.telemetry.calls[0].args.p_sections.join() === 'access,overnight');
});

Deno.test('guide gap RPC errors, thrown failures and stalled telemetry never fail research', async () => {
  for (const failure of ['error', 'throw', 'hang'] as const) {
    const h = researchHarness(true, failure);
    h.setGuide(null);
    const started = Date.now();
    const brief = await runResearch(h.pipeline, signal, false);
    assert(brief.routes[0].unresolved[0].includes('尚未覆盖'));
    assert(Date.now() - started < 1500, 'gap telemetry materially delayed research');
  }
});

Deno.test('uncatalogued route discloses guide gap without recording an invalid route id', async () => {
  const h = researchHarness();
  const evidence = await collectRouteEvidence(h.pipeline, signal, ['无目录路线'], [], null, []);
  assert(evidence[0].guide.routeId === null && evidence[0].guide.missingSections[0] === '*');
  assert(h.telemetry.calls.length === 0);
});

Deno.test('brief reuse is invalidated by changed guide markdown, dates, citations and coverage', async () => {
  for (const variant of ['markdown', 'asOf', 'source', 'missing'] as const) {
    const h = researchHarness(false);
    const first = await runResearch(h.pipeline, signal, false);
    h.setPrevious(first);
    const reused = await runResearch(h.pipeline, signal, false);
    assert(h.modelInputs.length === 1, 'unchanged complete guide should reuse the brief');
    assert(reused.guideFingerprint === first.guideFingerprint);
    const guide = fixtureGuide();
    h.setGuide(variant === 'markdown' ? { ...guide, markdown: `${guide.markdown}\n更新内容` }
      : variant === 'asOf' ? { ...guide, asOf: '2026-10-01' }
      : variant === 'source' ? { ...guide, sources: guide.sources.map(source => ({ ...source, observedOn: '2026-10-01' })) }
      : null);
    const updated = await runResearch(h.pipeline, signal, false);
    assert(Number(h.modelInputs.length) === 2, `${variant} did not invalidate reuse`);
    assert(updated.guideFingerprint !== first.guideFingerprint);
    assert(updated.factSuggestions.length === 0);
  }
});

Deno.test('durable gap receipt prevents a duplicate RPC even without the in-memory run guard', async () => {
  const admin = gapAdmin();
  const runId = crypto.randomUUID();
  const evidence = guideEvidence('测试路线', 'fixture-route', () => null);
  const hash = await guidesFingerprint([{ ...evidence, routeName: '', markdown: '', asOf: null, sources: [], missingSections: [] }]);
  admin.receipts.add(`${runId}:${hash}`);
  await recordGuideGaps(admin, runId, 'user', 'thread', evidence);
  assert(admin.calls.length === 0);
});

Deno.test('response explicitly includes every research guide gap even if the plan omitted it', async () => {
  const h = researchHarness();
  const research = researchBriefSchema.parse({ guideEvidence: Array.from({ length: 7 }, (_, index) => guideEvidence(`路线${index}`, null)) });
  const output: any = await runRespond(h.pipeline, signal, { research, plan: planDocumentSchema.parse({}), save: null, packing: null });
  for (let index = 0; index < 7; index++) assert(output.text.includes(`路线${index}的路线指南尚未覆盖`));
});

Deno.test('response states the guide asOf date separately from source observation dates', async () => {
  const h = researchHarness();
  const research = await runResearch(h.pipeline, signal, false);
  const output: any = await runRespond(h.pipeline, signal, { research, plan: planDocumentSchema.parse({}), save: null, packing: null });
  assert(output.text.includes('指南资料截至：测试路线（2026-09-04）'));
});

Deno.test('gap receipt failure is also best effort and cannot fail research', async () => {
  const h = researchHarness();
  h.setGuide(null);
  const from = h.pipeline.admin.from;
  h.pipeline.admin.from = (table: string) => {
    if (table === 'agent_tool_calls') throw new Error('receipt unavailable');
    return from(table);
  };
  const brief = await runResearch(h.pipeline, signal, false);
  assert(brief.unresolved[0].includes('尚未覆盖') && h.telemetry.calls.length === 0);
});
