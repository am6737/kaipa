import { guestSupabase } from './supabaseGuest';
export async function guestRequest<T>(body: Record<string,unknown>, token?: string): Promise<T> {
  const {data,error} = await guestSupabase.functions.invoke('resources',{body,headers:token?{'x-guest-session':token}:{}});
  if (error) {
    let message = '操作失败，请稍后重试';
    try { const response = await (error as {context:Response}).context.json(); message = response.error?.message || message; } catch { /* network error */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error.message);
  return data as T;
}
