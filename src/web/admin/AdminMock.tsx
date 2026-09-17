import React, { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, Bell, Check, ChevronLeft, ChevronRight, ClipboardList, Copy, History, Menu, Moon, Mountain, Pencil, Plus, RotateCcw, Sun, UserRound } from 'lucide-react-native';
import { layout, motion, radius, space, type } from '../../design-system';
import { useAppearance } from '../../theme/AppearanceContext';
import { adminStyles } from './adminStyles';
import { ListSection, RecordItem, ResourceExtras, Section } from './mockData';
import { actionsFor, fieldLabels, isListSection, isSection, modules, navigationGroups, pageTitle, RecordAction, seedRecords } from './adminModules';
import { AdminTable, Badge, exportRecords, Metadata } from './AdminTable';
import { AdminDialog } from './AdminDialog';
import { AdminRecordForm } from './AdminRecordForm';
import { AdminOverview } from './AdminOverview';
import { AdminRoles, AdminSettings, defaultRoles, defaultSettings } from './AdminSettings';
import { ResourceEditor } from './ResourceEditor';
import { checklistTotals, isResourceSection } from './resourceEditorModel';
import { discardResourceDraft, editableResource, publishResource, resourceRelease, rollbackResource, saveResourceDraft } from './resourceVersions';
import { ResourceVersionsPanel, VersionCommand } from './ResourceVersionsPanel';
import { AdminAccount, defaultAccountPreferences, defaultAccountSecurity } from './AdminAccount';
import { AdminInbox, InboxView } from './AdminInbox';
import { assignedTasks, InboxTarget, initialNotices, resolveTask } from './adminInboxModel';
import { TaskCommand, updateTask } from './taskCollaborationModel';
import { applyTaskBatch, TaskBatchCommand } from './taskBatchModel';

function readRoute() {
  const [path, search] = window.location.hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(search);
  const section: Section = isSection(path) ? path : 'overview';
  const status = params.get('status') ?? '全部状态';
  return { section, filter: isListSection(section) && modules[section].statuses.includes(status) ? status : '全部状态', query: params.get('q') ?? '', record: params.get('record') };
}
function now() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }
type Selection = { section: ListSection; id: string; ids: string[] };

export function AdminMock() {
  const { theme, resolved, setMode } = useAppearance();
  const [route, setRoute] = useState(readRoute);
  const [records, setRecords] = useState(seedRecords);
  const [settings, setSettings] = useState(defaultSettings);
  const [roles, setRoles] = useState(defaultRoles);
  const [revision, setRevision] = useState(0);
  const [period, setPeriod] = useState('7');
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState('');
  const [selection, setSelection] = useState<Selection | null>(() => route.record && isListSection(route.section) ? { section: route.section, id: route.record, ids: [route.record] } : null);
  const [editor, setEditor] = useState<{ section: ListSection; record?: RecordItem } | null>(null);
  const [action, setAction] = useState<RecordAction | null>(null);
  const [reason, setReason] = useState('');
  const [reset, setReset] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [accountPreferences, setAccountPreferences] = useState(defaultAccountPreferences);
  const [accountSecurity, setAccountSecurity] = useState(defaultAccountSecurity);
  const [inboxView, setInboxView] = useState<InboxView | null>(null);
  const [inboxReturn, setInboxReturn] = useState<InboxView | null>(null);
  const [notices, setNotices] = useState(initialNotices);
  const [tasks, setTasks] = useState(assignedTasks);
  const personalNotices = notices.filter(notice => !notice.recipient || notice.recipient === 'A-001');
  const unreadCount = personalNotices.filter(notice => !notice.read).length;
  const taskCount = tasks.filter(task => task.assignee === 'A-001' && ['待处理', '处理中'].includes(resolveTask(task, records).status)).length;
  const openInbox = (view: InboxView) => { setMenu(false); setInboxView(view); };
  const currentAdmin = records.admins.find(item => item.id === 'A-001')!;
  const rootRef = useRef<HTMLDivElement>(null);
  const editorDirty = useRef(false);
  const lastHash = useRef(window.location.hash);
  const onEditorDirty = React.useCallback((dirty: boolean) => { editorDirty.current = dirty; }, []);
  const section = route.section;
  const title = pageTitle(section);
  const selected = selection ? records[selection.section].find(item => item.id === selection.id) : undefined;
  const selectedIndex = selection?.ids.indexOf(selection.id) ?? -1;
  const modal = Boolean(selection || editor || reset || accountOpen || inboxView);
  const openAccount = () => { setMenu(false); setAccountOpen(true); };
  const pending = records.content.filter(item => item.status === '待审核').length;
  const navigate = (next: Section, filter = '全部状态', query = '', record?: string) => {
    const params = new URLSearchParams();
    if (filter !== '全部状态') params.set('status', filter);
    if (query) params.set('q', query);
    if (record) params.set('record', record);
    window.location.hash = `/${next}${params.size ? `?${params}` : ''}`;
    setMenu(false);
  };
  useEffect(() => {
    const update = () => {
      if (editorDirty.current && !window.confirm('放弃未保存的修改并离开？')) { window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${lastHash.current}`); return; }
      editorDirty.current = false; lastHash.current = window.location.hash;
      const next = readRoute();
      setRoute(next); setSelection(next.record && isListSection(next.section) ? { section: next.section, id: next.record, ids: [next.record] } : null); setEditor(null); setAction(null); setVersionOpen(false); setAccountOpen(false); setInboxView(null); rootRef.current?.scrollTo({ top: 0 });
    };
    const unload = (event: BeforeUnloadEvent) => { if (editorDirty.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('hashchange', update);
    window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('hashchange', update); window.removeEventListener('beforeunload', unload); };
  }, []);
  useEffect(() => { document.title = `${title} - Kaipa 管理后台`; }, [title]);
  useEffect(() => { if (editor) setToast(''); }, [editor]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (!menu) return;
    const previous = document.activeElement as HTMLElement | null;
    const controls = rootRef.current?.querySelectorAll<HTMLButtonElement>('.sidebar button');
    controls?.[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(false);
      if (event.key !== 'Tab' || !controls?.length) return;
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); previous?.focus(); };
  }, [menu]);

  const logRecord = (name: string, category: string, detail: string, fields: Record<string, string> = {}): RecordItem => ({ id: `L-${crypto.randomUUID()}`, name, category, detail, fields, owner: currentAdmin.name, status: '成功', date: now() });
  const addLog = (name: string, category: string, detail: string, fields?: Record<string, string>) => {
    const log = logRecord(name, category, detail, fields);
    setRecords(previous => ({ ...previous, audit: [log, ...previous.audit] }));
  };
  const commitTask = (id: string, command: TaskCommand): string | null => {
    const task = tasks.find(item => item.id === id);
    if (!task) return '任务不存在。';
    try {
      const date = now();
      const next = updateTask(task, command, records, 'A-001', date, crypto.randomUUID());
      const event = next.events!.at(-1)!;
      setTasks(previous => previous.map(item => item.id === id ? next : item));
      addLog(command.kind === 'update' ? '调整待办分配' : '添加协作留言', '我的待办', task.title, { target: id, before: JSON.stringify({ assignee: task.assignee, collaborators: task.collaborators ?? [], priority: task.priority, due: task.due }), after: JSON.stringify({ assignee: next.assignee, collaborators: next.collaborators ?? [], priority: next.priority, due: next.due }), reason: command.text.trim() });
      const recipients = [...new Set([task.assignee, ...(task.collaborators ?? []), next.assignee, ...(next.collaborators ?? [])])].filter(recipient => recipient && recipient !== 'A-001' && records.admins.some(admin => admin.id === recipient && admin.status === '正常'));
      setNotices(previous => [...recipients.map(recipient => ({ id: crypto.randomUUID(), recipient, title: `${task.title}：${command.kind === 'update' ? '分配已更新' : '有新留言'}`, body: `${currentAdmin.name}：${event.text}`, category: '任务分配' as const, date, read: false, target: task.target })), ...previous]);
      return null;
    } catch (error) { return error instanceof Error ? error.message : '任务操作失败。'; }
  };
  const commitTaskBatch = (command: TaskBatchCommand): string | null => {
    try {
      const result = applyTaskBatch(tasks, command, records, 'A-001', now(), () => crypto.randomUUID());
      const label = command.kind === 'assign' ? '批量分配待办' : '发送模拟逾期提醒';
      const logs = result.changed.map(task => logRecord(label, '我的待办', task.title, { target: task.id, reason: command.text.trim(), after: JSON.stringify(task.events!.at(-1)) }));
      setTasks(result.tasks);
      setNotices(previous => [...result.notices, ...previous]);
      setRecords(previous => ({ ...previous, audit: [...logs, ...previous.audit] }));
      setToast(`${label}：${result.changed.length} 项完成，${result.skipped.length} 项跳过`);
      return null;
    } catch (error) { return error instanceof Error ? error.message : '批量操作失败。'; }
  };
  const close = () => { editorDirty.current = false; setSelection(null); setEditor(null); setAction(null); setReason(''); setReset(false); setVersionOpen(false); setAccountOpen(false); setInboxView(null); };
  const openInboxTarget = (target: InboxTarget, view: InboxView) => {
    if (!records[target.section].some(item => item.id === target.id)) { setToast('关联记录已不可用'); return; }
    close();
    setInboxReturn(view);
    navigate(target.section, '全部状态', target.id, target.id);
    setSelection({ section: target.section, id: target.id, ids: [target.id] });
  };
  const requestEditorClose = () => { if (!editorDirty.current || window.confirm('放弃未保存的修改？')) close(); };
  const open = (target: ListSection, item: RecordItem, rows: RecordItem[]) => { setSelection({ section: target, id: item.id, ids: rows.map(row => row.id) }); setAction(null); setReason(''); setVersionOpen(false); setInboxReturn(null); };
  const editResource = () => { if (selection && selected) setEditor({ section: selection.section, record: editableResource(selected) }); };
  const commitVersion = (command: VersionCommand): boolean => {
    if (!selection || !selected || !isResourceSection(selection.section)) return false;
    try {
      const release = resourceRelease(selected);
      let next: RecordItem;
      if (command.kind === 'publish') next = publishResource(selected, selection.section, command.revision, command.note, now());
      else if (command.kind === 'discard') next = discardResourceDraft(selected, command.revision, now());
      else if (command.kind === 'rollback') next = rollbackResource(selected, command.version ?? 0, command.revision, command.note, now());
      else {
        if (release.revision !== command.revision || release.draft || selected.status !== '已下架' || !release.versions.length) throw new Error('资源状态已变化，请重新检查。');
        next = { ...selected, status: '已发布', date: now(), release: { ...release, revision: release.revision + 1 } };
      }
      if ((command.kind === 'publish' || command.kind === 'rollback') && next.release) {
        next.release = { ...next.release, versions: next.release.versions.map((version, index, all) => index === all.length - 1 ? { ...version, author: currentAdmin.name } : version) };
      }
      const label = { publish: '发布资源版本', discard: '放弃资源草稿', rollback: '回滚资源版本', online: '重新上架资源' }[command.kind];
      const log = logRecord(label, pageTitle(selection.section), selected.name, { target: selected.id, before: `v${release.versions.at(-1)?.number ?? 0}`, after: `v${resourceRelease(next).versions.at(-1)?.number ?? 0}`, reason: command.note, ...(command.version ? { sourceVersion: `v${command.version}` } : {}) });
      setRecords(previous => ({ ...previous, [selection.section]: previous[selection.section].map(item => item.id === selected.id ? next : item), audit: [log, ...previous.audit] }));
      setToast(`${label}成功`); return true;
    } catch (error) { setToast(error instanceof Error ? error.message : '操作失败'); return false; }
  };
  const performAction = () => {
    if (!selection || !selected || !action || (action.danger && !reason.trim())) return;
    const next = { ...selected, status: action.status, date: now(), fields: { ...selected.fields, ...(reason.trim() ? { reason: reason.trim() } : {}) }, ...(isResourceSection(selection.section) ? { release: { ...resourceRelease(selected), revision: resourceRelease(selected).revision + 1 } } : {}) };
    const log = logRecord(action.label, pageTitle(selection.section), selected.name, { target: selected.id, before: selected.status, after: action.status, reason: reason.trim() });
    setRecords(previous => ({ ...previous, [selection.section]: previous[selection.section].map(item => item.id === selected.id ? next : item), audit: [log, ...previous.audit] }));
    setToast(`已${action.label}，操作日志已记录`); close();
  };
  const saveRecord = (values: Record<string, string>, extras?: ResourceExtras) => {
    if (!editor) return;
    const { section: target } = editor;
    const existing = editor.record?.id ? editor.record : undefined;
    const config = modules[target];
    const fields = Object.fromEntries(Object.entries(values).filter(([key]) => !['name', 'owner', 'category', 'detail'].includes(key)));
    let item: RecordItem = {
      id: existing?.id ?? `${target.toUpperCase()}-${crypto.randomUUID().slice(0, 8)}`,
      name: values.name ?? existing?.name ?? '', owner: values.owner ?? existing?.owner ?? 'Kaipa 编辑部',
      category: values.category ?? existing?.category ?? '', detail: values.detail ?? existing?.detail ?? '待接受邀请',
      status: existing?.status ?? config.initialStatus ?? '草稿', date: now(), image: extras?.image ?? existing?.image,
      fields: { ...editor.record?.fields, ...fields },
      checklistItems: extras?.checklistItems ?? existing?.checklistItems,
      routeStops: extras?.routeStops ?? existing?.routeStops,
    };
    if (extras?.checklistItems && item.fields) delete item.fields.items;
    if (!existing && item.fields) delete item.fields.reason;
    if (isResourceSection(target)) {
      const current = existing ? records[target].find(row => row.id === existing.id) : undefined;
      try { item = current ? saveResourceDraft(current, item, resourceRelease(existing!).revision, now()) : { ...item, release: resourceRelease(item) }; }
      catch (error) { setToast(error instanceof Error ? error.message : '草稿保存失败'); return; }
    }
    if (target === 'admins' && records.admins.some(row => row.id !== item.id && row.owner.toLowerCase() === item.owner.toLowerCase())) { setToast('该邮箱已存在，请检查成员列表'); return; }
    const snapshot = (row: RecordItem) => JSON.stringify(row, (key, value: unknown) => key === 'image' && typeof value === 'string' && value.startsWith('data:') ? '[本地图片]' : value);
    const log = logRecord(existing ? '编辑记录' : config.create ?? '新建记录', config.title, item.name, { target: item.id, before: existing ? snapshot(existing) : '', after: snapshot(item) });
    setRecords(previous => ({ ...previous, [target]: existing ? previous[target].map(row => row.id === item.id ? item : row) : [item, ...previous[target]], audit: [log, ...previous.audit] }));
    close(); setToast(existing ? isResourceSection(target) ? '草稿已保存，发布内容未改变' : '修改已保存' : target === 'admins' ? '模拟邀请已创建，未发送邮件' : '草稿已创建');
  };
  const exportData = (target: ListSection, rows: RecordItem[]) => { exportRecords(rows, modules[target]); addLog('导出数据', pageTitle(target), `${rows.length} 条模拟记录`); setToast(`已导出 ${rows.length} 条模拟记录`); };
  const canEdit = selection && selected && modules[selection.section].fields && selected.id !== 'A-001' && (isResourceSection(selection.section) || !['已发布', '已解决'].includes(selected.status));
  const vars = {
    '--canvas': theme.surfaceStrong, '--surface': theme.controlSurface, '--shell': theme.featureSurface, '--text': theme.text,
    '--muted': theme.text2, '--border': theme.hairline, '--field': theme.fieldSurface,
    '--accent': theme.accent, '--selected': theme.accentSofter, '--danger': theme.danger,
    '--danger-bg': theme.dangerSoft, '--success': theme.dark ? '#6ed8ad' : '#218562', '--success-bg': theme.dark ? '#17372d' : '#eef8f2',
    '--warning': theme.dark ? '#f4c477' : '#9d6d1d', '--warning-bg': theme.dark ? '#382c19' : '#fff7e8',
    '--radius': `${Math.min(radius.control, space.xs)}px`, '--title': `${type.pageTitle.fontSize}px`, '--page-padding': `${layout.pagePadding}px`,
    '--s-xs': `${space.xs}px`, '--s-sm': `${space.sm}px`, '--s-md': `${space.md}px`, '--s-xl': `${space.xl}px`, '--s-xxl': `${space.xxl}px`, '--quick': `${motion.quick}ms`, '--color-scheme': resolved,
  } as React.CSSProperties;
  if (signedOut) return <div className="admin" style={vars}><style>{adminStyles}</style><main className="account-signed-out"><div className="brand"><span className="brand-mark"><Mountain size={23} color="currentColor" /></span><div>kaipa<small>管理控制台</small></div></div><h1>已退出模拟会话</h1><p>当前没有登录的管理员</p><button className="primary" onClick={() => { setSignedOut(false); navigate('overview'); addLog('进入模拟会话', '我的账户', currentAdmin.name); }}>以 {currentAdmin.name} 进入演示</button><small>MOCK 环境，无真实身份认证</small></main></div>;
  return <div className="admin" ref={rootRef} style={{ ...vars, overflow: modal || menu ? 'hidden' : 'auto' }}>
    <style>{adminStyles}</style><div inert={modal}>
      {menu && <div className="mobile-scrim" onClick={() => setMenu(false)} />}
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <div className="brand"><span className="brand-mark"><Mountain size={23} color="currentColor" /></span><div>kaipa<small>管理控制台</small></div></div>
        <nav className="navigation-scroll" aria-label="后台导航">{navigationGroups.map(group => <div key={group.label}><div className="nav-label">{group.label}</div>{group.items.map(({ id, label, icon: Icon }) => <button key={id} className={`nav ${section === id ? 'active' : ''}`} aria-current={section === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={17} color="currentColor" />{label}{id === 'content' && pending > 0 && <span className="count">{pending}</span>}</button>)}</div>)}</nav>
        <div className="sidebar-bottom"><button className="nav" aria-label="打开我的待办" onClick={() => openInbox('tasks')}><ClipboardList size={17} color="currentColor" />我的待办<span className="count">{taskCount}</span></button><button className="operator account-trigger" aria-label="我的账户" onClick={openAccount}><span className="avatar">{currentAdmin.name.slice(0, 1)}</span><span className="operator-name">{currentAdmin.name}<small>{currentAdmin.category}</small></span><ChevronRight size={15} color="currentColor" /></button></div>
      </aside>
      <main className="main" inert={menu}>
        <header className="topbar">
          <div className="row"><button title="打开导航" aria-label="打开导航" aria-expanded={menu} className="icon-button mobile-menu" onClick={() => setMenu(!menu)}><Menu size={18} color="currentColor" /></button><div className="crumb"><span>{navigationGroups.find(group => group.items.some(item => item.id === section))?.label}</span><ChevronRight size={13} color="currentColor" /><strong>{title}</strong></div></div>
          <div className="tools"><span className="environment">MOCK 环境</span>
            <button className="icon-button" title="重置模拟数据" aria-label="重置模拟数据" onClick={() => setReset(true)}><RotateCcw size={16} color="currentColor" /></button>
            <button className="icon-button" title={resolved === 'dark' ? '切换浅色模式' : '切换深色模式'} aria-label="切换主题" onClick={() => setMode(resolved === 'dark' ? 'light' : 'dark')}>{resolved === 'dark' ? <Sun size={17} color="currentColor" /> : <Moon size={17} color="currentColor" />}</button>
            <button className="icon-button inbox-trigger" title={`通知中心，${unreadCount} 条未读`} aria-label="打开通知中心" onClick={() => openInbox('notices')}><Bell size={17} color="currentColor" />{unreadCount > 0 && <span className="inbox-unread-count">{unreadCount > 99 ? '99+' : unreadCount}</span>}</button>
            <button className="icon-button" title="账户设置" aria-label="账户设置" onClick={openAccount}><UserRound size={17} color="currentColor" /></button>
          </div>
        </header>
        <div className="content"><div className="heading"><div><h1>{title}</h1><p>{isListSection(section) ? modules[section].description : section === 'overview' ? '每一次出发，都在这里汇聚。' : section === 'roles' ? '后台角色与操作范围。' : '应用、内容安全与 AI 服务配置。'}</p></div><div className="tools">
          {section === 'overview' && <select aria-label="统计时间范围" value={period} onChange={event => setPeriod(event.target.value)}><option value="7">最近 7 天</option><option value="30">最近 30 天</option></select>}
          {isListSection(section) && <button onClick={() => exportData(section, records[section])}><ArrowDownToLine size={15} color="currentColor" />导出全部</button>}
          {isListSection(section) && modules[section].create && <button className="export-action" onClick={() => setEditor({ section })}><Plus size={15} color="currentColor" />{modules[section].create}</button>}
        </div></div>
        {section === 'overview' && <AdminOverview records={records} period={period} navigate={navigate} />}
        {isListSection(section) && <AdminTable key={`${section}-${route.filter}-${route.query}-${revision}`} module={modules[section]} records={records[section]} initialFilter={route.filter} initialQuery={route.query} preferences={accountPreferences} resourceVersions={isResourceSection(section)} onOpen={(item, rows) => open(section, item, rows)} onExport={rows => exportData(section, rows)} />}
        {section === 'settings' && <AdminSettings key={revision} value={settings} onSave={next => { setSettings(next); addLog('更新系统配置', '系统配置', '应用与 AI 配置', { before: JSON.stringify(settings), after: JSON.stringify(next) }); setToast('模拟配置已保存'); }} />}
        {section === 'roles' && <AdminRoles key={revision} value={roles} onSave={next => { setRoles(next); addLog('更新角色权限', '角色权限', '后台角色权限矩阵', { before: JSON.stringify(roles), after: JSON.stringify(next) }); setToast('模拟权限已保存'); }} />}
        <footer className="footer"><span>Kaipa 管理控制台</span><span>模拟数据　2026.09.06</span></footer>
        </div>
      </main>
    </div>
    {editor && <AdminDialog title={editor.record?.id ? `编辑${modules[editor.section].entity}` : modules[editor.section].create ?? '新建'} wide={isResourceSection(editor.section)} onClose={requestEditorClose}>{isResourceSection(editor.section) ? <ResourceEditor section={editor.section} record={editor.record} gear={records.gear} onSave={saveRecord} onCancel={requestEditorClose} onDirtyChange={onEditorDirty} /> : <AdminRecordForm module={modules[editor.section]} record={editor.record} onSave={saveRecord} onCancel={close} />}</AdminDialog>}
    {selection && selected && !editor && versionOpen && isResourceSection(selection.section) && <AdminDialog title="发布与版本" wide onClose={close}><ResourceVersionsPanel key={selected.id} record={selected} section={selection.section} onEdit={editResource} onCommit={commitVersion} /></AdminDialog>}
    {selection && selected && !editor && !versionOpen && <AdminDialog title={`${modules[selection.section].entity}详情`} onClose={close} tools={<><small>{selectedIndex + 1} / {selection.ids.length}</small><button className="icon-button" title="上一条" aria-label="上一条" disabled={selectedIndex <= 0} onClick={() => { setSelection({ ...selection, id: selection.ids[selectedIndex - 1] }); setAction(null); setReason(''); }}><ChevronLeft size={16} color="currentColor" /></button><button className="icon-button" title="下一条" aria-label="下一条" disabled={selectedIndex >= selection.ids.length - 1} onClick={() => { setSelection({ ...selection, id: selection.ids[selectedIndex + 1] }); setAction(null); setReason(''); }}><ChevronRight size={16} color="currentColor" /></button></>}>
      {inboxReturn && <div className="inbox-return"><button className="link" onClick={() => { close(); setInboxView(inboxReturn); }}><ChevronLeft size={15} color="currentColor" />返回{inboxReturn === 'tasks' ? '我的待办' : '通知中心'}</button></div>}
      <Badge status={selected.status} /><h2 id="record-title">{selected.name}</h2><p><Metadata value={selected.detail} /></p>
      {selected.image && <img className="drawer-image" src={selected.image.replace('w=240&h=160', 'w=900&h=500')} alt={selected.name} />}
      <dl className="properties">{[['编号', selected.id], [modules[selection.section].owner, selected.owner], [modules[selection.section].category, selected.category], ['更新时间（UTC）', selected.date]].map(([label, value]) => <div className="property" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {Object.entries(selected.fields ?? {}).filter(([, value]) => value).map(([key, value]) => <section className="record-field" key={key}><h3>{fieldLabels[key] ?? key}</h3><p>{value}</p></section>)}
      {selected.routeStops && selected.routeStops.length > 0 && <section className="record-field"><h3>途经点</h3><ol className="preview-stops">{selected.routeStops.map(stop => <li key={stop.id}><strong>{stop.name}</strong><small>{stop.note}</small></li>)}</ol></section>}
      {selected.checklistItems && <section className="record-field"><h3>清单条目</h3><ul className="preview-items">{selected.checklistItems.map(item => <li key={item.id}><span>{item.name}{item.required && <small>必带</small>}</span><span>×{item.quantity}</span></li>)}</ul><div className="packing-totals"><span>{checklistTotals(selected.checklistItems).quantity} 件</span><strong>{(checklistTotals(selected.checklistItems).weight / 1000).toFixed(2)} kg</strong>{checklistTotals(selected.checklistItems).unknown > 0 && <small>{checklistTotals(selected.checklistItems).unknown} 项重量未填写</small>}</div></section>}
      {selection.section === 'ai' && <section className="record-field"><h3>执行结果</h3><p>{selected.status === '失败' ? '上游模型请求超时，未对行程进行修改。' : '请求已完成，生成结果已返回会话。'}</p></section>}
      {selection.section === 'reports' && <button className="link" onClick={() => navigate('content', '全部状态', selected.fields?.target ?? '')}>查看关联内容<ChevronRight size={14} color="currentColor" /></button>}
      {selection.section === 'users' && <button className="link" onClick={() => navigate('journeys', '全部状态', selected.name)}>查看用户行程<ChevronRight size={14} color="currentColor" /></button>}
      {selection.section === 'services' && selected.fields?.run && <button className="link" onClick={() => navigate('ai', '全部状态', selected.fields?.run ?? '')}>查看异常请求<ChevronRight size={14} color="currentColor" /></button>}
      {isResourceSection(selection.section) && <div className="release-note">{resourceRelease(selected).versions.length ? `当前发布版本 v${resourceRelease(selected).versions.at(-1)?.number}` : '尚未发布'}{resourceRelease(selected).draft && '，存在待发布草稿'}</div>}
      {!action && <div className="drawer-actions">{canEdit && <button onClick={() => isResourceSection(selection.section) ? editResource() : setEditor({ section: selection.section, record: selected })}><Pencil size={15} color="currentColor" />{selection.section === 'feedback' ? '回复反馈' : isResourceSection(selection.section) && selected.status === '已发布' ? '编辑草稿' : '编辑'}</button>}{isResourceSection(selection.section) && <><button onClick={() => setVersionOpen(true)}><History size={15} color="currentColor" />发布与版本</button><button onClick={() => setEditor({ section: selection.section, record: { ...selected, release: undefined, id: '', name: `${selected.name}（副本）`, status: '草稿' } })}><Copy size={15} color="currentColor" />复制为草稿</button></>}{actionsFor(selection.section, selected).map(item => <button key={item.label} className={item.danger ? 'danger' : 'primary'} onClick={() => { if (isResourceSection(selection.section) && item.status === '已发布') setVersionOpen(true); else { setAction(item); setReason(''); } }}>{item.label}</button>)}</div>}
      {action && <form className="confirmation" onSubmit={event => { event.preventDefault(); performAction(); }}><h3>确认{action.label}？</h3><p>{selected.name}</p>{action.danger && <label className="form-field"><span>处理原因</span><textarea required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>}<div className="drawer-actions"><button type="button" onClick={() => setAction(null)}>取消</button><button type="submit" className={action.danger ? 'danger' : 'primary'} disabled={action.danger && !reason.trim()}>确认{action.label}</button></div></form>}
    </AdminDialog>}
    {accountOpen && <AdminDialog title="我的账户" onClose={requestEditorClose}><AdminAccount name={currentAdmin.name} email={currentAdmin.owner} role={currentAdmin.category} preferences={accountPreferences} security={accountSecurity} onDirtyChange={onEditorDirty} onProfile={name => {
      const log = logRecord('更新个人资料', '我的账户', name, { target: 'A-001', before: currentAdmin.name, after: name });
      setRecords(previous => ({ ...previous, admins: previous.admins.map(item => item.id === 'A-001' ? { ...item, name, date: now() } : item), audit: [log, ...previous.audit] }));
    }} onPreferences={setAccountPreferences} onSecurity={(value, actionName) => { setAccountSecurity(value); addLog(actionName, '我的账户', currentAdmin.name, { target: 'A-001' }); }} onLogout={() => { addLog('退出模拟会话', '我的账户', currentAdmin.name); close(); setToast(''); setSignedOut(true); }} /></AdminDialog>}
    {selection && !selected && <AdminDialog title="记录不可用" onClose={close}><p>关联记录不存在或已移除。</p><button onClick={close}>返回列表</button></AdminDialog>}
    {inboxView && <AdminDialog title="个人工作台" onClose={requestEditorClose}><AdminInbox initialView={inboxView} name={currentAdmin.name} notices={personalNotices} tasks={tasks} records={records} onTask={commitTask} onBatch={commitTaskBatch} onDirtyChange={onEditorDirty} onRead={(id, read = true) => setNotices(previous => previous.map(notice => (!notice.recipient || notice.recipient === 'A-001') && (!id || notice.id === id) ? { ...notice, read } : notice))} onOpen={openInboxTarget} /></AdminDialog>}
    {reset && <AdminDialog title="重置模拟数据" onClose={close}><p>当前页面内的模拟记录、配置和操作日志将恢复初始状态。真实业务数据不受影响。</p><div className="drawer-actions"><button onClick={close}>取消</button><button className="danger" onClick={() => { setRecords(seedRecords); setSettings(defaultSettings); setRoles(defaultRoles); setAccountPreferences(defaultAccountPreferences); setAccountSecurity(defaultAccountSecurity); setNotices(initialNotices); setTasks(assignedTasks); setRevision(value => value + 1); close(); setToast('模拟数据已重置'); }}>确认重置</button></div></AdminDialog>}
    {toast && <div className="toast" role="status"><Check size={16} color="currentColor" />{toast}</div>}
  </div>;
}
