/** The command center's own pieces: the period bar, alerts, leaderboard, recommendations, setup, coverage glance. */
export const OVERVIEW_CSS = `
  .ov-toolbar { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px 16px; margin:-4px 0 12px; }
  .release-marks { display:flex; flex-wrap:wrap; align-items:center; gap:4px 14px; margin-top:8px; padding-top:10px; border-top:1px dashed var(--border); color:var(--muted); font-size:11.5px; }
  .release-marks .i { color:var(--faint); }
  .release-marks span { white-space:nowrap; }
  .release-marks b { color:var(--fg); font:600 11.5px var(--font-mono); }
  .list-row .feed-icon { flex:none; }
  .leaders { margin:0; padding:4px 0; list-style:none; }
  .leaders a { display:flex; align-items:center; gap:12px; min-height:46px; padding:6px 16px; color:inherit; text-decoration:none; }
  .leaders a:hover { background:var(--surface-2); }
  .leaders .rank { display:inline-flex; flex:none; align-items:center; justify-content:center; width:20px; height:20px; border:1px solid var(--border-2); border-radius:var(--r-xs); color:var(--muted); font:600 10.5px var(--font-mono); }
  .leaders li:first-child .rank { border-color:var(--ink); background:var(--ink); color:var(--on-ink); }
  .leaders .grow { display:flex; flex-direction:column; gap:1px; }
  .leaders .title { overflow:hidden; color:var(--fg); font:500 12.5px var(--font-mono); text-overflow:ellipsis; white-space:nowrap; }
  .leaders .detail { color:var(--muted); font-size:11px; }
  .leaders .rate { min-width:104px; }
  .insights { margin:0; padding:0; list-style:none; }
  .insight { display:flex; gap:12px; padding:12px 16px; }
  .insight + .insight { border-top:1px solid var(--border); }
  .insight-icon { display:inline-flex; flex:none; align-items:center; justify-content:center; width:26px; height:26px; border-radius:var(--r-sm); background:var(--surface-3); color:var(--fg-2); }
  .insight.critical .insight-icon { background:var(--bad-bg); color:var(--bad-fg); }
  .insight.warning .insight-icon { background:var(--warn-bg); color:var(--warn-fg); }
  .insight.success .insight-icon { background:var(--ok-bg); color:var(--ok-fg); }
  .insight .grow { display:flex; flex-direction:column; gap:3px; }
  .insight-title { color:var(--fg); font-size:12.5px; font-weight:500; line-height:1.4; }
  .insight-detail { color:var(--muted); font-size:12px; line-height:1.5; }
  .insight .link-quiet { margin-top:3px; font-size:11.5px; }
  .setup { margin:0; padding:0; list-style:none; counter-reset:setup; }
  .setup li { display:flex; align-items:center; gap:12px; min-height:48px; padding:6px 0; }
  .setup li + li { border-top:1px solid var(--border); }
  .setup-check { display:inline-flex; flex:none; align-items:center; justify-content:center; width:20px; height:20px; border:1px solid var(--border-3); border-radius:50%; color:transparent; }
  .setup li.done .setup-check { border-color:var(--ok); background:var(--ok); color:#fff; }
  .setup .grow { display:flex; flex-direction:column; gap:1px; }
  .setup .title { color:var(--fg); font-size:12.5px; font-weight:500; }
  .setup li.done .title { color:var(--muted); text-decoration:line-through; text-decoration-color:var(--border-3); }
  .setup .detail { color:var(--muted); font-size:11.5px; }
  .setup-card { display:flex; flex-direction:column; align-items:flex-start; gap:8px; }
  .setup-card h3 { font-size:14px; }
  .setup-card p { margin:0 0 4px; color:var(--muted); font-size:12.5px; }
  .setup-num { display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px; border-radius:var(--r-sm); background:var(--ink); color:var(--on-ink); font:600 12px var(--font-mono); }
  .cov-glance { display:grid; grid-template-columns:minmax(0,1fr) 132px; gap:20px; align-items:start; }
  .cov-mini { display:grid; gap:2px; align-items:center; }
  .cov-mini-h { color:var(--faint); font:500 9.5px var(--font-mono); letter-spacing:.04em; text-align:center; text-transform:uppercase; }
  .cov-mini-k { overflow:hidden; padding-right:8px; color:var(--fg-2); font:400 11px/18px var(--font-mono); text-overflow:ellipsis; white-space:nowrap; }
  .cov-mini-c { display:flex; align-items:center; justify-content:center; height:18px; border-radius:2px; background:color-mix(in srgb, var(--fault) var(--a), var(--surface-3)); color:var(--on-accent); font:600 9.5px var(--font-mono); text-decoration:none; }
  .cov-mini-c[style*="--a:0%"] { background:var(--surface-2); box-shadow:inset 0 0 0 1px var(--border); }
  .cov-mini-c:hover { box-shadow:0 0 0 1.5px var(--fg); }
  .cov-glance-facts { display:flex; flex-direction:column; gap:14px; }
  .cov-glance-facts div { display:flex; flex-direction:column; gap:2px; padding-left:12px; border-left:2px solid var(--border); }
  .cov-glance-facts b { color:var(--fg); font-size:20px; font-weight:600; letter-spacing:-.02em; }
  .cov-glance-facts small { color:var(--muted); font-size:13px; font-weight:500; }
  .cov-glance-facts span { color:var(--muted); font-size:11.5px; }
  @media (max-width: 760px) { .cov-glance { grid-template-columns:minmax(0,1fr); } .cov-glance-facts { flex-direction:row; flex-wrap:wrap; } }
`;
