import { BASE_CSS, REPORT_CSS, SWEEP_CSS } from "../html.js";

/** Styles for the local UI, on top of the tokens, verdict styles, and report timeline the HTML reports use. */
export const UI_CSS = `${BASE_CSS}${REPORT_CSS}${SWEEP_CSS}
  @font-face { font-family:"Geist"; src:url(/fonts/geist.woff2) format("woff2"); font-weight:100 900; font-style:normal; font-display:swap; }
  @font-face { font-family:"Geist Mono"; src:url(/fonts/geist-mono.woff2) format("woff2"); font-weight:100 900; font-style:normal; font-display:swap; }
  :root { --sidebar:232px; --topbar:44px; }
  html, body { height:100%; }
  body { overflow:hidden; }
  .i { flex:none; display:inline-block; vertical-align:middle; }
  .small { font-size:12px; } .mono { font-family:var(--font-mono); font-size:12px; } .nowrap { white-space:nowrap; } .spacer { flex:1; }
  kbd { display:inline-flex; align-items:center; justify-content:center; min-width:18px; height:18px; padding:0 4px; border:1px solid var(--border-2); border-radius:4px; background:var(--surface); color:var(--muted); font:500 10px/1 var(--font-mono); }
  code { color:inherit; }
  @keyframes spin { to { transform:rotate(360deg); } }
  @keyframes slide { from { transform:translateX(-100%); } to { transform:translateX(340%); } }
  .spinner { display:inline-block; width:12px; height:12px; border:2px solid currentColor; border-right-color:transparent; border-radius:50%; animation:spin .7s linear infinite; }

  .app { display:grid; grid-template-columns:var(--sidebar) minmax(0,1fr); height:100vh; height:100dvh; }
  .sidebar { display:flex; flex-direction:column; min-height:0; border-right:1px solid var(--border); background:var(--surface); }
  .brand { display:flex; align-items:center; gap:8px; height:var(--topbar); padding:0 12px 0 16px; color:var(--fg); text-decoration:none; }
  .brand-name { font-size:13px; font-weight:600; }
  .brand-sub { margin-left:auto; overflow:hidden; color:var(--muted); font:400 11px/1 var(--font-mono); text-overflow:ellipsis; white-space:nowrap; }
  .sb-search { display:flex; align-items:center; gap:8px; height:32px; margin:0 12px 8px; padding:0 6px 0 8px; border:1px solid var(--border); border-radius:4px; background:var(--surface); color:var(--muted); font-size:13px; text-align:left; cursor:pointer; transition:border-color .12s, color .12s; }
  .sb-search:hover { border-color:var(--border-2); color:var(--fg-2); }
  .sb-search span { flex:1; }
  .sb-nav { display:flex; flex-direction:column; min-height:0; padding:0 0 8px; overflow:auto; }
  .sb-label { margin:16px 0 4px; padding:0 16px; color:var(--muted); font:500 11px/1.3 var(--font-sans); letter-spacing:.04em; text-transform:uppercase; }
  .sb-nav > :first-child { margin-top:0; }
  .sb-link { position:relative; display:flex; align-items:center; gap:8px; height:30px; padding:0 12px 0 16px; color:var(--fg-2); font-size:13px; font-weight:400; text-decoration:none; transition:background .12s, color .12s; }
  .sb-link .i { color:var(--muted); transition:color .12s; }
  .sb-link:hover { background:var(--surface-2); color:var(--fg); }
  .sb-link.active { color:var(--fg); font-weight:500; }
  .sb-link.active::before { content:""; position:absolute; top:0; bottom:0; left:0; width:2px; background:var(--accent); }
  .sb-link.active .i { color:var(--fg); }
  .sb-text { flex:1; }
  .sb-count { color:var(--muted); font:400 11px/1 var(--font-mono); }
  .sb-key { display:none; }
  .sb-link:hover .sb-key { display:inline-flex; }
  .sb-link:hover .sb-count { display:none; }
  .sb-foot { display:flex; flex-direction:column; gap:8px; margin-top:auto; padding:8px 12px 12px; border-top:1px solid var(--border); }
  .sb-help { display:flex; align-items:center; gap:8px; height:30px; padding:0 4px 0 4px; border:0; border-radius:4px; background:transparent; color:var(--fg-2); font-size:13px; cursor:pointer; }
  .sb-help span { flex:1; text-align:left; }
  .sb-help .i { color:var(--muted); }
  .sb-help:hover { background:var(--surface-2); color:var(--fg); }
  .sb-row { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:0 4px; }
  .sb-status { color:var(--muted); font-size:12px; }
  .theme-switch { display:inline-flex; border:1px solid var(--border); border-radius:4px; background:var(--surface); }
  .theme-switch button { display:grid; place-items:center; width:24px; height:24px; padding:0; border:0; border-right:1px solid var(--border); background:transparent; color:var(--muted); cursor:pointer; transition:background .12s, color .12s; }
  .theme-switch button:last-child { border-right:0; }
  .theme-switch button:first-child { border-radius:3px 0 0 3px; } .theme-switch button:last-child { border-radius:0 3px 3px 0; }
  .theme-switch button:hover { color:var(--fg); }
  .theme-switch button[aria-checked=true] { background:var(--surface-2); color:var(--fg); }
  .sb-scrim { display:none; }

  .main { position:relative; min-width:0; overflow:auto; background:var(--canvas); overscroll-behavior:contain; scroll-padding-top:calc(var(--topbar) + 12px); }
  .topbar { position:sticky; top:0; z-index:30; display:flex; align-items:center; gap:8px; height:var(--topbar); padding:0 24px; border-bottom:1px solid var(--border); background:var(--surface); }
  .topbar .menu-btn, .topbar .topbar-logo { display:none; }
  .crumbs { display:flex; flex:1; align-items:center; gap:6px; min-width:0; overflow:hidden; color:var(--muted); font-size:12px; white-space:nowrap; }
  .crumbs a { color:var(--muted); text-decoration:none; transition:color .12s; }
  .crumbs a:hover { color:var(--fg); }
  .crumbs [aria-current] { overflow:hidden; color:var(--fg); font-weight:500; text-overflow:ellipsis; }
  .crumb-sep { color:var(--faint); }
  .topbar-actions { display:flex; flex:none; align-items:center; gap:8px; }
  .topbar-search { display:inline-flex; align-items:center; gap:8px; height:28px; padding:0 4px 0 8px; border:1px solid var(--border); border-radius:4px; background:var(--surface); color:var(--muted); font-size:12px; cursor:pointer; transition:border-color .12s, color .12s; }
  .topbar-search:hover { border-color:var(--border-2); color:var(--fg-2); }
  .progress { position:absolute; right:0; bottom:-1px; left:0; height:2px; overflow:hidden; opacity:0; pointer-events:none; transition:opacity .12s; }
  .progress::after { content:""; position:absolute; top:0; bottom:0; left:0; width:30%; background:var(--accent); }
  .progress.on { opacity:1; }
  .progress.on::after { animation:slide 1s linear infinite; }
  .view { max-width:1440px; margin:0 auto; padding:24px 24px 96px; outline:none; }
  .icon-btn { display:inline-grid; place-items:center; width:28px; height:28px; padding:0; border:0; border-radius:4px; background:transparent; color:var(--muted); cursor:pointer; transition:background .12s, color .12s; }
  .icon-btn:hover { background:var(--surface-2); color:var(--fg); }

  .page-head { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px 24px; margin:0 0 16px; }
  .page-head-text { flex:1 1 0; min-width:280px; }
  .page-head h1 { margin:0; font-size:16px; font-weight:600; line-height:1.3; overflow-wrap:anywhere; }
  .page-head h1.mono-title { font-family:var(--font-mono); }
  .page-head h1 .badge { margin-left:8px; }
  .page-sub { margin:4px 0 0; color:var(--fg-2); font-size:13px; line-height:1.45; }
  .page-sub code, .muted code, .note code, .empty code, .hint code { padding:0 4px; border-radius:4px; background:var(--surface-2); color:var(--fg-2); font-size:12px; white-space:nowrap; }
  .page-actions { display:flex; flex:none; flex-wrap:wrap; align-items:center; justify-content:flex-end; gap:8px; }
  .proj-line { margin:4px 0 0; color:var(--muted); font-size:12px; }
  .proj-line code { color:var(--fg-2); }

  .btn { display:inline-flex; align-items:center; justify-content:center; gap:6px; height:32px; padding:0 12px; border:1px solid transparent; border-radius:4px; font:500 13px/1 var(--font-sans); white-space:nowrap; text-decoration:none; cursor:pointer; user-select:none; transition:background .12s, border-color .12s, color .12s, opacity .12s; }
  .btn:disabled { opacity:.5; cursor:not-allowed; }
  .btn-primary, .btn-accent { background:var(--accent-solid); color:#fff; }
  .btn-primary:hover:not(:disabled), .btn-accent:hover:not(:disabled) { background:color-mix(in srgb, var(--accent-solid) 88%, #000); }
  .btn-secondary { border-color:var(--border-2); background:var(--surface); color:var(--fg); }
  .btn-secondary:hover:not(:disabled) { background:var(--surface-2); }
  .btn-ghost { background:transparent; color:var(--fg-2); }
  .btn-ghost:hover:not(:disabled) { background:var(--surface-2); color:var(--fg); }
  .btn-danger { border-color:var(--harm); background:var(--surface); color:var(--harm-fg); }
  .btn-danger:hover:not(:disabled) { background:var(--harm); color:#fff; }
  .btn-sm { height:28px; padding:0 10px; }
  .btn-block { width:100%; }
  .btn-group { display:inline-flex; }
  .btn-group .btn { border-radius:0; } .btn-group .btn + .btn { margin-left:-1px; }
  .btn-group .btn:first-child { border-radius:4px 0 0 4px; } .btn-group .btn:last-child { border-radius:0 4px 4px 0; }
  .btn.copied .i, .copied .i { color:var(--ok-fg); }
  .busy { cursor:progress; }
  .link-quiet { display:inline-flex; align-items:center; gap:4px; color:var(--muted); font-size:12px; text-decoration:none; transition:color .12s; }
  .link-quiet:hover { color:var(--fg); }
  .link-btn { padding:2px 4px; border:0; background:none; color:var(--muted); font-size:12px; cursor:pointer; }
  .link-btn:hover { color:var(--fg); text-decoration:underline; text-underline-offset:2px; }
  a.link, .prose a { color:var(--accent-fg); text-decoration:none; }
  a.link:hover, .prose a:hover { text-decoration:underline; }

  .card { position:relative; padding:16px; border:1px solid var(--border); border-radius:6px; background:var(--surface); }
  .card-head { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; min-height:20px; margin:0 0 12px; }
  .card-head h2 { margin:0; font-size:14px; font-weight:600; }
  .card-head > .muted:last-child, .card-head > .link-quiet:last-child, .card-head > .chip-row:last-child { margin-left:auto; }
  .card-flush { padding:0; overflow:hidden; }
  .card-flush > .card-head { margin:0; padding:10px 16px; border-bottom:1px solid var(--border); }
  .card-body { padding:12px 16px; }
  .chip-row { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
  .world-chip { display:inline-flex; align-items:center; gap:6px; height:20px; padding:0 6px; border:1px solid var(--border); border-radius:4px; color:var(--fg-2); font-size:12px; white-space:nowrap; }
  .world-chip .i { color:var(--muted); }
  .tags { display:flex; flex-wrap:wrap; align-items:center; gap:4px; margin:0 0 8px; }
  .tags-label { display:inline-flex; margin-right:4px; color:var(--muted); }
  .tag { height:22px; padding:0 8px; border:1px solid var(--border); border-radius:4px; background:transparent; color:var(--fg-2); font:400 12px/1 var(--font-mono); cursor:pointer; transition:background .12s, border-color .12s, color .12s; }
  .tag:hover { border-color:var(--border-2); color:var(--fg); }
  .tag.on { border-color:var(--accent); background:var(--accent-soft); color:var(--fg); }
  .tag.static { display:inline-flex; align-items:center; cursor:default; }
  .fault-tag { display:inline-flex; align-items:center; gap:4px; max-width:100%; height:20px; padding:0 6px; overflow:hidden; border-radius:4px; background:var(--warn-bg); color:var(--warn-fg); font:500 11px/1 var(--font-mono); text-overflow:ellipsis; white-space:nowrap; }
  .fault-tag.none { background:transparent; color:var(--muted); font-weight:400; }
  .code-chip { display:inline-flex; align-items:center; height:20px; padding:0 6px; border:1px solid var(--border); border-radius:4px; background:var(--surface); color:var(--fg-2); font:400 11px/1 var(--font-mono); white-space:nowrap; }
  button.code-chip { cursor:copy; transition:border-color .12s, color .12s; }
  button.code-chip:hover { border-color:var(--accent); color:var(--fg); }
  .src-tag { display:inline-flex; align-items:center; height:18px; padding:0 6px; border:1px solid var(--border); border-radius:4px; color:var(--muted); font:400 11px/1 var(--font-mono); white-space:nowrap; }
  .tag-unsaved, .tag-saved { display:inline-flex; align-items:center; height:18px; padding:0 6px; border-radius:4px; font:500 11px/1 var(--font-sans); white-space:nowrap; }
  .tag-unsaved { background:var(--accent-soft); color:var(--accent-fg); }
  .tag-saved { border:1px solid var(--border); color:var(--fg-2); cursor:help; }
  .vdots { display:inline-flex; gap:3px; }
  .mark-ok { color:var(--ok-fg); font-weight:600; }
  .mark-bad { color:var(--bad-fg); font:500 11px/1.3 var(--font-mono); white-space:nowrap; }
  .alert { display:flex; align-items:flex-start; gap:8px; margin:0 0 16px; padding:10px 12px; border:1px solid var(--border); border-radius:6px; background:var(--surface); font-size:13px; line-height:1.45; }
  .alert > .i { margin-top:1px; }
  .alert ul { margin:4px 0 0; padding-left:18px; color:var(--fg-2); }
  .alert-bad { border-color:var(--harm-bd); background:var(--harm-bg); } .alert-bad > .i { color:var(--bad-fg); }
  .alert-ok { border-color:var(--ssucc-bd); background:var(--ssucc-bg); } .alert-ok > .i { color:var(--ok-fg); }
  .hint { display:flex; align-items:center; gap:8px; margin:0 0 16px; padding:8px 12px; border:1px solid var(--border); border-radius:6px; background:var(--surface); color:var(--fg-2); font-size:13px; }
  .hint .i { color:var(--muted); }
  .empty { display:flex; flex-direction:column; align-items:flex-start; gap:12px; padding:16px; border:1px solid var(--border); border-radius:6px; background:var(--surface); }
  .empty p { margin:0; color:var(--fg-2); font-size:13px; }
  .empty h3 { display:none; }
  .empty-actions { display:flex; flex-wrap:wrap; gap:8px; }
  .card .empty { padding:0; border:0; }
  .note { margin:0; color:var(--muted); font-size:12px; line-height:1.45; }
  .page-note { margin-top:12px; }

  .vbar-sm { height:6px; min-width:96px; }
  .vbar-xs { height:4px; }
  .vlegend { display:grid; gap:0; margin:12px 0 0; padding:0; list-style:none; }
  .vlegend li { display:flex; align-items:center; gap:8px; height:28px; border-bottom:1px solid var(--border); font-size:12px; }
  .vlegend li:last-child { border-bottom:0; }
  .run-summary-bar .vlegend { display:flex; flex-wrap:wrap; gap:4px 20px; margin-top:12px; }
  .run-summary-bar .vlegend li { height:auto; border:0; gap:6px; }
  .run-summary-bar .vlegend em { width:auto; margin-left:2px; }
  .vlegend .sw { width:6px; height:6px; border-radius:999px; background:var(--v); }
  .vlegend code { color:var(--v-fg); font-size:12px; }
  .vlegend b { margin-left:auto; font:500 12px/1 var(--font-mono); }
  .vlegend em { width:36px; color:var(--muted); font:400 12px/1 var(--font-mono); font-style:normal; text-align:right; }

  .kpis { display:grid; grid-template-columns:repeat(6, minmax(0,1fr)); margin:0 0 16px; overflow:hidden; border:1px solid var(--border); border-radius:6px; background:var(--surface); }
  .kpis-4 { grid-template-columns:repeat(4, minmax(0,1fr)); }
  .kpi { display:flex; flex-direction:column; gap:4px; min-width:0; padding:12px 16px; border-left:1px solid var(--border); color:inherit; text-decoration:none; transition:background .12s; }
  .kpi:first-child { border-left:0; }
  a.kpi:hover { background:var(--surface-2); }
  .kpi-label { color:var(--muted); font:500 11px/1.3 var(--font-sans); letter-spacing:.04em; text-transform:uppercase; }
  .kpi-num { font:600 20px/1.3 var(--font-mono); }
  .kpi-sub { overflow:hidden; color:var(--muted); font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
  .kpi.bad .kpi-num { color:var(--bad-fg); } .kpi.warn .kpi-num { color:var(--warn-fg); } .kpi.ok .kpi-num { color:var(--ok-fg); }
  .ov-grid { display:grid; grid-template-columns:minmax(0,1.75fr) minmax(0,1fr); gap:16px; align-items:start; }
  .ov-grid-even { grid-template-columns:minmax(0,1fr) minmax(0,1fr); }
  .ov-col { display:flex; flex-direction:column; gap:16px; min-width:0; }
  .dl-rows { margin:0; padding:0; }
  .dl-rows > div { display:flex; align-items:center; justify-content:space-between; gap:12px; height:32px; border-bottom:1px solid var(--border); font-size:12px; }
  .dl-rows > div:last-child { border-bottom:0; }
  .dl-rows dt { color:var(--fg-2); } .dl-rows dd { margin:0; font:500 12px/1 var(--font-mono); }
  .facts { margin:0; padding:0; }
  .facts > div { display:grid; grid-template-columns:88px minmax(0,1fr); gap:12px; padding:8px 0; border-bottom:1px solid var(--border); }
  .facts > div:last-child { border-bottom:0; }
  .facts dt { padding-top:1px; color:var(--muted); font:500 11px/1.45 var(--font-sans); letter-spacing:.04em; text-transform:uppercase; }
  .facts dd { min-width:0; margin:0; font-size:13px; overflow-wrap:anywhere; }
  .facts dd code { font-size:12px; }

  .demo-facts { margin:0 0 16px; }
  .demo-facts blockquote { margin:0; padding:0 0 0 12px; border-left:2px solid var(--border-2); font-size:13px; line-height:1.45; }
  .demo-calls { display:flex; flex-wrap:wrap; gap:4px 12px; margin:0; padding:0; list-style:none; }
  .demo-calls li { display:inline-flex; align-items:center; gap:6px; color:var(--fg-2); font-size:12px; white-space:nowrap; }
  .demo-calls code { color:var(--fg); font-size:12px; }
  .demo-calls li.faulted { color:var(--warn-fg); }
  .demo-calls .vdot { background:var(--border-2); }
  .demo-calls li.committed .vdot { background:var(--ssucc); } .demo-calls li.failed .vdot { background:var(--harm); }
  .demo-tbl td { padding-top:10px; padding-bottom:10px; vertical-align:top; height:auto; }
  .demo-tbl tr.lane-done > td:first-child { border-left:1px solid var(--v); }
  .demo-tbl tr.pending td { color:var(--muted); }
  .demo-tbl .answer { color:var(--fg-2); }
  .demo-tbl .why { margin-top:4px; color:var(--fg-2); }
  .demo-agent code { color:var(--fg); font-size:12px; font-weight:600; }
  .demo-agent p { margin:2px 0 0; max-width:240px; color:var(--muted); font-size:12px; white-space:normal; }
  .legend-tbl td { height:32px; }
  .legend-tbl tr.absent td { color:var(--muted); }
  .legend-tbl td:last-child { color:var(--fg-2); white-space:normal; }
  .next-links { display:flex; flex-wrap:wrap; gap:8px 16px; margin:12px 0 0; }

  .split, .detail { display:grid; grid-template-columns:minmax(0,1fr) 300px; align-items:start; gap:16px; }
  .split-side, .detail-side { position:sticky; top:calc(var(--topbar) + 16px); display:flex; flex-direction:column; gap:16px; }
  .detail-main { display:flex; flex-direction:column; gap:16px; min-width:0; }
  .filterbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin:0 0 8px; }
  .search { display:flex; flex:1 1 240px; align-items:center; gap:8px; max-width:360px; height:32px; padding:0 6px 0 8px; border:1px solid var(--border-2); border-radius:4px; background:var(--surface); color:var(--muted); transition:border-color .12s, box-shadow .12s; }
  .search:focus-within { border-color:var(--accent); box-shadow:0 0 0 2px var(--accent-soft); }
  .search input { flex:1; min-width:0; height:100%; padding:0; border:0; outline:0; background:transparent; color:var(--fg); font-size:13px; }
  .search input::placeholder { color:var(--muted); }
  .seg { display:inline-flex; max-width:100%; overflow-x:auto; border:1px solid var(--border-2); border-radius:4px; background:var(--surface); }
  .seg-wrap { flex-wrap:wrap; }
  .seg-btn { display:inline-flex; align-items:center; gap:6px; height:30px; padding:0 10px; border:0; border-right:1px solid var(--border); background:transparent; color:var(--fg-2); font-size:12px; font-weight:500; white-space:nowrap; cursor:pointer; transition:background .12s, color .12s; }
  .seg-btn:first-child { border-radius:3px 0 0 3px; } .seg-btn:last-child { border-right:0; border-radius:0 3px 3px 0; }
  .seg-btn:hover { background:var(--surface-2); color:var(--fg); }
  .seg-btn.on { background:var(--accent-soft); color:var(--fg); }
  .seg-btn .i { color:var(--muted); }
  .seg-btn[data-verdict]:not([data-verdict=""]) { font-family:var(--font-mono); font-size:11px; font-weight:400; }
  .seg-btn .vdot { width:6px; height:6px; }
  .seg-count { color:var(--muted); font:400 11px/1 var(--font-mono); }
  .list-tools { display:flex; align-items:center; gap:8px; margin:0 0 8px; color:var(--muted); font-size:12px; }
  .filter-chip { display:inline-flex; align-items:center; gap:4px; height:22px; padding:0 4px 0 8px; border:1px solid var(--accent-line); border-radius:4px; background:var(--accent-soft); color:var(--fg); font-size:12px; }
  .filter-chip button { display:grid; place-items:center; width:16px; height:16px; padding:0; border:0; border-radius:3px; background:transparent; color:var(--muted); cursor:pointer; }
  .filter-chip button:hover { color:var(--fg); }
  .check { position:relative; display:inline-grid; cursor:pointer; }
  .check input, .agent-opt input { position:absolute; width:1px; height:1px; opacity:0; pointer-events:none; }
  .check-box { display:grid; place-items:center; width:14px; height:14px; border:1px solid var(--border-2); border-radius:4px; background:var(--surface); color:transparent; transition:background .12s, border-color .12s, color .12s; }
  input:checked + .check-box { border-color:var(--accent-solid); background:var(--accent-solid); color:#fff; }
  input:focus-visible + .check-box { outline:2px solid var(--focus); outline-offset:1px; }
  .check:hover .check-box, .agent-opt:hover .check-box { border-color:var(--muted); }
  .check-box .i { width:10px; height:10px; }
  .scn-tbl td { height:36px; }
  .scn-tbl tr.group td { height:28px; padding:0 12px; background:var(--surface-2); color:var(--muted); font:500 11px/1 var(--font-sans); letter-spacing:.04em; text-transform:uppercase; }
  .scn-tbl tr.group td span { margin-left:6px; font-family:var(--font-mono); }
  .scn-tbl .scn-id { color:var(--fg); font:500 12px/1.4 var(--font-mono); text-decoration:none; white-space:nowrap; }
  .scn-tbl .scn-id:hover { color:var(--accent-fg); text-decoration:underline; }
  .scn-tbl .scn-main { width:100%; max-width:0; min-width:260px; }
  .scn-line { display:flex; align-items:baseline; gap:12px; min-width:0; }
  .scn-tbl .scn-id { flex:none; }
  .scn-tbl .scn-desc { flex:1; min-width:0; overflow:hidden; color:var(--fg-2); text-overflow:ellipsis; white-space:nowrap; }
  .scn-tbl .scn-fault { max-width:240px; white-space:nowrap; }
  .scn-tbl tr.selected td { background:var(--accent-soft); }
  .scn-agents { display:inline-flex; align-items:center; gap:8px; color:var(--muted); white-space:nowrap; }
  .run-card { display:flex; flex-direction:column; gap:12px; padding:16px; }
  .run-card-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .run-card-head h2 { margin:0; font-size:14px; }
  .agent-quick { display:inline-flex; gap:2px; }
  .agent-quick button { height:22px; padding:0 6px; border:0; border-radius:4px; background:transparent; color:var(--muted); font-size:12px; cursor:pointer; }
  .agent-quick button:hover { background:var(--surface-2); color:var(--fg); }
  .agent-pick { display:flex; flex-direction:column; max-height:min(40vh, 320px); margin:0 -8px; padding:0 4px; overflow:auto; border:0; }
  .agent-opt { position:relative; display:grid; grid-template-columns:14px minmax(0,1fr) auto; align-items:start; gap:8px; padding:6px 8px; border-radius:4px; cursor:pointer; transition:background .12s; }
  .agent-opt:hover { background:var(--surface-2); }
  .agent-opt:has(input:checked) { background:var(--accent-soft); }
  .agent-opt .check-box { margin-top:2px; }
  .agent-opt-body { display:flex; flex-direction:column; min-width:0; }
  .agent-opt-body code { color:var(--fg); font-size:12px; font-weight:500; }
  .agent-opt-body small { display:-webkit-box; overflow:hidden; color:var(--muted); font-size:11px; line-height:1.35; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
  .run-opts { display:grid; grid-template-columns:72px minmax(0,1fr); gap:8px; padding-top:12px; border-top:1px solid var(--border); }
  .field { display:flex; flex-direction:column; gap:4px; min-width:0; }
  .field > span { color:var(--muted); font:500 11px/1.3 var(--font-sans); letter-spacing:.04em; text-transform:uppercase; }
  .field input, .field select { width:100%; height:32px; padding:0 8px; border:1px solid var(--border-2); border-radius:4px; background:var(--surface); outline:none; font-family:var(--font-mono); font-size:12px; transition:border-color .12s, box-shadow .12s; }
  .field input:focus, .field select:focus { border-color:var(--accent); box-shadow:0 0 0 2px var(--accent-soft); }
  .field input::placeholder { color:var(--muted); }
  .field select { padding-right:4px; }

  .task blockquote, blockquote.task { margin:0; padding:0 0 0 12px; border-left:2px solid var(--border-2); font-size:14px; line-height:1.45; }
  .stage-pill { display:inline-flex; align-items:center; height:18px; padding:0 6px; border:1px solid var(--border); border-radius:4px; color:var(--fg-2); font-size:11px; white-space:nowrap; }
  .expect-rows { margin:0; padding:0; list-style:none; }
  .expect-rows li { display:flex; align-items:flex-start; gap:8px; padding:4px 0; font-size:13px; line-height:1.45; }
  .expect-rows .i { margin-top:2px; color:var(--muted); }
  .policy { display:inline-flex; align-items:center; gap:4px; height:20px; padding:0 6px; border-radius:4px; background:var(--ok-bg); color:var(--ok-fg); font-size:12px; }
  .policy code { font-size:11px; }
  .code-view { display:flex; max-height:520px; overflow:auto; background:var(--surface-2); font:12px/1.6 var(--font-mono); }
  .code-gutter { position:sticky; left:0; flex:none; padding:10px 8px 10px 12px; border-right:1px solid var(--border); background:var(--surface-2); color:var(--faint); text-align:right; user-select:none; }
  .code-gutter span, .ce-lines span { display:block; }
  .code-view pre.code { flex:1; margin:0; padding:10px 12px; overflow:visible; border:0; border-radius:0; background:transparent; font:inherit; white-space:pre; }
  .ev-list, .recent-list { margin:0; padding:0; list-style:none; }
  .ev-list li { display:flex; align-items:center; justify-content:space-between; gap:8px; height:32px; border-bottom:1px solid var(--border); }
  .ev-list li:last-child { border-bottom:0; }
  .ev-list code { color:var(--fg-2); font-size:12px; }
  .recent-list a { display:flex; align-items:center; gap:8px; height:32px; border-bottom:1px solid var(--border); color:inherit; text-decoration:none; }
  .recent-list li:last-child a { border-bottom:0; }
  .recent-list a:hover code { color:var(--fg); }
  .recent-list code { flex:1; overflow:hidden; color:var(--fg-2); font-size:12px; text-overflow:ellipsis; white-space:nowrap; }

  .status-ok, .status-bad { display:inline-flex; align-items:center; gap:4px; font-size:12px; }
  .status-ok { color:var(--ok-fg); } .status-bad { color:var(--bad-fg); }
  .matrix-tools { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin:0 0 8px; }
  .matrix-wrap { max-height:calc(100vh - var(--topbar) - 140px); overflow:auto; border:1px solid var(--border); border-radius:6px; background:var(--surface); }
  .matrix { width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; }
  .matrix thead th { position:sticky; top:0; z-index:2; height:auto; padding:8px 12px; border-bottom:1px solid var(--border); background:var(--surface-2); vertical-align:top; text-transform:none; letter-spacing:0; }
  .matrix thead th code { display:block; overflow:hidden; color:var(--fg); font-size:12px; font-weight:600; text-overflow:ellipsis; white-space:nowrap; }
  .matrix .matrix-corner { left:0; z-index:3; width:220px; border-right:1px solid var(--border); color:var(--muted); font:500 11px/1.3 var(--font-sans); letter-spacing:.04em; text-transform:uppercase; }
  .matrix tbody th { position:sticky; left:0; z-index:1; height:auto; padding:8px 12px; border-right:1px solid var(--border); border-bottom:1px solid var(--border); background:var(--surface); font:400 12px var(--font-sans); letter-spacing:0; text-align:left; text-transform:none; white-space:normal; vertical-align:top; }
  .matrix tbody th a { color:var(--fg); font:500 12px/1.4 var(--font-mono); text-decoration:none; overflow-wrap:anywhere; }
  .matrix tbody th a:hover { color:var(--accent-fg); text-decoration:underline; }
  .matrix td { height:1px; padding:6px; border-bottom:1px solid var(--border); vertical-align:top; }
  .matrix tbody tr:last-child > * { border-bottom:0; }
  .cell { display:flex; flex-direction:column; align-items:flex-start; gap:4px; height:100%; padding:6px 8px; border:1px solid var(--border); border-radius:4px; color:inherit; text-decoration:none; transition:border-color .12s, background .12s; }
  a.cell:hover { border-color:var(--border-2); background:var(--surface-2); }
  .cell.mismatch { border-color:var(--harm); }
  .cell.is-flaky { border-color:var(--degr); }
  .cell-top { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
  .cell .why { display:block; max-width:100%; overflow:hidden; color:var(--fg-2); font-size:12px; line-height:1.4; text-overflow:ellipsis; white-space:nowrap; }
  .cell-empty { color:var(--muted); font-size:12px; }
  .trials { display:flex; align-items:center; gap:8px; width:100%; margin-top:auto; color:var(--muted); font-size:11px; }
  .trials.flaky { color:var(--warn-fg); font-weight:500; }
  .trial-bar { display:flex; flex:1; gap:1px; max-width:96px; height:4px; overflow:hidden; border-radius:2px; }
  .trial-bar i { min-width:2px; background:var(--v); }
  .col-head { display:flex; flex-direction:column; gap:6px; min-width:0; }
  .col-head .vbar { max-width:140px; }
  .exp-sum { display:inline-flex; align-items:center; gap:4px; font:400 11px/1.3 var(--font-sans); letter-spacing:0; text-transform:none; white-space:nowrap; }
  .exp-sum.ok { color:var(--ok-fg); } .exp-sum.bad { color:var(--bad-fg); }
  .matrix tbody th .exp-sum { display:flex; margin-top:4px; }
  #matrix[data-filter=unexpected] tr[data-unexpected="0"], #matrix[data-filter=flaky] tr[data-flaky="0"] { display:none; }
  #matrix[data-filter=unexpected] .cell:not(.mismatch), #matrix[data-filter=flaky] .cell:not(.is-flaky) { opacity:.4; }
  #matrix[data-density=detailed] .cell .why { display:-webkit-box; white-space:normal; -webkit-line-clamp:3; -webkit-box-orient:vertical; }

  .table-wrap { overflow:auto; border:1px solid var(--border); border-radius:6px; background:var(--surface); }
  .table-wrap.flush { border:0; border-radius:0; }
  .tbl th { position:sticky; top:0; z-index:1; background:var(--surface-2); }
  .tbl td { height:36px; font-size:12px; }
  .tbl.compact td { height:32px; }
  .tbl tbody tr:last-child td { border-bottom:0; }
  .tbl tr[data-href], .tbl tr[data-action] { cursor:pointer; }
  .tbl tbody tr:hover td { background:var(--surface-2); }
  .tbl tr.selected td { background:var(--accent-soft); }
  .tbl .num { text-align:right; }
  .tbl td.num { font-family:var(--font-mono); }
  .tbl .col-check { width:40px; padding-right:0; }
  .tbl .check { margin:0; }
  .tbl code { color:var(--fg-2); font-size:12px; white-space:nowrap; }
  .tbl.compact th, .tbl.compact td { padding:0 8px; }
  .tbl.compact th:first-child, .tbl.compact td:first-child { padding-left:16px; } .tbl.compact th:last-child, .tbl.compact td:last-child { padding-right:16px; }
  .tbl td.clip { width:100%; max-width:0; min-width:80px; overflow:hidden; color:var(--fg-2); text-overflow:ellipsis; white-space:nowrap; }
  .tbl td.when { color:var(--muted); white-space:nowrap; }
  .row-link { color:var(--fg); font:500 12px/1.4 var(--font-mono); text-decoration:none; white-space:nowrap; }
  .row-link:hover { color:var(--accent-fg); text-decoration:underline; }
  .rule { color:var(--fg-2); font-size:12px; }
  .rule.add { color:var(--ok-fg); } .rule.del { color:var(--bad-fg); }
  .where, .tbl td.mono { white-space:nowrap; }
  .where small { margin-left:8px; color:var(--muted); font-size:12px; }
  .row-error td { background:var(--bad-bg); }
  .tbl .rules { display:flex; flex-direction:column; align-items:flex-start; gap:2px; }
  .tbl .seed { display:inline-block; max-width:220px; overflow:hidden; text-overflow:ellipsis; vertical-align:middle; }
  .tbl td.bar-cell { min-width:120px; }
  .selbar { position:sticky; bottom:16px; z-index:20; display:flex; flex-wrap:wrap; align-items:center; gap:8px; width:fit-content; max-width:100%; margin:16px auto 0; padding:6px 6px 6px 12px; border:1px solid var(--border-2); border-radius:6px; background:var(--surface); box-shadow:var(--shadow-pop); opacity:0; pointer-events:none; transition:opacity .12s; }
  .selbar.show { opacity:1; pointer-events:auto; }
  .selbar-count { margin-right:6px; font-size:13px; white-space:nowrap; }
  .selbar-count b { font-family:var(--font-mono); }
  .meta-chips { display:flex; flex-wrap:wrap; gap:4px 16px; margin-top:4px; color:var(--muted); font-size:12px; }
  .meta-chip { display:inline-flex; align-items:center; gap:4px; max-width:100%; overflow:hidden; white-space:nowrap; }
  .meta-chip > :last-child { overflow:hidden; text-overflow:ellipsis; }
  .meta-chip .i { color:var(--muted); }
  .meta-chip code, .meta-chip .mono { color:var(--fg-2); font-size:12px; }
  .page-report .rpt { --sticky-top:calc(var(--topbar) + 16px); }
  .page-report .trial-aside { max-height:calc(100vh - var(--topbar) - 32px); }

  .agents-tbl .row-muted td { color:var(--muted); }
  .agents-tbl .row-muted code { color:var(--fg-2); }
  .agent-cell { min-width:220px; }
  .agent-cell code { color:var(--fg); font-size:12px; font-weight:600; }
  .agent-cell .src-tag { margin-left:8px; vertical-align:1px; }
  .agent-cell p { margin:2px 0 0; color:var(--muted); font-size:12px; line-height:1.4; white-space:normal; }
  .agents-tbl td { padding-top:6px; padding-bottom:6px; }
  .mix-counts { display:inline-flex; flex-wrap:wrap; gap:2px 8px; margin-left:8px; vertical-align:middle; }
  .mix-counts span { display:inline-flex; align-items:center; gap:4px; color:var(--fg-2); font:400 11px/1 var(--font-mono); }
  .mix-counts i { width:6px; height:6px; border-radius:999px; background:var(--v); }
  .safe-rate { font:500 12px/1 var(--font-mono); }
  .safe-rate.none { color:var(--faint); }
  .agents-tbl .go { width:24px; color:var(--faint); }

  .cmp { margin:0 0 16px; overflow:hidden; border:1px solid var(--border); border-radius:6px; background:var(--surface); }
  .cmp-head { display:flex; align-items:center; gap:12px; padding:12px 16px; border-left:2px solid transparent; }
  .cmp.ok .cmp-head { border-left-color:var(--ssucc); } .cmp.bad .cmp-head { border-left-color:var(--harm); }
  .cmp-icon { display:grid; place-items:center; } .cmp.ok .cmp-icon { color:var(--ok-fg); } .cmp.bad .cmp-icon { color:var(--bad-fg); }
  .cmp-head h2 { margin:0; font-size:14px; }
  .cmp-head p { margin:2px 0 0; color:var(--fg-2); font-size:12px; }
  .cmp-stats { display:flex; flex-wrap:wrap; gap:4px 16px; padding:8px 16px; border-top:1px solid var(--border); border-bottom:1px solid var(--border); }
  .cmp-stat { display:inline-flex; align-items:baseline; gap:6px; color:var(--muted); font-size:12px; }
  .cmp-stat b { color:var(--fg); font:600 12px/1 var(--font-mono); }
  .cmp-stat.zero { opacity:.55; }
  .cmp-stat.bad b { color:var(--bad-fg); } .cmp-stat.ok b { color:var(--ok-fg); }
  .kind { display:inline-flex; align-items:center; height:18px; padding:0 6px; border-radius:4px; background:var(--surface-2); color:var(--fg-2); font-size:11px; font-weight:500; white-space:nowrap; }
  .kind.bad { background:var(--bad-bg); color:var(--bad-fg); } .kind.ok { background:var(--ok-bg); color:var(--ok-fg); } .kind.muted { background:transparent; color:var(--muted); }
  .transition { display:inline-flex; flex-wrap:wrap; align-items:center; gap:6px; color:var(--muted); }
  .ci-card { margin-top:16px; }
  .cmd-block { position:relative; }
  .cmd-block pre.code { padding:10px 80px 10px 12px; overflow:auto; white-space:pre; }
  .cmd-block .btn { position:absolute; top:6px; right:6px; }

  .editor-layout { display:grid; grid-template-columns:minmax(0,1.55fr) minmax(300px,1fr); align-items:start; gap:16px; }
  .editor-pane { position:sticky; top:calc(var(--topbar) + 16px); display:flex; flex-direction:column; height:max(520px, calc(100vh - var(--topbar) - 120px)); overflow:hidden; border:1px solid var(--border); border-radius:6px; background:var(--surface); }
  .editor-bar, .editor-foot { display:flex; flex:none; align-items:center; gap:12px; padding:0 12px; background:var(--surface-2); }
  .editor-bar { height:36px; border-bottom:1px solid var(--border); }
  .editor-file { display:inline-flex; align-items:center; gap:6px; color:var(--fg); font:500 12px/1 var(--font-mono); }
  .editor-file .i { color:var(--muted); }
  .editor-hint { display:inline-flex; align-items:center; gap:3px; margin-left:auto; color:var(--muted); font-size:12px; }
  .editor-hint kbd + kbd { margin-right:4px; }
  .editor-foot { height:28px; border-top:1px solid var(--border); color:var(--muted); font:400 11px/1 var(--font-mono); }
  .editor-foot span:last-child { margin-left:auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .code-editor { --lh:20px; position:relative; display:flex; flex:1; min-height:0; overflow:hidden; font:12px/var(--lh) var(--font-mono); }
  .ce-gutter { flex:none; width:44px; padding-top:10px; overflow:hidden; border-right:1px solid var(--border); background:var(--surface-2); color:var(--faint); text-align:right; user-select:none; }
  .ce-lines span { height:var(--lh); padding-right:10px; }
  .ce-lines span.bad { background:var(--bad-bg); color:var(--bad-fg); font-weight:600; }
  .ce-body { position:relative; flex:1; min-width:0; overflow:hidden; }
  .ce-highlight { position:absolute; top:0; left:0; min-width:100%; margin:0; padding:10px 12px 60px; overflow:visible; border:0; border-radius:0; background:transparent; font:inherit; line-height:var(--lh); white-space:pre; pointer-events:none; }
  .ce-highlight code { font:inherit; }
  #editor-text { position:absolute; inset:0; width:100%; height:100%; margin:0; padding:10px 12px 60px; overflow:auto; border:0; outline:none; resize:none; background:transparent; color:transparent; -webkit-text-fill-color:transparent; caret-color:var(--accent); font:inherit; font-variant-ligatures:none; line-height:var(--lh); white-space:pre; tab-size:2; }
  #editor-text::selection { background:var(--accent-line); }
  .editor-side { display:flex; flex-direction:column; gap:16px; min-width:0; }
  .vstate { padding:12px 16px; border:1px solid var(--border); border-radius:6px; background:var(--surface); }
  .vstate.checking { display:flex; align-items:center; gap:8px; color:var(--muted); font-size:13px; }
  .vstate.ok { border-left:2px solid var(--ssucc); }
  .vstate.bad { border-left:2px solid var(--harm); }
  .vstate-head { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
  .vstate.ok .vstate-head > .i { color:var(--ok-fg); } .vstate.bad .vstate-head > .i { color:var(--bad-fg); }
  .vstate-head strong { font-size:13px; }
  .vstate-head code { margin-left:auto; color:var(--fg-2); font-size:12px; }
  .vstate-msg { margin:8px 0 0; color:var(--bad-fg); font:12px/1.5 var(--font-mono); white-space:pre-wrap; word-break:break-word; }
  .vstate-meta { display:flex; flex-wrap:wrap; align-items:center; gap:4px 8px; margin:8px 0 0; color:var(--fg-2); font-size:12px; }
  .expect-list { margin:8px 0 0; padding-left:18px; color:var(--fg-2); font-size:12px; line-height:1.45; }
  .expect-list li { margin:2px 0; } .expect-list li::marker { color:var(--faint); }
  .draft-results { padding:12px 16px; }
  .draft-list { display:flex; flex-direction:column; margin:0; padding:0; list-style:none; }
  .draft-list li { border-bottom:1px solid var(--border); }
  .draft-list li:last-child { border-bottom:0; }
  .draft-list a { display:flex; flex-direction:column; gap:2px; padding:8px 0; color:inherit; text-decoration:none; }
  .dr-head { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
  .dr-head code { color:var(--fg); font-size:12px; font-weight:600; }
  .dr-head .mark-ok, .dr-head .mark-bad { margin-left:auto; }
  .dr-why { color:var(--fg-2); font-size:12px; line-height:1.4; }
  .editor-side .agent-pick { max-height:200px; }
  .detail-side .agent-pick { max-height:none; }
  .ref-group { margin-top:12px; }
  .ref-group > span { display:flex; align-items:baseline; gap:8px; margin:0 0 6px; color:var(--muted); font:500 11px/1.3 var(--font-sans); letter-spacing:.04em; text-transform:uppercase; }
  .ref-group em { font-style:normal; letter-spacing:0; text-transform:none; }

  .tabs { display:flex; flex-wrap:wrap; gap:16px; margin:0 0 16px; border-bottom:1px solid var(--border); }
  .tab { display:inline-flex; align-items:center; gap:6px; height:32px; padding:0; border:0; border-bottom:2px solid transparent; background:transparent; color:var(--fg-2); font-size:13px; font-weight:500; cursor:pointer; }
  .tab:hover { color:var(--fg); }
  .tab .i { color:var(--muted); }
  .tab span { color:var(--muted); font:400 11px/1 var(--font-mono); }
  .cat-section { margin:0 0 24px; scroll-margin-top:calc(var(--topbar) + 16px); }
  .cat-section > h2 { margin:0 0 12px; font-size:14px; }
  .world-card { margin:0 0 12px; }
  .world-head { display:flex; align-items:center; gap:8px; padding:10px 16px; border-bottom:1px solid var(--border); }
  .world-head .i { color:var(--muted); }
  .world-head h3 { margin:0; font:600 13px/1.3 var(--font-mono); }
  .world-head p { margin:0 0 0 8px; color:var(--muted); font-size:12px; }
  .world-head .src-tag { margin-left:auto; }
  .tool-name { color:var(--fg) !important; font-weight:600; }
  .writes { margin-left:8px; padding:1px 4px; border:1px solid var(--border-2); border-radius:3px; color:var(--muted); font:500 10px/12px var(--font-sans); letter-spacing:.04em; text-transform:uppercase; }
  .args { white-space:normal !important; }
  .records { display:flex; flex-direction:column; gap:8px; padding:12px 16px; border-top:1px solid var(--border); background:var(--surface-2); }
  .records > span { color:var(--muted); font:500 11px/1.3 var(--font-sans); letter-spacing:.04em; text-transform:uppercase; }
  .record { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
  .record-kind { margin-right:4px; color:var(--fg); font-size:12px; font-weight:600; }
  .field-chip { display:inline-flex; align-items:center; gap:4px; height:20px; padding:0 6px; border:1px solid var(--border); border-radius:4px; background:var(--surface); color:var(--fg-2); font:11px/1 var(--font-mono); }
  .field-chip em { color:var(--muted); font-style:normal; }

  .sw-form { display:grid; grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) 88px 88px minmax(0,1fr) auto; align-items:end; gap:12px; }
  .sw-kinds { grid-column:1 / -1; }
  .sw-kinds .chip-row { gap:4px; }
  .sw-kind { display:inline-flex; align-items:center; gap:6px; height:26px; padding:0 8px; border:1px solid var(--border); border-radius:4px; color:var(--fg-2); font:400 12px/1 var(--font-mono); cursor:pointer; }
  .sw-kind:has(input:checked) { border-color:var(--accent-line); background:var(--accent-soft); color:var(--fg); }
  .sw-kind input { position:absolute; width:1px; height:1px; opacity:0; }
  .sw-kind:has(input:focus-visible) { outline:2px solid var(--focus); outline-offset:1px; }
  .sw-kind:has(input:disabled) { opacity:.5; cursor:not-allowed; }
  .sw-kind small { color:var(--muted); font-size:11px; }
  .sw-kinds > summary { display:flex; align-items:center; gap:12px; margin:0 0 6px; list-style:none; cursor:pointer; }
  .sw-kinds > summary::-webkit-details-marker { display:none; }
  .sw-kinds > summary::before { content:""; width:5px; height:5px; border-right:1.5px solid var(--muted); border-bottom:1.5px solid var(--muted); transform:rotate(-45deg); transition:transform .12s; }
  .sw-kinds[open] > summary::before { transform:rotate(45deg); }
  .cov-wrap { overflow:auto; border:1px solid var(--border); border-radius:6px; background:var(--surface); }
  .cov { width:auto; min-width:100%; }
  .cov th, .cov td { height:auto; padding:4px; border-bottom:1px solid var(--border); text-align:center; }
  .cov thead th { background:var(--surface-2); vertical-align:bottom; text-transform:none; letter-spacing:0; }
  .cov thead tr:first-child th { height:28px; border-left:1px solid var(--border); color:var(--fg-2); font:500 11px/1.3 var(--font-mono); }
  .cov .cov-tool { height:112px; min-width:32px; padding:6px 4px; border-left:1px solid var(--border); vertical-align:bottom; }
  .cov .cov-tool span { display:inline-block; color:var(--fg); font:400 11px/1.2 var(--font-mono); white-space:nowrap; writing-mode:vertical-rl; transform:rotate(180deg); }
  .cov .cov-tool.none span { color:var(--muted); }
  .cov .cov-kind { text-transform:none; letter-spacing:0; position:sticky; left:0; z-index:1; min-width:170px; padding:4px 12px; background:var(--surface); text-align:left; white-space:nowrap; }
  .cov thead .cov-kind { background:var(--surface-2); }
  .cov .cov-kind code { color:var(--fg); font-size:12px; }
  .cov .cov-kind small { margin-left:8px; color:var(--muted); font-size:11px; }
  .cov tbody tr.unused .cov-kind code { color:var(--muted); }
  .cov td { height:28px; border-left:1px solid var(--border); font:500 12px/1 var(--font-mono); }
  .cov td a { display:inline-grid; place-items:center; min-width:24px; height:22px; padding:0 4px; border-radius:4px; background:var(--accent-soft); color:var(--accent-fg); text-decoration:none; }
  .cov td a:hover { background:var(--accent-line); }
  .cov td .dot { color:var(--faint); }
  .gaps { display:flex; flex-direction:column; }
  .gap { padding:10px 0; border-bottom:1px solid var(--border); }
  .gap:last-child { border-bottom:0; padding-bottom:0; } .gap:first-child { padding-top:0; }
  .gap h3 { margin:0 0 6px; font-size:13px; }
  .gap h3 span { margin-left:6px; color:var(--muted); font:400 12px/1 var(--font-mono); }
  .gap .chip-row { gap:4px 6px; }
  .gap a { display:inline-flex; align-items:center; height:20px; padding:0 6px; border:1px solid var(--border); border-radius:4px; color:var(--fg-2); font:400 11px/1 var(--font-mono); text-decoration:none; }
  .gap a:hover { border-color:var(--border-2); color:var(--fg); }

  .palette-root { position:fixed; inset:0; z-index:100; }
  .palette-scrim { position:absolute; inset:0; background:var(--overlay); }
  .palette { position:absolute; top:13vh; left:50%; width:min(600px, calc(100vw - 32px)); overflow:hidden; border:1px solid var(--border-2); border-radius:6px; background:var(--surface); box-shadow:var(--shadow-pop); transform:translateX(-50%); }
  .palette-input { display:flex; align-items:center; gap:8px; height:44px; padding:0 12px; border-bottom:1px solid var(--border); color:var(--muted); }
  .palette-input input { flex:1; min-width:0; height:100%; border:0; outline:0; background:transparent; color:var(--fg); font-size:14px; }
  .palette-input input::placeholder { color:var(--muted); }
  .palette-list { max-height:min(420px, 56vh); padding:4px; overflow:auto; }
  .palette-group { padding:8px 8px 4px; color:var(--muted); font:500 11px/1.3 var(--font-sans); letter-spacing:.04em; text-transform:uppercase; }
  .palette-item { display:flex; align-items:center; gap:8px; height:32px; padding:0 8px; border-radius:4px; color:var(--fg-2); font-size:13px; cursor:pointer; }
  .palette-item .i { color:var(--muted); }
  .palette-item.active { background:var(--accent-soft); color:var(--fg); }
  .palette-item.active .i { color:var(--accent-fg); }
  .pi-label { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .pi-hint { max-width:40%; overflow:hidden; color:var(--muted); font:400 11px/1 var(--font-mono); text-overflow:ellipsis; white-space:nowrap; }
  .pi-enter { display:inline-grid; color:var(--muted); }
  .palette-empty { padding:24px; color:var(--muted); text-align:center; }
  .palette-foot { display:flex; gap:16px; padding:6px 12px; border-top:1px solid var(--border); background:var(--surface-2); color:var(--muted); font-size:12px; }
  .palette-foot span { display:inline-flex; align-items:center; gap:4px; }

  .toasts { position:fixed; right:16px; bottom:16px; z-index:90; display:flex; flex-direction:column; align-items:flex-end; gap:8px; }
  .toast { display:flex; align-items:flex-start; gap:8px; max-width:440px; padding:8px 8px 8px 12px; border:1px solid var(--border-2); border-radius:6px; background:var(--surface); box-shadow:var(--shadow-pop); font-size:13px; line-height:1.45; transition:opacity .12s; }
  .toast > .i { margin-top:2px; }
  .toast-ok > .i { color:var(--ok-fg); } .toast-bad > .i { color:var(--bad-fg); } .toast-info > .i { color:var(--muted); }
  .toast-progress > .spinner { margin-top:3px; color:var(--accent); }
  .toast-action { align-self:center; padding:2px 8px; border:1px solid var(--border-2); border-radius:4px; color:var(--fg); font-size:12px; font-weight:500; text-decoration:none; white-space:nowrap; }
  .toast-action:hover { background:var(--surface-2); }
  .toast-text { flex:1; min-width:0; padding-top:2px; word-break:break-word; }
  .toast .icon-btn { width:22px; height:22px; }
  .toast.out { opacity:0; }
  .dialog { width:min(440px, calc(100vw - 32px)); padding:0; border:1px solid var(--border-2); border-radius:6px; background:var(--surface); color:var(--fg); box-shadow:var(--shadow-pop); }
  .dialog::backdrop { background:var(--overlay); }
  .dialog-body { display:flex; align-items:flex-start; gap:12px; padding:16px 16px 4px; }
  .dialog-icon { display:grid; flex:none; place-items:center; width:28px; height:28px; border-radius:4px; background:var(--surface-2); color:var(--fg-2); }
  .dialog-icon.danger { background:var(--bad-bg); color:var(--bad-fg); }
  .dialog h2 { margin:4px 0 4px; font-size:14px; }
  .dialog p { margin:0; color:var(--fg-2); font-size:13px; line-height:1.45; }
  .dialog p code { font-size:12px; }
  .dialog-actions { display:flex; justify-content:flex-end; gap:8px; padding:16px; }
  .dialog-shortcuts { width:min(720px, calc(100vw - 32px)); }
  .dialog-head { display:flex; align-items:center; justify-content:space-between; padding:8px 8px 8px 16px; border-bottom:1px solid var(--border); }
  .dialog-head h2 { display:flex; align-items:center; gap:8px; margin:0; font-size:14px; }
  .dialog-head h2 .i { color:var(--muted); }
  .shortcuts { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:4px 24px; padding:8px 16px 16px; }
  .shortcuts h3 { margin:12px 0 4px; color:var(--muted); font:500 11px/1.3 var(--font-sans); letter-spacing:.04em; text-transform:uppercase; }
  .shortcuts dl { margin:0; }
  .shortcuts dl > div { display:flex; align-items:center; justify-content:space-between; gap:12px; height:30px; border-bottom:1px solid var(--border); font-size:13px; }
  .shortcuts dl > div:last-child { border-bottom:0; }
  .shortcuts dd { display:inline-flex; gap:4px; margin:0; }
  .boot-error { max-width:640px; margin:12vh auto; padding:0 20px; }

  @media (max-width: 1280px) {
    .kpis { grid-template-columns:repeat(3, minmax(0,1fr)); }
    .kpi:nth-child(4) { border-left:0; }
    .kpi:nth-child(n+4) { border-top:1px solid var(--border); }
    .sw-form { grid-template-columns:minmax(0,1fr) minmax(0,1fr) 88px 88px; }
    .sw-form .field-seed { grid-column:span 2; }
  }
  @media (max-width: 1180px) {
    .ov-grid-even { grid-template-columns:minmax(0,1fr); }
    .page-actions { flex:1 1 100%; justify-content:flex-start; }
    .split, .detail, .editor-layout, .ov-grid { grid-template-columns:minmax(0,1fr); }
    .split-side, .detail-side, .editor-pane { position:static; }
    .editor-pane { height:520px; }
  }
  @media (max-width: 900px) {
    .app { grid-template-columns:minmax(0,1fr); }
    .sidebar { position:fixed; inset:0 auto 0 0; z-index:50; width:260px; box-shadow:var(--shadow-pop); transform:translateX(-100%); visibility:hidden; transition:transform .12s, visibility .12s; }
    .menu-open .sidebar { transform:none; visibility:visible; }
    .menu-open .sb-scrim { position:fixed; inset:0; z-index:49; display:block; background:var(--overlay); }
    .topbar .menu-btn, .topbar .topbar-logo { display:inline-grid; place-items:center; }
    .topbar { padding:0 12px 0 8px; }
    .topbar-search span, .topbar-search kbd { display:none; }
    .topbar-search { width:28px; justify-content:center; padding:0; }
    .view { padding:16px 16px 96px; }
  }
  @media (max-width: 640px) {
    .kpis { grid-template-columns:repeat(2, minmax(0,1fr)); }
    .kpi:nth-child(n) { border-top:1px solid var(--border); border-left:1px solid var(--border); }
    .kpi:nth-child(-n+2) { border-top:0; }
    .kpi:nth-child(odd) { border-left:0; }
    .sw-form { grid-template-columns:minmax(0,1fr) minmax(0,1fr); }
    .sw-form > :first-child, .sw-form .field-seed { grid-column:1 / -1; }
    .shortcuts { grid-template-columns:1fr; }
    .crumbs a, .crumbs .crumb-sep { display:none; }
    .scn-tbl .scn-desc, .scn-tbl .scn-fault { max-width:160px; }
  }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration:.01ms !important; animation-delay:0s !important; transition-duration:.01ms !important; } }
`;
