/** Styles of the pages for: activity and settings. */
export const WORKSPACE_CSS = `
  .act-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin:0 0 10px; }
  .act-toolbar .input-wrap.search { flex:1 1 260px; max-width:440px; }
  .act-toolbar select.input { width:auto; }
  .act-cats { margin:0 0 16px; }
  .act-feed .feed-day { justify-content:space-between; }
  .act-day-count { color:var(--faint); font:400 11px var(--font-sans); letter-spacing:0; text-transform:none; }
  .act-meta { display:flex; flex-wrap:wrap; align-items:center; gap:4px 8px; margin-top:6px; color:var(--muted); font-size:11.5px; }
  .act-kind { display:inline-flex; align-items:center; gap:4px; color:var(--fg-2); }
  .act-kind .i { color:var(--muted); }
  .act-type { color:var(--faint); font:400 11px var(--font-mono); }
  .act-actor { color:var(--faint); }
  .act-item.unread .feed-title::after { content:""; display:inline-block; width:6px; height:6px; margin-left:8px; border-radius:var(--r-full); background:var(--accent-solid); vertical-align:middle; }
  .act-item .feed-meta { font-variant-numeric:tabular-nums; }
  .act-more { display:flex; align-items:center; gap:12px; padding:12px 16px; border-top:1px solid var(--border); }
  .act-volume { display:flex; justify-content:space-between; gap:8px; margin-top:6px; color:var(--muted); font:400 11px var(--font-mono); }
  .act-volume span:nth-child(2) { color:var(--fg-2); }

  .set-layout { display:grid; grid-template-columns:220px minmax(0,1fr); gap:24px; align-items:start; }
  .set-nav { position:sticky; top:calc(var(--topbar) + 16px); display:flex; flex-direction:column; gap:2px; }
  .set-nav-item { display:flex; align-items:flex-start; gap:10px; padding:8px 10px; border-radius:var(--r-sm); color:var(--fg-2); text-decoration:none; }
  .set-nav-item .i { margin-top:2px; color:var(--muted); }
  .set-nav-item:hover { background:var(--surface-2); color:var(--fg); }
  .set-nav-item.on { background:var(--surface); box-shadow:inset 0 0 0 1px var(--border-2); color:var(--fg); }
  .set-nav-item.on .i { color:var(--fg); }
  .set-nav-text { display:flex; flex-direction:column; gap:1px; min-width:0; font-size:13px; font-weight:500; }
  .set-nav-text small { color:var(--muted); font-size:11.5px; font-weight:400; }
  .set-main { display:flex; flex-direction:column; gap:16px; min-width:0; }
  .set-main > .grid.mt-16 { margin-top:0; }
  .set-row { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:12px 0; }
  .set-row:first-child { padding-top:0; }
  .set-row:last-child { padding-bottom:0; }
  .set-row + .set-row { border-top:1px solid var(--border); }
  .set-row-text { display:flex; flex-direction:column; gap:2px; min-width:0; }
  .set-row-label { color:var(--fg); font-size:13px; font-weight:500; }
  .set-row-hint { color:var(--muted); font-size:12px; line-height:1.45; }
  .set-row-control { display:flex; flex:none; align-items:center; gap:8px; }
  .set-themes { display:flex; flex-wrap:wrap; gap:8px; }
  .set-theme { align-items:center; gap:8px; padding:8px 12px; font-size:12.5px; }
  .set-form { display:grid; grid-template-columns:240px minmax(0,1fr); gap:24px; }
  .set-profile-preview { display:flex; flex-direction:column; align-items:flex-start; align-self:start; gap:12px; padding:16px; border:1px solid var(--border); border-radius:var(--r-md); background:var(--surface-2); }
  .set-profile-preview > div { display:flex; flex-direction:column; gap:3px; min-width:0; max-width:100%; }
  .set-profile-preview b { overflow-wrap:anywhere; color:var(--fg); font-size:15px; }
  .set-profile-preview span { overflow-wrap:anywhere; color:var(--fg-2); font-size:12.5px; }
  .set-fields { display:flex; flex-direction:column; gap:14px; max-width:520px; }
  .set-swatches { display:flex; flex-wrap:wrap; gap:8px; }
  .set-swatch { align-items:center; gap:8px; padding:6px 10px 6px 6px; font-size:12px; text-transform:capitalize; }
  .set-actions { display:flex; gap:8px; padding-top:4px; }
  .set-list { display:flex; flex-direction:column; gap:6px; margin:0 0 12px; padding:0; list-style:none; }
  .set-list li { display:flex; align-items:center; gap:8px; }
  .set-p { max-width:72ch; margin:0 0 12px; color:var(--fg-2); font-size:13px; line-height:1.55; }
  .set-cmd { display:flex; align-items:center; gap:8px; min-width:0; margin:0 0 12px; }
  .set-cmd .code-chip { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .set-note { margin:8px 0 0; color:var(--muted); font-size:12px; }
  .set-provider-foot { border-top:1px solid var(--border); }
  .set-provider-foot p { margin:0; }
  .set-danger .panel-title .i { color:var(--bad-fg); }

  @media (max-width: 1024px) {
    .set-layout { grid-template-columns:minmax(0,1fr); gap:16px; }
    .set-nav { position:static; flex-direction:row; gap:4px; overflow-x:auto; padding-bottom:2px; scrollbar-width:none; }
    .set-nav-item { flex:none; align-items:center; padding:6px 10px; }
    .set-nav-item .i { margin-top:0; }
    .set-nav-text small { display:none; }
  }
  @media (max-width: 760px) {
    .act-toolbar .input-wrap.search { flex-basis:100%; max-width:none; }
    .set-form { grid-template-columns:minmax(0,1fr); }
    .set-row { flex-direction:column; align-items:flex-start; gap:8px; }
    .set-profile-preview { flex-direction:row; align-items:center; width:100%; }
  }
`;
