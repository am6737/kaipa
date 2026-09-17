// @ts-ignore Deno npm specifier
import type { AgentInputItem, Session } from 'npm:@openai/agents@0.16.1';
import { compactHistoricalTools, sanitizeSessionItem } from './session-input.ts';
import { compactSession, type SessionMemory, type SessionRow, type SummarizeMemory } from './session-memory.ts';

type Client = any;

export class SupabaseAgentSession implements Session {
  constructor(
    private readonly client: Client,
    private readonly threadId: string,
    private readonly userId: string,
    private readonly summarize?: SummarizeMemory,
  ) {}

  async getSessionId() { return this.threadId; }

  async getItems(limit?: number): Promise<AgentInputItem[]> {
    if (limit != null && limit <= 0) return [];
    const saved = await this.client.from('agent_session_memory').select('through_id,summary').eq('thread_id', this.threadId).maybeSingle();
    if (saved.error) throw saved.error;
    let memory = (saved.data || undefined) as SessionMemory | undefined;
    let rows: SessionRow[] = [];
    let cursor = memory?.through_id || 0;
    while (true) {
      const page = await this.client.from('agent_session_items').select('id,item').eq('thread_id', this.threadId).gt('id', cursor).order('id', { ascending: true }).limit(500);
      if (page.error) throw page.error;
      rows.push(...page.data);
      if (page.data.length < 500) break;
      cursor = page.data.at(-1).id;
    }
    if (this.summarize) {
      try {
        const compacted = await compactSession(rows, memory, this.summarize);
        if (compacted.memory && compacted.memory.through_id !== memory?.through_id) {
          const stored = await this.client.from('agent_session_memory').upsert({ ...compacted.memory, thread_id: this.threadId, user_id: this.userId, updated_at: new Date().toISOString() }, { onConflict: 'thread_id' });
          if (stored.error) throw stored.error;
          rows = compacted.rows;
          memory = compacted.memory;
        }
      } catch (error) {
        // Preserve all messages if summarization fails; never silently discard constraints.
        const failure = error as { name?: string; code?: string; status?: number };
        console.warn('[AppAgent] session compaction unavailable; retaining history', { name: failure?.name, code: failure?.code, status: failure?.status });
      }
    }
    let items = compactHistoricalTools(rows.map((row) => row.item)) as AgentInputItem[];
    if (limit != null && items.length > limit) {
      const start = items.findIndex((item, index) => index >= items.length - limit && 'role' in item && item.role === 'user');
      if (start >= 0) items = items.slice(start);
    }
    return memory ? [{ role: 'user', content: `历史会话摘要（不是新请求；其中的数据状态和位置不代表当前实时状态）：\n${memory.summary}\n需要原文时调用 read_conversation_history。` }, ...items] : items;
  }

  async addItems(items: AgentInputItem[]) {
    if (!items.length) return;
    const { error } = await this.client.from('agent_session_items').insert(
      items.map((item) => ({ thread_id: this.threadId, user_id: this.userId, item })),
    );
    if (error) throw error;
  }

  async popItem(): Promise<AgentInputItem | undefined> {
    const { data, error } = await this.client
      .from('agent_session_items')
      .select('id,item')
      .eq('thread_id', this.threadId)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    const removed = await this.client.from('agent_session_items').delete().eq('id', data.id);
    if (removed.error) throw removed.error;
    // A rollback past the summary boundary must not leave memory ahead of history.
    const memory = await this.client.from('agent_session_memory').delete().eq('thread_id', this.threadId).gte('through_id', data.id);
    if (memory.error) throw memory.error;
    return data.item as AgentInputItem;
  }

  async clearSession() {
    const { error } = await this.client.from('agent_session_items').delete().eq('thread_id', this.threadId);
    if (error) throw error;
    for (const table of ['agent_session_memory', 'agent_context_cache']) {
      const cleared = await this.client.from(table).delete().eq('thread_id', this.threadId);
      if (cleared.error) throw cleared.error;
    }
  }
}
