import { BASE_CSS, REPORT_CSS } from "../html.js";

/** Styles for the local UI, on top of the tokens, badges, and report timeline the HTML reports use. */
export const UI_CSS = `${BASE_CSS}${REPORT_CSS}
  @font-face { font-family:"Geist"; src:url(/fonts/geist.woff2) format("woff2"); font-weight:100 900; font-style:normal; font-display:swap; }
  @font-face { font-family:"Geist Mono"; src:url(/fonts/geist-mono.woff2) format("woff2"); font-weight:100 900; font-style:normal; font-display:swap; }
  :root { --sidebar:252px; --topbar:54px; --frame:8px; }
  html, body { height:100%; }
  body { overflow:hidden; background:var(--canvas); }
  .sr-only { position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden; clip:rect(0 0 0 0); border:0; }
  .i { flex:none; display:inline-block; vertical-align:middle; }
  .muted { color:var(--muted); } .small { font-size:12.5px; } .mono { font-family:var(--font-mono); font-size:12.5px; } .nowrap { white-space:nowrap; } .spacer { flex:1; }
  kbd { display:inline-flex; align-items:center; justify-content:center; gap:2px; min-width:20px; height:20px; padding:0 5px; border:1px solid var(--border-2); border-bottom-width:2px; border-radius:6px; background:var(--surface); color:var(--muted); font:500 10.5px/1 var(--font-mono); }
  code { color:inherit; }
  @keyframes spin { to { transform:rotate(360deg); } }
  @keyframes rise { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
  @keyframes fade-in { from { opacity:0; } to { opacity:1; } }
  @keyframes pop { from { opacity:0; transform:translate(-50%, -8px) scale(.985); } to { opacity:1; transform:translate(-50%, 0); } }
  @keyframes shimmer { from { background-position:-200% 0; } to { background-position:200% 0; } }
  @keyframes slide { from { background-position:-60% 0; } to { background-position:160% 0; } }
  @keyframes flash { 0%, 100% { box-shadow:0 0 0 0 transparent; } 30% { box-shadow:0 0 0 4px color-mix(in srgb, var(--accent) 35%, transparent); } }
  @keyframes pulse { 0%, 100% { box-shadow:0 0 0 0 color-mix(in srgb, var(--ok-fg) 45%, transparent); } 60% { box-shadow:0 0 0 5px transparent; } }
  @keyframes draw { from { transform:scaleX(0); } to { transform:scaleX(1); } }
  @keyframes glow { 0%, 100% { opacity:.55; } 50% { opacity:1; } }
  .spinner { display:inline-block; width:13px; height:13px; border:2px solid currentColor; border-right-color:transparent; border-radius:50%; opacity:.85; animation:spin .7s linear infinite; }

  .app { display:grid; grid-template-columns:var(--sidebar) minmax(0,1fr); height:100vh; height:100dvh; }
  .sidebar { display:flex; flex-direction:column; gap:14px; min-height:0; padding:14px 10px 12px 14px; }
  .brand { display:flex; align-items:center; gap:11px; padding:4px 6px 4px 4px; border-radius:10px; color:var(--fg); text-decoration:none; }
  .brand .logo { flex:none; border-radius:8px; box-shadow:0 4px 14px -4px rgba(255,90,28,.55), 0 1px 2px rgba(0,0,0,.2); }
  .brand-text { display:flex; flex-direction:column; min-width:0; }
  .brand-name { font-size:15.5px; font-weight:650; line-height:1.15; letter-spacing:-.025em; }
  .brand-name span { color:var(--muted); font-weight:500; }
  .brand-sub { overflow:hidden; margin-top:2px; color:var(--muted); font:500 11px/1.3 var(--font-mono); text-overflow:ellipsis; white-space:nowrap; }
  .sb-search { display:flex; align-items:center; gap:9px; width:100%; height:34px; padding:0 6px 0 10px; border:1px solid var(--border); border-radius:9px; background:var(--surface); color:var(--muted); font-size:13px; text-align:left; cursor:pointer; box-shadow:var(--shadow-sm); transition:border-color .15s, color .15s; }
  .sb-search:hover { border-color:var(--border-2); color:var(--fg-2); }
  .sb-search span { flex:1; }
  .sb-nav { display:flex; flex-direction:column; gap:1px; min-height:0; margin:0 -4px; padding:0 4px; overflow:auto; }
  .sb-label { margin:16px 10px 6px; color:var(--muted); font:500 10.5px/1 var(--font-mono); letter-spacing:.1em; text-transform:uppercase; }
  .sb-link { display:flex; align-items:center; gap:10px; height:32px; padding:0 8px 0 10px; border-radius:8px; color:var(--fg-2); font-size:13.5px; font-weight:500; text-decoration:none; transition:background .12s, color .12s; }
  .sb-link .i { color:var(--muted); transition:color .12s; }
  .sb-link:hover { background:color-mix(in srgb, var(--fg) 5%, transparent); color:var(--fg); }
  .sb-link.active { background:var(--surface); color:var(--fg); box-shadow:0 0 0 1px var(--border), 0 1px 2px light-dark(rgba(28,24,20,.06),rgba(0,0,0,.4)); }
  .sb-link.active .i { color:var(--accent); }
  .sb-text { flex:1; }
  .sb-count { color:var(--muted); font:500 11px/1 var(--font-mono); font-variant-numeric:tabular-nums; }
  .sb-key { display:none; height:18px; padding:0 4px; font-size:10px; }
  .sb-link:hover .sb-key { display:inline-flex; }
  .sb-link:hover .sb-count { display:none; }
  .sb-foot { display:flex; flex-direction:column; gap:8px; margin-top:auto; padding-top:10px; border-top:1px solid var(--border); }
  .sb-help { display:flex; align-items:center; gap:9px; height:30px; padding:0 6px 0 10px; border:0; border-radius:8px; background:transparent; color:var(--fg-2); font-size:13px; cursor:pointer; }
  .sb-help span { flex:1; text-align:left; }
  .sb-help .i { color:var(--muted); }
  .sb-help:hover { background:color-mix(in srgb, var(--fg) 5%, transparent); color:var(--fg); }
  .sb-row { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:0 0 0 10px; }
  .sb-status { display:inline-flex; align-items:center; gap:8px; color:var(--muted); font-size:12px; }
  .live-dot { flex:none; width:7px; height:7px; border-radius:50%; background:var(--ok-fg); animation:pulse 2.4s ease-out infinite; }
  .theme-switch { display:inline-flex; gap:2px; padding:2px; border:1px solid var(--border); border-radius:9px; background:var(--surface); }
  .theme-switch button { display:grid; place-items:center; width:26px; height:24px; padding:0; border:0; border-radius:7px; background:transparent; color:var(--muted); cursor:pointer; }
  .theme-switch button:hover { color:var(--fg); }
  .theme-switch button[aria-checked=true] { background:var(--surface-3); color:var(--fg); }
  .sb-scrim { display:none; }

  .main { position:relative; min-width:0; margin:var(--frame) var(--frame) var(--frame) 0; overflow:auto; border:1px solid var(--border); border-radius:16px; background:color-mix(in srgb, var(--bg) 99%, transparent); box-shadow:0 1px 2px light-dark(rgba(28,24,20,.04),rgba(0,0,0,.5)), 0 0 0 .5px light-dark(rgba(28,24,20,.02),rgba(255,255,255,.02)); overscroll-behavior:contain; scroll-padding-top:calc(var(--topbar) + 12px); }
  .topbar { position:sticky; top:0; z-index:30; display:flex; align-items:center; gap:10px; height:var(--topbar); padding:0 16px 0 22px; border-bottom:1px solid var(--border); background:color-mix(in srgb, var(--bg) 82%, transparent); backdrop-filter:blur(14px) saturate(1.5); -webkit-backdrop-filter:blur(14px) saturate(1.5); }
  .topbar .menu-btn, .topbar .topbar-logo { display:none; }
  .crumbs { display:flex; flex:1; align-items:center; gap:6px; min-width:0; overflow:hidden; color:var(--muted); font-size:13px; white-space:nowrap; }
  .crumbs a { color:var(--muted); text-decoration:none; transition:color .12s; }
  .crumbs a:hover { color:var(--fg); }
  .crumbs [aria-current] { overflow:hidden; color:var(--fg); font-weight:500; text-overflow:ellipsis; }
  .crumb-sep { color:var(--faint); }
  .topbar-actions { display:flex; flex:none; align-items:center; gap:8px; }
  .topbar-search { display:inline-flex; align-items:center; gap:8px; height:30px; padding:0 5px 0 10px; border:1px solid var(--border); border-radius:8px; background:var(--surface); color:var(--muted); font-size:12.5px; cursor:pointer; transition:border-color .15s, color .15s; }
  .topbar-search:hover { border-color:var(--border-2); color:var(--fg-2); }
  .topbar-search kbd { height:18px; font-size:10px; }
  .progress { position:absolute; right:0; bottom:-1px; left:0; height:2px; opacity:0; background:linear-gradient(90deg, transparent, var(--accent), transparent) no-repeat; background-size:40% 100%; pointer-events:none; transition:opacity .2s; }
  .progress.on { opacity:1; animation:slide 1s ease-in-out infinite; }
  .view { max-width:1320px; margin:0 auto; padding:30px 40px 120px; outline:none; }
  .page { animation:fade-in .2s ease-out; }
  .icon-btn { display:inline-grid; place-items:center; width:32px; height:32px; padding:0; border:0; border-radius:8px; background:transparent; color:var(--muted); cursor:pointer; transition:background .12s, color .12s; }
  .icon-btn:hover { background:var(--surface-3); color:var(--fg); }

  .page-head { display:flex; flex-wrap:wrap; align-items:flex-end; justify-content:space-between; gap:16px 28px; margin:2px 0 28px; }
  .page-head-text { flex:1 1 0; min-width:280px; max-width:900px; }
  .eyebrow { display:flex; flex-wrap:wrap; align-items:center; gap:7px; margin:0 0 12px; color:var(--muted); font:500 10.5px/1.3 var(--font-mono); letter-spacing:.08em; text-transform:uppercase; }
  .eyebrow a { color:inherit; }
  .eyebrow-accent { color:var(--accent-fg); }
  .eyebrow-sep { color:var(--faint); }
  .eyebrow-id { color:var(--fg-2); letter-spacing:.02em; text-transform:none; text-decoration:none; }
  .eyebrow-id:hover { color:var(--fg); text-decoration:underline; }
  .page-head h1 { display:flex; flex-wrap:wrap; align-items:center; gap:10px 14px; margin:0; font-size:30px; font-weight:600; line-height:1.12; letter-spacing:-.035em; }
  .page-head h1.mono-title { font:600 25px/1.2 var(--font-mono); letter-spacing:-.04em; }
  .page-head h1 .badge { height:26px; padding:0 10px 0 9px; font-size:11.5px; letter-spacing:0; }
  .id-title { overflow-wrap:anywhere; }
  .page-sub { margin:10px 0 0; color:var(--fg-2); font-size:14.5px; line-height:1.6; }
  .page-sub code, .muted code, .note code, .empty code, .hint code, .lede code { padding:1px 5px; border-radius:5px; background:var(--surface-3); color:var(--fg-2); font-size:12px; white-space:nowrap; }
  .page-actions { display:flex; flex:none; flex-wrap:wrap; align-items:center; justify-content:flex-end; gap:8px; }

  .btn { display:inline-flex; align-items:center; justify-content:center; gap:7px; height:34px; padding:0 13px; border:1px solid transparent; border-radius:9px; font:550 13px/1 var(--font-sans); letter-spacing:-.005em; white-space:nowrap; text-decoration:none; cursor:pointer; user-select:none; transition:background .15s, border-color .15s, color .15s, box-shadow .15s, filter .15s, transform .1s; }
  .btn:active:not(:disabled) { transform:translateY(.5px); }
  .btn:disabled { opacity:.5; cursor:not-allowed; }
  .btn-primary { background:var(--fg); color:var(--bg); box-shadow:inset 0 1px 0 rgba(255,255,255,.14), 0 1px 2px rgba(0,0,0,.18); }
  .btn-primary:hover:not(:disabled) { background:color-mix(in srgb, var(--fg) 86%, var(--bg)); }
  .btn-accent { border-color:#d9471a; background:linear-gradient(180deg, #ff7a3d, #f0541b); color:#fff; text-shadow:0 1px 0 rgba(120,30,0,.25); box-shadow:inset 0 1px 0 rgba(255,255,255,.3), 0 1px 2px rgba(200,60,10,.3), 0 6px 18px -6px rgba(240,84,27,.65); }
  .btn-accent:hover:not(:disabled) { filter:brightness(1.06) saturate(1.05); box-shadow:inset 0 1px 0 rgba(255,255,255,.3), 0 1px 2px rgba(200,60,10,.3), 0 8px 22px -6px rgba(240,84,27,.75); }
  .btn-accent .i { opacity:.95; }
  .btn-secondary { border-color:var(--border-2); background:var(--surface); color:var(--fg); box-shadow:var(--shadow-sm); }
  .btn-secondary:hover:not(:disabled) { border-color:var(--border-3); background:var(--surface-2); }
  .btn-ghost { background:transparent; color:var(--fg-2); }
  .btn-ghost:hover:not(:disabled) { background:var(--surface-3); color:var(--fg); }
  .btn-danger { border-color:var(--harm); background:var(--harm); color:#fff; }
  .btn-danger:hover:not(:disabled) { background:color-mix(in srgb, var(--harm) 88%, #000); }
  .btn-sm { height:28px; padding:0 10px; border-radius:7px; font-size:12.5px; }
  .btn-block { width:100%; height:38px; }
  .btn-group { display:inline-flex; }
  .btn-group .btn { border-radius:0; } .btn-group .btn + .btn { margin-left:-1px; }
  .btn-group .btn:first-child { border-radius:9px 0 0 9px; } .btn-group .btn:last-child { border-radius:0 9px 9px 0; }
  .btn.copied .i, .copied .i { color:var(--ok-fg); }
  .busy { cursor:progress; }
  .link-quiet { display:inline-flex; align-items:center; gap:5px; color:var(--muted); font-size:12.5px; text-decoration:none; transition:color .12s; }
  .link-quiet:hover { color:var(--fg); }
  .link-btn { padding:2px 4px; border:0; background:none; color:var(--muted); font-size:12.5px; cursor:pointer; }
  .link-btn:hover { color:var(--fg); text-decoration:underline; text-underline-offset:3px; }

  .card { position:relative; padding:18px 20px; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); box-shadow:var(--shadow-sm); }
  .card-head { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; margin:0 0 14px; }
  .card-head h2 { margin:0; font-size:14px; font-weight:600; letter-spacing:-.01em; }
  .card-head > .muted:last-child, .card-head > .link-quiet:last-child, .card-head > .chip-row:last-child { margin-left:auto; }
  .card-flush { padding:0; overflow:hidden; }
  .card-flush > .card-head { margin:0; padding:13px 18px; border-bottom:1px solid var(--border); }
  .card.flash, .run-card.flash { animation:flash 1.2s ease-out; }
  .chip-row { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
  .world-chip { display:inline-flex; align-items:center; gap:6px; height:24px; padding:0 9px; border:1px solid var(--border); border-radius:7px; background:var(--surface); color:var(--fg-2); font-size:12.5px; font-weight:500; white-space:nowrap; }
  .world-chip .i { color:var(--muted); }
  .tags { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin:0 0 16px; }
  .tags-label { display:inline-flex; margin-right:2px; color:var(--faint); }
  .tag { height:24px; padding:0 9px; border:1px solid var(--border); border-radius:7px; background:transparent; color:var(--fg-2); font:500 11.5px/1 var(--font-mono); cursor:pointer; transition:background .12s, border-color .12s, color .12s; }
  .tag:hover { border-color:var(--border-3); color:var(--fg); }
  .tag.on { border-color:var(--fg); background:var(--fg); color:var(--bg); }
  .tag.static { display:inline-flex; align-items:center; background:var(--surface-2); cursor:default; }
  .fault-tag { display:inline-flex; align-items:center; gap:5px; height:22px; padding:0 8px; border-radius:6px; background:var(--warn-bg); color:var(--warn-fg); font:500 11.5px/1 var(--font-mono); white-space:nowrap; }
  .fault-tag.none { background:var(--surface-3); color:var(--muted); }
  .code-chip { display:inline-flex; align-items:center; height:22px; padding:0 7px; border:1px solid var(--border); border-radius:6px; background:var(--surface-2); color:var(--fg-2); font:500 11.5px/1 var(--font-mono); white-space:nowrap; }
  button.code-chip { cursor:copy; transition:border-color .12s, color .12s; }
  button.code-chip:hover { border-color:var(--accent-line); color:var(--accent-fg); }
  .src-tag { display:inline-flex; align-items:center; height:19px; padding:0 7px; border:1px solid var(--border); border-radius:6px; color:var(--muted); font:500 10.5px/1 var(--font-mono); white-space:nowrap; }
  .src-tag.builtin { background:var(--surface-2); }
  .tag-unsaved, .tag-saved { display:inline-flex; align-items:center; height:19px; padding:0 7px; border-radius:6px; font:600 10.5px/1 var(--font-mono); letter-spacing:.02em; white-space:nowrap; }
  .tag-unsaved { background:var(--accent-soft); color:var(--accent-fg); }
  .tag-saved { border:1px solid var(--border); background:var(--surface-2); color:var(--fg-2); cursor:help; }
  .vdot { display:inline-block; flex:none; width:8px; height:8px; border-radius:3px; background:var(--v, var(--faint)); box-shadow:0 0 6px -1px var(--v, transparent); }
  .vdots { display:inline-flex; gap:3px; }
  .mark-ok { color:var(--ok-fg); font-weight:700; }
  .mark-bad { color:var(--bad-fg); font:600 11.5px/1.3 var(--font-mono); white-space:nowrap; }
  .alert { display:flex; align-items:flex-start; gap:10px; margin:0 0 18px; padding:12px 14px; border:1px solid transparent; border-radius:12px; font-size:13.5px; line-height:1.5; }
  .alert > .i { margin-top:1px; }
  .alert ul { margin:6px 0 0; padding-left:18px; color:var(--fg-2); }
  .alert-bad { border-color:color-mix(in srgb, var(--bad-fg) 25%, transparent); background:var(--bad-bg); } .alert-bad > .i { color:var(--bad-fg); }
  .alert-ok { border-color:color-mix(in srgb, var(--ok-fg) 25%, transparent); background:var(--ok-bg); } .alert-ok > .i { color:var(--ok-fg); }
  .hint { display:flex; align-items:center; gap:10px; margin:0 0 18px; padding:12px 14px; border:1px dashed var(--border-2); border-radius:12px; color:var(--fg-2); font-size:13.5px; }
  .hint .i { color:var(--muted); }
  .empty { padding:48px 24px; border:1px dashed var(--border-2); border-radius:var(--radius-lg); background:repeating-linear-gradient(-45deg, transparent 0 10px, color-mix(in srgb, var(--fg) 1.5%, transparent) 10px 11px); text-align:center; }
  .empty-icon { display:grid; place-items:center; width:46px; height:46px; margin:0 auto 14px; border:1px solid var(--border); border-radius:13px; background:var(--surface); color:var(--muted); box-shadow:var(--shadow-sm); }
  .empty h3 { margin:0 0 6px; font-size:15px; }
  .empty p { max-width:520px; margin:0 auto; color:var(--muted); font-size:13.5px; line-height:1.6; }
  .empty-actions { display:flex; flex-wrap:wrap; justify-content:center; gap:8px; margin-top:18px; }
  .card .empty { padding:30px 12px; border:0; background:none; }
  .note { margin:0; color:var(--muted); font-size:12.5px; line-height:1.5; }
  .page-note { margin-top:14px; }

  .vbar { display:flex; gap:2px; height:8px; }
  .vbar span { min-width:4px; border-radius:2px; background:var(--v); }
  .vbar span:first-child { border-radius:4px 2px 2px 4px; } .vbar span:last-child { border-radius:2px 4px 4px 2px; } .vbar span:only-child { border-radius:4px; }
  .vbar-sm { height:6px; min-width:110px; }
  .vbar-xs { height:4px; gap:1px; }
  .vlegend { display:grid; gap:1px; margin:16px 0 0; padding:0; list-style:none; }
  .vlegend li { display:flex; align-items:center; gap:10px; padding:5px 0; font-size:12.5px; }
  .vlegend .sw { width:9px; height:9px; border-radius:3px; background:var(--v); box-shadow:0 0 8px -1px var(--v); }
  .vlegend code { color:var(--fg-2); font-size:11.5px; }
  .vlegend b { margin-left:auto; font:600 12.5px/1 var(--font-mono); font-variant-numeric:tabular-nums; }
  .vlegend em { width:38px; color:var(--muted); font:500 11.5px/1 var(--font-mono); font-style:normal; text-align:right; }
  .vlegend-muted li { opacity:.7; }
  .ring { position:relative; display:grid; flex:none; place-items:center; width:148px; height:148px; border-radius:50%; }
  .ring-hole { display:flex; flex-direction:column; align-items:center; justify-content:center; width:112px; height:112px; border-radius:50%; background:var(--surface); box-shadow:inset 0 0 0 1px var(--border); }
  .ring-hole b { font-size:28px; font-weight:600; line-height:1; letter-spacing:-.04em; font-variant-numeric:tabular-nums; }
  .ring-hole span { margin-top:4px; color:var(--muted); font:500 10.5px/1 var(--font-mono); letter-spacing:.08em; text-transform:uppercase; }

  .hero { position:relative; isolation:isolate; display:grid; grid-template-columns:minmax(0,1.08fr) minmax(0,.92fr); align-items:center; gap:40px; margin:0 0 18px; padding:44px 44px 42px; overflow:hidden; border:1px solid var(--border); border-radius:20px; background:var(--surface); box-shadow:var(--shadow-sm); }
  .hero::before { content:""; position:absolute; inset:0; z-index:-1; background-image:radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--fg) 13%, transparent) 1px, transparent 0); background-size:20px 20px; mask-image:radial-gradient(ellipse 65% 90% at 78% 45%, #000 20%, transparent 72%); -webkit-mask-image:radial-gradient(ellipse 65% 90% at 78% 45%, #000 20%, transparent 72%); }
  .hero::after { content:""; position:absolute; top:-200px; right:-140px; z-index:-1; width:680px; height:520px; border-radius:50%; background:radial-gradient(closest-side, color-mix(in srgb, var(--accent) 24%, transparent), transparent); }
  .hero-copy { container-type:inline-size; }
  .hero .eyebrow { margin-bottom:18px; }
  .hero .display { font-size:min(50px, 8.6cqi); white-space:nowrap; }
  .display { margin:0 0 16px; font-size:48px; font-weight:600; line-height:1.02; letter-spacing:-.05em; text-wrap:balance; }
  .display-sm { font-size:40px; }
  .ember-text { background:linear-gradient(100deg, #ff9a3c 0%, #ff5c1c 45%, #e0312b 100%); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .lede { max-width:560px; margin:0 0 28px; color:var(--fg-2); font-size:15.5px; line-height:1.62; }
  .hero-actions { display:flex; flex-wrap:wrap; gap:10px; }
  .hero-actions .btn { height:38px; padding:0 16px; font-size:13.5px; }
  .trace { position:relative; display:flex; flex-direction:column; gap:7px; padding:14px; border:1px solid var(--border); border-radius:16px; background:color-mix(in srgb, var(--bg) 78%, transparent); box-shadow:var(--shadow); backdrop-filter:blur(6px); }
  .trace-head, .trace-foot { display:flex; align-items:center; justify-content:space-between; gap:10px; min-width:0; padding:2px 4px; color:var(--muted); font:500 10.5px/1.3 var(--font-mono); letter-spacing:.04em; white-space:nowrap; }
  .trace-head span, .trace-foot span { overflow:hidden; text-overflow:ellipsis; }
  .trace-head span:first-child { display:inline-flex; align-items:center; gap:6px; color:var(--warn-fg); }
  .trace-head span:last-child, .trace-foot span:last-child { flex:none; }
  .trace-foot { padding-top:4px; color:var(--faint); }
  .trace-lane { display:grid; grid-template-columns:118px minmax(70px,1fr) auto; align-items:center; gap:14px; padding:9px 10px 9px 12px; border:1px solid var(--border); border-radius:10px; background:var(--surface); animation:rise .55s cubic-bezier(.2,.8,.2,1) both; animation-delay:calc(var(--i) * 90ms + 120ms); }
  .trace-lane code { overflow:hidden; color:var(--fg-2); font-size:11.5px; text-overflow:ellipsis; white-space:nowrap; }
  .trace-lane .badge { height:20px; font-size:9.5px; }
  .trace-track { position:relative; height:16px; }
  .trace-track::before { content:""; position:absolute; top:50%; right:0; left:0; height:1px; background:var(--border-2); }
  .trace-track::after { content:""; position:absolute; top:calc(50% - 1px); right:4px; left:30%; height:2px; border-radius:2px; background:linear-gradient(90deg, color-mix(in srgb, var(--v) 30%, transparent), var(--v)); transform-origin:left; animation:draw .7s cubic-bezier(.3,.7,.2,1) both; animation-delay:calc(var(--i) * 90ms + 520ms); }
  .trace-node { position:absolute; top:50%; z-index:1; width:8px; height:8px; border-radius:50%; translate:-50% -50%; }
  .trace-node.start { left:6%; background:var(--ok-fg); box-shadow:0 0 0 3px var(--surface); }
  .trace-node.fault { left:30%; display:grid; place-items:center; width:18px; height:18px; background:var(--warn-bg); color:var(--warn-fg); box-shadow:0 0 0 1px color-mix(in srgb, var(--warn-fg) 45%, transparent), 0 0 0 3px var(--surface), 0 0 14px 2px color-mix(in srgb, var(--warn-fg) 30%, transparent); }
  .trace-node.end { left:calc(100% - 4px); width:10px; height:10px; border-radius:3px; background:var(--v); box-shadow:0 0 0 3px var(--surface), 0 0 12px 1px var(--v); animation:glow 2.4s ease-in-out infinite; animation-delay:calc(var(--i) * 300ms); }
  .kpis { display:grid; grid-template-columns:repeat(5, minmax(0,1fr)); margin:0 0 18px; overflow:hidden; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); box-shadow:var(--shadow-sm); }
  .kpi { display:flex; flex-direction:column; gap:8px; min-width:0; padding:16px 18px 15px; border-left:1px solid var(--border); color:inherit; text-decoration:none; transition:background .15s; }
  .kpi:first-child { border-left:0; }
  .kpi:hover { background:var(--surface-2); }
  .kpi-label { display:flex; align-items:center; gap:7px; color:var(--muted); font:500 10.5px/1 var(--font-mono); letter-spacing:.08em; text-transform:uppercase; }
  .kpi-num { font-size:30px; font-weight:600; line-height:1; letter-spacing:-.045em; font-variant-numeric:tabular-nums; }
  .kpi-sub { overflow:hidden; color:var(--muted); font-size:12.5px; text-overflow:ellipsis; white-space:nowrap; }
  .ov-grid { display:grid; grid-template-columns:minmax(0,1.55fr) minmax(0,1fr); gap:18px; margin:0 0 18px; }
  .result-list { display:flex; flex-direction:column; gap:2px; margin:0 -8px; padding:0; list-style:none; }
  .result-list a { display:grid; grid-template-columns:142px minmax(0,1fr) auto; align-items:center; gap:14px; padding:8px 10px; border-radius:9px; color:inherit; text-decoration:none; transition:background .12s; }
  .result-list a:hover { background:var(--surface-2); }
  .result-list .badge { justify-self:start; }
  .rl-main { display:flex; flex-direction:column; min-width:0; }
  .rl-main code { overflow:hidden; color:var(--fg); font-size:12.5px; font-weight:600; text-overflow:ellipsis; white-space:nowrap; }
  .rl-main span { overflow:hidden; color:var(--muted); font-size:12.5px; text-overflow:ellipsis; white-space:nowrap; }
  .rl-meta { color:var(--muted); font-size:12px; white-space:nowrap; }
  .mix { display:flex; align-items:center; gap:26px; }
  .mix .vlegend { flex:1; margin:0; }
  .agent-mini { display:flex; flex-direction:column; gap:2px; margin:0 0 12px; padding:0; list-style:none; }
  .agent-mini li { display:grid; grid-template-columns:150px minmax(0,1fr) 44px; align-items:center; gap:14px; padding:7px 0; border-bottom:1px solid var(--border); }
  .agent-mini li:last-child { border-bottom:0; }
  .agent-mini code { overflow:hidden; color:var(--fg); font-size:12.5px; font-weight:600; text-overflow:ellipsis; white-space:nowrap; }
  .agent-mini b { font:600 12.5px/1 var(--font-mono); text-align:right; }
  .facts { margin:14px 0 0; padding:6px 0 0; border-top:1px solid var(--border); }
  .facts > div { display:grid; grid-template-columns:92px minmax(0,1fr); gap:12px; padding:8px 0; }
  .facts dt { padding-top:3px; color:var(--muted); font:500 10.5px/1.5 var(--font-mono); letter-spacing:.08em; text-transform:uppercase; }
  .facts dd { min-width:0; margin:0; font-size:13.5px; overflow-wrap:anywhere; }
  .facts-tight { margin:0; padding:0; border:0; }
  .facts-tight > div { border-bottom:1px solid var(--border); }
  .facts-tight > div:last-child { border-bottom:0; }
  .facts dd code { font-size:12px; }
  .steps { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:18px; }
  .step { display:flex; flex-direction:column; overflow:hidden; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); box-shadow:var(--shadow-sm); transition:border-color .15s, box-shadow .15s; }
  .step:hover { border-color:var(--border-2); box-shadow:var(--shadow); }
  .step-link { flex:1; padding:18px 20px 14px; color:inherit; text-decoration:none; }
  .step-num { display:inline-block; margin:0 0 12px; color:var(--accent-fg); font:600 11px/1 var(--font-mono); letter-spacing:.06em; }
  .step h3 { margin:0 0 6px; font-size:14.5px; }
  .step p { margin:0; color:var(--fg-2); font-size:13.5px; line-height:1.55; }
  .step-cli { display:flex; align-items:center; gap:6px; padding:6px 6px 6px 14px; border-top:1px solid var(--border); background:var(--surface-2); }
  .step-cli code { flex:1; min-width:0; overflow:hidden; color:var(--fg-2); font-size:11.5px; text-overflow:ellipsis; white-space:nowrap; }
  .step-cli code::before { content:"$ "; color:var(--faint); }
  .step-cli .icon-btn { width:28px; height:28px; }

  .demo-hero { margin:4px 0 28px; }
  .demo-hero .lede { max-width:820px; margin:0; }
  .story { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:16px; margin:0 0 34px; padding:0; list-style:none; counter-reset:story; }
  .story-step { position:relative; display:flex; flex-direction:column; padding:18px 20px; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); box-shadow:var(--shadow-sm); }
  .story-step:not(:last-child)::after { content:""; position:absolute; top:28px; right:-17px; width:16px; height:1px; background:var(--border-3); }
  .story-step .step-num { margin-bottom:10px; }
  .story-step h3 { margin:0 0 10px; font-size:14.5px; }
  .story-step p { margin:0; color:var(--fg-2); font-size:13.5px; line-height:1.6; }
  .story-step blockquote { margin:0 0 12px; padding:10px 14px; border-left:2px solid var(--accent); border-radius:0 8px 8px 0; background:var(--surface-2); font-size:14px; line-height:1.55; }
  .fault-flow { display:flex; flex-wrap:wrap; align-items:center; gap:6px 0; margin:0 0 12px; }
  .ff-node { display:inline-flex; align-items:center; gap:5px; height:26px; padding:0 9px; border:1px solid var(--border); border-radius:7px; background:var(--surface-2); color:var(--fg-2); font-size:12px; font-weight:500; white-space:nowrap; }
  .ff-node code { font-size:11.5px; }
  .ff-ok { border-color:color-mix(in srgb, var(--ok-fg) 35%, transparent); background:var(--ok-bg); color:var(--ok-fg); }
  .ff-bad { border-color:color-mix(in srgb, var(--warn-fg) 40%, transparent); background:var(--warn-bg); color:var(--warn-fg); box-shadow:0 0 14px -4px color-mix(in srgb, var(--warn-fg) 60%, transparent); }
  .ff-arrow { position:relative; width:18px; height:1px; background:var(--border-3); }
  .ff-arrow::after { content:""; position:absolute; top:-3px; right:0; width:6px; height:6px; border-top:1px solid var(--border-3); border-right:1px solid var(--border-3); transform:rotate(45deg); }
  .ff-broken { background:repeating-linear-gradient(90deg, var(--warn-fg) 0 3px, transparent 3px 6px); }
  .ff-broken::after { border-color:var(--warn-fg); }
  .section-head { display:flex; flex-wrap:wrap; align-items:flex-end; justify-content:space-between; gap:12px 24px; margin:0 0 14px; }
  .section-head h2 { margin:0 0 4px; font-size:19px; letter-spacing:-.025em; }
  .section-head p { margin:0; font-size:13.5px; }
  .lanes { display:flex; flex-direction:column; gap:8px; }
  .lanes-head, .lane { display:grid; grid-template-columns:230px minmax(0,1fr) 300px; gap:24px; }
  .lanes-head { padding:0 20px 2px; color:var(--faint); font:500 10.5px/1 var(--font-mono); letter-spacing:.08em; text-transform:uppercase; }
  .lane { position:relative; align-items:center; min-height:96px; padding:16px 20px; overflow:hidden; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); color:inherit; text-decoration:none; box-shadow:var(--shadow-sm); }
  .lane-done { animation:rise .55s cubic-bezier(.2,.8,.2,1) both; animation-delay:calc(var(--i) * 110ms); transition:border-color .15s, box-shadow .15s, transform .15s; }
  .lane-done::before { content:""; position:absolute; inset:0 auto 0 0; width:3px; background:var(--v); box-shadow:0 0 14px 1px var(--v); }
  .lane-done::after { content:""; position:absolute; inset:0; z-index:0; background:linear-gradient(90deg, transparent 55%, color-mix(in srgb, var(--v-bg) 70%, transparent)); pointer-events:none; }
  .lane > * { position:relative; z-index:1; }
  .lane-done:hover { border-color:var(--border-2); box-shadow:var(--shadow); transform:translateY(-1px); }
  .lane.mismatch { border-color:var(--bad-fg); }
  .lane-agent { display:flex; align-items:flex-start; gap:11px; min-width:0; }
  .lane-icon, .agent-icon { display:grid; flex:none; place-items:center; width:30px; height:30px; border:1px solid var(--border); border-radius:9px; background:var(--surface-2); color:var(--fg-2); }
  .lane-agent code { color:var(--fg); font-size:13px; font-weight:600; }
  .lane-agent p { margin:3px 0 0; color:var(--muted); font-size:12.5px; line-height:1.45; }
  .lane-track { min-width:0; }
  .lane-skel { display:block; height:10px; margin:6px 0; border-radius:6px; background:linear-gradient(90deg, var(--surface-3) 25%, var(--surface-2) 50%, var(--surface-3) 75%); background-size:200% 100%; }
  .lane-skel.short { width:60%; }
  .is-running .lane-skel { animation:shimmer 1.2s linear infinite; }
  .track { display:flex; align-items:flex-start; margin:0; padding:0; list-style:none; }
  .tstep { position:relative; display:flex; flex:none; flex-direction:column; gap:3px; min-width:0; padding:0 26px 0 0; }
  .tstep::before { content:""; position:absolute; top:5px; right:6px; left:12px; height:2px; border-radius:2px; background:var(--border); }
  .tstep:last-child::before { display:none; }
  .tnode { position:relative; z-index:1; width:12px; height:12px; margin-bottom:4px; border:2px solid var(--border-3); border-radius:50%; background:var(--surface); }
  .tstep.committed .tnode { border-color:var(--ok-fg); background:var(--ok-fg); }
  .tstep.failed .tnode { border-color:var(--bad-fg); background:var(--bad-fg); }
  .tstep.faulted .tnode { box-shadow:0 0 0 3px var(--surface), 0 0 0 5px color-mix(in srgb, var(--warn-fg) 70%, transparent), 0 0 12px 3px color-mix(in srgb, var(--warn-fg) 35%, transparent); }
  .tstep code { color:var(--fg); font-size:12px; font-weight:600; white-space:nowrap; }
  .tstep small { display:inline-flex; align-items:center; gap:3px; color:var(--muted); font-size:11.5px; white-space:nowrap; }
  .tstep.faulted small { color:var(--warn-fg); }
  .tstep-final { flex:1 1 auto; padding-right:0; }
  .tstep-final .tnode { border-color:var(--fg); border-radius:3px; }
  .tstep q { display:-webkit-box; overflow:hidden; color:var(--fg-2); font-size:12.5px; line-height:1.45; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
  .lane-verdict { min-width:0; }
  .lane-badge { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
  .lane-verdict p { display:-webkit-box; margin:7px 0 0; overflow:hidden; color:var(--fg-2); font-size:12.5px; line-height:1.45; -webkit-line-clamp:3; -webkit-box-orient:vertical; }
  .demo-outcome { margin-top:26px; }
  .outcome-banner { display:flex; align-items:flex-start; gap:12px; margin:0 0 16px; padding:15px 18px; border:1px solid transparent; border-radius:var(--radius-lg); }
  .outcome-banner.ok { border-color:color-mix(in srgb, var(--ok-fg) 25%, transparent); background:var(--ok-bg); } .outcome-banner.ok > .i { color:var(--ok-fg); }
  .outcome-banner.bad { border-color:color-mix(in srgb, var(--bad-fg) 25%, transparent); background:var(--bad-bg); } .outcome-banner.bad > .i { color:var(--bad-fg); }
  .outcome-banner strong { font-size:14.5px; } .outcome-banner p { margin:3px 0 0; color:var(--fg-2); font-size:13.5px; }
  .legend-grid { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:10px; margin:0 0 16px; }
  .legend-item { display:flex; align-items:flex-start; gap:12px; padding:14px; border:1px solid var(--border); border-radius:12px; background:var(--surface); opacity:.5; }
  .legend-item.present { opacity:1; box-shadow:var(--shadow-sm); }
  .legend-icon { display:grid; flex:none; place-items:center; width:32px; height:32px; border-radius:9px; background:var(--v-bg); box-shadow:inset 0 0 0 1px var(--v-bd); color:var(--v-fg); }
  .legend-item code { color:var(--v-fg); font-size:11.5px; font-weight:600; }
  .legend-item p { margin:4px 0 0; color:var(--fg-2); font-size:12.5px; line-height:1.5; }
  .next-grid { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:10px; }
  .next { display:flex; align-items:flex-start; gap:12px; padding:16px; border:1px solid var(--border); border-radius:12px; background:var(--surface); color:inherit; text-decoration:none; transition:border-color .15s, transform .15s, box-shadow .15s; }
  .next:hover { border-color:var(--border-2); box-shadow:var(--shadow); transform:translateY(-1px); }
  .next > .i:first-child { margin-top:1px; color:var(--accent); }
  .next > div { flex:1; }
  .next strong { font-size:14px; } .next p { margin:4px 0 0; color:var(--muted); font-size:13px; line-height:1.5; }
  .next-go { margin-top:2px; color:var(--faint); transition:transform .15s, color .15s; }
  .next:hover .next-go { color:var(--fg); transform:translateX(2px); }

  .split, .detail { display:grid; grid-template-columns:minmax(0,1fr) 340px; align-items:start; gap:24px; }
  .split-side, .detail-side { position:sticky; top:calc(var(--topbar) + 18px); display:flex; flex-direction:column; gap:16px; }
  .detail-main { display:flex; flex-direction:column; gap:16px; min-width:0; }
  .filterbar { display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin:0 0 12px; }
  .search { display:flex; flex:1 1 260px; align-items:center; gap:8px; max-width:420px; height:36px; padding:0 6px 0 11px; border:1px solid var(--border-2); border-radius:9px; background:var(--surface); color:var(--muted); box-shadow:var(--shadow-sm); transition:border-color .15s, box-shadow .15s; }
  .search:focus-within { border-color:var(--focus); box-shadow:0 0 0 3px var(--accent-soft); }
  .search input { flex:1; min-width:0; height:100%; padding:0; border:0; outline:0; background:transparent; color:var(--fg); font-size:13.5px; }
  .search input::placeholder { color:var(--faint); }
  .search input::-webkit-search-cancel-button { filter:grayscale(1); }
  .seg { display:inline-flex; gap:2px; padding:3px; border:1px solid var(--border); border-radius:10px; background:var(--surface-2); }
  .seg-wrap { flex-wrap:wrap; }
  .seg-btn { display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 10px; border:0; border-radius:7px; background:transparent; color:var(--fg-2); font-size:12.5px; font-weight:500; white-space:nowrap; cursor:pointer; transition:background .12s, color .12s; }
  .seg-btn:hover { color:var(--fg); }
  .seg-btn.on { background:var(--surface); color:var(--fg); box-shadow:0 1px 2px light-dark(rgba(28,24,20,.08),rgba(0,0,0,.5)), 0 0 0 1px var(--border); }
  .seg-btn .i { color:var(--muted); }
  .seg-btn .vdot { width:7px; height:7px; }
  .seg-btn[data-verdict]:not([data-verdict=""]) { font-family:var(--font-mono); font-size:11px; }
  .seg-count { color:var(--muted); font:500 10.5px/1 var(--font-mono); font-variant-numeric:tabular-nums; }
  .list-tools { display:flex; align-items:center; gap:6px; margin:0 0 10px; color:var(--muted); font:500 10.5px/1 var(--font-mono); letter-spacing:.06em; text-transform:uppercase; }
  .list-tools .link-btn { font:500 12px/1 var(--font-sans); letter-spacing:0; text-transform:none; }
  .scn-list { display:flex; flex-direction:column; gap:22px; }
  .scn-group-label { display:flex; align-items:center; gap:7px; margin:0 0 8px 4px; color:var(--fg-2); font:500 11px/1 var(--font-mono); letter-spacing:.08em; text-transform:uppercase; }
  .scn-group-label .i { color:var(--muted); }
  .scn-group-label span { color:var(--faint); font-variant-numeric:tabular-nums; }
  .scn-rows { overflow:hidden; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); box-shadow:var(--shadow-sm); }
  .scn-row { position:relative; display:grid; grid-template-columns:20px 34px minmax(0,1fr) auto; align-items:start; gap:14px; padding:14px 16px; border-top:1px solid var(--border); transition:background .12s; }
  .scn-row:first-child { border-top:0; }
  .scn-row:hover { background:var(--surface-2); }
  .scn-row.selected { background:color-mix(in srgb, var(--accent) 5%, var(--surface)); }
  .scn-row.selected::before { content:""; position:absolute; inset:0 auto 0 0; width:2px; background:var(--accent); }
  .check { position:relative; display:inline-grid; margin-top:8px; cursor:pointer; }
  .check input, .agent-opt input { position:absolute; width:1px; height:1px; opacity:0; pointer-events:none; }
  .check-box { display:grid; place-items:center; width:17px; height:17px; border:1.5px solid var(--border-3); border-radius:5px; background:var(--surface); color:transparent; transition:background .12s, border-color .12s, color .12s; }
  input:checked + .check-box { border-color:var(--accent); background:var(--accent); color:#fff; box-shadow:0 2px 6px -2px color-mix(in srgb, var(--accent) 70%, transparent); }
  input:focus-visible + .check-box { outline:2px solid var(--focus); outline-offset:2px; }
  .check:hover .check-box, .agent-opt:hover .check-box { border-color:color-mix(in srgb, var(--fg) 40%, var(--border-2)); }
  .scn-icon { display:grid; place-items:center; width:34px; height:34px; border:1px solid var(--border); border-radius:10px; background:var(--surface-2); color:var(--fg-2); }
  .scn-body { min-width:0; }
  .scn-id { color:var(--fg); font:600 13.5px/1.4 var(--font-mono); text-decoration:none; overflow-wrap:anywhere; }
  .scn-id:hover { color:var(--accent-fg); }
  .scn-desc { margin:3px 0 9px; color:var(--fg-2); font-size:13.5px; line-height:1.5; }
  .scn-meta { display:flex; flex-wrap:wrap; align-items:center; gap:6px 12px; }
  .scn-checks { display:inline-flex; align-items:center; gap:5px; color:var(--muted); font-size:12px; }
  .scn-agents { display:flex; align-items:center; gap:8px; padding-top:9px; }
  .scn-agents-n { color:var(--muted); font-size:12px; white-space:nowrap; }
  .run-card { display:flex; flex-direction:column; gap:14px; padding:16px; }
  .run-card-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .run-card-head h2 { margin:0; font-size:14px; }
  .agent-quick { display:inline-flex; gap:2px; }
  .agent-quick button { height:24px; padding:0 8px; border:0; border-radius:6px; background:transparent; color:var(--muted); font-size:12px; cursor:pointer; }
  .agent-quick button:hover { background:var(--surface-3); color:var(--fg); }
  .agent-pick { display:flex; flex-direction:column; gap:1px; max-height:min(44vh, 400px); margin:0 -8px; padding:0 4px; overflow:auto; border:0; }
  .agent-opt { position:relative; display:grid; grid-template-columns:17px minmax(0,1fr) auto; align-items:start; gap:10px; padding:8px; border-radius:8px; cursor:pointer; transition:background .12s; }
  .agent-opt:hover { background:var(--surface-2); }
  .agent-opt:has(input:checked) { background:color-mix(in srgb, var(--accent) 5%, transparent); }
  .agent-opt .check-box { margin-top:1px; }
  .agent-opt-body { display:flex; flex-direction:column; min-width:0; }
  .agent-opt-body code { color:var(--fg); font-size:12.5px; font-weight:600; }
  .agent-opt-body small { display:-webkit-box; margin-top:2px; overflow:hidden; color:var(--muted); font-size:12px; line-height:1.4; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
  .run-opts { display:grid; grid-template-columns:90px minmax(0,1fr); gap:10px; padding-top:12px; border-top:1px solid var(--border); }
  .field { display:flex; flex-direction:column; gap:6px; min-width:0; }
  .field > span { color:var(--muted); font:500 10.5px/1 var(--font-mono); letter-spacing:.08em; text-transform:uppercase; }
  .field input { width:100%; height:34px; padding:0 10px; border:1px solid var(--border-2); border-radius:8px; background:var(--surface); outline:none; font-family:var(--font-mono); font-size:12.5px; transition:border-color .15s, box-shadow .15s; }
  .field input:focus { border-color:var(--focus); box-shadow:0 0 0 3px var(--accent-soft); }
  .field input::placeholder { color:var(--faint); }

  .task-card blockquote.task { margin:0; padding:2px 0 2px 16px; border-left:2px solid var(--accent); font-size:16.5px; line-height:1.6; letter-spacing:-.01em; }
  .fault-list { margin:0; padding:0; list-style:none; }
  .fault-list li { display:grid; grid-template-columns:32px minmax(0,1fr) auto; align-items:start; gap:12px; padding:12px 0; border-top:1px solid var(--border); }
  .fault-list li:first-child { padding-top:0; border-top:0; }
  .fault-list li:last-child { padding-bottom:0; }
  .fault-icon { display:grid; place-items:center; width:32px; height:32px; border-radius:9px; background:var(--warn-bg); box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--warn-fg) 20%, transparent); color:var(--warn-fg); }
  .fault-list code { color:var(--fg); font-size:13px; font-weight:600; }
  .fault-list p { margin:3px 0 0; color:var(--muted); font-size:13px; }
  .stage-pill { display:inline-flex; align-items:center; height:22px; padding:0 9px; border:1px solid var(--border); border-radius:6px; color:var(--fg-2); font-size:11.5px; white-space:nowrap; }
  .expect-rows { margin:0; padding:0; list-style:none; }
  .expect-rows li { display:flex; align-items:flex-start; gap:10px; padding:7px 0; font-size:13.5px; line-height:1.5; }
  .expect-rows .i { margin-top:2px; color:var(--accent-fg); }
  .policy { display:inline-flex; align-items:center; gap:5px; height:24px; padding:0 8px; border-radius:6px; background:var(--ok-bg); color:var(--ok-fg); font-size:12px; }
  .policy code { font-size:11.5px; }
  .code-view { display:flex; max-height:560px; overflow:auto; background:var(--surface); font:12.5px/1.75 var(--font-mono); }
  .code-gutter { position:sticky; left:0; flex:none; padding:14px 12px 14px 16px; border-right:1px solid var(--border); background:var(--surface-2); color:var(--faint); font-variant-numeric:tabular-nums; text-align:right; user-select:none; }
  .code-gutter span, .ce-lines span { display:block; }
  .code-view pre.code { flex:1; margin:0; padding:14px 18px; overflow:visible; border:0; border-radius:0; background:transparent; font:inherit; white-space:pre; }
  .ev-list, .recent-list { margin:0; padding:0; list-style:none; }
  .ev-list li { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:9px 0; border-top:1px solid var(--border); }
  .ev-list li:first-child { padding-top:0; border-top:0; } .ev-list li:last-child { padding-bottom:0; }
  .ev-list code { color:var(--fg-2); font-size:12.5px; }
  .recent-list { margin:0 -8px; }
  .recent-list a { display:flex; align-items:center; gap:8px; padding:7px 8px; border-radius:8px; color:inherit; text-decoration:none; transition:background .12s; }
  .recent-list a:hover { background:var(--surface-2); }
  .recent-list code { flex:1; overflow:hidden; color:var(--fg-2); font-size:12.5px; text-overflow:ellipsis; white-space:nowrap; }

  .run-list { overflow:hidden; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); box-shadow:var(--shadow-sm); }
  .run-item { display:grid; grid-template-columns:34px minmax(0,1fr) 190px 150px 80px 16px; align-items:center; gap:18px; padding:15px 18px; border-top:1px solid var(--border); color:inherit; text-decoration:none; transition:background .12s; }
  .run-item:first-child { border-top:0; }
  .run-item:hover { background:var(--surface-2); }
  .run-item-icon { display:grid; place-items:center; width:34px; height:34px; border:1px solid var(--border); border-radius:10px; background:var(--surface-2); color:var(--fg-2); }
  .run-item-title { overflow:hidden; color:var(--fg); font:600 13.5px/1.4 var(--font-mono); text-overflow:ellipsis; white-space:nowrap; }
  .run-item-sub { margin-top:3px; overflow:hidden; color:var(--muted); font-size:12.5px; text-overflow:ellipsis; white-space:nowrap; }
  .run-item-status { font-size:13px; }
  .run-item-time { color:var(--muted); font-size:12px; text-align:right; white-space:nowrap; }
  .status-ok, .status-bad { display:inline-flex; align-items:center; gap:6px; font-weight:500; }
  .status-ok { color:var(--ok-fg); } .status-bad { color:var(--bad-fg); }
  .run-item-go { color:var(--faint); }
  .run-summary { display:grid; grid-template-columns:auto minmax(0,1fr); align-items:center; gap:32px; margin:0 0 16px; padding:18px 20px; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); box-shadow:var(--shadow-sm); }
  .stat-row { display:flex; flex-wrap:wrap; gap:10px; }
  .stat-tile { display:flex; flex-direction:column; min-width:140px; padding:12px 14px; border:1px solid var(--border); border-radius:11px; background:var(--surface-2); }
  .stat-tile span { color:var(--muted); font:500 10.5px/1 var(--font-mono); letter-spacing:.08em; text-transform:uppercase; }
  .stat-tile b { margin:8px 0 3px; font-size:26px; font-weight:600; line-height:1; letter-spacing:-.04em; font-variant-numeric:tabular-nums; }
  .stat-tile em { color:var(--muted); font-size:16px; font-style:normal; font-weight:500; }
  .stat-tile small { color:var(--muted); font-size:11.5px; }
  .stat-tile.ok b { color:var(--ok-fg); }
  .stat-tile.bad { border-color:color-mix(in srgb, var(--bad-fg) 30%, transparent); background:var(--bad-bg); } .stat-tile.bad b { color:var(--bad-fg); }
  .stat-tile.warn { border-color:color-mix(in srgb, var(--warn-fg) 30%, transparent); background:var(--warn-bg); } .stat-tile.warn b { color:var(--warn-fg); }
  .run-summary-bar .vlegend { grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); column-gap:22px; }
  .matrix-tools { display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin:0 0 12px; }
  .matrix-wrap { max-height:calc(100vh - var(--topbar) - 120px); overflow:auto; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); box-shadow:var(--shadow-sm); }
  .matrix { width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; }
  .matrix thead th { position:sticky; top:0; z-index:2; padding:12px; border-bottom:1px solid var(--border); background:var(--surface-2); text-align:left; vertical-align:top; text-transform:none; letter-spacing:0; }
  .matrix thead th code { display:block; overflow:hidden; color:var(--fg); font-size:12px; font-weight:600; text-overflow:ellipsis; white-space:nowrap; }
  .matrix .matrix-corner { left:0; z-index:3; width:220px; border-right:1px solid var(--border); color:var(--muted); font:500 10.5px/1.4 var(--font-mono); letter-spacing:.08em; text-transform:uppercase; }
  .matrix tbody th { position:sticky; left:0; z-index:1; padding:14px; border-right:1px solid var(--border); border-bottom:1px solid var(--border); background:var(--surface); font:400 13px var(--font-sans); letter-spacing:0; text-align:left; text-transform:none; white-space:normal; }
  .matrix tbody th a { color:var(--fg); font:600 12.5px/1.45 var(--font-mono); text-decoration:none; overflow-wrap:anywhere; }
  .matrix tbody th a:hover { color:var(--accent-fg); }
  .matrix td { height:1px; padding:8px; border-bottom:1px solid var(--border); vertical-align:top; }
  .matrix tbody tr:last-child > * { border-bottom:0; }
  .cell { position:relative; display:flex; flex-direction:column; gap:7px; height:100%; padding:10px 11px 10px 13px; overflow:hidden; border-radius:10px; background:color-mix(in srgb, var(--v-bg) 70%, var(--surface)); color:inherit; text-decoration:none; box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--v-bd) 75%, transparent); transition:box-shadow .15s, transform .15s; }
  .cell::before { content:""; position:absolute; inset:0 auto 0 0; width:3px; background:var(--v); }
  a.cell:hover { box-shadow:inset 0 0 0 1px var(--v-bd), var(--shadow); transform:translateY(-1px); }
  .cell.mismatch { box-shadow:inset 0 0 0 2px var(--bad-fg); }
  .cell.is-flaky { box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--warn-fg) 55%, transparent); }
  .cell-top { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
  .cell .badge { height:20px; padding:0 7px 0 6px; font-size:10px; }
  .cell .why { display:-webkit-box; overflow:hidden; color:var(--fg-2); font-size:12.5px; line-height:1.45; -webkit-line-clamp:3; -webkit-box-orient:vertical; }
  .cell-empty { color:var(--faint); font-size:12px; }
  .cell-empty::before { display:none; }
  .cell-go { position:absolute; top:13px; right:10px; color:var(--v-fg); opacity:0; transform:translateX(-3px); transition:opacity .15s, transform .15s; }
  a.cell:hover .cell-go, a.cell:focus-visible .cell-go { opacity:1; transform:none; }
  .trials { display:flex; align-items:center; gap:8px; margin-top:auto; color:var(--muted); font-size:11.5px; font-variant-numeric:tabular-nums; }
  .trials.flaky { color:var(--warn-fg); font-weight:600; }
  .trial-bar { display:flex; flex:1; gap:2px; max-width:96px; height:5px; overflow:hidden; border-radius:999px; }
  .trial-bar i { min-width:3px; background:var(--v); }
  .col-head { display:flex; flex-direction:column; gap:7px; min-width:0; }
  .col-head .vbar { max-width:140px; }
  .exp-sum { display:inline-flex; align-items:center; gap:5px; font:500 11.5px/1.3 var(--font-sans); letter-spacing:0; text-transform:none; white-space:nowrap; }
  .exp-sum.ok { color:var(--ok-fg); } .exp-sum.bad { color:var(--bad-fg); }
  .matrix tbody th .exp-sum { display:flex; margin-top:6px; }
  #matrix[data-filter=unexpected] tr[data-unexpected="0"], #matrix[data-filter=flaky] tr[data-flaky="0"] { display:none; }
  #matrix[data-filter=unexpected] .cell:not(.mismatch), #matrix[data-filter=flaky] .cell:not(.is-flaky) { opacity:.35; }
  #matrix[data-density=compact] .cell .why, #matrix[data-density=compact] .trials > span:last-child { display:none; }
  #matrix[data-density=compact] .cell { padding:8px 10px 8px 12px; }
  #matrix[data-density=compact] td { padding:5px; }
  #matrix[data-density=compact] tbody th { padding:10px 14px; }

  .table-wrap { overflow:auto; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); box-shadow:var(--shadow-sm); }
  .table-wrap.flush { border:0; border-radius:0; box-shadow:none; }
  .tbl th { position:sticky; top:0; z-index:1; padding:10px 14px; border-bottom:1px solid var(--border); background:var(--surface-2); }
  .tbl td { padding:11px 14px; font-size:13.5px; vertical-align:middle; }
  .tbl tbody tr:last-child td { border-bottom:0; }
  .tbl tr[data-href], .tbl tr[data-action] { cursor:pointer; }
  .tbl tbody tr:hover td { background:var(--surface-2); }
  .tbl tr.selected td { background:color-mix(in srgb, var(--accent) 6%, var(--surface)); }
  .tbl .num { font-variant-numeric:tabular-nums; text-align:right; }
  .tbl td.num { font-family:var(--font-mono); font-size:12.5px; }
  .tbl .col-check { width:46px; padding-right:0; }
  .tbl .check { margin:0; }
  .tbl code { color:var(--fg-2); font-size:12.5px; white-space:nowrap; }
  .row-link { color:var(--fg); font:600 13px/1.4 var(--font-mono); text-decoration:none; white-space:nowrap; }
  .row-link:hover { color:var(--accent-fg); }
  .rule { color:var(--fg-2); font-size:12px; }
  .rule.add { color:var(--ok-fg); } .rule.del { color:var(--bad-fg); }
  .where, .tbl td.mono { white-space:nowrap; }
  .where small { margin-left:8px; color:var(--muted); font-size:12px; }
  .row-error td { background:var(--bad-bg); }
  .tbl .rules { display:flex; flex-direction:column; align-items:flex-start; gap:2px; }
  .tbl .seed { display:inline-block; max-width:220px; overflow:hidden; text-overflow:ellipsis; vertical-align:middle; }
  .selbar { position:sticky; bottom:22px; z-index:20; display:flex; align-items:center; gap:8px; width:max-content; max-width:100%; margin:18px auto 0; padding:7px 7px 7px 16px; border:1px solid light-dark(#2c2824,#3a3631); border-radius:14px; background:light-dark(#1c1916,#f3f1ee); color:light-dark(#f3f1ee,#1c1916); box-shadow:var(--shadow-lg); opacity:0; pointer-events:none; transform:translateY(12px); transition:opacity .2s, transform .2s; }
  .selbar.show { opacity:1; pointer-events:auto; transform:none; }
  .selbar-count { margin-right:6px; font-size:13px; white-space:nowrap; }
  .selbar-count b { font-family:var(--font-mono); }
  .selbar .btn-secondary { border-color:light-dark(#3a3631,#d5d0c9); background:transparent; color:inherit; box-shadow:none; }
  .selbar .btn-secondary:hover:not(:disabled) { background:light-dark(rgba(255,255,255,.08),rgba(0,0,0,.06)); }
  .selbar .icon-btn { color:light-dark(#a39d94,#6a645c); }
  .selbar .icon-btn:hover { background:light-dark(rgba(255,255,255,.08),rgba(0,0,0,.06)); color:inherit; }
  .meta-chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:4px; }
  .meta-chip { display:inline-flex; align-items:center; gap:6px; max-width:100%; height:26px; padding:0 10px; overflow:hidden; border:1px solid var(--border); border-radius:7px; background:var(--surface); color:var(--fg-2); font-size:12.5px; white-space:nowrap; }
  .meta-chip > :last-child { overflow:hidden; text-overflow:ellipsis; }
  .meta-chip .i { color:var(--muted); }
  .meta-chip code, .meta-chip .mono { font-size:12px; }
  .page-report .rpt { --sticky-top:calc(var(--topbar) + 16px); }
  .page-report .trial-aside { max-height:calc(100vh - var(--topbar) - 48px); }

  .agents-tbl .row-muted td { color:var(--muted); }
  .agents-tbl .row-muted code { color:var(--fg-2); }
  .agent-cell { display:flex; align-items:flex-start; gap:12px; min-width:260px; }
  .agent-cell code { color:var(--fg); font-size:13px; font-weight:600; }
  .agent-cell .src-tag { margin-left:8px; vertical-align:1px; }
  .agent-cell p { margin:3px 0 0; color:var(--muted); font-size:12.5px; line-height:1.45; white-space:normal; }
  .mix-cell { min-width:220px; }
  .mix-counts { display:flex; flex-wrap:wrap; gap:4px 10px; margin-top:7px; }
  .mix-counts span { display:inline-flex; align-items:center; gap:5px; color:var(--fg-2); font:500 11.5px/1 var(--font-mono); }
  .mix-counts i { width:7px; height:7px; border-radius:2px; background:var(--v); }
  .safe-rate { position:relative; display:inline-flex; align-items:center; justify-content:flex-end; min-width:64px; padding-bottom:6px; font:600 13px/1 var(--font-mono); }
  .safe-rate::before, .safe-rate::after { content:""; position:absolute; bottom:0; right:0; height:3px; border-radius:2px; }
  .safe-rate::before { left:0; background:var(--surface-3); }
  .safe-rate::after { width:var(--p); background:var(--ssucc); }
  .safe-rate.none { color:var(--faint); }
  .agents-tbl .go { width:28px; color:var(--faint); }

  .cmp { margin:0 0 18px; overflow:hidden; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); box-shadow:var(--shadow-sm); }
  .cmp-head { display:flex; align-items:center; gap:14px; padding:18px 20px; }
  .cmp.ok .cmp-head { background:linear-gradient(180deg, var(--ok-bg), transparent); } .cmp.bad .cmp-head { background:linear-gradient(180deg, var(--bad-bg), transparent); }
  .cmp-icon { display:grid; place-items:center; } .cmp.ok .cmp-icon { color:var(--ok-fg); } .cmp.bad .cmp-icon { color:var(--bad-fg); }
  .cmp-head h2 { margin:0; font-size:18px; letter-spacing:-.02em; }
  .cmp-head p { margin:3px 0 0; color:var(--fg-2); font-size:13px; }
  .cmp-stats { display:flex; flex-wrap:wrap; gap:6px; padding:12px 20px; border-top:1px solid var(--border); border-bottom:1px solid var(--border); }
  .cmp-stat { display:inline-flex; align-items:baseline; gap:6px; padding:4px 10px; border-radius:7px; background:var(--surface-2); color:var(--muted); font-size:12.5px; }
  .cmp-stat b { color:var(--fg); font:600 13px/1 var(--font-mono); font-variant-numeric:tabular-nums; }
  .cmp-stat.zero { opacity:.55; }
  .cmp-stat.bad { background:var(--bad-bg); color:var(--bad-fg); } .cmp-stat.bad b { color:var(--bad-fg); }
  .cmp-stat.ok { background:var(--ok-bg); color:var(--ok-fg); } .cmp-stat.ok b { color:var(--ok-fg); }
  .kind { display:inline-flex; align-items:center; height:22px; padding:0 8px; border-radius:6px; background:var(--surface-3); color:var(--fg-2); font-size:12px; font-weight:600; white-space:nowrap; }
  .kind.bad { background:var(--bad-bg); color:var(--bad-fg); } .kind.ok { background:var(--ok-bg); color:var(--ok-fg); } .kind.muted { background:transparent; color:var(--muted); }
  .transition { display:inline-flex; flex-wrap:wrap; align-items:center; gap:6px; color:var(--muted); }
  .ci-card { margin-top:18px; }
  .cmd-block { position:relative; }
  .cmd-block pre.code { padding:14px 96px 14px 16px; overflow:auto; background:var(--surface-2); white-space:pre; }
  .cmd-block .btn { position:absolute; top:9px; right:9px; }

  .editor-layout { display:grid; grid-template-columns:minmax(0,1.55fr) minmax(320px,1fr); align-items:start; gap:20px; }
  .editor-pane { position:sticky; top:calc(var(--topbar) + 18px); display:flex; flex-direction:column; height:max(540px, calc(100vh - var(--topbar) - 64px)); overflow:hidden; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); box-shadow:var(--shadow); }
  .editor-bar, .editor-foot { display:flex; flex:none; align-items:center; gap:14px; padding:0 14px; background:var(--surface-2); }
  .editor-bar { height:42px; border-bottom:1px solid var(--border); }
  .editor-dots { display:inline-flex; gap:6px; }
  .editor-dots i { width:10px; height:10px; border-radius:50%; background:var(--border-2); }
  .editor-file { display:inline-flex; align-items:center; gap:7px; color:var(--fg); font:500 12.5px/1 var(--font-mono); }
  .editor-file .i { color:var(--muted); }
  .editor-hint { display:inline-flex; align-items:center; gap:3px; margin-left:auto; color:var(--muted); font-size:11.5px; }
  .editor-hint kbd { min-width:18px; height:18px; font-size:10px; }
  .editor-hint kbd + kbd { margin-right:4px; }
  .editor-foot { height:30px; border-top:1px solid var(--border); color:var(--muted); font:500 11px/1 var(--font-mono); font-variant-numeric:tabular-nums; }
  .editor-foot span:last-child { margin-left:auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .code-editor { --lh:21px; position:relative; display:flex; flex:1; min-height:0; overflow:hidden; font:13px/var(--lh) var(--font-mono); }
  .ce-gutter { flex:none; width:52px; padding-top:14px; overflow:hidden; border-right:1px solid var(--border); background:var(--surface-2); color:var(--faint); font-variant-numeric:tabular-nums; text-align:right; user-select:none; }
  .ce-lines span { height:var(--lh); padding-right:12px; }
  .ce-lines span.bad { background:var(--bad-bg); color:var(--bad-fg); font-weight:600; }
  .ce-body { position:relative; flex:1; min-width:0; overflow:hidden; }
  .ce-highlight { position:absolute; top:0; left:0; min-width:100%; margin:0; padding:14px 18px 60px; overflow:visible; border:0; border-radius:0; background:transparent; font:inherit; line-height:var(--lh); white-space:pre; pointer-events:none; }
  .ce-highlight code { font:inherit; }
  #editor-text { position:absolute; inset:0; width:100%; height:100%; margin:0; padding:14px 18px 60px; overflow:auto; border:0; outline:none; resize:none; background:transparent; color:transparent; -webkit-text-fill-color:transparent; caret-color:var(--accent); font:inherit; font-variant-ligatures:none; line-height:var(--lh); white-space:pre; tab-size:2; }
  #editor-text::selection { background:color-mix(in srgb, var(--accent) 26%, transparent); }
  .editor-side { display:flex; flex-direction:column; gap:16px; min-width:0; }
  .vstate { padding:14px 16px; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); box-shadow:var(--shadow-sm); }
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
  .ref-group > span { display:flex; align-items:baseline; gap:8px; margin:0 0 8px; color:var(--muted); font:500 10.5px/1 var(--font-mono); letter-spacing:.08em; text-transform:uppercase; }
  .ref-group em { color:var(--faint); font-style:normal; letter-spacing:0; text-transform:none; }

  .tabs { position:sticky; top:calc(var(--topbar) + 10px); z-index:10; display:flex; flex-wrap:wrap; gap:6px; width:max-content; max-width:100%; margin:0 0 26px; padding:4px; border:1px solid var(--border); border-radius:12px; background:color-mix(in srgb, var(--surface) 86%, transparent); box-shadow:var(--shadow); backdrop-filter:blur(10px); }
  .tab { display:inline-flex; align-items:center; gap:8px; height:30px; padding:0 12px; border:0; border-radius:8px; background:transparent; color:var(--fg-2); font-size:13px; font-weight:500; cursor:pointer; }
  .tab:hover { background:var(--surface-3); color:var(--fg); }
  .tab .i { color:var(--muted); }
  .tab span { color:var(--muted); font:500 11px/1 var(--font-mono); font-variant-numeric:tabular-nums; }
  .cat-section { margin:0 0 40px; scroll-margin-top:calc(var(--topbar) + 70px); }
  .cat-section > h2 { margin:0 0 14px; font-size:19px; letter-spacing:-.025em; }
  .agent-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(290px, 1fr)); gap:12px; }
  .agent-card { padding:15px 16px; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); box-shadow:var(--shadow-sm); }
  .agent-card-head { display:flex; align-items:center; gap:10px; }
  .agent-card-head .agent-icon { width:28px; height:28px; border-radius:8px; }
  .agent-card-head code { color:var(--fg); font-size:13px; font-weight:600; }
  .agent-card-head .src-tag { max-width:40%; margin-left:auto; overflow:hidden; text-overflow:ellipsis; }
  .agent-card p { margin:10px 0 0; color:var(--fg-2); font-size:13px; line-height:1.5; }
  .world-card { margin:0 0 14px; }
  .world-head { display:flex; align-items:flex-start; gap:12px; padding:16px 18px; border-bottom:1px solid var(--border); }
  .world-icon { display:grid; flex:none; place-items:center; width:38px; height:38px; border:1px solid var(--border); border-radius:11px; background:var(--surface-2); color:var(--fg-2); }
  .world-head h3 { margin:0; font:600 14.5px/1.4 var(--font-mono); }
  .world-head p { margin:2px 0 0; color:var(--muted); font-size:13px; }
  .world-head .src-tag { margin-left:auto; }
  .tool-name { color:var(--fg) !important; font-weight:600; }
  .writes { margin-left:8px; padding:2px 6px; border-radius:5px; background:var(--warn-bg); color:var(--warn-fg); font:600 9.5px/1 var(--font-mono); letter-spacing:.06em; text-transform:uppercase; }
  .args { white-space:normal !important; }
  .records { display:flex; flex-direction:column; gap:8px; padding:14px 18px; border-top:1px solid var(--border); background:var(--surface-2); }
  .records > span { color:var(--muted); font:500 10.5px/1 var(--font-mono); letter-spacing:.08em; text-transform:uppercase; }
  .record { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
  .record-kind { margin-right:4px; color:var(--fg); font-size:12.5px; font-weight:600; }
  .field-chip { display:inline-flex; align-items:center; gap:5px; height:22px; padding:0 7px; border:1px solid var(--border); border-radius:6px; background:var(--surface); color:var(--fg-2); font:11.5px/1 var(--font-mono); }
  .field-chip em { color:var(--muted); font-style:normal; }

  .palette-root { position:fixed; inset:0; z-index:100; }
  .palette-scrim { position:absolute; inset:0; background:var(--overlay); backdrop-filter:blur(4px); animation:fade-in .15s ease-out; }
  .palette { position:absolute; top:13vh; left:50%; width:min(660px, calc(100vw - 32px)); overflow:hidden; border:1px solid var(--border-2); border-radius:16px; background:var(--surface); box-shadow:var(--shadow-lg); transform:translateX(-50%); animation:pop .16s ease-out; }
  .palette-input { display:flex; align-items:center; gap:10px; height:56px; padding:0 16px; border-bottom:1px solid var(--border); color:var(--muted); }
  .palette-input input { flex:1; min-width:0; height:100%; border:0; outline:0; background:transparent; color:var(--fg); font-size:15.5px; }
  .palette-input input::placeholder { color:var(--faint); }
  .palette-list { max-height:min(420px, 56vh); padding:6px; overflow:auto; }
  .palette-group { padding:10px 10px 6px; color:var(--faint); font:500 10.5px/1 var(--font-mono); letter-spacing:.1em; text-transform:uppercase; }
  .palette-item { display:flex; align-items:center; gap:10px; height:38px; padding:0 10px; border-radius:9px; color:var(--fg-2); font-size:13.5px; cursor:pointer; }
  .palette-item .i { color:var(--muted); }
  .palette-item.active { background:var(--surface-3); color:var(--fg); }
  .palette-item.active .i { color:var(--accent); }
  .pi-label { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .pi-hint { max-width:40%; overflow:hidden; color:var(--muted); font:500 11.5px/1 var(--font-mono); text-overflow:ellipsis; white-space:nowrap; }
  .pi-enter { display:inline-grid; color:var(--muted); }
  .palette-empty { padding:28px; color:var(--muted); text-align:center; }
  .palette-foot { display:flex; gap:16px; padding:9px 14px; border-top:1px solid var(--border); background:var(--surface-2); color:var(--muted); font-size:12px; }
  .palette-foot span { display:inline-flex; align-items:center; gap:4px; }
  .palette-foot kbd, .palette-input kbd { min-width:18px; height:18px; padding:0 5px; font-size:10px; }

  .toasts { position:fixed; right:22px; bottom:22px; z-index:90; display:flex; flex-direction:column; align-items:flex-end; gap:8px; }
  .toast { display:flex; align-items:flex-start; gap:10px; max-width:460px; padding:11px 8px 11px 14px; border:1px solid var(--border-2); border-radius:12px; background:var(--surface); box-shadow:var(--shadow-lg); font-size:13.5px; line-height:1.45; animation:rise .2s ease-out; transition:opacity .2s, transform .2s; }
  .toast > .i { margin-top:1px; }
  .toast-ok > .i { color:var(--ok-fg); } .toast-bad > .i { color:var(--bad-fg); } .toast-info > .i { color:var(--info-fg); }
  .toast-progress > .spinner { margin-top:2px; color:var(--accent); }
  .toast-action { align-self:center; padding:3px 9px; border:1px solid var(--border-2); border-radius:7px; color:var(--fg); font-size:12.5px; font-weight:600; text-decoration:none; white-space:nowrap; }
  .toast-action:hover { background:var(--surface-3); }
  .toast-text { flex:1; min-width:0; padding-top:1px; word-break:break-word; }
  .toast .icon-btn { width:24px; height:24px; margin:-2px 0 0; }
  .toast.out { opacity:0; transform:translateY(6px); }
  .dialog { width:min(460px, calc(100vw - 32px)); padding:0; border:1px solid var(--border-2); border-radius:16px; background:var(--surface); color:var(--fg); box-shadow:var(--shadow-lg); }
  .dialog::backdrop { background:var(--overlay); backdrop-filter:blur(4px); }
  .dialog[open] { animation:rise .18s ease-out; }
  .dialog-body { display:flex; align-items:flex-start; gap:14px; padding:22px 22px 6px; }
  .dialog-icon { display:grid; flex:none; place-items:center; width:38px; height:38px; border-radius:50%; background:var(--surface-3); color:var(--fg-2); }
  .dialog-icon.danger { background:var(--bad-bg); color:var(--bad-fg); }
  .dialog h2 { margin:6px 0 6px; font-size:16px; }
  .dialog p { margin:0; color:var(--fg-2); font-size:13.5px; line-height:1.55; }
  .dialog p code { font-size:12px; }
  .dialog-actions { display:flex; justify-content:flex-end; gap:8px; padding:18px 22px 20px; }
  .dialog-shortcuts { width:min(720px, calc(100vw - 32px)); }
  .dialog-head { display:flex; align-items:center; justify-content:space-between; padding:16px 16px 12px 22px; border-bottom:1px solid var(--border); }
  .dialog-head h2 { display:flex; align-items:center; gap:10px; margin:0; font-size:15px; }
  .dialog-head h2 .i { color:var(--accent); }
  .shortcuts { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:4px 28px; padding:16px 22px 22px; }
  .shortcuts h3 { margin:12px 0 6px; color:var(--muted); font:500 10.5px/1 var(--font-mono); letter-spacing:.1em; text-transform:uppercase; }
  .shortcuts dl { margin:0; }
  .shortcuts dl > div { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:6px 0; border-bottom:1px solid var(--border); font-size:13px; }
  .shortcuts dl > div:last-child { border-bottom:0; }
  .shortcuts dd { display:inline-flex; gap:4px; margin:0; }
  .boot-error { max-width:640px; margin:12vh auto; padding:0 20px; }

  @media (max-width: 1280px) {
    .kpis { grid-template-columns:repeat(3, minmax(0,1fr)); }
    .kpi:nth-child(4) { border-left:0; }
    .kpi:nth-child(n+4) { border-top:1px solid var(--border); }
    .lanes-head, .lane { grid-template-columns:200px minmax(0,1fr); }
    .lanes-head span:last-child { display:none; }
    .lane-verdict { grid-column:2; }
    .legend-grid, .next-grid { grid-template-columns:repeat(2, minmax(0,1fr)); }
    .run-item { grid-template-columns:34px minmax(0,1fr) 150px 140px 16px; }
    .run-item-time { display:none; }
  }
  @media (max-width: 1180px) {
    .page-actions { flex:1 1 100%; justify-content:flex-start; }
    .split, .detail, .editor-layout, .hero { grid-template-columns:minmax(0,1fr); }
    .split-side, .detail-side, .editor-pane { position:static; }
    .editor-pane { height:560px; }
    .run-summary { grid-template-columns:1fr; gap:18px; }
    .ov-grid { grid-template-columns:1fr; }
  }
  @media (max-width: 1024px) {
    .app { grid-template-columns:minmax(0,1fr); }
    .sidebar { position:fixed; inset:0 auto 0 0; z-index:50; width:280px; background:var(--canvas); box-shadow:var(--shadow-lg); transform:translateX(-100%); visibility:hidden; transition:transform .22s ease, visibility .22s; }
    .menu-open .sidebar { transform:none; visibility:visible; }
    .menu-open .sb-scrim { position:fixed; inset:0; z-index:49; display:block; background:var(--overlay); }
    .main { margin:0; border:0; border-radius:0; }
    .topbar .menu-btn, .topbar .topbar-logo { display:inline-grid; place-items:center; }
    .topbar { padding:0 12px 0 8px; }
    .topbar-search span, .topbar-search kbd { display:none; }
    .topbar-search { width:32px; justify-content:center; padding:0; }
    .view { padding:24px 20px 96px; }
    .steps, .story { grid-template-columns:1fr; }
    .story-step::after { display:none; }
  }
  @media (max-width: 760px) {
    .kpis { grid-template-columns:repeat(2, minmax(0,1fr)); }
    .kpi:nth-child(n) { border-top:1px solid var(--border); border-left:1px solid var(--border); }
    .kpi:nth-child(-n+2) { border-top:0; }
    .kpi:nth-child(odd) { border-left:0; }
    .hero { padding:28px 22px; }
    .display { font-size:36px; }
    .display-sm { font-size:30px; }
    .legend-grid, .next-grid { grid-template-columns:1fr; }
    .lanes-head { display:none; }
    .lane { grid-template-columns:1fr; gap:14px; }
    .lane-verdict { grid-column:auto; }
    .track { flex-wrap:wrap; row-gap:12px; }
    .run-item { grid-template-columns:minmax(0,1fr) 16px; }
    .run-item-icon, .run-item-bar, .run-item-status { display:none; }
    .scn-row { grid-template-columns:20px minmax(0,1fr); }
    .scn-icon, .scn-agents { display:none; }
    .page-head h1 { font-size:24px; }
    .page-head h1.mono-title { font-size:20px; }
    .trace-lane { grid-template-columns:96px minmax(40px,1fr) auto; }
    .mix { flex-direction:column; align-items:stretch; }
    .mix .ring { align-self:center; }
    .shortcuts { grid-template-columns:1fr; }
    .crumbs a { display:none; }
    .crumbs .crumb-sep { display:none; }
  }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration:.01ms !important; animation-delay:0s !important; transition-duration:.01ms !important; } }
`;
