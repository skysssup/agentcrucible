import { callState, describeBudget, describeFault, describeOutcome, expectParts, worstTrial } from "./describe.js";
import { pct, truncate } from "./format.js";
import type { GradedTrial, RunReport, Verdict } from "./types.js";

/** Escapes text for HTML and XML content and attribute values. */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const DARK = `color-scheme:dark;
    --bg:#09090b; --bg-subtle:#0d0d10; --surface:#111114; --surface-2:#17171b; --surface-3:#1f1f24; --overlay:rgba(4,4,6,.72);
    --border:#222228; --border-2:#303038; --fg:#ededf0; --fg-2:#b4b4bd; --muted:#8a8a95; --faint:#5b5b66;
    --accent:#ff7a33; --accent-fg:#ff9b63; --accent-soft:rgba(255,122,51,.13); --focus:#ff8a4a;
    --ok-fg:#4fd393; --ok-bg:rgba(52,178,115,.14); --bad-fg:#ff8686; --bad-bg:rgba(229,72,77,.15); --warn-fg:#f6c453; --warn-bg:rgba(245,184,61,.12);
    --info-fg:#82b8ff; --info-bg:rgba(59,142,234,.15); --add:#58d69a; --chg:#f6c453; --del:#ff8686;
    --shadow-sm:0 1px 0 rgba(255,255,255,.025) inset; --shadow:0 1px 0 rgba(255,255,255,.03) inset, 0 6px 20px -8px rgba(0,0,0,.6);
    --shadow-lg:0 24px 60px -12px rgba(0,0,0,.75), 0 0 0 1px rgba(255,255,255,.05);
    --tk-key:#8cb8ff; --tk-str:#86e0ad; --tk-num:#ffb57a; --tk-lit:#f59ad3; --tk-punc:#6b6b76; --tk-com:#6b6b76;
    --harm:#e5484d; --harm-fg:#ff8b8b; --harm-bg:rgba(229,72,77,.13); --harm-bd:rgba(229,72,77,.34);
    --silent:#8e6ff0; --silent-fg:#bba8ff; --silent-bg:rgba(124,92,219,.17); --silent-bd:rgba(142,111,240,.4);
    --degr:#f5b83d; --degr-fg:#f7c75e; --degr-bg:rgba(245,184,61,.12); --degr-bd:rgba(245,184,61,.32);
    --inc:#3b8eea; --inc-fg:#86baff; --inc-bg:rgba(59,142,234,.14); --inc-bd:rgba(59,142,234,.36);
    --sfail:#19b3a2; --sfail-fg:#52dac8; --sfail-bg:rgba(25,179,162,.13); --sfail-bd:rgba(25,179,162,.34);
    --ssucc:#34b273; --ssucc-fg:#5edb9b; --ssucc-bg:rgba(52,178,115,.13); --ssucc-bd:rgba(52,178,115,.34);`;

/**
 * Design tokens, base elements, verdict colors, badges, chips, and code colors shared by the HTML
 * report, the run index, and the local UI. Light and dark, following the system unless a page
 * sets data-theme on its root element.
 */
export const BASE_CSS = `
  :root { color-scheme:light dark;
    --font-sans:"Inter","Inter Variable",-apple-system,BlinkMacSystemFont,"Segoe UI Variable Text","Segoe UI",system-ui,Roboto,"Noto Sans","Helvetica Neue",Arial,sans-serif;
    --font-mono:"JetBrains Mono","Fira Code","SF Mono","Cascadia Code",ui-monospace,Menlo,Consolas,"Liberation Mono",monospace;
    --radius-sm:6px; --radius:10px; --radius-lg:14px;
    --bg:#fafafa; --bg-subtle:#f4f4f5; --surface:#ffffff; --surface-2:#f7f7f8; --surface-3:#efeff2; --overlay:rgba(24,24,28,.36);
    --border:#e7e7ea; --border-2:#d6d6dc; --fg:#111114; --fg-2:#45454d; --muted:#6d6d77; --faint:#a3a3ad;
    --accent:#ea580c; --accent-fg:#c2410c; --accent-soft:#fff1e8; --focus:#ea580c;
    --ok-fg:#1a7f4b; --ok-bg:#e8f6ed; --bad-fg:#cd2b31; --bad-bg:#fdeded; --warn-fg:#985b00; --warn-bg:#fff5d6;
    --info-fg:#1d6fc4; --info-bg:#e9f3fe; --add:#1a7f4b; --chg:#985b00; --del:#cd2b31;
    --shadow-sm:0 1px 2px rgba(17,17,20,.05); --shadow:0 1px 2px rgba(17,17,20,.04), 0 4px 14px -4px rgba(17,17,20,.08);
    --shadow-lg:0 24px 60px -16px rgba(17,17,20,.28), 0 0 0 1px rgba(17,17,20,.06);
    --tk-key:#2459c9; --tk-str:#18794a; --tk-num:#b4540a; --tk-lit:#bf1f75; --tk-punc:#8b8b95; --tk-com:#8b8b95;
    --harm:#e5484d; --harm-fg:#cd2b31; --harm-bg:#feeded; --harm-bd:#f8c8c8;
    --silent:#7c5cdb; --silent-fg:#6143c2; --silent-bg:#f3effe; --silent-bd:#ddd3fa;
    --degr:#f0a020; --degr-fg:#985b00; --degr-bg:#fff4d4; --degr-bd:#f2d68f;
    --inc:#3b8eea; --inc-fg:#1d6fc4; --inc-bg:#e9f3fe; --inc-bd:#c5ddf8;
    --sfail:#14a394; --sfail-fg:#06776b; --sfail-bg:#e1f7f2; --sfail-bd:#ade5da;
    --ssucc:#2fa56d; --ssucc-fg:#1a7f4b; --ssucc-bg:#e8f6ed; --ssucc-bd:#bfe4cc; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme=light]) { ${DARK} } }
  :root[data-theme=dark] { ${DARK} }
  :root[data-theme=light] { color-scheme:light; }
  *, *::before, *::after { box-sizing:border-box; }
  * { scrollbar-width:thin; scrollbar-color:var(--border-2) transparent; }
  html { -webkit-text-size-adjust:100%; }
  body { margin:0; font:14px/1.55 var(--font-sans); background:var(--bg); color:var(--fg); -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale; text-rendering:optimizeLegibility; }
  ::selection { background:color-mix(in srgb, var(--accent) 26%, transparent); }
  a { color:inherit; text-decoration-color:color-mix(in srgb, currentColor 35%, transparent); text-underline-offset:3px; }
  a:hover { text-decoration-color:currentColor; }
  h1, h2, h3 { font-weight:600; letter-spacing:-.01em; }
  code, pre, kbd, samp { font-family:var(--font-mono); font-size:12.5px; font-variant-ligatures:none; }
  pre { margin:0; padding:12px 14px; background:var(--surface-2); border:1px solid var(--border); border-radius:8px; white-space:pre-wrap; word-break:break-word; line-height:1.6; overflow:auto; }
  table { width:100%; border-collapse:separate; border-spacing:0; }
  th, td { text-align:left; padding:10px 12px; border-bottom:1px solid var(--border); vertical-align:top; }
  th { color:var(--muted); font-weight:500; font-size:12px; white-space:nowrap; }
  button, input, select, textarea { font:inherit; color:inherit; }
  :focus-visible { outline:2px solid var(--focus); outline-offset:2px; }
  .muted { color:var(--muted); }
  .HARMFUL_ACTION { --v:var(--harm); --v-fg:var(--harm-fg); --v-bg:var(--harm-bg); --v-bd:var(--harm-bd); }
  .SILENT_FAILURE { --v:var(--silent); --v-fg:var(--silent-fg); --v-bg:var(--silent-bg); --v-bd:var(--silent-bd); }
  .DEGRADED { --v:var(--degr); --v-fg:var(--degr-fg); --v-bg:var(--degr-bg); --v-bd:var(--degr-bd); }
  .INCONCLUSIVE { --v:var(--inc); --v-fg:var(--inc-fg); --v-bg:var(--inc-bg); --v-bd:var(--inc-bd); }
  .SAFE_FAILURE { --v:var(--sfail); --v-fg:var(--sfail-fg); --v-bg:var(--sfail-bg); --v-bd:var(--sfail-bd); }
  .SAFE_SUCCESS { --v:var(--ssucc); --v-fg:var(--ssucc-fg); --v-bg:var(--ssucc-bg); --v-bd:var(--ssucc-bd); }
  .badge { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 9px 0 8px; border-radius:999px; font:600 11px/1 var(--font-mono); letter-spacing:.01em; white-space:nowrap; vertical-align:middle;
    color:var(--v-fg, var(--fg-2)); background:var(--v-bg, var(--surface-3)); box-shadow:inset 0 0 0 1px var(--v-bd, var(--border)); }
  .badge::before { content:""; flex:none; width:6px; height:6px; border-radius:50%; background:var(--v, currentColor); box-shadow:0 0 0 3px color-mix(in srgb, var(--v, currentColor) 18%, transparent); }
  .chip { display:inline-flex; align-items:center; gap:4px; padding:0 7px; border-radius:6px; font-size:11.5px; font-weight:500; line-height:20px; white-space:nowrap; vertical-align:middle; background:var(--surface-3); color:var(--fg-2); }
  .chip.fault { background:var(--warn-bg); color:var(--warn-fg); }
  .chip.err, .chip.contradicted, .chip.invalid { background:var(--bad-bg); color:var(--bad-fg); }
  .chip.ok, .chip.pass { background:var(--ok-bg); color:var(--ok-fg); }
  .chip.missing, .chip.ambiguous { background:var(--info-bg); color:var(--info-fg); }
  .panel { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:16px 18px; box-shadow:var(--shadow-sm); }
  .tk-key { color:var(--tk-key); } .tk-str { color:var(--tk-str); } .tk-num { color:var(--tk-num); } .tk-lit { color:var(--tk-lit); } .tk-punc { color:var(--tk-punc); }
  .tk-com { color:var(--tk-com); font-style:italic; }
`;

/** The report timeline: summary, trial list, call cards, and findings. The HTML report and the local UI both use it. */
export const REPORT_CSS = `
  .rpt-summary { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:16px; align-items:start; margin:0 0 16px; }
  .rpt-col { display:flex; flex-direction:column; gap:16px; min-width:0; }
  .rpt-repro { padding:14px 16px; border:1px solid var(--border); border-radius:var(--radius); background:var(--surface); box-shadow:var(--shadow-sm); }
  .rpt-why { position:relative; padding:18px 20px 18px 24px; border-radius:var(--radius); background:var(--v-bg); box-shadow:inset 0 0 0 1px var(--v-bd); overflow:hidden; }
  .rpt-why::before { content:""; position:absolute; inset:0 auto 0 0; width:4px; background:var(--v); }
  .rpt-label { margin:0 0 8px; font:600 11px/1.2 var(--font-sans); letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
  .rpt-why .rpt-label { color:var(--v-fg); }
  .rpt-why p { margin:0; font-size:15px; line-height:1.6; color:var(--fg); }
  .rpt-why .rule { display:inline-block; margin-top:12px; padding:2px 8px; border-radius:6px; background:color-mix(in srgb, var(--surface) 70%, transparent); color:var(--v-fg); font-size:12px; }
  .rpt-facts { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:4px 18px; box-shadow:var(--shadow-sm); }
  .fact { display:grid; grid-template-columns:84px minmax(0,1fr); gap:12px; padding:11px 0; border-bottom:1px solid var(--border); font-size:13.5px; }
  .fact:last-child { border-bottom:0; }
  .fact > dt { color:var(--muted); font-size:12.5px; padding-top:1px; }
  .fact > dd { margin:0; min-width:0; }
  .rpt-facts dl { margin:0; }
  .faults { display:flex; flex-wrap:wrap; gap:6px; }
  .fault-pill { display:inline-flex; align-items:center; gap:6px; padding:2px 9px 2px 7px; border-radius:999px; background:var(--warn-bg); color:var(--warn-fg); font:500 12px/18px var(--font-mono); }
  .fault-pill::before { content:"\\26A1"; font-family:var(--font-sans); font-size:11px; }
  .expect { margin:0; padding-left:18px; } .expect li { margin:3px 0; } .expect li::marker { color:var(--faint); }
  .commands { display:flex; flex-direction:column; gap:6px; }
  .cmd { display:flex; align-items:center; gap:8px; min-width:0; padding:5px 5px 5px 10px; border:1px solid var(--border); border-radius:8px; background:var(--surface-2); }
  .cmd code { flex:1; min-width:0; overflow-x:auto; white-space:nowrap; scrollbar-width:none; color:var(--fg-2); font-size:12px; }
  .cmd button { flex:none; height:24px; padding:0 9px; border:1px solid var(--border); border-radius:6px; background:var(--surface); color:var(--fg-2); font-size:12px; cursor:pointer; }
  .cmd button:hover { color:var(--fg); border-color:var(--border-2); }
  .rpt-warnings { margin:0 0 16px; background:var(--warn-bg); border-color:color-mix(in srgb, var(--warn-fg) 30%, transparent); color:var(--fg); }
  .rpt-warnings h2 { margin:0 0 6px; font-size:13px; color:var(--warn-fg); }
  .rpt-warnings ul { margin:0; padding-left:18px; }
  .rpt-trials { margin:0 0 16px; padding:14px 16px 10px; }
  .rpt-trials-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px 24px; flex-wrap:wrap; margin:0 0 10px; }
  .rpt-trials h2 { margin:2px 0 0; font-size:14px; }
  .stats { display:flex; flex-wrap:wrap; gap:8px 28px; }
  .stat { display:flex; flex-direction:column; gap:1px; }
  .stat b { font-size:15px; font-weight:600; font-variant-numeric:tabular-nums; }
  .stat span { font-size:11.5px; color:var(--muted); }
  .trial-nav { list-style:none; margin:0 -6px; padding:0; max-height:240px; overflow:auto; }
  .trial-nav li { display:flex; align-items:center; gap:12px; min-width:0; padding:5px 8px; border-radius:7px; font-size:13px; color:var(--muted); }
  .trial-nav li > :last-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .trial-nav a { flex:none; display:inline-flex; align-items:center; gap:10px; color:var(--fg); text-decoration:none; font-weight:500; font-variant-numeric:tabular-nums; }
  .trial-nav li:has(a:hover) { background:var(--surface-2); }
  .trial-nav li:has(a.current) { background:var(--surface-3); }
  .trial-nav a.current { font-weight:600; }
  .rpt-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:10px 18px; margin:0 0 16px; color:var(--muted); font-size:13px; }
  .rpt-toolbar input[type=search] { height:34px; min-width:280px; padding:0 12px; border:1px solid var(--border-2); border-radius:8px; background:var(--surface); outline-offset:0; }
  .rpt-toolbar label { display:inline-flex; align-items:center; gap:8px; color:var(--fg-2); cursor:pointer; }
  .rpt-toolbar input[type=checkbox] { accent-color:var(--accent); width:15px; height:15px; margin:0; }
  .trial { display:grid; grid-template-columns:minmax(0,1fr) minmax(280px,380px); gap:24px; align-items:start; }
  .js .trial:not(.current) { display:none; }
  .trial-main > h2 { display:flex; align-items:center; gap:10px; margin:0 0 14px; font-size:15px; }
  .timeline { position:relative; list-style:none; margin:0; padding:0 0 0 30px; }
  .timeline::before { content:""; position:absolute; left:10px; top:16px; bottom:22px; width:2px; border-radius:2px; background:var(--border); }
  .timeline > li { position:relative; margin:0 0 10px; }
  .timeline > li::before { content:""; position:absolute; left:-24px; top:15px; width:10px; height:10px; border-radius:50%; border:2px solid var(--border-2); background:var(--bg); box-shadow:0 0 0 4px var(--bg); }
  .timeline > li.committed::before { border-color:var(--ok-fg); background:var(--ok-fg); }
  .timeline > li.failed::before { border-color:var(--bad-fg); background:var(--bad-fg); }
  .timeline > li.faulted::before { box-shadow:0 0 0 3px var(--bg), 0 0 0 5px color-mix(in srgb, var(--warn-fg) 70%, transparent); }
  .timeline > li.final::before { top:6px; border-radius:3px; border-color:var(--fg); background:var(--bg); }
  .timeline > li.note { padding:9px 0 4px; color:var(--muted); }
  .timeline > li.note::before { top:14px; }
  .timeline > li.hidden, .filter-faults .timeline > li.call:not(.faulted):not(.failed):not(.cited) { display:none; }
  .call > details { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); box-shadow:var(--shadow-sm); transition:border-color .15s, box-shadow .15s; }
  .call > details:hover { border-color:var(--border-2); }
  .call > details[open] { box-shadow:var(--shadow); }
  .call.faulted > details { border-color:color-mix(in srgb, var(--warn-fg) 38%, var(--border)); }
  .chip.cite { background:var(--v-bg, var(--accent-soft)); color:var(--v-fg, var(--accent-fg)); }
  .call.flash > details, .call:target > details { outline:2px solid var(--focus); outline-offset:2px; }
  .call > details > summary { position:relative; display:block; padding:11px 40px 11px 14px; cursor:pointer; list-style:none; }
  .call > details > summary::-webkit-details-marker { display:none; }
  .call > details > summary::after { content:""; position:absolute; right:16px; top:17px; width:6px; height:6px; border-right:1.5px solid var(--muted); border-bottom:1.5px solid var(--muted); transform:rotate(-45deg); transition:transform .15s; }
  .call > details[open] > summary::after { transform:rotate(45deg); }
  .call-line { display:flex; flex-wrap:wrap; align-items:center; gap:6px 8px; }
  .call-id { color:var(--muted); font-size:11.5px; }
  .call-tool { color:var(--fg); font-size:13px; font-weight:600; }
  .call-saw { display:block; margin-top:6px; overflow:hidden; color:var(--fg-2); font-size:13px; text-overflow:ellipsis; white-space:nowrap; }
  .call-saw code { color:var(--fg-2); font-size:12px; }
  .state { display:block; margin-top:5px; color:var(--add); font:12px/1.5 var(--font-mono); white-space:pre-wrap; word-break:break-word; }
  .state.chg { color:var(--chg); } .state.del { color:var(--del); }
  .call-body { padding:2px 14px 14px; border-top:1px solid var(--border); }
  .call-body h3, .timeline h3, .trial-aside h3 { margin:14px 0 6px; font:600 11px/1.2 var(--font-sans); letter-spacing:.07em; text-transform:uppercase; color:var(--muted); }
  .call-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:0 14px; }
  .call-body p { margin:6px 0; color:var(--fg-2); }
  .call-body ul { margin:4px 0; padding:0; list-style:none; }
  .call-body li { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin:5px 0; }
  .snapshot { margin-top:12px; }
  .snapshot > summary { cursor:pointer; color:var(--muted); font-size:12.5px; }
  .snapshot > summary:hover { color:var(--fg); }
  .snapshot > pre { margin-top:8px; max-height:420px; }
  .final h3 { margin:2px 0 8px; }
  .final .answer { padding:12px 16px; border:1px solid var(--border); border-radius:4px 14px 14px 14px; background:var(--surface); box-shadow:var(--shadow-sm); white-space:pre-wrap; font-size:14px; line-height:1.6; }
  .trial-aside { position:sticky; top:var(--sticky-top, 16px); display:flex; flex-direction:column; gap:12px; max-height:calc(100vh - var(--sticky-top, 16px) - 16px); overflow:auto; }
  .aside-card { padding:14px 16px; border:1px solid var(--border); border-radius:var(--radius); background:var(--surface); box-shadow:var(--shadow-sm); font-size:13px; }
  .trial-aside h3 { margin:0 0 10px; }
  .aside-card > p { margin:0; color:var(--fg-2); }
  .aside-card ul { margin:8px 0 0; padding-left:0; list-style:none; }
  .aside-card li { margin:6px 0; color:var(--fg-2); word-break:break-word; }
  .aside-card li .chip { margin-right:4px; }
  .finding { padding:12px 0; border-top:1px solid var(--border); }
  .finding:first-of-type { padding-top:0; border-top:0; }
  .finding:last-child { padding-bottom:0; }
  .finding-head { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin:0 0 6px; }
  .finding-head code { color:var(--fg-2); font-size:12px; }
  .finding > div { color:var(--fg); line-height:1.55; }
  .finding ul { margin:8px 0 0; padding-left:14px; list-style:disc; }
  .finding li { margin:4px 0; font-size:12.5px; }
  .finding li::marker { color:var(--faint); }
  .rpt a[href^="#t"] { text-decoration:none; }
  .rpt a[href^="#t"] code { padding:1px 6px; border-radius:5px; background:var(--accent-soft); color:var(--accent-fg); font-size:11.5px; white-space:nowrap; }
  .rpt a[href^="#t"]:hover code { background:color-mix(in srgb, var(--accent) 22%, transparent); }
  @media (max-width: 980px) { .rpt-summary, .trial { grid-template-columns:1fr; } .trial-aside { position:static; max-height:none; } }
`;

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
 * that cite it. It loads no external resources; a short script switches trials, filters calls,
 * and copies the commands that reproduce the run.
 */
export function renderReportHtml(report: RunReport, opts: ReportHtmlOptions = {}): string {
  return `<!DOCTYPE html>
<html lang="en"${opts.theme ? ` data-theme="${opts.theme}"` : ""}>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>AgentCrucible: ${esc(report.scenarioId)} (${esc(report.agentId)})</title>
<style>${BASE_CSS}${REPORT_CSS}
  main { max-width:1240px; margin:0 auto; padding:32px 28px 72px; }
  .rpt-head { margin:0 0 22px; }
  .rpt-head h1 { display:flex; flex-wrap:wrap; align-items:center; gap:12px; margin:6px 0 8px; font-size:24px; line-height:1.3; letter-spacing:-.02em; }
  .rpt-head .badge { height:26px; padding:0 11px 0 10px; font-size:11.5px; }
  .meta { display:flex; flex-wrap:wrap; gap:4px 16px; color:var(--muted); font-size:13px; }
  .meta code { color:var(--fg-2); }
</style>
</head>
<body>
<main class="rpt">
  <header class="rpt-head">
    <div class="rpt-label">AgentCrucible report</div>
    <h1>${esc(report.scenarioId)} <span class="badge ${esc(report.aggregateVerdict)}">${esc(report.aggregateVerdict)}</span></h1>
    <div class="meta"><span>worlds <code>${esc(report.worlds.join(", "))}</code></span><span>agent <code>${esc(report.agentId)}</code></span><span>seed <code>${esc(report.seed)}</code></span><span>${report.stats.total} trial(s)</span><span>AgentCrucible ${esc(report.toolVersion)}</span></div>
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
      ${fact("Faults", report.faults.length ? `<span class="faults">${report.faults.map((f) => `<span class="fault-pill">${esc(describeFault(f))}</span>`).join("")}</span>` : "none")}
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
    <span>Open a call for its arguments, responses, and state. Call ids in findings jump to the call.</span>
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
  <summary><span class="call-line"><code class="call-id">${esc(c.id)}</code> <code class="call-tool">${esc(c.tool)}#${c.callIndex}</code> <span class="chip">${esc(callState(c))}</span>${c.faultApplied ? ` <span class="chip fault">fault: ${esc(c.faultApplied)}</span>` : ""}${c.schemaErrors?.length ? ' <span class="chip err">schema</span>' : ""}${cited.has(c.id) ? ' <span class="chip cite">evidence</span>' : ""}</span><span class="call-saw">${saw}</span>${c.changes.map((change) => `<span class="state${change.startsWith("~") ? " chg" : change.startsWith("-") ? " del" : ""}">${esc(change)}</span>`).join("")}</summary>
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
  for (const e of entries) counts.set(e.report.aggregateVerdict, (counts.get(e.report.aggregateVerdict) ?? 0) + 1);
  const rows = entries
    .map(({ report: r, href, change }) => {
      const worst = worstTrial(r);
      return `<tr><td><a href="${esc(href)}">${esc(r.scenarioId)}</a></td><td><code>${esc(r.agentId)}</code></td><td><span class="badge ${esc(r.aggregateVerdict)}">${esc(r.aggregateVerdict)}</span>${change ? ` <span class="chip${change === "regression" || change === "new failure" ? " err" : change === "improved" ? " ok" : ""}">${esc(change)}</span>` : ""}</td><td class="num">${r.stats.total}</td><td><code class="rule">${esc(worst?.findings[0]?.rule ?? "")}</code></td><td class="reason">${esc(worst?.reason ?? "")}</td></tr>`;
    })
    .join("\n");
  const total = entries.length || 1;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<style>${BASE_CSS}
  main { max-width:1240px; margin:0 auto; padding:32px 28px 72px; }
  .kicker { margin:0 0 6px; font:600 11px/1.2 var(--font-sans); letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
  h1 { margin:0 0 18px; font-size:24px; letter-spacing:-.02em; }
  .bar { display:flex; height:8px; margin:0 0 14px; overflow:hidden; border-radius:999px; background:var(--surface-3); }
  .bar span { background:var(--v); }
  .summary { display:flex; flex-wrap:wrap; gap:8px 18px; margin:0 0 6px; }
  .summary > span { display:inline-flex; align-items:center; gap:8px; font-weight:600; font-variant-numeric:tabular-nums; }
  .note { margin:0 0 20px; color:var(--muted); font-size:13px; }
  .table { overflow:auto; border:1px solid var(--border); border-radius:var(--radius); background:var(--surface); box-shadow:var(--shadow-sm); }
  th { background:var(--surface-2); }
  tbody tr:last-child td { border-bottom:0; }
  tbody tr:hover td { background:var(--surface-2); }
  td a { font:500 13px/1.4 var(--font-mono); text-decoration:none; white-space:nowrap; }
  td code { white-space:nowrap; }
  td a:hover { text-decoration:underline; }
  td.num { font-variant-numeric:tabular-nums; color:var(--fg-2); }
  .rule { color:var(--fg-2); font-size:12px; }
  td.reason { min-width:280px; color:var(--fg-2); font-size:13px; }
</style>
</head>
<body>
<main>
  <div class="kicker">AgentCrucible run</div>
  <h1>${esc(title)}</h1>
  <div class="bar">${[...counts].map(([v, n]) => `<span class="${esc(v)}" style="width:${((n / total) * 100).toFixed(2)}%" title="${n} ${esc(v)}"></span>`).join("")}</div>
  <p class="summary">${[...counts].map(([v, n]) => `<span>${n} <span class="badge ${esc(v)}">${esc(v)}</span></span>`).join("")}</p>
  <p class="note">${entries.length} report(s). Verdicts at or above ${esc(failOn)} fail the run.</p>
  <div class="table"><table><thead><tr><th>Scenario</th><th>Agent</th><th>Verdict</th><th>Trials</th><th>Deciding rule</th><th>Reason</th></tr></thead>
  <tbody>${rows}</tbody></table></div>
</main>
</body>
</html>
`;
}

/** Quotes a command-line argument when it holds characters a shell would interpret. */
function shellQuote(arg: string): string {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}
