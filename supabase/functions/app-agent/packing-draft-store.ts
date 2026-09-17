import { draftSchema, type PackingDraft } from './packing-draft.ts';

const admins = new Map<string, any>();
export function bindPackingDraftStore(runId: string, admin: any) { admins.set(runId, admin); }
export function releasePackingDraftStore(runId: string) { admins.delete(runId); }
function adminFor(runId: string) { const admin = admins.get(runId); if (!admin) throw new Error('Draft worker unavailable'); return admin; }
export async function readPackingDraft(client: any, runId: string): Promise<{ state: PackingDraft; last_edit: string | null } | null> {
  const result = await client.from('agent_packing_drafts').select('state,last_edit').eq('run_id', runId).maybeSingle();
  if (result.error) throw result.error;
  return result.data ? { state: draftSchema.parse(result.data.state), last_edit: result.data.last_edit } : null;
}
export async function savePackingDraft(runId: string, userId: string, state: PackingDraft, previousRevision?: number, edit?: string) {
  const admin = adminFor(runId);
  const result = previousRevision == null
    ? await admin.from('agent_packing_drafts').insert({ run_id: runId, user_id: userId, state, revision: state.revision }).select('run_id').single()
    : await admin.from('agent_packing_drafts').update({ state, revision: state.revision, last_edit: edit, updated_at: new Date().toISOString() })
      .eq('run_id', runId).eq('user_id', userId).eq('revision', previousRevision).select('run_id').single();
  if (result.error) throw result.error;
}
