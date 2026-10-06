/** Menus, tooltips, dialogs, drawers, toasts, the search overlay, and the notification center. */
export const OVERLAYS_CSS = `
  .menu { position:fixed; z-index:var(--z-menu); display:flex; flex-direction:column; min-width:200px; max-width:320px; max-height:min(420px, 70vh); padding:4px; overflow:auto; border:1px solid var(--border-2); border-radius:var(--r-md); background:var(--surface); box-shadow:var(--shadow-pop); animation:rise-in var(--t-fast) var(--ease); }
  .menu-item { display:flex; align-items:center; gap:9px; width:100%; min-height:30px; padding:0 8px; border:0; border-radius:var(--r-xs); background:none; color:var(--fg); font-size:12.5px; text-align:left; text-decoration:none; white-space:nowrap; cursor:pointer; }
  .menu-item .i { color:var(--muted); }
  .menu-item:hover, .menu-item:focus-visible, .menu-item.active { background:var(--surface-3); outline:0; }
  .menu-item.danger { color:var(--bad-fg); } .menu-item.danger .i { color:var(--bad-fg); }
  .menu-item kbd, .menu-item .menu-hint { margin-left:auto; color:var(--faint); }
  .menu-item[aria-checked=true]::after { content:""; width:6px; height:6px; margin-left:auto; border-radius:50%; background:var(--accent-solid); }
  .menu-sep { height:1px; margin:4px -4px; background:var(--border); }
  .checklist { width:260px; max-width:min(320px, calc(100vw - 16px)); }
  .checklist-items { max-height:280px; overflow:auto; }
  .checklist label.menu-item { gap:8px; }
  .menu-label { padding:8px 8px 4px; color:var(--faint); font:500 10px/1 var(--font-mono); letter-spacing:.08em; text-transform:uppercase; }

  .tip { position:fixed; z-index:var(--z-tip); max-width:300px; padding:7px 9px; border-radius:var(--r-sm); background:var(--ink); color:var(--on-ink); font:500 11.5px/1.45 var(--font-sans); white-space:pre-line; pointer-events:none; box-shadow:var(--shadow-pop); animation:fade-in var(--t-fast) var(--ease); }
  .tip b { font-weight:600; }
  .tip .tip-row { display:flex; align-items:center; gap:8px; justify-content:space-between; font-family:var(--font-mono); font-size:11px; }
  .tip .tip-row i { display:inline-block; width:7px; height:7px; border-radius:1.5px; background:var(--v, var(--sw)); }
  .tip .tip-title { display:block; margin-bottom:4px; font-family:var(--font-sans); font-size:11.5px; font-weight:600; }

  dialog.modal { width:min(520px, calc(100vw - 32px)); max-height:calc(100dvh - 48px); padding:0; overflow:hidden; border:1px solid var(--border-2); border-radius:var(--r-md); background:var(--surface); color:var(--fg); box-shadow:var(--shadow-modal); }
  dialog.modal::backdrop { background:var(--overlay); }
  dialog.modal[open] { display:flex; flex-direction:column; animation:rise-in var(--t-med) var(--ease); }
  dialog.modal.wide { width:min(760px, calc(100vw - 32px)); }
  .modal form { display:flex; flex-direction:column; min-height:0; }
  .modal-head { display:flex; align-items:flex-start; gap:12px; padding:18px 20px 0; }
  .modal-head h2 { font-size:15px; }
  .modal-head p { margin:4px 0 0; color:var(--fg-2); font-size:12.5px; line-height:1.55; }
  .modal-icon { display:inline-flex; flex:none; align-items:center; justify-content:center; width:34px; height:34px; border:1px solid var(--border); border-radius:var(--r-sm); background:var(--surface-2); color:var(--fg-2); }
  .modal-icon.danger { border-color:var(--harm-bd); background:var(--bad-bg); color:var(--bad-fg); }
  .modal-body { padding:16px 20px; overflow:auto; }
  .modal-foot { display:flex; align-items:center; justify-content:flex-end; gap:8px; padding:12px 20px; border-top:1px solid var(--border); background:var(--surface-2); }
  .modal-foot .hint { margin-right:auto; color:var(--muted); font-size:11.5px; }

  .drawer-root { position:fixed; inset:0; z-index:var(--z-drawer); }
  .drawer-scrim { position:absolute; inset:0; background:var(--overlay); animation:fade-in var(--t-med) var(--ease); }
  .drawer { position:absolute; top:0; right:0; bottom:0; display:flex; flex-direction:column; width:min(520px, 100vw); border-left:1px solid var(--border-2); background:var(--surface); box-shadow:var(--shadow-modal); animation:slide-in-right var(--t-slow) var(--ease); }
  .drawer.wide { width:min(720px, 100vw); }
  .drawer-head { display:flex; align-items:center; gap:10px; min-height:var(--topbar); padding:0 12px 0 18px; border-bottom:1px solid var(--border); }
  .drawer-head h2 { flex:1; min-width:0; overflow:hidden; font-size:14px; text-overflow:ellipsis; white-space:nowrap; }
  .drawer-body { flex:1; min-height:0; padding:16px 18px; overflow:auto; }
  .drawer-foot { display:flex; align-items:center; gap:8px; padding:12px 18px; border-top:1px solid var(--border); background:var(--surface-2); }

  .toasts { position:fixed; right:16px; bottom:16px; z-index:var(--z-toast); display:flex; flex-direction:column; align-items:flex-end; gap:8px; pointer-events:none; }
  .toast { display:flex; align-items:flex-start; gap:10px; width:min(400px, calc(100vw - 32px)); padding:11px 10px 11px 13px; border:1px solid var(--border-2); border-radius:var(--r-md); background:var(--surface); color:var(--fg); box-shadow:var(--shadow-pop); font-size:12.5px; line-height:1.45; pointer-events:auto; animation:slide-in-right var(--t-med) var(--ease); transition:opacity var(--t-med), transform var(--t-med); }
  .toast.out { opacity:0; transform:translateX(12px); }
  .toast > .i, .toast > .spinner { margin-top:2px; }
  .toast-ok > .i { color:var(--ok-fg); } .toast-bad > .i { color:var(--bad-fg); } .toast-info > .i { color:var(--muted); } .toast-progress { color:var(--fg); }
  .toast-bad { border-color:var(--harm-bd); }
  .toast-body { flex:1; min-width:0; }
  .toast-title { display:block; font-weight:600; }
  .toast-text { color:var(--fg-2); }
  .toast-action { flex:none; align-self:center; color:var(--fg); font-weight:600; font-size:12px; text-decoration:none; }
  .toast-action:hover { text-decoration:underline; text-underline-offset:3px; }
  .toast .progress { margin-top:8px; }

  .search-root { position:fixed; inset:0; z-index:var(--z-modal); display:flex; justify-content:center; padding:10vh 16px 16px; }
  .search-scrim { position:absolute; inset:0; background:var(--overlay); animation:fade-in var(--t-fast) var(--ease); }
  .search-panel { position:relative; display:grid; grid-template-rows:auto auto minmax(0,1fr) auto; width:min(880px, 100%); max-height:min(640px, 80vh); overflow:hidden; border:1px solid var(--border-2); border-radius:var(--r-md); background:var(--surface); box-shadow:var(--shadow-modal); animation:rise-in var(--t-med) var(--ease); }
  .search-input { display:flex; align-items:center; gap:10px; height:52px; padding:0 14px 0 16px; border-bottom:1px solid var(--border); }
  .search-input .i { color:var(--muted); }
  .search-input input { flex:1; min-width:0; height:100%; border:0; background:transparent; color:var(--fg); font-size:15px; outline:0; }
  .search-input input::placeholder { color:var(--faint); }
  .search-scopes { display:flex; gap:4px; padding:8px 12px; overflow-x:auto; border-bottom:1px solid var(--border); scrollbar-width:none; }
  .scope { display:inline-flex; flex:none; align-items:center; gap:6px; height:26px; padding:0 10px; border:1px solid var(--border); border-radius:var(--r-full); background:var(--surface); color:var(--muted); font-size:12px; cursor:pointer; }
  .scope:hover { color:var(--fg); border-color:var(--border-3); }
  .scope.on { border-color:var(--ink); background:var(--ink); color:var(--on-ink); }
  .scope b { font:500 10.5px var(--font-mono); opacity:.7; }
  .search-main { display:grid; grid-template-columns:minmax(0,1fr) 300px; min-height:0; }
  .search-results { min-height:0; padding:6px; overflow-y:auto; }
  .search-group { padding:10px 10px 4px; color:var(--faint); font:500 10px/1 var(--font-mono); letter-spacing:.08em; text-transform:uppercase; }
  .search-group span { margin-left:6px; color:var(--faint); }
  .search-item { display:flex; align-items:center; gap:10px; min-height:38px; padding:5px 10px; border-radius:var(--r-sm); color:var(--fg); cursor:pointer; }
  .search-item .glyph { width:26px; height:26px; }
  .search-item.active { background:var(--surface-3); }
  .search-item .si-text { display:flex; flex:1; flex-direction:column; min-width:0; }
  .search-item .si-label { overflow:hidden; font-size:12.5px; font-weight:500; text-overflow:ellipsis; white-space:nowrap; }
  .search-item .si-label mark { background:var(--accent-soft); color:var(--accent-fg); border-radius:2px; }
  .search-item .si-detail { overflow:hidden; color:var(--muted); font-size:11.5px; text-overflow:ellipsis; white-space:nowrap; }
  .search-item .si-go { color:var(--faint); opacity:0; }
  .search-item.active .si-go { opacity:1; }
  .search-preview { min-height:0; padding:16px; overflow-y:auto; border-left:1px solid var(--border); background:var(--surface-2); }
  .search-preview h3 { margin:8px 0 6px; font-size:13.5px; overflow-wrap:anywhere; }
  .search-preview p { margin:0 0 12px; color:var(--fg-2); font-size:12px; line-height:1.55; }
  .search-preview .facts dt, .search-preview .facts dd { padding:6px 0; font-size:11.5px; }
  .search-foot { display:flex; align-items:center; gap:14px; height:36px; padding:0 14px; border-top:1px solid var(--border); background:var(--surface-2); color:var(--muted); font-size:11.5px; }
  .search-foot span { display:inline-flex; align-items:center; gap:4px; }
  .search-empty { padding:40px 20px; color:var(--muted); font-size:12.5px; text-align:center; }
  .search-recent { display:flex; flex-wrap:wrap; gap:6px; padding:4px 10px 10px; }

  .notif-panel { position:fixed; top:calc(var(--topbar) - 4px); right:12px; z-index:var(--z-menu); display:flex; flex-direction:column; width:min(420px, calc(100vw - 24px)); max-height:min(620px, calc(100dvh - 80px)); border:1px solid var(--border-2); border-radius:var(--r-md); background:var(--surface); box-shadow:var(--shadow-pop); animation:rise-in var(--t-fast) var(--ease); }
  .notif-head { display:flex; align-items:center; gap:8px; padding:12px 12px 0 16px; }
  .notif-head h2 { flex:1; font-size:14px; }
  .notif-tabs { display:flex; gap:16px; padding:0 16px; border-bottom:1px solid var(--border); }
  .notif-tabs .tab { height:36px; font-size:12.5px; }
  .notif-list { flex:1; min-height:0; margin:0; padding:0; overflow-y:auto; list-style:none; }
  .notif { position:relative; display:grid; grid-template-columns:28px minmax(0,1fr) auto; gap:10px; padding:12px 14px 12px 16px; border-bottom:1px solid var(--border); cursor:pointer; }
  .notif:hover { background:var(--surface-2); }
  .notif.unread::before { content:""; position:absolute; top:18px; left:6px; width:5px; height:5px; border-radius:50%; background:var(--accent-solid); }
  .notif .n-title { display:block; color:var(--fg); font-size:12.5px; font-weight:500; line-height:1.4; }
  .notif.unread .n-title { font-weight:600; }
  .notif .n-detail { display:block; margin-top:2px; color:var(--muted); font-size:11.5px; line-height:1.45; }
  .notif .n-meta { display:flex; align-items:center; gap:6px; margin-top:6px; color:var(--faint); font:400 10.5px var(--font-mono); }
  .notif .n-actions { display:flex; flex-direction:column; gap:2px; opacity:0; transition:opacity var(--t-fast); }
  .notif:hover .n-actions, .notif:focus-within .n-actions { opacity:1; }
  .notif-foot { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 12px; border-top:1px solid var(--border); background:var(--surface-2); border-radius:0 0 var(--r-md) var(--r-md); }

  .shortcuts { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:4px 32px; }
  .shortcuts section h3 { margin:12px 0 6px; color:var(--muted); font:500 10.5px var(--font-mono); letter-spacing:.07em; text-transform:uppercase; }
  .shortcuts dl { margin:0; }
  .shortcuts dl div { display:flex; align-items:center; justify-content:space-between; gap:12px; height:28px; border-bottom:1px solid var(--border); font-size:12.5px; }
  .shortcuts dt { color:var(--fg-2); } .shortcuts dd { display:flex; gap:3px; margin:0; }

  @media (max-width: 760px) {
    .search-root { padding:0; }
    .search-panel { max-height:none; height:100dvh; border-radius:0; }
    .search-main { grid-template-columns:minmax(0,1fr); }
    .search-preview, .search-foot { display:none; }
    .notif-panel { top:0; right:0; width:100vw; max-height:100dvh; height:100dvh; border-radius:0; }
    .drawer { width:100vw; }
    .shortcuts { grid-template-columns:minmax(0,1fr); }
    .toasts { right:8px; bottom:calc(var(--tabbar) + 8px); left:8px; align-items:stretch; }
    .toast { width:auto; }
  }
`;
