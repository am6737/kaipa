import React, { useEffect, useState } from 'react';
import { ArrowUpRight, Bell, BellRing, CheckCheck, ClipboardList, Mail, MailOpen, Search, Users } from 'lucide-react-native';
import { ListSection, RecordItem } from './mockData';
import { modules } from './adminModules';
import { AdminNotice, AdminTask, InboxTarget, isTaskOverdue, resolveTask } from './adminInboxModel';
import { TaskCollaboration } from './TaskCollaboration';
import { TaskCommand } from './taskCollaborationModel';
import { BatchPick, lastTaskReminder, TaskBatchCommand } from './taskBatchModel';
import { TaskBatchPanel } from './TaskBatchPanel';

export type InboxView = 'notices' | 'tasks';
type Props = { initialView: InboxView; name: string; notices: AdminNotice[]; tasks: AdminTask[]; records: Record<ListSection, RecordItem[]>; onRead: (id?: string, read?: boolean) => void; onOpen: (target: InboxTarget, view: InboxView) => void; onTask: (id: string, command: TaskCommand) => string | null; onBatch: (command: TaskBatchCommand) => string | null; onDirtyChange: (dirty: boolean) => void };
export function AdminInbox({ initialView, name, notices, tasks: allTasks, records, onRead, onOpen, onTask, onBatch, onDirtyChange }: Props) {
  const [view, setView] = useState(initialView);
  const [filter, setFilter] = useState('全部');
  const [category, setCategory] = useState('全部类型');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [scope, setScope] = useState('我负责');
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [batch, setBatch] = useState<{ kind: TaskBatchCommand['kind']; picks: BatchPick[] } | null>(null);
  const [timestamp, setTimestamp] = useState(Date.now);
  useEffect(() => { setChecked([]); }, [view, scope, filter, category, query]);
  useEffect(() => { const timer = setInterval(() => setTimestamp(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const tasks = allTasks.map(task => ({ ...task, ...resolveTask(task, records) }));
  const unread = notices.filter(notice => !notice.read).length;
  const remaining = tasks.filter(task => task.assignee === 'A-001' && ['待处理', '处理中'].includes(task.status)).length;
  const switchView = (next: InboxView) => { setView(next); setFilter('全部'); setCategory('全部类型'); setQuery(''); setExpanded(null); };
  const matches = (value: string) => value.toLowerCase().includes(query.trim().toLowerCase());
  const visibleNotices = notices.filter(notice => (filter === '全部' || (filter === '未读' ? !notice.read : notice.read)) && (category === '全部类型' || category === notice.category) && matches(`${notice.title} ${notice.body}`));
  const visibleTasks = tasks.filter(task => (scope === '团队全部' || (scope === '我负责' ? task.assignee === 'A-001' : scope === '我协作' ? task.collaborators?.includes('A-001') : !task.assignee)) && (filter === '全部' || (filter === '已逾期' ? isTaskOverdue(task, task.status) : task.status === filter)) && (category === '全部类型' || category === task.target.section) && matches(`${task.title} ${task.record?.name ?? ''} ${task.target.id}`)).sort((a, b) => Number(a.status === '已完成') - Number(b.status === '已完成') || Number(b.priority === '高') - Number(a.priority === '高') || a.due.localeCompare(b.due));
  const activeTask = allTasks.find(task => task.id === selectedTask);
  const selectable = visibleTasks.filter(task => ['待处理', '处理中'].includes(task.status));
  const selectedIds = checked.filter(id => selectable.some(task => task.id === id));
  const overdueCount = visibleTasks.filter(task => isTaskOverdue(task, task.status, timestamp)).length;
  const beginBatch = (kind: TaskBatchCommand['kind']) => setBatch({ kind, picks: allTasks.filter(task => selectedIds.includes(task.id)).map(task => ({ id: task.id, revision: task.revision ?? 0 })) });
  if (batch) return <TaskBatchPanel kind={batch.kind} picks={batch.picks} tasks={allTasks} records={records} onCancel={() => setBatch(null)} onDirtyChange={onDirtyChange} onCommit={command => { const error = onBatch(command); if (!error) { setBatch(null); setChecked([]); } return error; }} />;
  if (activeTask) return <TaskCollaboration key={activeTask.id} task={activeTask} records={records} onBack={() => setSelectedTask(null)} onOpen={() => onOpen(activeTask.target, 'tasks')} onCommit={command => onTask(activeTask.id, command)} onDirtyChange={onDirtyChange} />;
  return <div className="inbox-panel">
    <div className="inbox-heading"><h2>{name}</h2><div className="row"><span>{unread} 条未读</span><span>{remaining} 项待办</span></div></div>
    <div className="status-tabs" role="group" aria-label="个人工作视图"><button aria-pressed={view === 'notices'} className={view === 'notices' ? 'active' : ''} onClick={() => switchView('notices')}><Bell size={16} color="currentColor" />通知中心<span className="tab-count">{unread}</span></button><button aria-pressed={view === 'tasks'} className={view === 'tasks' ? 'active' : ''} onClick={() => switchView('tasks')}><ClipboardList size={16} color="currentColor" />我的待办<span className="tab-count">{remaining}</span></button></div>
    {view === 'tasks' && <div className="segmented task-scope" role="group" aria-label="待办范围">{['我负责', '我协作', '团队全部', '未分配'].map(value => <button key={value} aria-pressed={scope === value} className={scope === value ? 'active' : ''} onClick={() => setScope(value)}>{value}</button>)}</div>}
    <div className="inbox-toolbar"><div className="search"><Search size={16} color="currentColor" /><input aria-label="搜索通知与待办" placeholder={view === 'notices' ? '搜索通知' : '搜索待办或记录编号'} value={query} onChange={event => setQuery(event.target.value)} /></div><div className="inbox-filters"><select aria-label="工作项状态" value={filter} onChange={event => setFilter(event.target.value)}>{(view === 'notices' ? ['全部', '未读', '已读'] : ['全部', '待处理', '处理中', '已逾期', '已完成', '关联记录不可用']).map(value => <option key={value}>{value}</option>)}</select><select aria-label="工作项类型" value={category} onChange={event => setCategory(event.target.value)}>{(view === 'notices' ? [['全部类型', '全部类型'], ['任务分配', '任务分配'], ['系统提醒', '系统提醒'], ['逾期提醒', '逾期提醒']] : [['全部类型', '全部类型'], ['content', '内容审核'], ['reports', '举报处理'], ['feedback', '用户反馈'], ['routes', '资源发布']]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{view === 'notices' && <button className="link" disabled={!unread} onClick={() => onRead()}><CheckCheck size={16} color="currentColor" />全部已读</button>}</div></div>
    {view === 'tasks' && <div className="task-bulk-tools"><div className="section-head"><label className="batch-check"><input type="checkbox" aria-label="全选当前可处理任务" disabled={!selectable.length} checked={selectable.length > 0 && selectedIds.length === selectable.length} ref={element => { if (element) element.indeterminate = selectedIds.length > 0 && selectedIds.length < selectable.length; }} onChange={event => setChecked(event.target.checked ? selectable.map(task => task.id) : [])} />已选 {selectedIds.length} 项</label><button className="link" onClick={() => setFilter('已逾期')}>已逾期 {overdueCount} 项</button></div><div className="row"><button disabled={!selectedIds.length} onClick={() => beginBatch('assign')}><Users size={15} color="currentColor" />批量分配</button><button disabled={!selectedIds.length} onClick={() => beginBatch('remind')}><BellRing size={15} color="currentColor" />提醒逾期负责人</button></div></div>}
    {view === 'notices' ? <div className="inbox-list">{visibleNotices.map(notice => <article key={notice.id} className={`inbox-item ${notice.read ? '' : 'unread'}`} aria-label={notice.title}>
      <div className="inbox-item-head"><span className={`badge ${notice.read ? '' : 'info'}`}>{notice.read ? '已读' : '未读'}</span><small>{notice.category}</small><time>{notice.date} UTC</time></div>
      <button className="inbox-title" aria-expanded={expanded === notice.id} onClick={() => { setExpanded(expanded === notice.id ? null : notice.id); onRead(notice.id, true); }}>{notice.title}</button>
      {expanded === notice.id && <p className="inbox-body">{notice.body}</p>}
      <div className="inbox-actions"><button className="icon-button" title={notice.read ? '标为未读' : '标为已读'} aria-label={notice.read ? '标为未读' : '标为已读'} onClick={() => onRead(notice.id, !notice.read)}>{notice.read ? <Mail size={16} color="currentColor" /> : <MailOpen size={16} color="currentColor" />}</button>{notice.target && <button className="link" onClick={() => { onRead(notice.id, true); onOpen(notice.target!, view); }}>查看关联记录<ArrowUpRight size={15} color="currentColor" /></button>}</div>
    </article>)}</div> : <div className="inbox-list">{visibleTasks.map(task => <article key={task.id} className="inbox-item" aria-label={task.title}>
      <div className="inbox-item-head"><input type="checkbox" aria-label={`选择${task.title}`} disabled={!selectable.some(item => item.id === task.id)} checked={selectedIds.includes(task.id)} onChange={event => setChecked(previous => event.target.checked ? [...previous, task.id] : previous.filter(id => id !== task.id))} /><span className={`badge ${task.status === '已完成' ? 'good' : 'info'}`}>{task.status}</span><span className={`badge ${task.priority === '高' ? 'warn' : ''}`}>{task.priority === '高' ? '高优先级' : '普通'}</span><small>{modules[task.target.section].title}</small></div>
      <h3>{task.title}</h3><p>{task.record?.name ?? task.target.id}</p><div className="inbox-task-meta"><span className={isTaskOverdue(task, task.status) ? 'overdue' : ''}>{isTaskOverdue(task, task.status) ? '已逾期' : '截止'} {task.due} UTC</span><span>负责人：{records.admins.find(admin => admin.id === task.assignee)?.name ?? '未分配'}</span>{Boolean(task.collaborators?.length) && <span>协作者：{task.collaborators?.map(id => records.admins.find(admin => admin.id === id)?.name ?? id).join('、')}</span>}</div>
      {lastTaskReminder(task) && <small className="task-reminder-time">最近提醒：{lastTaskReminder(task)!.date} UTC</small>}
      <div className="inbox-actions"><button className="link" onClick={() => setSelectedTask(task.id)}>分配与协作</button><button className="link" disabled={!task.record} onClick={() => onOpen(task.target, view)}>{task.status === '已完成' ? '查看处理结果' : '去处理'}<ArrowUpRight size={15} color="currentColor" /></button></div>
    </article>)}</div>}
    {(view === 'notices' ? visibleNotices.length : visibleTasks.length) === 0 && <div className="empty"><CheckCheck size={28} color="currentColor" /><p>{view === 'notices' ? '暂无符合条件的通知' : '暂无符合条件的待办'}</p><button onClick={() => { setFilter('全部'); setCategory('全部类型'); setQuery(''); }}>清除筛选</button></div>}
  </div>;
}
