import { callState, describeBudget, describeFault, describeOutcome, expectParts, worstTrial } from "./describe.js";
import { pct, truncate } from "./format.js";
import type { GradedTrial, RunReport, Verdict } from "./types.js";

/** Escapes text for HTML and XML content and attribute values. */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Colors, badges, and chips shared by the HTML report, the run index, and the local UI. Light and dark. */
export const BASE_CSS = `
  :root { color-scheme: light dark; --bg:#ffffff; --fg:#1b1f24; --muted:#57606a; --border:#d0d7de; --panel:#f6f8fa; --link:#0969da;
    --chip:#eaeef2; --ok:#dafbe1; --bad:#ffebe9; --bad-fg:#cf222e; --warn:#fff8c5; --info:#ddf4ff; --state:#1a7f37; --focus:#0969da; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme=light]) { --bg:#0d1117; --fg:#e6edf3; --muted:#8d96a0; --border:#30363d; --panel:#161b22;
    --link:#4493f8; --chip:#21262d; --ok:#12261e; --bad:#2d1214; --bad-fg:#ff7b72; --warn:#2e2a0f; --info:#0c2d4a; --state:#3fb950; --focus:#4493f8; } }
  :root[data-theme=dark] { --bg:#0d1117; --fg:#e6edf3; --muted:#8d96a0; --border:#30363d; --panel:#161b22; --link:#4493f8; --chip:#21262d;
    --ok:#12261e; --bad:#2d1214; --bad-fg:#ff7b72; --warn:#2e2a0f; --info:#0c2d4a; --state:#3fb950; --focus:#4493f8; }
  body { margin:0; font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; background:var(--bg); color:var(--fg); }
  a { color:var(--link); }
  code, pre, kbd { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; }
  pre { background:var(--panel); border:1px solid var(--border); border-radius:6px; padding:8px; margin:4px 0 8px; white-space:pre-wrap; word-break:break-word; }
  table { width:100%; border-collapse:collapse; } th, td { text-align:left; padding:6px 8px; border-bottom:1px solid var(--border); vertical-align:top; }
  th { color:var(--muted); font-weight:600; font-size:12px; }
  .badge { display:inline-block; padding:1px 8px; border-radius:999px; font-weight:600; font-size:12px; color:#fff; white-space:nowrap; }
  .HARMFUL_ACTION { background:#cf222e; } .SILENT_FAILURE { background:#8250df; } .DEGRADED { background:#9a6700; }
  .INCONCLUSIVE { background:#0969da; } .SAFE_FAILURE { background:#1b7c83; } .SAFE_SUCCESS { background:#1a7f37; }
  .chip { display:inline-block; padding:0 6px; border-radius:4px; font-size:12px; background:var(--chip); margin-left:4px; }
  .chip.fault { background:var(--warn); } .chip.err, .chip.contradicted, .chip.invalid { background:var(--bad); color:var(--bad-fg); }
  .chip.ok, .chip.pass { background:var(--ok); } .chip.missing, .chip.ambiguous { background:var(--info); }
  .muted { color:var(--muted); }
  .panel { border:1px solid var(--border); border-radius:8px; padding:12px 16px; margin:12px 0; background:var(--bg); }
  button, input, select, textarea { font:inherit; color:inherit; }
  :focus-visible { outline:2px solid var(--focus); outline-offset:2px; }
`;

/** Trials shown in full in the HTML report; the rest are listed with their verdicts. */
const HTML_TRIAL_LIMIT = 50;
/** World snapshots longer than this are cut in the HTML report; the JSON report keeps them whole. */
const SNAPSHOT_LIMIT = 20_000;

export interface ReportHtmlOptions {
  /** File name of the JSON report next to the page, for the replay command. */
  reportFile?: string;
  /** Force a color theme instead of following the system setting. */
  theme?: "light" | "dark";
}

/**
 * A self-contained HTML timeline: per trial, every call with its arguments, what the agent saw,
 * what the world returned, the state it changed, and the state after it, next to the findings
 * that cite it. It loads no external resources; a short script switches trials, filters calls,
 * and copies the commands that reproduce the run.
 */
export function renderReportHtml(report: RunReport, opts: ReportHtmlOptions = {}): string {
  const worst = worstTrial(report);
  const shown = report.trials.filter((t, i) => i < HTML_TRIAL_LIMIT || t === worst);
  const trialNav = report.trials
    .map((t) => {
      const label = `<span class="badge ${esc(t.verdict)}">${esc(t.verdict)}</span>`;
      return shown.includes(t)
        ? `<li><a href="#trial-${t.trace.trialIndex}" data-trial="${t.trace.trialIndex}">trial ${t.trace.trialIndex}: ${label}</a> ${esc(t.reason)}</li>`
        : `<li>trial ${t.trace.trialIndex}: ${label} ${esc(t.reason)}</li>`;
    })
    .join("\n");
  const warnings = report.warnings.map((w) => `<li>${esc(w)}</li>`).join("");
  const s = report.scenario;
  const commands = [
    `agentcrucible run --scenario ${s.id} --agent ${report.agentId} --seed ${shellQuote(report.seed)} --trials ${report.stats.total}`,
    ...(opts.reportFile ? [`agentcrucible replay ${shellQuote(opts.reportFile)}`] : []),
  ];
  return `<!DOCTYPE html>
<html lang="en"${opts.theme ? ` data-theme="${opts.theme}"` : ""}>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>AgentCrucible: ${esc(report.scenarioId)} (${esc(report.agentId)})</title>
<style>${BASE_CSS}
  main { max-width:1200px; margin:0 auto; padding:24px 20px 56px; }
  h1 { font-size:20px; margin:0 0 4px; } h2 { font-size:16px; margin:0 0 8px; } h3 { font-size:12px; margin:14px 0 6px; text-transform:uppercase; color:var(--muted); letter-spacing:.03em; }
  .meta { color:var(--muted); margin-bottom:12px; }
  .trial-nav { list-style:none; padding:0; margin:0; } .trial-nav li { margin:2px 0; }
  .trial-nav a { text-decoration:none; color:inherit; } .trial-nav a.current { font-weight:700; }
  .toolbar { display:flex; flex-wrap:wrap; gap:12px 16px; align-items:center; margin:8px 0; color:var(--muted); }
  .toolbar input[type=search] { padding:4px 8px; border:1px solid var(--border); border-radius:6px; background:var(--bg); min-width:240px; }
  .commands code { display:inline-block; margin:2px 6px 2px 0; padding:2px 6px; background:var(--panel); border:1px solid var(--border); border-radius:4px; }
  .commands button { border:1px solid var(--border); background:var(--panel); border-radius:4px; padding:0 6px; cursor:pointer; }
  .trial { display:grid; grid-template-columns:minmax(0,3fr) minmax(0,2fr); gap:16px; }
  .js .trial:not(.current) { display:none; }
  .timeline { list-style:none; padding:0; margin:0; border-left:3px solid var(--border); }
  .timeline > li { margin:0 0 8px 12px; position:relative; }
  .timeline > li::before { content:""; position:absolute; left:-20px; top:9px; width:11px; height:11px; border-radius:50%; background:#8c959f; }
  .timeline > li.committed::before { background:#1a7f37; } .timeline > li.failed::before { background:#cf222e; } .timeline > li.faulted::before { box-shadow:0 0 0 3px #f2cc60; }
  .timeline > li:target > details { outline:2px solid var(--focus); border-radius:6px; }
  .filter-faults .timeline > li.call:not(.faulted):not(.failed):not(.cited) { display:none; }
  .timeline > li.hidden { display:none; }
  summary { cursor:pointer; } summary code { font-weight:600; }
  .state { color:var(--state); } .finding { margin:8px 0; } .finding ul { margin:4px 0; padding-left:18px; }
  .answer { white-space:pre-wrap; background:var(--panel); border-radius:6px; padding:8px; }
  .expect { margin:2px 0 6px; padding-left:20px; }
  @media (max-width: 900px) { .trial { grid-template-columns:1fr; } }
</style>
</head>
<body>
<main>
  <h1>${esc(report.scenarioId)} <span class="badge ${esc(report.aggregateVerdict)}">${esc(report.aggregateVerdict)}</span></h1>
  <div class="meta">worlds <code>${esc(report.worlds.join(", "))}</code> · agent <code>${esc(report.agentId)}</code> · seed <code>${esc(report.seed)}</code> · ${report.stats.total} trial(s) · AgentCrucible ${esc(report.toolVersion)}</div>
  <div class="panel">
    <div><strong>Task:</strong> ${esc(s.task)}</div>
    <div><strong>Faults:</strong> ${esc(report.faults.map(describeFault).join("; ") || "none")}</div>
    ${s.budget.maxCalls !== undefined || s.budget.maxCallsPerTool ? `<div><strong>Budget:</strong> ${esc(describeBudget(report))}</div>` : ""}
    <div><strong>Expect:</strong><ul class="expect">${expectParts(report).map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>
    <div><strong>Verdict reason:</strong> ${esc(worst?.reason ?? "")}</div>
    <div class="commands"><strong>Reproduce:</strong> ${commands.map((c) => `<code>${esc(c)}</code><button type="button" data-copy="${esc(c)}" title="Copy">copy</button>`).join(" ")}</div>
  </div>
  ${warnings ? `<div class="panel"><h2>Warnings</h2><ul>${warnings}</ul></div>` : ""}
  <div class="panel"><h2>Trials</h2><ul class="trial-nav">${trialNav}</ul>
    <div>Flaky rate ${pct(report.stats.flakyRate)} · critical-rate 95% lower bound ${pct(report.stats.criticalRateLower95)} · faults fired in ${report.stats.trialsWithFault}/${report.stats.total} trials</div></div>
  <div class="toolbar">
    <input type="search" id="call-search" placeholder="Filter calls (press /)" aria-label="Filter calls by tool, argument, or response"/>
    <label><input type="checkbox" id="filter-faults"/> only calls with faults, errors, or findings</label>
    <span>Click a call for arguments, responses, and state; click a call id in a finding to jump to it.</span>
  </div>
  ${shown.map((t) => trialSection(t, t === worst)).join("\n")}
</main>
<script>
(() => {
  document.body.classList.add("js");
  const trials = [...document.querySelectorAll(".trial")];
  const links = [...document.querySelectorAll(".trial-nav a")];
  const show = (index) => {
    trials.forEach((t) => t.classList.toggle("current", t.dataset.trial === index));
    links.forEach((a) => a.classList.toggle("current", a.dataset.trial === index));
  };
  const follow = () => {
    const target = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
    const trial = target ? target.closest(".trial") : null;
    show(trial ? trial.dataset.trial : document.querySelector(".trial.worst")?.dataset.trial);
    if (target && target.matches("li.call")) {
      target.querySelector("details").open = true;
      window.scrollTo(0, target.getBoundingClientRect().top + window.scrollY - window.innerHeight / 4);
    }
  };
  const search = document.getElementById("call-search");
  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    document.querySelectorAll("li.call").forEach((li) => li.classList.toggle("hidden", q !== "" && !li.textContent.toLowerCase().includes(q)));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== search) { e.preventDefault(); search.focus(); }
  });
  document.querySelectorAll("button[data-copy]").forEach((b) => b.addEventListener("click", () => {
    navigator.clipboard?.writeText(b.dataset.copy).then(() => { b.textContent = "copied"; setTimeout(() => (b.textContent = "copy"), 1200); }, () => {});
  }));
  window.addEventListener("hashchange", follow);
  document.getElementById("filter-faults").addEventListener("change", (e) => document.body.classList.toggle("filter-faults", e.target.checked));
  follow();
})();
</script>
</body>
</html>
`;
}

function trialSection(trial: GradedTrial, isWorst: boolean): string {
  const t = trial.trace.trialIndex;
  const anchor = (callId: string) => `<a href="#t${t}-${esc(callId)}"><code>${esc(callId)}</code></a>`;
  const cited = new Set(trial.findings.flatMap((f) => f.evidence.flatMap((e) => e.callIds ?? [])));
  const calls = trial.trace.calls
    .map((c) => {
      const classes = ["call", c.committed && c.mutating ? "committed" : "", c.observed.ok ? "" : "failed", c.faultApplied ? "faulted" : "", cited.has(c.id) ? "cited" : ""].filter(Boolean).join(" ");
      const saw = c.observed.ok ? `<span class="chip ok">ok</span> <code>${esc(truncate(JSON.stringify(c.observed.result), 90))}</code>` : `<span class="chip err">${esc(c.observed.code ?? "error")}</span> ${esc(c.observed.error)}`;
      const findings = trial.findings.filter((f) => f.evidence.some((e) => e.callIds?.includes(c.id)));
      const snapshot = JSON.stringify(c.worldSnapshotAfter, null, 2);
      return `<li class="${classes}" id="t${t}-${esc(c.id)}"><details>
  <summary><code>${esc(c.id)}</code> <code>${esc(c.tool)}#${c.callIndex}</code> <span class="chip">${esc(callState(c))}</span>${c.faultApplied ? `<span class="chip fault">fault: ${esc(c.faultApplied)}</span>` : ""}${c.schemaErrors?.length ? '<span class="chip err">schema</span>' : ""} ${saw}${c.changes.map((change) => `<div class="state">${esc(change)}</div>`).join("")}</summary>
  <h3>Arguments</h3><pre>${esc(JSON.stringify(c.args, null, 2))}</pre>${c.argsError ? `<p class="muted">Rejected: the agent passed something other than a JSON object (${esc(c.argsError)}).</p>` : ""}
  <h3>Agent saw</h3><pre>${esc(c.observed.ok ? JSON.stringify(c.observed.result, null, 2) : `${c.observed.code ?? "error"}: ${c.observed.error}`)}</pre>
  ${c.committed ? `<h3>World returned</h3><pre>${esc(JSON.stringify(c.committedResult, null, 2))}</pre>` : `<h3>World returned</h3><p>The call did not run.</p>`}
  ${c.schemaErrors?.length ? `<h3>Schema violations</h3><ul>${c.schemaErrors.map((e) => `<li><code>${esc(e)}</code></li>`).join("")}</ul>` : ""}
  ${findings.length ? `<h3>Findings citing this call</h3><ul>${findings.map((f) => `<li><span class="badge ${esc(f.verdict)}">${esc(f.verdict)}</span> <code>${esc(f.rule)}</code></li>`).join("")}</ul>` : ""}
  <details><summary class="muted">World state after this call</summary><pre>${esc(snapshot.length > SNAPSHOT_LIMIT ? `${snapshot.slice(0, SNAPSHOT_LIMIT)}\n… (cut; the JSON report has the full state)` : snapshot)}</pre></details>
</details></li>`;
    })
    .join("\n");
  const output = trial.trace.finalOutput === undefined ? "" : `<h3>Structured output</h3><pre>${esc(JSON.stringify(trial.trace.finalOutput, null, 2))}</pre>`;
  const assertions = trial.outcome.assertions
    .map((a) => `<li><span class="chip ${esc(a.status)}">${esc(a.status)}</span> ${esc(a.assertion)}: ${esc(a.detail)}</li>`)
    .join("");
  const findings = trial.findings
    .map(
      (f) => `<div class="finding"><span class="badge ${esc(f.verdict)}">${esc(f.verdict)}</span> <code>${esc(f.rule)}</code>
  <div>${esc(f.reason)}</div>
  <ul>${f.evidence.map((e) => `<li>${esc(e.summary)}${e.callIds?.length ? ` ${e.callIds.map(anchor).join(" ")}` : ""}</li>`).join("")}</ul></div>`
    )
    .join("\n");
  return `<section class="trial${isWorst ? " worst current" : ""}" id="trial-${t}" data-trial="${t}">
  <div>
    <h2>Trial ${t} <span class="badge ${esc(trial.verdict)}">${esc(trial.verdict)}</span></h2>
    <ol class="timeline">
${calls || "<li>No tool calls</li>"}
      <li class="final"><h3>Final answer</h3><div class="answer">${esc(trial.trace.finalAnswer)}</div>${output}</li>
    </ol>
  </div>
  <aside>
    <h3>Committed changes</h3>
    <ul>${trial.effects.map((e) => `<li>${esc(e.summary)} ${e.callIds.map(anchor).join(" ")}</li>`).join("") || "<li>None</li>"}</ul>
    <h3>Outcome check</h3>
    <p>${esc(describeOutcome(trial))}</p>
    ${assertions ? `<ul>${assertions}</ul>` : ""}
    <h3>Findings</h3>
    ${findings || "<p>None</p>"}
  </aside>
</section>`;
}

export interface RunIndexEntry {
  report: RunReport;
  /** Path of the report's HTML page, relative to the index. */
  href: string;
  /** Set when the run was compared with a baseline. */
  change?: "regression" | "new failure" | "improved" | "changed" | "new" | "unchanged";
}

/** A static summary page for a run of several scenarios or agents, linking each report. */
export function renderRunIndex(entries: RunIndexEntry[], title: string, failOn: Verdict): string {
  const counts = new Map<Verdict, number>();
  for (const e of entries) counts.set(e.report.aggregateVerdict, (counts.get(e.report.aggregateVerdict) ?? 0) + 1);
  const rows = entries
    .map(({ report: r, href, change }) => {
      const worst = worstTrial(r);
      return `<tr><td><a href="${esc(href)}">${esc(r.scenarioId)}</a></td><td><code>${esc(r.agentId)}</code></td><td><span class="badge ${esc(r.aggregateVerdict)}">${esc(r.aggregateVerdict)}</span>${change ? ` <span class="chip${change === "regression" || change === "new failure" ? " err" : change === "improved" ? " ok" : ""}">${esc(change)}</span>` : ""}</td><td>${r.stats.total}</td><td>${esc(worst?.findings[0]?.rule ?? "")}</td><td>${esc(worst?.reason ?? "")}</td></tr>`;
    })
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<style>${BASE_CSS}
  main { max-width:1200px; margin:0 auto; padding:24px 20px 56px; } h1 { font-size:20px; margin:0 0 8px; }
  .summary span { margin-right:10px; }
</style>
</head>
<body>
<main>
  <h1>${esc(title)}</h1>
  <p class="summary">${[...counts].map(([v, n]) => `<span>${n} <span class="badge ${esc(v)}">${esc(v)}</span></span>`).join("")}</p>
  <p class="muted">${entries.length} report(s). Verdicts at or above ${esc(failOn)} fail the run.</p>
  <table><thead><tr><th>Scenario</th><th>Agent</th><th>Verdict</th><th>Trials</th><th>Deciding rule</th><th>Reason</th></tr></thead>
  <tbody>${rows}</tbody></table>
</main>
</body>
</html>
`;
}

/** Quotes a command-line argument when it holds characters a shell would interpret. */
function shellQuote(arg: string): string {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}
