export async function withAgentDeadline<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs = 20_000): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('agent_request_timeout'));
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// One bounded read at a time, with an immediate check on foreground/network recovery.
export function startAgentRecovery(check: () => Promise<void>, onError: () => void, intervalMs = 2500) {
  let stopped = false;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  const tick = async () => {
    if (stopped || busy) return;
    busy = true;
    const current = generation;
    try { await check(); } catch { if (!stopped && current === generation) onError(); }
    finally {
      if (!stopped && current === generation) {
        busy = false;
        timer = setTimeout(() => void tick(), intervalMs);
      }
    }
  };
  void tick();
  return {
    resume() {
      if (stopped) return;
      clearTimeout(timer);
      if (!busy) void tick();
    },
    stop() { stopped = true; generation++; clearTimeout(timer); },
  };
}
