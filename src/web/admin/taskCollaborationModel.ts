import { AdminTask, resolveTask, TaskEvent } from './adminInboxModel';
import { ListSection, RecordItem } from './mockData';

export type TaskUpdate = Pick<AdminTask, 'assignee' | 'priority' | 'due'> & { collaborators: string[] };
export type TaskCommand = { revision: number; text: string } & ({ kind: 'comment' } | { kind: 'update'; value: TaskUpdate });
export const taskSettings = (task: AdminTask): TaskUpdate => ({ assignee: task.assignee, priority: task.priority, due: task.due, collaborators: [...(task.collaborators ?? [])].sort() });
export const eligibleTaskMember = (admin: RecordItem) => admin.status === '正常' && admin.category !== '只读观察员';

export function updateTask(task: AdminTask, command: TaskCommand, records: Record<ListSection, RecordItem[]>, actorId: string, date: string, eventId: string): AdminTask {
  if ((task.revision ?? 0) !== command.revision) throw new Error('任务已更新，请重新打开后操作。');
  const actor = records.admins.find(admin => admin.id === actorId);
  if (!actor || !eligibleTaskMember(actor)) throw new Error('当前成员不可执行此操作。');
  if (!resolveTask(task, records).record) throw new Error('关联记录不可用。');
  const text = command.text.trim();
  if (!text || text.length > 1000) throw new Error('请填写 1 至 1000 字的说明。');
  const memberName = (id: string) => records.admins.find(admin => admin.id === id)?.name ?? (id || '未分配');
  let next = task;
  const changes: string[] = [];
  if (command.kind === 'update') {
    if (resolveTask(task, records).status === '已完成') throw new Error('已完成任务不能更改分配。');
    const value = { ...command.value, collaborators: [...new Set(command.value.collaborators)].sort() };
    for (const id of [value.assignee, ...value.collaborators].filter(Boolean)) {
      if (!records.admins.some(admin => admin.id === id && eligibleTaskMember(admin))) throw new Error('只能选择正常且非只读的管理员。');
    }
    if (value.collaborators.includes(value.assignee)) throw new Error('负责人不能同时作为协作者。');
    if (!['高', '普通'].includes(value.priority)) throw new Error('请选择有效优先级。');
    const stamp = Date.parse(`${value.due.replace(' ', 'T')}:00Z`);
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value.due) || !Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 16).replace('T', ' ') !== value.due) throw new Error('请填写有效的 UTC 截止时间。');
    if (value.assignee !== task.assignee) changes.push(`负责人：${memberName(task.assignee)} → ${memberName(value.assignee)}`);
    if (value.priority !== task.priority) changes.push(`优先级：${task.priority} → ${value.priority}`);
    if (value.due !== task.due) changes.push(`截止时间：${task.due} → ${value.due} UTC`);
    if (JSON.stringify(value.collaborators) !== JSON.stringify(taskSettings(task).collaborators)) changes.push(`协作者：${(task.collaborators ?? []).map(memberName).join('、') || '无'} → ${value.collaborators.map(memberName).join('、') || '无'}`);
    if (!changes.length) throw new Error('任务设置没有变化。');
    next = { ...task, ...value };
  }
  const recipients = [...new Set([task.assignee, ...(task.collaborators ?? []), next.assignee, ...(next.collaborators ?? [])])].filter(id => id && id !== actorId && records.admins.some(admin => admin.id === id && admin.status === '正常'));
  const event: TaskEvent = { id: eventId, author: actor.name, date, kind: command.kind, text, changes, recipients: recipients.map(memberName) };
  return { ...next, revision: (task.revision ?? 0) + 1, events: [...(task.events ?? []), event] };
}
