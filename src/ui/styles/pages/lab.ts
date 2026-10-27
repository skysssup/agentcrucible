export const LAB_CSS = `
.lab-page { max-width:1240px; margin:auto; padding-top:52px; }
.lab-page .page-head { align-items:flex-end; margin-bottom:32px; }
.lab-page .page-title { max-width:720px; font-size:clamp(30px,4vw,50px); line-height:1.1; letter-spacing:-.045em; }
.lab-page .page-desc { max-width:680px; font-size:15px; line-height:1.7; margin-top:18px; }
.lab-contract { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); border-block:1px solid var(--border); }
.lab-contract > div { padding:22px 18px; border-right:1px solid var(--border); }
.lab-contract > div:first-child { padding-left:0; }.lab-contract > div:last-child { border-right:0; }
.lab-contract p { margin:10px 0 0; font-size:14px; }
.lab-disclosure { color:var(--muted); font-size:12px; margin:16px 0 28px; line-height:1.8; }
.lab-empty { padding:48px 0; max-width:700px; }.lab-empty h2 { font-size:25px; line-height:1.35; letter-spacing:-.025em; margin:14px 0; }.lab-empty p { color:var(--muted); line-height:1.8; font-size:14px; }
.lab-results { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px; }
.lab-result { border:1px solid var(--border); border-radius:var(--r-md); background:var(--surface); padding:24px; min-width:0; }
.lab-result header { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }.lab-result h2 { margin:0; font:500 14px var(--font-mono); }
.lab-calls { list-style:none; padding:0; margin:25px 0; }.lab-calls li { display:flex; gap:12px; margin:16px 0; }.lab-call-index { border:1px solid var(--border); border-radius:50%; width:23px; height:23px; display:grid; place-items:center; flex:none; font-size:11px; color:var(--muted); }.lab-calls p { margin:6px 0; color:var(--muted); font-size:12px; line-height:1.6; }.lab-fault { color:var(--warn-fg); font:11px var(--font-mono); overflow-wrap:anywhere; }
.lab-answer { border-top:1px solid var(--border); padding-top:18px; }.lab-answer blockquote { margin:10px 0 0; font-size:14px; line-height:1.7; overflow-wrap:anywhere; }.lab-reason { font-size:12px; color:var(--muted); line-height:1.7; }.lab-footer { display:flex; gap:12px; flex-wrap:wrap; margin-top:24px; }
.lab-limit { border-top:1px solid var(--border); margin-top:40px; padding:24px 0; color:var(--muted); font-size:12px; line-height:1.8; }.lab-limit a { display:inline-block; margin-right:20px; }
@media(max-width:760px) { .lab-page { padding-top:24px; }.lab-results,.lab-contract { grid-template-columns:1fr; }.lab-contract > div { padding:16px 0; border-right:0; }.lab-result { padding:18px; } }
`;
