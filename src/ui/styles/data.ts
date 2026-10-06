/** Data tables, pagination, verdict bars and legends, charts, heat maps, feeds, and lists. */
export const DATA_CSS = `
  .table-wrap { position:relative; min-width:0; overflow-x:auto; border:1px solid var(--border); border-radius:var(--r-md); background:var(--surface); }
  .table-wrap.flush { border:0; border-radius:0; }
  .dt { min-width:100%; }
  .dt thead th { position:sticky; top:0; z-index:1; height:34px; border-bottom:1px solid var(--border); background:var(--surface-2); }
  .dt thead th:first-child { padding-left:16px; } .dt tbody td:first-child { padding-left:16px; }
  .dt thead th:last-child { padding-right:16px; } .dt tbody td:last-child { padding-right:16px; }
  .dt tbody td { height:var(--row); color:var(--fg-2); font-size:12.5px; }
  .dt tbody tr:last-child td { border-bottom:0; }
  .dt tbody tr { transition:background var(--t-fast); }
  .dt tbody tr:hover td { background:var(--surface-2); }
  .dt tbody tr[data-href], .dt tbody tr[data-action] { cursor:pointer; }
  .dt tbody tr.is-selected td { background:var(--accent-soft); }
  .dt tbody tr.is-muted td { color:var(--faint); }
  .dt tbody tr.group-row td { height:30px; background:var(--surface-2); color:var(--muted); font:500 10.5px/1 var(--font-mono); letter-spacing:.06em; text-transform:uppercase; }
  .dt tbody tr.group-row td span { margin-left:8px; color:var(--faint); }
  .dt td.num, .dt th.num { text-align:right; font-family:var(--font-mono); font-size:12px; }
  .dt td.mono { font-family:var(--font-mono); font-size:12px; }
  .dt td.strong, .dt td .strong { color:var(--fg); font-weight:500; }
  .dt td.clip { max-width:360px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .dt td.wrap { white-space:normal; line-height:1.45; padding-top:8px; padding-bottom:8px; }
  .dt td.when, .dt th.when { color:var(--muted); font-size:12px; white-space:nowrap; }
  .dt td.actions { width:1%; white-space:nowrap; text-align:right; }
  .dt td.check-col, .dt th.check-col { width:36px; padding-right:0; }
  .dt .row-link { color:var(--fg); font-weight:500; text-decoration:none; }
  .dt .row-link.mono { font:500 12px var(--font-mono); }
  .dt .row-link:hover { text-decoration:underline; text-underline-offset:3px; }
  .dt .sub { display:block; overflow:hidden; color:var(--muted); font-size:11.5px; text-overflow:ellipsis; white-space:nowrap; }
  .dt .cell-2 { display:flex; flex-direction:column; justify-content:center; gap:2px; min-width:0; padding:6px 0; }
  .sort { display:inline-flex; align-items:center; gap:4px; margin:0 -4px; padding:0 4px; border:0; border-radius:var(--r-xs); background:none; color:inherit; font:inherit; letter-spacing:inherit; text-transform:inherit; cursor:pointer; }
  .sort:hover { background:var(--surface-3); color:var(--fg); }
  .sort .i { color:var(--faint); }
  .sort.on { color:var(--fg); } .sort.on .i { color:var(--fg); }
  th.num .sort { flex-direction:row-reverse; }
  .dt-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px 10px; margin:0 0 12px; }
  .dt-toolbar .count { color:var(--muted); font-size:12px; white-space:nowrap; }
  .dt-foot { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px; margin-top:12px; color:var(--muted); font-size:12px; }
  .pager { display:flex; align-items:center; gap:4px; }
  .pager button { min-width:28px; height:28px; padding:0 8px; border:1px solid var(--border-2); border-radius:var(--r-sm); background:var(--surface); color:var(--fg-2); font:500 12px var(--font-mono); cursor:pointer; }
  .pager button:hover:not(:disabled) { border-color:var(--border-3); color:var(--fg); }
  .pager button.on { border-color:var(--ink); background:var(--ink); color:var(--on-ink); }
  .pager button:disabled { opacity:.45; cursor:default; }
  .pager .gap { padding:0 4px; color:var(--faint); }
  .page-size { display:inline-flex; align-items:center; gap:8px; }
  .page-size select { width:auto; height:28px; }
  .bulkbar { position:sticky; bottom:16px; z-index:5; display:flex; align-items:center; gap:10px; width:max-content; max-width:calc(100% - 16px); margin:16px auto 0; padding:6px 6px 6px 14px; border:1px solid var(--ink); border-radius:var(--r-md); background:var(--ink); color:var(--on-ink); box-shadow:var(--shadow-pop); animation:rise-in var(--t-med) var(--ease); }
  .bulkbar b { font:600 12.5px var(--font-mono); }
  .bulkbar .btn-secondary { border-color:transparent; background:color-mix(in srgb, var(--on-ink) 12%, var(--ink)); color:var(--on-ink); box-shadow:none; }
  .bulkbar .btn-secondary:hover { background:color-mix(in srgb, var(--on-ink) 20%, var(--ink)); }
  .bulkbar .btn-danger { border-color:transparent; background:transparent; color:light-dark(#ffb3aa, #b02a1e); }
  .bulkbar .icon-btn { color:color-mix(in srgb, var(--on-ink) 65%, transparent); }
  .bulkbar .icon-btn:hover { background:color-mix(in srgb, var(--on-ink) 12%, var(--ink)); color:var(--on-ink); }

  .vbar { display:flex; gap:1.5px; height:6px; min-width:40px; overflow:hidden; border-radius:1.5px; background:var(--surface-3); }
  .vbar span { min-width:2px; background:var(--v); }
  .vbar.sm { height:5px; } .vbar.lg { height:10px; } .vbar.xl { height:14px; border-radius:var(--r-xs); }
  .vlegend { display:flex; flex-direction:column; gap:2px; margin:12px 0 0; padding:0; list-style:none; }
  .vlegend li { display:grid; grid-template-columns:10px minmax(0,1fr) auto 44px; align-items:center; gap:8px; height:26px; font-size:12px; }
  .vlegend .sw { width:8px; height:8px; border-radius:2px; background:var(--v); }
  .vlegend code { overflow:hidden; color:var(--fg-2); font-size:11.5px; text-overflow:ellipsis; white-space:nowrap; }
  .vlegend b { color:var(--fg); font:600 12px var(--font-mono); text-align:right; }
  .vlegend em { color:var(--muted); font:400 11.5px var(--font-mono); font-style:normal; text-align:right; }
  .vlegend.inline { flex-direction:row; flex-wrap:wrap; gap:4px 16px; }
  .vlegend.inline li { display:inline-flex; gap:6px; height:auto; }
  .mix { display:inline-flex; flex-wrap:wrap; gap:4px 10px; }
  .mix span { display:inline-flex; align-items:center; gap:4px; color:var(--fg-2); font:500 11px var(--font-mono); }
  .mix span i { width:6px; height:6px; border-radius:1.5px; background:var(--v); }
  .vdots { display:inline-flex; gap:2px; }
  .vdots .vdot { width:6px; height:6px; }
  .rate { display:inline-flex; align-items:center; gap:8px; min-width:96px; }
  .rate .bar { position:relative; flex:1; height:4px; min-width:36px; border-radius:var(--r-full); background:var(--surface-3); overflow:hidden; }
  .rate .bar i { position:absolute; inset:0 auto 0 0; border-radius:inherit; background:var(--rate-c, var(--ssucc)); }
  .rate b { min-width:34px; color:var(--fg); font:600 12px var(--font-mono); text-align:right; }
  .mark-ok { color:var(--ok-fg); font-weight:600; }
  .mark-bad { color:var(--bad-fg); font:500 11px var(--font-mono); white-space:nowrap; }
  .exp-sum { display:inline-flex; align-items:center; gap:4px; font-size:11.5px; white-space:nowrap; }
  .exp-sum.ok { color:var(--ok-fg); } .exp-sum.bad { color:var(--bad-fg); }

  .chart { display:block; width:100%; height:auto; overflow:visible; font-family:var(--font-mono); }
  .chart .grid-line { stroke:var(--border); stroke-width:1; shape-rendering:crispEdges; }
  .chart .grid-line.zero { stroke:var(--border-2); }
  .chart .axis-label { fill:var(--faint); font-size:10px; }
  .chart .axis-label.y { text-anchor:end; }
  .chart .series-line { fill:none; stroke-width:1.75; stroke-linejoin:round; stroke-linecap:round; }
  .chart .series-area { stroke:none; opacity:.1; }
  .chart .series-dot { stroke:var(--surface); stroke-width:1.5; }
  .chart .bar-seg { shape-rendering:crispEdges; transition:opacity var(--t-fast); }
  .chart .hit { fill:transparent; cursor:crosshair; }
  .chart .hit:hover { fill:light-dark(rgba(27,26,23,.04), rgba(255,255,255,.04)); }
  .chart .crosshair { stroke:var(--border-3); stroke-dasharray:3 3; }
  .chart .annot-line { stroke:var(--fg-2); stroke-width:1; stroke-dasharray:2 3; opacity:.6; }
  .chart .annot-text { fill:var(--fg-2); font-size:10px; }
  .chart-wrap { position:relative; min-width:0; }
  .chart-legend { display:flex; flex-wrap:wrap; gap:4px 14px; margin:0 0 10px; padding:0; list-style:none; }
  .chart-legend li { display:inline-flex; align-items:center; gap:6px; color:var(--fg-2); font-size:11.5px; }
  .chart-legend button { display:inline-flex; align-items:center; gap:6px; padding:2px 4px; border:0; border-radius:var(--r-xs); background:none; color:var(--fg-2); font-size:11.5px; cursor:pointer; }
  .chart-legend button:hover { background:var(--surface-3); }
  .chart-legend button[aria-pressed=false] { opacity:.4; }
  .chart-legend .sw { width:10px; height:3px; border-radius:2px; background:var(--sw); }
  .chart-legend .sw.sq { width:8px; height:8px; }
  .spark { display:block; overflow:visible; }
  .spark path { fill:none; stroke:var(--spark, var(--fg-2)); stroke-width:1.5; stroke-linejoin:round; stroke-linecap:round; }
  .spark .area { fill:var(--spark, var(--fg-2)); stroke:none; opacity:.08; }
  .spark circle { fill:var(--spark, var(--fg-2)); }
  .donut { display:block; }
  .donut-wrap { position:relative; display:inline-flex; flex:none; }
  .donut-center { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; }
  .donut-center b { color:var(--fg); font-size:22px; font-weight:600; letter-spacing:-.02em; line-height:1; }
  .donut-center span { margin-top:4px; color:var(--muted); font:500 10px var(--font-mono); letter-spacing:.06em; text-transform:uppercase; }
  .barlist { display:flex; flex-direction:column; gap:2px; margin:0; padding:0; list-style:none; }
  .barlist li { position:relative; display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:12px; height:30px; padding:0 8px; border-radius:var(--r-xs); font-size:12px; }
  .barlist :is(li, li > a) > .fill { position:absolute; inset:3px auto 3px 0; border-radius:var(--r-xs); background:var(--bl, var(--surface-3)); opacity:.9; }
  .barlist :is(li, li > a) > * { position:relative; }
  .barlist .bl-label { display:flex; align-items:center; gap:8px; overflow:hidden; color:var(--fg); text-overflow:ellipsis; white-space:nowrap; }
  .barlist .bl-label code { overflow:hidden; text-overflow:ellipsis; }
  .barlist .bl-val { color:var(--fg-2); font:500 12px var(--font-mono); white-space:nowrap; }
  .barlist li > a { position:relative; display:grid; grid-column:1 / -1; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:12px; height:100%; margin:0 -8px; padding:0 8px; color:inherit; text-decoration:none; }
  .barlist li:has(a:hover) { background:var(--surface-2); }

  .hm-grid { border-collapse:separate; border-spacing:3px; }
  .hm-grid th { height:auto; padding:4px 6px; border:0; color:var(--muted); font:500 10.5px/1.2 var(--font-mono); letter-spacing:.02em; text-transform:none; white-space:nowrap; }
  .hm-grid th.row-h { padding-right:10px; color:var(--fg-2); font-size:11.5px; text-align:right; }
  .hm-grid td { height:auto; padding:0; border:0; }
  .hm-cell2 { display:flex; align-items:center; justify-content:center; min-width:44px; height:30px; padding:0 6px; border-radius:var(--r-xs); background:var(--hm-bg, var(--surface-3)); color:var(--hm-fg, var(--muted)); font:600 11px/1 var(--font-mono); text-decoration:none; transition:transform var(--t-fast), box-shadow var(--t-fast); }
  a.hm-cell2:hover { box-shadow:0 0 0 2px var(--fg); }
  .hm-cell2.empty { background:transparent; box-shadow:inset 0 0 0 1px var(--border); color:var(--faint); }
  .hm-scale { display:flex; align-items:center; gap:8px; color:var(--muted); font-size:11px; }
  .hm-scale .stops { display:flex; gap:2px; }
  .hm-scale .stops i { width:16px; height:8px; border-radius:2px; }

  .feed { display:flex; flex-direction:column; margin:0; padding:0; list-style:none; }
  .feed-day { position:sticky; top:0; z-index:1; display:flex; align-items:center; gap:8px; padding:12px 0 6px; background:var(--canvas); color:var(--muted); font:500 10.5px/1 var(--font-mono); letter-spacing:.07em; text-transform:uppercase; }
  .panel .feed-day { background:var(--surface); padding:10px 16px 6px; }
  .feed-item { position:relative; display:grid; grid-template-columns:28px minmax(0,1fr) auto; gap:12px; padding:10px 0; }
  .panel .feed-item { padding:10px 16px; }
  .feed-item + .feed-item { border-top:1px solid var(--border); }
  .feed-icon { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border:1px solid var(--border); border-radius:var(--r-sm); background:var(--surface-2); color:var(--muted); }
  .feed-icon.critical { border-color:var(--harm-bd); background:var(--bad-bg); color:var(--bad-fg); }
  .feed-icon.warning { border-color:var(--degr-bd); background:var(--warn-bg); color:var(--warn-fg); }
  .feed-icon.success { border-color:var(--ssucc-bd); background:var(--ok-bg); color:var(--ok-fg); }
  .feed-body { min-width:0; }
  .feed-title { display:block; overflow:hidden; color:var(--fg); font-size:12.5px; font-weight:500; text-overflow:ellipsis; }
  a.feed-title { text-decoration:none; } a.feed-title:hover { text-decoration:underline; text-underline-offset:3px; }
  .feed-detail { display:block; margin-top:2px; overflow:hidden; color:var(--muted); font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
  .feed-meta { color:var(--faint); font:400 11px var(--font-mono); white-space:nowrap; }
  .feed.compact .feed-item { padding:8px 16px; grid-template-columns:22px minmax(0,1fr) auto; gap:10px; }
  .feed.compact .feed-icon { width:22px; height:22px; border-radius:var(--r-xs); }
  .feed.compact .feed-icon .i { width:12px; height:12px; }

  .list { margin:0; padding:0; list-style:none; }
  .list > li + li { border-top:1px solid var(--border); }
  .list-row { display:flex; align-items:center; gap:12px; min-height:44px; padding:8px 16px; color:inherit; text-decoration:none; }
  a.list-row:hover { background:var(--surface-2); }
  .list-row .grow { display:flex; flex-direction:column; gap:2px; }
  .list-row .title { overflow:hidden; color:var(--fg); font-size:12.5px; font-weight:500; text-overflow:ellipsis; white-space:nowrap; }
  .list-row .title.wrap { white-space:normal; overflow-wrap:anywhere; line-height:1.4; }
  .list-row .detail.wrap { white-space:normal; line-height:1.45; }
  .list-row .detail { overflow:hidden; color:var(--muted); font-size:11.5px; text-overflow:ellipsis; white-space:nowrap; }

  .code-view { display:grid; grid-template-columns:auto minmax(0,1fr); overflow:auto; max-height:560px; background:var(--sunken); font:12px/1.65 var(--font-mono); }
  .code-gutter { padding:12px 10px 12px 14px; border-right:1px solid var(--border); color:var(--faint); text-align:right; user-select:none; white-space:pre; }
  .code-gutter span { display:block; }
  .code-view pre { padding:12px 14px; border:0; border-radius:0; background:none; white-space:pre; word-break:normal; }

  @media (max-width: 760px) {
    .dt.cards thead { display:none; }
    .dt.cards, .dt.cards tbody, .dt.cards tr, .dt.cards td { display:block; width:100%; }
    .dt.cards tr { padding:10px 14px; border-bottom:1px solid var(--border); }
    .dt.cards tbody tr:last-child { border-bottom:0; }
    .dt.cards td { height:auto; padding:2px 0 !important; border:0; text-align:left !important; }
    .dt.cards td[data-label]::before { content:attr(data-label); display:inline-block; min-width:96px; color:var(--muted); font:500 10.5px var(--font-mono); letter-spacing:.05em; text-transform:uppercase; }
    .dt.cards td.check-col { position:absolute; right:12px; width:auto; }
    .dt.cards tr { position:relative; }
    .dt.cards td.clip { max-width:none; white-space:normal; }
    .bulkbar { width:calc(100% - 16px); flex-wrap:wrap; }
  }
`;
