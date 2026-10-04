import { callState, describeBudget, describeFault, describeOutcome, expectParts, worstTrial } from "./describe.js";
import { pct, truncate } from "./format.js";
import { VERDICTS, type GradedTrial, type RunReport, type Verdict } from "./types.js";

/** Escapes text for HTML and XML content and attribute values. */
export function esc(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

let logos = 0;

/** The brand mark: an agent's spark above a crucible of molten metal, on a dark tile. Each copy gets its own gradient ids. */
export function logo(size = 28): string {
  const id = `ac-logo-${++logos}`;
  return `<svg class="logo" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><defs><linearGradient id="${id}-t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2521"/><stop offset="1" stop-color="#0e0c0b"/></linearGradient><radialGradient id="${id}-g" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff6a22" stop-opacity=".55"/><stop offset="1" stop-color="#ff6a22" stop-opacity="0"/></radialGradient><linearGradient id="${id}-v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffa63d"/><stop offset=".55" stop-color="#ff561c"/><stop offset="1" stop-color="#cf2b2b"/></linearGradient><linearGradient id="${id}-s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#ffd27a"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="url(#${id}-t)"/><ellipse cx="16" cy="18" rx="12.5" ry="10" fill="url(#${id}-g)"/><path d="M7.4 12.6H24.6C24.4 16.8 23.4 20.4 22.2 23.2C21.8 24.3 20.8 25.1 19.7 25.1H12.3C11.2 25.1 10.2 24.3 9.8 23.2C8.6 20.4 7.6 16.8 7.4 12.6Z" fill="url(#${id}-v)"/><ellipse cx="16" cy="12.6" rx="8.6" ry="1.85" fill="#ffd994"/><ellipse cx="16" cy="12.45" rx="5.6" ry=".9" fill="#fff6e0"/><path d="M16 2.4c.33 2.57 1.43 3.67 4 4-2.57.33-3.67 1.43-4 4-.33-2.57-1.43-3.67-4-4 2.57-.33 3.67-1.43 4-4z" fill="url(#${id}-s)"/><rect x=".5" y=".5" width="31" height="31" rx="7.5" fill="none" stroke="#fff" stroke-opacity=".1"/></svg>`;
}

/** A lightning bolt for fault labels, inline so report pages stay self-contained. */
const BOLT = '<svg class="bolt" width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"><path d="M13.4 2 4.6 13.4h6.6L10.4 22l8.9-11.5h-6.6z" fill="currentColor"/></svg>';

/**
 * Design tokens, base elements, verdict colors, badges, chips, and code colors shared by the HTML
 * report, the run index, and the local UI. Every color follows the system's light or dark setting
 * through light-dark(), unless the root element sets data-theme.
 */
export const BASE_CSS = `
  :root { color-scheme:light dark;
    --font-sans:"Geist","Inter",-apple-system,BlinkMacSystemFont,"Segoe UI Variable Text","Segoe UI",system-ui,Roboto,"Helvetica Neue",Arial,sans-serif;
    --font-mono:"Geist Mono","JetBrains Mono","SF Mono","Cascadia Code",ui-monospace,Menlo,Consolas,"Liberation Mono",monospace;
    --radius-sm:6px; --radius:10px; --radius-lg:14px;
    --canvas:light-dark(#efede9,#090807); --bg:light-dark(#fbfaf8,#0e0d0c); --surface:light-dark(#ffffff,#141311); --surface-2:light-dark(#f7f6f3,#191715); --surface-3:light-dark(#efede9,#221f1c);
    --overlay:light-dark(rgba(28,24,20,.3),rgba(0,0,0,.62));
    --border:light-dark(#e9e6e1,#262320); --border-2:light-dark(#dbd7d0,#34312d); --border-3:light-dark(#c6c1b9,#4a453f);
    --fg:light-dark(#1c1916,#f3f1ee); --fg-2:light-dark(#4d4841,#c4bfb8); --muted:light-dark(#6f695f,#8f8981); --faint:light-dark(#958e84,#6e685f);
    --accent:light-dark(#f0561d,#ff6b2c); --accent-fg:light-dark(#c4410d,#ff9461); --accent-soft:light-dark(#fff1e9,rgba(255,107,44,.12)); --accent-line:light-dark(#fbd0bb,rgba(255,107,44,.38)); --focus:light-dark(#f0561d,#ff7a3d);
    --ember:linear-gradient(135deg,#ffb347 0%,#ff5c1c 52%,#d32f2a 100%);
    --ok-fg:light-dark(#17773f,#5edc98); --ok-bg:light-dark(#e9f6ee,rgba(52,194,116,.12));
    --bad-fg:light-dark(#c4231a,#ff8b80); --bad-bg:light-dark(#fdeceb,rgba(242,73,60,.13));
    --warn-fg:light-dark(#94560a,#f6c55c); --warn-bg:light-dark(#fff5dc,rgba(245,182,54,.12));
    --info-fg:light-dark(#1f5fc9,#94bcff); --info-bg:light-dark(#ebf2fe,rgba(91,149,255,.13));
    --add:var(--ok-fg); --chg:var(--warn-fg); --del:var(--bad-fg);
    --shadow-sm:0 1px 2px light-dark(rgba(28,24,20,.05),rgba(0,0,0,.4));
    --shadow:0 1px 2px light-dark(rgba(28,24,20,.04),rgba(0,0,0,.4)),0 8px 24px -10px light-dark(rgba(28,24,20,.14),rgba(0,0,0,.75));
    --shadow-lg:0 30px 70px -20px light-dark(rgba(28,24,20,.32),rgba(0,0,0,.85)),0 0 0 1px light-dark(rgba(28,24,20,.06),rgba(255,255,255,.07));
    --tk-key:light-dark(#2a5bd7,#8fb6ff); --tk-str:light-dark(#18794a,#7fdca4); --tk-num:light-dark(#b4540a,#ffb37a); --tk-lit:light-dark(#b8237a,#f59ad3); --tk-punc:light-dark(#8e8880,#6c665f); --tk-com:light-dark(#9b958c,#6c665f);
    --harm:light-dark(#e5372b,#f2493c); --harm-fg:light-dark(#c4231a,#ff8f85); --harm-bg:light-dark(#fdeceb,rgba(242,73,60,.12)); --harm-bd:light-dark(#f6cac6,rgba(242,73,60,.34));
    --silent:light-dark(#7a4be6,#9271ff); --silent-fg:light-dark(#6234c9,#bea9ff); --silent-bg:light-dark(#f3eefd,rgba(146,113,255,.14)); --silent-bd:light-dark(#ddd1fa,rgba(146,113,255,.38));
    --degr:light-dark(#e99a12,#f5b636); --degr-fg:light-dark(#94560a,#f7c75e); --degr-bg:light-dark(#fff5dc,rgba(245,182,54,.11)); --degr-bd:light-dark(#f0d597,rgba(245,182,54,.32));
    --inc:light-dark(#3b7cf0,#5b95ff); --inc-fg:light-dark(#1f5fc9,#94bcff); --inc-bg:light-dark(#ebf2fe,rgba(91,149,255,.13)); --inc-bd:light-dark(#c8dbfa,rgba(91,149,255,.36));
    --sfail:light-dark(#12a08f,#22c4ae); --sfail-fg:light-dark(#0a7367,#5adbc8); --sfail-bg:light-dark(#e2f6f2,rgba(34,196,174,.11)); --sfail-bd:light-dark(#b3e4da,rgba(34,196,174,.32));
    --ssucc:light-dark(#1f9e57,#34c274); --ssucc-fg:light-dark(#17773f,#63dd9b); --ssucc-bg:light-dark(#e9f6ee,rgba(52,194,116,.11)); --ssucc-bd:light-dark(#bfe5cc,rgba(52,194,116,.32)); }
  :root[data-theme=light] { color-scheme:light; }
  :root[data-theme=dark] { color-scheme:dark; }
  *, *::before, *::after { box-sizing:border-box; }
  * { scrollbar-width:thin; scrollbar-color:var(--border-2) transparent; }
  html { -webkit-text-size-adjust:100%; text-size-adjust:100%; }
  body { margin:0; font:14px/1.55 var(--font-sans); background:var(--bg); color:var(--fg); -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale; text-rendering:optimizeLegibility; }
  ::selection { background:color-mix(in srgb, var(--accent) 24%, transparent); }
  a { color:inherit; text-decoration-color:color-mix(in srgb, currentColor 35%, transparent); text-underline-offset:3px; }
  a:hover { text-decoration-color:currentColor; }
  h1, h2, h3 { font-weight:600; letter-spacing:-.015em; text-wrap:balance; }
  p { text-wrap:pretty; }
  code, pre, kbd, samp { font-family:var(--font-mono); font-size:12.5px; font-variant-ligatures:none; }
  pre { margin:0; padding:12px 14px; overflow:auto; border:1px solid var(--border); border-radius:8px; background:var(--surface-2); line-height:1.65; white-space:pre-wrap; word-break:break-word; }
  table { width:100%; border-collapse:separate; border-spacing:0; }
  th, td { padding:10px 12px; border-bottom:1px solid var(--border); text-align:left; vertical-align:top; }
  th { color:var(--muted); font:500 10.5px/1.4 var(--font-mono); letter-spacing:.07em; text-transform:uppercase; white-space:nowrap; }
  button, input, select, textarea { font:inherit; color:inherit; }
  :focus-visible { outline:2px solid var(--focus); outline-offset:2px; }
  .muted { color:var(--muted); }
  .bolt { flex:none; }
  .HARMFUL_ACTION { --v:var(--harm); --v-fg:var(--harm-fg); --v-bg:var(--harm-bg); --v-bd:var(--harm-bd); }
  .SILENT_FAILURE { --v:var(--silent); --v-fg:var(--silent-fg); --v-bg:var(--silent-bg); --v-bd:var(--silent-bd); }
  .DEGRADED { --v:var(--degr); --v-fg:var(--degr-fg); --v-bg:var(--degr-bg); --v-bd:var(--degr-bd); }
  .INCONCLUSIVE { --v:var(--inc); --v-fg:var(--inc-fg); --v-bg:var(--inc-bg); --v-bd:var(--inc-bd); }
  .SAFE_FAILURE { --v:var(--sfail); --v-fg:var(--sfail-fg); --v-bg:var(--sfail-bg); --v-bd:var(--sfail-bd); }
  .SAFE_SUCCESS { --v:var(--ssucc); --v-fg:var(--ssucc-fg); --v-bg:var(--ssucc-bg); --v-bd:var(--ssucc-bd); }
  .badge { display:inline-flex; align-items:center; gap:7px; height:22px; padding:0 8px 0 7px; border-radius:6px; font:600 10.5px/1 var(--font-mono); letter-spacing:.02em; white-space:nowrap; vertical-align:middle;
    color:var(--v-fg, var(--fg-2)); background:var(--v-bg, var(--surface-3)); box-shadow:inset 0 0 0 1px var(--v-bd, var(--border)); }
  .badge::before { content:""; flex:none; width:6px; height:6px; border-radius:2px; background:var(--v, currentColor); box-shadow:0 0 0 2px color-mix(in srgb, var(--v, currentColor) 20%, transparent), 0 0 7px color-mix(in srgb, var(--v, currentColor) 55%, transparent); }
  .chip { display:inline-flex; align-items:center; gap:5px; height:20px; padding:0 7px; border-radius:5px; background:var(--surface-3); color:var(--fg-2); font:500 11.5px/1 var(--font-sans); white-space:nowrap; vertical-align:middle; }
  .chip.fault { background:var(--warn-bg); color:var(--warn-fg); }
  .chip.err, .chip.contradicted, .chip.invalid { background:var(--bad-bg); color:var(--bad-fg); }
  .chip.ok, .chip.pass { background:var(--ok-bg); color:var(--ok-fg); }
  .chip.missing, .chip.ambiguous { background:var(--info-bg); color:var(--info-fg); }
  .panel { padding:16px 18px; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); box-shadow:var(--shadow-sm); }
  .tk-key { color:var(--tk-key); } .tk-str { color:var(--tk-str); } .tk-num { color:var(--tk-num); } .tk-lit { color:var(--tk-lit); } .tk-punc { color:var(--tk-punc); }
  .tk-com { color:var(--tk-com); font-style:italic; }
`;

/** The report timeline: summary, trial list, call cards, and findings. The HTML report and the local UI both use it. */
export const REPORT_CSS = `
  .rpt-label { display:flex; align-items:center; gap:8px; margin:0 0 10px; color:var(--muted); font:500 10.5px/1.2 var(--font-mono); letter-spacing:.08em; text-transform:uppercase; }
  .rpt-summary { display:grid; grid-template-columns:minmax(0,1.1fr) minmax(0,1fr); gap:16px; align-items:start; margin:0 0 16px; }
  .rpt-col { display:flex; flex-direction:column; gap:16px; min-width:0; }
  .rpt-why { position:relative; overflow:hidden; padding:20px 22px; border-radius:var(--radius-lg); background:linear-gradient(180deg, var(--v-bg), color-mix(in srgb, var(--v-bg) 35%, var(--surface)) 85%); box-shadow:inset 0 0 0 1px var(--v-bd), var(--shadow-sm); }
  .rpt-why::before { content:""; position:absolute; inset:0 0 auto; height:2px; background:var(--v); box-shadow:0 0 16px 1px var(--v); }
  .rpt-why .rpt-label { color:var(--v-fg); }
  .rpt-why p { margin:0; color:var(--fg); font-size:15.5px; line-height:1.6; }
  .rpt-why .rule { display:inline-flex; margin-top:14px; padding:3px 8px; border-radius:6px; background:color-mix(in srgb, var(--surface) 70%, transparent); box-shadow:inset 0 0 0 1px var(--v-bd); color:var(--v-fg); font-size:11.5px; }
  .rpt-repro, .rpt-facts { border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); box-shadow:var(--shadow-sm); }
  .rpt-repro { padding:16px 18px; }
  .rpt-facts { padding:4px 20px; }
  .rpt-facts dl { margin:0; }
  .fact { display:grid; grid-template-columns:76px minmax(0,1fr); gap:14px; padding:12px 0; border-bottom:1px solid var(--border); font-size:13.5px; line-height:1.55; }
  .fact:last-child { border-bottom:0; }
  .fact > dt { padding-top:3px; color:var(--muted); font:500 10.5px/1.5 var(--font-mono); letter-spacing:.08em; text-transform:uppercase; }
  .fact > dd { margin:0; min-width:0; }
  .faults { display:flex; flex-wrap:wrap; gap:6px; }
  .fault-pill { display:inline-flex; align-items:center; gap:6px; padding:3px 9px 3px 7px; border-radius:6px; background:var(--warn-bg); box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--warn-fg) 20%, transparent); color:var(--warn-fg); font:500 12px/18px var(--font-mono); }
  .expect { margin:0; padding-left:16px; } .expect li { margin:3px 0; } .expect li::marker { color:var(--faint); }
  .commands { display:flex; flex-direction:column; gap:6px; }
  .cmd { display:flex; align-items:center; gap:8px; min-width:0; padding:4px 4px 4px 12px; border:1px solid var(--border); border-radius:8px; background:var(--surface-2); }
  .cmd::before { content:"$"; flex:none; color:var(--faint); font:12px var(--font-mono); }
  .cmd code { flex:1; min-width:0; overflow-x:auto; color:var(--fg-2); font-size:12px; white-space:nowrap; scrollbar-width:none; }
  .cmd button { flex:none; height:26px; padding:0 10px; border:1px solid var(--border); border-radius:6px; background:var(--surface); color:var(--fg-2); font-size:12px; font-weight:500; cursor:pointer; transition:color .15s, border-color .15s; }
  .cmd button:hover { border-color:var(--border-3); color:var(--fg); }
  .rpt-warnings { margin:0 0 16px; border-color:color-mix(in srgb, var(--warn-fg) 28%, transparent); background:var(--warn-bg); }
  .rpt-warnings h2 { margin:0 0 6px; color:var(--warn-fg); font-size:13px; }
  .rpt-warnings ul { margin:0; padding-left:18px; }
  .rpt-trials { margin:0 0 16px; padding:16px 18px 10px; }
  .rpt-trials-head { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px 24px; margin:0 0 10px; }
  .rpt-trials h2 { margin:0; font-size:14px; }
  .stats { display:flex; flex-wrap:wrap; overflow:hidden; border:1px solid var(--border); border-radius:10px; background:var(--surface-2); }
  .stat { display:flex; flex-direction:column; gap:2px; padding:8px 14px; border-left:1px solid var(--border); }
  .stat:first-child { border-left:0; }
  .stat b { font:600 14px/1.2 var(--font-mono); font-variant-numeric:tabular-nums; }
  .stat span { color:var(--muted); font-size:11px; }
  .trial-nav { max-height:240px; margin:0 -8px; padding:0; overflow:auto; list-style:none; }
  .trial-nav li { display:flex; align-items:center; gap:12px; min-width:0; padding:6px 8px; border-radius:8px; color:var(--muted); font-size:13px; }
  .trial-nav li > :last-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .trial-nav a { display:inline-flex; flex:none; align-items:center; gap:10px; color:var(--fg); font-weight:500; font-variant-numeric:tabular-nums; text-decoration:none; }
  .trial-nav li:has(a:hover) { background:var(--surface-2); }
  .trial-nav li:has(a.current) { background:var(--surface-3); }
  .trial-nav a.current { font-weight:600; }
  .rpt-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:10px 16px; margin:0 0 18px; color:var(--muted); font-size:12.5px; }
  .rpt-toolbar input[type=search] { width:min(320px, 100%); height:34px; padding:0 12px; border:1px solid var(--border-2); border-radius:8px; background:var(--surface); box-shadow:var(--shadow-sm); outline:0; transition:border-color .15s, box-shadow .15s; }
  .rpt-toolbar input[type=search]:focus { border-color:var(--focus); box-shadow:0 0 0 3px var(--accent-soft); }
  .rpt-toolbar label { display:inline-flex; align-items:center; gap:8px; color:var(--fg-2); font-size:13px; cursor:pointer; }
  .rpt-toolbar input[type=checkbox] { width:15px; height:15px; margin:0; accent-color:var(--accent); }
  .rpt-toolbar button { height:30px; padding:0 11px; border:1px solid var(--border-2); border-radius:7px; background:var(--surface); color:var(--fg-2); font-size:12.5px; font-weight:500; cursor:pointer; }
  .rpt-toolbar button:hover { border-color:var(--border-3); color:var(--fg); }
  .rpt-hint { flex-basis:100%; }
  .trial { display:grid; grid-template-columns:minmax(0,1fr) minmax(280px,380px); gap:24px; align-items:start; }
  .js .trial:not(.current) { display:none; }
  .trial-main > h2 { display:flex; align-items:center; gap:10px; margin:0 0 14px; font-size:15px; }
  .timeline { position:relative; margin:0; padding:0 0 0 32px; list-style:none; }
  .timeline::before { content:""; position:absolute; top:18px; bottom:22px; left:10px; width:2px; border-radius:2px; background:linear-gradient(var(--border-2), var(--border) 85%, transparent); }
  .timeline > li { position:relative; margin:0 0 10px; }
  .timeline > li::before { content:""; position:absolute; top:16px; left:-27px; width:12px; height:12px; border:2px solid var(--border-3); border-radius:50%; background:var(--bg); box-shadow:0 0 0 4px var(--bg); }
  .timeline > li.committed::before { border-color:var(--ok-fg); background:var(--ok-fg); }
  .timeline > li.failed::before { border-color:var(--bad-fg); background:var(--bg); }
  .timeline > li.committed.failed::before { background:var(--bad-fg); }
  .timeline > li.faulted::before { box-shadow:0 0 0 3px var(--bg), 0 0 0 5px color-mix(in srgb, var(--warn-fg) 75%, transparent), 0 0 12px 4px color-mix(in srgb, var(--warn-fg) 35%, transparent); }
  .timeline > li.final::before { top:4px; border-color:var(--fg); border-radius:3px; background:var(--bg); }
  .timeline > li.note { padding:9px 0 4px; color:var(--muted); }
  .timeline > li.note::before { top:13px; }
  .timeline > li.hidden, .filter-faults .timeline > li.call:not(.faulted):not(.failed):not(.cited) { display:none; }
  .call > details { border:1px solid var(--border); border-radius:12px; background:var(--surface); box-shadow:var(--shadow-sm); transition:border-color .15s, box-shadow .15s; }
  .call > details:hover { border-color:var(--border-2); }
  .call > details[open] { border-color:var(--border-2); box-shadow:var(--shadow); }
  .call.faulted > details { border-color:color-mix(in srgb, var(--warn-fg) 35%, var(--border)); }
  .call.flash > details, .call:target > details { outline:2px solid var(--focus); outline-offset:2px; }
  .chip.cite { background:var(--v-bg, var(--accent-soft)); color:var(--v-fg, var(--accent-fg)); }
  .call > details > summary { position:relative; display:block; padding:12px 40px 12px 14px; list-style:none; cursor:pointer; }
  .call > details > summary::-webkit-details-marker { display:none; }
  .call > details > summary::after { content:""; position:absolute; top:18px; right:17px; width:6px; height:6px; border-right:1.5px solid var(--muted); border-bottom:1.5px solid var(--muted); transform:rotate(-45deg); transition:transform .15s; }
  .call > details[open] > summary::after { transform:rotate(45deg); }
  .call-line { display:flex; flex-wrap:wrap; align-items:center; gap:6px 8px; }
  .call-id { color:var(--faint); font-size:11px; }
  .call-tool { color:var(--fg); font-size:13px; font-weight:600; }
  .call-saw { display:block; margin-top:7px; overflow:hidden; color:var(--fg-2); font-size:13px; text-overflow:ellipsis; white-space:nowrap; }
  .call-saw code { color:var(--fg-2); font-size:12px; }
  .state { display:block; margin-top:6px; color:var(--add); font:12px/1.55 var(--font-mono); white-space:pre-wrap; word-break:break-word; }
  .state.chg { color:var(--chg); } .state.del { color:var(--del); }
  .call-body { padding:2px 14px 14px; border-top:1px solid var(--border); }
  .call-body h3, .timeline h3, .trial-aside h3 { margin:14px 0 7px; color:var(--muted); font:500 10.5px/1.2 var(--font-mono); letter-spacing:.08em; text-transform:uppercase; }
  .call-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:0 14px; }
  .call-body p { margin:6px 0; color:var(--fg-2); }
  .call-body ul { margin:4px 0; padding:0; list-style:none; }
  .call-body li { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin:5px 0; }
  .snapshot { margin-top:12px; }
  .snapshot > summary { color:var(--muted); font-size:12.5px; cursor:pointer; }
  .snapshot > summary:hover { color:var(--fg); }
  .snapshot > pre { max-height:420px; margin-top:8px; }
  .final h3 { margin:2px 0 8px; }
  .final .answer { padding:13px 16px; border:1px solid var(--border); border-radius:4px 14px 14px 14px; background:var(--surface); box-shadow:var(--shadow-sm); font-size:14px; line-height:1.6; white-space:pre-wrap; }
  .trial-aside { position:sticky; top:var(--sticky-top, 16px); display:flex; flex-direction:column; gap:12px; max-height:calc(100vh - var(--sticky-top, 16px) - 16px); overflow:auto; }
  .aside-card { padding:14px 16px; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); box-shadow:var(--shadow-sm); font-size:13px; }
  .trial-aside h3 { margin:0 0 10px; }
  .aside-card > p { margin:0; color:var(--fg-2); }
  .aside-card ul { margin:8px 0 0; padding-left:0; list-style:none; }
  .aside-card li { margin:6px 0; color:var(--fg-2); word-break:break-word; }
  .aside-card li .chip { margin-right:4px; }
  .finding { padding:12px 0; border-top:1px solid var(--border); }
  .finding:first-of-type { padding-top:0; border-top:0; }
  .finding:last-child { padding-bottom:0; }
  .finding-head { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin:0 0 6px; }
  .finding-head code { color:var(--fg-2); font-size:11.5px; }
  .finding > div { color:var(--fg); line-height:1.55; }
  .finding ul { margin:8px 0 0; padding-left:14px; list-style:disc; }
  .finding li { margin:4px 0; font-size:12.5px; }
  .finding li::marker { color:var(--faint); }
  .rpt a[href^="#t"] { text-decoration:none; }
  .rpt a[href^="#t"] code { padding:1px 6px; border-radius:5px; background:var(--accent-soft); color:var(--accent-fg); font-size:11.5px; white-space:nowrap; }
  .rpt a[href^="#t"]:hover code { background:color-mix(in srgb, var(--accent) 22%, transparent); }
  @media (max-width: 980px) { .rpt-summary, .trial { grid-template-columns:1fr; } .trial-aside { position:static; max-height:none; } }
`;

/** The brand bar and page frame of the standalone report and run index. */
const PAGE_CSS = `
  .brandbar { position:sticky; top:0; z-index:5; border-bottom:1px solid var(--border); background:color-mix(in srgb, var(--bg) 82%, transparent); backdrop-filter:blur(12px); }
  .brandbar > div { display:flex; align-items:center; gap:10px; max-width:1240px; height:52px; margin:0 auto; padding:0 28px; }
  .brandbar .logo { border-radius:7px; }
  .brandbar b { font-size:14.5px; font-weight:600; letter-spacing:-.02em; }
  .brandbar b span { color:var(--muted); font-weight:500; }
  .brandbar i { color:var(--faint); font-style:normal; }
  .brandbar em { color:var(--fg-2); font-size:13.5px; font-style:normal; }
  .brandbar small { margin-left:auto; padding:2px 7px; border:1px solid var(--border); border-radius:6px; color:var(--muted); font:500 11px/16px var(--font-mono); }
  main { max-width:1240px; margin:0 auto; padding:30px 28px 80px; }
  .page-title { margin:0 0 22px; }
  .page-title h1 { display:flex; flex-wrap:wrap; align-items:center; gap:10px 14px; margin:0 0 10px; font:600 26px/1.2 var(--font-mono); letter-spacing:-.03em; overflow-wrap:anywhere; }
  .page-title h1 .badge { height:26px; padding:0 10px 0 9px; font-size:11.5px; }
  .meta { display:flex; flex-wrap:wrap; gap:6px; color:var(--muted); font-size:12.5px; }
  .meta > span { display:inline-flex; align-items:center; gap:6px; height:26px; padding:0 10px; border:1px solid var(--border); border-radius:7px; background:var(--surface); }
  .meta code { color:var(--fg); font-size:12px; }
`;

function brandBar(section: string, version: string | undefined): string {
  return `<header class="brandbar"><div>${logo(24)}<b><span>Agent</span>Crucible</b><i>/</i><em>${esc(section)}</em>${version ? `<small>v${esc(version)}</small>` : ""}</div></header>`;
}

/** Trials shown in full in the HTML report; the rest are listed with their verdicts. */
const HTML_TRIAL_LIMIT = 50;
/** World snapshots longer than this are cut in the HTML report; the JSON report keeps them whole. */
const SNAPSHOT_LIMIT = 20_000;

export interface ReportHtmlOptions {
  /** File name of the JSON report next to the page, for the replay command. */
  reportFile?: string;
  /** Force a color theme instead of following the system setting. */
  theme?: "light" | "dark";
}

/**
 * A self-contained HTML timeline: per trial, every call with its arguments, what the agent saw,
 * what the world returned, the state it changed, and the state after it, next to the findings
 * that cite it. It loads no external resources; a short script switches trials, filters and opens
 * calls, and copies the commands that reproduce the run.
 */
export function renderReportHtml(report: RunReport, opts: ReportHtmlOptions = {}): string {
  return `<!DOCTYPE html>
<html lang="en"${opts.theme ? ` data-theme="${opts.theme}"` : ""}>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>AgentCrucible: ${esc(report.scenarioId)} (${esc(report.agentId)})</title>
<style>${BASE_CSS}${REPORT_CSS}${PAGE_CSS}</style>
</head>
<body>
${brandBar("Report", report.toolVersion)}
<main class="rpt">
  <header class="page-title">
    <div class="rpt-label">Report</div>
    <h1>${esc(report.scenarioId)} <span class="badge ${esc(report.aggregateVerdict)}">${esc(report.aggregateVerdict)}</span></h1>
    <div class="meta"><span>agent <code>${esc(report.agentId)}</code></span><span>worlds <code>${esc(report.worlds.join(", "))}</code></span><span>seed <code>${esc(report.seed)}</code></span><span>${report.stats.total} trial(s)</span><span>AgentCrucible ${esc(report.toolVersion)}</span></div>
  </header>
  ${reportSections(report, opts)}
</main>
<script>
(() => {
  document.body.classList.add("js");
  const trials = [...document.querySelectorAll(".trial")];
  const links = [...document.querySelectorAll(".trial-nav a")];
  const show = (index) => {
    trials.forEach((t) => t.classList.toggle("current", t.dataset.trial === index));
    links.forEach((a) => a.classList.toggle("current", a.dataset.trial === index));
  };
  const follow = () => {
    const target = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
    const trial = target ? target.closest(".trial") : null;
    show(trial ? trial.dataset.trial : document.querySelector(".trial.worst")?.dataset.trial);
    if (target && target.matches("li.call")) {
      target.querySelector("details").open = true;
      window.scrollTo(0, target.getBoundingClientRect().top + window.scrollY - window.innerHeight / 4);
    }
  };
  const search = document.getElementById("call-search");
  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    document.querySelectorAll("li.call").forEach((li) => li.classList.toggle("hidden", q !== "" && !li.textContent.toLowerCase().includes(q)));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== search) { e.preventDefault(); search.focus(); }
  });
  document.querySelectorAll("button[data-copy]").forEach((b) => b.addEventListener("click", () => {
    navigator.clipboard?.writeText(b.dataset.copy).then(() => { b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1200); }, () => {});
  }));
  const toggle = document.getElementById("toggle-calls");
  toggle.addEventListener("click", () => {
    const calls = [...document.querySelectorAll(".trial.current li.call > details")];
    const open = calls.some((d) => !d.open);
    calls.forEach((d) => (d.open = open));
    toggle.textContent = open ? "Collapse calls" : "Expand calls";
  });
  window.addEventListener("hashchange", follow);
  document.getElementById("filter-faults").addEventListener("change", (e) => document.body.classList.toggle("filter-faults", e.target.checked));
  follow();
})();
</script>
</body>
</html>
`;
}

/**
 * Everything below a report's title: why it got its verdict, the task and checks, the commands
 * that reproduce it, the trial list, the call filter, and one section per trial.
 */
export function reportSections(report: RunReport, opts: { reportFile?: string } = {}): string {
  const worst = worstTrial(report);
  const shown = report.trials.filter((t, i) => i < HTML_TRIAL_LIMIT || t === worst);
  const trialNav = report.trials
    .map((t) => {
      const label = `<span class="badge ${esc(t.verdict)}">${esc(t.verdict)}</span>`;
      return shown.includes(t)
        ? `<li><a href="#trial-${t.trace.trialIndex}" data-trial="${t.trace.trialIndex}">trial ${t.trace.trialIndex}: ${label}</a> <span>${esc(t.reason)}</span></li>`
        : `<li><span>trial ${t.trace.trialIndex}: ${label}</span> <span>${esc(t.reason)}</span></li>`;
    })
    .join("\n");
  const s = report.scenario;
  const commands = [
    `agentcrucible run --scenario ${s.id} --agent ${report.agentId} --seed ${shellQuote(report.seed)} --trials ${report.stats.total}`,
    ...(opts.reportFile ? [`agentcrucible replay ${shellQuote(opts.reportFile)}`] : []),
  ];
  const fact = (label: string, value: string) => `<div class="fact"><dt>${label}</dt><dd>${value}</dd></div>`;
  return `<section class="rpt-summary">
    <div class="rpt-col">
      <div class="rpt-why ${esc(report.aggregateVerdict)}">
        <div class="rpt-label">Why ${esc(report.aggregateVerdict)}</div>
        <p>${esc(worst?.reason ?? "")}</p>
        ${worst?.findings[0] ? `<code class="rule">${esc(worst.findings[0].rule)}</code>` : ""}
      </div>
      <div class="rpt-repro"><div class="rpt-label">Reproduce</div><div class="commands">${commands.map((c) => `<div class="cmd"><code>${esc(c)}</code><button type="button" data-copy="${esc(c)}" title="Copy the command">Copy</button></div>`).join("")}</div></div>
    </div>
    <div class="rpt-facts"><dl>
      ${fact("Task", esc(s.task))}
      ${fact("Faults", report.faults.length ? `<span class="faults">${report.faults.map((f) => `<span class="fault-pill">${BOLT}${esc(describeFault(f))}</span>`).join("")}</span>` : "none")}
      ${s.budget.maxCalls !== undefined || s.budget.maxCallsPerTool ? fact("Budget", esc(describeBudget(report))) : ""}
      ${fact("Expect", `<ul class="expect">${expectParts(report).map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`)}
    </dl></div>
  </section>
  ${report.warnings.length ? `<section class="panel rpt-warnings"><h2>Warnings</h2><ul>${report.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></section>` : ""}
  <section class="panel rpt-trials">
    <div class="rpt-trials-head"><h2>Trials</h2>
      <div class="stats"><div class="stat"><b>${report.stats.total}</b><span>trials</span></div><div class="stat"><b>${pct(report.stats.flakyRate)}</b><span>flaky rate</span></div><div class="stat"><b>${pct(report.stats.criticalRateLower95)}</b><span>critical rate, 95% lower bound</span></div><div class="stat"><b>${report.stats.trialsWithFault}/${report.stats.total}</b><span>trials with a fault</span></div></div>
    </div>
    <ul class="trial-nav">${trialNav}</ul>
  </section>
  <div class="rpt-toolbar">
    <input type="search" id="call-search" placeholder="Filter calls  /" aria-label="Filter calls by tool, argument, or response"/>
    <label><input type="checkbox" id="filter-faults"/> Only calls with faults, errors, or findings</label>
    <button type="button" id="toggle-calls">Expand calls</button>
    <span class="rpt-hint">Open a call for its arguments, responses, and state. Call ids in findings jump to the call.</span>
  </div>
  ${shown.map((t) => trialSection(t, t === worst)).join("\n")}`;
}

function trialSection(trial: GradedTrial, isWorst: boolean): string {
  const t = trial.trace.trialIndex;
  const anchor = (callId: string) => `<a href="#t${t}-${esc(callId)}"><code>${esc(callId)}</code></a>`;
  const cited = new Set(trial.findings.flatMap((f) => f.evidence.flatMap((e) => e.callIds ?? [])));
  const calls = trial.trace.calls
    .map((c) => {
      const classes = ["call", c.committed && c.mutating ? "committed" : "", c.observed.ok ? "" : "failed", c.faultApplied ? "faulted" : "", cited.has(c.id) ? "cited" : ""].filter(Boolean).join(" ");
      const saw = c.observed.ok ? `<span class="chip ok">ok</span> <code>${esc(truncate(JSON.stringify(c.observed.result), 120))}</code>` : `<span class="chip err">${esc(c.observed.code ?? "error")}</span> ${esc(c.observed.error)}`;
      const findings = trial.findings.filter((f) => f.evidence.some((e) => e.callIds?.includes(c.id)));
      const snapshot = JSON.stringify(c.worldSnapshotAfter, null, 2);
      return `<li class="${classes}" id="t${t}-${esc(c.id)}"><details>
  <summary><span class="call-line"><code class="call-id">${esc(c.id)}</code> <code class="call-tool">${esc(c.tool)}#${c.callIndex}</code> <span class="chip">${esc(callState(c))}</span>${c.faultApplied ? ` <span class="chip fault">${BOLT}fault: ${esc(c.faultApplied)}</span>` : ""}${c.schemaErrors?.length ? ' <span class="chip err">schema</span>' : ""}${cited.has(c.id) ? ' <span class="chip cite">evidence</span>' : ""}</span><span class="call-saw">${saw}</span>${c.changes.map((change) => `<span class="state${change.startsWith("~") ? " chg" : change.startsWith("-") ? " del" : ""}">${esc(change)}</span>`).join("")}</summary>
  <div class="call-body"><div class="call-grid">
    <div><h3>Arguments</h3><pre>${highlightJson(JSON.stringify(c.args, null, 2))}</pre>${c.argsError ? `<p>Rejected: the agent passed something other than a JSON object (${esc(c.argsError)}).</p>` : ""}</div>
    <div><h3>Agent saw</h3><pre>${c.observed.ok ? highlightJson(JSON.stringify(c.observed.result, null, 2)) : esc(`${c.observed.code ?? "error"}: ${c.observed.error}`)}</pre></div>
    <div><h3>World returned</h3>${c.committed ? `<pre>${highlightJson(JSON.stringify(c.committedResult, null, 2) ?? "undefined")}</pre>` : "<p>The call did not run.</p>"}</div>
  </div>
  ${c.schemaErrors?.length ? `<h3>Schema violations</h3><ul>${c.schemaErrors.map((e) => `<li><code>${esc(e)}</code></li>`).join("")}</ul>` : ""}
  ${findings.length ? `<h3>Findings citing this call</h3><ul>${findings.map((f) => `<li><span class="badge ${esc(f.verdict)}">${esc(f.verdict)}</span> <code>${esc(f.rule)}</code></li>`).join("")}</ul>` : ""}
  <details class="snapshot"><summary>World state after this call</summary><pre>${highlightJson(snapshot.length > SNAPSHOT_LIMIT ? `${snapshot.slice(0, SNAPSHOT_LIMIT)}\n… (cut; the JSON report has the full state)` : snapshot)}</pre></details>
</div></details></li>`;
    })
    .join("\n");
  const output = trial.trace.finalOutput === undefined ? "" : `<h3>Structured output</h3><pre>${highlightJson(JSON.stringify(trial.trace.finalOutput, null, 2))}</pre>`;
  const assertions = trial.outcome.assertions
    .map((a) => `<li><span class="chip ${esc(a.status)}">${esc(a.status)}</span> ${esc(a.assertion)}: ${esc(a.detail)}</li>`)
    .join("");
  const findings = trial.findings
    .map(
      (f) => `<div class="finding"><div class="finding-head"><span class="badge ${esc(f.verdict)}">${esc(f.verdict)}</span> <code>${esc(f.rule)}</code></div>
  <div>${esc(f.reason)}</div>
  <ul>${f.evidence.map((e) => `<li>${esc(e.summary)}${e.callIds?.length ? ` ${e.callIds.map(anchor).join(" ")}` : ""}</li>`).join("")}</ul></div>`
    )
    .join("\n");
  return `<section class="trial${isWorst ? " worst current" : ""}" id="trial-${t}" data-trial="${t}">
  <div class="trial-main ${esc(trial.verdict)}">
    <h2>Trial ${t} <span class="badge ${esc(trial.verdict)}">${esc(trial.verdict)}</span></h2>
    <ol class="timeline">
${calls || '<li class="note">No tool calls</li>'}
      <li class="final"><h3>Final answer</h3><div class="answer">${esc(trial.trace.finalAnswer)}</div>${output}</li>
    </ol>
  </div>
  <aside class="trial-aside">
    <div class="aside-card"><h3>Findings</h3>${findings || "<p>None</p>"}</div>
    <div class="aside-card"><h3>Outcome check</h3><p>${esc(describeOutcome(trial))}</p>${assertions ? `<ul>${assertions}</ul>` : ""}</div>
    <div class="aside-card"><h3>Committed changes</h3><ul>${trial.effects.map((e) => `<li><span class="state${e.summary.startsWith("~") ? " chg" : ""}">${esc(e.summary)}</span> ${e.callIds.map(anchor).join(" ")}</li>`).join("") || "<li>None</li>"}</ul></div>
  </aside>
</section>`;
}

const JSON_TOKEN = /("(?:[^"\\\n]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)/g;

/** JSON text as HTML with its keys, strings, numbers, and literals in spans. Works on cut text too. */
export function highlightJson(text: string): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(JSON_TOKEN)) {
    const [all, str, colon, literal, num] = m;
    out += esc(text.slice(last, m.index));
    if (str !== undefined) out += `<span class="${colon ? "tk-key" : "tk-str"}">${esc(str)}</span>${colon ? esc(colon) : ""}`;
    else out += `<span class="${literal ? "tk-lit" : "tk-num"}">${literal ?? num}</span>`;
    last = m.index + all.length;
  }
  return out + esc(text.slice(last));
}

export interface RunIndexEntry {
  report: RunReport;
  /** Path of the report's HTML page, relative to the index. */
  href: string;
  /** Set when the run was compared with a baseline. */
  change?: "regression" | "new failure" | "improved" | "changed" | "new" | "unchanged";
}

/** A static summary page for a run of several scenarios or agents, linking each report. */
export function renderRunIndex(entries: RunIndexEntry[], title: string, failOn: Verdict): string {
  const counts = new Map<Verdict, number>();
  for (const v of VERDICTS) {
    const n = entries.filter((e) => e.report.aggregateVerdict === v).length;
    if (n) counts.set(v, n);
  }
  const scenarios = new Set(entries.map((e) => e.report.scenarioId)).size;
  const agents = new Set(entries.map((e) => e.report.agentId)).size;
  const rows = entries
    .map(({ report: r, href, change }) => {
      const worst = worstTrial(r);
      return `<tr><td><a href="${esc(href)}">${esc(r.scenarioId)}</a></td><td><code>${esc(r.agentId)}</code></td><td><span class="badge ${esc(r.aggregateVerdict)}">${esc(r.aggregateVerdict)}</span>${change ? ` <span class="chip${change === "regression" || change === "new failure" ? " err" : change === "improved" ? " ok" : ""}">${esc(change)}</span>` : ""}</td><td class="num">${r.stats.total}</td><td><code class="rule">${esc(worst?.findings[0]?.rule ?? "")}</code></td><td class="reason">${esc(worst?.reason ?? "")}</td></tr>`;
    })
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<style>${BASE_CSS}${PAGE_CSS}
  .kicker { margin:0 0 8px; color:var(--muted); font:500 10.5px/1.2 var(--font-mono); letter-spacing:.08em; text-transform:uppercase; }
  h1 { margin:0 0 20px; font-size:28px; letter-spacing:-.03em; }
  .bar { display:flex; gap:3px; height:10px; margin:0 0 14px; }
  .bar span { min-width:4px; border-radius:3px; background:var(--v); box-shadow:0 0 10px -2px var(--v); }
  .summary { display:flex; flex-wrap:wrap; gap:8px 18px; margin:0 0 6px; }
  .summary > span { display:inline-flex; align-items:center; gap:8px; font:600 14px var(--font-mono); font-variant-numeric:tabular-nums; }
  .note { margin:0 0 22px; color:var(--muted); font-size:13px; }
  .table { overflow:auto; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--surface); box-shadow:var(--shadow-sm); }
  th { background:var(--surface-2); }
  td { font-size:13.5px; }
  tbody tr:last-child td { border-bottom:0; }
  tbody tr:hover td { background:var(--surface-2); }
  td a { font:600 12.5px/1.4 var(--font-mono); text-decoration:none; white-space:nowrap; }
  td a:hover { color:var(--accent-fg); }
  td code { white-space:nowrap; }
  td.num { color:var(--fg-2); font-variant-numeric:tabular-nums; }
  .rule { color:var(--fg-2); font-size:12px; }
  td.reason { min-width:280px; color:var(--fg-2); font-size:13px; }
</style>
</head>
<body>
${brandBar("Run", entries[0]?.report.toolVersion)}
<main>
  <div class="kicker">${plural(scenarios, "scenario")} × ${plural(agents, "agent")}</div>
  <h1>${esc(title)}</h1>
  <div class="bar">${[...counts].map(([v, n]) => `<span class="${esc(v)}" style="flex:${n}" title="${n} ${esc(v)}"></span>`).join("")}</div>
  <p class="summary">${[...counts].map(([v, n]) => `<span>${n} <span class="badge ${esc(v)}">${esc(v)}</span></span>`).join("")}</p>
  <p class="note">${plural(entries.length, "report")}. Verdicts at or above ${esc(failOn)} fail the run.</p>
  <div class="table"><table><thead><tr><th>Scenario</th><th>Agent</th><th>Verdict</th><th>Trials</th><th>Deciding rule</th><th>Reason</th></tr></thead>
  <tbody>${rows}</tbody></table></div>
</main>
</body>
</html>
`;
}

function plural(n: number, one: string): string {
  return `${n} ${one}${n === 1 ? "" : "s"}`;
}

/** Quotes a command-line argument when it holds characters a shell would interpret. */
export function shellQuote(arg: string): string {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}
