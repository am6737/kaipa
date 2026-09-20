import { constrainTaskDecision, taskDecisionSchema, type TaskDecision, type TaskState } from './task.ts';

type Client = any;

export async function prepareTask(
  client: Client,
  admin: Client,
  args: { runId: string; threadId: string; userId: string; journeyId: string | null; message: string; intent?: string; temporalContext: string; attachments: Array<{ name: string; kind: string }> },
  interpret: (input: unknown) => Promise<TaskDecision>,
): Promise<TaskState> {
  const saved = await client.from('agent_task_states').select('state').eq('run_id', args.runId).maybeSingle();
  if (saved.error) throw saved.error;
  if (saved.data) {
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
  const previous = (prior.data?.state || null) as TaskState | null;
  const recentMessages = [...(history.data || [])].reverse().map((message: { role: string; content: string }) => ({
    role: message.role,
    content: message.content.slice(0, 800),
  }));
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
    objective: interpreted.objective?.trim() || args.message.trim().slice(0, 1000),
  }, args.message, previous, args.journeyId, { hasBoundTrack, intent: args.intent });
  const state: TaskState = { runId: args.runId, journeyId: args.journeyId, decision, outcome: null };
  // Only the authenticated worker's service client can persist interpreted scope.
  // Retries reuse it rather than reinterpreting an already partially executed task.
  const stored = await admin.from('agent_task_states').insert({ run_id: args.runId, thread_id: args.threadId, user_id: args.userId, state });
  if (stored.error) throw stored.error;
  return state;
}
