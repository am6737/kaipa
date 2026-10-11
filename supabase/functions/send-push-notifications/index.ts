declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };

// @ts-ignore Deno npm specifier
import { createClient } from 'npm:@supabase/supabase-js@2.108.1';

// 推送发送 worker：drain push_outbox → 免打扰/频控判定 → DooPush single 推送。
// 触发来源：notifications 行触发器即时 kick（语句级）+ agent-worker 每分钟 kick_push_drain() 兜底。
// 鉴权：X-Notify-Secret 对比 DB push_runtime_config('notify_secret')（触发器与函数同源，fail-closed）。
// 凭据：DOOPUSH_APP_ID / DOOPUSH_API_KEY(服务端 key) / DOOPUSH_BASE_URL；缺凭据时 drain no-op。

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const QUIET_START_MIN = 22 * 60;   // 设备本地 22:00 起免打扰
const QUIET_END_MIN = 8 * 60;      // 08:00 恢复（顺延发送的目标时刻）
const MERGE_WINDOW_MS = 5 * 60 * 1000; // 同用户同 kind 5 分钟内合并
const DAY_MS = 86_400_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function envOptional(name: string) {
  return Deno.env.get(name)?.trim() || '';
}

type OutboxRow = {
  id: number;
  notification_id: string;
  user_id: string;
  kind: string;
  attempts: number; // claim 时已自增，complete 用它做领取代次校验（防卡死回收后双写/双发）
  sent_device_ids?: string[] | null;
};

type DeviceRow = {
  device_id: string;
  token: string | null;
  platform: string | null;
  lang: string;
  tz_offset: number;
};

type NotificationRow = {
  id: string;
  kind: string;
  verb: string;
  who: string | null;
  target: string | null;
  target_id: string | null;
};

// ── 模板 ──
// zh 直接复用 notifications 行本身的中文（who + verb +「target」），与消息中心一致；
// en 按 kind 提供固定短语（一期以中文用户为主，英文只保证可读不逐词翻译动态后缀）。
const EN_PHRASES: Record<string, (n: NotificationRow) => { title: string; body: string }> = {
  join: (n) => ({ title: 'Journey update', body: `${n.who ?? 'Someone'} joined your journey${n.target ? ` "${n.target}"` : ''}` }),
  trip: (n) => ({ title: 'Packing reminder', body: `${n.who ?? 'A companion'} reminded you about your gear${n.target ? ` for "${n.target}"` : ''}` }),
  companion_leave: (n) => ({ title: 'Journey update', body: `${n.who ?? 'A companion'} left your journey${n.target ? ` "${n.target}"` : ''}` }),
  guest_moment: (n) => ({ title: 'New moment', body: `A guest shared a new moment in${n.target ? ` "${n.target}"` : ' your journey'}` }),
  guide_review: () => ({ title: 'Route guide review', body: 'Your route guide review result is ready. Tap to view the details.' }),
  route_request: () => ({ title: 'Route request update', body: 'Your route request has been reviewed.' }),
  departure: (n) => ({ title: 'Departure reminder', body: n.target ? `Time to get ready — "${n.target}" is coming up!` : 'Your planned departure is coming up!' }),
  system: (n) => ({ title: 'Kaipa', body: n.verb }),
};

function buildContent(lang: string, n: NotificationRow): { title: string; body: string } {
  if (lang === 'en') {
    const maker = EN_PHRASES[n.kind] || EN_PHRASES.system!;
    return maker(n);
  }
  const titleZh: Record<string, string> = {
    join: '旅程动态',
    trip: '装备提醒',
    companion_leave: '旅程动态',
    guest_moment: '新瞬间',
    guide_review: '路书审核结果',
    route_request: '路线请求动态',
    departure: '出发提醒',
    system: 'Kaipa',
  };
  const head = n.kind === 'system' || !n.who ? '' : `${n.who} `;
  const tail = n.target ? `「${n.target}」` : '';
  return { title: titleZh[n.kind] || 'Kaipa', body: `${head}${n.verb}${tail}`.trim() };
}

// ── 免打扰（移植 yibai：tz_offset 即 JS getTimezoneOffset，中国 -480）──
function deviceLocalMinutes(nowUtcMs: number, tzOffsetMin: number) {
  const local = new Date(nowUtcMs - tzOffsetMin * 60000);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

function inQuietHours(localMin: number) {
  return localMin >= QUIET_START_MIN || localMin < QUIET_END_MIN; // 跨午夜区间
}

// 该设备下一个本地 08:00 的 UTC 毫秒（+ 0–90s 抖动打散）
function nextQuietEndUtcMs(nowUtcMs: number, tzOffsetMin: number) {
  const localNow = nowUtcMs - tzOffsetMin * 60000;
  let target = Math.floor(localNow / DAY_MS) * DAY_MS + QUIET_END_MIN * 60000 + Math.floor(Math.random() * 90000);
  if (target <= localNow) target += DAY_MS;
  return target + tzOffsetMin * 60000;
}

async function verifySecret(req: Request, admin: ReturnType<typeof createClient>) {
  const provided = req.headers.get('x-notify-secret') || '';
  if (!provided) return false;
  const { data } = await admin
    .from('push_runtime_config')
    .select('value')
    .eq('key', 'notify_secret')
    .maybeSingle();
  const expected: string = data?.value || '';
  if (!expected) return false;
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: { code: 'method_not_allowed' } }, 405);

  const url = envOptional('SUPABASE_URL') || 'http://kong:8000';
  const serviceKey = envOptional('SUPABASE_SERVICE_ROLE_KEY') || envOptional('SERVICE_ROLE_KEY');
  if (!serviceKey) return json({ error: { code: 'server_misconfigured' } }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  if (!(await verifySecret(req, admin))) return json({ error: { code: 'unauthorized' } }, 401);

  const appId = envOptional('DOOPUSH_APP_ID');
  const apiKey = envOptional('DOOPUSH_API_KEY');
  const baseUrl = (envOptional('DOOPUSH_BASE_URL') || 'https://doopush.com/api/v1').replace(/\/$/, '');
  if (!appId || !apiKey) {
    // 本地/未配置环境：不领取任务，outbox 保持 pending，配好凭据后自动被兜底 drain 消费。
    return json({ ok: true, skipped: 'no_doopush_credentials' });
  }

  let body: { event?: string } = {};
  try { body = await req.json(); } catch { body = {}; }
  // 只实现 drain；预留 event 便于未来直发/测试分支
  if (body.event && body.event !== 'drain') return json({ ok: true, ignored: body.event });

  const { data: jobs, error: claimError } = await admin.rpc('claim_push_jobs', { p_limit: 20 });
  if (claimError) return json({ error: { code: 'claim_failed', message: claimError.message } }, 500);

  const now = Date.now();
  const results: Array<{ id: number; outcome: string; sent?: number }> = [];

  for (const job of (jobs || []) as OutboxRow[]) {
    const alreadySent: string[] = Array.isArray(job.sent_device_ids) ? job.sent_device_ids : [];

    const { data: notif } = await admin
      .from('notifications')
      .select('id,kind,verb,who,target,target_id')
      .eq('id', job.notification_id)
      .maybeSingle<NotificationRow>();
    if (!notif) {
      await admin.rpc('complete_push_job', { p_id: job.id, p_ok: true, p_sent: 0, p_error: 'notification_missing', p_attempt: job.attempts });
      results.push({ id: job.id, outcome: 'notification_missing' });
      continue;
    }

    // 频控合并：同用户同 kind 5 分钟内已实发过 → 跳过（消息中心仍保留每条）
    const { data: recent } = await admin
      .from('push_outbox')
      .select('id')
      .eq('user_id', job.user_id)
      .eq('kind', job.kind)
      .eq('status', 'done')
      .gt('sent_count', 0)
      .gt('processed_at', new Date(now - MERGE_WINDOW_MS).toISOString())
      .limit(1);
    if (recent && recent.length > 0) {
      await admin.rpc('complete_push_job', { p_id: job.id, p_ok: true, p_sent: 0, p_error: 'merged_within_5min', p_attempt: job.attempts });
      results.push({ id: job.id, outcome: 'merged' });
      continue;
    }

    const { data: devices, error: deviceError } = await admin
      .from('push_devices')
      .select('device_id,token,platform,lang,tz_offset')
      .eq('user_id', job.user_id);
    if (deviceError) {
      await admin.rpc('complete_push_job', { p_id: job.id, p_ok: false, p_sent: 0, p_error: deviceError.message, p_sent_device_ids: alreadySent, p_attempt: job.attempts });
      results.push({ id: job.id, outcome: 'device_query_failed' });
      continue;
    }
    const candidates = ((devices || []) as DeviceRow[]).filter((d) => d.token && !alreadySent.includes(d.device_id));
    if (candidates.length === 0) {
      await admin.rpc('complete_push_job', { p_id: job.id, p_ok: true, p_sent: 0, p_error: alreadySent.length ? 'all_sent' : 'no_devices', p_sent_device_ids: alreadySent, p_attempt: job.attempts });
      results.push({ id: job.id, outcome: 'no_targets' });
      continue;
    }

    let sent = alreadySent.length;
    const sentDevices = [...alreadySent];
    let failures: string[] = [];
    let quietUntil: number | null = null;

    for (const device of candidates) {
      const localMin = deviceLocalMinutes(now, device.tz_offset);
      if (inQuietHours(localMin)) {
        const until = nextQuietEndUtcMs(now, device.tz_offset);
        quietUntil = quietUntil === null ? until : Math.min(quietUntil, until);
        continue;
      }
      const { title, body: content } = buildContent(device.lang, notif);
      try {
        const response = await fetch(`${baseUrl}/apps/${appId}/push/single`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
          body: JSON.stringify({
            title,
            content,
            device_id: device.token, // DooPush 实测：device_id 填设备 token，非内部数字 id
            payload: {
              action: 'open_page',
              data: JSON.stringify({ scene: notif.kind, notification_id: notif.id, target_id: notif.target_id }),
            },
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) {
          failures.push(`device ${device.device_id.slice(0, 8)}: HTTP ${response.status} ${(await response.text()).slice(0, 120)}`);
          continue;
        }
        sent += 1;
        sentDevices.push(device.device_id);
      } catch (error) {
        failures.push(`device ${device.device_id.slice(0, 8)}: ${String(error).slice(0, 120)}`);
      }
    }

    if (quietUntil !== null) {
      // 仍有设备处于免打扰：顺延到最早本地 08:00（已发设备靠 sent_device_ids 不会重复收）。
      // 纯免打扰（无失败）回拨 attempts；伴随发送失败则保留 p_error，让重试照常计数。
      await admin.rpc('complete_push_job', {
        p_id: job.id,
        p_ok: false,
        p_sent: sent,
        p_error: failures.length ? `quiet_hours; ${failures.join('; ')}`.slice(0, 480) : 'quiet_hours',
        p_reschedule_at: new Date(quietUntil).toISOString(),
        p_sent_device_ids: sentDevices,
        p_attempt: job.attempts,
      });
      results.push({ id: job.id, outcome: 'rescheduled_quiet' });
      continue;
    }

    if (failures.length > 0 && sent === alreadySent.length) {
      await admin.rpc('complete_push_job', { p_id: job.id, p_ok: false, p_sent: sent, p_error: failures.join('; '), p_sent_device_ids: sentDevices, p_attempt: job.attempts });
      results.push({ id: job.id, outcome: 'send_failed' });
      continue;
    }

    // 全部设备已覆盖（成功或失败）：部分失败也视为 done，失败设备 token 会随客户端注册刷新。
    await admin.rpc('complete_push_job', { p_id: job.id, p_ok: true, p_sent: sent, p_error: failures.length ? failures.join('; ').slice(0, 200) : null, p_sent_device_ids: sentDevices, p_attempt: job.attempts });
    results.push({ id: job.id, outcome: failures.length ? 'partial' : 'sent', sent });
  }

  return json({ ok: true, drained: (jobs || []).length, results });
});
