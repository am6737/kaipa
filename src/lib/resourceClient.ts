import { supabase } from './supabase';
const listeners = new Set<() => void>();
export function resourceUsageChanged() { for (const listener of listeners) listener(); }
export function subscribeResourceUsage(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
/** Carries the server's error code (e.g. file_too_large) next to its display message. */
export type ResourceRequestError = Error & { code?: string };
function resourceError(message: string, code?: string): ResourceRequestError {
  return Object.assign(new Error(message), { code });
}
export async function resourceRequest<T>(body: Record<string, unknown>): Promise<T> {
  const { data,error } = await supabase.functions.invoke('resources',{body});
  if (error) {
    const context = (error as { context?: Response }).context;
    let message = '服务暂时不可用，请稍后重试';
    let code: string | undefined;
    if (context?.json) { try { const payload = await context.json(); message = payload.error?.message || message; code = payload.error?.code; } catch { /* transport failure */ } }
    throw resourceError(message, code);
  }
  if (data?.error) throw resourceError(data.error.message, data.error.code);
  return data as T;
}
