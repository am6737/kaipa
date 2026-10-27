import { constrainTaskDecision, taskClarification, taskDecisionSchema, type TaskDecision, type TaskState } from './task.ts';
import { parseGearAdd } from './gear-fast-path.ts';
import { smartPlanDecision, type SmartPlanJourney } from './smart-plan.ts';
import { resolveTask, type RouterInput, type RouterMode, type RouterOutput } from './intent-router.ts';
import { TOPIC_POLICY_VERSION, type TopicCheck, type TopicInput } from './topic-boundary.ts';

type Client = any;

export async function prepareTask(
  client: Client,
  admin: Client,
  args: { runId: string; threadId: string; userId: string; journeyId: string | null; message: string; intent?: string; temporalContext: string; attachments: Array<{ name: string; kind: string }>; routerMode?: RouterMode; resumeWaitingPlan?: boolean; gearFastPath?: boolean; turnHasAttachments?: boolean; smartPlan?: SmartPlanJourney | null },
  interpret: (input: unknown) => Promise<TaskDecision>,
  checkTopic: (input: TopicInput) => Promise<TopicCheck>,
  route?: (input: RouterInput) => Promise<RouterOutput>,
): Promise<TaskState> {
  const saved = await client.from('agent_task_states').select('state').eq('run_id', args.runId).maybeSingle();
  if (saved.error) throw saved.error;
  if (saved.data?.state.topicCheck?.policyVersion === TOPIC_POLICY_VERSION) {
    taskDecisionSchema.parse(saved.data.state.decision);
    return { ...saved.data.state, journeyId: args.journeyId };
  }
  const [prior, history] = await Promise.all([
    client.from('agent_task_states').select('state').eq('thread_id', args.threadId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    client.from('agent_messages').select('role,content').eq('thread_id', args.threadId)
      .order('created_at', { ascending: false }).limit(8),
  ]);
  if (prior.error) throw prior.error;
  if (history.error) throw history.error;
  const previous = (prior.data?.state || null) as TaskState | null;
  // A departure picked in the app answers the plan that stopped to ask for
  // it. Continue that task as interpreted instead of spending another topic
  // check and interpretation on a message the user already sent.
  if (args.resumeWaitingPlan && previous && previous.journeyId === args.journeyId
    && previous.outcome?.status === 'waiting' && previous.decision.fullHikingPlan
    && previous.topicCheck?.policyVersion === TOPIC_POLICY_VERSION && previous.topicCheck.allowed
    && !taskClarification(previous)) {
    const state: TaskState = { runId: args.runId, journeyId: args.journeyId, decision: previous.decision, outcome: null,
      topicCheck: previous.topicCheck, routing: previous.routing ? { ...previous.routing, source: 'continuation' } : undefined };
    await persistTask(state);
    return state;
  }
  const recentMessages = [...(history.data || [])].reverse().map((message: { role: string; content: string }) => ({
    role: message.role,
    content: message.content.slice(0, 800),
  }));
  const pendingQuestion = previous?.journeyId === args.journeyId
    && ['waiting', 'partial'].includes(previous?.outcome?.status || '')
    ? previous?.outcome?.pendingQuestion || null : null;
  // The smart plan button is a command: the journey row decides the task and
  // the message is the server's own template (smart-plan.ts), so neither the
  // topic check nor the router or interpreter has anything to add.
  if (args.intent === 'smart_plan' && args.smartPlan && !saved.data) {
    const decision = constrainTaskDecision(smartPlanDecision(args.smartPlan, args.message), args.message, previous, args.journeyId,
      { hasBoundTrack: args.smartPlan.hasBoundTrack, intent: 'plan_journey' });
    if (decision.mode === 'execute' && decision.fullHikingPlan) {
      const state: TaskState = { runId: args.runId, journeyId: args.journeyId, decision, outcome: null,
        topicCheck: { allowed: true, policyVersion: TOPIC_POLICY_VERSION, checkedAt: new Date().toISOString(), source: 'app' },
        routing: { intent: 'hiking_plan', source: 'app', applied: true, appIntent: 'smart_plan' } };
      await persistTask(state);
      return state;
    }
  }
  // A plain "add these items to my library" is decided by rules before any
  // model: no topic check, router or interpreter. Anything the grammar is not
  // sure about abstains and takes the full path below.
  if (args.gearFastPath && !saved.data) {
    const fastPathInput = { message: args.message, journeyId: args.journeyId, appIntent: args.intent || null,
      hasAttachments: Boolean(args.turnHasAttachments), pendingQuestion: Boolean(pendingQuestion) };
    // Categories only fill categoryId, so read them after the grammar matched.
    if (parseGearAdd(fastPathInput, []).match) {
      const categories = await client.from('gear_categories').select('id,name').eq('user_id', args.userId).order('created_at');
      if (categories.error) throw categories.error;
      const parsed = parseGearAdd(fastPathInput, categories.data || []);
      if (parsed.match) {
        const decision = constrainTaskDecision(taskDecisionSchema.parse({
          objective: args.message.trim().slice(0, 1000), mode: 'execute', domain: 'general',
          continuation: false, authorizationQuote: parsed.authorizationQuote,
          operations: ['add_gear'], requiredOperations: ['add_gear'], fullHikingPlan: false,
          destination: null, plannedDate: null, dateUndecided: false, days: null,
          trackAttachmentName: null, packingMode: 'none', constraints: [],
        }), args.message, previous, args.journeyId);
        // constrainTaskDecision re-checks the quote; a mismatch must fall
        // through to the model path, never execute without authorization.
        if (decision.mode === 'execute' && decision.operations.includes('add_gear')) {
          const state: TaskState = { runId: args.runId, journeyId: args.journeyId, decision, outcome: null,
            topicCheck: { allowed: true, policyVersion: TOPIC_POLICY_VERSION, checkedAt: new Date().toISOString(), source: 'rules' },
            routing: { intent: 'gear_add', source: 'rules', applied: true },
            rules: { intent: 'gear_add', items: parsed.items } };
          await persistTask(state);
          return state;
        }
      }
    }
  }
  const topicCheck = await checkTopic({ latestMessage: args.message, recentMessages, pendingQuestion });
  if (topicCheck.policyVersion !== TOPIC_POLICY_VERSION || typeof topicCheck.allowed !== 'boolean') {
    throw new Error('invalid_topic_check_result');
  }
  if (!topicCheck.allowed) {
    const decision = constrainTaskDecision(taskDecisionSchema.parse({
      objective: args.message.trim().slice(0, 1000), offTopic: true, mode: 'discuss',
      continuation: false, authorizationQuote: '', operations: [], requiredOperations: [],
      destination: null, plannedDate: null, dateUndecided: false, days: null,
      trackAttachmentName: null, packingMode: 'none', constraints: [],
    }), args.message, previous, args.journeyId);
    const state: TaskState = { runId: args.runId, journeyId: args.journeyId, decision, outcome: null, topicCheck };
    await persistTask(state);
    return state;
  }
  // Older queued/retried runs get the rail once, then retain their original
  // interpreted scope so partial work is never reauthorized by a retry.
  if (saved.data) {
    const state: TaskState = { ...saved.data.state, journeyId: args.journeyId,
      decision: taskDecisionSchema.parse({ ...saved.data.state.decision, offTopic: false }), topicCheck };
    await persistTask(state);
    return state;
  }
  const bound = args.journeyId
    ? await client.from('journeys').select('track_id, tracks ( file_name, coords )').eq('id', args.journeyId).is('deleted_at', null).maybeSingle()
    : { data: null, error: null };
  if (bound.error) throw bound.error;
  // PostgREST can represent the FK relation as either an object or a
  // single-element array depending on the generated relationship metadata.
  // The journey's track_id is authoritative even when the related row is
  // hidden by a policy, while the coordinates prove the cached track is usable.
  const relatedTrack = Array.isArray(bound.data?.tracks) ? bound.data.tracks[0] : bound.data?.tracks;
  const boundTrack = relatedTrack as { file_name?: string | null; coords?: [number, number][] | null } | null;
  const hasBoundTrack = Boolean(bound.data?.track_id)
    || (Array.isArray(boundTrack?.coords) && boundTrack.coords.length >= 2);
  // Gate, intent router (in parallel with the interpreter), applyIntent, quote
  // guard and constrainTaskDecision; see intent-router.ts.
  const { decision, routing } = await resolveTask({
    message: args.message,
    journeyId: args.journeyId,
    previous,
    appIntent: args.intent || null,
    hasBoundTrack,
    mode: args.routerMode ?? 'on',
    recentMessages,
    interpretInput: {
      latestMessage: args.message,
      appIntent: args.intent || null,
      currentJourneyId: args.journeyId,
      boundTrack: { available: hasBoundTrack, filename: boundTrack?.file_name || null },
      temporalContext: args.temporalContext,
      availableAttachments: args.attachments,
      previousTask: previous,
      recentMessages,
    },
  }, interpret, route);
  const state: TaskState = { runId: args.runId, journeyId: args.journeyId, decision, outcome: null, topicCheck, routing };
  // Only the authenticated worker's service client can persist interpreted scope.
  // Retries reuse it, including the routing and any clarification, rather than
  // reinterpreting an already partially executed task.
  await persistTask(state);
  return state;

  async function persistTask(state: TaskState) {
    const stored = saved.data
      ? await admin.from('agent_task_states').update({ state }).eq('run_id', args.runId)
      : await admin.from('agent_task_states').insert({ run_id: args.runId, thread_id: args.threadId, user_id: args.userId, state });
    if (stored.error) throw stored.error;
  }
}
