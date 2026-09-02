declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };

// @ts-ignore Deno npm specifier
import { createClient } from 'npm:@supabase/supabase-js@2.108.1';
import { AGENT_VERSION, createAgentRuntime } from './agent.ts';
import { SupabaseAgentSession } from './session.ts';
import { bindRunClient, releaseRunClient } from './tools.ts';
import type { AgentAttachment, AgentContext, AgentIntent, AgentMessageUi, AgentPlanPreview, AgentQuickReply, AgentResponse, AgentRunActivity, AgentSource, PendingApproval } from './types.ts';
import { canonicalJourneyDay } from './journey-days.ts';
import { itineraryMinutes } from './itinerary-time.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Kaipa-Agent-Version': AGENT_VERSION },
});

function env(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function agentModelConfig() {
  const dedicatedApiKey = Deno.env.get('KAIPA_AI_API_KEY')?.trim();
  const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY')?.trim();
  const apiKey = dedicatedApiKey || openRouterApiKey;
  if (!apiKey) throw new Error('Missing KAIPA_AI_API_KEY or OPENROUTER_API_KEY');
  return {
    apiKey,
    baseUrl: (
      Deno.env.get('KAIPA_AI_BASE_URL')?.trim()
      || (dedicatedApiKey ? 'https://ai.dootask.com/v1' : 'https://openrouter.ai/api/v1')
    ).replace(/\/$/, ''),
    model: Deno.env.get('KAIPA_AI_MODEL')?.trim()
      || Deno.env.get('OPENROUTER_MODEL')?.trim()
      || 'openai/gpt-4.1-mini',
  };
}

function bearerToken(req: Request) {
  const header = req.headers.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' ? token : '';
}

function parseArguments(value?: string): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function approvalSummary(toolName: string, args: Record<string, unknown>) {
  if (toolName === 'add_gear') return { title: `添加装备「${String(args.name || '')}」`, detail: `${Number(args.quantity || 1)} 件` };
  if (toolName === 'create_journey') {
    const detail = [
      `${Number(args.days || 1)} 天`,
      String(args.region || ''),
      args.plannedDate ? String(args.plannedDate) : '',
      args.trackAttachmentName ? `轨迹 ${String(args.trackAttachmentName)}` : '',
    ].filter(Boolean).join('  ·  ');
    return { title: `创建旅程「${String(args.name || '')}」`, detail };
  }
  if (toolName === 'add_itinerary_items') return { title: '写入旅程行程', detail: `新增 ${Array.isArray(args.items) ? args.items.length : 0} 项安排` };
  if (toolName === 'set_itinerary_group_endpoints') {
    const endpoints = Array.isArray(args.endpoints) ? args.endpoints : [];
    const labels = endpoints.flatMap((endpoint) => {
      if (!endpoint || typeof endpoint !== 'object' || !('day' in endpoint)) return [];
      const location = 'locationName' in endpoint && endpoint.locationName ? String(endpoint.locationName) : '';
      const distance = 'endDistanceKm' in endpoint && Number.isFinite(Number(endpoint.endDistanceKm))
        ? `${Number(endpoint.endDistanceKm).toFixed(1)} km`
        : '';
      const endpointLabel = [location, distance].filter(Boolean).join(' · ');
      return [`${String(endpoint.day)}${endpointLabel ? `：${endpointLabel}` : ''}`];
    });
    return { title: '设置行程组终点', detail: labels.length ? labels.join('、') : `设置 ${endpoints.length} 个终点` };
  }
  if (toolName === 'add_packing_items') return { title: '写入装备清单', detail: `新增 ${Array.isArray(args.items) ? args.items.length : 0} 件装备` };
  if (toolName === 'delete_itinerary_items') {
    const items = Array.isArray(args.items) ? args.items : [];
    const labels = items.flatMap((item) => item && typeof item === 'object' && 'title' in item ? [String(item.title)] : []);
    const detail = `${labels.slice(0, 4).join('、')}${labels.length > 4 ? ` 等 ${labels.length} 项` : ''}`;
    return { title: `删除 ${items.length} 项行程安排`, detail: detail || '此操作无法撤销', destructive: true };
  }
  if (toolName === 'delete_packing_items') {
    const items = Array.isArray(args.items) ? args.items : [];
    const labels = items.flatMap((item) => item && typeof item === 'object' && 'name' in item ? [String(item.name)] : []);
    const detail = `${labels.slice(0, 4).join('、')}${labels.length > 4 ? ` 等 ${labels.length} 项` : ''}`;
    return { title: `删除 ${items.length} 项清单物品`, detail: detail || '此操作无法撤销', destructive: true };
  }
  return { title: `执行 ${toolName}`, detail: '此操作会修改你的数据' };
}

function toApprovals(interruptions: any[]): PendingApproval[] {
  return interruptions.map((item) => {
    const toolName = item.name || item.toolName || 'unknown_tool';
    const args = parseArguments(item.arguments);
    const summary = approvalSummary(toolName, args);
    return {
      callId: item.callId || item.rawItem?.callId || item.rawItem?.call_id || '',
      toolName,
      arguments: args,
      ...summary,
    };
  }).filter((item) => item.callId);
}

function normalizeQuickReplies(value: unknown): AgentQuickReply[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const label = typeof record.label === 'string' ? record.label.trim().slice(0, 24) : '';
    const message = typeof record.message === 'string' ? record.message.trim().slice(0, 200) : '';
    const action = record.action === 'upload_track' || record.action === 'skip_track' ? record.action : undefined;
    return label && message ? [{ label, message, action }] : [];
  }).slice(0, 4);
}

function finalMessage(value: unknown): { text: string; quickReplies: AgentQuickReply[] } {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return {
      text: typeof record.text === 'string' ? record.text.trim() : '',
      quickReplies: normalizeQuickReplies(record.quickReplies),
    };
  }
  if (typeof value === 'string') {
    const text = value.trim();
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') return finalMessage(parsed);
    } catch {
      // Compatible providers may still return plain text; keep it usable.
    }
    return { text, quickReplies: [] };
  }
  return { text: value == null ? '' : String(value), quickReplies: [] };
}

function fallbackQuickReplies(intent: AgentIntent | undefined, locale: 'zh' | 'en' | undefined): AgentQuickReply[] {
  if (intent !== 'plan_journey') return [];
  if (locale === 'en') {
    return [
      { label: 'Sanya', message: 'I want to visit Sanya for a relaxing coastal trip.' },
      { label: 'Beijing', message: 'I want to visit Beijing and combine city sights with an outdoor route.' },
      { label: 'Yunnan', message: 'I want to visit Yunnan, with scenery and light hiking as priorities.' },
    ];
  }
  return [
    { label: '我想去三亚', message: '我想去三亚，以轻松的滨海旅行为主。' },
    { label: '我想去北京', message: '我想去北京，希望结合城市游览和户外路线。' },
    { label: '我想去云南', message: '我想去云南，优先安排自然风景和轻徒步。' },
  ];
}

function validClientRunId(value?: string) {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : undefined;
}


function validIsoLocalDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? value : undefined;
}

function addDaysIso(localDate: string, days: number) {
  const [year, month, day] = localDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function validLocalTime(value?: string) {
  return value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : undefined;
}

function validTimeZone(value?: string) {
  return value && /^[A-Za-z0-9_+./-]{1,80}$/.test(value) ? value : undefined;
}

function validIsoTimestamp(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function agentTemporalContext(body: { clientLocalDate?: string; clientLocalTime?: string; clientTimeZone?: string; clientTimestamp?: string }) {
  const fallbackDate = new Date();
  const localDate = validIsoLocalDate(body.clientLocalDate) || fallbackDate.toISOString().slice(0, 10);
  const localTime = validLocalTime(body.clientLocalTime);
  const timeZone = validTimeZone(body.clientTimeZone);
  const timestamp = validIsoTimestamp(body.clientTimestamp) || fallbackDate.toISOString();
  return [
    '运行上下文（用于解析相对日期，不要原样展示给用户）：',
    `用户本地日期：${localDate}`,
    localTime ? `用户本地时间：${localTime}` : undefined,
    timeZone ? `用户时区：${timeZone}` : undefined,
    `请求时间戳：${timestamp}`,
    `相对日期参考：今天=${localDate}，明天=${addDaysIso(localDate, 1)}，后天=${addDaysIso(localDate, 2)}，大后天=${addDaysIso(localDate, 3)}。`,
    '日期处理要求：今天/明天/后天/大后天/本周/下周等能唯一确定的表达直接换算为具体 YYYY-MM-DD；只有含义不唯一时才追问。',
  ].filter(Boolean).join('\n');
}


function looksLikeJourneyPlanRequest(message: string) {
  return /(创建|规划|安排|计划|做|生成).{0,12}(旅程|行程|路线|徒步|旅行|露营|登山)|帮我.{0,20}(旅程|行程|路线|徒步|旅行|露营|登山)/i.test(message);
}

function hasConcreteOrOpenJourneyDate(message: string) {
  return /(今天|明天|后天|大后天|本周|这周|下周|下个月|周[一二三四五六日天末]|星期[一二三四五六日天]|\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}|\d{1,2}\s*月\s*\d{1,2}\s*[日号]|日期\s*(未定|待定)|待定|暂定|稍后补)/i.test(message);
}

function hasJourneyDuration(message: string) {
  return /(\d+|[一二两三四五六七八九十半]+)\s*(天|日|晚|夜)|day|days|night|nights/i.test(message);
}

function explicitlyAllowsUndatedJourney(message: string) {
  return /(日期|时间|出发|哪天).{0,6}(未定|待定|暂定|稍后补|以后补)|先.{0,6}(未定|待定)|待定日期|日期待定|date\s*(tbd|unknown|later)/i.test(message);
}


type CreateJourneyFlowStep = 'collect_date' | 'collect_duration' | 'collect_date_and_duration' | 'ask_track';
type CreateJourneyFlowState = { step: CreateJourneyFlowStep; originalMessage: string };
type JourneyCreationPreflight =
  | { kind: 'continue' }
  | { kind: Exclude<CreateJourneyFlowStep, 'ask_track'>; message: string; quickReplies: AgentQuickReply[] }
  | { kind: 'ask_track'; message: string; quickReplies: AgentQuickReply[] };

function dateClarificationQuickReplies(locale?: 'zh' | 'en'): AgentQuickReply[] {
  if (locale === 'en') return [
    { label: 'Tomorrow', message: 'Tomorrow' },
    { label: 'This weekend', message: 'This weekend' },
    { label: 'Date TBD', message: 'The date is TBD.' },
  ];
  return [
    { label: '明天', message: '明天出发' },
    { label: '本周末', message: '本周末出发' },
    { label: '日期待定', message: '日期待定' },
  ];
}

function durationClarificationQuickReplies(locale?: 'zh' | 'en'): AgentQuickReply[] {
  if (locale === 'en') return [
    { label: '1 day', message: '1 day' },
    { label: '2 days 1 night', message: '2 days 1 night' },
    { label: '3 days 2 nights', message: '3 days 2 nights' },
  ];
  return [
    { label: '1 天', message: '1 天' },
    { label: '2 天 1 夜', message: '2 天 1 夜' },
    { label: '3 天 2 夜', message: '3 天 2 夜' },
  ];
}

function dateDurationClarificationQuickReplies(locale?: 'zh' | 'en'): AgentQuickReply[] {
  if (locale === 'en') return [
    { label: 'Tomorrow, 1 day', message: 'Tomorrow, 1 day' },
    { label: 'This weekend, 2 days', message: 'This weekend, 2 days 1 night' },
    { label: 'Date TBD, 2 days', message: 'The date is TBD, 2 days 1 night.' },
  ];
  return [
    { label: '明天，1 天', message: '明天出发，1 天' },
    { label: '本周末，2 天', message: '本周末出发，2 天 1 夜' },
    { label: '日期待定，2 天', message: '日期待定，2 天 1 夜' },
  ];
}

function journeyCreationPreflight(message: string, locale?: 'zh' | 'en', intent?: AgentIntent): JourneyCreationPreflight {
  const text = message.trim();
  if (!text) return { kind: 'continue' };
  const createLike = intent === 'plan_journey' || looksLikeJourneyPlanRequest(text);
  if (!createLike) return { kind: 'continue' };

  const hasDate = hasConcreteOrOpenJourneyDate(text) || explicitlyAllowsUndatedJourney(text);
  const hasDuration = hasJourneyDuration(text);
  if (hasDate && hasDuration) return { kind: 'continue' };

  if (!hasDate && !hasDuration) {
    return {
      kind: 'collect_date_and_duration',
      message: locale === 'en'
        ? 'When do you plan to start, and how many days will it be? I’ll ask about a track after these are clear.'
        : '计划什么时候出发？预计几天几夜？确定后，如果还没有轨迹，我再询问是否上传轨迹。',
      quickReplies: dateDurationClarificationQuickReplies(locale),
    };
  }
  if (!hasDate) {
    return {
      kind: 'collect_date',
      message: locale === 'en'
        ? 'When do you plan to start? I’ll ask about a track after the date and duration are clear.'
        : '计划什么时候出发？确定日期后，如果还没有轨迹，我再询问是否上传轨迹。',
      quickReplies: dateClarificationQuickReplies(locale),
    };
  }
  return {
    kind: 'collect_duration',
    message: locale === 'en'
      ? 'How many days will this trip be? I’ll ask about a track after the date and duration are clear.'
      : '这次预计几天几夜？确定天数后，如果还没有轨迹，我再询问是否上传轨迹。',
    quickReplies: durationClarificationQuickReplies(locale),
  };
}


function wantsNoTrack(message: string) {
  return /(不上传|不用上传|暂不上传|没有轨迹|无轨迹|跳过轨迹|不要轨迹|no track|skip track|not now)/i.test(message);
}

function wantsTrackUpload(message: string) {
  return /(上传轨迹|使用轨迹|有轨迹|gpx|kml|kmz|upload track|use track)/i.test(message);
}

function isTrackAttachment(attachment: AgentAttachment) {
  return (
    /\.(gpx|kml|kmz)(?:$|[?#])/i.test(attachment.name)
    || /\.(gpx|kml|kmz)(?:$|[?#])/i.test(attachment.url)
    || /(gpx|google-earth\.(?:kml|kmz)|application\/zip)/i.test(attachment.mimeType)
  );
}

function hasTrackAttachment(attachments: AgentAttachment[]) {
  return attachments.some(isTrackAttachment);
}

function mergeFlowMessage(flow: CreateJourneyFlowState | null, message: string) {
  const current = message.trim();
  if (!flow) return current;
  return `${flow.originalMessage.trim()}，${current}`;
}

function createFlowUi(step: CreateJourneyFlowStep, originalMessage: string) {
  return { createJourneyFlow: { step, originalMessage } };
}

function trackPromptMessage(locale?: 'zh' | 'en') {
  return locale === 'en'
    ? 'Do you want to upload a GPX, KML, or KMZ track for this trip? If not, I’ll continue with a normal plan.'
    : '这个旅程要上传 GPX、KML 或 KMZ 轨迹吗？没有也可以先按普通行程继续。';
}

function trackFileRequiredMessage(locale?: 'zh' | 'en') {
  return locale === 'en'
    ? 'Please choose a GPX, KML, or KMZ file to continue with a track, or tap “No track” to continue without one.'
    : '请先选择要使用的 GPX、KML 或 KMZ 轨迹文件；如果没有轨迹，可以点“暂不上传”继续。';
}


function trackClarificationQuickReplies(locale?: 'zh' | 'en'): AgentQuickReply[] {
  if (locale === 'en') return [
    { label: 'Upload track', message: 'Upload track', action: 'upload_track' },
    { label: 'No track', message: 'No track for now', action: 'skip_track' },
  ];
  return [
    { label: '上传轨迹', message: '上传轨迹', action: 'upload_track' },
    { label: '暂不上传', message: '暂不上传轨迹', action: 'skip_track' },
  ];
}

function shouldStartCreateJourneyFlow(message: string, intent?: AgentIntent) {
  const text = message.trim();
  return Boolean(text) && (intent === 'plan_journey' || looksLikeJourneyPlanRequest(text));
}

function assistantAsksJourneyDate(message: string) {
  return /(什么时候出发|计划.*出发|哪天出发|出发日期|具体日期|补充日期|when do you plan to start|what date)/i.test(message);
}

function assistantAsksJourneyDuration(message: string) {
  return /(几天几夜|几天|多少天|预计.*天|how many days|duration)/i.test(message);
}

function assistantAsksTrack(message: string) {
  return /(上传.*轨迹|轨迹.*上传|GPX|KML|KMZ|upload.*track|track.*upload)/i.test(message);
}

function inferredFlowStepFromAssistant(message: string): CreateJourneyFlowStep | null {
  const asksDate = assistantAsksJourneyDate(message);
  const asksDuration = assistantAsksJourneyDuration(message);
  if (asksDate && asksDuration) return 'collect_date_and_duration';
  if (asksDate) return 'collect_date';
  if (asksDuration) return 'collect_duration';
  if (assistantAsksTrack(message)) return 'ask_track';
  return null;
}

async function latestCreateJourneyFlow(client: any, threadId: string): Promise<CreateJourneyFlowState | null> {
  const result = await client
    .from('agent_messages')
    .select('role,content,ui')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(12);
  if (result.error) throw result.error;
  const messages = result.data || [];
  const latest = messages[0];
  if (latest?.role !== 'assistant') return null;

  const flow = latest?.ui?.createJourneyFlow;
  if (flow && typeof flow === 'object' && typeof flow.originalMessage === 'string') {
    const step = String(flow.step || '');
    if (step === 'collect_date' || step === 'collect_duration' || step === 'collect_date_and_duration' || step === 'ask_track') {
      return { step, originalMessage: flow.originalMessage } as CreateJourneyFlowState;
    }
  }

  // Compatibility for conversations that started before createJourneyFlow UI
  // metadata existed: infer the pending step from the assistant's last question
  // and recover the original create-journey request from recent user messages.
  const inferredStep = inferredFlowStepFromAssistant(String(latest?.content || ''));
  if (!inferredStep) return null;
  const original = messages.find((message) => message.role === 'user' && shouldStartCreateJourneyFlow(String(message.content || ''), undefined));
  return original ? { step: inferredStep, originalMessage: String(original.content || '').trim() } : null;
}

async function persistFlowReply(client: any, threadId: string, userId: string, userText: string, message: string, quickReplies: AgentQuickReply[], flow: CreateJourneyFlowState, extraUi: Partial<AgentMessageUi> = {}, userUi: Partial<AgentMessageUi> = {}) {
  const userMessage = await client.from('agent_messages').insert({
    thread_id: threadId,
    user_id: userId,
    role: 'user',
    content: userText,
    ui: userUi,
  });
  if (userMessage.error) throw userMessage.error;
  const ui: AgentMessageUi = { quickReplies: quickReplies.length ? quickReplies : undefined, ...createFlowUi(flow.step, flow.originalMessage), ...extraUi };
  const assistantMessage = await client.from('agent_messages').insert({
    thread_id: threadId,
    user_id: userId,
    role: 'assistant',
    content: message,
    ui,
  });
  if (assistantMessage.error) throw assistantMessage.error;
  const touchedThread = await client.from('agent_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId);
  if (touchedThread.error) throw touchedThread.error;
  return ui;
}

function requestsUndo(message: string) {
  return /(撤销|撤回|还原|恢复原样|反悔|undo|revert|roll\s*back|take\s+back)/i.test(message);
}

function isValidAssistantAttachmentUrl(url: string, userId: string) {
  try {
    const parsed = new URL(url);
    const marker = '/storage/v1/object/public/kaipa/';
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex < 0) return false;
    const storagePath = decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
    return storagePath.startsWith(`assistant/${userId}/`);
  } catch {
    return false;
  }
}

function validAttachments(value: unknown, userId: string): AgentAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 6).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const attachment = item as Record<string, unknown>;
    const kind = attachment.kind === 'image' || attachment.kind === 'file' ? attachment.kind : undefined;
    const name = typeof attachment.name === 'string' ? attachment.name.trim().slice(0, 160) : '';
    const url = typeof attachment.url === 'string' ? attachment.url : '';
    const mimeType = typeof attachment.mimeType === 'string' ? attachment.mimeType.slice(0, 100) : '';
    if (!kind || !name || !mimeType || !isValidAssistantAttachmentUrl(url, userId)) return [];
    const size = Number(attachment.size);
    return [{ kind, name, url, mimeType, size: Number.isFinite(size) && size >= 0 ? size : undefined }];
  });
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function attachmentInput(attachment: AgentAttachment) {
  if (attachment.kind === 'image') {
    return { type: 'input_image' as const, image: attachment.url, detail: 'auto' };
  }
  const response = await fetch(attachment.url);
  if (!response.ok) throw new Error('Attachment could not be loaded');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 15 * 1024 * 1024) throw new Error('Attachment is too large');
  return {
    type: 'input_file' as const,
    file: `data:${attachment.mimeType};base64,${bytesToBase64(bytes)}`,
    filename: attachment.name,
  };
}

async function messageUiForRun(client: any, runId: string, quickReplies: AgentQuickReply[]): Promise<AgentMessageUi> {
  const calls = await client
    .from('agent_tool_calls')
    .select('tool_name,arguments,output,status,undo_payload,undone_at')
    .eq('run_id', runId)
    .order('created_at');
  if (calls.error) throw calls.error;

  const sourcesByUrl = new Map<string, AgentSource>();
  const completedCalls = (calls.data || []).filter((call: any) => call.status === 'completed');
  for (const call of completedCalls) {
    if (call.tool_name !== 'search_travel_web') continue;
    const results = call.output && typeof call.output === 'object' && Array.isArray(call.output.results)
      ? call.output.results
      : [];
    for (const result of results) {
      if (!result || typeof result !== 'object') continue;
      const title = typeof result.title === 'string' ? result.title : '';
      const url = typeof result.url === 'string' ? result.url : '';
      if (!title || !/^https?:\/\//i.test(url) || sourcesByUrl.has(url)) continue;
      sourcesByUrl.set(url, {
        title,
        url,
        source: typeof result.source === 'string' ? result.source : undefined,
        snippet: typeof result.snippet === 'string' ? result.snippet : undefined,
        publishedAt: typeof result.publishedAt === 'string' ? result.publishedAt : undefined,
      });
    }
  }

  let planPreview: AgentPlanPreview | undefined;
  const itineraryCall = [...completedCalls].reverse().find((call: any) => call.tool_name === 'add_itinerary_items');
  const itineraryArgs = itineraryCall?.arguments && typeof itineraryCall.arguments === 'object' ? itineraryCall.arguments : undefined;
  const journeyId = typeof itineraryArgs?.journeyId === 'string' ? itineraryArgs.journeyId : undefined;
  const items = Array.isArray(itineraryArgs?.items) ? itineraryArgs.items : [];
  if (journeyId && items.length) {
    const journey = await client.from('journeys').select('id,name,planned_date,date,total_days').eq('id', journeyId).maybeSingle();
    if (journey.error) throw journey.error;
    if (journey.data) {
      const grouped = new Map<string, Array<{ title: string; timeStart?: number; timeEnd?: number }>>();
      for (const item of items) {
        if (!item || typeof item !== 'object' || typeof item.day !== 'string' || typeof item.title !== 'string') continue;
        const day = canonicalJourneyDay(item.day);
        const rows = grouped.get(day) || [];
        rows.push({
          title: item.title,
          timeStart: itineraryMinutes(item.timeStart),
          timeEnd: itineraryMinutes(item.timeEnd),
        });
        grouped.set(day, rows);
      }
      planPreview = {
        journeyId,
        title: journey.data.name,
        dateLabel: journey.data.planned_date || journey.data.date || undefined,
        days: [...grouped].map(([label, dayItems]) => ({ label, items: dayItems })),
      };
    }
  }

  const activities: AgentRunActivity[] = (calls.data || []).map((call: any) => ({
    toolName: call.tool_name,
    status: call.status,
    arguments: call.arguments || {},
    // Search output includes result and provider counts used by the client. Other
    // tool payloads can contain large private records and are not message UI.
    output: call.tool_name === 'search_travel_web' ? call.output : undefined,
  }));

  return {
    quickReplies: quickReplies.length ? quickReplies : undefined,
    sources: sourcesByUrl.size ? [...sourcesByUrl.values()].slice(0, 8) : undefined,
    planPreview,
    activities: activities.length ? activities : undefined,
    undoAction: completedCalls.some((call: any) => call.undo_payload && !call.undone_at)
      ? { runId }
      : undefined,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: { code: 'method_not_allowed', message: 'Method not allowed' } }, 405);

  let activeRunId: string | undefined;
  let activeClient: any;
  let activeThreadId: string | undefined;
  let activeUserId: string | undefined;
  let shouldPersistFailure = false;
  try {
    const token = bearerToken(req);
    if (!token) return json({ error: { code: 'unauthorized', message: '请先登录' } }, 401);
    const supabaseUrl = env('SUPABASE_URL');
    const anonKey = env('SUPABASE_ANON_KEY');
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    activeClient = client;
    const { data: { user }, error: userError } = await client.auth.getUser(token);
    if (userError || !user) return json({ error: { code: 'unauthorized', message: '登录状态已失效' } }, 401);
    activeUserId = user.id;

    const body = await req.json().catch(() => ({})) as {
      action?: 'turn' | 'resolve' | 'history' | 'threads' | 'journey_thread' | 'run_activity' | 'delete_thread' | 'undo';
      threadId?: string;
      runId?: string;
      clientRunId?: string;
      message?: string;
      currentJourneyId?: string;
      intent?: AgentIntent;
      locale?: 'zh' | 'en';
      attachments?: AgentAttachment[];
      clientLocalDate?: string;
      clientLocalTime?: string;
      clientTimeZone?: string;
      clientTimestamp?: string;
      decisions?: Array<{ callId: string; approved: boolean }>;
    };

    if (body.action === 'threads') {
      const threads = await client
        .from('agent_threads')
        .select('id,title,current_journey_id,created_at,updated_at,journeys(name,photo_uris)')
        .order('updated_at', { ascending: false })
        .limit(50);
      if (threads.error) throw threads.error;
      return json({ threads: threads.data || [] });
    }

    if (body.action === 'journey_thread') {
      if (!body.currentJourneyId) return json({ error: { code: 'journey_required', message: '请选择旅程' } }, 400);
      const thread = await client
        .from('agent_threads')
        .select('id')
        .eq('current_journey_id', body.currentJourneyId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (thread.error) throw thread.error;
      return json({ threadId: thread.data?.id || null });
    }

    if (body.action === 'run_activity') {
      if (!body.runId) return json({ activities: [] });
      const activities = await client
        .from('agent_tool_calls')
        .select('tool_name,status,arguments,output,created_at')
        .eq('run_id', body.runId)
        .order('created_at');
      if (activities.error) throw activities.error;
      return json({
        activities: (activities.data || []).map((activity: any) => ({
          toolName: activity.tool_name,
          status: activity.status,
          arguments: activity.arguments || {},
          output: activity.output,
        })),
      });
    }

    if (body.action === 'delete_thread') {
      if (!body.threadId) return json({ error: { code: 'thread_required', message: '请选择要删除的对话' } }, 400);
      const deleted = await client.from('agent_threads').delete().eq('id', body.threadId).select('id').maybeSingle();
      if (deleted.error) throw deleted.error;
      if (!deleted.data) return json({ error: { code: 'thread_not_found', message: '对话不存在' } }, 404);
      return json({ deleted: true });
    }

    if (body.action === 'undo') {
      if (!body.runId) return json({ error: { code: 'run_required', message: '请选择要撤销的操作' } }, 400);
      const undone = await client.rpc('undo_agent_run', { target_run_id: body.runId });
      if (undone.error) {
        console.warn('Could not undo agent run', undone.error);
        return json({ error: { code: 'undo_unavailable', message: '这次更改已无法撤销' } }, 409);
      }
      return json(undone.data);
    }

    if (body.action === 'history') {
      if (!body.threadId) return json({ messages: [] });
      const [thread, messages, pending] = await Promise.all([
        client.from('agent_threads').select('id,title,current_journey_id').eq('id', body.threadId).maybeSingle(),
        client.from('agent_messages').select('id,role,content,ui,created_at').eq('thread_id', body.threadId).order('created_at'),
        client.from('agent_runs').select('id,status,pending_approvals').eq('thread_id', body.threadId).eq('status', 'pending_approval').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (thread.error) throw thread.error;
      if (!thread.data) return json({ error: { code: 'thread_not_found', message: '对话不存在' } }, 404);
      if (messages.error) throw messages.error;
      if (pending.error) throw pending.error;
      return json({ thread: thread.data, messages: messages.data || [], pendingRun: pending.data || null });
    }

    const runtime = createAgentRuntime(agentModelConfig(), Boolean(body.currentJourneyId));

    if (body.action === 'resolve') {
      if (!body.runId || !body.decisions?.length) return json({ error: { code: 'invalid_request', message: '审批请求无效' } }, 400);
      const runRecord = await client.from('agent_runs').select('*').eq('id', body.runId).eq('status', 'pending_approval').single();
      if (runRecord.error || !runRecord.data?.state) return json({ error: { code: 'run_not_found', message: '待审批操作已失效' } }, 404);
      activeRunId = body.runId;
      activeThreadId = runRecord.data.thread_id;
      const context: AgentContext = { userId: user.id, threadId: runRecord.data.thread_id, runId: body.runId, currentJourneyId: body.currentJourneyId };
      bindRunClient(body.runId, client);
      const runContext = new runtime.RunContext(context);
      const state = await runtime.RunState.fromStringWithContext(runtime.agent, runRecord.data.state, runContext, { contextStrategy: 'replace' });
      const interruptions = state.getInterruptions();
      const decisions = new Map(body.decisions.map((decision) => [decision.callId, decision.approved]));
      for (const interruption of interruptions) {
        const callId = (interruption.rawItem as { callId?: string })?.callId;
        if (!callId || !decisions.has(callId)) return json({ error: { code: 'decision_required', message: '请处理全部待确认操作' } }, 400);
        if (decisions.get(callId)) state.approve(interruption);
        else state.reject(interruption, { message: '用户拒绝了这项数据修改。' });
      }
      const previousDecisions = Array.isArray(runRecord.data.approval_decisions) ? runRecord.data.approval_decisions : [];
      const claimed = await client.from('agent_runs')
        .update({ status: 'running', approval_decisions: [...previousDecisions, ...body.decisions], pending_approvals: [], updated_at: new Date().toISOString() })
        .eq('id', body.runId)
        .eq('status', 'pending_approval')
        .select('id')
        .maybeSingle();
      if (claimed.error) throw claimed.error;
      if (!claimed.data) return json({ error: { code: 'run_already_resolved', message: '这组操作已经处理，请刷新对话' } }, 409);
      const session = new SupabaseAgentSession(client, context.threadId, user.id);
      shouldPersistFailure = true;
      const result = await runtime.runner.run(runtime.agent, state, { session, maxTurns: 12, toolExecution: { preApprovalInputGuardrails: true } });
      const approvals = toApprovals(result.interruptions || []);
      if (approvals.length) {
        const serialized = result.state.toString();
        await client.from('agent_runs').update({ status: 'pending_approval', state: serialized, pending_approvals: approvals, updated_at: new Date().toISOString() }).eq('id', body.runId);
        const ui = await messageUiForRun(client, body.runId, []);
        return json({ threadId: context.threadId, runId: body.runId, status: 'pending_approval', approvals, ui } satisfies AgentResponse);
      }
      const output = finalMessage(result.finalOutput);
      const message = output.text || '操作已完成。';
      const ui = await messageUiForRun(client, body.runId, output.quickReplies);
      const finalized = await client.rpc('finalize_agent_run', { target_run_id: body.runId, assistant_message: message, message_ui: ui });
      if (finalized.error) throw finalized.error;
      shouldPersistFailure = false;
      return json({ threadId: context.threadId, runId: body.runId, status: 'completed', message, quickReplies: output.quickReplies, ui } satisfies AgentResponse);
    }

    if (body.action !== 'turn' || !body.message?.trim()) return json({ error: { code: 'message_required', message: '请输入内容' } }, 400);
    let threadId = body.threadId;
    if (body.currentJourneyId) {
      const existing = await client
        .from('agent_threads')
        .select('id')
        .eq('current_journey_id', body.currentJourneyId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing.error) throw existing.error;
      // A journey has one active conversation in the product UI. Treat the
      // newest server thread as authoritative so stale devices cannot keep
      // writing to an older thread with the same journey title.
      threadId = existing.data?.id || threadId;
    }
    if (threadId) {
      const thread = await client.from('agent_threads').select('id,current_journey_id').eq('id', threadId).single();
      if (thread.error) return json({ error: { code: 'thread_not_found', message: '对话不存在' } }, 404);
      if (body.currentJourneyId && thread.data.current_journey_id && thread.data.current_journey_id !== body.currentJourneyId) {
        return json({ error: { code: 'journey_thread_mismatch', message: '该会话属于另一个旅程' } }, 409);
      }
      const pending = await client.from('agent_runs').select('id').eq('thread_id', threadId).eq('status', 'pending_approval').limit(1).maybeSingle();
      if (pending.data) return json({ error: { code: 'approval_pending', message: '请先处理待确认操作' } }, 409);
      if (body.currentJourneyId) {
        const updated = await client.from('agent_threads').update({ current_journey_id: body.currentJourneyId }).eq('id', threadId);
        if (updated.error) throw updated.error;
      }
    } else {
      const created = await client.from('agent_threads').insert({ user_id: user.id, current_journey_id: body.currentJourneyId || null, title: body.message.trim().slice(0, 36) }).select('id').single();
      if (created.error) throw created.error;
      threadId = created.data.id;
    }
    if (!threadId) throw new Error('Thread could not be resolved');
    activeThreadId = threadId;

    const attachments = validAttachments(body.attachments, user.id);
    const existingFlow = body.currentJourneyId ? null : await latestCreateJourneyFlow(client, threadId);
    const effectiveMessage = existingFlow ? mergeFlowMessage(existingFlow, body.message.trim()) : body.message.trim();
    const flowActive = Boolean(existingFlow) || shouldStartCreateJourneyFlow(effectiveMessage, body.intent);

    if (flowActive) {
      const preflight = journeyCreationPreflight(effectiveMessage, body.locale, body.intent);
      if (preflight.kind !== 'continue') {
        const ui = await persistFlowReply(
          client,
          threadId,
          user.id,
          body.message.trim(),
          preflight.message,
          preflight.quickReplies,
          { step: preflight.kind, originalMessage: effectiveMessage },
          {},
          attachments.length ? { attachments } : {},
        );
        return json({ threadId, runId: crypto.randomUUID(), status: 'completed', message: preflight.message, quickReplies: preflight.quickReplies, ui } satisfies AgentResponse);
      }

      const hasUploadedTrack = hasTrackAttachment(attachments);
      const skipTrack = wantsNoTrack(effectiveMessage);
      const requestedTrackWithoutFile = wantsTrackUpload(effectiveMessage) && !hasUploadedTrack;
      if (!hasUploadedTrack && !skipTrack) {
        const message = requestedTrackWithoutFile ? trackFileRequiredMessage(body.locale) : trackPromptMessage(body.locale);
        const quickReplies = trackClarificationQuickReplies(body.locale);
        const ui = await persistFlowReply(
          client,
          threadId,
          user.id,
          body.message.trim(),
          message,
          quickReplies,
          { step: 'ask_track', originalMessage: effectiveMessage.replace(/[，,]?\s*(上传轨迹|使用轨迹|有轨迹|upload track|use track)\s*$/i, '') },
          {},
          attachments.length ? { attachments } : {},
        );
        return json({ threadId, runId: crypto.randomUUID(), status: 'completed', message, quickReplies, ui } satisfies AgentResponse);
      }
    }

    const runId = validClientRunId(body.clientRunId) || crypto.randomUUID();
    activeRunId = runId;
    const context: AgentContext = {
      userId: user.id,
      threadId,
      runId,
      currentJourneyId: body.currentJourneyId,
      canUndoPreviousChanges: requestsUndo(effectiveMessage),
      originalUserMessage: effectiveMessage,
      allowUndatedJourney: explicitlyAllowsUndatedJourney(effectiveMessage),
    };
    bindRunClient(runId, client);
    const createdRun = await client.from('agent_runs').insert({ id: runId, thread_id: threadId, user_id: user.id, status: 'running', agent_version: AGENT_VERSION }).select('id').single();
    if (createdRun.error) throw createdRun.error;
    const userMessage = await client.from('agent_messages').insert({
      thread_id: threadId,
      user_id: user.id,
      role: 'user',
      content: body.message.trim(),
      ui: attachments.length ? { attachments } : {},
    });
    if (userMessage.error) throw userMessage.error;
    const touchedThread = await client.from('agent_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId);
    if (touchedThread.error) throw touchedThread.error;

    const session = new SupabaseAgentSession(client, threadId, user.id);
    shouldPersistFailure = true;
    const attachmentInputs = await Promise.all(attachments.map(attachmentInput));
    const temporalContext = agentTemporalContext(body);
    const uploadedTrack = attachments.find(isTrackAttachment);
    const attachmentContext = uploadedTrack
      ? `\n系统附件状态：本轮已成功收到并验证轨迹文件“${uploadedTrack.name}”。不得再次要求用户上传轨迹；创建旅程时必须把“${uploadedTrack.name}”原样传给 create_journey.trackAttachmentName，并继续执行创建和规划流程。`
      : attachments.length
      ? `\n系统附件状态：本轮已成功收到附件：${attachments.map((attachment) => attachment.name).join('、')}。`
      : '';
    const userInputText = `${temporalContext}

用户消息：${effectiveMessage}${attachmentContext}`;
    const agentInput = attachments.length
      ? [{
          role: 'user' as const,
          content: [
            { type: 'input_text' as const, text: userInputText },
            ...attachmentInputs,
          ],
        }]
      : userInputText;
    const result = await runtime.runner.run(runtime.agent, agentInput, { context, session, maxTurns: 12, toolExecution: { preApprovalInputGuardrails: true } });
    const approvals = toApprovals(result.interruptions || []);
    if (approvals.length) {
      const serialized = result.state.toString();
      await client.from('agent_runs').update({ status: 'pending_approval', state: serialized, pending_approvals: approvals, updated_at: new Date().toISOString() }).eq('id', runId);
      const ui = await messageUiForRun(client, runId, []);
      return json({ threadId, runId, status: 'pending_approval', approvals, ui } satisfies AgentResponse);
    }
    const output = finalMessage(result.finalOutput);
    if (!output.quickReplies.length) output.quickReplies = fallbackQuickReplies(body.intent, body.locale);
    const message = output.text || '我已经处理好了。';
    const ui = await messageUiForRun(client, runId, output.quickReplies);
    const finalized = await client.rpc('finalize_agent_run', { target_run_id: runId, assistant_message: message, message_ui: ui });
    if (finalized.error) throw finalized.error;
    shouldPersistFailure = false;
    return json({ threadId, runId, status: 'completed', message, quickReplies: output.quickReplies, ui } satisfies AgentResponse);
  } catch (error) {
    console.error('app-agent failed', error);
    if (activeRunId && activeClient) {
      await activeClient.from('agent_runs').update({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        updated_at: new Date().toISOString(),
      }).eq('id', activeRunId).eq('status', 'running');
    }
    if (shouldPersistFailure && activeClient && activeThreadId && activeUserId) {
      const failedAt = new Date().toISOString();
      await Promise.all([
        activeClient.from('agent_messages').insert({
          thread_id: activeThreadId,
          user_id: activeUserId,
          role: 'assistant',
          content: '这次处理没有完成，请稍后重试。',
          ui: {},
        }),
        activeClient.from('agent_threads').update({ updated_at: failedAt }).eq('id', activeThreadId),
      ]);
    }
    return json({ error: { code: 'agent_failed', message: 'AI 助手暂时不可用，请稍后重试' } }, 500);
  } finally {
    if (activeRunId) releaseRunClient(activeRunId);
  }
});
