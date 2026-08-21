declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };

// @ts-ignore Deno npm specifier
import { createClient } from 'npm:@supabase/supabase-js@2.108.1';
import { AGENT_VERSION, createAgentRuntime } from './agent.ts';
import { SupabaseAgentSession } from './session.ts';
import { bindRunClient, releaseRunClient } from './tools.ts';
import type { AgentContext, AgentIntent, AgentMessageUi, AgentPlanPreview, AgentQuickReply, AgentResponse, AgentRunActivity, AgentSource, PendingApproval } from './types.ts';
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
  if (toolName === 'create_journey') return { title: `创建旅程「${String(args.name || '')}」`, detail: `${Number(args.days || 1)} 天  ${String(args.region || '')}`.trim() };
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
    return label && message ? [{ label, message }] : [];
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

async function messageUiForRun(client: any, runId: string, quickReplies: AgentQuickReply[]): Promise<AgentMessageUi> {
  const calls = await client
    .from('agent_tool_calls')
    .select('tool_name,arguments,output,status')
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
      action?: 'turn' | 'resolve' | 'history' | 'threads' | 'journey_thread' | 'run_activity' | 'delete_thread';
      threadId?: string;
      runId?: string;
      clientRunId?: string;
      message?: string;
      currentJourneyId?: string;
      intent?: AgentIntent;
      locale?: 'zh' | 'en';
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
      await Promise.all([
        client.from('agent_runs').update({ status: 'completed', state: null, final_output: message, pending_approvals: [], updated_at: new Date().toISOString() }).eq('id', body.runId),
        client.from('agent_messages').insert({ thread_id: context.threadId, user_id: user.id, role: 'assistant', content: message, ui }),
        client.from('agent_threads').update({ updated_at: new Date().toISOString() }).eq('id', context.threadId),
      ]);
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

    const runId = validClientRunId(body.clientRunId) || crypto.randomUUID();
    activeRunId = runId;
    const context: AgentContext = { userId: user.id, threadId, runId, currentJourneyId: body.currentJourneyId };
    bindRunClient(runId, client);
    const createdRun = await client.from('agent_runs').insert({ id: runId, thread_id: threadId, user_id: user.id, status: 'running', agent_version: AGENT_VERSION }).select('id').single();
    if (createdRun.error) throw createdRun.error;
    const userMessage = await client.from('agent_messages').insert({ thread_id: threadId, user_id: user.id, role: 'user', content: body.message.trim() });
    if (userMessage.error) throw userMessage.error;
    const touchedThread = await client.from('agent_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId);
    if (touchedThread.error) throw touchedThread.error;

    const session = new SupabaseAgentSession(client, threadId, user.id);
    shouldPersistFailure = true;
    const result = await runtime.runner.run(runtime.agent, body.message.trim(), { context, session, maxTurns: 12, toolExecution: { preApprovalInputGuardrails: true } });
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
    await Promise.all([
      client.from('agent_runs').update({ status: 'completed', final_output: message, updated_at: new Date().toISOString() }).eq('id', runId),
      client.from('agent_messages').insert({ thread_id: threadId, user_id: user.id, role: 'assistant', content: message, ui }),
      client.from('agent_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId),
    ]);
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
