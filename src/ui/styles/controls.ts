/** Buttons, form controls, segmented controls, tabs, chips, avatars, and status marks. */
export const CONTROLS_CSS = `
  .btn { --btn-h:var(--control); position:relative; display:inline-flex; flex:none; align-items:center; justify-content:center; gap:6px; height:var(--btn-h); padding:0 12px; border:1px solid transparent; border-radius:var(--r-sm); font:500 12.5px/1 var(--font-sans); letter-spacing:-.003em; white-space:nowrap; text-decoration:none; cursor:pointer; user-select:none;
    transition:background var(--t-fast) var(--ease), border-color var(--t-fast) var(--ease), color var(--t-fast) var(--ease), box-shadow var(--t-fast) var(--ease); }
  .btn .i { margin:0 -1px; }
  .btn:disabled, .btn[aria-disabled=true] { opacity:.5; cursor:not-allowed; pointer-events:none; }
  .btn-primary { background:var(--accent-solid); border-color:color-mix(in srgb, var(--accent-solid) 70%, #000); color:var(--on-accent); box-shadow:inset 0 1px 0 rgba(255,255,255,.12), 0 1px 1px rgba(0,0,0,.06); }
  .btn-primary:hover { background:var(--accent-hover); }
  .btn-primary:active { background:color-mix(in srgb, var(--accent-solid) 82%, #000); box-shadow:inset 0 1px 2px rgba(0,0,0,.18); }
  .btn-ink { background:var(--ink); color:var(--on-ink); }
  .btn-ink:hover { background:color-mix(in srgb, var(--ink) 86%, var(--canvas)); }
  .btn-secondary { background:var(--surface); border-color:var(--border-2); color:var(--fg); box-shadow:inset 0 -1px 0 light-dark(rgba(27,26,23,.05), rgba(0,0,0,.3)); }
  .btn-secondary:hover { border-color:var(--border-3); background:var(--surface-2); }
  .btn-secondary:active { background:var(--surface-3); box-shadow:none; }
  .btn-ghost { background:transparent; color:var(--fg-2); }
  .btn-ghost:hover { background:var(--surface-3); color:var(--fg); }
  .btn-danger { background:var(--surface); border-color:var(--harm-bd); color:var(--bad-fg); }
  .btn-danger:hover { background:var(--bad-bg); border-color:var(--harm); }
  .btn-danger-solid { background:var(--harm); border-color:color-mix(in srgb, var(--harm) 70%, #000); color:#fff; }
  .btn-danger-solid:hover { background:color-mix(in srgb, var(--harm) 88%, #000); }
  .btn-link { height:auto; padding:0; border:0; background:none; color:var(--fg-2); font-weight:500; }
  .btn-link:hover { color:var(--fg); text-decoration:underline; text-underline-offset:3px; }
  .btn-sm { --btn-h:var(--control-sm); padding:0 9px; font-size:12px; gap:5px; }
  .btn-lg { --btn-h:38px; padding:0 16px; font-size:13.5px; }
  .btn-icon { width:var(--btn-h); padding:0; }
  .btn-block { width:100%; }
  .btn.is-busy { color:transparent !important; }
  .btn.is-busy::after { content:""; position:absolute; width:12px; height:12px; border:1.5px solid var(--fg-2); border-right-color:transparent; border-radius:50%; animation:spin .7s linear infinite; }
  .btn-primary.is-busy::after { border-color:#fff; border-right-color:transparent; }
  .btn .btn-kbd { margin:0 -3px 0 4px; height:16px; min-width:16px; border-color:color-mix(in srgb, currentColor 25%, transparent); background:transparent; color:inherit; opacity:.75; }
  .btn-group { display:inline-flex; }
  .btn-group > .btn { border-radius:0; }
  .btn-group > .btn:not(:first-child) { margin-left:-1px; }
  .btn-group > .btn:first-child { border-radius:var(--r-sm) 0 0 var(--r-sm); }
  .btn-group > .btn:last-child { border-radius:0 var(--r-sm) var(--r-sm) 0; }
  .btn-group > .btn:hover { z-index:1; }
  .icon-btn { display:inline-flex; flex:none; align-items:center; justify-content:center; width:30px; height:30px; padding:0; border:1px solid transparent; border-radius:var(--r-sm); background:transparent; color:var(--muted); cursor:pointer; transition:background var(--t-fast), color var(--t-fast), border-color var(--t-fast); }
  .icon-btn:hover { background:var(--surface-3); color:var(--fg); }
  .icon-btn.sm { width:24px; height:24px; }
  .icon-btn[aria-pressed=true], .icon-btn.on { background:var(--surface-3); color:var(--fg); }
  .link { color:var(--fg); font-weight:500; text-decoration:none; }
  .link:hover { text-decoration:underline; text-underline-offset:3px; }
  .link-quiet { display:inline-flex; align-items:center; gap:4px; color:var(--muted); font-size:12px; text-decoration:none; white-space:nowrap; }
  .link-quiet:hover { color:var(--fg); }
  .link-mono { color:var(--fg); font:500 12px/1.4 var(--font-mono); text-decoration:none; }
  .link-mono:hover { text-decoration:underline; text-underline-offset:3px; }

  .field { display:flex; flex-direction:column; gap:6px; min-width:0; }
  .field-label { display:flex; align-items:center; gap:6px; color:var(--fg-2); font-size:12px; font-weight:500; }
  .field-label .opt { color:var(--faint); font-weight:400; }
  .field-hint { color:var(--muted); font-size:11.5px; line-height:1.45; }
  .field-error { color:var(--bad-fg); font-size:11.5px; }
  .input { width:100%; height:var(--control); padding:0 10px; border:1px solid var(--border-2); border-radius:var(--r-sm); background:var(--surface); color:var(--fg); font-size:12.5px; outline:0; box-shadow:inset 0 1px 1px light-dark(rgba(27,26,23,.03), rgba(0,0,0,.2)); transition:border-color var(--t-fast), box-shadow var(--t-fast); }
  .input::placeholder { color:var(--faint); }
  .input:hover { border-color:var(--border-3); }
  .input:focus { border-color:var(--focus); box-shadow:0 0 0 3px var(--accent-soft); }
  .input:disabled { background:var(--surface-2); color:var(--muted); cursor:not-allowed; }
  .input.mono { font:12px var(--font-mono); }
  textarea.input { height:auto; min-height:84px; padding:8px 10px; line-height:1.5; resize:vertical; }
  select.input { padding-right:28px; appearance:none; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2377726a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m7 10 5 5 5-5'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 7px center; cursor:pointer; }
  .input-wrap { position:relative; display:flex; align-items:center; min-width:0; }
  .input-wrap > .i { position:absolute; left:10px; color:var(--faint); pointer-events:none; }
  .input-wrap > .input { padding-left:32px; }
  .input-wrap > kbd { position:absolute; right:7px; pointer-events:none; }
  .input-wrap > .input:focus ~ kbd { display:none; }
  .input-wrap > .clear { position:absolute; right:4px; }
  .search { width:min(320px, 100%); }
  .stepper { display:inline-flex; align-items:stretch; height:var(--control); border:1px solid var(--border-2); border-radius:var(--r-sm); background:var(--surface); overflow:hidden; }
  .stepper input { width:56px; border:0; background:transparent; text-align:center; font:12.5px var(--font-mono); outline:0; -moz-appearance:textfield; }
  .stepper input::-webkit-inner-spin-button { appearance:none; }
  .stepper button { width:28px; border:0; background:transparent; color:var(--muted); cursor:pointer; }
  .stepper button:hover { background:var(--surface-3); color:var(--fg); }
  .stepper button:first-child { border-right:1px solid var(--border); } .stepper button:last-child { border-left:1px solid var(--border); }

  .check { position:relative; display:inline-flex; flex:none; align-items:center; gap:8px; cursor:pointer; }
  .check input { position:absolute; inset:0; margin:0; opacity:0; cursor:pointer; }
  .check-box { display:inline-flex; flex:none; align-items:center; justify-content:center; width:15px; height:15px; border:1px solid var(--border-3); border-radius:var(--r-xs); background:var(--surface); color:transparent; transition:background var(--t-fast), border-color var(--t-fast); }
  .check input:checked + .check-box { border-color:var(--ink); background:var(--ink); color:var(--on-ink); }
  .check input:indeterminate + .check-box { border-color:var(--ink); background:var(--ink); color:var(--on-ink); }
  .check input:focus-visible + .check-box { outline:2px solid var(--focus); outline-offset:2px; }
  .check:hover .check-box { border-color:var(--fg-2); }
  .check-label { color:var(--fg-2); font-size:12.5px; }
  .switch { position:relative; display:inline-flex; flex:none; align-items:center; gap:10px; cursor:pointer; }
  .switch input { position:absolute; inset:0; margin:0; opacity:0; cursor:pointer; }
  .switch-track { position:relative; width:30px; height:18px; border-radius:var(--r-full); background:var(--border-2); transition:background var(--t-med) var(--ease); }
  .switch-track::after { content:""; position:absolute; top:2px; left:2px; width:14px; height:14px; border-radius:50%; background:#fff; box-shadow:0 1px 2px rgba(0,0,0,.25); transition:transform var(--t-med) var(--ease); }
  .switch input:checked + .switch-track { background:var(--ink); }
  .switch input:checked + .switch-track::after { transform:translateX(12px); }
  .switch input:focus-visible + .switch-track { outline:2px solid var(--focus); outline-offset:2px; }
  .radio-card { position:relative; display:flex; gap:10px; padding:10px 12px; border:1px solid var(--border-2); border-radius:var(--r-sm); background:var(--surface); cursor:pointer; transition:border-color var(--t-fast), background var(--t-fast); }
  .radio-card:hover { border-color:var(--border-3); }
  .radio-card input { position:absolute; opacity:0; }
  .radio-card:has(input:checked) { border-color:var(--ink); box-shadow:inset 0 0 0 1px var(--ink); }
  .radio-card:has(input:focus-visible) { outline:2px solid var(--focus); outline-offset:2px; }

  .seg { display:inline-flex; flex:none; align-items:center; gap:2px; height:var(--control); padding:2px; border:1px solid var(--border); border-radius:var(--r-sm); background:var(--surface-3); }
  .seg-btn { display:inline-flex; align-items:center; gap:6px; height:100%; padding:0 10px; border:0; border-radius:3px; background:transparent; color:var(--muted); font-size:12px; font-weight:500; white-space:nowrap; cursor:pointer; transition:background var(--t-fast), color var(--t-fast); }
  .seg-btn:hover { color:var(--fg); }
  .seg-btn.on, .seg-btn[aria-pressed=true] { background:var(--surface); color:var(--fg); box-shadow:0 1px 2px light-dark(rgba(27,26,23,.1), rgba(0,0,0,.5)), 0 0 0 1px var(--border); }
  .seg-count { color:var(--faint); font:500 11px var(--font-mono); }
  .seg-btn.on .seg-count { color:var(--muted); }
  .seg-wrap { flex-wrap:wrap; height:auto; }
  .seg-wrap .seg-btn { height:26px; }

  .tabs { display:flex; align-items:stretch; gap:20px; min-width:0; overflow-x:auto; border-bottom:1px solid var(--border); scrollbar-width:none; }
  .tab { position:relative; display:inline-flex; flex:none; align-items:center; gap:7px; height:38px; padding:0 1px; border:0; background:none; color:var(--muted); font-size:13px; font-weight:500; white-space:nowrap; text-decoration:none; cursor:pointer; transition:color var(--t-fast); }
  .tab:hover { color:var(--fg); }
  .tab.on, .tab[aria-selected=true] { color:var(--fg); }
  .tab.on::after, .tab[aria-selected=true]::after { content:""; position:absolute; right:0; bottom:-1px; left:0; height:2px; border-radius:2px 2px 0 0; background:var(--ink); }
  .tab-count { min-width:18px; height:17px; padding:0 5px; border-radius:var(--r-full); background:var(--surface-3); color:var(--muted); font:500 10.5px/17px var(--font-mono); text-align:center; }
  .tab.on .tab-count { background:var(--ink); color:var(--on-ink); }

  .tag { display:inline-flex; align-items:center; gap:5px; height:24px; padding:0 9px; border:1px solid var(--border-2); border-radius:var(--r-full); background:var(--surface); color:var(--fg-2); font-size:12px; white-space:nowrap; cursor:pointer; transition:background var(--t-fast), border-color var(--t-fast), color var(--t-fast); }
  .tag:hover { border-color:var(--border-3); color:var(--fg); }
  .tag.on, .tag[aria-pressed=true] { border-color:var(--ink); background:var(--ink); color:var(--on-ink); }
  .tag.static { cursor:default; }
  .tag .x { margin-right:-4px; opacity:.6; }
  .chip-row { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
  .pill { display:inline-flex; align-items:center; gap:5px; height:20px; padding:0 8px; border-radius:var(--r-full); background:var(--surface-3); color:var(--fg-2); font-size:11px; font-weight:500; white-space:nowrap; }
  .pill.ok { background:var(--ok-bg); color:var(--ok-fg); } .pill.bad { background:var(--bad-bg); color:var(--bad-fg); } .pill.warn { background:var(--warn-bg); color:var(--warn-fg); } .pill.accent { background:var(--accent-soft); color:var(--accent-fg); } .pill.info { background:var(--info-bg); color:var(--info-fg); }
  .pill.outline { border:1px solid var(--border-2); background:transparent; }
  .world-chip { display:inline-flex; align-items:center; gap:5px; height:22px; padding:0 8px 0 6px; border:1px solid var(--border); border-radius:var(--r-xs); background:var(--surface-2); color:var(--fg-2); font-size:11.5px; white-space:nowrap; }
  .world-chip .i { color:var(--muted); }
  .fault-tag { display:inline-flex; align-items:center; gap:5px; max-width:100%; height:22px; padding:0 8px 0 6px; border:1px solid var(--fault-bd); border-radius:var(--r-xs); background:var(--fault-bg); color:var(--fault-fg); font:500 11px/1 var(--font-mono); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .fault-tag .i { color:var(--fault); }
  .code-chip { display:inline-flex; align-items:center; height:20px; padding:0 6px; border:1px solid var(--border); border-radius:var(--r-xs); background:var(--surface-2); color:var(--fg-2); font:500 11px/1 var(--font-mono); white-space:nowrap; }
  button.code-chip { cursor:pointer; } button.code-chip:hover { border-color:var(--border-3); color:var(--fg); }
  .src-tag { display:inline-flex; align-items:center; height:18px; padding:0 6px; border:1px dashed var(--border-3); border-radius:var(--r-xs); color:var(--muted); font:500 10.5px/1 var(--font-mono); white-space:nowrap; }
  .vcode { display:inline-flex; align-items:center; justify-content:center; min-width:26px; height:18px; padding:0 4px; border:1px solid var(--v-bd, var(--border)); border-radius:var(--r-xs); background:var(--v-bg, var(--surface-2)); color:var(--v-fg, var(--fg-2)); font:600 10px/1 var(--font-mono); letter-spacing:.02em; }

  .filter-btn.active { border-color:var(--ink); }
  .filter-count { min-width:16px; height:16px; padding:0 4px; border-radius:var(--r-full); background:var(--ink); color:var(--on-ink); font:600 10px/16px var(--font-mono); text-align:center; }
  .avatar { --av:var(--c2); display:inline-flex; flex:none; align-items:center; justify-content:center; width:28px; height:28px; border-radius:var(--r-sm); background:color-mix(in srgb, var(--av) 16%, var(--surface)); box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--av) 30%, transparent); color:var(--av); font:600 11px/1 var(--font-sans); letter-spacing:.02em; text-transform:uppercase; }
  .avatar.lg { width:56px; height:56px; border-radius:var(--r-md); font-size:19px; }
  .avatar.sm { width:22px; height:22px; font-size:9.5px; }
  .avatar.clay { --av:var(--c2); } .avatar.moss { --av:var(--c8); } .avatar.slate { --av:var(--c1); } .avatar.plum { --av:var(--c4); } .avatar.ochre { --av:var(--c5); } .avatar.teal { --av:var(--c3); }
  .glyph { display:inline-flex; flex:none; align-items:center; justify-content:center; width:28px; height:28px; border:1px solid var(--border); border-radius:var(--r-sm); background:var(--surface-2); color:var(--fg-2); }
  .glyph.lg { width:40px; height:40px; }
  .status-dot { --sd:var(--faint); display:inline-block; flex:none; width:8px; height:8px; border-radius:50%; background:var(--sd); }
  .status-dot.ok { --sd:var(--ok); } .status-dot.bad { --sd:var(--bad); } .status-dot.warn { --sd:var(--warn); } .status-dot.accent { --sd:var(--accent-solid); }
  .status-dot.live { --sd:var(--ok); --live:var(--ok); animation:live-ring 1.6s var(--ease) infinite; }
  .status-dot.running { --sd:var(--accent-solid); --live:var(--accent-solid); animation:live-ring 1.2s var(--ease) infinite; }
  .delta { display:inline-flex; align-items:center; gap:2px; font:500 11.5px/1 var(--font-mono); white-space:nowrap; }
  .delta.up { color:var(--ok-fg); } .delta.down { color:var(--bad-fg); } .delta.flat { color:var(--muted); }
  .delta.inverse.up { color:var(--bad-fg); } .delta.inverse.down { color:var(--ok-fg); }
`;
