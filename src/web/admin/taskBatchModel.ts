import { AdminNotice, AdminTask, isTaskOverdue, resolveTask } from './adminInboxModel';
import { ListSection, RecordItem } from './mockData';
import { eligibleTaskMember, taskSettings, updateTask } from './taskCollaborationModel';

export type BatchPick = { id: string; revision: number };
export type TaskBatchCommand = { picks: BatchPick[]; text: string } & ({ kind: 'assign'; assignee: string } | { kind: 'remind' });
export function lastTaskReminder(task: AdminTask) { return task.events?.filter(event => event.kind === 'reminder').at(-1); }
const utcTimestamp = (date: string) => Date.parse(`${date.replace(' ', 'T')}Z`);

export function batchSkipReason(task: AdminTask, kind: TaskBatchCommand['kind'], assignee: string, records: Record<ListSection, RecordItem[]>, timestamp: number): string | null {
  const { status, record } = resolveTask(task, records);
  if (!record) return '关联记录不可用';
  if (status === '已完成') return '任务已完成';
  if (kind === 'assign') return task.assignee === assignee ? '负责人未变化' : null;
  if (!isTaskOverdue(task, status, timestamp)) return '尚未逾期';
  if (!task.assignee) return '尚未分配负责人';
  if (!records.admins.some(admin => admin.id === task.assignee && eligibleTaskMember(admin))) return '负责人不可接收提醒';
  const last = lastTaskReminder(task);
  if (last && timestamp - utcTimestamp(last.date) < 24 * 60 * 60 * 1000) return '24 小时内已提醒';
  return null;
}

// Build all changes before returning so a validation failure cannot partially apply a batch.
export function applyTaskBatch(tasks: AdminTask[], command: TaskBatchCommand, records: Record<ListSection, RecordItem[]>, actorId: string, date: string, id: () => string) {
  if (!command.picks.length || new Set(command.picks.map(pick => pick.id)).size !== command.picks.length) throw new Error('请选择不重复的任务。');
  const actor = records.admins.find(admin => admin.id === actorId);
  if (!actor || !eligibleTaskMember(actor)) throw new Error('当前成员不可执行此操作。');
  const text = command.text.trim();
  if (!text || text.length > 1000) throw new Error('请填写 1 至 1000 字的操作说明。');
  const timestamp = utcTimestamp(date);
  if (!Number.isFinite(timestamp)) throw new Error('操作时间无效。');
  if (command.kind === 'assign' && !records.admins.some(admin => admin.id === command.assignee && eligibleTaskMember(admin))) throw new Error('请选择正常且非只读的负责人。');
  const changed: AdminTask[] = [];
  const skipped: { id: string; reason: string }[] = [];
  const notices: AdminNotice[] = [];
  for (const pick of command.picks) {
    const task = tasks.find(item => item.id === pick.id);
    if (!task || (task.revision ?? 0) !== pick.revision) throw new Error('任务已变化，请取消后重新选择。');
    const skip = batchSkipReason(task, command.kind, command.kind === 'assign' ? command.assignee : '', records, timestamp);
    if (skip) { skipped.push({ id: task.id, reason: skip }); continue; }
    let next: AdminTask;
    let recipients: string[];
    if (command.kind === 'assign') {
      next = updateTask(task, { kind: 'update', revision: pick.revision, text, value: { ...taskSettings(task), assignee: command.assignee, collaborators: (task.collaborators ?? []).filter(member => member !== command.assignee) } }, records, actorId, date, id());
      recipients = [...new Set([task.assignee, ...(task.collaborators ?? []), next.assignee, ...(next.collaborators ?? [])])].filter(member => member && member !== actorId && records.admins.some(admin => admin.id === member && admin.status === '正常'));
    } else {
      recipients = [task.assignee];
      next = { ...task, revision: (task.revision ?? 0) + 1, events: [...(task.events ?? []), { id: id(), author: actor.name, date, kind: 'reminder', text, changes: [`截止时间：${task.due} UTC`], recipients: recipients.map(member => records.admins.find(admin => admin.id === member)!.name) }] };
    }
    changed.push(next);
    notices.push(...recipients.map(recipient => ({ id: id(), recipient, title: `${task.title}：${command.kind === 'assign' ? '分配已更新' : '逾期提醒'}`, body: `${actor.name}：${text}`, category: command.kind === 'assign' ? '任务分配' as const : '逾期提醒' as const, date, read: false, target: task.target })));
  }
  if (!changed.length) throw new Error('没有可执行的任务，请检查预览。');
  return { tasks: tasks.map(task => changed.find(next => next.id === task.id) ?? task), changed, skipped, notices };
}
