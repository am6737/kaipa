import React, { useEffect, useState } from 'react';
import { Laptop, LogOut, Monitor, Moon, Save, ShieldCheck, Smartphone, Sun, UserRound } from 'lucide-react-native';
import { useAppearance } from '../../theme/AppearanceContext';

export type AccountPreferences = { compact: boolean; pageSize: number };
export const defaultAccountPreferences: AccountPreferences = { compact: false, pageSize: 10 };
export type AccountSecurity = { mfa: boolean; otherSession: boolean; passwordRequested: boolean };
export const defaultAccountSecurity: AccountSecurity = { mfa: false, otherSession: true, passwordRequested: false };

type Props = {
  name: string; email: string; role: string;
  preferences: AccountPreferences; security: AccountSecurity;
  onProfile: (name: string) => void;
  onPreferences: (value: AccountPreferences) => void;
  onSecurity: (value: AccountSecurity, action: string) => void;
  onLogout: () => void; onDirtyChange: (dirty: boolean) => void;
};

export function AdminAccount({ name, email, role, preferences, security, onProfile, onPreferences, onSecurity, onLogout, onDirtyChange }: Props) {
  const { mode, setMode } = useAppearance();
  const [tab, setTab] = useState('profile');
  const [draftName, setDraftName] = useState(name);
  const [feedback, setFeedback] = useState('');
  const [pending, setPending] = useState<'password' | 'mfa' | 'session' | 'logout' | null>(null);
  const dirty = draftName !== name;
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  const switchTab = (next: string) => {
    if (dirty && !window.confirm('放弃未保存的个人资料？')) return;
    setDraftName(name); setTab(next); setPending(null); setFeedback('');
  };
  const confirm = () => {
    if (pending === 'logout') { onLogout(); return; }
    if (pending === 'password') onSecurity({ ...security, passwordRequested: true }, '模拟重置密码');
    if (pending === 'mfa') onSecurity({ ...security, mfa: !security.mfa }, security.mfa ? '模拟关闭双重验证' : '模拟开启双重验证');
    if (pending === 'session') onSecurity({ ...security, otherSession: false }, '模拟撤销其他会话');
    setPending(null); setFeedback('模拟账户状态已更新');
  };
  const confirmation = pending === 'logout' ? ['退出登录', '退出当前模拟会话？本次编辑数据保留，刷新后恢复示例。']
    : pending === 'password' ? ['模拟重置密码', `将记录 ${email} 的模拟重置请求，不发送邮件，也不修改密码。`]
      : pending === 'mfa' ? [security.mfa ? '模拟关闭双重验证' : '模拟开启双重验证', '仅改变示例安全状态，不绑定验证器，也不提供真实账户保护。']
        : ['撤销其他会话', '移除这台示例设备的会话，当前模拟会话不受影响。'];
  return <div className="account-panel">
    <div className="account-identity"><span className="avatar">{name.slice(0, 1)}</span><div><h2>{name}</h2><p>{email}</p><span className="badge">{role}</span></div></div>
    <div className="status-tabs" role="tablist" aria-label="账户设置分类">{[['profile', '个人资料'], ['security', '账户安全'], ['preferences', '偏好设置']].map(([id, label]) => <button key={id} id={`account-tab-${id}`} role="tab" aria-selected={tab === id} aria-controls="account-content" className={tab === id ? 'active' : ''} onClick={() => switchTab(id)}>{label}</button>)}</div>
    <div id="account-content" role="tabpanel" aria-labelledby={`account-tab-${tab}`}>
      {tab === 'profile' && <form onSubmit={event => { event.preventDefault(); if (!draftName.trim()) return; onProfile(draftName.trim()); setDraftName(draftName.trim()); setFeedback('个人资料已保存'); }}>
        <section className="account-section"><h3><UserRound size={17} color="currentColor" />基本资料</h3><label className="form-field"><span>显示名称</span><input required maxLength={32} value={draftName} onChange={event => setDraftName(event.target.value)} /></label><dl className="properties"><div className="property"><dt>登录邮箱</dt><dd>{email}</dd></div><div className="property"><dt>管理员编号</dt><dd>A-001</dd></div><div className="property"><dt>所属角色</dt><dd>{role}</dd></div><div className="property"><dt>账户状态</dt><dd><span className="badge good">正常</span></dd></div></dl></section>
        <div className="drawer-actions"><button type="button" disabled={!dirty} onClick={() => { setDraftName(name); setFeedback(''); }}>放弃修改</button><button className="primary" type="submit" disabled={!dirty || !draftName.trim()}><Save size={15} color="currentColor" />保存个人资料</button></div>
      </form>}
      {tab === 'security' && <>
        <section className="account-section"><h3><ShieldCheck size={17} color="currentColor" />安全验证<span className="badge">MOCK</span></h3><div className="account-setting"><div><strong>登录密码</strong><p>{security.passwordRequested ? '已记录模拟重置请求' : '最近更新于 2026-09-01'}</p></div><button disabled={security.passwordRequested} onClick={() => setPending('password')}>模拟重置密码</button></div><div className="account-setting"><div><strong>双重验证</strong><p>{security.mfa ? '模拟状态：已开启' : '模拟状态：未开启'}</p></div><button role="switch" aria-label="模拟双重验证" aria-checked={security.mfa} className={`account-switch ${security.mfa ? 'active' : ''}`} onClick={() => setPending('mfa')}><span /></button></div></section>
        <section className="account-section"><h3>登录设备<span className="badge">{security.otherSession ? 2 : 1}</span></h3><div className="account-setting"><Laptop size={20} color="currentColor" /><div><strong>Chrome / macOS</strong><p>示例设备 A　最近活跃：刚刚</p></div><span className="badge good">当前会话</span></div>{security.otherSession && <div className="account-setting"><Smartphone size={20} color="currentColor" /><div><strong>Safari / iPhone</strong><p>示例设备 B　2026-09-06 18:20 UTC</p></div><button className="danger" onClick={() => setPending('session')}>撤销会话</button></div>}</section>
      </>}
      {tab === 'preferences' && <section className="account-section"><h3>显示与列表</h3><div className="account-setting"><div><strong>外观主题</strong></div><div className="segmented" role="group" aria-label="外观主题">{([['system', '跟随系统', Monitor], ['light', '浅色', Sun], ['dark', '深色', Moon]] as const).map(([value, label, Icon]) => <button key={value} title={label} aria-label={label} aria-pressed={mode === value} className={mode === value ? 'active' : ''} onClick={() => setMode(value)}><Icon size={16} color="currentColor" />{label}</button>)}</div></div><div className="account-setting"><div><strong>紧凑列表</strong></div><button role="switch" aria-label="紧凑列表" aria-checked={preferences.compact} className={`account-switch ${preferences.compact ? 'active' : ''}`} onClick={() => onPreferences({ ...preferences, compact: !preferences.compact })}><span /></button></div><label className="account-setting"><strong>默认每页条数</strong><select aria-label="默认每页条数" value={preferences.pageSize} onChange={event => onPreferences({ ...preferences, pageSize: Number(event.target.value) })}>{[5, 10, 20].map(size => <option key={size} value={size}>{size} 条</option>)}</select></label></section>}
    </div>
    {feedback && <p className="account-feedback" role="status">{feedback}</p>}
    <div className="account-footer"><small>当前会话为模拟身份</small><button className="danger" onClick={() => { if (dirty && !window.confirm('放弃未保存的个人资料并退出？')) return; setDraftName(name); setPending('logout'); }}><LogOut size={15} color="currentColor" />退出登录</button></div>
    {pending && <section className="confirmation" aria-label={confirmation[0]}><h3>{confirmation[0]}？</h3><p>{confirmation[1]}</p><div className="drawer-actions"><button onClick={() => setPending(null)}>取消</button><button className="danger" onClick={confirm}>确认{confirmation[0]}</button></div></section>}
  </div>;
}
