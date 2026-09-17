import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ClipboardList, Rows3, Search, X } from 'lucide-react-native';
import { ModuleDefinition } from './adminModules';
import { RecordItem } from './mockData';
import { resourceRelease } from './resourceVersions';
import { AccountPreferences } from './AdminAccount';

export function Badge({ status }: { status: string }) {
  const tone = ['正常', '成功', '已通过', '已完成', '已发布', '已解决', '已处理'].includes(status) ? 'good'
    : ['失败', '已停用', '已驳回', '已下架', '已撤回'].includes(status) ? 'bad'
    : ['待审核', '待处理', '告警'].includes(status) ? 'warn' : 'info';
  return <span className={`badge ${tone}`}><i className="status-dot" />{status}</span>;
}

export function Metadata({ value }: { value: string }) {
  return <span className="metadata">{value.split(' · ').map(part => <span key={part}>{part}</span>)}</span>;
}

export function exportRecords(rows: RecordItem[], module: ModuleDefinition) {
  const cells = [['编号', module.entity, module.owner, module.category, '时间', '状态'], ...rows.map(item => [item.id, item.name, item.owner, item.category, item.date, item.status])];
  // Quoting alone does not prevent spreadsheet formula execution.
  const csv = '\uFEFF' + cells.map(row => row.map(value => `"${(/^[=+@\-\t\r]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a'); link.href = url; link.download = `kaipa-${module.title}-mock.csv`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type Props = {
  module: ModuleDefinition; records: RecordItem[]; initialFilter: string; initialQuery?: string; resourceVersions?: boolean;
  preferences?: AccountPreferences;
  onOpen: (item: RecordItem, rows: RecordItem[]) => void;
  onExport: (rows: RecordItem[]) => void;
};

export function AdminTable({ module, records, initialFilter, initialQuery = '', resourceVersions = false, preferences, onOpen, onExport }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState(initialFilter);
  const [ascending, setAscending] = useState(false);
  const [compact, setCompact] = useState(preferences?.compact ?? false);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(preferences?.pageSize ?? 10);
  useEffect(() => { setCompact(preferences?.compact ?? false); }, [preferences?.compact]);
  useEffect(() => { setSize(preferences?.pageSize ?? 10); setPage(1); }, [preferences?.pageSize]);
  const rows = records.filter(item => `${item.name} ${item.owner} ${item.id}`.toLowerCase().includes(query.trim().toLowerCase()) && (filter === '全部状态' || item.status === filter))
    .sort((a, b) => ascending ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const currentPage = Math.min(page, pages);
  const visible = rows.slice((currentPage - 1) * size, currentPage * size);
  const clear = () => { setQuery(''); setFilter('全部状态'); setPage(1); };
  return <section className={`table-section ${compact ? 'compact' : ''}`}>
    <div className="section-head"><div className="row"><h2>{module.entity}列表</h2><span className="badge">{records.length}</span></div><button className="link" onClick={() => onExport(rows)}>导出当前结果</button></div>
    <div className="status-tabs" role="group" aria-label="筛选状态">{['全部状态', ...module.statuses].map(status => <button key={status} aria-pressed={filter === status} className={filter === status ? 'active' : ''} onClick={() => { setFilter(status); setPage(1); }}>{status === '全部状态' ? '全部' : status}<span className="tab-count">{status === '全部状态' ? records.length : records.filter(item => item.status === status).length}</span></button>)}</div>
    <div className="filters"><div className="row"><div className="search"><Search size={16} color="currentColor" /><input aria-label="搜索记录" placeholder={`搜索${module.entity}、${module.owner}或编号`} value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} />{query && <button className="icon-button" title="清空搜索" aria-label="清空搜索" onClick={() => { setQuery(''); setPage(1); }}><X size={14} color="currentColor" /></button>}</div><button className={`icon-button density ${compact ? 'active' : ''}`} title="紧凑行距" aria-label="紧凑行距" aria-pressed={compact} onClick={() => setCompact(!compact)}><Rows3 size={16} color="currentColor" /></button>{(query || filter !== '全部状态') && <button className="link" onClick={clear}>重置</button>}</div><span className="filter-summary">找到 {rows.length} 条记录</span></div>
    <div className="table-wrap"><table><thead><tr><th>{module.entity}</th><th>{module.owner}</th><th>{module.category}</th><th>状态</th><th aria-sort={ascending ? 'ascending' : 'descending'}><button className="sort" title="切换时间排序" onClick={() => { setAscending(!ascending); setPage(1); }}>最近更新{ascending ? <ArrowUp size={13} color="currentColor" /> : <ArrowDown size={13} color="currentColor" />}</button></th><th>操作</th></tr></thead><tbody>{visible.map(item => <tr key={item.id}>
      <td><div className="entity">{item.image ? <img src={item.image} alt={item.name} /> : <span className="avatar">{item.name.slice(0, 1)}</span>}<div><button className="entity-title" onClick={() => onOpen(item, rows)}>{item.name}</button><small className="record-summary"><Metadata value={item.detail || item.id} /></small></div></div></td><td>{item.owner}</td><td>{item.category}</td><td><Badge status={item.status} />{resourceVersions && <small className="resource-version-label">{resourceRelease(item).versions.length ? `v${resourceRelease(item).versions.at(-1)?.number}` : '未发布'}{resourceRelease(item).draft && '　待发布草稿'}</small>}</td><td><time dateTime={item.date.replace(' ', 'T')}>{item.date.slice(5)}</time></td><td><button className="link" onClick={() => onOpen(item, rows)}>查看<ChevronRight size={13} color="currentColor" /></button></td>
    </tr>)}</tbody></table>{rows.length === 0 && <div className="empty"><ClipboardList size={28} color="currentColor" /><p>没有符合条件的记录</p>{(query || filter !== '全部状态') && <button onClick={clear}>清除筛选</button>}</div>}</div>
    <div className="table-footer"><span>共 {rows.length} 条记录</span><div className="row"><select aria-label="每页条数" value={size} onChange={event => { setSize(Number(event.target.value)); setPage(1); }}>{[5, 10, 20].map(value => <option key={value} value={value}>{value} 条 / 页</option>)}</select><button className="icon-button" aria-label="上一页" title="上一页" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={14} color="currentColor" /></button><span>{currentPage} / {pages}</span><button className="icon-button" aria-label="下一页" title="下一页" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={14} color="currentColor" /></button></div></div>
  </section>;
}
