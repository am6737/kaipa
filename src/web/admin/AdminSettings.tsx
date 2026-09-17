import React, { useState } from 'react';
import { Save } from 'lucide-react-native';

export const defaultSettings = { appName: 'Kaipa', contact: 'support@example.com', registration: true, publicSharing: true, reviewRequired: true, aiEnabled: true, dailyLimit: 30, timeout: 30, retention: 30 };
export type AdminSettingsValue = typeof defaultSettings;
export const permissionLabels = ['查看业务数据', '导出业务数据', '维护公共资源', '审核内容与举报', '处理用户反馈', '发布通知公告', '管理 AI 配置', '管理成员与权限'] as const;
export const defaultRoles: Record<string, boolean[]> = {
  '超级管理员': permissionLabels.map(() => true),
  '运营管理员': [true, true, true, false, true, true, false, false],
  '内容审核员': [true, false, false, true, true, false, false, false],
  '只读观察员': [true, false, false, false, false, false, false, false],
};

export function AdminSettings({ value, onSave }: { value: AdminSettingsValue; onSave: (next: AdminSettingsValue) => void }) {
  const [draft, setDraft] = useState(value);
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);
  return <form className="settings-page" onSubmit={event => { event.preventDefault(); if (draft.appName.trim()) onSave({ ...draft, appName: draft.appName.trim(), contact: draft.contact.trim() }); }}>
    <section className="settings-section"><div><h2>基础信息</h2><small>应用与联系信息</small></div><div className="settings-fields">
      <label className="form-field"><span>应用名称</span><input value={draft.appName} required pattern=".*\S.*" maxLength={40} onChange={event => setDraft({ ...draft, appName: event.target.value })} /></label>
      <label className="form-field"><span>支持邮箱</span><input type="email" required value={draft.contact} onChange={event => setDraft({ ...draft, contact: event.target.value })} /></label>
      <label className="switch-row"><span>开放新用户注册</span><input type="checkbox" role="switch" checked={draft.registration} onChange={event => setDraft({ ...draft, registration: event.target.checked })} /></label>
    </div></section>
    <section className="settings-section"><div><h2>内容与隐私</h2><small>公开分享与日志留存</small></div><div className="settings-fields">
      <label className="switch-row"><span>允许公开分享</span><input type="checkbox" role="switch" checked={draft.publicSharing} onChange={event => setDraft({ ...draft, publicSharing: event.target.checked })} /></label>
      <label className="switch-row"><span>公开内容发布前审核</span><input type="checkbox" role="switch" checked={draft.reviewRequired} onChange={event => setDraft({ ...draft, reviewRequired: event.target.checked })} /></label>
      <label className="form-field"><span>AI 日志保留天数</span><input type="number" min={7} max={365} required value={draft.retention} onChange={event => setDraft({ ...draft, retention: Number(event.target.value) })} /></label>
    </div></section>
    <section className="settings-section"><div><h2>AI 服务</h2><small>使用额度与执行限制</small></div><div className="settings-fields">
      <label className="switch-row"><span>启用 AI 助手</span><input type="checkbox" role="switch" checked={draft.aiEnabled} onChange={event => setDraft({ ...draft, aiEnabled: event.target.checked })} /></label>
      <label className="form-field"><span>每位用户每日请求上限</span><input type="number" min={1} max={1000} required value={draft.dailyLimit} onChange={event => setDraft({ ...draft, dailyLimit: Number(event.target.value) })} /></label>
      <label className="form-field"><span>请求超时（秒）</span><input type="number" min={5} max={120} required value={draft.timeout} onChange={event => setDraft({ ...draft, timeout: Number(event.target.value) })} /></label>
    </div></section>
    <div className="settings-save"><small>{dirty ? '有未保存的修改' : '所有修改已保存'}</small><div className="row"><button type="button" disabled={!dirty} onClick={() => setDraft(value)}>放弃修改</button><button type="submit" className="primary" disabled={!dirty}><Save size={15} color="currentColor" />保存配置</button></div></div>
  </form>;
}

export function AdminRoles({ value, onSave }: { value: Record<string, boolean[]>; onSave: (next: Record<string, boolean[]>) => void }) {
  const [role, setRole] = useState('运营管理员');
  const [draft, setDraft] = useState(value);
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);
  return <section className="roles-page">
    <div className="status-tabs" role="group" aria-label="选择角色">{Object.keys(value).map(name => <button key={name} className={role === name ? 'active' : ''} aria-pressed={role === name} onClick={() => setRole(name)}>{name}</button>)}</div>
    <div className="section-head"><h2>{role}</h2><span className="badge">{draft[role].filter(Boolean).length} 项权限</span></div>
    <div className="permission-grid">{permissionLabels.map((label, index) => <label className="permission-row" key={label}><span>{label}</span><input type="checkbox" checked={draft[role][index]} disabled={role === '超级管理员'} onChange={event => setDraft({ ...draft, [role]: draft[role].map((checked, i) => i === index ? event.target.checked : checked) })} /></label>)}</div>
    <div className="settings-save"><small>{dirty ? '有未保存的修改' : '所有修改已保存'}</small><div className="row"><button disabled={!dirty} onClick={() => setDraft(value)}>放弃修改</button><button className="primary" disabled={!dirty} onClick={() => onSave(draft)}><Save size={15} color="currentColor" />保存权限</button></div></div>
  </section>;
}
