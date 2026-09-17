import React, { useState } from 'react';
import { ArrowUpRight, History, Pencil, RotateCcw, Trash2 } from 'lucide-react-native';
import { RecordItem, ResourceSection, ResourceSnapshot } from './mockData';
import { fieldLabels } from './adminModules';
import { resourceDiff, resourceRelease, validateSnapshot } from './resourceVersions';
import { Badge } from './AdminTable';

export type VersionCommand = { kind: 'publish' | 'discard' | 'rollback' | 'online'; revision: number; note: string; version?: number };
function Diff({ before, after }: { before?: ResourceSnapshot; after: ResourceSnapshot }) {
  const differences = resourceDiff(before, after, fieldLabels);
  return <section className="version-diff"><div className="section-head"><h3>内容差异</h3><small>{differences.length} 项变更</small></div>{differences.length === 0 ? <div className="empty">内容与当前版本一致</div> : <><div className="diff-heading"><span>当前发布内容</span><span>目标内容</span></div>{differences.map(diff => <div className="diff-field" key={diff.key}><h4>{diff.label}</h4><div className="diff-values">{[diff.before, diff.after].map((value, index) => <div key={index} className={index === 0 ? 'diff-before' : 'diff-after'}>{diff.image && value ? <img src={value} alt={index === 0 ? '当前封面' : '目标封面'} /> : <p>{value || '未设置'}</p>}</div>)}</div></div>)}</>}</section>;
}

export function ResourceVersionsPanel({ record, section, onEdit, onCommit }: { record: RecordItem; section: ResourceSection; onEdit: () => void; onCommit: (command: VersionCommand) => boolean }) {
  const release = resourceRelease(record);
  const latest = release.versions.at(-1);
  const [tab, setTab] = useState(release.draft ? 'draft' : 'history');
  const [selectedNumber, setSelectedNumber] = useState(latest?.number ?? 0);
  const [pending, setPending] = useState<Omit<VersionCommand, 'note'> | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const selected = release.versions.find(version => version.number === selectedNumber) ?? latest;
  const problems = release.draft ? validateSnapshot(section, release.draft) : [];
  const unchanged = Boolean(latest && release.draft && resourceDiff(latest.snapshot, release.draft, fieldLabels).length === 0);
  const begin = (kind: VersionCommand['kind'], version?: number) => { setPending({ kind, version, revision: release.revision }); setNote(''); setError(''); };
  const labels = { publish: '发布', discard: '放弃草稿', rollback: '回滚', online: '重新上架' };
  const pendingSnapshot = pending?.kind === 'rollback' ? release.versions.find(version => version.number === pending.version)?.snapshot : release.draft;
  return <div className="version-panel">
    <div className="release-summary"><div><h2>{record.name}</h2><div className="row"><Badge status={record.status} /><span>{latest ? `当前发布版本 v${latest.number}` : '尚未发布'}</span>{release.draft && <span className="badge warn">待发布草稿</span>}</div></div><button onClick={onEdit}><Pencil size={15} color="currentColor" />{release.draft ? '编辑草稿' : '创建修订草稿'}</button></div>
    <div className="status-tabs" role="group" aria-label="版本视图"><button className={tab === 'draft' ? 'active' : ''} aria-pressed={tab === 'draft'} onClick={() => { setTab('draft'); setPending(null); }}>待发布草稿</button><button className={tab === 'history' ? 'active' : ''} aria-pressed={tab === 'history'} onClick={() => { setTab('history'); setPending(null); }}>发布历史<span className="tab-count">{release.versions.length}</span></button></div>
    {tab === 'draft' && <>{release.draft ? <>
      <div className="release-note">{latest ? '草稿尚未发布，当前发布内容保持不变。' : '首次发布后将生成 v1。'}</div>
      <Diff before={latest?.snapshot} after={release.draft} />
      {problems.length > 0 && <p className="field-error" role="alert">草稿未通过校验：{problems.join('；')}</p>}
      {!pending && <div className="drawer-actions">{latest && <button className="danger" onClick={() => begin('discard')}><Trash2 size={15} color="currentColor" />放弃草稿</button>}<button className="primary" disabled={problems.length > 0 || unchanged} onClick={() => begin('publish')}><ArrowUpRight size={15} color="currentColor" />{latest ? '发布草稿' : '发布'}</button></div>}
    </> : <div className="empty"><Pencil size={24} color="currentColor" /><p>暂无待发布草稿</p><button onClick={onEdit}>创建修订草稿</button></div>}</>}
    {tab === 'history' && <>{latest ? <div className="version-history-layout"><div className="version-list">{[...release.versions].reverse().map(version => <button key={version.number} className={selected?.number === version.number ? 'active' : ''} aria-pressed={selected?.number === version.number} onClick={() => { setSelectedNumber(version.number); setPending(null); }}><span><strong>v{version.number}</strong>{version.number === latest.number && <small>当前版本</small>}{version.restoredFrom && <small>回滚自 v{version.restoredFrom}</small>}</span><small>{version.date}</small><span>{version.note}</span><small>{version.author}</small></button>)}</div><div className="version-inspect">{selected && <><h3>v{selected.number}</h3><p>{selected.note}</p><Diff before={latest.snapshot} after={selected.snapshot} />{selected.number !== latest.number && <><button className="danger" disabled={Boolean(release.draft) || record.status !== '已发布'} onClick={() => begin('rollback', selected.number)}><RotateCcw size={15} color="currentColor" />回滚到 v{selected.number}</button>{release.draft && <p className="release-note">存在待发布草稿，请先发布或放弃草稿。</p>}{record.status !== '已发布' && <p className="release-note">资源已下架，不能直接回滚上线。</p>}</>}</>}</div></div> : <div className="empty"><History size={24} color="currentColor" /><p>暂无发布历史</p></div>}{record.status === '已下架' && !release.draft && !pending && <button className="primary" onClick={() => begin('online')}>重新上架</button>}</>}
    {pending && <form className="confirmation release-confirmation" onSubmit={event => { event.preventDefault(); if (!note.trim()) { setError('请填写操作说明。'); return; } if (onCommit({ ...pending, note: note.trim() })) { setPending(null); setNote(''); if (pending.kind !== 'discard') { setTab('history'); setSelectedNumber((latest?.number ?? 0) + (pending.kind === 'online' ? 0 : 1)); } } }}>
      <h3>确认{labels[pending.kind]}？</h3><p>{pending.kind === 'rollback' ? `将 v${pending.version} 的内容发布为 v${(latest?.number ?? 0) + 1}，历史版本保留。` : pending.kind === 'discard' ? '仅移除待发布草稿，不改变当前发布版本。' : pending.kind === 'online' ? `重新上架当前 v${latest?.number}，不创建新版本。` : `即将发布 v${(latest?.number ?? 0) + 1}。`}</p>
      {pending.kind === 'rollback' && pendingSnapshot && <Diff before={latest?.snapshot} after={pendingSnapshot} />}
      <label className="form-field"><span>{pending.kind === 'publish' ? '发布说明' : '操作原因'}</span><textarea required maxLength={1000} value={note} onChange={event => setNote(event.target.value)} /></label>{error && <p role="alert" className="field-error">{error}</p>}<div className="drawer-actions"><button type="button" onClick={() => setPending(null)}>取消</button><button type="submit" className={pending.kind === 'discard' || pending.kind === 'rollback' ? 'danger' : 'primary'} disabled={!note.trim()}>确认{labels[pending.kind]}</button></div>
    </form>}
  </div>;
}
