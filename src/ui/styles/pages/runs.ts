/** Styles of the pages for: Runs, run detail and compare, the launcher, sweeps, and the guided demo. */
export const RUNS_CSS = `
  .run-status { display:inline-flex; align-items:center; justify-content:center; color:var(--faint); }
  .run-status.ok { color:var(--ok-fg); } .run-status.bad { color:var(--bad-fg); } .run-status.draft { color:var(--accent-fg); }
  .dt .link-mono { white-space:nowrap; }
  .dt .scope { color:var(--fg-2); font-size:12px; white-space:nowrap; }
  .dt .actor { display:inline-flex; align-items:center; gap:6px; min-width:0; }
  .dt .actor .clip { max-width:110px; }
  .job-row .job-progress { display:flex; align-items:center; gap:8px; width:170px; }
  .job-row .job-progress .progress { flex:1; }
  .job-row .job-progress .mono { color:var(--muted); font-size:11.5px; }
  .gap-16 { gap:16px; } .mb-8 { margin-bottom:8px; } .mt-8 { margin-top:8px; } .mt-12 { margin-top:12px; } .mt-24 { margin-top:24px; }
  .mb-16 { margin-bottom:16px; }

  .matrix-wrap { max-height:calc(100vh - var(--topbar, 48px) - 180px); overflow:auto; background:var(--surface); }
  .matrix { width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; }
  .matrix thead th { position:sticky; top:0; z-index:2; height:auto; padding:10px 12px; border-bottom:1px solid var(--border); background:var(--surface-2); vertical-align:top; text-transform:none; letter-spacing:0; }
  .matrix .matrix-corner { left:0; z-index:3; width:230px; border-right:1px solid var(--border); color:var(--muted); font:500 10.5px/1.3 var(--font-mono); letter-spacing:.06em; text-transform:uppercase; }
  .matrix tbody th { position:sticky; left:0; z-index:1; height:auto; padding:8px 12px; border-right:1px solid var(--border); border-bottom:1px solid var(--border); background:var(--surface); font-weight:400; letter-spacing:0; text-align:left; text-transform:none; white-space:normal; vertical-align:top; }
  .matrix tbody th a { color:var(--fg); font:500 12px/1.4 var(--font-mono); text-decoration:none; overflow-wrap:anywhere; }
  .matrix tbody th a:hover { color:var(--accent-fg); text-decoration:underline; text-underline-offset:3px; }
  .matrix tbody th .exp-sum { display:flex; margin-top:4px; }
  .matrix td { height:1px; padding:6px; border-bottom:1px solid var(--border); vertical-align:top; }
  .matrix tbody tr:last-child > * { border-bottom:0; }
  .matrix .col-head { display:flex; flex-direction:column; gap:6px; min-width:0; }
  .matrix .col-head .link-mono { overflow:hidden; font-weight:600; text-overflow:ellipsis; white-space:nowrap; }
  .matrix .col-head .vbar { max-width:150px; }
  .cell { display:flex; flex-direction:column; align-items:flex-start; gap:5px; height:100%; padding:7px 9px; border:1px solid var(--border); border-radius:var(--r-sm); color:inherit; text-decoration:none; transition:border-color var(--t-fast), background var(--t-fast); }
  a.cell:hover { border-color:var(--border-3); background:var(--surface-2); }
  .cell.mismatch { border-color:var(--harm); }
  .cell.is-flaky { border-color:var(--degr); }
  .cell-top { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
  .cell .why { display:block; max-width:100%; overflow:hidden; color:var(--fg-2); font-size:12px; line-height:1.4; text-overflow:ellipsis; white-space:nowrap; }
  .cell .cell-meta { display:flex; flex-wrap:wrap; gap:2px 10px; color:var(--muted); font-size:11px; }
  .cell .cell-meta code { color:var(--muted); font-size:11px; }
  .cell-empty { display:block; padding:7px 9px; color:var(--faint); font-size:12px; }
  .trials { display:flex; align-items:center; gap:8px; width:100%; margin-top:auto; color:var(--muted); font-size:11px; }
  .trials.flaky { color:var(--warn-fg); font-weight:500; }
  .trial-bar { display:flex; flex:1; gap:1px; max-width:96px; height:4px; overflow:hidden; border-radius:2px; }
  .trial-bar i { min-width:2px; background:var(--v); }
  #matrix[data-filter=unexpected] tr[data-unexpected="0"], #matrix[data-filter=flaky] tr[data-flaky="0"] { display:none; }
  #matrix[data-filter=unexpected] .cell:not(.mismatch), #matrix[data-filter=flaky] .cell:not(.is-flaky) { opacity:.4; }
  #matrix[data-density=detailed] .cell .why { display:-webkit-box; white-space:normal; -webkit-line-clamp:4; -webkit-box-orient:vertical; }

  .lm-wrap { overflow:auto; }
  .lm { width:100%; border-collapse:separate; border-spacing:0; }
  .lm th { height:auto; padding:8px 10px; border-bottom:1px solid var(--border); background:var(--surface-2); text-transform:none; letter-spacing:0; white-space:nowrap; }
  .lm tbody th { position:sticky; left:0; background:var(--surface); text-align:left; font-weight:400; }
  .lm td { padding:5px; border-bottom:1px solid var(--border); text-align:center; }
  .lm tbody tr:last-child > * { border-bottom:0; }
  .lm .lm-corner { left:0; z-index:1; color:var(--muted); font:500 10.5px var(--font-mono); letter-spacing:.06em; text-align:left; text-transform:uppercase; }
  .lm-agent, .lm-scenario { display:block; max-width:200px; overflow:hidden; color:var(--fg); font:500 12px var(--font-mono); text-overflow:ellipsis; }
  .lm-cell { display:inline-flex; align-items:center; justify-content:center; min-width:44px; height:26px; padding:0 8px; border:1px solid var(--v-bd, var(--border)); border-radius:var(--r-sm); background:var(--v-bg, transparent); color:var(--v-fg, var(--muted)); font:600 11px var(--font-mono); text-decoration:none; animation:rise-in .3s var(--ease) both; }
  a.lm-cell:hover { border-color:var(--v); }
  .lm-cell.mismatch { outline:1.5px solid var(--harm); outline-offset:1px; }
  .lm-cell.pending { border:1px dashed var(--border-2); background:transparent; animation:none; }
  .lm-cell.running { border-color:var(--accent-line); background:var(--accent-soft); color:var(--accent-fg); animation:none; }
  .lm-cell.none { border:0; background:var(--surface-3); opacity:.5; animation:none; }
  .lm-cell.failed { border-color:var(--harm-bd); background:var(--bad-bg); color:var(--bad-fg); }
  .lm-cell .spinner { width:12px; height:12px; }
  .hm-cell.hm-running .spinner { width:12px; height:12px; }

  .regen-sum { margin:8px 0 0; }
  .regen-list { margin-top:8px; border:1px solid var(--border); border-radius:var(--r-sm); background:var(--surface); }
  .regen-pair { display:inline-flex; align-items:center; gap:6px; }
  .base-stat { display:inline-flex; flex-direction:column; gap:2px; min-width:96px; color:var(--muted); font-size:11.5px; }
  .base-stat b { color:var(--fg); font-size:20px; font-weight:600; letter-spacing:-.02em; }
  .base-stat.bad b { color:var(--bad-fg); } .base-stat.ok b { color:var(--ok-fg); }
  .cmd-block { position:relative; }
  .cmd-block pre { margin:0; padding:12px 84px 12px 14px; overflow-x:auto; border:1px solid var(--border); border-radius:var(--r-sm); background:var(--sunken); font:12px/1.65 var(--font-mono); white-space:pre; word-break:normal; }
  .cmd-block .btn { position:absolute; top:6px; right:6px; }
  .cmd-block + .cmd-block { margin-top:8px; }

  .cmp-runs { display:grid; grid-template-columns:minmax(0,1fr) auto minmax(0,1fr); align-items:stretch; gap:12px; margin-bottom:16px; }
  .cmp-card { display:flex; flex-direction:column; gap:8px; min-width:0; padding:14px 16px; border:1px solid var(--border); border-radius:var(--r-md); background:var(--surface); }
  .cmp-title { overflow:hidden; color:var(--fg); font-size:14px; font-weight:600; text-decoration:none; text-overflow:ellipsis; white-space:nowrap; }
  .cmp-title:hover { text-decoration:underline; text-underline-offset:3px; }
  .cmp-sub { color:var(--muted); font-size:12px; }
  .cmp-arrow { display:flex; align-items:center; color:var(--faint); }
  .diff-cell { display:inline-flex; flex-wrap:wrap; align-items:center; gap:6px 8px; color:inherit; text-decoration:none; }
  .diff-cell:hover .badge { border-color:var(--v); }

  .launch-grid, .sweep-grid { display:grid; grid-template-columns:minmax(0,1fr) 340px; gap:16px; align-items:start; }
  .launch-main, .sweep-main { display:flex; flex-direction:column; gap:16px; min-width:0; }
  .launch-side, .sweep-side { position:sticky; top:16px; min-width:0; }
  .pick-tools { display:flex; flex-wrap:wrap; gap:8px; padding:12px 16px; border-bottom:1px solid var(--border); }
  .pick-tools .search { flex:1; min-width:180px; }
  .pick-list, .agent-grid { margin:0; padding:0; list-style:none; }
  .pick-list { max-height:380px; overflow:auto; }
  .pick-list > li + li { border-top:1px solid var(--border); }
  .pick-row { display:flex; align-items:center; gap:12px; min-height:46px; padding:8px 16px; cursor:pointer; }
  .pick-row:hover { background:var(--surface-2); }
  .pick-row:has(input:checked) { background:var(--accent-soft); }
  .pick-check { display:inline-flex; flex:none; }
  .pick-body { display:flex; flex:1; flex-direction:column; gap:2px; min-width:0; }
  .pick-title { overflow:hidden; color:var(--fg); font-size:12.5px; font-weight:500; text-overflow:ellipsis; white-space:nowrap; }
  .pick-title.mono { font-family:var(--font-mono); font-size:12px; }
  .pick-sub { overflow:hidden; color:var(--muted); font-size:11.5px; text-overflow:ellipsis; white-space:nowrap; }
  .pick-meta { display:flex; flex:none; align-items:center; gap:10px; }
  #launch-agents.is-off { opacity:.5; pointer-events:none; }
  .agent-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:8px; }
  .agent-grid .pick-row { border:1px solid var(--border); border-radius:var(--r-sm); background:var(--surface); }
  .agent-grid .pick-row:has(input:checked) { border-color:var(--ink); background:var(--accent-soft); }
  .opt-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); gap:16px; }
  .sweep-fields { grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); }
  .sweep-fields > .field:first-child { grid-column:span 2; }
  .opt-grid .stepper { width:max-content; }
  .plan-numbers { display:flex; align-items:flex-end; gap:12px; }
  .plan-numbers div { display:flex; flex-direction:column; gap:2px; }
  .plan-numbers b { color:var(--fg); font-size:26px; font-weight:600; letter-spacing:-.02em; line-height:1; }
  .plan-numbers span { color:var(--muted); font:500 10.5px var(--font-mono); letter-spacing:.06em; text-transform:uppercase; }
  .plan-numbers .plan-x { padding-bottom:4px; color:var(--faint); font-size:14px; }
  .plan-total { margin:12px 0; color:var(--fg-2); font-size:12.5px; }
  .plan-total b { color:var(--fg); font-family:var(--font-mono); }
  .plan-why { display:flex; align-items:flex-start; gap:6px; margin:0 0 12px; color:var(--warn-fg); font-size:12.5px; }
  .plan-why .i { flex:none; margin-top:2px; }
  .plan-cmd { display:flex; flex-direction:column; gap:6px; margin-bottom:14px; }
  .plan-cmd .cmd-block pre { max-height:190px; padding:10px 12px; white-space:pre-wrap; word-break:break-all; }
  .plan-cmd .cmd-block .btn { position:static; margin-top:6px; }
  .chosen-row { display:flex; flex-wrap:wrap; align-items:center; gap:6px 8px; padding:10px 16px; border-bottom:1px solid var(--border); }
  .chosen-row .tag { gap:4px; }
  .tag-x { display:inline-flex; padding:0; border:0; background:none; color:inherit; cursor:pointer; }
  .plan-actions { display:flex; flex-direction:column; gap:8px; }
  .plan-actions p { margin:0; }

  .live-head { display:flex; flex-wrap:wrap; align-items:center; gap:12px 20px; }
  .live-count { display:flex; flex-direction:column; min-width:96px; }
  .live-count b { color:var(--fg); font-size:28px; font-weight:600; letter-spacing:-.02em; line-height:1; }
  .live-count span { margin-top:4px; color:var(--muted); font-size:11.5px; }
  .live-head .grow { flex:1; min-width:200px; }
  .live-sub { display:flex; flex-wrap:wrap; gap:4px 16px; margin-top:8px; color:var(--muted); font-size:12px; }
  .live-bar { flex-basis:100%; }
  .live-wait { display:flex; align-items:center; gap:8px; padding:20px 16px; color:var(--muted); font-size:12.5px; }
  .live-feed .list-row { min-height:40px; }

  .kind-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:8px; margin:0; padding:0; list-style:none; }
  .kind-opt { display:flex; align-items:center; gap:10px; min-height:38px; padding:6px 12px; border:1px solid var(--border); border-radius:var(--r-sm); background:var(--surface); cursor:pointer; }
  .kind-opt:hover { border-color:var(--border-3); }
  .kind-opt:has(input:checked) { border-color:var(--ink); background:var(--accent-soft); }
  .kind-opt.is-disabled { background:var(--surface-2); cursor:not-allowed; opacity:.6; }
  .kind-name { flex:1; overflow:hidden; color:var(--fg); font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
  .kind-stage { color:var(--muted); font:400 10.5px var(--font-mono); }
  .kind-rows { display:flex; flex-direction:column; margin:0; padding:0; list-style:none; }
  .kind-rows li { display:grid; grid-template-columns:minmax(0,1.2fr) minmax(60px,1fr) auto; align-items:center; gap:4px 12px; min-height:34px; }
  .kind-rows li + li { border-top:1px solid var(--border); }
  .kr-name { overflow:hidden; color:var(--fg); font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
  .kr-num { font:500 11px var(--font-mono); white-space:nowrap; }
  .kr-num + .kr-num { grid-column:3; }
  .base-row { display:flex; flex-wrap:wrap; align-items:center; gap:10px; }
  .past .section-head { margin-bottom:10px; }

  .demo-steps { display:flex; flex-wrap:wrap; gap:6px 0; margin:0 0 16px; padding:0; list-style:none; counter-reset:ds; }
  .demo-steps li { display:flex; align-items:center; gap:8px; margin-right:8px; color:var(--muted); font-size:12.5px; font-weight:500; }
  .demo-steps li + li::before { content:""; width:32px; height:1px; margin-right:8px; background:var(--border-3); }
  .ds-n { display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border:1px solid var(--border-3); border-radius:var(--r-sm); font:600 11px var(--font-mono); }
  .demo-steps li.done { color:var(--fg-2); }
  .demo-steps li.done .ds-n { border-color:var(--ink); background:var(--ink); color:var(--on-ink); }
  .demo-steps li.now { color:var(--fg); }
  .demo-steps li.now .ds-n { border-color:var(--accent-solid); background:var(--accent-soft); color:var(--accent-fg); }
  .fault-flow { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:8px; margin:0 0 16px; padding:0; list-style:none; }
  .ff { position:relative; display:flex; flex-direction:column; gap:4px; padding:12px; border:1px solid var(--border); border-radius:var(--r-sm); background:var(--surface-2); }
  .ff-icon { display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; margin-bottom:4px; border-radius:var(--r-sm); background:var(--surface-3); color:var(--muted); }
  .ff.ok .ff-icon { background:var(--ok-bg); color:var(--ok-fg); } .ff.bad .ff-icon { background:var(--bad-bg); color:var(--bad-fg); } .ff.accent .ff-icon { background:var(--accent-soft); color:var(--accent-fg); }
  .ff-title { color:var(--fg); font-size:12.5px; font-weight:600; }
  .ff-text { color:var(--muted); font-size:12px; line-height:1.45; }
  .ff-arrow { position:absolute; top:50%; right:-12px; z-index:1; display:flex; width:16px; height:16px; margin-top:-8px; align-items:center; justify-content:center; background:var(--surface); color:var(--faint); }
  .demo-facts blockquote { margin:0; padding:0 0 0 12px; border-left:2px solid var(--border-3); font-size:13px; line-height:1.5; }
  .demo-grade { margin:0 0 10px; color:var(--fg-2); font-size:12.5px; line-height:1.5; }
  .demo-checks { display:flex; flex-direction:column; gap:8px; margin:0; padding:0; list-style:none; }
  .demo-checks li { display:flex; gap:8px; color:var(--fg-2); font-size:12.5px; line-height:1.45; }
  .demo-checks .i { flex:none; margin-top:2px; color:var(--ok-fg); }
  .lanes { margin:0; padding:0; list-style:none; }
  .lane { display:grid; grid-template-columns:260px minmax(0,1fr) 280px; gap:20px; align-items:start; padding:16px 20px; }
  .lane + .lane { border-top:1px solid var(--border); }
  .lane.done { border-left:3px solid var(--v); padding-left:17px; }
  .lane.fresh { animation:rise-in .5s var(--ease) both; }
  .lane.pending { color:var(--muted); }
  .lane-agent { display:flex; gap:12px; min-width:0; }
  .lane-n { display:inline-flex; flex:none; align-items:center; justify-content:center; width:24px; height:24px; border:1px solid var(--border-3); border-radius:var(--r-sm); color:var(--muted); font:600 11px var(--font-mono); }
  .lane.done .lane-n { border-color:var(--ink); background:var(--ink); color:var(--on-ink); }
  .lane-who code { color:var(--fg); font-size:13px; font-weight:600; }
  .lane-who p { margin:3px 0 0; color:var(--muted); font-size:12px; line-height:1.45; }
  .lane-wait { display:inline-flex; align-items:center; gap:8px; padding-top:3px; color:var(--faint); font-size:12.5px; }
  .lane.active .lane-wait { color:var(--accent-fg); }
  .calls { display:flex; flex-wrap:wrap; gap:6px; margin:0 0 10px; padding:0; list-style:none; }
  .call { display:inline-flex; align-items:center; gap:8px; height:26px; padding:0 9px; border:1px solid var(--border-2); border-radius:var(--r-sm); background:var(--surface-2); color:var(--fg-2); font-size:11.5px; white-space:nowrap; }
  .call code { color:var(--fg); font-size:11.5px; font-weight:500; }
  .call.committed { border-color:var(--ssucc-bd); }
  .call.failed { border-color:var(--harm-bd); background:var(--bad-bg); color:var(--bad-fg); }
  .call.faulted .i { color:var(--accent-solid); }
  .ledger { display:inline-flex; align-items:center; gap:6px; margin-bottom:10px; color:var(--fg-2); font-size:12.5px; font-weight:500; }
  .ledger.dup { color:var(--bad-fg); }
  .lane-answer { margin:0; padding:0 0 0 12px; border-left:2px solid var(--border-3); color:var(--fg-2); font-size:12.5px; line-height:1.5; }
  .lane-answer .eyebrow { display:block; margin-bottom:3px; }
  .lane-verdict { display:flex; flex-direction:column; align-items:flex-start; gap:8px; min-width:0; }
  .lane-badges { display:flex; align-items:center; gap:8px; }
  .lane-verdict .why { margin:0; color:var(--fg-2); font-size:12.5px; line-height:1.5; }
  .demo-outcome { margin-top:16px; }
  .demo-lead { margin:0 0 12px; color:var(--fg-2); font-size:13px; line-height:1.55; }
  .outcome-list { margin:0; padding:0; list-style:none; }
  .outcome-list li { display:grid; grid-template-columns:150px minmax(0,1fr) minmax(0,auto); align-items:center; gap:4px 16px; min-height:40px; padding:6px 0; }
  .outcome-list li + li { border-top:1px solid var(--border); }
  .oc-text { color:var(--fg-2); font-size:12.5px; }
  .oc-agents { color:var(--muted); font-size:12px; text-align:right; }
  .demo-next { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }

  @media (max-width: 1100px) {
    .launch-grid, .sweep-grid { grid-template-columns:minmax(0,1fr); }
    .launch-side, .sweep-side { position:static; }
    .lane { grid-template-columns:minmax(0,1fr) minmax(0,1fr); }
    .lane-agent { grid-column:1 / -1; }
    .fault-flow { grid-template-columns:repeat(2, minmax(0,1fr)); }
    .ff-arrow { display:none; }
  }
  @media (max-width: 760px) {
    .run-page .panel-head, .sweep-page .panel-head, .launch-page .panel-head { flex-wrap:wrap; }
    .run-page .panel-actions, .sweep-page .panel-actions, .launch-page .panel-actions { flex-wrap:wrap; max-width:100%; margin-left:0; }
    .cmp-runs { grid-template-columns:minmax(0,1fr); }
    .cmp-arrow { justify-content:center; transform:rotate(90deg); }
    .lane { grid-template-columns:minmax(0,1fr); gap:12px; padding:14px 16px; }
    .lane.done { padding-left:13px; }
    .fault-flow { grid-template-columns:minmax(0,1fr); }
    .outcome-list li { grid-template-columns:minmax(0,1fr); }
    .oc-agents { text-align:left; }
    .pick-meta { display:none; }
    .demo-steps li + li::before { width:12px; }
    .job-row .job-progress { width:110px; }
    .matrix .matrix-corner { width:150px; }
  }
`;
