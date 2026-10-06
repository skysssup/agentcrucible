/** Styles of the pages for: Agents, agent profiles, comparisons, and analytics. */
export const AGENTS_CSS = `
  .src-tag { gap:4px; max-width:100%; min-width:0; }
  .src-tag .i { flex:none; color:var(--faint); }
  .src-tag .clip { min-width:0; }
  .ver-tag { display:inline-flex; flex:none; align-items:center; height:18px; padding:0 6px; border-radius:var(--r-xs); background:var(--ink); color:var(--on-ink); font:600 10.5px/1 var(--font-mono); letter-spacing:.01em; white-space:nowrap; }
  .share-meter { position:relative; display:block; height:4px; overflow:hidden; border-radius:var(--r-full); background:var(--surface-3); }
  .share-meter i { position:absolute; inset:0 auto 0 0; border-radius:inherit; background:var(--rate-c, var(--faint)); }
  .vtrail { display:inline-flex; align-items:flex-end; gap:2px; height:14px; vertical-align:middle; }
  .vtrail i { width:5px; height:14px; border-radius:1px; background:var(--v); }

  .ag-toolbar .search { width:min(300px, 100%); }
  .ag-sort { display:inline-flex; align-items:center; gap:8px; }
  .ag-sort select { width:auto; min-width:132px; }
  .agent-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(296px, 1fr)); gap:12px; }
  .ag-sub { display:flex; align-items:baseline; gap:8px; margin:24px 0 10px; color:var(--fg-2); font-size:12.5px; }
  .ag-sub > span:first-child { color:var(--muted); font:500 10.5px/1 var(--font-mono); letter-spacing:.07em; text-transform:uppercase; }
  .ag-sub b { color:var(--muted); font:500 11px var(--font-mono); }
  .ag-sub .muted { font-size:12px; }
  .agent-card { position:relative; display:flex; flex-direction:column; gap:12px; min-width:0; padding:14px 16px 0; border:1px solid var(--border); border-radius:var(--r-md); background:var(--surface); cursor:pointer; transition:border-color var(--t-fast), background var(--t-fast); }
  .agent-card:hover { border-color:var(--border-3); }
  .agent-card.is-picked { border-color:var(--ink); box-shadow:inset 0 0 0 1px var(--ink); }
  .agent-card:focus-within { border-color:var(--border-3); }
  .ac-head { display:flex; align-items:flex-start; gap:10px; min-width:0; }
  .ac-head .glyph { margin-top:1px; }
  .ac-name { display:flex; flex:1; flex-direction:column; gap:5px; min-width:0; }
  .ac-id { overflow:hidden; color:var(--fg); font:600 13px/1.35 var(--font-mono); letter-spacing:-.01em; text-decoration:none; text-overflow:ellipsis; white-space:nowrap; }
  .ac-id:hover { text-decoration:underline; text-underline-offset:3px; }
  .ac-tags { display:flex; flex-wrap:wrap; align-items:center; gap:6px; min-width:0; }
  .ac-head .check { margin-top:2px; }
  .ac-desc { display:-webkit-box; min-height:36px; margin:-2px 0 0; overflow:hidden; color:var(--muted); font-size:12px; line-height:1.5; -webkit-box-orient:vertical; -webkit-line-clamp:2; }
  .ac-stats { display:grid; grid-template-columns:1.15fr 1fr 1fr; gap:0; border-top:1px solid var(--border); }
  .ac-stat { display:flex; flex-direction:column; gap:3px; min-width:0; padding:10px 0 0 12px; border-left:1px solid var(--border); }
  .ac-stat:first-child { padding-left:0; padding-right:12px; border-left:0; }
  .ac-stat > b { color:var(--fg); font-size:20px; font-weight:600; letter-spacing:-.02em; line-height:1.2; }
  .ac-stat small { overflow:hidden; color:var(--muted); font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
  .ac-stat .share-meter { margin-top:4px; }
  .ac-worst { display:flex; align-items:center; gap:6px; min-height:24px; }
  .ac-trend { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:10px; }
  .ac-trend .spark { justify-self:end; }
  .ac-trend b { min-width:36px; color:var(--fg); font:600 12px var(--font-mono); text-align:right; }
  .ac-foot { display:flex; align-items:center; gap:12px; min-height:38px; margin:0 -16px; padding:0 12px 0 16px; border-top:1px solid var(--border); color:var(--muted); font-size:11.5px; }
  .ac-when { display:inline-flex; flex:1; align-items:center; gap:6px; min-width:0; white-space:nowrap; }
  .ac-when .i { color:var(--faint); }
  .ac-when span { color:var(--fg-2); }
  .ac-open { display:inline-flex; align-items:center; gap:4px; color:var(--bad-fg); font-weight:500; text-decoration:none; white-space:nowrap; }
  .ac-open:hover { text-decoration:underline; text-underline-offset:3px; }
  .agent-card.is-empty { gap:10px; padding-bottom:12px; background:var(--surface-2); }
  .agent-card.is-empty .glyph { background:var(--surface); color:var(--faint); }
  .agent-card.is-empty .ac-id { color:var(--fg-2); }
  .ac-none { display:flex; align-items:center; justify-content:space-between; gap:8px; padding-top:10px; border-top:1px dashed var(--border-2); color:var(--muted); font-size:12px; }
  .ac-none > span { display:inline-flex; align-items:center; gap:6px; }
  #ag-pickbar:empty { display:none; }
  .agents-page .dt .cell-2 { max-width:300px; }

  .agent-head { display:flex; align-items:flex-start; gap:14px; }
  .agent-head > .glyph { margin-top:20px; }
  .agent-head > .page-head { flex:1; min-width:0; }
  .page-meta .meta-chip { display:inline-flex; }
  .ag-period { display:flex; align-items:center; justify-content:space-between; gap:8px 16px; margin:-4px 0 10px; }
  .ag-mix { display:flex; flex-direction:column; align-items:center; gap:4px; }
  .ag-mix .vlegend { align-self:stretch; }
  .ag-marks .i { color:var(--faint); }
  .ag-story { margin:0 0 14px; color:var(--fg-2); font-size:13px; line-height:1.5; }
  .ag-story b { color:var(--fg); }
  .ag-story .delta { margin-left:2px; vertical-align:1px; }
  .ag-release { display:grid; grid-template-columns:minmax(0,2fr) minmax(0,3fr); gap:20px; align-items:start; }
  .ag-release .table-wrap { border:1px solid var(--border); border-radius:var(--r-md); }
  .ag-worlds { display:grid; grid-template-columns:repeat(auto-fit, minmax(96px, 1fr)); gap:4px; }
  .ag-world { display:flex; flex-direction:column; gap:2px; min-width:0; padding:9px 10px 8px; border-radius:var(--r-sm); background:var(--hm-bg); color:var(--hm-fg); }
  .ag-world-name { display:flex; align-items:center; gap:5px; overflow:hidden; color:var(--fg-2); font-size:11.5px; text-overflow:ellipsis; white-space:nowrap; }
  .ag-world-name .i { color:var(--muted); }
  .ag-world b { font-size:19px; font-weight:600; letter-spacing:-.02em; line-height:1.25; }
  .ag-world-sub { color:var(--fg-2); font:400 10.5px var(--font-mono); opacity:.8; }
  .agent-page .barlist a > .fill, .analytics-page .barlist a > .fill { position:absolute; inset:3px auto 3px 0; border-radius:var(--r-xs); background:var(--bl, var(--surface-3)); opacity:.9; }
  .agent-page .barlist a > :not(.fill), .analytics-page .barlist a > :not(.fill) { position:relative; }
  .ag-trend-cell { display:inline-flex; align-items:center; gap:10px; }
  .ag-verdict-link { text-decoration:none; }
  .ag-verdict-link:hover .verdict { text-decoration:underline; text-underline-offset:3px; }
  .dt tbody tr.ag-row-open td:first-child { box-shadow:inset 2px 0 0 var(--harm); }
  .ag-rules .list-row { align-items:flex-start; }
  .ag-rules .vcode { margin-top:1px; }
  .ag-rules .detail { white-space:normal; line-height:1.45; }
  .ag-rules .detail b { color:var(--fg-2); font-weight:500; }
  .ag-count { min-width:28px; color:var(--fg); font:600 12px var(--font-mono); text-align:right; }
  .ag-open { margin:4px 0 0; padding-left:16px; }
  .ag-open li { margin:2px 0; }
  .ag-open .verdict { font-size:11px; }

  .compare-page, .analytics-page { --side-a:var(--ink); --side-b:var(--muted); }
  .side-mark { display:inline-flex; flex:none; align-items:center; justify-content:center; width:18px; height:18px; border-radius:var(--r-xs); color:var(--surface); font:700 10.5px/1 var(--font-mono); }
  .side-mark.a { background:var(--side-a, var(--ink)); }
  .side-mark.b { background:var(--side-b, var(--muted)); }
  .pair { display:flex; flex-direction:column; gap:4px; min-width:0; }
  .pair-row { display:grid; grid-template-columns:minmax(0,1fr) 38px; align-items:center; gap:8px; }
  .pair-bar { position:relative; height:6px; overflow:hidden; border-radius:var(--r-full); background:var(--surface-3); }
  .pair-bar i { position:absolute; inset:0 auto 0 0; border-radius:inherit; }
  .pair-bar.a i { background:var(--side-a, var(--ink)); }
  .pair-bar.b i { background:var(--side-b, var(--muted)); }
  .pair-row b { color:var(--fg); font:600 11.5px var(--font-mono); text-align:right; }
  .vs-list { margin:0; padding:0; list-style:none; }
  .vs-list li { display:grid; grid-template-columns:minmax(110px, 1fr) minmax(0, 1.6fr) 92px; align-items:center; gap:14px; padding:9px 0; }
  .vs-list li:first-child { padding-top:0; }
  .vs-list li:last-child { padding-bottom:0; }
  .vs-list li + li { border-top:1px solid var(--border); }
  .vs-list.two-col { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); column-gap:40px; }
  .vs-list.two-col li { padding:9px 0; border-top:1px solid var(--border); }
  .vs-list.two-col li:nth-child(-n+2) { padding-top:0; border-top:0; }
  .vs-key { display:flex; flex-direction:column; align-items:flex-start; gap:3px; min-width:0; }
  .vs-key small { color:var(--muted); font-size:11px; }
  .vs-key .code-chip { max-width:100%; overflow:hidden; text-overflow:ellipsis; }
  .vs-score { display:flex; align-items:baseline; justify-content:flex-end; gap:3px; font:600 13px var(--font-mono); white-space:nowrap; }
  .vs-score b.a { color:var(--side-a); } .vs-score b.b { color:var(--side-b); }
  .vs-score em { margin-left:6px; color:var(--muted); font:400 11px var(--font-sans); font-style:normal; }

  .cmp-pickers { display:grid; grid-template-columns:minmax(0,1fr) 56px minmax(0,1fr); align-items:stretch; margin:0 0 16px; }
  .cmp-side { display:flex; flex-direction:column; gap:10px; min-width:0; padding:14px 16px; border:1px solid var(--border); border-radius:var(--r-md); background:var(--surface); }
  .cmp-side.a { box-shadow:inset 0 2px 0 var(--side-a); }
  .cmp-side.b { box-shadow:inset 0 2px 0 var(--side-b); }
  .cmp-side.empty { border-style:dashed; background:var(--surface-2); box-shadow:none; }
  .cmp-side-head { display:flex; align-items:center; gap:10px; }
  .cmp-side-head select { flex:1; min-width:0; font:500 12.5px var(--font-mono); }
  .cmp-side-tags { display:flex; flex-wrap:wrap; align-items:center; gap:6px; min-width:0; }
  .cmp-side-tags .link-quiet { margin-left:auto; }
  .cmp-desc { display:-webkit-box; margin:0; overflow:hidden; color:var(--muted); font-size:12px; line-height:1.5; -webkit-box-orient:vertical; -webkit-line-clamp:2; }
  .cmp-side-facts { display:flex; flex-wrap:wrap; gap:4px 18px; color:var(--muted); font-size:12px; }
  .cmp-side-facts b { color:var(--fg); font:600 12.5px var(--font-mono); }
  .cmp-vs { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; color:var(--faint); font:500 10.5px var(--font-mono); letter-spacing:.08em; text-transform:uppercase; }
  .cmp-sentence { margin:0 0 12px; color:var(--fg-2); font-size:13px; line-height:1.5; }
  .cmp-sentence b { color:var(--fg); }
  .cmp-sentence b.mono { font-size:12.5px; }
  .cmp-score { display:flex; gap:2px; height:28px; overflow:hidden; border-radius:var(--r-sm); }
  .cmp-score span { display:flex; align-items:center; justify-content:center; min-width:26px; font:600 12px var(--font-mono); }
  .cmp-score .a { background:var(--side-a); color:var(--surface); }
  .cmp-score .tie { background:var(--surface-3); color:var(--fg-2); box-shadow:inset 0 0 0 1px var(--border); }
  .cmp-score .b { background:var(--side-b); color:var(--surface); }
  .cmp-score-legend { display:flex; justify-content:space-between; gap:12px; margin-top:7px; color:var(--muted); font-size:11.5px; }
  .cmp-score-legend span { display:inline-flex; align-items:center; gap:6px; }
  .cmp-score-legend .side-mark { width:14px; height:14px; font-size:9px; }
  .cmp-score-legend i.tie { width:12px; height:12px; border:1px solid var(--border-2); border-radius:2px; background:var(--surface-3); }
  .cmp-mix { display:flex; flex-direction:column; gap:8px; margin-top:16px; padding-top:14px; border-top:1px solid var(--border); }
  .cmp-mix .label { margin-bottom:2px; }
  .cmp-mix-row { display:grid; grid-template-columns:18px minmax(80px, 170px) minmax(0,1fr) minmax(0,auto); align-items:center; gap:12px; }
  .cmp-mix-id { overflow:hidden; color:var(--fg); text-overflow:ellipsis; white-space:nowrap; }
  .cmp-toolbar { margin:0; padding:10px 16px; border-bottom:1px solid var(--border); }
  .cmp-cell { display:inline-flex; flex-direction:column; gap:2px; min-width:180px; margin:4px -8px; padding:5px 8px; border-radius:var(--r-sm); }
  .cmp-cell.better { background:var(--ok-bg); box-shadow:inset 0 0 0 1px var(--ssucc-bd); }
  .cmp-edge { display:inline-flex; align-items:center; gap:6px; color:var(--fg); font-size:12px; font-weight:500; white-space:nowrap; }
  .cmp-how { margin:0; padding-left:18px; color:var(--fg-2); font-size:12.5px; line-height:1.6; }
  .cmp-how li + li { margin-top:6px; }
  @media (max-width: 1100px) { .ag-release { grid-template-columns:minmax(0,1fr); } }
  @media (max-width: 760px) {
    .agent-head > .glyph { display:none; }
    .cmp-pickers { grid-template-columns:minmax(0,1fr); gap:8px; }
    .cmp-vs { flex-direction:row; }
    .vs-list li { grid-template-columns:minmax(0,1fr) 84px; }
    .vs-list.two-col { grid-template-columns:minmax(0,1fr); }
    .vs-list.two-col li:nth-child(2) { padding-top:9px; border-top:1px solid var(--border); }
    .vs-list li .pair { grid-column:1 / -1; grid-row:2; }
    .cmp-mix-row { grid-template-columns:18px minmax(0,1fr); }
    .cmp-mix-row .vbar, .cmp-mix-row .mix { grid-column:1 / -1; }
  }
  @media (max-width: 760px) { .ag-toolbar .search { width:100%; } .ag-toolbar .spacer { display:none; } }
`;
