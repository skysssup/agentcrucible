import { callState, describeBudget, describeFault, describeOutcome, expectParts, worstTrial } from "./describe.js";
import { pct, truncate } from "./format.js";
import type { SweepCell, SweepStep, SweepSummary } from "./sweep.js";
import { VERDICTS, type GradedTrial, type RunReport, type Verdict } from "./types.js";

/** Escapes text for HTML and XML content and attribute values. */
export function esc(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** The brand mark: a crucible outline in the current text color, no fill. */
export function logo(size = 20): string {
  return `<svg class="logo" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 8h16"/><path d="M5.5 8l1.2 7.2A3 3 0 0 0 9.6 17.7h4.8a3 3 0 0 0 2.9-2.5L18.5 8"/><path d="M9 21h6"/><path d="M12 17.7V21"/></svg>`;
}

/** A lightning bolt for fault labels, inline so report pages stay self-contained. */
const BOLT = '<svg class="bolt" width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"><path d="M13.4 2 4.6 13.4h6.6L10.4 22l8.9-11.5h-6.6z" fill="currentColor"/></svg>';

/** A verdict as a status dot and its name in mono text, for tables and lists. */
export function verdictText(verdict: string): string {
  return `<span class="verdict ${esc(verdict)}">${esc(verdict)}</span>`;
}

/**
 * Design tokens, base elements, verdict colors, badges, chips, and code colors shared by the HTML
 * report, the run index, and the local UI. Every color follows the system's light or dark setting
 * through light-dark(), unless the root element sets data-theme. Verdict text colors are a shade
 * darker than the verdict's dot and bar color in the light theme so that text keeps a 4.5:1 contrast.
 */
export const BASE_CSS = `
  :root { color-scheme:light dark;
    --font-sans:"Geist","Inter",-apple-system,BlinkMacSystemFont,"Segoe UI Variable Text","Segoe UI",system-ui,Roboto,"Helvetica Neue",Arial,sans-serif;
    --font-mono:"Geist Mono","JetBrains Mono","SF Mono","Cascadia Code",ui-monospace,Menlo,Consolas,"Liberation Mono",monospace;
    --radius-sm:4px; --radius:4px; --radius-lg:6px;
    --canvas:light-dark(#fafafa,#0b0c0e); --bg:var(--canvas); --surface:light-dark(#ffffff,#121316); --surface-2:light-dark(#f4f4f5,#1a1b1f); --surface-3:var(--surface-2);
    --overlay:light-dark(rgba(24,24,27,.32),rgba(0,0,0,.6));
    --border:light-dark(#e4e4e7,#26272b); --border-2:light-dark(#d4d4d8,#3f3f46); --border-3:var(--border-2);
    --fg:light-dark(#18181b,#fafafa); --fg-2:light-dark(#52525b,#a1a1aa); --muted:light-dark(#6e6e77,#86868f); --faint:light-dark(#a1a1aa,#52525b);
    --accent:light-dark(#2563eb,#3b82f6); --accent-fg:light-dark(#2563eb,#60a5fa); --accent-solid:#2563eb; --accent-soft:light-dark(#eff6ff,rgba(59,130,246,.12)); --accent-line:light-dark(#bfdbfe,rgba(59,130,246,.4)); --focus:var(--accent);
    --harm:light-dark(#dc2626,#f87171); --harm-fg:light-dark(#b91c1c,#f87171);
    --silent:light-dark(#7c3aed,#a78bfa); --silent-fg:light-dark(#6d28d9,#a78bfa);
    --degr:light-dark(#d97706,#fbbf24); --degr-fg:light-dark(#a35007,#fbbf24);
    --inc:light-dark(#71717a,#a1a1aa); --inc-fg:light-dark(#5b5b64,#a1a1aa);
    --sfail:light-dark(#0d9488,#2dd4bf); --sfail-fg:light-dark(#0f766e,#2dd4bf);
    --ssucc:light-dark(#16a34a,#4ade80); --ssucc-fg:light-dark(#15803d,#4ade80);
    --harm-bg:color-mix(in srgb,var(--harm) 8%,transparent); --harm-bd:color-mix(in srgb,var(--harm) 25%,transparent);
    --silent-bg:color-mix(in srgb,var(--silent) 8%,transparent); --silent-bd:color-mix(in srgb,var(--silent) 25%,transparent);
    --degr-bg:color-mix(in srgb,var(--degr) 8%,transparent); --degr-bd:color-mix(in srgb,var(--degr) 25%,transparent);
    --inc-bg:color-mix(in srgb,var(--inc) 8%,transparent); --inc-bd:color-mix(in srgb,var(--inc) 25%,transparent);
    --sfail-bg:color-mix(in srgb,var(--sfail) 8%,transparent); --sfail-bd:color-mix(in srgb,var(--sfail) 25%,transparent);
    --ssucc-bg:color-mix(in srgb,var(--ssucc) 8%,transparent); --ssucc-bd:color-mix(in srgb,var(--ssucc) 25%,transparent);
    --ok-fg:var(--ssucc-fg); --ok-bg:var(--ssucc-bg); --bad-fg:var(--harm-fg); --bad-bg:var(--harm-bg); --warn-fg:var(--degr-fg); --warn-bg:var(--degr-bg); --info-fg:var(--inc-fg); --info-bg:var(--inc-bg);
    --add:var(--ok-fg); --chg:var(--warn-fg); --del:var(--bad-fg);
    --shadow-pop:0 8px 24px rgba(0,0,0,.14),0 1px 3px rgba(0,0,0,.1);
    --tk-key:var(--fg); --tk-str:light-dark(#0d9488,#2dd4bf); --tk-num:light-dark(#b45309,#fbbf24); --tk-lit:light-dark(#7c3aed,#a78bfa); --tk-punc:var(--muted); --tk-com:var(--muted); }
  :root[data-theme=light] { color-scheme:light; }
  :root[data-theme=dark] { color-scheme:dark; --shadow-pop:0 8px 24px rgba(0,0,0,.5),0 1px 3px rgba(0,0,0,.4); }
  *, *::before, *::after { box-sizing:border-box; }
  * { scrollbar-width:thin; scrollbar-color:var(--border-2) transparent; }
  html { -webkit-text-size-adjust:100%; text-size-adjust:100%; }
  body { margin:0; font:400 13px/1.45 var(--font-sans); background:var(--canvas); color:var(--fg); font-variant-numeric:tabular-nums; -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale; }
  ::selection { background:var(--accent-soft); }
  a { color:inherit; text-decoration-color:color-mix(in srgb, currentColor 35%, transparent); text-underline-offset:2px; }
  a:hover { text-decoration-color:currentColor; }
  h1, h2, h3 { margin:0; font-weight:600; line-height:1.3; }
  p { text-wrap:pretty; }
  code, pre, kbd, samp { font-family:var(--font-mono); font-size:12px; font-variant-ligatures:none; }
  pre { margin:0; padding:10px 12px; overflow:auto; border:1px solid var(--border); border-radius:4px; background:var(--surface-2); line-height:1.5; white-space:pre-wrap; word-break:break-word; }
  table { width:100%; border-collapse:separate; border-spacing:0; }
  th, td { padding:0 12px; border-bottom:1px solid var(--border); text-align:left; vertical-align:middle; }
  th { height:32px; color:var(--muted); font:500 11px/1.3 var(--font-sans); letter-spacing:.04em; text-transform:uppercase; white-space:nowrap; }
  td { height:36px; font-size:12px; }
  button, input, select, textarea { font:inherit; color:inherit; }
  :focus-visible { outline:2px solid var(--focus); outline-offset:1px; }
  .muted { color:var(--muted); }
  .bolt { flex:none; }
  .logo { flex:none; }
  .HARMFUL_ACTION { --v:var(--harm); --v-fg:var(--harm-fg); --v-bg:var(--harm-bg); --v-bd:var(--harm-bd); }
  .SILENT_FAILURE { --v:var(--silent); --v-fg:var(--silent-fg); --v-bg:var(--silent-bg); --v-bd:var(--silent-bd); }
  .DEGRADED { --v:var(--degr); --v-fg:var(--degr-fg); --v-bg:var(--degr-bg); --v-bd:var(--degr-bd); }
  .INCONCLUSIVE { --v:var(--inc); --v-fg:var(--inc-fg); --v-bg:var(--inc-bg); --v-bd:var(--inc-bd); }
  .SAFE_FAILURE { --v:var(--sfail); --v-fg:var(--sfail-fg); --v-bg:var(--sfail-bg); --v-bd:var(--sfail-bd); }
  .SAFE_SUCCESS { --v:var(--ssucc); --v-fg:var(--ssucc-fg); --v-bg:var(--ssucc-bg); --v-bd:var(--ssucc-bd); }
  .badge { display:inline-flex; align-items:center; height:20px; padding:0 6px; border:1px solid var(--v-bd, var(--border)); border-radius:4px; font:500 11px/1 var(--font-mono); white-space:nowrap; vertical-align:middle;
    color:var(--v-fg, var(--fg-2)); background:var(--v-bg, var(--surface-2)); }
  .verdict { display:inline-flex; align-items:center; gap:6px; color:var(--v-fg, var(--fg-2)); font:400 12px/1.3 var(--font-mono); white-space:nowrap; vertical-align:middle; }
  .verdict::before { content:""; flex:none; width:6px; height:6px; border-radius:999px; background:var(--v, var(--faint)); }
  .chip { display:inline-flex; align-items:center; gap:4px; height:18px; padding:0 6px; border-radius:4px; background:var(--surface-2); color:var(--fg-2); font:500 11px/1 var(--font-sans); white-space:nowrap; vertical-align:middle; }
  .chip.fault { background:var(--warn-bg); color:var(--warn-fg); }
  .chip.err, .chip.contradicted, .chip.invalid { background:var(--bad-bg); color:var(--bad-fg); }
  .chip.ok, .chip.pass { background:var(--ok-bg); color:var(--ok-fg); }
  .chip.missing, .chip.ambiguous { background:var(--info-bg); color:var(--info-fg); }
  .panel { padding:16px; border:1px solid var(--border); border-radius:6px; background:var(--surface); }
  .tk-key { color:var(--tk-key); } .tk-str { color:var(--tk-str); } .tk-num { color:var(--tk-num); } .tk-lit { color:var(--tk-lit); } .tk-punc { color:var(--tk-punc); }
  .tk-com { color:var(--tk-com); font-style:italic; }
  .label { color:var(--muted); font:500 11px/1.3 var(--font-sans); letter-spacing:.04em; text-transform:uppercase; }
  .vdot { display:inline-block; flex:none; width:6px; height:6px; border-radius:999px; background:var(--v, var(--faint)); vertical-align:middle; }
  .sr-only { position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden; clip:rect(0 0 0 0); border:0; }
  .vbar { display:flex; gap:1px; height:6px; }
  .vbar span { min-width:2px; background:var(--v); }
  .vbar span:first-child { border-radius:3px 0 0 3px; } .vbar span:last-child { border-radius:0 3px 3px 0; } .vbar span:only-child { border-radius:3px; }
`;

/** The report timeline: summary, trial list, call cards, and findings. The HTML report and the local UI both use it. */
export const REPORT_CSS = `
  .rpt-label { display:flex; align-items:center; gap:8px; margin:0 0 8px; color:var(--muted); font:500 11px/1.3 var(--font-sans); letter-spacing:.04em; text-transform:uppercase; }
  .rpt-summary { display:grid; grid-template-columns:minmax(0,1.1fr) minmax(0,1fr); gap:16px; align-items:start; margin:0 0 16px; }
  .rpt-col { display:flex; flex-direction:column; gap:16px; min-width:0; }
  .rpt-why { padding:12px 16px; border:1px solid var(--border); border-left:2px solid var(--v); border-radius:6px; background:var(--surface); }
  .rpt-why .rpt-label { color:var(--v-fg); }
  .rpt-why p { margin:0; color:var(--fg); font-size:14px; line-height:1.45; }
  .rpt-why .rule { display:inline-flex; margin-top:10px; color:var(--fg-2); font-size:12px; }
  .rpt-repro, .rpt-facts { border:1px solid var(--border); border-radius:6px; background:var(--surface); }
  .rpt-repro { padding:12px 16px; }
  .rpt-facts { padding:0 16px; }
  .rpt-facts dl { margin:0; }
  .fact { display:grid; grid-template-columns:64px minmax(0,1fr); gap:12px; padding:10px 0; border-bottom:1px solid var(--border); font-size:13px; }
  .fact:last-child { border-bottom:0; }
  .fact > dt { padding-top:1px; color:var(--muted); font:500 11px/1.45 var(--font-sans); letter-spacing:.04em; text-transform:uppercase; }
  .fact > dd { margin:0; min-width:0; }
  .faults { display:flex; flex-wrap:wrap; gap:6px; }
  .fault-pill { display:inline-flex; align-items:center; gap:6px; height:20px; padding:0 6px; border-radius:4px; background:var(--warn-bg); color:var(--warn-fg); font:500 11px/1 var(--font-mono); }
  .expect { margin:0; padding-left:16px; } .expect li { margin:2px 0; } .expect li::marker { color:var(--faint); }
  .commands { display:flex; flex-direction:column; gap:6px; }
  .cmd { display:flex; align-items:center; gap:8px; min-width:0; height:32px; padding:0 4px 0 10px; border:1px solid var(--border); border-radius:4px; background:var(--surface-2); }
  .cmd::before { content:"$"; flex:none; color:var(--faint); font:12px var(--font-mono); }
  .cmd code { flex:1; min-width:0; overflow-x:auto; color:var(--fg-2); font-size:12px; white-space:nowrap; scrollbar-width:none; }
  .cmd button { flex:none; height:24px; padding:0 8px; border:1px solid var(--border); border-radius:4px; background:var(--surface); color:var(--fg-2); font-size:12px; font-weight:500; cursor:pointer; transition:color .12s, border-color .12s; }
  .cmd button:hover { border-color:var(--border-2); color:var(--fg); }
  .rpt-warnings { margin:0 0 16px; border-color:var(--degr-bd); background:var(--warn-bg); }
  .rpt-warnings h2 { margin:0 0 6px; color:var(--warn-fg); font-size:13px; }
  .rpt-warnings ul { margin:0; padding-left:18px; }
  .rpt-trials { margin:0 0 16px; padding:12px 16px 8px; }
  .rpt-trials-head { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px 24px; margin:0 0 8px; }
  .rpt-trials h2 { font-size:14px; }
  .stats { display:flex; flex-wrap:wrap; overflow:hidden; border:1px solid var(--border); border-radius:6px; }
  .stat { display:flex; flex-direction:column; gap:2px; padding:6px 12px; border-left:1px solid var(--border); }
  .stat:first-child { border-left:0; }
  .stat b { font:600 13px/1.2 var(--font-mono); }
  .stat span { color:var(--muted); font-size:11px; }
  .trial-nav { max-height:240px; margin:0 -8px; padding:0; overflow:auto; list-style:none; }
  .trial-nav li { display:flex; align-items:center; gap:12px; min-width:0; height:28px; padding:0 8px; border-radius:4px; color:var(--muted); font-size:12px; }
  .trial-nav li > :last-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .trial-nav a { display:inline-flex; flex:none; align-items:center; gap:10px; color:var(--fg); font-weight:500; text-decoration:none; }
  .trial-nav li:has(a:hover) { background:var(--surface-2); }
  .trial-nav li:has(a.current) { background:var(--accent-soft); }
  .trial-nav a.current { font-weight:600; }
  .rpt-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px 16px; margin:0 0 16px; color:var(--muted); font-size:12px; }
  .rpt-toolbar input[type=search] { width:min(320px, 100%); height:32px; padding:0 10px; border:1px solid var(--border-2); border-radius:4px; background:var(--surface); outline:0; transition:border-color .12s, box-shadow .12s; }
  .rpt-toolbar input[type=search]:focus { border-color:var(--accent); box-shadow:0 0 0 2px var(--accent-soft); }
  .rpt-toolbar label { display:inline-flex; align-items:center; gap:8px; color:var(--fg-2); font-size:13px; cursor:pointer; }
  .rpt-toolbar input[type=checkbox] { width:14px; height:14px; margin:0; accent-color:var(--accent-solid); }
  .rpt-toolbar button { height:28px; padding:0 10px; border:1px solid var(--border-2); border-radius:4px; background:var(--surface); color:var(--fg); font-size:13px; font-weight:500; cursor:pointer; transition:background .12s; }
  .rpt-toolbar button:hover { background:var(--surface-2); }
  .rpt-hint { flex-basis:100%; }
  .trial { display:grid; grid-template-columns:minmax(0,1fr) minmax(280px,360px); gap:24px; align-items:start; }
  .js .trial:not(.current) { display:none; }
  .trial-main > h2 { display:flex; align-items:center; gap:8px; margin:0 0 12px; font-size:14px; }
  .timeline { position:relative; margin:0; padding:0 0 0 24px; list-style:none; }
  .timeline::before { content:""; position:absolute; top:14px; bottom:14px; left:3px; width:1px; background:var(--border-2); }
  .timeline > li { position:relative; margin:0 0 8px; }
  .timeline > li::before { content:""; position:absolute; top:14px; left:-24px; width:7px; height:7px; border:1.5px solid var(--border-2); border-radius:999px; background:var(--canvas); }
  .timeline > li.committed::before { border-color:var(--ssucc); background:var(--ssucc); }
  .timeline > li.failed::before { border-color:var(--harm); background:var(--canvas); }
  .timeline > li.committed.failed::before { background:var(--harm); }
  .timeline > li.faulted::before { outline:1.5px solid var(--degr); outline-offset:2px; }
  .timeline > li.final::before { top:4px; border-color:var(--fg); border-radius:2px; }
  .timeline > li.note { padding:8px 0 4px; color:var(--muted); }
  .timeline > li.note::before { top:12px; }
  .timeline > li.hidden, .filter-faults .timeline > li.call:not(.faulted):not(.failed):not(.cited) { display:none; }
  .call > details { border:1px solid var(--border); border-radius:6px; background:var(--surface); transition:border-color .12s; }
  .call > details:hover, .call > details[open] { border-color:var(--border-2); }
  .call.faulted > details { border-left:2px solid var(--degr); }
  .call.flash > details, .call:target > details { outline:2px solid var(--focus); outline-offset:1px; }
  .chip.cite { background:var(--v-bg, var(--accent-soft)); color:var(--v-fg, var(--accent-fg)); }
  .call > details > summary { position:relative; display:block; padding:8px 32px 8px 12px; list-style:none; cursor:pointer; }
  .call > details > summary::-webkit-details-marker { display:none; }
  .call > details > summary::after { content:""; position:absolute; top:14px; right:14px; width:5px; height:5px; border-right:1.5px solid var(--muted); border-bottom:1.5px solid var(--muted); transform:rotate(-45deg); transition:transform .12s; }
  .call > details[open] > summary::after { transform:rotate(45deg); }
  .call-line { display:flex; flex-wrap:wrap; align-items:center; gap:4px 8px; }
  .call-id { color:var(--muted); font-size:11px; }
  .call-tool { color:var(--fg); font-size:12px; font-weight:600; }
  .call-saw { display:block; margin-top:4px; overflow:hidden; color:var(--fg-2); font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
  .call-saw code { color:var(--fg-2); font-size:12px; }
  .state { display:block; margin-top:4px; color:var(--add); font:12px/1.45 var(--font-mono); white-space:pre-wrap; word-break:break-word; }
  .state.chg { color:var(--chg); } .state.del { color:var(--del); }
  .call-body { padding:0 12px 12px; border-top:1px solid var(--border); }
  .call-body h3, .timeline h3, .trial-aside h3 { margin:12px 0 6px; color:var(--muted); font:500 11px/1.3 var(--font-sans); letter-spacing:.04em; text-transform:uppercase; }
  .call-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:0 12px; }
  .call-body p { margin:6px 0; color:var(--fg-2); }
  .call-body ul { margin:4px 0; padding:0; list-style:none; }
  .call-body li { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin:4px 0; }
  .snapshot { margin-top:12px; }
  .snapshot > summary { color:var(--muted); font-size:12px; cursor:pointer; }
  .snapshot > summary:hover { color:var(--fg); }
  .snapshot > pre { max-height:420px; margin-top:8px; }
  .final h3 { margin:2px 0 8px; }
  .final .answer { padding:10px 12px; border:1px solid var(--border); border-radius:6px; background:var(--surface); font-size:13px; line-height:1.5; white-space:pre-wrap; }
  .trial-aside { position:sticky; top:var(--sticky-top, 16px); display:flex; flex-direction:column; gap:12px; max-height:calc(100vh - var(--sticky-top, 16px) - 16px); overflow:auto; }
  .aside-card { padding:12px 16px; border:1px solid var(--border); border-radius:6px; background:var(--surface); font-size:12px; }
  .trial-aside h3 { margin:0 0 8px; }
  .aside-card > p { margin:0; color:var(--fg-2); }
  .aside-card ul { margin:8px 0 0; padding-left:0; list-style:none; }
  .aside-card li { margin:6px 0; color:var(--fg-2); word-break:break-word; }
  .aside-card li .chip { margin-right:4px; }
  .finding { padding:10px 0; border-top:1px solid var(--border); }
  .finding:first-of-type { padding-top:0; border-top:0; }
  .finding:last-child { padding-bottom:0; }
  .finding-head { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin:0 0 6px; }
  .finding-head code { color:var(--fg-2); font-size:11px; }
  .finding > div { color:var(--fg); line-height:1.45; }
  .finding ul { margin:6px 0 0; padding-left:14px; list-style:disc; }
  .finding li { margin:4px 0; font-size:12px; }
  .finding li::marker { color:var(--faint); }
  .rpt a[href^="#t"] { text-decoration:none; }
  .rpt a[href^="#t"] code { padding:1px 5px; border-radius:4px; background:var(--accent-soft); color:var(--accent-fg); font-size:11px; white-space:nowrap; }
  .rpt a[href^="#t"]:hover code { background:var(--accent-line); }
  @media (max-width: 980px) { .rpt-summary, .trial { grid-template-columns:1fr; } .trial-aside { position:static; max-height:none; } }
`;

/** The brand bar and page frame of the standalone report, run index, and sweep page. */
const PAGE_CSS = `
  .brandbar { border-bottom:1px solid var(--border); background:var(--surface); }
  .brandbar > div { display:flex; align-items:center; gap:8px; max-width:1200px; height:44px; margin:0 auto; padding:0 24px; }
  .brandbar b { font-size:13px; font-weight:600; }
  .brandbar i { color:var(--faint); font-style:normal; }
  .brandbar em { color:var(--fg-2); font-size:12px; font-style:normal; }
  .brandbar small { margin-left:auto; color:var(--muted); font:400 12px/1 var(--font-mono); }
  main { max-width:1200px; margin:0 auto; padding:24px 24px 64px; }
  .page-title { margin:0 0 16px; }
  .page-title h1 { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; margin:0 0 8px; font:600 16px/1.3 var(--font-mono); overflow-wrap:anywhere; }
  .meta { display:flex; flex-wrap:wrap; gap:4px 16px; color:var(--muted); font-size:12px; }
  .meta code { color:var(--fg-2); font-size:12px; }
`;

function brandBar(section: string, version: string | undefined): string {
  return `<header class="brandbar"><div>${logo(20)}<b>AgentCrucible</b><i>/</i><em>${esc(section)}</em>${version ? `<small>v${esc(version)}</small>` : ""}</div></header>`;
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
      const label = verdictText(t.verdict);
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
  ${findings.length ? `<h3>Findings citing this call</h3><ul>${findings.map((f) => `<li>${verdictText(f.verdict)} <code>${esc(f.rule)}</code></li>`).join("")}</ul>` : ""}
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
      (f) => `<div class="finding"><div class="finding-head">${verdictText(f.verdict)} <code>${esc(f.rule)}</code></div>
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
  h1 { margin:0 0 12px; font-size:16px; }
  .bar { display:flex; gap:1px; height:6px; margin:0 0 12px; }
  .bar span { min-width:2px; border-radius:3px; background:var(--v); }
  .summary { display:flex; flex-wrap:wrap; gap:4px 16px; margin:0 0 4px; }
  .summary > span { display:inline-flex; align-items:center; gap:8px; font:500 12px var(--font-mono); }
  .note { margin:0 0 16px; color:var(--muted); font-size:12px; }
  .table { overflow:auto; border:1px solid var(--border); border-radius:6px; background:var(--surface); }
  th { background:var(--surface-2); }
  tbody tr:last-child td { border-bottom:0; }
  tbody tr:hover td { background:var(--surface-2); }
  td a { font:500 12px/1.4 var(--font-mono); text-decoration:none; white-space:nowrap; }
  td a:hover { color:var(--accent-fg); text-decoration:underline; }
  td code { white-space:nowrap; }
  td.num { color:var(--fg-2); }
  .rule { color:var(--fg-2); font-size:12px; }
  td.reason { min-width:280px; color:var(--fg-2); }
</style>
</head>
<body>
${brandBar("Run", entries[0]?.report.toolVersion)}
<main>
  <h1>${esc(title)}</h1>
  <div class="note">${plural(scenarios, "scenario")} × ${plural(agents, "agent")}</div>
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

/** Two-letter codes the sweep heat map prints in a cell; the cell's title spells the verdict out. */
export const VERDICT_CODE: Record<Verdict, string> = { HARMFUL_ACTION: "HA", SILENT_FAILURE: "SL", DEGRADED: "DE", INCONCLUSIVE: "IN", SAFE_FAILURE: "SF", SAFE_SUCCESS: "SS" };

/** `tool#callIndex`, the name of a sweep column. */
export function sweepStepLabel(step: SweepStep): string {
  return `${step.tool}#${step.callIndex}`;
}

/** The most severe verdict among the cells, if there are any. */
export function worstVerdict(cells: SweepCell[]): Verdict | undefined {
  return VERDICTS.find((v) => cells.some((c) => c.verdict === v));
}

function worstDot(cells: SweepCell[]): string {
  const worst = worstVerdict(cells);
  return worst ? `<span class="vdot ${esc(worst)}" title="worst: ${esc(worst)}"><span class="sr-only">worst: ${esc(worst)}</span></span>` : "";
}

/** The tooltip of a heat map cell: verdict, deciding rule, and reason, or why the cell tested nothing. */
export function sweepCellTitle(cell: SweepCell): string {
  const lines = cell.fired ? [cell.verdict, ...(cell.rule ? [cell.rule] : []), cell.reason] : ["not reached", `The agent never made this call under ${cell.kind}, so the cell did not test it.`, `${cell.verdict}: ${cell.reason}`];
  return lines.join("\n");
}

/**
 * The sweep heat map: one row per fault kind, one column per step of the clean path. `href` turns
 * a cell into a link, for the local UI; the standalone page shows plain text.
 */
export function sweepHeatMap(s: SweepSummary, href?: (cell: SweepCell) => string | undefined): string {
  const head = s.steps
    .map((st) => `<th scope="col" class="hm-step" title="step ${st.step}: ${esc(sweepStepLabel(st))}${st.mutating ? ", changes state" : ""}"><span class="hm-tool">${esc(st.tool)}</span><span class="hm-idx">#${st.callIndex}${st.mutating ? '<i class="hm-w" title="changes state">writes</i>' : ""}</span></th>`)
    .join("");
  const rows = s.kinds
    .map((kind) => {
      const own = s.cells.filter((c) => c.kind === kind.kind);
      const cells = s.steps
        .map((st) => {
          const cell = own.find((c) => c.step === st.step);
          if (!cell) return "<td></td>";
          const text = cell.fired ? VERDICT_CODE[cell.verdict] : `(${VERDICT_CODE[cell.verdict]})`;
          const attrs = `class="hm-cell ${esc(cell.verdict)}${cell.fired ? "" : " hm-off"}" title="${esc(sweepCellTitle(cell))}" aria-label="${esc(`${kind.kind} at ${sweepStepLabel(st)}: ${cell.verdict}${cell.fired ? "" : ", not reached"}`)}"`;
          const link = href?.(cell);
          return `<td>${link ? `<a ${attrs} href="${esc(link)}">${text}</a>` : `<span ${attrs}>${text}</span>`}</td>`;
        })
        .join("");
      return `<tr><th scope="row" class="hm-kind"><code>${esc(kind.kind)}</code><small>${esc(kind.stage)}</small></th>${cells}<td class="hm-end">${worstDot(own)}</td></tr>`;
    })
    .join("");
  const foot = s.steps.map((st) => `<td>${worstDot(s.cells.filter((c) => c.step === st.step))}</td>`).join("");
  return `<div class="hm-wrap"><table class="hm"><thead><tr><th class="hm-corner">Fault kind</th>${head}<th class="hm-end" title="Worst verdict of the row">Worst</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><th scope="row" class="hm-kind">Worst</th>${foot}<td></td></tr></tfoot></table></div>
  <p class="hm-legend">${VERDICTS.map((v) => `<span><span class="hm-cell hm-key ${v}">${VERDICT_CODE[v]}</span>${v}</span>`).join("")}<span><span class="hm-cell hm-key hm-off">(SS)</span>the fault was never reached</span></p>`;
}

/** Styles for the heat map, shared by the standalone sweep page and the local UI. */
export const SWEEP_CSS = `
  .hm-wrap { display:block; width:fit-content; max-width:100%; overflow:auto; border:1px solid var(--border); border-radius:6px; background:var(--surface); }
  .hm { width:auto; }
  .hm th, .hm td { height:auto; padding:4px; border-bottom:1px solid var(--border); text-align:center; }
  .hm tfoot th, .hm tfoot td, .hm tbody tr:last-child > * { border-bottom:0; }
  .hm tfoot > tr > * { border-top:1px solid var(--border); }
  .hm thead th { padding:8px 4px; background:var(--surface-2); vertical-align:bottom; text-transform:none; letter-spacing:0; }
  .hm .hm-corner { text-align:left; padding-left:12px; color:var(--muted); font:500 11px/1.3 var(--font-sans); letter-spacing:.04em; text-transform:uppercase; }
  .hm .hm-step { min-width:88px; font-weight:400; }
  .hm-tool { display:block; color:var(--fg); font:500 11px/1.3 var(--font-mono); overflow-wrap:anywhere; }
  .hm-idx { display:flex; align-items:center; justify-content:center; gap:4px; color:var(--muted); font:400 11px/1.3 var(--font-mono); }
  .hm-w { padding:0 3px; border:1px solid var(--border-2); border-radius:3px; color:var(--muted); font:500 9px/12px var(--font-sans); letter-spacing:.04em; text-transform:uppercase; }
  .hm .hm-kind { position:sticky; left:0; z-index:1; min-width:150px; padding:4px 12px; background:var(--surface); text-align:left; text-transform:none; letter-spacing:0; white-space:nowrap; }
  .hm .hm-kind code { color:var(--fg); font-size:12px; font-weight:500; }
  .hm .hm-kind small { margin-left:8px; color:var(--muted); font-size:11px; }
  .hm tfoot .hm-kind { color:var(--muted); font:500 11px/1.3 var(--font-sans); letter-spacing:.04em; text-transform:uppercase; }
  .hm .hm-end { width:56px; text-align:center; }
  .hm-cell { display:inline-flex; align-items:center; justify-content:center; min-width:40px; height:24px; padding:0 6px; border:1px solid var(--v-bd, var(--border)); border-radius:4px; background:var(--v-bg, transparent); color:var(--v-fg, var(--muted)); font:500 11px/1 var(--font-mono); text-decoration:none; transition:border-color .12s; }
  a.hm-cell:hover { border-color:var(--v); }
  .hm-cell.hm-off { border-style:dashed; opacity:.55; }
  .hm-legend { display:flex; flex-wrap:wrap; gap:6px 16px; margin:12px 0 0; color:var(--muted); font-size:12px; }
  .hm-legend > span { display:inline-flex; align-items:center; gap:6px; }
  .hm-key { min-width:32px; height:20px; font-size:10px; }
`;

function kpiCells(cells: Array<[string, string, string]>): string {
  return `<div class="kpis">${cells.map(([label, value, detail]) => `<div class="kpi"><span class="kpi-label">${esc(label)}</span><span class="kpi-num">${esc(value)}</span><span class="kpi-sub">${esc(detail)}</span></div>`).join("")}</div>`;
}

/** The KPI cell styles of standalone pages. The local UI has its own. */
const KPI_CSS = `
  .kpis { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); margin:0 0 16px; overflow:hidden; border:1px solid var(--border); border-radius:6px; background:var(--surface); }
  .kpi { display:flex; flex-direction:column; gap:4px; min-width:0; padding:12px 16px; border-left:1px solid var(--border); }
  .kpi:first-child { border-left:0; }
  .kpi-label { color:var(--muted); font:500 11px/1.3 var(--font-sans); letter-spacing:.04em; text-transform:uppercase; }
  .kpi-num { font:600 20px/1.2 var(--font-mono); }
  .kpi-sub { overflow:hidden; color:var(--muted); font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
  @media (max-width: 640px) { .kpis { grid-template-columns:repeat(2, minmax(0,1fr)); } .kpi:nth-child(odd) { border-left:0; } .kpi:nth-child(n+3) { border-top:1px solid var(--border); } }
`;

/**
 * A self-contained page for one sweep: the scenario, agent, and seed, the score, the heat map of
 * verdicts by fault kind and step, and the runs that ended HARMFUL_ACTION or SILENT_FAILURE.
 * Loads nothing and runs no script.
 */
export function renderSweepHtml(summary: SweepSummary, opts: { title?: string; version?: string } = {}): string {
  const s = summary;
  const title = opts.title ?? `Sweep of ${s.scenarioId} with ${s.agentId}`;
  const label = (cell: SweepCell) => sweepStepLabel(s.steps[cell.step - 1]);
  const critical = s.cells.filter((c) => c.fired && (c.verdict === "HARMFUL_ACTION" || c.verdict === "SILENT_FAILURE")).sort((a, b) => a.step - b.step || a.kind.localeCompare(b.kind));
  const list = critical.length
    ? `<div class="table"><table><thead><tr><th>Verdict</th><th>Fault kind</th><th>Step</th><th>Deciding rule</th><th>Reason</th></tr></thead><tbody>${critical
        .map((c) => `<tr><td>${verdictText(c.verdict)}</td><td><code>${esc(c.kind)}</code></td><td><code>${esc(label(c))}</code></td><td><code class="rule">${esc(c.rule)}</code></td><td class="reason">${esc(c.reason)}</td></tr>`)
        .join("")}</tbody></table></div>`
    : '<p class="note">No run ended HARMFUL_ACTION or SILENT_FAILURE.</p>';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<style>${BASE_CSS}${PAGE_CSS}${SWEEP_CSS}${KPI_CSS}
  h2 { margin:24px 0 8px; font-size:14px; }
  .note { margin:0 0 16px; color:var(--muted); font-size:12px; }
  .table { overflow:auto; border:1px solid var(--border); border-radius:6px; background:var(--surface); }
  th { background:var(--surface-2); }
  tbody tr:last-child td { border-bottom:0; }
  td code { white-space:nowrap; }
  .rule { color:var(--fg-2); }
  td.reason { min-width:280px; color:var(--fg-2); }
</style>
</head>
<body>
${brandBar("Sweep", opts.version)}
<main>
  <header class="page-title">
    <h1>${esc(s.scenarioId)} <span class="badge ${esc(s.baseline.verdict)}" title="Verdict of the agent's run without faults">baseline ${esc(s.baseline.verdict)}</span></h1>
    <div class="meta"><span>agent <code>${esc(s.agentId)}</code></span><span>seed <code>${esc(s.seed)}</code></span><span>${plural(s.trials, "trial")} per run</span><span>${plural(s.kinds.length, "fault kind")} × ${plural(s.steps.length, "step")}</span><span>${Math.round(s.durationMs)} ms</span></div>
  </header>
  ${kpiCells([
    ["Runs", String(s.score.runs), `${plural(s.kinds.length, "kind")} × ${plural(s.steps.length, "step")}`],
    ["Ended safe", String(s.score.safe), "SAFE_SUCCESS or SAFE_FAILURE"],
    ["Critical", String(s.score.critical), "HARMFUL_ACTION or SILENT_FAILURE"],
    ["Resilience", `${(s.score.resilience * 100).toFixed(1)}%`, s.score.notFired ? `${s.score.notFired} not reached` : "every fault was reached"],
  ])}
  ${sweepHeatMap(s)}
  <h2>Critical runs</h2>
  ${list}
</main>
</body>
</html>
`;
}
