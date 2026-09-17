import React, { useState } from 'react';
import { Activity, ArrowRight, ChevronRight, Flag, Mountain, ShieldCheck, Sparkles, Users } from 'lucide-react-native';
import { ListSection, RecordItem, Section } from './mockData';
import { TrendChart } from './TrendChart';
import { Badge } from './AdminTable';

export function AdminOverview({ records, period, navigate }: { records: Record<ListSection, RecordItem[]>; period: string; navigate: (section: Section, filter?: string, query?: string) => void }) {
  const [metric, setMetric] = useState('新增用户');
  const totals = period === '7' ? ['12,486', '1,284', '386', '8,592'] : ['12,486', '4,826', '1,402', '32,618'];
  const points = period === '7' ? [45, 62, 51, 76, 60, 86, 96] : [36, 52, 40, 65, 57, 70, 62, 84, 76, 91];
  const pending = records.content.filter(item => item.status === '待审核').length;
  const reports = records.reports.filter(item => item.status === '待处理').length;
  const failed = records.ai.filter(item => item.status === '失败').length;
  return <>
    <div className="metrics">{['累计用户', '活跃用户', '新增行程', 'AI 调用次数'].map((label, index) => { const Icon = [Users, Activity, Mountain, Sparkles][index]; return <div className="metric" key={label}><div className="metric-label">{label}<Icon size={16} color="currentColor" /></div><strong>{totals[index]}</strong><span className="positive">↑ {['12.8', '8.2', '18.6', '24.3'][index]}%</span><small>较上一周期</small></div>; })}</div>
    <div className="analytics"><section><div className="section-head"><h2>增长趋势</h2><div className="segmented" role="group" aria-label="趋势指标">{['新增用户', '新增行程'].map(label => <button key={label} className={metric === label ? 'active' : ''} aria-pressed={metric === label} onClick={() => setMetric(label)}>{label}</button>)}</div></div><div className="legend"><i />{metric}<span>{period === '7' ? '08.31 - 09.06' : '08.08 - 09.06'}</span></div><TrendChart key={`${period}-${metric}`} period={period} metric={metric} points={points} /></section>
    <section className="tasks"><div className="section-head"><h2>待办事项</h2><small>今日</small></div>{[
      { label: '内容待审核', detail: `${pending} 条公开分享等待处理`, icon: ShieldCheck, target: 'content' as Section, status: '待审核' },
      { label: '待处理举报', detail: `${reports} 条举报等待处理`, icon: Flag, target: 'reports' as Section, status: '待处理' },
      { label: 'AI 异常请求', detail: `${failed} 条请求执行失败`, icon: Sparkles, target: 'ai' as Section, status: '失败' },
    ].map(({ label, detail, icon: Icon, target, status }) => <button className="task" key={label} onClick={() => navigate(target, status)}><span className="task-label"><span className="task-icon"><Icon size={17} color="currentColor" /></span><span>{label}<small>{detail}</small></span></span><ChevronRight size={16} color="currentColor" /></button>)}</section></div>
    <div className="overview-bottom"><section className="table-section"><div className="section-head"><h2>最近行程</h2><button className="link" onClick={() => navigate('journeys')}>查看全部<ArrowRight size={14} color="currentColor" /></button></div>{records.journeys.slice(0, 3).map(item => <button key={item.id} className="overview-record" onClick={() => navigate('journeys', '全部状态', item.id)}><img src={item.image} alt={item.name} /><span><strong>{item.name}</strong><small>{item.owner}</small></span><Badge status={item.status} /><ChevronRight size={14} color="currentColor" /></button>)}</section>
    <section className="table-section"><div className="section-head"><h2>最近操作</h2><button className="link" onClick={() => navigate('audit')}>操作日志<ArrowRight size={14} color="currentColor" /></button></div>{records.audit.slice(0, 3).map(item => <div className="audit-preview" key={item.id}><span className="audit-dot" /><div><strong>{item.name}</strong><small>{item.detail}</small></div><time>{item.date.slice(11, 16)}</time></div>)}</section></div>
  </>;
}
