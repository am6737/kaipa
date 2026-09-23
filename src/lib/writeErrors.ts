/**
 * A journey write that could not take a row lock in time is not a network
 * problem, and not something the user did: something else is mid-write on the
 * same journey. The database answers 55P03 (lock_not_available) for it, because
 * `lock_timeout` is set for the app's role, and 57014 (statement timeout) for any
 * wait that outlives the older, longer limit — the same situation either way.
 */
export function isWriteBusy(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return code === '55P03' || code === '57014';
}
