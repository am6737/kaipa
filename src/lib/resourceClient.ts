import { supabase } from './supabase';
const listeners = new Set<() => void>();
export function resourceUsageChanged() { for (const listener of listeners) listener(); }
export function subscribeResourceUsage(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export async function resourceRequest<T>(body: Record<string, unknown>): Promise<T> {
  const { data,error } = await supabase.functions.invoke('resources',{body});
  if (error) {
    const context = (error as { context?: Response }).context;
    let message = '服务暂时不可用，请稍后重试';
    if (context?.json) { try { const payload = await context.json(); message = payload.error?.message || message; } catch { /* transport failure */ } }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error.message);
  return data as T;
}
