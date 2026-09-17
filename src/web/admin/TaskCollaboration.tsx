import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ChevronLeft, MessageSquare, Save } from 'lucide-react-native';
import { AdminTask, resolveTask } from './adminInboxModel';
import { ListSection, RecordItem } from './mockData';
import { eligibleTaskMember, TaskCommand, taskSettings } from './taskCollaborationModel';

type Props = { task: AdminTask; records: Record<ListSection, RecordItem[]>; onBack: () => void; onOpen: () => void; onCommit: (command: TaskCommand) => string | null; onDirtyChange: (dirty: boolean) => void };
export function TaskCollaboration({ task, records, onBack, onOpen, onCommit, onDirtyChange }: Props) {
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    backRef.current?.closest('.drawer')?.scrollTo({ top: 0 });
    backRef.current?.focus({ preventScroll: true });
  }, []);
  const [draft, setDraft] = useState(() => taskSettings(task));
  const [revision, setRevision] = useState(task.revision ?? 0);
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const { status, record } = resolveTask(task, records);
  const changed = JSON.stringify(draft) !== JSON.stringify(taskSettings(task));
  const dirty = changed || Boolean(reason || comment);
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  const leave = (action: () => void) => { if (!dirty || window.confirm('放弃未保存的任务设置与留言？')) action(); };
  const commit = (command: TaskCommand) => {
    const message = onCommit(command);
    setError(message ?? '');
    if (message) return;
    setRevision(revision + 1); setSaved(command.kind === 'update' ? '任务分配已保存' : '留言已添加');
    if (command.kind === 'update') setReason(''); else setComment('');
  };
  const locked = status === '已完成' || !record;
  return <div className="task-collaboration">
    <button ref={backRef} className="link" onClick={() => leave(onBack)}><ChevronLeft size={16} color="currentColor" />返回待办列表</button>
    <h2>{task.title}</h2><div className="row"><span className={`badge ${status === '已完成' ? 'good' : 'info'}`}>{status}</span><small>{task.id}</small></div>
    <div className="account-setting"><div><strong>{record?.name ?? '关联记录不可用'}</strong><p>业务状态：{record?.status ?? '不可用'}</p></div><button className="link" disabled={!record} onClick={() => leave(onOpen)}>查看业务记录<ArrowUpRight size={16} color="currentColor" /></button></div>
    <form onSubmit={event => { event.preventDefault(); commit({ kind: 'update', revision, value: draft, text: reason }); }}>
      <section className="account-section"><h3>分配与计划</h3><fieldset disabled={locked} className="task-fields"><label className="form-field"><span>负责人</span><select aria-label="负责人" value={draft.assignee} onChange={event => { const assignee = event.target.value; setDraft({ ...draft, assignee, collaborators: draft.collaborators.filter(id => id !== assignee) }); }}><option value="">未分配</option>{records.admins.map(admin => <option key={admin.id} value={admin.id} disabled={!eligibleTaskMember(admin)}>{admin.name}{!eligibleTaskMember(admin) ? `（${admin.status === '正常' ? admin.category : admin.status}）` : ''}</option>)}</select></label>
      <fieldset className="task-members"><legend>协作者</legend>{records.admins.filter(admin => admin.id !== draft.assignee).map(admin => <label key={admin.id}><input type="checkbox" disabled={!eligibleTaskMember(admin) && !draft.collaborators.includes(admin.id)} checked={draft.collaborators.includes(admin.id)} onChange={event => setDraft({ ...draft, collaborators: (event.target.checked ? [...draft.collaborators, admin.id] : draft.collaborators.filter(id => id !== admin.id)).sort() })} />{admin.name}<small>{admin.status === '正常' ? admin.category : admin.status}</small></label>)}</fieldset>
      <div className="task-plan"><label className="form-field"><span>优先级</span><select aria-label="优先级" value={draft.priority} onChange={event => setDraft({ ...draft, priority: event.target.value as AdminTask['priority'] })}><option>普通</option><option>高</option></select></label><label className="form-field"><span>截止时间（UTC）</span><input type="datetime-local" required value={draft.due.replace(' ', 'T')} onChange={event => setDraft({ ...draft, due: event.target.value.replace('T', ' ') })} /></label></div>
      <label className="form-field"><span>分配或变更说明</span><textarea maxLength={1000} required value={reason} onChange={event => setReason(event.target.value)} /></label><div className="drawer-actions"><button type="button" disabled={!changed && !reason} onClick={() => { setDraft(taskSettings(task)); setRevision(task.revision ?? 0); setReason(''); setError(''); }}>放弃设置修改</button><button className="primary" type="submit" disabled={!changed || !reason.trim()}><Save size={15} color="currentColor" />保存分配</button></div></fieldset>{locked && <p className="release-note">{record ? '任务已完成，分配与计划已锁定。' : '关联记录不可用，无法变更任务。'}</p>}</section>
    </form>
    <section className="account-section"><h3><MessageSquare size={16} color="currentColor" />协作记录<span className="badge">{task.events?.length ?? 0}</span></h3>
      {!task.events?.length && <p>暂无协作记录</p>}
      <ol className="task-events">{[...(task.events ?? [])].reverse().map(event => <li key={event.id}><div className="inbox-item-head"><strong>{event.author}</strong><small>{event.kind === 'update' ? '更新任务' : event.kind === 'reminder' ? '逾期提醒' : '留言'}</small><time>{event.date} UTC</time></div>{event.changes.map(change => <p key={change}>{change}</p>)}<p className="task-event-text">{event.text}</p>{event.recipients.length > 0 && <small>模拟通知对象：{event.recipients.join('、')}</small>}</li>)}</ol>
      <form onSubmit={event => { event.preventDefault(); commit({ kind: 'comment', revision, text: comment }); }}><label className="form-field"><span>协作留言</span><textarea required maxLength={1000} disabled={!record} value={comment} onChange={event => setComment(event.target.value)} /></label><button type="submit" disabled={!record || !comment.trim()}><MessageSquare size={15} color="currentColor" />添加留言</button></form>
    </section>{error && <p className="field-error" role="alert">{error}</p>}{saved && <p className="account-feedback" role="status">{saved}</p>}
  </div>;
}
