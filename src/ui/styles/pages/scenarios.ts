/** The scenario pages: the library, one scenario, coverage, the catalog, and the editor. */
export const SCENARIOS_CSS = `
  .contents { display:contents; }
  .dt th.sr-col { width:1%; color:transparent; }
  .link-mono { color:var(--fg); font:500 12px var(--font-mono); text-decoration:none; }
  .link-mono:hover { text-decoration:underline; text-underline-offset:3px; }
  .bad-text { color:var(--bad-fg); } .warn-text { color:var(--warn-fg); } .ok-text { color:var(--ok-fg); }

  /* The library */
  .scn-bar { display:flex; flex-direction:column; gap:10px; margin:0 0 14px; }
  .scn-bar-row { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; }
  .scn-bar-row .search { flex:1 1 260px; max-width:420px; }
  .scn-tags { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
  .scn-tags-label { display:inline-flex; align-items:center; gap:4px; margin-right:2px; color:var(--muted); font:500 10.5px var(--font-mono); letter-spacing:.06em; text-transform:uppercase; }
  .tag-n { opacity:.6; font:500 10.5px var(--font-mono); }
  .tag.empty { opacity:.45; }
  .scn-attn { display:inline-flex; align-items:center; gap:6px; margin-left:auto; }
  .scn-attn-n { min-width:20px; padding:0 6px; border-radius:var(--r-full); background:var(--surface-3); color:var(--muted); font:600 10.5px/18px var(--font-mono); text-align:center; }
  .scn-attn-n.on { background:var(--bad-bg); color:var(--bad-fg); }
  .scn-status { display:inline-flex; flex-wrap:wrap; align-items:center; gap:4px 12px; }
  .scn-chip { display:inline-flex; align-items:center; gap:5px; height:22px; padding:0 4px 0 8px; border:1px solid var(--border-2); border-radius:var(--r-full); color:var(--fg-2); font-size:11.5px; }
  .scn-chip-x { display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; border-radius:50%; color:var(--muted); }
  .scn-chip-x:hover { background:var(--surface-3); color:var(--fg); }
  .scn-main { min-width:200px; max-width:320px; }
  .scn-faults { max-width:210px; }
  .scn-faults .fault-tag, .scn-health .health { align-self:flex-start; }
  .scn-more { margin-left:6px; padding:0 5px; border-radius:var(--r-full); background:var(--surface-3); color:var(--muted); font:600 10.5px var(--font-mono); }
  .scn-exp { display:inline-flex; align-items:center; gap:6px; }
  .scn-exp b { color:var(--fg-2); font:500 11.5px var(--font-mono); }
  .scn-checks { white-space:normal; min-width:110px; max-width:150px; font-size:12px; }
  .scn-health { min-width:150px; }
  .scn-attn-row td:first-child { box-shadow:inset 2px 0 0 var(--bad); }
  .scn-bulk:empty { display:none; }
  .health { display:inline-flex; align-items:center; gap:8px; min-width:120px; }
  .health .vbar { flex:1; }
  .health b { min-width:34px; color:var(--fg-2); font:500 11.5px var(--font-mono); text-align:right; }
  .health.attn b { color:var(--bad-fg); }

  /* What a fault does to a call */
  .stg { display:inline-flex; align-items:center; max-width:100%; margin:8px 0 2px; font:500 10.5px var(--font-mono); }
  .stg-node { display:inline-flex; align-items:center; gap:4px; height:22px; padding:0 8px; border:1px solid var(--border-2); border-radius:var(--r-xs); background:var(--surface); color:var(--fg-2); white-space:nowrap; }
  .stg-node.off { border-style:dashed; color:var(--faint); }
  .stg-node.commits { border-color:var(--ink); color:var(--fg); }
  .stg-node.faulted { border-color:var(--fault-bd); background:var(--fault-bg); color:var(--fault-fg); }
  .stg-node.twice b { color:var(--fault-fg); }
  .stg-link { position:relative; display:inline-flex; align-items:center; justify-content:center; width:34px; height:22px; color:var(--fault); }
  .stg-link::before { content:""; position:absolute; left:0; right:0; top:50%; border-top:1px solid var(--border-3); }
  .stg-link.hit::before { border-top-color:var(--fault); }
  .stg-link .i { position:relative; padding:0 2px; background:var(--surface); }

  /* One scenario */
  .sd-sec + .sd-sec { margin-top:16px; }
  .sd-sec-title { display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 10px; margin:0 0 8px; color:var(--fg); font:600 12px var(--font-sans); letter-spacing:0; }
  .sd-sec-title span { color:var(--muted); font-weight:400; }
  .sd-task { margin:0; padding:10px 14px; border-left:2px solid var(--ink); background:var(--surface-2); color:var(--fg); font-size:13.5px; line-height:1.55; }
  .sd-setup { margin-top:14px; }
  .sd-setup-label { display:block; margin-bottom:6px; color:var(--muted); font:500 10.5px var(--font-mono); letter-spacing:.06em; text-transform:uppercase; }
  .sd-setup ul, .sd-effects, .sd-list, .sd-policies, .sd-strikes { margin:0; padding:0; list-style:none; }
  .sd-setup li, .sd-effects li { display:flex; flex-wrap:wrap; align-items:center; gap:4px 10px; padding:6px 0; }
  .sd-setup li + li, .sd-effects li + li { border-top:1px solid var(--border); }
  .sd-setup-id, .sd-rec code, .sd-call { font:500 12px var(--font-mono); color:var(--fg); }
  .sd-rec { display:inline-flex; align-items:center; gap:6px; color:var(--muted); }
  .sd-conds { display:inline-flex; flex-wrap:wrap; gap:4px; }
  .sd-cond { padding:1px 6px; border:1px solid var(--border); border-radius:var(--r-xs); background:var(--surface-2); color:var(--muted); font:11.5px var(--font-mono); }
  .sd-cond i { color:var(--fg); font-style:normal; }
  .sd-name { color:var(--fg); font-weight:500; }
  .sd-none { margin:0; color:var(--muted); font-size:12.5px; }
  .sd-outcomes { display:flex; flex-direction:column; gap:10px; }
  .sd-outcome { padding:10px 12px; border:1px solid var(--border); border-radius:var(--r-sm); }
  .sd-outcome-head { display:flex; flex-wrap:wrap; align-items:center; gap:4px 10px; margin-bottom:4px; }
  .sd-list li { display:flex; align-items:flex-start; gap:8px; padding:6px 0; color:var(--fg-2); font-size:12.5px; line-height:1.5; }
  .sd-list li + li { border-top:1px solid var(--border); }
  .sd-list .i { flex:none; margin-top:2px; color:var(--muted); }
  .sd-seq { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin:0 0 14px; padding:0; list-style:none; }
  .sd-seq li { display:inline-flex; align-items:center; gap:6px; padding:3px 8px; border:1px solid var(--border-2); border-radius:var(--r-xs); background:var(--surface-2); font-size:11.5px; }
  .sd-seq li.sd-seq-arrow { padding:0; border:0; background:none; color:var(--faint); }
  .sd-seq-n { color:var(--faint); font:600 10.5px var(--font-mono); }
  .sd-seq b { color:var(--fault-fg); font:600 11px var(--font-mono); }
  .sd-seq em { color:var(--muted); font-style:normal; }
  .sd-strikes { display:flex; flex-direction:column; gap:0; }
  .sd-strike { display:grid; grid-template-columns:24px minmax(0,1fr); gap:12px; padding:14px 0; }
  .sd-strike + .sd-strike { border-top:1px solid var(--border); }
  .sd-strike:first-child { padding-top:0; } .sd-strike:last-child { padding-bottom:0; }
  .sd-strike-n { display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:var(--r-xs); background:var(--ink); color:var(--on-ink); font:600 11px var(--font-mono); }
  .sd-strike-head { display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; }
  .sd-call b { margin-left:8px; color:var(--fault-fg); font-weight:600; }
  .sd-stage { color:var(--muted); font-size:11.5px; }
  .sd-writes { padding:0 6px; border:1px solid var(--border-2); border-radius:var(--r-xs); color:var(--muted); font:500 10px var(--font-mono); letter-spacing:.04em; text-transform:uppercase; }
  .sd-strike-when { margin:6px 0 0; color:var(--muted); font-size:12px; }
  .sd-strike-facts, .cat-fault-facts { display:grid; gap:8px; margin:10px 0 0; }
  .sd-strike-facts > div, .cat-fault-facts > div { display:grid; grid-template-columns:104px minmax(0,1fr); gap:10px; }
  .sd-strike-facts dt, .cat-fault-facts dt { color:var(--muted); font:500 10.5px/1.7 var(--font-mono); letter-spacing:.05em; text-transform:uppercase; }
  .sd-strike-facts dd, .cat-fault-facts dd { margin:0; color:var(--fg-2); font-size:12.5px; line-height:1.5; }
  .sd-policies li { display:grid; grid-template-columns:minmax(0,230px) minmax(0,1fr) auto; align-items:center; gap:10px; padding:8px 0; }
  .sd-policies li + li { border-top:1px solid var(--border); }
  .sd-pol-chip { display:inline-flex; align-items:center; gap:6px; color:var(--fg); }
  .sd-pol-chip code { font:500 11.5px var(--font-mono); } .sd-pol-chip b { color:var(--ok-fg); font:600 11px var(--font-mono); }
  .sd-policies li.off .sd-pol-chip, .sd-policies li.off .sd-pol-text { color:var(--faint); } .sd-policies li.off .sd-pol-chip b { color:var(--faint); }
  .sd-pol-text { color:var(--fg-2); font-size:12px; line-height:1.45; }
  .sd-pol-off { color:var(--faint); font-size:11.5px; }
  .sd-ev { width:100%; }
  .sd-ev-bad td:first-child { box-shadow:inset 2px 0 0 var(--bad); }
  .sd-ev-mark { text-align:center; }
  .sd-health { display:flex; align-items:center; gap:18px; margin-bottom:14px; }
  .sd-trend { display:inline-flex; align-items:center; gap:8px; }
  .sd-agents { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:6px 12px; margin:0 0 14px; padding:0; border:0; }
  .sd-agent { display:flex; align-items:center; justify-content:space-between; gap:6px; min-width:0; }
  .sd-pick { display:inline-flex; gap:2px; }
  .sd-run-opts, .ed-run-opts { display:grid; grid-template-columns:auto minmax(0,1fr); align-items:end; gap:12px; margin:0 0 12px; }
  .sd-run .field-hint, .ed-run .field-hint { margin:10px 0 0; }
  .sd-results-bar { margin-bottom:14px; }
  .sd-trials { display:inline-flex; align-items:center; gap:8px; }
  .sd-row-attn td:first-child { box-shadow:inset 2px 0 0 var(--bad); }
  .sd-feed-results { display:flex; flex-wrap:wrap; gap:4px 8px; margin-top:6px; }
  .sd-feed-result { display:inline-flex; align-items:center; gap:6px; padding:2px 6px; border:1px solid var(--border); border-radius:var(--r-xs); color:var(--fg-2); font-size:11.5px; text-decoration:none; }
  .sd-feed-result:hover { border-color:var(--border-3); background:var(--surface-2); }
  .sd-feed-result.bad { border-color:var(--harm-bd); }
  .sd-more { padding:12px 16px; border-top:1px solid var(--border); text-align:center; }
  .page-tabs { margin:0 0 16px; }

  /* Coverage */
  .cov-wrap { overflow:auto; }
  .cov { width:100%; border-collapse:separate; border-spacing:0; font-size:12px; }
  .cov th, .cov td { padding:0; border-bottom:1px solid var(--border); text-align:center; }
  .cov thead th { background:var(--surface-2); color:var(--muted); font:500 10.5px var(--font-mono); }
  .cov th.cov-kind { position:sticky; left:0; z-index:2; min-width:190px; padding:7px 14px; background:var(--surface); border-right:1px solid var(--border); text-align:left; }
  .cov thead th.cov-kind { z-index:3; background:var(--surface-2); letter-spacing:.06em; text-transform:uppercase; }
  .cov th.cov-kind a { color:var(--fg); text-decoration:none; } .cov th.cov-kind a:hover { text-decoration:underline; text-underline-offset:3px; }
  .cov tbody th.cov-kind { letter-spacing:0; text-transform:none; font-weight:400; }
  .cov th.cov-kind code { font:500 12px var(--font-mono); }
  .cov th.cov-kind small { display:block; margin-top:1px; color:var(--muted); font:400 11px var(--font-sans); }
  .cov th.cov-world { padding:7px 8px; border-left:1px solid var(--border); letter-spacing:.06em; text-transform:uppercase; }
  .cov th.cov-world a { display:inline-flex; align-items:center; gap:5px; color:var(--fg-2); text-decoration:none; } .cov th.cov-world a:hover { color:var(--fg); }
  .cov thead th.cov-tool { letter-spacing:0; text-transform:none; }
  .cov th.cov-tool { height:128px; min-width:30px; padding:6px 0; vertical-align:bottom; font:400 11px var(--font-mono); }
  .cov th.cov-tool span { display:inline-block; color:var(--fg-2); white-space:nowrap; writing-mode:vertical-rl; transform:rotate(180deg); }
  .cov th.cov-tool.none span { color:var(--faint); }
  .cov th.cov-tool i { margin-top:4px; color:var(--fault); font-size:7px; font-style:normal; }
  .cov th.cov-total, .cov td.cov-total { width:1%; min-width:56px; padding:0 12px; border-left:1px solid var(--border); font:500 12px var(--font-mono); }
  .cov td.cov-c { width:34px; min-width:34px; height:34px; padding:3px; }
  .cov-n, .cov-add { display:flex; align-items:center; justify-content:center; width:100%; height:100%; min-height:26px; border-radius:var(--r-xs); text-decoration:none; }
  .cov-n { background:color-mix(in srgb, var(--fault) var(--a), var(--surface-3)); color:var(--on-accent); font:600 11px var(--font-mono); }
  .cov-n:hover { box-shadow:0 0 0 1.5px var(--fg); }
  .cov-add { color:transparent; }
  .cov tr:hover .cov-add, .cov-add:focus-visible { background:var(--surface-3); color:var(--muted); }
  .cov-add:hover { background:var(--accent-soft); color:var(--accent-fg); }
  .cov tr.unused th.cov-kind code { color:var(--muted); }
  .cov tr.cov-foot th, .cov tr.cov-foot td { border-bottom:0; background:var(--surface-2); color:var(--muted); font:500 11px var(--font-mono); }
  .cov tr.cov-foot th.cov-kind { background:var(--surface-2); font-family:var(--font-sans); }
  .cov tr.cov-foot a { color:var(--fg-2); text-decoration:none; } .cov tr.cov-foot a:hover { color:var(--fg); text-decoration:underline; }
  .cov-toggle { display:inline-flex; align-items:center; }
  .cov-legend { display:inline-flex; align-items:center; gap:6px; margin-right:16px; }
  .cov-legend b { color:var(--fault); font-size:8px; }
  .cov-sw { width:12px; height:12px; border-radius:2px; }
  .cov-sw.n { background:color-mix(in srgb, var(--fault) 55%, var(--surface-3)); }
  .cov-sw.add { border:1px dashed var(--border-3); }
  .gaps { display:flex; flex-direction:column; gap:18px; }
  .gap h3 { display:flex; align-items:center; gap:8px; margin:0; color:var(--fg); font:600 12.5px var(--font-sans); letter-spacing:0; }
  .gap-n { padding:0 6px; border-radius:var(--r-full); background:var(--surface-3); color:var(--muted); font:600 10.5px/18px var(--font-mono); }
  .gap p { margin:3px 0 8px; color:var(--muted); font-size:12px; line-height:1.45; }
  .gap .chip-row { margin:0; padding:0; list-style:none; }
  .gap-item { display:inline-flex; align-items:stretch; }
  .gap-link { display:inline-flex; align-items:center; gap:6px; height:24px; padding:0 8px; border:1px solid var(--border-2); border-radius:var(--r-xs); color:var(--fg); font:12px var(--font-mono); text-decoration:none; }
  .gap-link span { color:var(--accent-fg); font:500 11px var(--font-sans); }
  .gap-link .i { color:var(--faint); }
  .gap-link:hover { border-color:var(--ink); }
  .gap-item .gap-link:not(:last-child) { border-right:0; border-radius:var(--r-xs) 0 0 var(--r-xs); }
  .gap-fix { display:inline-flex; align-items:center; justify-content:center; width:24px; border:1px solid var(--border-2); border-radius:0 var(--r-xs) var(--r-xs) 0; color:var(--muted); }
  .gap-fix:hover { border-color:var(--ink); color:var(--fg); }
  .cov-worlds { margin:0; padding:0; list-style:none; }
  .cov-worlds li + li { margin-top:16px; padding-top:16px; border-top:1px solid var(--border); }
  .cov-world-head { display:flex; align-items:center; gap:8px; }
  .cov-bar { display:flex; gap:2px; margin:8px 0 6px; }
  .cov-bar i { flex:1; height:6px; max-width:36px; border-radius:1.5px; background:var(--surface-3); box-shadow:inset 0 0 0 1px var(--border); }
  .cov-bar i.on { background:var(--fault); box-shadow:none; }
  .cov-world-note { margin:0; color:var(--muted); font-size:12px; line-height:1.5; }
  .cov-world-note b { color:var(--fg); font-family:var(--font-mono); }
  .cov-world-note a { color:var(--fg-2); text-decoration:underline; text-decoration-color:var(--border-3); text-underline-offset:2px; }
  .row-muted td { color:var(--faint); }

  /* The catalog */
  .cat-bar { display:flex; flex-wrap:wrap; align-items:center; gap:8px 14px; margin:0 0 14px; }
  .cat-bar .search { flex:1 1 260px; max-width:420px; }
  .cat-pick { display:inline-flex; flex-wrap:wrap; gap:6px; }
  .cat-pick a { text-decoration:none; }
  .cat-toolbar { margin:0 0 12px; }
  .cat-hl { box-shadow:0 0 0 2px var(--ink); }
  .cat-lead { display:flex; align-items:center; gap:8px; margin:0; padding:12px 16px; border-bottom:1px solid var(--border); color:var(--fg-2); font-size:12.5px; }
  .cat-lead .i { color:var(--muted); }
  .cat-tool { color:var(--fg); font:500 12px var(--font-mono); }
  .cat-writes { margin-left:8px; padding:0 6px; border:1px solid var(--border-2); border-radius:var(--r-xs); color:var(--muted); font:500 10px var(--font-mono); letter-spacing:.04em; text-transform:uppercase; }
  .cat-args { display:inline-flex; flex-wrap:wrap; gap:4px; }
  .cat-arg { padding:1px 6px; border:1px solid var(--border-2); border-radius:var(--r-xs); background:var(--surface-2); color:var(--fg); font:11.5px var(--font-mono); }
  .cat-arg.opt { border-style:dashed; color:var(--muted); }
  .cat-tools td { vertical-align:top; padding-top:10px; padding-bottom:10px; white-space:normal; }
  .cat-tools td:first-child { white-space:nowrap; }
  .cat-records { display:flex; flex-direction:column; gap:8px; padding:12px 16px; border-top:1px solid var(--border); background:var(--surface-2); }
  .cat-record { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
  .cat-record code { margin-right:4px; color:var(--fg); font:600 12px var(--font-mono); }
  .cat-field { padding:1px 6px; border:1px solid var(--border); border-radius:var(--r-xs); background:var(--surface); color:var(--fg-2); font:11.5px var(--font-mono); }
  .cat-field em { margin-left:5px; color:var(--faint); font-style:normal; }
  .cat-faults, .cat-policies { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
  .cat-fault, .cat-policy, .cat-verdict { display:flex; flex-direction:column; padding:14px 16px; border:1px solid var(--border); border-radius:var(--r-md); background:var(--surface); }
  .cat-fault > header, .cat-policy > header, .cat-verdict-head { display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; }
  .cat-fault > p, .cat-verdict > p { margin:8px 0 0; color:var(--fg-2); font-size:12.5px; line-height:1.5; }
  .cat-stage { color:var(--muted); font-size:11.5px; }
  .cat-opt { margin:0 6px 0 3px; color:var(--faint); font-size:11px; }
  .cat-fault footer { display:flex; flex-wrap:wrap; align-items:center; gap:4px 10px; margin-top:auto; padding-top:12px; color:var(--muted); font-size:12px; }
  .cat-fault .stg { align-self:flex-start; }
  .cat-policy-key { color:var(--fg); font:600 13px var(--font-mono); }
  .cat-example { margin-top:12px; overflow:hidden; border:1px solid var(--border); border-radius:var(--r-sm); }
  .cat-example-bar { display:flex; align-items:center; justify-content:space-between; padding:4px 6px 4px 10px; border-bottom:1px solid var(--border); background:var(--surface-2); }
  .cat-example .code-view { max-height:none; }
  .cat-verdicts { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
  .cat-verdict { border-left:3px solid var(--v); }
  .cat-verdict-icon { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:var(--r-sm); background:var(--v-bg); color:var(--v-fg); }
  .cat-verdict-head b { display:block; color:var(--fg); font-size:13.5px; }
  .cat-verdict-foot { display:flex; align-items:center; gap:8px; margin-top:auto; padding-top:12px; }
  .cat-verdict-all { margin-top:16px; }
  .cat-verdict-all .vbar { height:14px; }

  /* The editor */
  .ed-layout { display:grid; grid-template-columns:minmax(0,1.55fr) minmax(320px,1fr); gap:16px; align-items:start; }
  .ed-side { display:flex; flex-direction:column; gap:16px; min-width:0; }
  .ed-pane { display:flex; flex-direction:column; min-width:0; overflow:hidden; }
  .ed-bar { display:flex; align-items:center; gap:10px; min-height:40px; padding:4px 8px 4px 14px; border-bottom:1px solid var(--border); background:var(--surface-2); }
  .ed-file { display:inline-flex; align-items:center; gap:7px; min-width:0; color:var(--fg); font:500 12px var(--font-mono); white-space:nowrap; }
  .ed-file > span:nth-child(2) { overflow:hidden; text-overflow:ellipsis; }
  .ed-file .pill[hidden] { display:none; }
  .ed-hint { color:var(--faint); white-space:nowrap; }
  .ed-code { display:grid; grid-template-columns:auto minmax(0,1fr); height:clamp(420px, calc(100vh - 330px), 760px); overflow:hidden; background:var(--sunken); font:12px/1.65 var(--font-mono); }
  .ed-gutter { overflow:hidden; padding:12px 10px 12px 14px; border-right:1px solid var(--border); color:var(--faint); text-align:right; user-select:none; }
  .ed-gutter span { display:block; } .ed-gutter span.bad { color:var(--bad-fg); font-weight:700; }
  .ed-body { position:relative; min-width:0; }
  .ed-hl, .ed-text { position:absolute; inset:0; box-sizing:border-box; margin:0; padding:12px 14px; border:0; border-radius:0; font:inherit; letter-spacing:0; tab-size:2; white-space:pre; word-break:normal; overflow:auto; }
  .ed-hl { overflow:hidden; background:none; pointer-events:none; }
  .ed-hl code { font:inherit; }
  .ed-text { z-index:1; background:transparent; color:transparent; caret-color:var(--fg); outline:0; resize:none; }
  .ed-text::selection { background:color-mix(in srgb, var(--accent-solid) 28%, transparent); }
  .ed-bad { text-decoration:underline wavy var(--bad); text-underline-offset:3px; background:var(--bad-bg); }
  .ed-foot { display:flex; flex-wrap:wrap; align-items:center; gap:4px 16px; padding:7px 14px; border-top:1px solid var(--border); background:var(--surface-2); color:var(--muted); font:11.5px var(--font-mono); }
  .ed-foot #ed-target { max-width:100%; margin-left:auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .ed-state { display:flex; flex-direction:column; gap:8px; }
  .ed-state-head { display:flex; flex-wrap:wrap; align-items:center; gap:8px; color:var(--fg); }
  .ed-state.ok .ed-state-head > .i { color:var(--ok); } .ed-state.bad .ed-state-head > .i { color:var(--bad); }
  .ed-state-head code { color:var(--fg-2); font:12px var(--font-mono); }
  .ed-state-head .spinner { margin-left:auto; }
  .ed-state.checking { flex-direction:row; align-items:center; color:var(--muted); font-size:12.5px; }
  .ed-state-msg { margin:0; padding:8px 10px; border:1px solid var(--harm-bd); border-radius:var(--r-sm); background:var(--bad-bg); color:var(--bad-fg); font:12px/1.5 var(--font-mono); overflow-wrap:anywhere; }
  .ed-state-meta { display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; color:var(--muted); font-size:12px; }
  .ed-expect { margin:0; padding:0 0 0 16px; color:var(--fg-2); font-size:12.5px; line-height:1.5; }
  .ed-expect li + li { margin-top:3px; }
  .ed-state-note { margin:0; color:var(--muted); font-size:12px; line-height:1.6; }
  .ed-outline-wrap { max-height:320px; overflow:auto; }
  .ed-none { margin:0; padding:14px 16px; color:var(--muted); font-size:12.5px; }
  .ed-outline { margin:0; padding:4px 0; list-style:none; }
  .ed-ol { display:flex; align-items:center; gap:8px; width:100%; min-height:28px; padding:3px 14px; border:0; background:none; color:var(--fg-2); font:inherit; font-size:12px; text-align:left; cursor:pointer; }
  .ed-ol:hover { background:var(--surface-2); }
  .ed-ol .i { flex:none; color:var(--muted); }
  .ed-ol b { color:var(--fg); font:500 12px var(--font-mono); white-space:nowrap; }
  .ed-ol span { min-width:0; overflow:hidden; color:var(--muted); text-overflow:ellipsis; white-space:nowrap; }
  .ed-ol em { margin-left:auto; color:var(--faint); font:11px var(--font-mono); font-style:normal; }
  .ed-outline li.d1 .ed-ol { padding-left:30px; } .ed-outline li.d2 .ed-ol { padding-left:46px; }
  .ed-agents { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:6px 10px; margin:0 0 12px; padding:0; border:0; }
  .ed-agent { display:flex; align-items:center; justify-content:space-between; gap:6px; min-width:0; }
  .ed-exp { overflow:hidden; color:var(--faint); font:10px var(--font-mono); text-overflow:ellipsis; white-space:nowrap; }
  .ed-job { margin-top:12px; display:flex; flex-direction:column; gap:6px; }
  .ed-results { margin:12px 0 0; padding:0; list-style:none; }
  .ed-results > li + li { margin-top:8px; }
  .ed-result { display:flex; align-items:center; gap:8px; padding:6px 6px 6px 10px; border:1px solid var(--border); border-radius:var(--r-sm); }
  .ed-result-main { display:flex; flex:1; flex-direction:column; gap:2px; min-width:0; color:inherit; text-decoration:none; }
  .ed-result-head { display:flex; flex-wrap:wrap; align-items:center; gap:4px 8px; }
  .ed-result-head code { color:var(--fg-2); font:11.5px var(--font-mono); }
  .ed-result-why { overflow:hidden; color:var(--muted); font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
  .ed-replay { margin:6px 0 0; padding:0 0 0 16px; font-size:12px; }
  .ed-replay-err { margin:6px 0 0; color:var(--bad-fg); font-size:12px; }
  .ed-results .callout { margin-top:6px; }
  .ed-templates { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
  .ed-template { display:flex; align-items:flex-start; gap:10px; padding:10px 12px; border:1px solid var(--border); border-radius:var(--r-sm); background:var(--surface); color:inherit; font:inherit; text-align:left; cursor:pointer; }
  .ed-template:hover { border-color:var(--ink); background:var(--surface-2); }
  .ed-template-icon { display:inline-flex; flex:none; align-items:center; justify-content:center; width:28px; height:28px; border-radius:var(--r-sm); background:var(--surface-3); color:var(--fg-2); }
  .ed-template-text { display:flex; flex-direction:column; gap:2px; min-width:0; }
  .ed-template-text b { color:var(--fg); font-size:12.5px; }
  .ed-template-text span { color:var(--muted); font-size:12px; line-height:1.4; }
  .ed-ref { display:flex; flex-direction:column; gap:16px; }
  .ed-ref .eyebrow em { margin-left:6px; color:var(--faint); font-style:normal; text-transform:none; letter-spacing:0; }
  .ed-ref .chip-row { margin-top:6px; }
  .ed-ref-world { display:flex; flex-direction:column; align-items:flex-start; gap:6px; margin-top:10px; }

  @media (min-width: 761px) and (max-width: 1400px) { .dt td.scn-source, .dt th.scn-source { display:none; } }
  @media (max-width: 1180px) {
    .ed-layout { grid-template-columns:minmax(0,1fr); }
    .cat-verdicts { grid-template-columns:repeat(2,minmax(0,1fr)); }
  }
  @media (max-width: 760px) {
    .scn-attn { margin-left:0; }
    .cat-faults, .cat-policies, .cat-verdicts, .ed-templates { grid-template-columns:minmax(0,1fr); }
    .sd-policies li { grid-template-columns:minmax(0,1fr); gap:4px; }
    .sd-strike-facts > div, .cat-fault-facts > div { grid-template-columns:minmax(0,1fr); gap:2px; }
    .ed-hint { display:none; }
    .ed-code { height:60vh; }
    .sd-health { flex-direction:column; align-items:flex-start; }
    .cat-tools td:first-child { white-space:normal; }
  }
`;
