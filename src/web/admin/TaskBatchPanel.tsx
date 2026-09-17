import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BellRing, Users } from 'lucide-react-native';
import { AdminTask } from './adminInboxModel';
import { ListSection, RecordItem } from './mockData';
import { eligibleTaskMember } from './taskCollaborationModel';
import { BatchPick, batchSkipReason, TaskBatchCommand } from './taskBatchModel';

type Props = { kind: TaskBatchCommand['kind']; picks: BatchPick[]; tasks: AdminTask[]; records: Record<ListSection, RecordItem[]>; onCancel: () => void; onCommit: (command: TaskBatchCommand) => string | null; onDirtyChange: (dirty: boolean) => void };
export function TaskBatchPanel({ kind, picks, tasks, records, onCancel, onCommit, onDirtyChange }: Props) {
  const [assignee, setAssignee] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [timestamp, setTimestamp] = useState(Date.now);
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { backRef.current?.closest('.drawer')?.scrollTo({ top: 0 }); backRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => { const timer = setInterval(() => setTimestamp(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const dirty = Boolean(assignee || text);
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  const rows = picks.map(pick => {
    const task = tasks.find(task => task.id === pick.id);
    const skip = !task || (task.revision ?? 0) !== pick.revision ? '任务已变化，请重新选择' : kind === 'assign' && !assignee ? '待选择负责人' : batchSkipReason(task, kind, assignee, records, timestamp);
    return { task, pick, skip };
  });
  const ready = rows.filter(row => !row.skip).length;
  const label = kind === 'assign' ? '批量分配' : '逾期提醒';
  return <div className="task-batch-panel"><button ref={backRef} className="link" onClick={() => { if (!dirty || window.confirm('放弃未提交的批量操作？')) onCancel(); }}><ArrowLeft size={16} color="currentColor" />返回待办列表</button>
    <h2>{label}</h2><p>{kind === 'assign' ? '仅调整负责人，保留原有计划；新负责人会从协作者中移除。' : '仅向逾期任务负责人写入模拟通知，同一任务 24 小时内不重复提醒。'}</p>
    <form onSubmit={event => { event.preventDefault(); setError(onCommit(kind === 'assign' ? { kind, picks, assignee, text } : { kind, picks, text }) ?? ''); }}>
      {kind === 'assign' && <label className="form-field"><span>批量负责人</span><select aria-label="批量负责人" required value={assignee} onChange={event => setAssignee(event.target.value)}><option value="">请选择负责人</option>{records.admins.map(admin => <option key={admin.id} value={admin.id} disabled={!eligibleTaskMember(admin)}>{admin.name}{!eligibleTaskMember(admin) ? '（不可分配）' : ''}</option>)}</select></label>}
      <section className="account-section"><div className="section-head"><h3>执行预览</h3><small>{ready} 项执行，{rows.length - ready} 项跳过</small></div><ul className="batch-preview">{rows.map(({ task, pick, skip }) => <li key={pick.id}><strong>{task?.title ?? pick.id}</strong><p>{skip ? `跳过：${skip}` : kind === 'assign' ? `${records.admins.find(admin => admin.id === task?.assignee)?.name ?? '未分配'} → ${records.admins.find(admin => admin.id === assignee)?.name}` : `提醒：${records.admins.find(admin => admin.id === task?.assignee)?.name}`}</p></li>)}</ul></section>
      <label className="form-field"><span>{kind === 'assign' ? '批量分配说明' : '提醒内容'}</span><textarea required maxLength={1000} value={text} onChange={event => setText(event.target.value)} /></label>{error && <p className="field-error" role="alert">{error}</p>}<div className="drawer-actions"><button type="submit" className="primary" disabled={!ready || !text.trim()}>{kind === 'assign' ? <Users size={16} color="currentColor" /> : <BellRing size={16} color="currentColor" />}确认{label}</button></div>
    </form>
  </div>;
}
