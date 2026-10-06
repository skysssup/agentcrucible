/** The app shell (sidebar, top bar, mobile tab bar), page headers, panels, tiles, and page states. */
export const LAYOUT_CSS = `
  .app { display:grid; grid-template-columns:var(--sidebar) minmax(0,1fr); height:100vh; height:100dvh; transition:grid-template-columns var(--t-slow) var(--ease); }
  :root[data-sidebar=collapsed] .app { grid-template-columns:var(--sidebar-rail) minmax(0,1fr); }

  .sidebar { position:relative; z-index:var(--z-sidebar); display:flex; flex-direction:column; min-height:0; border-right:1px solid var(--border); background:light-dark(#f0eee9, #10100f); }
  .ws { display:flex; align-items:center; gap:10px; height:var(--topbar); margin:0; padding:0 12px 0 14px; border:0; border-bottom:1px solid var(--border); background:none; color:var(--fg); text-align:left; text-decoration:none; cursor:pointer; }
  .ws:hover .ws-name { text-decoration:underline; text-underline-offset:3px; text-decoration-color:var(--border-3); }
  .ws-mark { display:inline-flex; flex:none; align-items:center; justify-content:center; width:28px; height:28px; border-radius:var(--r-sm); background:var(--ink); color:var(--on-ink); }
  .ws-mark .logo { width:20px; height:20px; }
  .ws-text { display:flex; flex-direction:column; min-width:0; }
  .ws-name { overflow:hidden; color:var(--fg); font-size:13px; font-weight:600; letter-spacing:-.01em; text-overflow:ellipsis; white-space:nowrap; }
  .ws-sub { overflow:hidden; color:var(--muted); font:400 11px/1.3 var(--font-mono); text-overflow:ellipsis; white-space:nowrap; }
  .ws .i { margin-left:auto; color:var(--faint); }
  .sb-nav { display:flex; flex-direction:column; min-height:0; padding:10px 8px 12px; overflow-y:auto; overflow-x:hidden; }
  .sb-group { display:flex; flex-direction:column; gap:1px; }
  .sb-group + .sb-group { margin-top:16px; }
  .sb-group-label { display:flex; align-items:center; height:22px; padding:0 10px; color:var(--faint); font:500 10.5px/1 var(--font-mono); letter-spacing:.08em; text-transform:uppercase; white-space:nowrap; }
  .sb-link { position:relative; display:flex; align-items:center; gap:10px; height:30px; padding:0 8px 0 10px; border-radius:var(--r-sm); color:var(--fg-2); font-size:13px; text-decoration:none; white-space:nowrap; transition:background var(--t-fast), color var(--t-fast); }
  .sb-link .i { color:var(--muted); transition:color var(--t-fast); }
  .sb-link:hover { background:light-dark(rgba(27,26,23,.05), rgba(255,255,255,.05)); color:var(--fg); }
  .sb-link:hover .i { color:var(--fg-2); }
  .sb-link.active { background:var(--surface); color:var(--fg); font-weight:500; box-shadow:0 0 0 1px var(--border), 0 1px 2px light-dark(rgba(27,26,23,.05), rgba(0,0,0,.4)); }
  .sb-link.active .i { color:var(--fg); }
  .sb-link.active::before { content:""; position:absolute; top:7px; bottom:7px; left:-8px; width:3px; border-radius:0 2px 2px 0; background:var(--accent-solid); }
  .sb-text { flex:1; overflow:hidden; text-overflow:ellipsis; }
  .sb-badge { min-width:18px; height:17px; padding:0 5px; border-radius:var(--r-full); color:var(--muted); font:500 10.5px/17px var(--font-mono); text-align:center; }
  .sb-badge.alert { background:var(--harm); color:#fff; }
  .sb-badge.live { background:var(--accent-soft); color:var(--accent-fg); }
  .sb-foot { display:flex; flex-direction:column; gap:6px; margin-top:auto; padding:10px 8px; border-top:1px solid var(--border); }
  .me { display:flex; align-items:center; gap:10px; width:100%; padding:6px 8px; border:0; border-radius:var(--r-sm); background:transparent; color:var(--fg); text-align:left; text-decoration:none; cursor:pointer; }
  .me:hover { background:light-dark(rgba(27,26,23,.05), rgba(255,255,255,.05)); }
  .me-text { display:flex; flex-direction:column; flex:1; min-width:0; }
  .me-name { overflow:hidden; font-size:12.5px; font-weight:500; text-overflow:ellipsis; white-space:nowrap; }
  .me-role { overflow:hidden; color:var(--muted); font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
  .sb-tools { display:flex; align-items:center; gap:2px; padding:0 4px; }
  .sb-status { display:inline-flex; align-items:center; gap:7px; margin-right:auto; color:var(--muted); font:400 11px var(--font-mono); white-space:nowrap; }
  :root[data-sidebar=collapsed] .sidebar :is(.ws-text, .ws > .i, .sb-text, .sb-badge, .sb-group-label, .me-text, .sb-status) { display:none; }
  :root[data-sidebar=collapsed] .sb-link { justify-content:center; padding:0; }
  :root[data-sidebar=collapsed] .sb-group + .sb-group { margin-top:10px; padding-top:10px; border-top:1px solid var(--border); }
  :root[data-sidebar=collapsed] .ws { justify-content:center; padding:0; }
  :root[data-sidebar=collapsed] .me { justify-content:center; padding:6px 0; }
  :root[data-sidebar=collapsed] .sb-tools { flex-direction:column; }

  .main { position:relative; display:flex; flex-direction:column; min-width:0; min-height:0; }
  .topbar { position:relative; z-index:var(--z-topbar); display:flex; flex:none; align-items:center; gap:12px; height:var(--topbar); padding:0 16px 0 20px; border-bottom:1px solid var(--border); background:var(--canvas); }
  .crumbs { display:flex; align-items:center; gap:4px; min-width:0; overflow:hidden; color:var(--muted); font-size:13px; white-space:nowrap; }
  .crumbs a { overflow:hidden; color:var(--muted); text-decoration:none; text-overflow:ellipsis; }
  .crumbs a:hover { color:var(--fg); }
  .crumbs [aria-current] { overflow:hidden; color:var(--fg); font-weight:500; text-overflow:ellipsis; }
  .crumbs .crumb-sep { flex:none; color:var(--faint); }
  .tb-search { display:flex; flex:0 1 380px; align-items:center; gap:8px; min-width:0; height:32px; margin-left:auto; padding:0 6px 0 10px; border:1px solid var(--border-2); border-radius:var(--r-sm); background:var(--surface); color:var(--muted); font-size:12.5px; text-align:left; cursor:pointer; transition:border-color var(--t-fast), color var(--t-fast); }
  .tb-search:hover { border-color:var(--border-3); color:var(--fg-2); }
  .tb-search span { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .tb-actions { display:flex; flex:none; align-items:center; gap:4px; }
  .tb-btn { position:relative; }
  .tb-count { position:absolute; top:1px; right:0; min-width:16px; height:16px; padding:0 4px; border:2px solid var(--canvas); border-radius:var(--r-full); background:var(--harm); color:#fff; font:600 9.5px/12px var(--font-mono); text-align:center; transform:translate(30%, -20%); }
  .tb-divider { width:1px; height:20px; margin:0 6px; background:var(--border); }
  .jobs-chip { display:inline-flex; align-items:center; gap:8px; height:28px; padding:0 10px; border:1px solid var(--accent-line); border-radius:var(--r-full); background:var(--accent-soft); color:var(--accent-fg); font:500 11.5px var(--font-mono); white-space:nowrap; cursor:pointer; }
  .jobs-chip:hover { border-color:var(--accent); }
  .topbar-progress { position:absolute; right:0; bottom:-1px; left:0; height:2px; overflow:hidden; opacity:0; transition:opacity var(--t-med); pointer-events:none; }
  .topbar-progress.on { opacity:1; }
  .topbar-progress::after { content:""; position:absolute; inset:0 auto 0 0; width:40%; background:var(--accent-solid); animation:progress-indeterminate 1s var(--ease) infinite; }
  .menu-btn, .tb-logo { display:none; }
  .view { flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; outline:0; scroll-behavior:smooth; scroll-padding-top:16px; }
  .page { width:100%; max-width:var(--page-max); margin:0 auto; padding:24px var(--page-x) 72px; }
  .page.wide { max-width:none; }
  .page.narrow { max-width:1080px; }

  .tabbar { display:none; }
  .scrim { position:fixed; inset:0; z-index:calc(var(--z-sidebar) - 1); background:var(--overlay); opacity:0; pointer-events:none; transition:opacity var(--t-med); }
  .offline-banner { display:flex; align-items:center; gap:10px; padding:8px 20px; border-bottom:1px solid var(--harm-bd); background:var(--bad-bg); color:var(--bad-fg); font-size:12.5px; }

  .page-head { display:flex; flex-wrap:wrap; align-items:flex-end; justify-content:space-between; gap:16px 24px; margin:0 0 20px; }
  .page-head-main { display:flex; flex-direction:column; gap:6px; min-width:0; max-width:820px; }
  .page-title { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; color:var(--fg); font-size:21px; font-weight:600; letter-spacing:-.018em; line-height:1.25; overflow-wrap:anywhere; }
  .page-title.mono { font:600 19px/1.3 var(--font-mono); letter-spacing:-.02em; }
  .page-desc { margin:0; color:var(--fg-2); font-size:13.5px; line-height:1.55; }
  .page-meta { display:flex; flex-wrap:wrap; align-items:center; gap:6px 14px; color:var(--muted); font-size:12px; }
  .page-meta > span { display:inline-flex; align-items:center; gap:6px; white-space:nowrap; }
  .page-meta .i { color:var(--faint); }
  .page-meta code { color:var(--fg-2); font-size:11.5px; }
  .page-actions { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
  .page-tabs { margin:-4px 0 20px; }
  .section-head { display:flex; align-items:baseline; gap:10px; margin:28px 0 12px; }
  .section-head h2 { font-size:14px; }
  .section-head .muted { font-size:12px; }

  .panel { padding:0; border:1px solid var(--border); border-radius:var(--r-md); background:var(--surface); min-width:0; }
  .panel-head { display:flex; align-items:center; gap:10px; min-height:44px; padding:0 16px; border-bottom:1px solid var(--border); }
  .panel-head.borderless { border-bottom:0; }
  .panel-title { display:flex; align-items:center; gap:8px; min-width:0; color:var(--fg); font-size:13px; font-weight:600; white-space:nowrap; }
  .panel-title .i { color:var(--muted); }
  .panel-meta { overflow:hidden; color:var(--muted); font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
  .panel-actions { display:flex; flex:none; align-items:center; gap:6px; margin-left:auto; white-space:nowrap; }
  .panel-body { padding:16px; }
  .panel-body.tight { padding:12px 16px; }
  .panel-foot { display:flex; align-items:center; gap:10px; min-height:40px; padding:0 16px; border-top:1px solid var(--border); color:var(--muted); font-size:12px; }
  .panel-flush > .table-wrap { border:0; border-radius:0; }
  .panel.accent-top { box-shadow:inset 0 2px 0 var(--v, var(--accent-solid)); }

  .grid { display:grid; gap:16px; min-width:0; }
  .grid > * { min-width:0; }
  .g-2 { grid-template-columns:repeat(2, minmax(0,1fr)); } .g-3 { grid-template-columns:repeat(3, minmax(0,1fr)); } .g-4 { grid-template-columns:repeat(4, minmax(0,1fr)); }
  .g-main-side { grid-template-columns:minmax(0,1fr) 360px; } .g-side-main { grid-template-columns:300px minmax(0,1fr); }
  .g-8-4 { grid-template-columns:minmax(0,2fr) minmax(0,1fr); } .g-7-5 { grid-template-columns:minmax(0,7fr) minmax(0,5fr); }
  .stack { display:flex; flex-direction:column; gap:16px; min-width:0; }
  .mt-16 { margin-top:16px; } .mt-24 { margin-top:24px; } .mb-16 { margin-bottom:16px; }

  .kpis { display:grid; grid-template-columns:repeat(var(--kpi-cols, 6), minmax(0,1fr)); margin:0 0 16px; border:1px solid var(--border); border-radius:var(--r-md); background:var(--surface); overflow:hidden; }
  .kpi { position:relative; display:flex; flex-direction:column; gap:4px; min-width:0; padding:14px 16px 13px; border-left:1px solid var(--border); color:inherit; text-decoration:none; }
  .kpi:first-child { border-left:0; }
  a.kpi:hover { background:var(--surface-2); }
  .kpi-label { display:flex; align-items:center; gap:6px; overflow:hidden; color:var(--muted); font:500 10.5px/1.3 var(--font-mono); letter-spacing:.07em; text-transform:uppercase; white-space:nowrap; }
  .kpi-row { display:flex; align-items:baseline; gap:8px; }
  .kpi-num { color:var(--fg); font-size:24px; font-weight:600; letter-spacing:-.025em; line-height:1.15; white-space:nowrap; }
  .kpi-num small { margin-left:2px; color:var(--muted); font-size:14px; font-weight:500; letter-spacing:0; }
  .kpi-sub { overflow:hidden; color:var(--muted); font-size:11.5px; text-overflow:ellipsis; white-space:nowrap; }
  .kpi-spark { height:24px; margin-top:2px; }
  .kpi.ok .kpi-num { color:var(--ok-fg); } .kpi.bad .kpi-num { color:var(--bad-fg); } .kpi.warn .kpi-num { color:var(--warn-fg); }

  .facts { display:grid; grid-template-columns:max-content minmax(0,1fr); gap:0; margin:0; }
  .facts > div { display:contents; }
  .facts dt, .facts dd { margin:0; padding:9px 0; border-bottom:1px solid var(--border); }
  .facts dt { padding-right:20px; color:var(--muted); font-size:12px; white-space:nowrap; }
  .facts dd { min-width:0; color:var(--fg); font-size:12.5px; overflow-wrap:anywhere; }
  .facts > div:last-child > * { border-bottom:0; }
  .facts code { font-size:11.5px; }

  .empty { display:flex; flex-direction:column; align-items:center; gap:10px; padding:44px 24px; text-align:center; }
  .empty-art { position:relative; display:inline-flex; align-items:center; justify-content:center; width:44px; height:44px; margin-bottom:4px; border:1px solid var(--border-2); border-radius:var(--r-md); background:var(--surface-2); color:var(--muted); box-shadow:4px 4px 0 -1px var(--surface-3), 4px 4px 0 0 var(--border); }
  .empty-title { color:var(--fg); font-size:14px; font-weight:600; }
  .empty-text { max-width:440px; margin:0; color:var(--muted); font-size:12.5px; line-height:1.55; }
  .empty-actions { display:flex; flex-wrap:wrap; justify-content:center; gap:8px; margin-top:6px; }
  .empty.compact { padding:24px 16px; }
  .empty.compact .empty-art { width:34px; height:34px; box-shadow:none; }

  .sk { display:block; border-radius:var(--r-xs); background:var(--surface-3); animation:skeleton 1.4s ease-in-out infinite; }
  .sk-line { height:10px; margin:6px 0; }
  .sk-title { width:220px; height:18px; margin:4px 0 10px; }
  .sk-block { height:120px; }
  .sk-kpi { height:76px; }

  .callout { display:flex; align-items:flex-start; gap:10px; padding:11px 14px; border:1px solid var(--border); border-radius:var(--r-md); background:var(--surface); color:var(--fg-2); font-size:12.5px; line-height:1.55; }
  .callout > .i { margin-top:2px; }
  .callout-body { flex:1; min-width:0; }
  .callout-title { display:block; margin-bottom:2px; color:var(--fg); font-weight:600; }
  .callout ul { margin:6px 0 0; padding-left:18px; }
  .callout.info > .i { color:var(--muted); }
  .callout.ok { border-color:var(--ssucc-bd); background:var(--ok-bg); } .callout.ok > .i, .callout.ok .callout-title { color:var(--ok-fg); }
  .callout.bad { border-color:var(--harm-bd); background:var(--bad-bg); } .callout.bad > .i, .callout.bad .callout-title { color:var(--bad-fg); }
  .callout.warn { border-color:var(--degr-bd); background:var(--warn-bg); } .callout.warn > .i, .callout.warn .callout-title { color:var(--warn-fg); }
  .callout.accent { border-color:var(--accent-line); background:var(--accent-soft); } .callout.accent > .i, .callout.accent .callout-title { color:var(--accent-fg); }
  .callout-actions { display:flex; flex:none; gap:6px; align-self:center; }

  .progress { position:relative; height:6px; overflow:hidden; border-radius:var(--r-full); background:var(--surface-3); }
  .progress-fill { position:absolute; inset:0 auto 0 0; border-radius:inherit; background:var(--pf, var(--ink)); transition:width var(--t-slow) var(--ease); }
  .progress.indeterminate .progress-fill { width:35%; animation:progress-indeterminate 1.1s var(--ease) infinite; }
  .meter { display:flex; align-items:center; gap:10px; min-width:0; }
  .meter .progress { flex:1; height:5px; }
  .meter-val { min-width:36px; color:var(--fg); font:500 12px var(--font-mono); text-align:right; }

  .steps { display:flex; align-items:center; gap:0; margin:0 0 20px; padding:0; list-style:none; counter-reset:step; }
  .step { display:flex; flex:1; align-items:center; gap:10px; min-width:0; color:var(--muted); font-size:12.5px; counter-increment:step; }
  .step::before { content:counter(step); display:inline-flex; flex:none; align-items:center; justify-content:center; width:22px; height:22px; border:1px solid var(--border-2); border-radius:50%; background:var(--surface); color:var(--muted); font:600 11px/1 var(--font-mono); }
  .step::after { content:""; flex:1; height:1px; margin:0 12px 0 2px; background:var(--border); }
  .step:last-child { flex:none; } .step:last-child::after { display:none; }
  .step.done::before { content:""; border-color:var(--ink); background:var(--ink) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m5 12.5 4.5 4.5L19 7.5'/%3E%3C/svg%3E") center no-repeat; }
  .step.current { color:var(--fg); font-weight:500; }
  .step.current::before { border-color:var(--accent-solid); background:var(--accent-solid); color:#fff; }
  .step.done { color:var(--fg-2); cursor:pointer; }

  @media (max-width: 1280px) { .kpis { --kpi-cols:3 !important; } .kpi:nth-child(3n+1) { border-left:0; } .kpi:nth-child(n+4) { border-top:1px solid var(--border); } .g-main-side { grid-template-columns:minmax(0,1fr) 320px; } }
  @media (max-width: 1100px) { .g-4 { grid-template-columns:repeat(2, minmax(0,1fr)); } .g-3 { grid-template-columns:repeat(2, minmax(0,1fr)); } .g-8-4, .g-7-5, .g-main-side, .g-side-main { grid-template-columns:minmax(0,1fr); } }
  @media (max-width: 1024px) {
    .app, :root[data-sidebar=collapsed] .app { grid-template-columns:var(--sidebar-rail) minmax(0,1fr); }
    .sidebar :is(.ws-text, .ws > .i, .sb-text, .sb-badge, .sb-group-label, .me-text, .sb-status) { display:none; }
    .sb-link { justify-content:center; padding:0; } .ws { justify-content:center; padding:0; } .me { justify-content:center; padding:6px 0; } .sb-tools { flex-direction:column; }
    .sb-group + .sb-group { margin-top:10px; padding-top:10px; border-top:1px solid var(--border); }
    .app.menu-open .sidebar { position:fixed; inset:0 auto 0 0; width:var(--sidebar); box-shadow:var(--shadow-modal); }
    .app.menu-open .sidebar :is(.ws-text, .ws > .i, .sb-text, .sb-badge, .sb-group-label, .me-text, .sb-status) { display:revert; }
    .app.menu-open .sidebar :is(.sb-link) { justify-content:flex-start; padding:0 8px 0 10px; }
    .app.menu-open .sidebar .ws { justify-content:flex-start; padding:0 12px 0 14px; }
    .app.menu-open .sidebar .me { justify-content:flex-start; padding:6px 8px; }
    .app.menu-open .sidebar .sb-tools { flex-direction:row; }
    .app.menu-open .sidebar .sb-group + .sb-group { margin-top:16px; padding-top:0; border-top:0; }
    .app.menu-open .scrim { opacity:1; pointer-events:auto; }
    .tb-search { flex-basis:300px; }
  }
  @media (max-width: 760px) {
    :root { --page-x:16px; --topbar:52px; }
    .app, :root[data-sidebar=collapsed] .app { grid-template-columns:minmax(0,1fr); }
    .sidebar { position:fixed; inset:0 auto 0 0; width:min(84vw, 300px); transform:translateX(-102%); transition:transform var(--t-slow) var(--ease); }
    .sidebar :is(.ws-text, .ws > .i, .sb-text, .sb-badge, .sb-group-label, .me-text, .sb-status) { display:revert; }
    .sb-link { justify-content:flex-start; padding:0 8px 0 10px; height:36px; } .ws { justify-content:flex-start; padding:0 12px 0 14px; } .me { justify-content:flex-start; padding:6px 8px; } .sb-tools { flex-direction:row; }
    .sb-group + .sb-group { margin-top:16px; padding-top:0; border-top:0; }
    .app.menu-open .sidebar { transform:none; width:min(84vw, 300px); }
    .menu-btn, .tb-logo { display:inline-flex; }
    .tb-logo { align-items:center; color:var(--fg); }
    .topbar { gap:6px; padding:0 8px 0 6px; }
    .crumbs { display:none; }
    .tb-search { flex:0 0 36px; justify-content:center; width:36px; height:36px; margin-left:auto; padding:0; }
    .tb-search span, .tb-search kbd, .tb-hide-sm { display:none; }
    .panel-head { flex-wrap:wrap; row-gap:2px; padding:8px 14px; }
    .panel-meta { order:3; flex-basis:100%; white-space:normal; }
    .panel-body { padding:14px; }
    .page { padding-top:18px; padding-bottom:calc(var(--tabbar) + 40px); }
    .page-head { align-items:flex-start; margin-bottom:16px; }
    .page-title { font-size:19px; }
    .page-actions { width:100%; }
    .page-actions .btn { flex:1 1 auto; }
    .kpis { --kpi-cols:2 !important; }
    .kpi:nth-child(odd) { border-left:0; } .kpi:nth-child(even) { border-left:1px solid var(--border); } .kpi:nth-child(n+3) { border-top:1px solid var(--border); }
    .kpi-num { font-size:21px; }
    .g-2, .g-3, .g-4 { grid-template-columns:minmax(0,1fr); }
    .tabbar { position:fixed; right:0; bottom:0; left:0; z-index:var(--z-topbar); display:grid; grid-template-columns:repeat(5, 1fr); height:calc(var(--tabbar) + env(safe-area-inset-bottom)); padding-bottom:env(safe-area-inset-bottom); border-top:1px solid var(--border); background:var(--surface); }
    .tabbar a, .tabbar button { position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; border:0; background:none; color:var(--muted); font-size:10.5px; font-weight:500; text-decoration:none; cursor:pointer; }
    .tabbar .active { color:var(--fg); }
    .tabbar .active::before { content:""; position:absolute; top:-1px; width:28px; height:2px; border-radius:0 0 2px 2px; background:var(--accent-solid); }
    .steps .step span { display:none; } .steps .step.current span { display:inline; }
  }
`;
