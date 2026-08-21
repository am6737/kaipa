// @ts-ignore Deno npm specifier
import type { AgentInputItem, Session } from 'npm:@openai/agents@0.16.1';

type Client = any;

export class SupabaseAgentSession implements Session {
  constructor(
    private readonly client: Client,
    private readonly threadId: string,
    private readonly userId: string,
  ) {}

  async getSessionId() { return this.threadId; }

  async getItems(limit?: number): Promise<AgentInputItem[]> {
    let query = this.client.from('agent_session_items').select('item').eq('thread_id', this.threadId);
    if (limit == null) {
      const { data, error } = await query.order('id', { ascending: true });
      if (error) throw error;
      return (data || []).map((row: { item: AgentInputItem }) => row.item);
    }
    if (limit <= 0) return [];
    const { data, error } = await query.order('id', { ascending: false }).limit(limit);
    if (error) throw error;
    return (data || []).reverse().map((row: { item: AgentInputItem }) => row.item);
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
    return data.item as AgentInputItem;
  }

  async clearSession() {
    const { error } = await this.client.from('agent_session_items').delete().eq('thread_id', this.threadId);
    if (error) throw error;
  }
}
