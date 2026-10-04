import { BASE_CSS, REPORT_CSS } from "../html.js";

/** Styles for the local UI, on top of the tokens, badges, and report timeline the HTML reports use. */
export const UI_CSS = `${BASE_CSS}${REPORT_CSS}
  :root { --sidebar:248px; }
  body { min-height:100vh; }
  .sr-only { position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden; clip:rect(0 0 0 0); border:0; }
  .i { flex:none; display:inline-block; vertical-align:middle; }
  .muted { color:var(--muted); } .small { font-size:12.5px; } .mono { font-family:var(--font-mono); font-size:12.5px; } .nowrap { white-space:nowrap; } .spacer { flex:1; }
  kbd { display:inline-flex; align-items:center; gap:2px; height:20px; padding:0 6px; border:1px solid var(--border-2); border-bottom-width:2px; border-radius:6px; background:var(--surface); color:var(--muted); font:500 11px/1 var(--font-sans); }
  code { color:inherit; }
  @keyframes spin { to { transform:rotate(360deg); } }
  @keyframes fade-up { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
  @keyframes fade-in { from { opacity:0; } to { opacity:1; } }
  @keyframes pop { from { opacity:0; transform:translate(-50%, -6px) scale(.98); } to { opacity:1; transform:translate(-50%, 0); } }
  @keyframes shimmer { from { background-position:-200% 0; } to { background-position:200% 0; } }
  @keyframes slide { from { background-position:-100% 0; } to { background-position:200% 0; } }
  @keyframes flash { 0%, 100% { box-shadow:0 0 0 0 transparent; } 30% { box-shadow:0 0 0 4px color-mix(in srgb, var(--accent) 35%, transparent); } }
  @keyframes pulse { 0%, 100% { opacity:1; } 50% { opacity:.45; } }
  .spinner { display:inline-block; width:13px; height:13px; border:2px solid currentColor; border-right-color:transparent; border-radius:50%; animation:spin .7s linear infinite; opacity:.85; }

  .shell { min-height:100vh; }
  .sidebar { position:fixed; inset:0 auto 0 0; z-index:40; display:flex; flex-direction:column; gap:14px; width:var(--sidebar); padding:16px 12px 14px; background:var(--bg-subtle); border-right:1px solid var(--border); }
  .brand { display:flex; align-items:center; gap:10px; padding:2px 6px; color:var(--fg); text-decoration:none; }
  .brand .logo { flex:none; border-radius:8px; box-shadow:0 2px 8px -2px rgba(229,72,77,.45); }
  .brand-name { font-weight:650; font-size:15px; letter-spacing:-.015em; }
  .brand-ver { margin-left:auto; padding:1px 6px; border:1px solid var(--border); border-radius:999px; color:var(--muted); font:500 10.5px/16px var(--font-mono); }
  .sb-search { display:flex; align-items:center; gap:8px; width:100%; height:34px; padding:0 8px 0 10px; border:1px solid var(--border); border-radius:9px; background:var(--surface); color:var(--muted); font-size:13px; cursor:pointer; box-shadow:var(--shadow-sm); transition:border-color .15s, color .15s; }
  .sb-search:hover { border-color:var(--border-2); color:var(--fg-2); }
  .sb-search span { flex:1; text-align:left; }
  .sb-nav { display:flex; flex-direction:column; gap:1px; overflow:auto; margin:0 -4px; padding:0 4px; }
  .sb-label { margin:14px 10px 6px; color:var(--muted); font:600 11px/1 var(--font-sans); letter-spacing:.07em; text-transform:uppercase; }
  .sb-link { position:relative; display:flex; align-items:center; gap:10px; height:34px; padding:0 10px; border-radius:8px; color:var(--fg-2); font-size:13.5px; font-weight:500; text-decoration:none; transition:background .12s, color .12s; }
  .sb-link .i { color:var(--muted); transition:color .12s; }
  .sb-link:hover { background:var(--surface-3); color:var(--fg); }
  .sb-link.active { background:var(--surface); color:var(--fg); box-shadow:var(--shadow-sm), inset 0 0 0 1px var(--border); }
  .sb-link.active .i { color:var(--accent); }
  .sb-count { margin-left:auto; color:var(--muted); font-size:11.5px; font-variant-numeric:tabular-nums; }
  .sb-foot { display:flex; flex-direction:column; gap:10px; margin-top:auto; padding-top:12px; border-top:1px solid var(--border); }
  .sb-project { display:flex; align-items:center; gap:10px; min-width:0; padding:4px 6px; color:var(--muted); }
  .sb-project > div { min-width:0; }
  .sb-project-name { overflow:hidden; color:var(--fg); font-size:13px; font-weight:600; text-overflow:ellipsis; white-space:nowrap; }
  .sb-project-path { overflow:hidden; font:11px/1.4 var(--font-mono); text-overflow:ellipsis; white-space:nowrap; direction:rtl; text-align:left; }
  .sb-row { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:0 2px 0 6px; }
  .sb-status { display:inline-flex; align-items:center; gap:7px; color:var(--muted); font-size:12px; }
  .live-dot { width:7px; height:7px; border-radius:50%; background:var(--ok-fg); box-shadow:0 0 0 3px color-mix(in srgb, var(--ok-fg) 20%, transparent); }
  .theme-switch { display:inline-flex; gap:2px; padding:2px; border:1px solid var(--border); border-radius:8px; background:var(--surface); }
  .theme-switch button { display:grid; place-items:center; width:26px; height:24px; padding:0; border:0; border-radius:6px; background:transparent; color:var(--muted); cursor:pointer; }
  .theme-switch button:hover { color:var(--fg); }
  .theme-switch button[aria-checked=true] { background:var(--surface-3); color:var(--fg); }
  .sb-scrim { display:none; }
  .main { min-height:100vh; margin-left:var(--sidebar); }
  .mobilebar { display:none; }
  .progress { position:fixed; top:0; right:0; left:var(--sidebar); z-index:60; height:2px; opacity:0; background:linear-gradient(90deg, transparent, var(--accent), transparent) no-repeat; background-size:40% 100%; transition:opacity .2s; pointer-events:none; }
  .progress.on { opacity:1; animation:slide 1s ease-in-out infinite; }
  .view { max-width:1320px; margin:0 auto; padding:30px 40px 112px; outline:none; }
  .page { animation:fade-in .18s ease-out; }
  .icon-btn { display:inline-grid; place-items:center; width:32px; height:32px; padding:0; border:0; border-radius:8px; background:transparent; color:var(--muted); cursor:pointer; }
  .icon-btn:hover { background:var(--surface-3); color:var(--fg); }

  .page-head { margin:0 0 24px; }
  .crumbs { display:flex; flex-wrap:wrap; align-items:center; gap:4px; margin:0 0 10px; color:var(--muted); font-size:13px; }
  .crumbs a { color:var(--muted); text-decoration:none; } .crumbs a:hover { color:var(--fg); }
  .crumbs .i { color:var(--faint); }
  .eyebrow { display:inline-flex; align-items:center; gap:7px; margin:0 0 10px; color:var(--muted); font:600 11.5px/1.2 var(--font-sans); letter-spacing:.06em; text-transform:uppercase; }
  .eyebrow a { color:inherit; }
  .eyebrow-accent { color:var(--accent-fg); }
  .eyebrow-sep { color:var(--faint); }
  .eyebrow-id { color:var(--fg-2); font:500 12px/1.2 var(--font-mono); letter-spacing:0; text-transform:none; text-decoration:none; }
  .eyebrow-id:hover { color:var(--fg); text-decoration:underline; }
  .page-head-row { display:flex; align-items:flex-start; justify-content:space-between; gap:16px 28px; }
  .page-head-text { flex:1 1 0; min-width:280px; max-width:880px; }
  .page-head h1 { display:flex; flex-wrap:wrap; align-items:center; gap:10px 14px; margin:0; font-size:26px; line-height:1.2; letter-spacing:-.025em; }
  .page-head h1 .badge { height:26px; padding:0 11px 0 10px; font-size:11.5px; }
  .id-title { overflow-wrap:anywhere; }
  .page-sub { margin:8px 0 0; color:var(--fg-2); font-size:14.5px; line-height:1.6; }
  .page-sub code { padding:1px 5px; border-radius:5px; background:var(--surface-3); font-size:12.5px; white-space:nowrap; }
  .page-actions { display:flex; flex:none; flex-wrap:wrap; align-items:center; justify-content:flex-end; gap:8px; margin-top:-1px; }

  .btn { display:inline-flex; align-items:center; justify-content:center; gap:7px; height:34px; padding:0 14px; border:1px solid transparent; border-radius:9px; font-size:13.5px; font-weight:550; line-height:1; white-space:nowrap; text-decoration:none; cursor:pointer; transition:background .12s, border-color .12s, color .12s, box-shadow .12s, opacity .12s; }
  .btn:disabled { opacity:.5; cursor:not-allowed; }
  .btn-primary { background:var(--fg); border-color:var(--fg); color:var(--bg); box-shadow:0 1px 2px rgba(0,0,0,.12), inset 0 1px 0 rgba(255,255,255,.12); }
  .btn-primary:hover:not(:disabled) { background:color-mix(in srgb, var(--fg) 86%, var(--bg)); }
  .btn-secondary { background:var(--surface); border-color:var(--border-2); color:var(--fg); box-shadow:var(--shadow-sm); }
  .btn-secondary:hover:not(:disabled) { background:var(--surface-2); border-color:color-mix(in srgb, var(--fg) 25%, var(--border-2)); }
  .btn-ghost { background:transparent; color:var(--fg-2); }
  .btn-ghost:hover:not(:disabled) { background:var(--surface-3); color:var(--fg); }
  .btn-danger { background:var(--harm); border-color:var(--harm); color:#fff; }
  .btn-danger:hover:not(:disabled) { background:color-mix(in srgb, var(--harm) 88%, #000); }
  .btn-sm { height:28px; padding:0 10px; border-radius:7px; font-size:12.5px; }
  .btn-block { width:100%; }
  .btn-group { display:inline-flex; }
  .btn-group .btn { border-radius:0; } .btn-group .btn + .btn { margin-left:-1px; }
  .btn-group .btn:first-child { border-radius:9px 0 0 9px; } .btn-group .btn:last-child { border-radius:0 9px 9px 0; }
  .busy { cursor:progress; }
  .link-quiet { display:inline-flex; align-items:center; gap:5px; color:var(--muted); font-size:13px; text-decoration:none; }
  .link-quiet:hover { color:var(--fg); }

  .card { position:relative; padding:18px 20px; border:1px solid var(--border); border-radius:12px; background:var(--surface); box-shadow:var(--shadow-sm); }
  .card-head { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; margin:0 0 14px; }
  .card-head h2 { margin:0; font-size:15px; }
  .card-head > .muted:last-child, .card-head > .link-quiet:last-child, .card-head > .chip-row:last-child { margin-left:auto; }
  .card-flush { padding:0; overflow:hidden; }
  .card-flush > .card-head { margin:0; padding:14px 18px; border-bottom:1px solid var(--border); }
  .card.flash, .run-card.flash { animation:flash 1.2s ease-out; }
  .chip-row { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
  .world-chip { display:inline-flex; align-items:center; gap:6px; height:24px; padding:0 9px; border:1px solid var(--border); border-radius:999px; background:var(--surface); color:var(--fg-2); font-size:12.5px; font-weight:500; white-space:nowrap; }
  .world-chip .i { color:var(--muted); }
  .tags { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin:0 0 18px; }
  .tags-label { margin-right:4px; color:var(--muted); font-size:12.5px; }
  .tag { height:24px; padding:0 10px; border:1px solid var(--border); border-radius:999px; background:transparent; color:var(--fg-2); font-size:12px; font-weight:500; cursor:pointer; transition:all .12s; }
  .tag:hover { border-color:var(--border-2); color:var(--fg); }
  .tag.on { border-color:var(--fg); background:var(--fg); color:var(--bg); }
  .tag.static { display:inline-flex; align-items:center; background:var(--surface-2); cursor:default; }
  .fault-tag { display:inline-flex; align-items:center; gap:5px; padding:2px 8px; border-radius:6px; background:var(--warn-bg); color:var(--warn-fg); font:500 11.5px/18px var(--font-mono); white-space:nowrap; }
  .fault-tag.none { background:var(--surface-3); color:var(--muted); }
  .code-chip { display:inline-flex; align-items:center; padding:1px 7px; border:1px solid var(--border); border-radius:6px; background:var(--surface-2); color:var(--fg-2); font-size:11.5px; line-height:18px; white-space:nowrap; }
  .src-tag { display:inline-flex; align-items:center; padding:0 7px; border:1px solid var(--border); border-radius:999px; color:var(--muted); font-size:11px; font-weight:500; line-height:18px; white-space:nowrap; }
  .src-tag.builtin { background:var(--surface-2); }
  .tag-unsaved { display:inline-flex; align-items:center; padding:0 7px; border-radius:999px; background:var(--accent-soft); color:var(--accent-fg); font-size:11px; font-weight:600; line-height:18px; white-space:nowrap; }
  .vdot { display:inline-block; flex:none; width:8px; height:8px; border-radius:50%; background:var(--v, var(--faint)); }
  .mark-ok { color:var(--ok-fg); font-weight:700; }
  .mark-bad { color:var(--bad-fg); font-size:12px; font-weight:600; white-space:nowrap; }
  .alert { display:flex; align-items:flex-start; gap:10px; margin:0 0 18px; padding:12px 14px; border:1px solid transparent; border-radius:10px; font-size:13.5px; line-height:1.5; }
  .alert > .i { margin-top:1px; }
  .alert ul { margin:6px 0 0; padding-left:18px; color:var(--fg-2); }
  .alert-bad { border-color:color-mix(in srgb, var(--bad-fg) 25%, transparent); background:var(--bad-bg); } .alert-bad > .i { color:var(--bad-fg); }
  .alert-ok { border-color:color-mix(in srgb, var(--ok-fg) 25%, transparent); background:var(--ok-bg); } .alert-ok > .i { color:var(--ok-fg); }
  .hint { display:flex; align-items:center; gap:10px; margin:0 0 18px; padding:12px 14px; border:1px dashed var(--border-2); border-radius:10px; color:var(--fg-2); font-size:13.5px; }
  .hint .i { color:var(--muted); }
  .empty { padding:44px 24px; border:1px dashed var(--border-2); border-radius:12px; text-align:center; }
  .empty-icon { display:grid; place-items:center; width:44px; height:44px; margin:0 auto 14px; border-radius:12px; background:var(--surface-3); color:var(--muted); }
  .empty h3 { margin:0 0 6px; font-size:15px; }
  .empty p { max-width:520px; margin:0 auto; color:var(--muted); font-size:13.5px; line-height:1.6; }
  .empty-actions { display:flex; flex-wrap:wrap; justify-content:center; gap:8px; margin-top:18px; }
  .card .empty { border:0; padding:28px 12px; }
  .vbar { display:flex; gap:2px; height:8px; overflow:hidden; border-radius:999px; background:var(--surface-3); }
  .vbar span { min-width:4px; background:var(--v); }
  .vbar-sm { height:6px; min-width:120px; }
  .vlegend { display:grid; gap:2px; margin:16px 0 0; padding:0; list-style:none; }
  .vlegend li { display:flex; align-items:center; gap:10px; padding:5px 0; font-size:12.5px; }
  .vlegend .sw { width:10px; height:10px; border-radius:3px; background:var(--v); }
  .vlegend code { color:var(--fg-2); font-size:11.5px; }
  .vlegend b { margin-left:auto; font-weight:600; font-variant-numeric:tabular-nums; }
  .vlegend-muted li { opacity:.75; }

  .hero { position:relative; display:grid; grid-template-columns:minmax(0,1.05fr) minmax(0,1fr); gap:32px; margin:0 0 20px; padding:30px; overflow:hidden; border:1px solid var(--border); border-radius:16px;
    background:radial-gradient(900px 340px at 105% -10%, color-mix(in srgb, var(--accent) 13%, transparent), transparent 62%), radial-gradient(600px 300px at -10% 120%, color-mix(in srgb, var(--harm) 7%, transparent), transparent 60%), var(--surface); box-shadow:var(--shadow); }
  .hero-copy { display:flex; flex-direction:column; justify-content:center; }
  .hero h2 { max-width:520px; margin:0 0 12px; font-size:27px; line-height:1.18; letter-spacing:-.03em; }
  .hero p { max-width:540px; margin:0 0 22px; color:var(--fg-2); font-size:15px; line-height:1.6; }
  .hero-actions { display:flex; flex-wrap:wrap; gap:8px; }
  .hero-art { position:relative; display:flex; flex-direction:column; gap:8px; padding:18px; border:1px solid var(--border); border-radius:12px; background:color-mix(in srgb, var(--bg) 70%, transparent); backdrop-filter:blur(6px); }
  .hero-art::before { content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none; background-image:linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px); background-size:22px 22px; opacity:.45; mask-image:radial-gradient(ellipse at 70% 30%, #000 10%, transparent 75%); }
  .hero-art-head { position:relative; margin:0 0 4px; }
  .mini-lane { position:relative; display:grid; grid-template-columns:118px minmax(40px,1fr) 128px; align-items:center; gap:12px; padding:7px 10px; border:1px solid var(--border); border-radius:9px; background:var(--surface); animation:fade-up .5s cubic-bezier(.2,.8,.2,1) both; animation-delay:calc(var(--i) * 90ms + 120ms); }
  .mini-lane code { overflow:hidden; color:var(--fg-2); font-size:11.5px; text-overflow:ellipsis; white-space:nowrap; }
  .mini-lane .badge { justify-self:end; height:20px; font-size:10px; }
  .mini-track { position:relative; display:flex; align-items:center; gap:14px; }
  .mini-track::before { content:""; position:absolute; left:0; right:0; top:50%; height:1px; background:var(--border-2); }
  .mini-track .n { position:relative; display:grid; place-items:center; width:9px; height:9px; border-radius:50%; background:var(--ok-fg); box-shadow:0 0 0 3px var(--surface); }
  .mini-track .n.bolt { width:16px; height:16px; background:var(--warn-bg); color:var(--warn-fg); box-shadow:0 0 0 1px color-mix(in srgb, var(--warn-fg) 45%, transparent), 0 0 0 3px var(--surface); }
  .mini-track .line { flex:1; }
  .metrics { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:14px; margin:0 0 20px; }
  .metric { display:block; min-width:0; padding:16px 18px; border:1px solid var(--border); border-radius:12px; background:var(--surface); color:inherit; text-decoration:none; box-shadow:var(--shadow-sm); transition:border-color .15s, box-shadow .15s, transform .15s; }
  .metric:hover { border-color:var(--border-2); box-shadow:var(--shadow); transform:translateY(-1px); }
  .metric-top { display:flex; align-items:center; gap:10px; color:var(--fg-2); font-size:13px; font-weight:500; }
  .metric-icon { display:grid; place-items:center; width:28px; height:28px; border-radius:8px; background:var(--surface-3); color:var(--fg-2); }
  .metric-go { margin-left:auto; color:var(--muted); opacity:0; transform:translateX(-4px); transition:all .15s; }
  .metric:hover .metric-go { opacity:1; transform:none; }
  .metric-num { margin:12px 0 2px; font-size:30px; font-weight:600; line-height:1.1; letter-spacing:-.03em; font-variant-numeric:tabular-nums; }
  .metric-sub { overflow:hidden; color:var(--muted); font-size:12.5px; text-overflow:ellipsis; white-space:nowrap; }
  .metric-sub code { font-size:11.5px; }
  .ov-grid { display:grid; grid-template-columns:minmax(0,1.65fr) minmax(0,1fr); gap:16px; margin:0 0 20px; }
  .result-list { display:flex; flex-direction:column; gap:2px; margin:0 -8px; padding:0; list-style:none; }
  .result-list a { display:grid; grid-template-columns:150px minmax(0,1fr) auto; align-items:center; gap:14px; padding:9px 10px; border-radius:9px; color:inherit; text-decoration:none; transition:background .12s; }
  .result-list a:hover { background:var(--surface-2); }
  .result-list .badge { justify-self:start; }
  .rl-main { display:flex; flex-direction:column; min-width:0; }
  .rl-main code { overflow:hidden; color:var(--fg); font-size:12.5px; font-weight:600; text-overflow:ellipsis; white-space:nowrap; }
  .rl-agent { overflow:hidden; color:var(--muted); font-size:12.5px; text-overflow:ellipsis; white-space:nowrap; }
  .rl-meta { color:var(--muted); font-size:12px; white-space:nowrap; }
  .steps { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:14px; }
  .step { display:flex; flex-direction:column; padding:18px 20px; border:1px solid var(--border); border-radius:12px; background:linear-gradient(180deg, var(--surface), var(--surface-2)); color:inherit; text-decoration:none; transition:border-color .15s, transform .15s; }
  .step:hover { border-color:var(--border-2); transform:translateY(-1px); }
  .step-num { display:grid; place-items:center; width:24px; height:24px; margin:0 0 12px; border:1px solid var(--border-2); border-radius:7px; background:var(--surface); color:var(--fg-2); font:600 12px/1 var(--font-mono); }
  .step h3 { margin:0 0 6px; font-size:14.5px; }
  .step p { flex:1; margin:0 0 14px; color:var(--fg-2); font-size:13.5px; line-height:1.55; }
  .step-cli code { padding:2px 7px; border:1px solid var(--border); border-radius:6px; background:var(--surface); color:var(--muted); font-size:11.5px; }

  .demo-hero { position:relative; margin:0 0 24px; padding:4px 0 0; }
  .demo-hero h1 { margin:0 0 12px; font-size:34px; line-height:1.12; letter-spacing:-.035em; }
  .lede { max-width:800px; margin:0; color:var(--fg-2); font-size:16px; line-height:1.65; }
  .demo-steps { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:14px; margin:0 0 30px; padding:0; list-style:none; }
  .demo-step { display:flex; flex-direction:column; padding:18px 20px; border:1px solid var(--border); border-radius:12px; background:var(--surface); box-shadow:var(--shadow-sm); }
  .demo-step h3 { margin:0 0 10px; font-size:14.5px; }
  .demo-step p { margin:0; color:var(--fg-2); font-size:13.5px; line-height:1.6; }
  .demo-step blockquote { margin:0 0 12px; padding:10px 14px; border-left:3px solid var(--accent); border-radius:0 8px 8px 0; background:var(--surface-2); font-size:14.5px; line-height:1.55; }
  .fault-flow { display:flex; flex-wrap:wrap; align-items:center; gap:6px 0; margin:0 0 12px; }
  .ff-node { display:inline-flex; align-items:center; gap:5px; height:26px; padding:0 9px; border:1px solid var(--border); border-radius:7px; background:var(--surface-2); color:var(--fg-2); font-size:12px; font-weight:500; white-space:nowrap; }
  .ff-node code { font-size:11.5px; }
  .ff-ok { border-color:color-mix(in srgb, var(--ok-fg) 35%, transparent); background:var(--ok-bg); color:var(--ok-fg); }
  .ff-bad { border-color:color-mix(in srgb, var(--warn-fg) 40%, transparent); background:var(--warn-bg); color:var(--warn-fg); }
  .ff-arrow { position:relative; width:18px; height:1px; background:var(--border-2); }
  .ff-arrow::after { content:""; position:absolute; right:0; top:-3px; border:3.5px solid transparent; border-left:5px solid var(--border-2); border-right:0; }
  .ff-broken { background:repeating-linear-gradient(90deg, var(--bad-fg) 0 3px, transparent 3px 6px); }
  .ff-broken::after { border-left-color:var(--bad-fg); }
  .section-head { display:flex; flex-wrap:wrap; align-items:flex-end; justify-content:space-between; gap:12px 24px; margin:0 0 14px; }
  .section-head h2 { margin:0 0 4px; font-size:18px; letter-spacing:-.015em; }
  .section-head p { margin:0; font-size:13.5px; }
  .lanes { display:flex; flex-direction:column; gap:10px; }
  .lane { display:grid; grid-template-columns:230px minmax(0,1fr) 290px; align-items:center; gap:22px; min-height:92px; padding:16px 18px; border:1px solid var(--border); border-radius:12px; background:var(--surface); color:inherit; text-decoration:none; box-shadow:var(--shadow-sm); }
  .lane-done { box-shadow:inset 3px 0 0 var(--v), var(--shadow-sm); animation:fade-up .55s cubic-bezier(.2,.8,.2,1) both; animation-delay:calc(var(--i) * 110ms); transition:border-color .15s, box-shadow .15s, transform .15s; }
  .lane-done:hover { border-color:var(--border-2); box-shadow:inset 3px 0 0 var(--v), var(--shadow); transform:translateY(-1px); }
  .lane.mismatch { border-color:var(--bad-fg); }
  .lane-agent { display:flex; align-items:flex-start; gap:10px; min-width:0; }
  .lane-agent > .i { margin-top:2px; color:var(--muted); }
  .lane-agent code { color:var(--fg); font-size:13px; font-weight:600; }
  .lane-agent p { margin:3px 0 0; color:var(--muted); font-size:12.5px; line-height:1.45; }
  .lane-track { min-width:0; }
  .lane-skel { display:block; height:10px; margin:6px 0; border-radius:6px; background:linear-gradient(90deg, var(--surface-3) 25%, var(--surface-2) 50%, var(--surface-3) 75%); background-size:200% 100%; }
  .lane-skel.short { width:60%; }
  .is-running .lane-skel { animation:shimmer 1.2s linear infinite; }
  .track { display:flex; align-items:flex-start; margin:0; padding:0; list-style:none; }
  .tstep { position:relative; display:flex; flex:none; flex-direction:column; gap:3px; min-width:0; padding:0 26px 0 0; }
  .tstep::before { content:""; position:absolute; top:5px; left:12px; right:6px; height:2px; border-radius:2px; background:var(--border); }
  .tstep:last-child::before { display:none; }
  .tnode { position:relative; z-index:1; width:12px; height:12px; margin-bottom:4px; border:2px solid var(--border-2); border-radius:50%; background:var(--surface); }
  .tstep.committed .tnode { border-color:var(--ok-fg); background:var(--ok-fg); }
  .tstep.failed .tnode { border-color:var(--bad-fg); background:var(--bad-fg); }
  .tstep.faulted .tnode { box-shadow:0 0 0 3px var(--surface), 0 0 0 5px color-mix(in srgb, var(--warn-fg) 70%, transparent); }
  .tstep code { color:var(--fg); font-size:12px; font-weight:600; white-space:nowrap; }
  .tstep small { display:inline-flex; align-items:center; gap:3px; color:var(--muted); font-size:11.5px; white-space:nowrap; }
  .tstep.faulted small { color:var(--warn-fg); }
  .tstep-final { flex:1 1 auto; padding-right:0; }
  .tstep-final .tnode { border-radius:3px; border-color:var(--fg); }
  .tstep q { display:-webkit-box; overflow:hidden; color:var(--fg-2); font-size:12.5px; line-height:1.45; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
  .lane-verdict { min-width:0; }
  .lane-verdict p { display:-webkit-box; margin:7px 0 0; overflow:hidden; color:var(--fg-2); font-size:12.5px; line-height:1.45; -webkit-line-clamp:3; -webkit-box-orient:vertical; }
  .demo-outcome { margin:26px 0 0; animation:fade-up .5s .55s cubic-bezier(.2,.8,.2,1) both; }
  .outcome-banner { display:flex; align-items:flex-start; gap:12px; margin:0 0 16px; padding:14px 16px; border:1px solid transparent; border-radius:12px; }
  .outcome-banner.ok { border-color:color-mix(in srgb, var(--ok-fg) 25%, transparent); background:var(--ok-bg); } .outcome-banner.ok > .i { color:var(--ok-fg); }
  .outcome-banner.bad { border-color:color-mix(in srgb, var(--bad-fg) 25%, transparent); background:var(--bad-bg); } .outcome-banner.bad > .i { color:var(--bad-fg); }
  .outcome-banner strong { font-size:14.5px; } .outcome-banner p { margin:3px 0 0; color:var(--fg-2); font-size:13.5px; }
  .legend-grid { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:10px; margin:0 0 16px; }
  .legend-item { display:flex; align-items:flex-start; gap:12px; padding:14px; border:1px solid var(--border); border-radius:12px; background:var(--surface); opacity:.55; }
  .legend-item.present { opacity:1; box-shadow:var(--shadow-sm); }
  .legend-icon { display:grid; flex:none; place-items:center; width:32px; height:32px; border-radius:9px; background:var(--v-bg); color:var(--v-fg); }
  .legend-item code { color:var(--v-fg); font-size:12px; font-weight:600; }
  .legend-item p { margin:4px 0 0; color:var(--fg-2); font-size:12.5px; line-height:1.5; }
  .next-grid { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:10px; }
  .next { display:flex; align-items:flex-start; gap:12px; padding:16px; border:1px solid var(--border); border-radius:12px; background:var(--surface); color:inherit; text-decoration:none; transition:border-color .15s, transform .15s; }
  .next:hover { border-color:var(--border-2); transform:translateY(-1px); }
  .next > .i { margin-top:1px; color:var(--accent); }
  .next strong { font-size:14px; } .next p { margin:4px 0 0; color:var(--muted); font-size:13px; line-height:1.5; }

  .split, .detail { display:grid; grid-template-columns:minmax(0,1fr) 340px; align-items:start; gap:24px; }
  .split-side, .detail-side { position:sticky; top:20px; display:flex; flex-direction:column; gap:16px; }
  .detail-main { display:flex; flex-direction:column; gap:16px; min-width:0; }
  .filterbar { display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin:0 0 12px; }
  .search { display:flex; flex:1 1 260px; align-items:center; gap:8px; max-width:420px; height:36px; padding:0 8px 0 11px; border:1px solid var(--border-2); border-radius:9px; background:var(--surface); color:var(--muted); box-shadow:var(--shadow-sm); transition:border-color .15s, box-shadow .15s; }
  .search:focus-within { border-color:var(--focus); box-shadow:0 0 0 3px var(--accent-soft); }
  .search input { flex:1; min-width:0; height:100%; padding:0; border:0; outline:0; background:transparent; color:var(--fg); font-size:13.5px; }
  .search input::-webkit-search-cancel-button { filter:grayscale(1); }
  .seg { display:inline-flex; gap:2px; padding:3px; border:1px solid var(--border); border-radius:10px; background:var(--surface-2); }
  .seg-wrap { flex-wrap:wrap; }
  .seg-btn { display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 10px; border:0; border-radius:7px; background:transparent; color:var(--fg-2); font-size:12.5px; font-weight:500; white-space:nowrap; cursor:pointer; transition:background .12s, color .12s; }
  .seg-btn:hover { color:var(--fg); }
  .seg-btn.on { background:var(--surface); color:var(--fg); box-shadow:var(--shadow-sm), 0 0 0 1px var(--border); }
  .seg-btn .i { color:var(--muted); }
  .seg-btn .vdot { width:7px; height:7px; }
  .seg-btn[data-verdict]:not([data-verdict=""]) { font-family:var(--font-mono); font-size:11.5px; }
  .seg-count { color:var(--muted); font:500 11px/1 var(--font-sans); font-variant-numeric:tabular-nums; }
  .scn-list { display:flex; flex-direction:column; gap:20px; }
  .scn-group-label { display:flex; align-items:center; gap:8px; margin:0 0 8px 2px; color:var(--muted); font:600 11.5px/1 var(--font-sans); letter-spacing:.06em; text-transform:uppercase; }
  .scn-group-label span { color:var(--faint); font-variant-numeric:tabular-nums; }
  .scn-row { position:relative; display:grid; grid-template-columns:22px 34px minmax(0,1fr) auto; align-items:start; gap:14px; margin-top:-1px; padding:14px 16px; border:1px solid var(--border); background:var(--surface); transition:background .12s; }
  .scn-group > .scn-row:nth-child(2) { margin-top:0; border-radius:12px 12px 0 0; }
  .scn-group > .scn-row:last-child { border-radius:0 0 12px 12px; }
  .scn-group > .scn-row:nth-child(2):last-child { border-radius:12px; }
  .scn-row:hover { z-index:1; background:var(--surface-2); }
  .scn-row.selected { z-index:2; border-color:color-mix(in srgb, var(--accent) 45%, var(--border)); background:color-mix(in srgb, var(--accent) 5%, var(--surface)); }
  .check { position:relative; display:inline-grid; margin-top:9px; cursor:pointer; }
  .check input, .agent-opt input { position:absolute; opacity:0; width:1px; height:1px; pointer-events:none; }
  .check-box { display:grid; place-items:center; width:17px; height:17px; border:1.5px solid var(--border-2); border-radius:5px; background:var(--surface); color:transparent; transition:all .12s; }
  input:checked + .check-box { border-color:var(--accent); background:var(--accent); color:#fff; }
  input:focus-visible + .check-box { outline:2px solid var(--focus); outline-offset:2px; }
  .check:hover .check-box, .agent-opt:hover .check-box { border-color:color-mix(in srgb, var(--fg) 35%, var(--border-2)); }
  .scn-icon { display:grid; place-items:center; width:34px; height:34px; border-radius:9px; background:var(--surface-3); color:var(--fg-2); }
  .scn-body { min-width:0; }
  .scn-id { color:var(--fg); font:600 13.5px/1.4 var(--font-mono); text-decoration:none; overflow-wrap:anywhere; }
  .scn-id:hover { text-decoration:underline; }
  .scn-desc { margin:3px 0 9px; color:var(--fg-2); font-size:13.5px; line-height:1.5; }
  .scn-meta { display:flex; flex-wrap:wrap; align-items:center; gap:6px 12px; }
  .scn-checks { display:inline-flex; align-items:center; gap:5px; color:var(--muted); font-size:12px; }
  .scn-agents { display:flex; align-items:center; gap:4px; padding-top:9px; }
  .scn-agents-n { margin-left:6px; color:var(--muted); font-size:12px; white-space:nowrap; }

  .run-card { display:flex; flex-direction:column; gap:14px; padding:16px; }
  .run-card-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .run-card-head h2 { margin:0; font-size:15px; }
  .agent-quick { display:inline-flex; gap:2px; }
  .agent-quick button { height:24px; padding:0 8px; border:0; border-radius:6px; background:transparent; color:var(--muted); font-size:12px; cursor:pointer; }
  .agent-quick button:hover { background:var(--surface-3); color:var(--fg); }
  .agent-pick { display:flex; flex-direction:column; gap:1px; max-height:min(44vh, 400px); margin:0 -8px; padding:0 4px; overflow:auto; border:0; }
  .agent-opt { position:relative; display:grid; grid-template-columns:17px minmax(0,1fr) auto; align-items:start; gap:10px; padding:8px; border-radius:8px; cursor:pointer; transition:background .12s; }
  .agent-opt:hover { background:var(--surface-2); }
  .agent-opt .check-box { margin-top:1px; }
  .agent-opt-body { display:flex; flex-direction:column; min-width:0; }
  .agent-opt-body code { color:var(--fg); font-size:12.5px; font-weight:600; }
  .agent-opt-body small { display:-webkit-box; margin-top:2px; overflow:hidden; color:var(--muted); font-size:12px; line-height:1.4; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
  .run-opts { display:grid; grid-template-columns:92px minmax(0,1fr); gap:10px; }
  .field { display:flex; flex-direction:column; gap:5px; min-width:0; }
  .field > span { color:var(--muted); font-size:12px; font-weight:500; }
  .field input { width:100%; height:34px; padding:0 10px; border:1px solid var(--border-2); border-radius:8px; background:var(--surface); outline:none; transition:border-color .15s, box-shadow .15s; }
  .field input:focus { border-color:var(--focus); box-shadow:0 0 0 3px var(--accent-soft); }
  .field input::placeholder { color:var(--faint); }
  .note { margin:0; color:var(--muted); font-size:12.5px; line-height:1.5; }

  blockquote.task { margin:0; padding:2px 0 2px 16px; border-left:3px solid var(--accent); font-size:16px; line-height:1.6; }
  .fault-list { margin:0; padding:0; list-style:none; }
  .fault-list li { display:grid; grid-template-columns:32px minmax(0,1fr) auto; align-items:start; gap:12px; padding:12px 0; border-top:1px solid var(--border); }
  .fault-list li:first-child { padding-top:0; border-top:0; }
  .fault-list li:last-child { padding-bottom:0; }
  .fault-icon { display:grid; place-items:center; width:32px; height:32px; border-radius:9px; background:var(--warn-bg); color:var(--warn-fg); }
  .fault-list code { color:var(--fg); font-size:13px; font-weight:600; }
  .fault-list p { margin:3px 0 0; color:var(--muted); font-size:13px; }
  .stage-pill { display:inline-flex; align-items:center; height:22px; padding:0 9px; border:1px solid var(--border); border-radius:999px; color:var(--fg-2); font-size:11.5px; white-space:nowrap; }
  .expect-rows { margin:0; padding:0; list-style:none; }
  .expect-rows li { display:flex; align-items:flex-start; gap:10px; padding:7px 0; font-size:13.5px; line-height:1.5; }
  .expect-rows .i { margin-top:2px; color:var(--muted); }
  .facts { margin:12px 0 0; padding:8px 0 0; border-top:1px solid var(--border); }
  .facts > div { display:grid; grid-template-columns:90px minmax(0,1fr); gap:12px; padding:7px 0; }
  .facts dt { color:var(--muted); font-size:12.5px; padding-top:2px; }
  .facts dd { margin:0; }
  .policy { display:inline-flex; align-items:center; gap:5px; padding:2px 8px; border-radius:6px; background:var(--ok-bg); color:var(--ok-fg); font-size:12px; }
  .policy code { font-size:11.5px; }
  .code-view { display:flex; max-height:540px; overflow:auto; background:var(--surface); font:12.5px/1.7 var(--font-mono); }
  .code-gutter { position:sticky; left:0; flex:none; padding:14px 12px 14px 16px; border-right:1px solid var(--border); background:var(--surface-2); color:var(--faint); text-align:right; user-select:none; font-variant-numeric:tabular-nums; }
  .code-gutter span, .ce-lines span { display:block; }
  .code-view pre.code { flex:1; margin:0; padding:14px 18px; border:0; border-radius:0; background:transparent; font:inherit; white-space:pre; overflow:visible; }
  .ev-list { margin:0; padding:0; list-style:none; }
  .ev-list li { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:9px 0; border-top:1px solid var(--border); }
  .ev-list li:first-child { padding-top:0; border-top:0; } .ev-list li:last-child { padding-bottom:0; }
  .ev-list code { color:var(--fg-2); font-size:12.5px; }

  .run-list { overflow:hidden; border:1px solid var(--border); border-radius:12px; background:var(--surface); box-shadow:var(--shadow-sm); }
  .run-item { display:grid; grid-template-columns:minmax(0,1fr) 200px 160px 16px; align-items:center; gap:20px; padding:16px 18px; border-top:1px solid var(--border); color:inherit; text-decoration:none; transition:background .12s; }
  .run-item:first-child { border-top:0; }
  .run-item:hover { background:var(--surface-2); }
  .run-item-title { overflow:hidden; color:var(--fg); font:600 13.5px/1.4 var(--font-mono); text-overflow:ellipsis; white-space:nowrap; }
  .run-item-sub { margin-top:3px; color:var(--muted); font-size:12.5px; }
  .run-item-status { font-size:13px; }
  .status-ok, .status-bad { display:inline-flex; align-items:center; gap:6px; font-weight:500; }
  .status-ok { color:var(--ok-fg); } .status-bad { color:var(--bad-fg); }
  .run-item-go { color:var(--faint); }
  .run-summary { display:grid; grid-template-columns:auto minmax(0,1fr); align-items:center; gap:32px; margin:0 0 18px; }
  .stat-row { display:flex; flex-wrap:wrap; gap:10px; }
  .stat-tile { display:flex; flex-direction:column; min-width:150px; padding:12px 14px; border:1px solid var(--border); border-radius:10px; background:var(--surface-2); }
  .stat-tile span { color:var(--muted); font-size:12px; font-weight:500; }
  .stat-tile b { margin:4px 0 2px; font-size:24px; font-weight:600; line-height:1.1; letter-spacing:-.02em; font-variant-numeric:tabular-nums; }
  .stat-tile em { color:var(--muted); font-size:16px; font-style:normal; font-weight:500; }
  .stat-tile small { color:var(--muted); font-size:11.5px; }
  .stat-tile.bad { border-color:color-mix(in srgb, var(--bad-fg) 30%, transparent); background:var(--bad-bg); } .stat-tile.bad b { color:var(--bad-fg); }
  .run-summary-bar .vlegend { grid-template-columns:repeat(auto-fill, minmax(190px, 1fr)); column-gap:18px; }
  .matrix-wrap { max-height:calc(100vh - 120px); overflow:auto; border:1px solid var(--border); border-radius:12px; background:var(--surface); box-shadow:var(--shadow-sm); }
  .matrix { width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; }
  .matrix thead th { position:sticky; top:0; z-index:2; padding:11px 12px; border-bottom:1px solid var(--border); background:var(--surface-2); text-align:left; }
  .matrix thead th code { display:block; overflow:hidden; color:var(--fg); font-size:12px; font-weight:600; text-overflow:ellipsis; }
  .matrix .matrix-corner { left:0; z-index:3; width:210px; border-right:1px solid var(--border); }
  .matrix tbody th { position:sticky; left:0; z-index:1; padding:14px; border-right:1px solid var(--border); border-bottom:1px solid var(--border); background:var(--surface); text-align:left; font-weight:400; }
  .matrix tbody th a { color:var(--fg); font:600 12.5px/1.4 var(--font-mono); text-decoration:none; overflow-wrap:anywhere; }
  .matrix tbody th a:hover { text-decoration:underline; }
  .matrix td { padding:8px; border-bottom:1px solid var(--border); vertical-align:top; }
  .matrix tbody tr:last-child > * { border-bottom:0; }
  .cell { display:flex; flex-direction:column; gap:7px; height:100%; padding:10px; border-radius:9px; background:color-mix(in srgb, var(--v-bg) 65%, var(--surface)); color:inherit; text-decoration:none; box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--v-bd) 70%, transparent); transition:box-shadow .15s, transform .15s; }
  a.cell:hover { box-shadow:inset 0 0 0 1px var(--v-bd), var(--shadow); transform:translateY(-1px); }
  .cell.mismatch { box-shadow:inset 0 0 0 2px var(--bad-fg); }
  .cell-top { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
  .cell .badge { padding:0 8px 0 7px; font-size:10.5px; }
  .cell .why { display:-webkit-box; overflow:hidden; color:var(--fg-2); font-size:12.5px; line-height:1.45; -webkit-line-clamp:3; -webkit-box-orient:vertical; }
  .cell-empty { color:var(--faint); font-size:12px; }

  .table-wrap { overflow:auto; border:1px solid var(--border); border-radius:12px; background:var(--surface); box-shadow:var(--shadow-sm); }
  .table-wrap.flush { border:0; border-radius:0; box-shadow:none; }
  .tbl th { position:sticky; top:0; z-index:1; padding:10px 14px; border-bottom:1px solid var(--border); background:var(--surface-2); }
  .tbl td { padding:11px 14px; font-size:13.5px; vertical-align:middle; }
  .tbl tbody tr:last-child td { border-bottom:0; }
  .tbl tr[data-href] { cursor:pointer; }
  .tbl tbody tr:hover td { background:var(--surface-2); }
  .tbl tr.selected td { background:color-mix(in srgb, var(--accent) 6%, var(--surface)); }
  .tbl .num { text-align:right; font-variant-numeric:tabular-nums; }
  .tbl .col-check { width:46px; padding-right:0; }
  .tbl .check { margin:0; }
  .tbl code { color:var(--fg-2); font-size:12.5px; white-space:nowrap; }
  .row-link { color:var(--fg); font:600 13px/1.4 var(--font-mono); text-decoration:none; white-space:nowrap; }
  .row-link:hover { text-decoration:underline; }
  .rule { color:var(--fg-2); font-size:12px; }
  .rule.add { color:var(--ok-fg); } .rule.del { color:var(--bad-fg); }
  .where { white-space:nowrap; }
  .where small { display:block; margin-top:3px; color:var(--muted); font-size:11.5px; }
  .tag-saved { display:inline-flex; align-items:center; padding:0 7px; border:1px solid var(--border); border-radius:999px; background:var(--surface-2); color:var(--fg-2); font-size:11px; font-weight:600; line-height:18px; cursor:help; }
  .tbl td.mono { white-space:nowrap; }
  .tbl .seed { display:inline-block; max-width:220px; overflow:hidden; text-overflow:ellipsis; vertical-align:middle; }
  .tbl .rules { display:flex; flex-direction:column; align-items:flex-start; gap:2px; }
  .selbar { position:fixed; bottom:22px; left:calc(50% + var(--sidebar) / 2); z-index:50; display:flex; align-items:center; gap:8px; padding:8px 8px 8px 16px; border:1px solid var(--border-2); border-radius:12px; background:var(--surface); box-shadow:var(--shadow-lg); opacity:0; pointer-events:none; transform:translate(-50%, 16px); transition:opacity .18s, transform .18s; }
  .selbar.show { opacity:1; pointer-events:auto; transform:translate(-50%, 0); }
  .selbar-count { margin-right:6px; font-size:13px; font-weight:600; white-space:nowrap; }

  .meta-chips { display:flex; flex-wrap:wrap; gap:6px; }
  .meta-chip { display:inline-flex; align-items:center; gap:6px; max-width:100%; height:26px; padding:0 10px; overflow:hidden; border:1px solid var(--border); border-radius:999px; background:var(--surface); color:var(--fg-2); font-size:12.5px; white-space:nowrap; }
  .meta-chip > :last-child { overflow:hidden; text-overflow:ellipsis; }
  .meta-chip .i { color:var(--muted); }
  .meta-chip code, .meta-chip .mono { font-size:12px; }
  .page-report .rpt { --sticky-top:20px; }

  .cmp { margin:0 0 18px; overflow:hidden; border:1px solid var(--border); border-radius:12px; background:var(--surface); box-shadow:var(--shadow-sm); }
  .cmp-head { display:flex; align-items:center; gap:14px; padding:18px 20px; }
  .cmp.ok .cmp-head { background:var(--ok-bg); } .cmp.bad .cmp-head { background:var(--bad-bg); }
  .cmp-icon { display:grid; place-items:center; } .cmp.ok .cmp-icon { color:var(--ok-fg); } .cmp.bad .cmp-icon { color:var(--bad-fg); }
  .cmp-head h2 { margin:0; font-size:18px; letter-spacing:-.015em; }
  .cmp-head p { margin:3px 0 0; color:var(--fg-2); font-size:13px; }
  .cmp-stats { display:flex; flex-wrap:wrap; gap:6px; padding:12px 20px; border-top:1px solid var(--border); border-bottom:1px solid var(--border); }
  .cmp-stat { display:inline-flex; align-items:baseline; gap:6px; padding:4px 10px; border-radius:999px; background:var(--surface-2); color:var(--muted); font-size:12.5px; }
  .cmp-stat b { color:var(--fg); font-size:13.5px; font-variant-numeric:tabular-nums; }
  .cmp-stat.zero { opacity:.6; }
  .cmp-stat.bad { background:var(--bad-bg); color:var(--bad-fg); } .cmp-stat.bad b { color:var(--bad-fg); }
  .cmp-stat.ok { background:var(--ok-bg); color:var(--ok-fg); } .cmp-stat.ok b { color:var(--ok-fg); }
  .kind { display:inline-flex; align-items:center; padding:1px 8px; border-radius:6px; background:var(--surface-3); color:var(--fg-2); font-size:12px; font-weight:600; line-height:20px; white-space:nowrap; }
  .kind.bad { background:var(--bad-bg); color:var(--bad-fg); } .kind.ok { background:var(--ok-bg); color:var(--ok-fg); } .kind.muted { background:transparent; color:var(--muted); }
  .transition { display:inline-flex; flex-wrap:wrap; align-items:center; gap:6px; color:var(--muted); }
  .ci-card { margin-top:18px; }
  .cmd-block { position:relative; }
  .cmd-block pre.code { padding:14px 90px 14px 16px; white-space:pre; overflow:auto; }
  .cmd-block .btn { position:absolute; top:9px; right:9px; }

  .editor-layout { display:grid; grid-template-columns:minmax(0,1.55fr) minmax(320px,1fr); align-items:start; gap:20px; }
  .editor-pane { position:sticky; top:20px; display:flex; flex-direction:column; height:max(540px, calc(100vh - 220px)); overflow:hidden; border:1px solid var(--border); border-radius:12px; background:var(--surface); box-shadow:var(--shadow); }
  .editor-bar, .editor-foot { display:flex; flex:none; align-items:center; gap:16px; padding:0 14px; background:var(--surface-2); }
  .editor-bar { justify-content:space-between; height:40px; border-bottom:1px solid var(--border); }
  .editor-file { display:inline-flex; align-items:center; gap:7px; color:var(--fg); font:500 12.5px/1 var(--font-mono); }
  .editor-file .i { color:var(--muted); }
  .editor-hint { color:var(--muted); font-size:12px; }
  .editor-foot { height:30px; border-top:1px solid var(--border); color:var(--muted); font-size:12px; font-variant-numeric:tabular-nums; }
  .editor-foot span:last-child { margin-left:auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .code-editor { --lh:21px; position:relative; display:flex; flex:1; min-height:0; overflow:hidden; font:13px/var(--lh) var(--font-mono); }
  .ce-gutter { flex:none; width:52px; overflow:hidden; padding-top:14px; border-right:1px solid var(--border); background:var(--surface-2); color:var(--faint); text-align:right; user-select:none; font-variant-numeric:tabular-nums; }
  .ce-lines span { height:var(--lh); padding-right:12px; }
  .ce-lines span.bad { background:var(--bad-bg); color:var(--bad-fg); font-weight:600; }
  .ce-body { position:relative; flex:1; min-width:0; overflow:hidden; }
  .ce-highlight { position:absolute; top:0; left:0; min-width:100%; margin:0; padding:14px 18px 60px; border:0; border-radius:0; background:transparent; font:inherit; line-height:var(--lh); white-space:pre; overflow:visible; pointer-events:none; }
  .ce-highlight code { font:inherit; }
  #editor-text { position:absolute; inset:0; width:100%; height:100%; margin:0; padding:14px 18px 60px; border:0; outline:none; resize:none; background:transparent; color:transparent; -webkit-text-fill-color:transparent; caret-color:var(--fg); font:inherit; line-height:var(--lh); white-space:pre; overflow:auto; tab-size:2; font-variant-ligatures:none; }
  #editor-text::selection { background:color-mix(in srgb, var(--accent) 28%, transparent); }
  .editor-side { display:flex; flex-direction:column; gap:16px; min-width:0; }
  .vstate { padding:14px 16px; border:1px solid var(--border); border-radius:12px; background:var(--surface); box-shadow:var(--shadow-sm); }
  .vstate.checking { display:flex; align-items:center; gap:10px; color:var(--muted); font-size:13.5px; }
  .vstate.ok { border-color:color-mix(in srgb, var(--ok-fg) 30%, var(--border)); background:linear-gradient(180deg, var(--ok-bg), var(--surface) 70%); }
  .vstate.bad { border-color:color-mix(in srgb, var(--bad-fg) 35%, var(--border)); background:linear-gradient(180deg, var(--bad-bg), var(--surface) 80%); }
  .vstate-head { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
  .vstate.ok .vstate-head > .i { color:var(--ok-fg); } .vstate.bad .vstate-head > .i { color:var(--bad-fg); }
  .vstate-head strong { font-size:14px; }
  .vstate-head code { margin-left:auto; color:var(--fg-2); font-size:12px; }
  .vstate-msg { margin:8px 0 0; color:var(--bad-fg); font:12.5px/1.55 var(--font-mono); white-space:pre-wrap; word-break:break-word; }
  .vstate-meta { display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; margin:10px 0 0; color:var(--fg-2); font-size:12.5px; }
  .vstate-meta .world-chip { height:22px; font-size:12px; }
  .expect-list { margin:10px 0 0; padding-left:18px; color:var(--fg-2); font-size:13px; line-height:1.5; }
  .expect-list li { margin:3px 0; } .expect-list li::marker { color:var(--faint); }
  .draft-results { padding:14px 16px; }
  .draft-results .card-head { margin-bottom:8px; }
  .draft-list { display:flex; flex-direction:column; gap:2px; margin:0 -8px; padding:0; list-style:none; }
  .draft-list a { display:flex; flex-direction:column; gap:5px; padding:9px 10px; border-radius:9px; color:inherit; text-decoration:none; transition:background .12s; }
  .draft-list a:hover { background:var(--surface-2); }
  .dr-head { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
  .dr-head code { color:var(--fg); font-size:12.5px; font-weight:600; }
  .dr-head .mark-ok, .dr-head .mark-bad { margin-left:auto; }
  .dr-why { color:var(--fg-2); font-size:12.5px; line-height:1.45; }
  .editor-side .agent-pick { max-height:236px; }
  .ref-card .card-head { margin-bottom:6px; }
  .ref-group { margin-top:12px; }
  .ref-group > span { display:block; margin:0 0 7px; color:var(--muted); font-size:12px; font-weight:500; }

  .tabs { display:flex; flex-wrap:wrap; gap:8px; margin:0 0 24px; }
  .tab { display:inline-flex; align-items:center; gap:8px; height:34px; padding:0 13px; border:1px solid var(--border); border-radius:9px; background:var(--surface); color:var(--fg-2); font-size:13px; font-weight:500; cursor:pointer; box-shadow:var(--shadow-sm); }
  .tab:hover { border-color:var(--border-2); color:var(--fg); }
  .tab .i { color:var(--muted); }
  .tab span { color:var(--muted); font-size:12px; font-variant-numeric:tabular-nums; }
  .cat-section { margin:0 0 36px; scroll-margin-top:24px; }
  .cat-section > h2 { margin:0 0 14px; font-size:18px; letter-spacing:-.015em; }
  .agent-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:12px; }
  .agent-card { padding:15px 16px; border:1px solid var(--border); border-radius:12px; background:var(--surface); box-shadow:var(--shadow-sm); }
  .agent-card-head { display:flex; align-items:center; gap:8px; }
  .agent-card-head .i { color:var(--muted); }
  .agent-card-head code { color:var(--fg); font-size:13px; font-weight:600; }
  .agent-card-head .src-tag { margin-left:auto; }
  .agent-card p { margin:8px 0 0; color:var(--fg-2); font-size:13px; line-height:1.5; }
  .world-card { margin:0 0 14px; }
  .world-head { display:flex; align-items:flex-start; gap:12px; padding:16px 18px; border-bottom:1px solid var(--border); }
  .world-icon { display:grid; flex:none; place-items:center; width:36px; height:36px; border-radius:10px; background:var(--surface-3); color:var(--fg-2); }
  .world-head h3 { margin:0; font:600 14.5px/1.4 var(--font-mono); }
  .world-head p { margin:2px 0 0; color:var(--muted); font-size:13px; }
  .world-head .src-tag { margin-left:auto; }
  .tool-name { color:var(--fg) !important; font-weight:600; }
  .writes { margin-left:8px; padding:1px 6px; border-radius:5px; background:var(--warn-bg); color:var(--warn-fg); font-size:10.5px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; }
  .args { white-space:normal !important; }
  .records { display:flex; flex-direction:column; gap:8px; padding:14px 18px; border-top:1px solid var(--border); background:var(--surface-2); }
  .records > span { color:var(--muted); font-size:12px; font-weight:500; }
  .record { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
  .record-kind { margin-right:4px; color:var(--fg); font-size:12.5px; font-weight:600; }
  .field-chip { display:inline-flex; align-items:center; gap:5px; padding:1px 7px; border:1px solid var(--border); border-radius:6px; background:var(--surface); color:var(--fg-2); font:11.5px/18px var(--font-mono); }
  .field-chip em { color:var(--muted); font-style:normal; }

  .palette-root { position:fixed; inset:0; z-index:100; }
  .palette-scrim { position:absolute; inset:0; background:var(--overlay); backdrop-filter:blur(3px); animation:fade-in .15s ease-out; }
  .palette { position:absolute; top:12vh; left:50%; width:min(640px, calc(100vw - 32px)); overflow:hidden; border:1px solid var(--border-2); border-radius:14px; background:var(--surface); box-shadow:var(--shadow-lg); transform:translateX(-50%); animation:pop .16s ease-out; }
  .palette-input { display:flex; align-items:center; gap:10px; height:54px; padding:0 16px; border-bottom:1px solid var(--border); color:var(--muted); }
  .palette-input input { flex:1; min-width:0; height:100%; border:0; outline:0; background:transparent; color:var(--fg); font-size:15px; }
  .palette-list { max-height:min(400px, 56vh); overflow:auto; padding:6px; }
  .palette-group { padding:10px 10px 5px; color:var(--muted); font:600 11px/1 var(--font-sans); letter-spacing:.06em; text-transform:uppercase; }
  .palette-item { display:flex; align-items:center; gap:10px; height:38px; padding:0 10px; border-radius:8px; color:var(--fg-2); font-size:13.5px; cursor:pointer; }
  .palette-item .i { color:var(--muted); }
  .palette-item.active { background:var(--surface-3); color:var(--fg); }
  .palette-item.active .i { color:var(--fg); }
  .pi-label { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .pi-hint { overflow:hidden; max-width:40%; color:var(--muted); font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
  .palette-empty { padding:28px; color:var(--muted); text-align:center; }
  .palette-foot { display:flex; gap:16px; padding:9px 14px; border-top:1px solid var(--border); background:var(--surface-2); color:var(--muted); font-size:12px; }
  .palette-foot span { display:inline-flex; align-items:center; gap:4px; }
  .palette-foot kbd, .palette-input kbd { height:18px; padding:0 5px; font-size:10.5px; }

  .toasts { position:fixed; right:20px; bottom:20px; z-index:90; display:flex; flex-direction:column; align-items:flex-end; gap:8px; }
  .toast { display:flex; align-items:flex-start; gap:10px; max-width:460px; padding:11px 8px 11px 14px; border:1px solid var(--border-2); border-radius:11px; background:var(--surface); box-shadow:var(--shadow-lg); font-size:13.5px; line-height:1.45; animation:fade-up .2s ease-out; transition:opacity .2s, transform .2s; }
  .toast > .i { margin-top:1px; }
  .toast-ok > .i { color:var(--ok-fg); } .toast-bad > .i { color:var(--bad-fg); } .toast-info > .i { color:var(--info-fg); }
  .toast-text { flex:1; min-width:0; padding-top:1px; word-break:break-word; }
  .toast .icon-btn { width:24px; height:24px; margin:-2px 0 0; }
  .toast.out { opacity:0; transform:translateY(6px); }
  .dialog { width:min(460px, calc(100vw - 32px)); padding:0; border:1px solid var(--border-2); border-radius:14px; background:var(--surface); color:var(--fg); box-shadow:var(--shadow-lg); }
  .dialog::backdrop { background:var(--overlay); backdrop-filter:blur(3px); }
  .dialog[open] { animation:fade-up .18s ease-out; }
  .dialog-body { display:flex; align-items:flex-start; gap:14px; padding:22px 22px 6px; }
  .dialog-icon { display:grid; flex:none; place-items:center; width:38px; height:38px; border-radius:50%; background:var(--surface-3); color:var(--fg-2); }
  .dialog-icon.danger { background:var(--bad-bg); color:var(--bad-fg); }
  .dialog h2 { margin:6px 0 6px; font-size:16px; }
  .dialog p { margin:0; color:var(--fg-2); font-size:13.5px; line-height:1.55; }
  .dialog p code { font-size:12px; }
  .dialog-actions { display:flex; justify-content:flex-end; gap:8px; padding:18px 22px 20px; }
  .boot-error { max-width:640px; margin:12vh auto; padding:0 20px; }

  @media (max-width: 900px) { .page-head-row { flex-wrap:wrap; } .page-actions { justify-content:flex-start; } }
  @media (max-width: 1240px) {
    .lane { grid-template-columns:200px minmax(0,1fr); }
    .lane-verdict { grid-column:2; }
    .legend-grid, .next-grid { grid-template-columns:repeat(2, minmax(0,1fr)); }
  }
  @media (max-width: 1180px) {
    .split, .detail, .editor-layout { grid-template-columns:minmax(0,1fr); }
    .split-side, .detail-side, .editor-pane { position:static; }
    .editor-pane { height:560px; }
    .metrics { grid-template-columns:repeat(2, minmax(0,1fr)); }
    .run-summary { grid-template-columns:1fr; gap:18px; }
  }
  @media (max-width: 1024px) {
    :root { --sidebar:0px; }
    .sidebar { width:272px; box-shadow:var(--shadow-lg); transform:translateX(-100%); transition:transform .22s ease; visibility:hidden; }
    .menu-open .sidebar { transform:none; visibility:visible; }
    .menu-open .sb-scrim { position:fixed; inset:0; z-index:39; display:block; background:var(--overlay); }
    .mobilebar { position:sticky; top:0; z-index:30; display:flex; align-items:center; gap:10px; height:52px; padding:0 12px; border-bottom:1px solid var(--border); background:color-mix(in srgb, var(--bg) 85%, transparent); backdrop-filter:blur(10px); }
    .mobilebar .brand { flex:1; }
    .view { padding:24px 20px 96px; }
    .hero { grid-template-columns:1fr; }
    .ov-grid { grid-template-columns:1fr; }
  }
  @media (max-width: 760px) {
    .steps, .demo-steps, .legend-grid, .next-grid { grid-template-columns:1fr; }
    .lane { grid-template-columns:1fr; gap:14px; }
    .lane-verdict { grid-column:auto; }
    .track { flex-wrap:wrap; row-gap:12px; }
    .run-item { grid-template-columns:minmax(0,1fr) 16px; }
    .run-item-bar, .run-item-status { display:none; }
    .scn-row { grid-template-columns:22px minmax(0,1fr); }
    .scn-icon, .scn-agents { display:none; }
    .page-head h1 { font-size:22px; }
    .demo-hero h1 { font-size:28px; }
    .mini-lane { grid-template-columns:100px minmax(30px,1fr) auto; }
  }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration:.01ms !important; animation-delay:0s !important; transition-duration:.01ms !important; } }
`;
