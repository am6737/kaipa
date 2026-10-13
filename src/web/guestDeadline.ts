export const GUEST_WAIT_MS = 30_000;

// This bounds client waiting, not server execution. The guard fences late
// continuations even when the underlying SDK/network promise ignores aborts.
export function withGuestDeadline<T>(run: (guard: () => void) => Promise<T>, onTimeout?: () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let active = true;
    const guard = () => {
      if (!active) throw new Error('请求已结束，请重试本次内容');
    };
    const timer = setTimeout(() => {
      active = false;
      try { onTimeout?.(); } catch { /* the deadline still releases waiting */ }
      reject(new Error('等待超过30秒，结果未确认，请重试本次内容'));
    }, GUEST_WAIT_MS);
    let work: Promise<T>;
    try { work = run(guard); }
    catch (error) { active = false; clearTimeout(timer); reject(error); return; }
    work.then(
      value => { if (active) resolve(value); },
      error => { if (active) reject(error); },
    ).finally(() => { active = false; clearTimeout(timer); });
  });
}
