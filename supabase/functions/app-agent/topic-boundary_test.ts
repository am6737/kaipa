import { checkTopic, TOPIC_POLICY_VERSION } from './topic-boundary.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
const input = { latestMessage: '生成一个骑车鹅的 SVG', recentMessages: [], pendingQuestion: null };

Deno.test('NeMo verdicts remain explicit and classifier calls use service budgets and metrics', async () => {
  for (const allowed of [true, false]) {
    let reserved = 0;
    let metric: any;
    const verdict = await checkTopic(input, { url: 'http://internal/', token: 'test-only',
      budget: { reserve: async units => { reserved = units; return 'ticket'; }, settle: async () => {} },
      recordMetric: async value => { metric = value; },
      fetcher: async (url, options) => {
        assert(url === 'http://internal/check');
        assert(new Headers(options?.headers).get('Authorization') === 'Bearer test-only');
        assert(JSON.parse(options!.body as string).latestMessage === input.latestMessage);
        return Response.json({ allowed, policyVersion: TOPIC_POLICY_VERSION, model: 'test-model' });
      },
    });
    assert(verdict.allowed === allowed && verdict.policyVersion === TOPIC_POLICY_VERSION);
    assert(reserved > 8192 && metric.stage === 'topic_check' && metric.success);
  }
});

Deno.test('missing configuration, errors and malformed NeMo replies never pass', async () => {
  const responses = [new Response('', { status: 503 }), Response.json({ allowed: 'true' }),
    Response.json({ allowed: true, policyVersion: 'unknown', model: 'test-model' }),
    Response.json({ allowed: true, policyVersion: TOPIC_POLICY_VERSION })];
  for (const response of responses) {
    let failed = false;
    try { await checkTopic(input, { url: 'http://internal', token: 'test', fetcher: async () => response }); }
    catch { failed = true; }
    assert(failed);
  }
  let called = false;
  try { await checkTopic(input, { url: '', token: '', fetcher: async () => { called = true; throw new Error(); } }); }
  catch { assert(!called); return; }
  throw new Error('Missing configuration was accepted');
});
