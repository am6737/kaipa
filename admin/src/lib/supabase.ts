import { createClient } from '@supabase/supabase-js'
import type { FactDraft } from '@/features/route-facts/fact-schema'

const rawUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.EXPO_PUBLIC_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

// A root-relative url means "same origin, via the dev server proxy", which keeps
// working however the console itself is reached.
const url = rawUrl?.startsWith('/') ? `${window.location.origin}${rawUrl}` : rawUrl

if (!url || !key) {
  console.warn('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

// Keep the shell renderable when local setup is incomplete. Queries will return
// a normal connection error that the dashboard can display, instead of crashing
// the router during module evaluation.
export const supabase = createClient(
  url || 'http://127.0.0.1:54321',
  key || 'missing-anon-key',
  {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  },
)

export async function adminApi<T>(resource: string): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('后台登录会话已失效，请重新登录')
  const response = await fetch(`${url || ''}/functions/v1/admin-api?resource=${encodeURIComponent(resource)}`, {
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: key || '' },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `后台接口请求失败 (${response.status})`)
  return body as T
}

export async function adminMutation(resource: string, body: Record<string, string>): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('后台登录会话已失效，请重新登录')
  const response = await fetch(`${url || ''}/functions/v1/admin-api?resource=${encodeURIComponent(resource)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: key || '', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || `后台操作失败 (${response.status})`)
}

export async function analyzeRouteFact(body: { source_url?: string; source_text?: string; source_file?: { name: string; content_type: string; base64: string } }) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('后台登录会话已失效，请重新登录')
  const response = await fetch(`${url || ''}/functions/v1/route-fact-analyze`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: key || '', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || `资料解析失败 (${response.status})`)
  return result as { items: FactDraft[]; source_url: string | null; model?: string }
}

export async function uploadAdminTrack(file: File) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('后台登录会话已失效，请重新登录')
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  if (!['gpx', 'kml', 'kmz'].includes(extension)) throw new Error('只支持 GPX、KML、KMZ 文件')
  const path = `tracks/${session.user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const { error } = await supabase.storage.from('kaipa').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (error) throw error
  const { data } = supabase.storage.from('kaipa').getPublicUrl(path)
  return { url: data.publicUrl, path, name: file.name, format: extension, size: file.size }
}
