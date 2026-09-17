import { ListSection, RecordItem } from './mockData';
import { resourceRelease } from './resourceVersions';

export type InboxTarget = { section: ListSection; id: string };
export type AdminNotice = { id: string; title: string; body: string; category: '任务分配' | '系统提醒' | '逾期提醒'; date: string; read: boolean; target?: InboxTarget; recipient?: string };
export type TaskEvent = { id: string; author: string; date: string; kind: 'update' | 'comment' | 'reminder'; text: string; changes: string[]; recipients: string[] };
export type AdminTask = { id: string; title: string; assignee: string; priority: '高' | '普通'; due: string; target: InboxTarget; kind: 'review' | 'report' | 'feedback' | 'publish'; collaborators?: string[]; revision?: number; events?: TaskEvent[] };
export const initialNotices: AdminNotice[] = [
  { id: 'IN-101', title: '隐私举报需要优先处理', body: '小林将公开照片隐私举报分配给你，请核实举报证据并记录处理结论。', category: '任务分配', date: '2026-09-07 09:20', read: false, target: { section: 'reports', id: 'RP-102' } },
  { id: 'IN-102', title: '新的内容审核待办', body: '装备分享已提交审核，等待你检查公开内容。', category: '任务分配', date: '2026-09-07 09:05', read: false, target: { section: 'content', id: 'C-809' } },
  { id: 'IN-103', title: 'AI 服务出现上游超时', body: '最近一次检查发现上游超时，请查看服务状态与关联执行记录。', category: '系统提醒', date: '2026-09-07 08:50', read: false, target: { section: 'services', id: 'S-103' } },
  { id: 'IN-104', title: '路线草稿等待发布', body: '莫干山竹林环线已加入你的发布待办，请核对路线内容后发布。', category: '任务分配', date: '2026-09-06 16:30', read: true, target: { section: 'routes', id: 'R-102' } },
  { id: 'IN-105', title: '每日备份已完成', body: '本次示例备份已完成，保留周期为 7 天。', category: '系统提醒', date: '2026-09-06 03:02', read: true, target: { section: 'services', id: 'S-104' } },
];
export const assignedTasks: AdminTask[] = [
  { id: 'TK-101', title: '核实公开照片隐私举报', assignee: 'A-001', priority: '高', due: '2026-09-07 12:00', target: { section: 'reports', id: 'RP-102' }, kind: 'report' },
  { id: 'TK-102', title: '审核重装徒步装备分享', assignee: 'A-001', priority: '普通', due: '2026-09-07 18:00', target: { section: 'content', id: 'C-809' }, kind: 'review' },
  { id: 'TK-103', title: '跟进轨迹里程反馈', assignee: 'A-001', priority: '高', due: '2026-09-06 18:00', target: { section: 'feedback', id: 'F-101' }, kind: 'feedback' },
  { id: 'TK-104', title: '核对并发布莫干山路线', assignee: 'A-001', priority: '普通', due: '2026-09-08 18:00', target: { section: 'routes', id: 'R-102' }, kind: 'publish' },
  { id: 'TK-105', title: '确认邀请链接问题恢复', assignee: 'A-001', priority: '普通', due: '2026-09-06 18:00', target: { section: 'feedback', id: 'F-103' }, kind: 'feedback' },
  { id: 'TK-106', title: '审核山野照片分享', assignee: 'A-002', priority: '普通', due: '2026-09-07 18:00', target: { section: 'content', id: 'C-808' }, kind: 'review' },
  { id: 'TK-107', title: '核实路线分享广告举报', assignee: '', priority: '普通', due: '2026-09-08 18:00', target: { section: 'reports', id: 'RP-101' }, kind: 'report' },
];
export function resolveTask(task: AdminTask, records: Record<ListSection, RecordItem[]>) {
  const record = records[task.target.section].find(item => item.id === task.target.id);
  if (!record) return { status: '关联记录不可用', record };
  const completed = task.kind === 'review' ? ['已通过', '已驳回', '已下架'].includes(record.status)
    : task.kind === 'report' ? ['已处理', '已驳回'].includes(record.status)
      : task.kind === 'feedback' ? record.status === '已解决' : resourceRelease(record).versions.length > 0;
  return { status: completed ? '已完成' : record.status === '处理中' ? '处理中' : '待处理', record };
}
export function isTaskOverdue(task: AdminTask, status: string, timestamp = Date.now()) {
  return ['待处理', '处理中'].includes(status) && Date.parse(`${task.due.replace(' ', 'T')}:00Z`) < timestamp;
}
