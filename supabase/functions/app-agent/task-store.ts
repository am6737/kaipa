import { constrainTaskDecision, taskDecisionSchema, type TaskDecision, type TaskState } from './task.ts';
import { TOPIC_POLICY_VERSION, type TopicCheck, type TopicInput } from './topic-boundary.ts';

type Client = any;

export async function prepareTask(
  client: Client,
  admin: Client,
  args: { runId: string; threadId: string; userId: string; journeyId: string | null; message: string; intent?: string; temporalContext: string; attachments: Array<{ name: string; kind: string }> },
  interpret: (input: unknown) => Promise<TaskDecision>,
  checkTopic: (input: TopicInput) => Promise<TopicCheck>,
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
  const recentMessages = [...(history.data || [])].reverse().map((message: { role: string; content: string }) => ({
    role: message.role,
    content: message.content.slice(0, 800),
  }));
  const topicCheck = await checkTopic({ latestMessage: args.message, recentMessages,
    pendingQuestion: previous?.journeyId === args.journeyId
      && ['waiting', 'partial'].includes(previous?.outcome?.status || '')
      ? previous?.outcome?.pendingQuestion || null : null });
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
  const interpreted = await interpret({
    latestMessage: args.message,
    appIntent: args.intent || null,
    currentJourneyId: args.journeyId,
    boundTrack: { available: hasBoundTrack, filename: boundTrack?.file_name || null },
    temporalContext: args.temporalContext,
    availableAttachments: args.attachments,
    previousTask: previous,
    recentMessages,
  });
  const decision = constrainTaskDecision({
    ...interpreted,
    offTopic: false,
    objective: interpreted.objective?.trim() || args.message.trim().slice(0, 1000),
  }, args.message, previous, args.journeyId, { hasBoundTrack, intent: args.intent });
  const state: TaskState = { runId: args.runId, journeyId: args.journeyId, decision, outcome: null, topicCheck };
  // Only the authenticated worker's service client can persist interpreted scope.
  // Retries reuse it rather than reinterpreting an already partially executed task.
  await persistTask(state);
  return state;

  async function persistTask(state: TaskState) {
    const stored = saved.data
      ? await admin.from('agent_task_states').update({ state }).eq('run_id', args.runId)
      : await admin.from('agent_task_states').insert({ run_id: args.runId, thread_id: args.threadId, user_id: args.userId, state });
    if (stored.error) throw stored.error;
  }
}
