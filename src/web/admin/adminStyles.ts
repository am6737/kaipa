export const adminStyles = `
.admin * { box-sizing: border-box; letter-spacing: 0; }
.admin {
  height: 100dvh; overflow: auto; background: var(--canvas); color: var(--text);
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans Mono CJK SC", sans-serif;
  font-size: 13px; line-height: 1.5; -webkit-font-smoothing: antialiased;
  scrollbar-color: var(--border) transparent; scrollbar-width: thin;
}
.admin button, .admin input, .admin select, .admin textarea { font: inherit; color: inherit; }
.admin button { display: inline-flex; align-items: center; justify-content: center; gap: var(--s-xs); border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); min-height: 38px; padding: 8px 12px; white-space: nowrap; cursor: pointer; transition: background var(--quick), color var(--quick), border-color var(--quick); }
.admin button:hover { background: var(--field); border-color: var(--border); }
.admin button:disabled { opacity: .35; cursor: not-allowed; }
.admin button:focus-visible, .admin select:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.admin .primary { background: var(--accent); color: white; border-color: var(--accent); }
.admin .primary:hover { background: var(--accent); filter: brightness(.92); }
.admin .icon-button { width: 38px; padding: 0; flex-shrink: 0; }
.admin .sidebar { position: fixed; inset: 0 auto 0 0; width: 220px; background: color-mix(in srgb, var(--shell) 60%, var(--canvas)); border-right: 1px solid var(--border); padding: var(--s-xl) var(--s-sm); display: flex; flex-direction: column; z-index: 20; }
.admin .brand { display: flex; gap: 10px; align-items: center; padding: 0 12px 36px; font-size: 23px; font-weight: 650; }
.admin .brand-mark { background: var(--text); color: var(--canvas); width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; }
.admin .brand small { display: block; font-size: 11px; font-weight: 400; color: var(--muted); margin-top: 1px; }
.admin .nav-label { font-size: 11px; color: var(--muted); padding: 16px 12px 10px; }
.admin .nav { border: 1px solid transparent; width: 100%; justify-content: flex-start; gap: 12px; padding: 10px 12px; margin-bottom: 5px; background: transparent; color: var(--muted); }
.admin .nav:hover { border-color: transparent; }
.admin .nav.active { background: var(--field); color: var(--text); border-color: transparent; font-weight: 550; }
.admin .nav.active > :first-child { color: var(--accent); }
.admin .nav .count { margin-left: auto; font-size: 10px; background: var(--field); color: var(--muted); border-radius: 5px; min-width: 20px; text-align: center; padding: 1px 5px; }
.admin .sidebar-bottom { margin-top: auto; border-top: 1px solid var(--border); padding-top: 16px; }
.admin .operator { display: flex; gap: 10px; align-items: center; padding: 8px; font-size: 12px; }
.admin .account-trigger { width: 100%; text-align: left; background: transparent; border-color: transparent; }
.admin .operator-name { flex: 1; min-width: 0; white-space: normal; overflow-wrap: anywhere; }
.admin .operator-name small { display: block; }
.admin .account-panel { padding-bottom: var(--s-xl); }
.admin .account-identity { display: flex; gap: var(--s-md); align-items: center; margin-bottom: var(--s-xl); }
.admin .account-identity > div { min-width: 0; overflow-wrap: anywhere; }
.admin .account-identity .avatar { width: 48px; height: 48px; font-size: 20px; }
.admin .account-identity h2 { margin: 0 0 var(--s-xs); }
.admin .account-identity .badge { margin-top: var(--s-xs); }
.admin .account-section { margin-top: var(--s-xl); }
.admin .account-section h3 { display: flex; align-items: center; gap: var(--s-xs); font-size: 14px; margin: 0 0 var(--s-md); }
.admin .account-setting { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--s-sm); padding: var(--s-md) 0; border-bottom: 1px solid var(--border); }
.admin .account-setting > div:not(.segmented) { flex: 1; min-width: 150px; overflow-wrap: anywhere; }
.admin .account-setting strong { font-weight: 500; }
.admin .account-setting p { font-size: 12px; margin-top: 4px; }
.admin .account-switch { width: 40px; min-height: 24px; height: 24px; padding: 3px; border-radius: 12px; justify-content: flex-start; background: var(--field); }
.admin .account-switch span { width: 16px; height: 16px; border-radius: 50%; background: var(--muted); }
.admin .account-switch.active { background: var(--accent); justify-content: flex-end; }
.admin .account-switch.active span { background: white; }
.admin .account-footer { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: var(--s-sm); border-top: 1px solid var(--border); margin-top: var(--s-xxl); padding-top: var(--s-md); }
.admin .account-feedback { margin-top: var(--s-md); color: var(--success); }
.admin .account-signed-out { min-height: 100%; max-width: 520px; margin: auto; padding: var(--s-xl); display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: var(--s-md); }
.admin .account-signed-out .brand { padding: 0 0 var(--s-xl); }
.admin .account-signed-out button { white-space: normal; overflow-wrap: anywhere; max-width: 100%; }
.admin .avatar { width: 32px; height: 32px; border: 1px solid var(--border); border-radius: 50%; background: var(--field); display: grid; place-items: center; font-size: 12px; font-weight: 600; flex-shrink: 0; }
.admin small { color: var(--muted); font-size: 12px; }
.admin .main { margin-left: 220px; }
.admin .topbar { position: sticky; top: 0; z-index: 10; height: 60px; background: var(--canvas); border-bottom: 1px solid var(--border); padding: 0 32px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.admin .crumb { color: var(--muted); display: flex; align-items: center; gap: 12px; font-size: 12px; }
.admin .crumb strong { color: var(--text); font-weight: 500; }
.admin .tools, .admin .row { display: flex; align-items: center; gap: var(--s-sm); }
.admin .environment { font-size: 10px; padding: 3px 7px; color: var(--muted); }
.admin .topbar .icon-button { border-color: transparent; background: transparent; }
.admin .inbox-trigger { position: relative; }
.admin .inbox-unread-count { position: absolute; top: 0; right: -2px; min-width: 16px; padding: 0 3px; line-height: 16px; border-radius: 8px; background: var(--danger); color: white; font-size: 10px; }
.admin .inbox-heading { margin-bottom: var(--s-xl); }
.admin .inbox-return { margin-bottom: var(--s-md); }
.admin .task-scope { margin-top: var(--s-md); display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
.admin .task-scope button { padding-inline: 4px; }
.admin .task-fields { padding: 0; margin: 0; border: 0; min-width: 0; }
.admin .task-members { border: 0; padding: 0; margin: var(--s-md) 0; min-width: 0; }
.admin .task-members legend { margin-bottom: var(--s-xs); }
.admin .task-members label { display: flex; align-items: center; gap: var(--s-xs); flex-wrap: wrap; min-height: 40px; overflow-wrap: anywhere; }
.admin .task-plan { display: grid; grid-template-columns: minmax(80px, 1fr) minmax(0, 2fr); gap: var(--s-sm); }
.admin .task-plan input { width: 100%; min-width: 0; }
.admin .task-events { list-style: none; margin: 0 0 var(--s-md); padding: 0; }
.admin .task-events li { padding: var(--s-md) 0; border-bottom: 1px solid var(--border); overflow-wrap: anywhere; }
.admin .task-events .task-event-text { color: var(--text); white-space: pre-wrap; margin-top: var(--s-xs); }
.admin .task-collaboration { padding-bottom: var(--s-xl); }
.admin .task-bulk-tools { padding: var(--s-md) 0; border-bottom: 1px solid var(--border); }
.admin .task-bulk-tools .row { flex-wrap: wrap; }
.admin .task-bulk-tools .section-head { margin-bottom: var(--s-sm); }
.admin .batch-check { display: flex; align-items: center; gap: var(--s-xs); min-height: 32px; }
.admin .task-reminder-time { display: block; margin-top: var(--s-xs); }
.admin .task-batch-panel { padding-bottom: var(--s-xl); }
.admin .task-batch-panel > p { margin-bottom: var(--s-xl); }
.admin .task-batch-panel h3 { font-size: 14px; margin: 0; }
.admin .batch-preview { list-style: none; padding: 0; margin: 0 0 var(--s-xl); }
.admin .batch-preview li { padding: var(--s-sm) 0; border-bottom: 1px solid var(--border); overflow-wrap: anywhere; }
.admin .batch-preview strong { font-weight: 500; }
.admin .inbox-heading .row { color: var(--muted); font-size: 12px; gap: var(--s-md); }
.admin .inbox-toolbar { display: grid; gap: var(--s-sm); margin: var(--s-xl) 0 var(--s-sm); }
.admin .inbox-toolbar .search { width: 100%; }
.admin .inbox-filters { display: flex; flex-wrap: wrap; gap: var(--s-xs); align-items: center; }
.admin .inbox-filters .link { margin-left: auto; }
.admin .inbox-item { border-bottom: 1px solid var(--border); padding: var(--s-md) 0; }
.admin .inbox-item-head { display: flex; gap: var(--s-xs); flex-wrap: wrap; align-items: center; margin-bottom: var(--s-sm); }
.admin .inbox-item-head time { margin-left: auto; color: var(--muted); font-size: 11px; }
.admin .inbox-title { padding: 0; border: 0; min-height: 32px; background: transparent; text-align: left; white-space: normal; justify-content: flex-start; font-weight: 500; overflow-wrap: anywhere; }
.admin .inbox-item.unread .inbox-title { font-weight: 650; }
.admin .inbox-title:hover { background: transparent; color: var(--accent); }
.admin .inbox-item h3 { font-size: 14px; margin: 0 0 var(--s-xs); font-weight: 550; overflow-wrap: anywhere; }
.admin .inbox-body { margin-top: var(--s-xs); }
.admin .inbox-actions { display: flex; align-items: center; justify-content: space-between; gap: var(--s-sm); flex-wrap: wrap; margin-top: var(--s-sm); }
.admin .inbox-task-meta { display: flex; flex-direction: column; gap: 4px; color: var(--muted); font-size: 11px; margin-top: var(--s-sm); }
.admin .inbox-task-meta .overdue { color: var(--danger); }
.admin .content { max-width: 1360px; margin: auto; padding: 36px 40px 20px; }
.admin .heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: var(--s-xxl); }
.admin h1 { font-size: var(--title); line-height: 1.4; margin: 0 0 8px; font-weight: 600; }
.admin .export-action { background: var(--text); border-color: var(--text); color: var(--canvas); font-size: 12px; padding-inline: 14px; }
.admin .export-action:hover { background: color-mix(in srgb, var(--text) 85%, var(--canvas)); border-color: transparent; }
.admin p { margin: 0; color: var(--muted); line-height: 1.7; font-size: 13px; }
.admin h2 { font-size: 15px; margin: 0; font-weight: 600; }
.admin .metrics { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: var(--s-md); margin-bottom: var(--s-xxl); }
.admin .metric { border: 1px solid transparent; border-radius: var(--radius); padding: 20px 22px; background: color-mix(in srgb, var(--canvas), var(--field) 60%); }
.admin .metric-label { display: flex; align-items: center; justify-content: space-between; color: var(--muted); font-size: 12px; }
.admin .metric strong { display: block; font-size: 30px; line-height: 1.2; font-variant-numeric: tabular-nums; font-weight: 550; margin: 14px 0 12px; }
.admin .positive { color: var(--success); font-size: 11px; font-weight: 500; }
.admin .metric small { margin-left: 8px; font-size: 11px; }
.admin .analytics { display: grid; grid-template-columns: minmax(0,2fr) minmax(250px,1fr); gap: 36px; margin: 36px 0; }
.admin .section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.admin .segmented { display: flex; background: color-mix(in srgb, var(--canvas), var(--field) 70%); padding: 3px; border-radius: var(--radius); gap: 2px; }
.admin .segmented button { min-height: 28px; border: 0; border-radius: 5px; background: transparent; padding: 4px 10px; color: var(--muted); font-size: 11px; }
.admin .segmented button.active { background: var(--surface); color: var(--text); box-shadow: 0 1px 3px var(--border); }
.admin .trend-chart { display: flex; gap: 16px; height: 180px; padding: 18px 16px 24px 0; }
.admin .trend-axis { width: 24px; flex-shrink: 0; display: flex; flex-direction: column; justify-content: space-between; color: var(--muted); font-size: 10px; margin: -7px 0; }
.admin .trend-plot { position: relative; flex: 1; min-width: 0; }
.admin .trend-plot > svg { width: 100%; height: 100%; overflow: visible; }
.admin .trend-grid { stroke: var(--border); stroke-dasharray: 3 5; stroke-width: 1; vector-effect: non-scaling-stroke; }
.admin .trend-line { fill: none; stroke: var(--accent); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
.admin .trend-point { position: absolute; width: 0; height: 0; }
.admin .trend-hit { position: absolute; width: 28px; height: 28px; min-height: 28px; padding: 0; transform: translate(-50%, -50%); background: transparent; border: 0; border-radius: 50%; }
.admin .trend-hit:hover { background: var(--selected); }
.admin .trend-hit i { width: 5px; height: 5px; border: 1px solid var(--canvas); border-radius: 50%; background: var(--accent); }
.admin .trend-point.active i { width: 7px; height: 7px; }
.admin .trend-tooltip { visibility: hidden; position: absolute; bottom: 16px; left: 0; transform: translateX(-50%); display: flex; align-items: center; gap: 12px; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 4px 16px var(--border); padding: 7px 10px; border-radius: 6px; font-size: 11px; white-space: nowrap; z-index: 3; }
.admin .trend-tooltip span { color: var(--muted); }
.admin .trend-tooltip.start { left: -4px; transform: none; }
.admin .trend-tooltip.end { left: auto; right: -4px; transform: none; }
.admin .trend-point.active .trend-tooltip { visibility: visible; }
.admin .trend-dates { position: absolute; inset: auto 0 -24px; height: 15px; font-size: 10px; color: var(--muted); }
.admin .trend-dates span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
.admin .legend { font-size: 11px; color: var(--muted); display: flex; gap: 6px; align-items: center; margin-bottom: 8px; }
.admin .legend i { width: 6px; height: 6px; background: var(--accent); border-radius: 50%; }
.admin .tasks { border-left: 1px solid var(--border); padding-left: 32px; }
.admin .task { display: flex; width: 100%; justify-content: space-between; text-align: left; white-space: normal; border: 0; border-bottom: 1px solid var(--border); border-radius: 0; background: transparent; padding: 12px 0; font-size: 13px; }
.admin .task:hover { border-color: var(--border); background: var(--field); }
.admin .task:last-child { border-bottom: 0; }
.admin .task-label { display: flex; gap: 12px; align-items: center; }
.admin .task-icon { display: grid; place-items: center; flex-shrink: 0; width: 32px; height: 32px; background: var(--field); border-radius: 8px; color: var(--muted); }
.admin .task:first-of-type .task-icon { color: var(--warning); }
.admin .task:nth-of-type(2) .task-icon { color: var(--danger); }
.admin .task small { display: block; font-size: 11px; margin-top: 3px; }
.admin .table-section { border-top: 1px solid var(--border); padding-top: var(--s-xl); }
.admin .table-section .section-head { margin-bottom: 12px; }
.admin .filters { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
.admin .status-tabs { display: flex; gap: 16px; overflow: auto; max-width: 100%; border-bottom: 1px solid var(--border); margin-bottom: 16px; scrollbar-width: none; }
.admin .status-tabs button { border: 0; border-bottom: 2px solid transparent; border-radius: 0; background: transparent; padding: 10px 0; font-size: 12px; color: var(--muted); }
.admin .status-tabs button.active { border-bottom-color: var(--accent); color: var(--text); font-weight: 600; }
.admin .status-tabs .tab-count { font-size: 10px; color: var(--muted); padding: 0 2px; font-variant-numeric: tabular-nums; }
.admin .search { display: flex; align-items: center; gap: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 0 10px; max-width: 100%; width: 280px; height: 38px; color: var(--muted); }
.admin .search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--selected); }
.admin input { min-width: 0; width: 100%; border: 0; background: transparent; outline: none; font-size: 12px; }
.admin input::placeholder { color: var(--muted); }
.admin .search .icon-button { width: 24px; min-height: 24px; border: 0; }
.admin select { height: 38px; border: 1px solid var(--border); border-radius: var(--radius); padding: 0 10px; background: var(--surface); font-size: 12px; color-scheme: var(--color-scheme); }
.admin .filter-summary { font-size: 12px; color: var(--muted); }
.admin .density.active { background: var(--selected); color: var(--accent); border-color: var(--accent); }
.admin .table-wrap { overflow: auto; border-bottom: 1px solid var(--border); scrollbar-width: thin; }
.admin table { border-collapse: collapse; width: 100%; text-align: left; white-space: nowrap; }
.admin th { font-size: 11px; color: var(--muted); font-weight: 500; background: color-mix(in srgb, var(--canvas), var(--field) 50%); padding: 10px 16px; height: 42px; }
.admin th .sort { border: 0; min-height: 22px; padding: 0; background: transparent; font-size: 11px; color: var(--muted); }
.admin td { padding: 13px 16px; border-top: 1px solid var(--border); font-size: 12px; transition: background var(--quick); }
.admin tbody tr:hover td, .admin tbody tr:focus-within td { background: var(--selected); }
.admin .compact td { padding-top: 8px; padding-bottom: 8px; }
.admin .entity { display: flex; align-items: center; gap: 12px; }
.admin .entity img { width: 48px; height: 40px; object-fit: cover; border-radius: 6px; flex-shrink: 0; }
.admin .entity strong { font-size: 13px; font-weight: 500; display: block; }
.admin .entity small { display: block; font-size: 11px; margin-top: 4px; }
.admin .entity .entity-title { min-height: 0; padding: 0; border: 0; border-radius: 2px; background: transparent; font-size: 13px; font-weight: 500; text-align: left; }
.admin .entity .entity-title:hover { color: var(--accent); }
.admin .badge { font-size: 11px; display: inline-flex; align-items: center; gap: 6px; padding: 3px 7px; border-radius: 5px; background: var(--field); color: var(--muted); }
.admin .badge.good { color: var(--success); background: transparent; }
.admin .badge.warn { color: var(--warning); background: var(--warning-bg); }
.admin .badge.bad { color: var(--danger); background: var(--danger-bg); }
.admin .badge.info { color: var(--muted); background: transparent; }
.admin .badge.info .status-dot { background: var(--accent); }
.admin .badge .status-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
.admin .link { border: 0; background: transparent; color: var(--muted); padding: 4px 8px; font-size: 12px; min-height: 32px; }
.admin .link:hover, .admin .link:focus-visible { color: var(--accent); }
.admin .table-footer { display: flex; justify-content: space-between; align-items: center; padding: 14px 0; font-size: 11px; color: var(--muted); }
.admin .footer { display: flex; justify-content: space-between; padding-top: 12px; margin-top: 12px; font-size: 10px; color: var(--muted); }
.admin .empty { display: flex; flex-direction: column; gap: 12px; align-items: center; text-align: center; padding: 48px 20px; color: var(--muted); }
.admin .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.25); z-index: 40; display: flex; justify-content: flex-end; animation: admin-fade var(--quick); }
.admin .drawer { background: var(--surface); width: 480px; max-width: 100%; height: 100%; overflow: auto; padding: 0 28px 28px; outline: none; box-shadow: -8px 0 40px rgba(0,0,0,.08); animation: admin-slide var(--quick); }
.admin .drawer-head { position: sticky; top: 0; background: var(--surface); z-index: 2; padding: 16px 0; margin-bottom: 24px; border-bottom: 1px solid var(--border); }
.admin .drawer-head .tools { gap: 6px; }
.admin .drawer h2 { font-size: 20px; line-height: 1.5; margin: 16px 0 8px; overflow-wrap: anywhere; }
.admin .drawer-image { width: 100%; height: 180px; object-fit: cover; border-radius: 8px; margin-top: 24px; }
.admin .properties { margin: 24px 0; }
.admin .property { display: flex; justify-content: space-between; gap: 20px; border-bottom: 1px solid var(--border); padding: 14px 0; font-size: 12px; }
.admin .property dt { color: var(--muted); }
.admin .property dd { margin: 0; text-align: right; overflow-wrap: anywhere; }
.admin .drawer-actions { display: flex; gap: 12px; margin-top: 20px; }
.admin .danger { color: var(--danger); }
.admin .toast { position: fixed; bottom: 24px; left: calc(50% + 110px); transform: translateX(-50%); display: flex; align-items: center; gap: 10px; background: var(--surface); color: var(--text); border: 1px solid var(--border); box-shadow: 0 4px 24px rgba(0,0,0,.12); padding: 12px 18px; border-radius: 8px; z-index: 60; max-width: 90%; font-size: 12px; animation: admin-fade var(--quick); }
.admin .toast > :first-child { color: var(--success); }
.admin .mobile-menu, .admin .mobile-scrim { display: none; }
.admin .navigation-scroll { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--border) transparent; padding-right: 3px; }
.admin .sidebar .brand { flex-shrink: 0; padding-bottom: 12px; }
.admin .sidebar-bottom { flex-shrink: 0; padding-top: 10px; }
.admin .navigation-scroll .nav-label { padding-top: 20px; font-size: 10px; }
.admin .navigation-scroll .nav { padding: 8px 12px; min-height: 36px; margin-bottom: 3px; font-size: 12px; }
.admin .metadata { display: inline-flex; gap: var(--s-sm); flex-wrap: wrap; }
.admin .record-summary { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.admin .record-summary .metadata { display: inline; }
.admin .record-summary .metadata > span + span { margin-left: var(--s-sm); }
.admin time { color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.admin .table-footer .icon-button { min-height: 30px; width: 30px; }
.admin .table-footer select { height: 30px; font-size: 11px; }
.admin .drawer-head > strong { font-size: 13px; font-weight: 500; }
.admin .drawer-actions { flex-wrap: wrap; }
.admin .record-field { margin: 24px 0; }
.admin .record-field h3, .admin .confirmation h3 { font-size: 13px; margin: 0 0 10px; font-weight: 600; }
.admin .record-field p { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }
.admin .form-field { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; font-size: 12px; }
.admin .form-field > span { color: var(--muted); }
.admin .form-field input, .admin .form-field textarea, .admin .form-field select { width: 100%; border: 1px solid var(--border); background: var(--field); border-radius: var(--radius); padding: 10px 12px; font-size: 13px; outline: none; }
.admin .form-field input, .admin .form-field select { height: 40px; }
.admin .form-field textarea { min-height: 100px; resize: vertical; line-height: 1.7; }
.admin .form-field input:focus, .admin .form-field textarea:focus, .admin .form-field select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--selected); }
.admin .required { color: var(--danger); }
.admin .form-actions { display: flex; justify-content: flex-end; gap: 12px; padding-top: 20px; border-top: 1px solid var(--border); }
.admin .confirmation { border-top: 1px solid var(--border); padding-top: 24px; margin-top: 24px; }
.admin .confirmation > p { margin-bottom: 20px; }
.admin .settings-page, .admin .roles-page { max-width: 960px; }
.admin .settings-section { display: grid; grid-template-columns: 240px minmax(0,1fr); gap: 32px; padding: 28px 0; border-top: 1px solid var(--border); }
.admin .settings-section h2 { margin-bottom: 8px; }
.admin .settings-section small { font-size: 12px; }
.admin .settings-fields { max-width: 440px; }
.admin .settings-fields .form-field:last-child { margin-bottom: 0; }
.admin .switch-row, .admin .permission-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 14px 0; font-size: 13px; }
.admin input[type=checkbox] { accent-color: var(--accent); width: 16px; height: 16px; flex-shrink: 0; cursor: pointer; }
.admin input[role=switch] { appearance: none; width: 34px; height: 20px; border-radius: 20px; background: var(--muted); position: relative; transition: background var(--quick); }
.admin input[role=switch]::after { content: ''; position: absolute; width: 16px; height: 16px; top: 2px; left: 2px; background: var(--canvas); border-radius: 50%; transition: transform var(--quick); }
.admin input[role=switch]:checked { background: var(--accent); }
.admin input[role=switch]:checked::after { transform: translateX(14px); }
.admin input[type=checkbox]:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.admin .settings-save { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 24px 0; border-top: 1px solid var(--border); }
.admin .permission-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); column-gap: 40px; margin: 24px 0; }
.admin .permission-row { border-bottom: 1px solid var(--border); }
.admin .overview-bottom { display: grid; grid-template-columns: minmax(0,1.3fr) minmax(0,1fr); gap: 36px; }
.admin .overview-record { width: 100%; display: flex; gap: 12px; border: 0; border-radius: 0; border-bottom: 1px solid var(--border); background: transparent; text-align: left; padding: 14px 0; }
.admin .overview-record img { width: 48px; height: 40px; object-fit: cover; border-radius: 6px; }
.admin .overview-record > span:first-of-type { flex: 1; min-width: 0; }
.admin .overview-record strong { display: block; font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.admin .overview-record small { display: block; font-size: 11px; margin-top: 4px; }
.admin .audit-preview { display: flex; align-items: flex-start; gap: 12px; padding: 16px 0; border-bottom: 1px solid var(--border); }
.admin .audit-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--success); margin-top: 6px; flex-shrink: 0; }
.admin .audit-preview > div { flex: 1; min-width: 0; }
.admin .audit-preview strong { display: block; font-size: 12px; font-weight: 500; }
.admin .audit-preview small { display: block; font-size: 11px; margin-top: 4px; overflow-wrap: anywhere; }
.admin .drawer-wide { width: 1040px; padding: 0 28px; }
.admin .resource-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
.admin .resource-layout { display: grid; grid-template-columns: minmax(0,1fr) 280px; gap: 32px; align-items: start; }
.admin .editor-fields { min-width: 0; }
.admin .editor-section { border-top: 1px solid var(--border); padding: 24px 0 8px; }
.admin .editor-section:first-child { border-top: 0; padding-top: 0; }
.admin .editor-section h3, .admin .checklist-editor h3 { font-size: 14px; font-weight: 600; margin: 0 0 20px; }
.admin .editor-section .section-head h3, .admin .checklist-editor .section-head h3 { margin: 0; }
.admin .field-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 0 16px; }
.admin .editor-preview { position: sticky; top: 86px; background: var(--field); border-radius: 8px; padding: 16px; min-width: 0; }
.admin .preview-caption { color: var(--muted); font-size: 11px; margin-bottom: 16px; }
.admin .resource-cover { display: block; width: 100%; height: 150px; object-fit: cover; border-radius: 6px; margin-bottom: 20px; }
.admin .no-cover { display: grid; place-items: center; color: var(--muted); border: 1px dashed var(--border); }
.admin .resource-preview h3 { font-size: 17px; font-weight: 600; line-height: 1.5; margin: 12px 0 6px; overflow-wrap: anywhere; }
.admin .resource-preview p { font-size: 12px; overflow-wrap: anywhere; }
.admin .preview-metrics { display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap; }
.admin .preview-metrics strong { display: block; font-size: 19px; font-weight: 550; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.admin .preview-metrics small { display: block; font-size: 10px; margin-top: 3px; }
.admin .preview-description { white-space: pre-wrap; }
.admin .preview-stops { padding-left: 20px; font-size: 12px; margin: 20px 0; }
.admin .preview-stops li { padding: 6px 0; overflow-wrap: anywhere; }
.admin .preview-stops strong { font-weight: 500; }
.admin .preview-stops small { display: block; font-size: 11px; margin-top: 3px; }
.admin .preview-note { border-top: 1px solid var(--border); padding-top: 16px; margin-top: 20px; font-size: 12px; }
.admin .preview-note strong { display: block; margin-bottom: 8px; }
.admin .preview-specs { margin: 20px 0 0; }
.admin .preview-specs > div { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-top: 1px solid var(--border); font-size: 11px; }
.admin .preview-specs dt { color: var(--muted); }
.admin .preview-specs dd { margin: 0; text-align: right; overflow-wrap: anywhere; }
.admin .preview-items { list-style: none; padding: 0; margin: 20px 0 0; }
.admin .preview-items li { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 10px 0; border-top: 1px solid var(--border); font-size: 12px; }
.admin .preview-items li > span:first-child { overflow-wrap: anywhere; min-width: 0; }
.admin .preview-items li > span:last-child { flex-shrink: 0; color: var(--muted); }
.admin .preview-items small { font-size: 10px; color: var(--warning); display: inline-block; margin-left: 8px; }
.admin .resource-footer { position: sticky; bottom: 0; z-index: 4; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 0; border-top: 1px solid var(--border); background: var(--surface); margin-top: 24px; }
.admin .resource-footer > small { font-size: 11px; }
.admin:has(.resource-editor) .toast { bottom: 88px; }
.admin .resource-editor[data-mode=preview] .editor-fields { display: none; }
.admin .resource-editor[data-mode=preview] .resource-layout { grid-template-columns: minmax(0,1fr); max-width: 520px; margin: 0 auto; }
.admin .resource-editor[data-mode=preview] .resource-cover { height: 220px; }
.admin .resource-editor[data-mode=preview] .editor-preview { position: static; }
.admin .field-error, .admin .form-field .field-error { color: var(--danger); font-size: 11px; }
.admin .form-field [aria-invalid=true] { border-color: var(--danger); }
.admin .editor-error { color: var(--danger); background: var(--danger-bg); padding: 12px; font-size: 12px; border-radius: 6px; margin-top: 16px; }
.admin .cover-options { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
.admin .cover-options > button:not(.icon-button) { padding: 3px; width: 72px; height: 56px; border: 1px solid var(--border); }
.admin .cover-options > button.active { border: 2px solid var(--accent); }
.admin .cover-options img { width: 100%; height: 100%; object-fit: cover; border-radius: 4px; }
.admin .image-upload { position: relative; display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 40px; padding: 8px 12px; border: 1px dashed var(--border); border-radius: 6px; font-size: 12px; cursor: pointer; }
.admin .image-upload input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
.admin .image-upload:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
.admin .catalog-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
.admin .catalog-toolbar select { flex: 1; min-width: 140px; max-width: 100%; }
.admin .catalog-toolbar button { font-size: 11px; }
.admin .packing-editor-row, .admin .stop-editor { padding: 16px 0; border-bottom: 1px solid var(--border); }
.admin .packing-row-title { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.admin .row-index { font-size: 10px; color: var(--muted); width: 20px; flex-shrink: 0; }
.admin .packing-row-title > input, .admin .stop-editor > input { border: 1px solid var(--border); border-radius: 6px; padding: 8px; background: var(--field); font-size: 12px; }
.admin .packing-row-title > input:focus, .admin .stop-editor > input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
.admin .row-tools { display: flex; gap: 3px; flex-shrink: 0; }
.admin .row-tools .icon-button { min-height: 28px; width: 28px; background: transparent; border: 0; }
.admin .packing-row-fields { display: grid; grid-template-columns: 1.2fr .7fr 1fr auto; gap: 10px; align-items: end; }
.admin .packing-row-fields > label { display: flex; flex-direction: column; gap: 6px; font-size: 10px; color: var(--muted); min-width: 0; }
.admin .packing-row-fields input:not([type=checkbox]), .admin .packing-row-fields select { width: 100%; min-width: 0; height: 34px; border: 1px solid var(--border); background: var(--field); border-radius: 6px; padding: 6px; font-size: 12px; color: var(--text); }
.admin .packing-row-fields > .required-item { flex-direction: row; align-items: center; height: 34px; gap: 5px; }
.admin .packing-totals { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 16px 0; font-size: 12px; }
.admin .packing-totals strong { margin-left: auto; font-variant-numeric: tabular-nums; font-size: 16px; }
.admin .packing-totals small { width: 100%; text-align: right; font-size: 11px; }
.admin .resource-version-label { display: block; font-size: 10px; margin: 4px 7px 0; }
.admin .version-panel { padding-bottom: 28px; }
.admin .release-summary { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 24px; }
.admin .release-summary h2 { margin-top: 0; }
.admin .release-summary .row { flex-wrap: wrap; font-size: 12px; color: var(--muted); }
.admin .release-note { padding: 12px 0; color: var(--muted); font-size: 12px; line-height: 1.7; }
.admin .version-panel h3 { font-size: 14px; font-weight: 600; margin: 0 0 12px; }
.admin .version-diff { margin: 24px 0; }
.admin .version-diff .section-head h3 { margin: 0; }
.admin .diff-heading { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 16px; color: var(--muted); font-size: 11px; padding: 12px; background: var(--field); }
.admin .diff-field { padding: 16px 0; border-bottom: 1px solid var(--border); }
.admin .diff-field h4 { font-size: 12px; font-weight: 500; margin: 0 0 10px; }
.admin .diff-values { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 16px; }
.admin .diff-values > div { padding: 12px; min-width: 0; border-left: 2px solid var(--border); }
.admin .diff-values .diff-after { border-color: var(--success); background: color-mix(in srgb, var(--success-bg) 35%, transparent); }
.admin .diff-values p { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }
.admin .diff-values img { display: block; width: 100%; max-width: 260px; height: 130px; object-fit: cover; border-radius: 6px; }
.admin .version-history-layout { display: grid; grid-template-columns: 250px minmax(0,1fr); gap: 28px; margin-top: 24px; }
.admin .version-list { display: flex; flex-direction: column; gap: 8px; }
.admin .version-list button { display: flex; flex-direction: column; align-items: stretch; gap: 6px; padding: 14px; white-space: normal; text-align: left; background: transparent; }
.admin .version-list button.active { border-color: var(--accent); background: var(--selected); }
.admin .version-list button > span { display: flex; align-items: center; gap: 12px; font-size: 12px; overflow-wrap: anywhere; }
.admin .version-list small { font-size: 10px; }
.admin .version-inspect { min-width: 0; }
.admin .release-confirmation { background: var(--field); padding: 20px; border-radius: 8px; border: 1px solid var(--border); margin-top: 24px; }
.admin .release-confirmation > .form-field { margin-top: 20px; }
@keyframes admin-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes admin-slide { from { transform: translateX(24px); opacity: .5; } to { transform: translateX(0); opacity: 1; } }
@media (max-width: 1100px) {
  .admin .sidebar { width: 190px; }
  .admin .main { margin-left: 190px; }
  .admin .content { padding: 24px; }
  .admin .topbar { padding: 0 24px; }
  .admin .metric { padding: 16px; }
  .admin .metric small { display: block; margin: 4px 0 0; }
  .admin .analytics { grid-template-columns: minmax(0,1fr); }
  .admin .tasks { border-left: 0; padding-left: 0; display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 16px; }
  .admin .tasks .section-head { grid-column: 1/-1; margin-bottom: 0; }
  .admin .task { border-bottom: 0; align-items: flex-start; }
  .admin .task-icon { display: none; }
  .admin .toast { left: calc(50% + 95px); }
  .admin .settings-section { grid-template-columns: 180px minmax(0,1fr); gap: 20px; }
  .admin .overview-bottom { grid-template-columns: minmax(0,1fr); gap: 24px; }
}
@media (max-width: 700px) {
  .admin .sidebar { visibility: hidden; transform: translateX(-100%); width: 220px; transition: transform var(--quick); }
  .admin .sidebar.open { visibility: visible; transform: translateX(0); }
  .admin .mobile-scrim { display: block; position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 19; }
  .admin .main { margin-left: 0; }
  .admin .mobile-menu { display: inline-flex; }
  .admin .topbar { height: 56px; padding: 0 16px; }
  .admin .content { padding: 24px var(--page-padding); }
  .admin .heading { align-items: flex-start; flex-direction: column; gap: 20px; }
  .admin .heading .tools { width: 100%; justify-content: space-between; }
  .admin .metrics { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; margin-bottom: 24px; }
  .admin .metric { padding: 14px; }
  .admin .metric strong { font-size: 25px; }
  .admin .metric small { display: inline; margin-left: 5px; font-size: 10px; }
  .admin .analytics { gap: 24px; }
  .admin .trend-chart { height: 160px; }
  .admin .tasks { display: block; }
  .admin .task { padding: 12px 0; }
  .admin .task-icon { display: grid; }
  .admin .task-plan { grid-template-columns: minmax(0, 1fr); }
  .admin .crumb > span { display: none; }
  .admin .environment { display: none; }
  .admin .topbar { gap: 4px; }
  .admin .topbar .tools { gap: 2px; }
  .admin .topbar .crumb { gap: 4px; }
  .admin .topbar .crumb strong { max-width: 90px; overflow-wrap: anywhere; }
  .admin .filters { gap: 12px; }
  .admin .filters > .row { width: 100%; }
  .admin .search { flex: 1; }
  .admin .filter-summary { display: none; }
  .admin .status-tabs { gap: 20px; }
  .admin .footer { gap: 20px; line-height: 1.6; }
  .admin .drawer { padding: 0 20px 24px; }
  .admin .toast { left: 50%; width: max-content; }
  .admin button { min-height: 40px; }
  .admin .heading .tools { flex-wrap: wrap; justify-content: flex-start; }
  .admin .settings-section { grid-template-columns: minmax(0,1fr); gap: 20px; }
  .admin .permission-grid { grid-template-columns: minmax(0,1fr); }
  .admin .settings-save { align-items: flex-start; flex-direction: column; }
  .admin .settings-save .row { width: 100%; justify-content: flex-end; }
  .admin .table-footer .row { gap: 6px; }
  .admin .drawer-head .tools { gap: 4px; }
  .admin .drawer-head > strong { font-size: 12px; }
  .admin .drawer-head .icon-button { width: 32px; }
  .admin .drawer-wide { padding: 0 16px; }
  .admin .resource-layout { grid-template-columns: minmax(0,1fr); }
  .admin .resource-editor[data-mode=edit] .editor-preview { display: none; }
  .admin .resource-editor[data-mode=preview] .editor-preview { display: block; }
  .admin .field-grid { gap: 0 12px; }
  .admin .packing-row-fields { grid-template-columns: 1fr 1fr; }
  .admin .resource-footer { gap: 8px; }
  .admin .resource-footer .row { gap: 8px; }
  .admin .release-summary { flex-direction: column; }
  .admin .version-history-layout { grid-template-columns: minmax(0,1fr); gap: 24px; }
  .admin .version-list { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); }
  .admin .diff-values { gap: 8px; }
  .admin .diff-values > div { padding: 8px; }
  .admin .diff-heading { gap: 8px; }
  .admin .release-confirmation { padding: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .admin *, .admin *::before, .admin *::after { animation: none !important; transition: none !important; }
}
`;
