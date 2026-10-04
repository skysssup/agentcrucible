import { BASE_CSS } from "../html.js";

/** Styles for the local UI, on top of the colors and badges the HTML reports use. */
export const UI_CSS = `${BASE_CSS}
  header.top { position:sticky; top:0; z-index:5; display:flex; align-items:center; gap:18px; padding:10px 20px; border-bottom:1px solid var(--border); background:var(--bg); }
  header.top .brand { font-weight:700; font-size:15px; text-decoration:none; color:inherit; }
  header.top nav { display:flex; gap:4px; flex-wrap:wrap; flex:1; }
  header.top nav a { padding:4px 10px; border-radius:6px; text-decoration:none; color:var(--muted); }
  header.top nav a.active { background:var(--chip); color:var(--fg); font-weight:600; }
  header.top .version { color:var(--muted); font-size:12px; }
  main.view { max-width:1280px; margin:0 auto; padding:20px 20px 64px; }
  h1 { font-size:20px; margin:0 0 6px; } h2 { font-size:16px; margin:18px 0 8px; } h3 { font-size:12px; margin:14px 0 6px; text-transform:uppercase; letter-spacing:.03em; color:var(--muted); }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:12px; margin:12px 0; }
  .card { border:1px solid var(--border); border-radius:8px; padding:12px 14px; background:var(--panel); text-decoration:none; color:inherit; display:block; }
  .card .num { font-size:24px; font-weight:700; } .card .label { color:var(--muted); }
  .grid2 { display:grid; grid-template-columns:minmax(0,3fr) minmax(0,2fr); gap:16px; }
  @media (max-width: 960px) { .grid2 { grid-template-columns:1fr; } }
  .toolbar { display:flex; flex-wrap:wrap; gap:8px 12px; align-items:center; margin:8px 0 12px; }
  input[type=search], input[type=text], input[type=number], select, textarea { background:var(--bg); border:1px solid var(--border); border-radius:6px; padding:5px 8px; }
  input[type=search] { min-width:260px; } input[type=number] { width:80px; }
  input, select, textarea { box-sizing:border-box; }
  table code { white-space:nowrap; }
  h1 code { font-size:17px; }
  pre.source { white-space:pre; overflow:auto; max-height:70vh; }
  .ev { white-space:nowrap; margin:1px 0; }
  .spacer { flex:1; }
  button, .button { border:1px solid var(--border); background:var(--panel); border-radius:6px; padding:5px 12px; cursor:pointer; text-decoration:none; color:inherit; display:inline-block; }
  button.primary { background:#1f6feb; border-color:#1f6feb; color:#fff; font-weight:600; }
  button:disabled { opacity:.55; cursor:default; }
  .tags { display:inline-flex; flex-wrap:wrap; gap:4px; }
  .tag { padding:0 7px; border-radius:999px; border:1px solid var(--border); font-size:12px; cursor:pointer; background:var(--bg); }
  .tag.on { background:var(--chip); font-weight:600; }
  .agents { display:flex; flex-wrap:wrap; gap:6px 14px; margin:6px 0; }
  .agents label { white-space:nowrap; }
  td .badge { font-size:11px; } .matrix td, .matrix th { text-align:center; } .matrix td:first-child, .matrix th:first-child { text-align:left; }
  .cell { display:block; text-decoration:none; color:inherit; padding:2px; border-radius:6px; } .cell:hover { background:var(--panel); }
  .cell .why { display:block; color:var(--muted); font-size:12px; max-width:260px; margin:2px auto 0; text-align:left; }
  .mark-ok { color:var(--state); font-weight:700; } .mark-bad { color:var(--bad-fg); font-weight:700; }
  iframe.report { width:100%; height:calc(100vh - 230px); min-height:480px; border:1px solid var(--border); border-radius:8px; background:var(--bg); }
  textarea.editor { width:100%; min-height:520px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12.5px; line-height:1.45; tab-size:2; resize:vertical; }
  .status { border-radius:8px; padding:10px 12px; margin:8px 0; }
  .status.ok { background:var(--ok); } .status.bad { background:var(--bad); color:var(--bad-fg); } .status.info { background:var(--info); }
  .toast { position:fixed; right:18px; bottom:18px; max-width:520px; padding:10px 14px; border-radius:8px; background:var(--fg); color:var(--bg); box-shadow:0 4px 16px rgba(0,0,0,.25); z-index:20; }
  .toast.bad { background:#cf222e; color:#fff; }
  .empty { color:var(--muted); padding:16px 0; }
  .kv { display:grid; grid-template-columns:max-content 1fr; gap:4px 14px; } .kv dt { color:var(--muted); } .kv dd { margin:0; }
  .scroll { overflow-x:auto; }
  .busy { opacity:.6; pointer-events:none; }
  kbd { border:1px solid var(--border); border-bottom-width:2px; border-radius:4px; padding:0 4px; }
`;
