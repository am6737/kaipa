import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Pushes a refresh whenever a background run changes.
 *
 * The subscription is only a signal: the existing poll stays the single writer
 * of run state, so a dropped or unsupported realtime connection degrades to
 * today's cadence instead of leaving the UI stuck.
 */
export function useAgentRunRealtime(runId: string | undefined, onChange: () => void) {
  const callback = useRef(onChange);
  callback.current = onChange;

  useEffect(() => {
    if (!runId) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      // A stage transition writes several rows at once; one refresh is enough.
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = undefined; callback.current(); }, 400);
    };
    // Tool-call rows change constantly mid-stage; the stage and run rows are
    // enough of a nudge and the poll's own cadence covers the rest.
    const channel = supabase
      .channel(`agent-run:${runId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_runs', filter: `id=eq.${runId}` }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_stages', filter: `run_id=eq.${runId}` }, schedule)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [runId]);
}
