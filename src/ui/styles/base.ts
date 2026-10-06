/** Fonts, the page frame, motion, and utilities for the local UI. Tokens come from BASE_CSS in html.ts. */
export const BASE_UI_CSS = `
  @font-face { font-family:"Geist"; src:url(/fonts/geist.woff2) format("woff2"); font-weight:100 900; font-style:normal; font-display:swap; }
  @font-face { font-family:"Geist Mono"; src:url(/fonts/geist-mono.woff2) format("woff2"); font-weight:100 900; font-style:normal; font-display:swap; }
  :root { --sidebar:244px; --sidebar-rail:60px; --topbar:52px; --tabbar:58px; --page-x:28px; --page-max:1480px;
    --ease:cubic-bezier(.2,.7,.2,1); --t-fast:110ms; --t-med:170ms; --t-slow:240ms;
    --row:40px; --row-compact:32px; --control:32px; --control-sm:26px;
    --z-sidebar:20; --z-topbar:30; --z-menu:50; --z-drawer:60; --z-modal:70; --z-toast:80; --z-tip:90;
    --c1:light-dark(#2f5d9e,#7fa6dd); --c2:light-dark(#b2401a,#f58c5e); --c3:light-dark(#2d7a6e,#5fc7b5); --c4:light-dark(#8a4f9c,#c79bd6); --c5:light-dark(#7a6a1e,#d1bf6a); --c6:light-dark(#3f4a57,#a7b3c1); --c7:light-dark(#9c3d5e,#e48aa7); --c8:light-dark(#4f7a2e,#9ccf7a); }
  :root[data-density=compact] { --row:32px; --control:28px; }
  html, body { height:100%; }
  body { overflow:hidden; background:var(--canvas); }
  .i { flex:none; display:inline-block; vertical-align:middle; }
  .small { font-size:12px; } .xsmall { font-size:11px; } .mono { font-family:var(--font-mono); font-size:12px; } .nowrap { white-space:nowrap; } .spacer { flex:1; } .grow { flex:1; min-width:0; }
  .num { text-align:right; } .center { text-align:center; } .strong { font-weight:600; color:var(--fg); } .fg { color:var(--fg); } .fg-2 { color:var(--fg-2); } .faint { color:var(--faint); }
  .ok-text { color:var(--ok-fg); } .bad-text { color:var(--bad-fg); } .warn-text { color:var(--warn-fg); } .accent-text { color:var(--accent-fg); }
  .clip { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .row { display:flex; align-items:center; gap:8px; min-width:0; } .row-wrap { flex-wrap:wrap; } .col { display:flex; flex-direction:column; gap:8px; min-width:0; }
  .gap-4 { gap:4px; } .gap-12 { gap:12px; } .gap-16 { gap:16px; }
  .hide { display:none !important; }
  .eyebrow { display:inline-flex; align-items:center; gap:6px; color:var(--muted); font:500 10.5px/1.3 var(--font-mono); letter-spacing:.07em; text-transform:uppercase; }
  .sep-dot::before { content:"·"; margin:0 6px; color:var(--faint); }
  kbd { display:inline-flex; align-items:center; justify-content:center; min-width:18px; height:18px; padding:0 4px; border:1px solid var(--border-2); border-bottom-width:2px; border-radius:var(--r-xs); background:var(--surface); color:var(--muted); font:500 10.5px/1 var(--font-mono); }
  code { color:inherit; }
  .code-inline { padding:1px 5px; border:1px solid var(--border); border-radius:var(--r-xs); background:var(--surface-2); font-size:11.5px; }
  hr.rule { height:1px; margin:16px 0; border:0; background:var(--border); }

  @keyframes spin { to { transform:rotate(360deg); } }
  @keyframes fade-in { from { opacity:0; } to { opacity:1; } }
  @keyframes rise-in { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:none; } }
  @keyframes slide-in-right { from { transform:translateX(16px); opacity:0; } to { transform:none; opacity:1; } }
  @keyframes skeleton { 0%, 100% { opacity:.55; } 50% { opacity:1; } }
  @keyframes progress-indeterminate { from { transform:translateX(-100%); } to { transform:translateX(250%); } }
  @keyframes live-ring { 0% { box-shadow:0 0 0 0 color-mix(in srgb, var(--live, var(--ok)) 45%, transparent); } 100% { box-shadow:0 0 0 6px transparent; } }
  .spinner { display:inline-block; flex:none; width:12px; height:12px; border:1.5px solid currentColor; border-right-color:transparent; border-radius:50%; animation:spin .7s linear infinite; }
  .view-enter > * { animation:rise-in var(--t-slow) var(--ease) both; }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration:.01ms !important; animation-iteration-count:1 !important; transition-duration:.01ms !important; scroll-behavior:auto !important; } }
  :root[data-motion=reduce] *, :root[data-motion=reduce] *::before, :root[data-motion=reduce] *::after { animation-duration:.01ms !important; animation-iteration-count:1 !important; transition-duration:.01ms !important; }
`;
