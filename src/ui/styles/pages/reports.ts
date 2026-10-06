/** Styles of the pages for: Reports, the report timeline, and the baseline. */
const REPORTS_LIST_CSS = `
  .rl-bar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:10px; }
  .rl-bar .search { flex:1 1 260px; max-width:420px; }
  .rl-chips { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-bottom:12px; }
  .rl-chip { display:inline-flex; align-items:center; gap:6px; height:24px; padding:0 4px 0 9px; border:1px solid var(--border-2); border-radius:var(--r-full); background:var(--surface); color:var(--fg-2); font-size:11.5px; }
  .rl-chip b { color:var(--fg); font-weight:600; }
  .rl-chip .icon-btn { width:18px; height:18px; border-radius:50%; }
  .rl-count { color:var(--muted); font-size:12px; }
  .rl-count b { color:var(--fg); }
  .rl-src { display:inline-flex; align-items:center; gap:5px; color:var(--muted); font-size:11.5px; white-space:nowrap; }
  .rl-src .i { color:var(--faint); }
  .rl-reason { display:-webkit-box; max-width:440px; overflow:hidden; color:var(--muted); font-size:11.5px; line-height:1.45; -webkit-box-orient:vertical; -webkit-line-clamp:2; }
  .dt .link-mono { white-space:nowrap; }
  .rl-selbar { display:flex; align-items:center; gap:10px; min-height:40px; margin-bottom:10px; padding:6px 12px; border:1px solid var(--border-2); border-radius:var(--r-md); background:var(--surface-2); font-size:12.5px; }
  .rl-selbar[hidden] { display:none; }
  .rl-selbar b { font-weight:600; }
  .rl-mix { margin:-4px 0 16px; }
  .rl-toggle { height:28px; padding:0 8px 0 10px; border-radius:var(--r-xs); cursor:pointer; }
  .rl-toggle:hover { border-color:var(--border-3); background:var(--surface-2); }
  .rl-toggle.on { border-color:var(--ink); background:var(--ink); color:var(--on-ink); }
  .rl-toggle.on .seg-count { background:transparent; color:inherit; }
  .row-actions { width:1%; text-align:right; }
`;

const REPORT_DETAIL_CSS = `
  .rd-callouts { display:flex; flex-direction:column; gap:10px; margin-bottom:16px; }
  .rd-lines { margin:0; padding:0; list-style:none; font-size:12.5px; line-height:1.55; }
  .rd-world { display:inline-flex; align-items:center; gap:5px; }
  .rd-sub { margin:16px 0 6px; color:var(--muted); font:500 10.5px var(--font-mono); letter-spacing:.06em; text-transform:uppercase; }
  .rd-sub:first-child { margin-top:0; }
  .rd-why { display:flex; flex-direction:column; gap:10px; padding:16px 18px; border-left:3px solid var(--v, var(--border-2)); }
  .rd-why-head { display:flex; flex-wrap:wrap; align-items:center; gap:10px; }
  .rd-why-head .eyebrow { display:inline-flex; align-items:center; gap:6px; margin:0; }
  .rd-why-reason { margin:0; color:var(--fg); font-size:15px; line-height:1.5; }
  .rd-why-rule { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
  .rd-why-rule .label { color:var(--muted); font-size:11.5px; }
  .rd-topic { color:var(--muted); font-size:11.5px; }
  .rd-advice { display:flex; align-items:flex-start; gap:8px; margin:0; padding:9px 11px; border-radius:var(--r-sm); background:var(--surface-2); color:var(--fg-2); font-size:12.5px; line-height:1.5; }
  .rd-advice .i { flex:none; margin-top:2px; color:var(--degr-fg); }
  .rd-meaning { margin:0; color:var(--muted); font-size:12px; line-height:1.5; }
  .rd-meaning b { color:var(--fg-2); font-weight:600; }
  .rd-trialbar { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
  .rd-trialbar .eyebrow { margin-right:4px; }
  .rd-trialbar.compact { flex:none; }
  .rd-tchip { display:inline-flex; align-items:center; gap:6px; height:26px; padding:0 9px; border:1px solid var(--border-2); border-radius:var(--r-xs); background:var(--surface); color:var(--fg-2); font:500 11.5px var(--font-mono); cursor:pointer; }
  .rd-tchip:hover { border-color:var(--border-3); background:var(--surface-2); }
  .rd-tchip.on { border-color:var(--v); background:var(--v-bg); color:var(--v-fg); }
  .rd-trial-select { display:inline-flex; align-items:center; gap:8px; }
  .rd-trial-select .input { width:auto; min-width:220px; }
  .rd-findings, .rd-trials, .rd-assertions, .rd-effects, .rd-evidence { margin:0; padding:0; list-style:none; }
  .rd-finding { padding:12px 16px; border-left:3px solid var(--v, var(--border-2)); }
  .rd-finding + .rd-finding { border-top:1px solid var(--border); }
  .rd-finding-head { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
  .rd-finding p { margin:6px 0 0; color:var(--fg-2); font-size:12.5px; line-height:1.55; }
  .rd-evidence { margin-top:8px; display:flex; flex-direction:column; gap:4px; }
  .rd-evidence li { display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 8px; color:var(--muted); font-size:12px; }
  .rd-ev-kind { color:var(--faint); font:500 10px var(--font-mono); letter-spacing:.05em; text-transform:uppercase; }
  .rd-ev-text { color:var(--fg-2); }
  .rd-callref { display:inline-flex; align-items:center; height:18px; padding:0 6px; border:1px solid var(--border-2); border-radius:var(--r-xs); background:var(--surface-2); color:var(--fg-2); font:500 10.5px var(--font-mono); text-decoration:none; }
  .rd-callref:hover { border-color:var(--ink); color:var(--fg); }
  .rd-outcome-line { display:flex; flex-wrap:wrap; align-items:center; gap:8px; font-size:12.5px; line-height:1.5; }
  .rd-assertions { margin-top:12px; border-top:1px solid var(--border); }
  .rd-assertions li { display:flex; align-items:flex-start; gap:10px; padding:9px 0; border-bottom:1px solid var(--border); font-size:12.5px; }
  .rd-assertions li:last-child { border-bottom:0; padding-bottom:0; }
  .rd-assertions .chip { flex:none; margin-top:1px; }
  .chip.missing { border-color:var(--degr-bd); background:var(--warn-bg); color:var(--warn-fg); }
  .rd-assert { display:flex; flex-direction:column; gap:2px; min-width:0; }
  .rd-assert .muted { font-size:11.5px; }
  .rd-pair { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:20px; }
  .rd-answer { margin:0; padding:10px 12px; border-left:3px solid var(--border-3); background:var(--surface-2); color:var(--fg); font-size:13px; line-height:1.6; white-space:pre-wrap; overflow-wrap:anywhere; }
  .rd-effects li { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:6px 12px; padding:7px 0; border-bottom:1px solid var(--border); }
  .rd-effects li:last-child { border-bottom:0; }
  .rd-refs { display:inline-flex; gap:4px; }
  .rd-change { display:block; font:12px/1.55 var(--font-mono); overflow-wrap:anywhere; }
  .rd-change.add { color:var(--add); }
  .rd-change.chg { color:var(--chg); }
  .rd-change.del { color:var(--del); }
  .rd-changes { display:flex; flex-direction:column; gap:2px; padding:8px 10px; border-radius:var(--r-sm); background:var(--sunken); }
  .rd-json { max-height:260px; margin:0; font:11.5px/1.55 var(--font-mono); }
  .rd-json.rd-err { color:var(--bad-fg); }
  .rd-trials { margin-top:14px; border-top:1px solid var(--border); }
  .rd-trial { display:flex; align-items:center; gap:10px; width:100%; padding:8px 0; border:0; border-bottom:1px solid var(--border); background:none; color:inherit; font:inherit; text-align:left; cursor:pointer; }
  .rd-trial:hover .rd-trial-name, .rd-trial.on .rd-trial-name { color:var(--fg); text-decoration:underline; text-underline-offset:3px; }
  .rd-trial-name { flex:none; color:var(--fg-2); font-size:12px; }
  .rd-trial-reason { min-width:0; overflow:hidden; color:var(--muted); font-size:11.5px; text-overflow:ellipsis; white-space:nowrap; }
  .rd-expect { margin:0; padding:0; list-style:none; }
  .rd-expect li { padding:1px 0; }
  .rd-cmds { display:flex; flex-direction:column; gap:8px; }
  .rd-cmd { display:flex; align-items:center; gap:6px; padding:4px 4px 4px 10px; border:1px solid var(--border); border-radius:var(--r-sm); background:var(--sunken); }
  .rd-cmd code { flex:1; min-width:0; overflow:hidden; font-size:11.5px; text-overflow:ellipsis; white-space:nowrap; }
  .rd-note { margin:10px 0 0; line-height:1.5; }
  .rd-none { margin:0; }
  .rd-raw-note { padding:12px 16px 0; }
  .rd-st { display:inline-flex; align-items:center; height:18px; padding:0 6px; border:1px solid var(--border-2); border-radius:var(--r-xs); color:var(--muted); font:500 10.5px var(--font-mono); white-space:nowrap; }
  .rd-st.committed { border-color:var(--ssucc-bd); background:var(--ok-bg); color:var(--ok-fg); }
  .rd-st.dedup { border-color:var(--inc-bd); background:var(--info-bg); color:var(--info-fg); }
  .rd-st.off { background:var(--surface-2); }

  .tl-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin-bottom:12px; }
  .tl-toolbar .search { flex:1 1 220px; max-width:340px; }
  .tl-keys { display:inline-flex; align-items:center; gap:4px; }
  .tl-body { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.15fr); gap:16px; align-items:start; }
  .tl.expanded .tl-body { grid-template-columns:minmax(0,1fr); }
  .tl-col { padding:6px 0; border:1px solid var(--border); border-radius:var(--r-md); background:var(--surface); }
  .tl-side { position:sticky; top:72px; max-height:calc(100vh - 96px); padding:16px; overflow:auto; border:1px solid var(--border); border-radius:var(--r-md); background:var(--surface); }
  .tl-list { position:relative; margin:0; padding:0; list-style:none; }
  .tl-list::before { content:""; position:absolute; top:18px; bottom:18px; left:31px; width:1px; background:var(--border-2); }
  .tl-row { position:relative; display:grid; grid-template-columns:20px 26px minmax(0,1fr) auto; align-items:center; gap:8px; width:100%; min-height:48px; padding:7px 14px 7px 12px; border:0; background:none; color:inherit; font:inherit; text-align:left; cursor:pointer; }
  .tl-row:hover { background:var(--surface-2); }
  .tl-call.on > .tl-row { background:var(--surface-3); box-shadow:inset 3px 0 0 var(--ink); }
  .tl-call.faulted > .tl-row { box-shadow:inset 3px 0 0 var(--fault); }
  .tl-call.on.faulted > .tl-row { background:var(--fault-bg); }
  .tl-node { z-index:1; width:11px; height:11px; margin-left:4px; border:2px solid var(--border-3); border-radius:50%; background:var(--surface); }
  .tl-call.committed .tl-node { border-color:var(--ssucc); background:var(--ssucc); }
  .tl-call.faulted .tl-node { border-color:var(--fault); background:var(--fault-bg); }
  .tl-call.committed.faulted .tl-node { background:var(--fault); }
  .tl-call.failed .tl-node { border-color:var(--harm); }
  .tl-node.final { flex:none; margin-top:3px; border-color:var(--ink); background:var(--ink); }
  .tl-seq { color:var(--faint); font:500 10.5px var(--font-mono); text-align:right; }
  .tl-main { display:flex; flex-direction:column; gap:3px; min-width:0; }
  .tl-tool { display:flex; align-items:baseline; gap:5px; }
  .tl-tool code { background:none; padding:0; color:var(--fg); font:600 12.5px var(--font-mono); }
  .tl-n { color:var(--muted); font:500 11px var(--font-mono); }
  .tl-sub { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
  .tl-changes { color:var(--muted); font-size:11px; }
  .tl-marks { display:inline-flex; align-items:center; gap:6px; }
  .tl-fault { display:inline-flex; align-items:center; gap:4px; height:20px; padding:0 6px; border:1px solid var(--fault-bd); border-radius:var(--r-xs); background:var(--fault-bg); color:var(--fault-fg); font:500 10.5px var(--font-mono); white-space:nowrap; }
  .tl-ok { color:var(--faint); font:500 10.5px var(--font-mono); }
  .tl-err { display:inline-flex; align-items:center; height:20px; padding:0 6px; border:1px solid var(--harm-bd); border-radius:var(--r-xs); background:var(--bad-bg); color:var(--bad-fg); font:500 10.5px var(--font-mono); }
  .tl-cite { display:inline-flex; color:var(--ink); }
  .tl-inline { margin:0 14px 10px 54px; padding:14px; border:1px solid var(--border); border-radius:var(--r-sm); background:var(--surface-2); }
  .tl-final { display:flex; gap:12px; margin:6px 14px 8px 15px; padding:12px 0 6px; border-top:1px solid var(--border); }
  .tl-final .grow { min-width:0; }
  .tl-empty { padding:12px; }
  .tl-insp-head { display:flex; align-items:flex-start; gap:10px; margin-bottom:12px; }
  .tl-insp-title { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
  .tl-insp-title code { background:none; padding:0; font:600 14px var(--font-mono); }
  .tl-fault-note { display:flex; gap:10px; margin-bottom:12px; padding:10px 12px; border:1px solid var(--fault-bd); border-radius:var(--r-sm); background:var(--fault-bg); color:var(--fault-fg); font-size:12.5px; }
  .tl-fault-note .i { flex:none; margin-top:2px; }
  .tl-fault-note p { margin:2px 0 0; color:var(--fg-2); font-size:12px; line-height:1.5; }
  .tl-grid { display:grid; grid-template-columns:minmax(0,1fr); gap:0; }
  .tl-grid .rd-sub { margin-top:12px; }
  .tl-grid section:first-child .rd-sub { margin-top:0; }
  .tl-cites { margin:0; padding:0; list-style:none; }
  .tl-cites li { padding:8px 10px; border-left:3px solid var(--v); background:var(--surface-2); }
  .tl-cites li + li { margin-top:6px; }
  .tl-cites p { margin:4px 0 0; color:var(--fg-2); font-size:12px; line-height:1.5; }
  .tl-snap { margin-top:14px; }
  .tl-snap summary { display:flex; align-items:center; gap:6px; color:var(--muted); font-size:12px; cursor:pointer; }
  .tl-snap[open] summary .i { transform:rotate(90deg); }
  .tl-snap .code-view { margin-top:8px; border:1px solid var(--border); border-radius:var(--r-sm); }

  .st-scrub { display:flex; flex-direction:column; gap:10px; margin-bottom:14px; }
  .st-range { width:100%; accent-color:var(--ink); }
  .st-strip { display:flex; flex-wrap:wrap; gap:4px; }
  .st-dot { min-width:26px; height:26px; padding:0 7px; border:1px solid var(--border-2); border-radius:var(--r-xs); background:var(--surface); color:var(--fg-2); font:500 11px var(--font-mono); cursor:pointer; }
  .st-dot:hover { border-color:var(--border-3); background:var(--surface-2); }
  .st-dot.committed { border-color:var(--ssucc-bd); }
  .st-dot.failed { border-color:var(--harm-bd); color:var(--bad-fg); }
  .st-dot.faulted { border-color:var(--fault); color:var(--fault-fg); }
  .st-dot.cited { box-shadow:inset 0 -2px 0 var(--ink); }
  .st-dot.on { border-color:var(--ink); background:var(--ink); color:var(--on-ink); }
  .st-step-head { display:flex; flex-wrap:wrap; align-items:flex-start; gap:10px; margin-bottom:12px; }
  .st-step-title { display:flex; flex-wrap:wrap; align-items:center; gap:8px; color:var(--fg); font-size:13.5px; font-weight:600; }
  .st-summary { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-top:6px; }
  .st-engine { margin-bottom:12px; }
  .st-coll { margin-top:14px; border:1px solid var(--border); border-radius:var(--r-sm); overflow:hidden; }
  .st-coll-head { display:flex; flex-wrap:wrap; align-items:center; gap:8px; min-height:34px; padding:6px 12px; border-bottom:1px solid var(--border); background:var(--surface-2); }
  .st-path { color:var(--fg); font:600 12px var(--font-mono); }
  .st-tag { display:inline-flex; align-items:center; height:18px; padding:0 6px; border-radius:var(--r-xs); background:var(--surface-3); color:var(--muted); font:500 10.5px var(--font-mono); white-space:nowrap; }
  .st-tag.added { background:var(--ok-bg); color:var(--add); }
  .st-tag.changed { background:var(--warn-bg); color:var(--chg); }
  .st-tag.removed { background:var(--bad-bg); color:var(--del); }
  .st-none { margin:0; padding:10px 12px; }
  .st-coll .table-wrap { border:0; border-radius:0; }
  .st-coll tr.st-added td { background:var(--ok-bg); }
  .st-coll tr.st-changed td { background:var(--warn-bg); }
  .st-coll tr.st-removed td { background:var(--bad-bg); text-decoration:line-through; text-decoration-color:var(--faint); }
  .st-id { color:var(--fg); font:600 11.5px var(--font-mono); margin-right:6px; }
  .st-idcell { white-space:nowrap; }
  .st-str, .st-lit, .st-json { font:11.5px var(--font-mono); }
  .st-str { color:var(--fg-2); }
  .st-lit { color:var(--fg); }
  .st-cell-chg { padding:1px 3px; border-radius:2px; background:var(--warn-bg); box-shadow:inset 0 0 0 1px var(--degr-bd); }
  .st-values { display:grid; grid-template-columns:max-content minmax(0,1fr); margin:0; padding:2px 12px; }
  .st-values > div { display:contents; }
  .st-values dt, .st-values dd { margin:0; padding:6px 0; border-bottom:1px solid var(--border); }
  .st-values > div:last-child > * { border-bottom:0; }
  .st-values dt { padding-right:20px; color:var(--muted); font:11.5px var(--font-mono); }
  .st-values dd { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
  .st-was { color:var(--muted); font-size:11px; }

  @media (max-width: 1100px) { .tl-body { grid-template-columns:minmax(0,1fr); } .tl-side { position:static; max-height:none; } }
  @media (max-width: 760px) {
    .rd-pair { grid-template-columns:minmax(0,1fr); }
    .tl-row { grid-template-columns:16px 22px minmax(0,1fr); }
    .tl-marks { grid-column:3; flex-wrap:wrap; }
    .tl-inline { margin-left:14px; }
    .tl-toolbar .search { max-width:none; }
    .tl-keys { display:none; }
    .rd-why-reason { font-size:14px; }
  }
`;

const BASELINE_CSS = `
  .bl-gate { display:flex; flex-wrap:wrap; align-items:center; gap:14px 20px; padding:16px 18px; border:1px solid var(--v-bd, var(--border)); border-left:3px solid var(--v, var(--border-3)); border-radius:var(--r-md); background:var(--v-bg, var(--surface)); }
  .bl-gate.passing { --v:var(--ssucc); --v-bd:var(--ssucc-bd); --v-bg:var(--ok-bg); --v-fg:var(--ok-fg); }
  .bl-gate.failing { --v:var(--harm); --v-bd:var(--harm-bd); --v-bg:var(--bad-bg); --v-fg:var(--bad-fg); }
  .bl-gate.incomparable { --v:var(--degr); --v-bd:var(--degr-bd); --v-bg:var(--warn-bg); --v-fg:var(--warn-fg); }
  .bl-gate .i.lead { flex:none; color:var(--v); }
  .bl-gate-main { flex:1 1 320px; min-width:0; }
  .bl-gate-title { margin:0; color:var(--v-fg, var(--fg)); font-size:15px; font-weight:600; }
  .bl-gate-text { margin:3px 0 0; color:var(--fg-2); font-size:12.5px; line-height:1.5; }
  .bl-gate-exit { display:inline-flex; align-items:center; gap:6px; color:var(--muted); font-size:12px; }
  .bl-gate-exit code { color:var(--fg); }
  .bl-change { display:flex; flex-direction:column; gap:3px; }
  .bl-arrow { display:inline-flex; align-items:center; gap:6px; flex-wrap:wrap; }
  .bl-arrow .i { color:var(--faint); }
  .bl-rules { display:flex; flex-wrap:wrap; gap:4px; }
  .bl-rule { display:inline-flex; align-items:center; gap:3px; height:18px; padding:0 6px; border-radius:var(--r-xs); font:500 10.5px var(--font-mono); }
  .bl-rule.add { background:var(--bad-bg); color:var(--bad-fg); }
  .bl-rule.del { background:var(--ok-bg); color:var(--ok-fg); }
  .bl-pick { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
  .bl-pick .input { width:auto; min-width:220px; }
  .bl-tabs { margin-bottom:12px; }
  .bl-path { display:flex; align-items:center; gap:6px; min-width:0; }
  .bl-path code { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
`;

export const REPORTS_CSS = [REPORTS_LIST_CSS, REPORT_DETAIL_CSS, BASELINE_CSS].join("\n");
