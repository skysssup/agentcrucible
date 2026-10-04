import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { describeInvariant, describePattern, describeRef, isValueRef } from "./expect.js";
import { describeSchedule } from "./faults.js";
import { formatCents, pct, truncate } from "./format.js";
import { REPORT_VERSION, VERDICTS, type AnswerAssertion, type FaultSpec, type GradedTrial, type RunReport, type ToolCallRecord, type Verdict } from "./types.js";
import { atLeast } from "./verdict.js";

const ANSI: Record<Verdict | "bold" | "dim", string> = {
  HARMFUL_ACTION: "\x1b[31m",
  SILENT_FAILURE: "\x1b[35m",
  DEGRADED: "\x1b[33m",
  INCONCLUSIVE: "\x1b[34m",
  SAFE_FAILURE: "\x1b[36m",
  SAFE_SUCCESS: "\x1b[32m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

/** Colors for a terminal: on for a TTY unless NO_COLOR is set; FORCE_COLOR turns them on anywhere. */
export function shouldColor(stream: { isTTY?: boolean } = process.stdout): boolean {
  const force = process.env.FORCE_COLOR;
  if (force !== undefined && force !== "" && force !== "0") return true;
  return Boolean(stream.isTTY) && !process.env.NO_COLOR && process.env.TERM !== "dumb";
}

export type Paint = (style: keyof typeof ANSI, text: string) => string;

export function painter(color: boolean): Paint {
  return (style, text) => (color ? `${ANSI[style]}${text}\x1b[0m` : text);
}

/** The worst trial: the first one whose verdict equals the aggregate verdict. */
export function worstTrial(report: RunReport): GradedTrial | undefined {
  return report.trials.find((t) => t.verdict === report.aggregateVerdict) ?? report.trials[0];
}

export function formatReport(report: RunReport, color = false): string {
  const paint = painter(color);
  const s = report.scenario;
  const lines: string[] = [];
  const trials = report.stats.total;
  lines.push(`${paint("bold", report.scenarioId)}  ${paint("dim", `world ${report.worlds.join("+")} · agent ${report.agentId} · seed ${report.seed} · ${trials} trial${trials === 1 ? "" : "s"}`)}`);
  lines.push(`  Task:    ${s.task}`);
  lines.push(`  Faults:  ${report.faults.length ? report.faults.map(describeFault).join("; ") : "none"}`);
  if (s.budget.maxCalls !== undefined || s.budget.maxCallsPerTool) lines.push(`  Budget:  ${describeBudget(report)}`);
  lines.push(`  Expect:  ${describeExpect(report)}`);
  const worst = worstTrial(report);
  lines.push("");
  lines.push(`  Verdict: ${paint("bold", paint(report.aggregateVerdict, report.aggregateVerdict))}`);
  if (worst) lines.push(`  ${worst.reason}`);

  if (trials > 1) {
    const counts = VERDICTS.filter((v) => report.stats.byVerdict[v] > 0).map((v) => `${report.stats.byVerdict[v]} ${paint(v, v)}`);
    lines.push("");
    lines.push(`  Trials:  ${counts.join(", ")}`);
    lines.push(
      `           flaky ${pct(report.stats.flakyRate)} · critical-rate 95% lower bound ${pct(report.stats.criticalRateLower95)} · faults fired in ${report.stats.trialsWithFault}/${trials}`
    );
    if (trials <= 10) lines.push(`           by trial: ${report.trials.map((t) => paint(t.verdict, t.verdict)).join(" ")}`);
  }

  if (worst) {
    lines.push("");
    lines.push(`  ${paint("bold", `Trial ${worst.trace.trialIndex}`)}${trials > 1 ? " (first trial with the aggregate verdict)" : ""}`);
    lines.push("    Tool calls:");
    for (const line of formatCallLines(worst, paint)) lines.push(`      ${line}`);
    lines.push(`    Final answer: ${JSON.stringify(worst.trace.finalAnswer)}`);
    if (worst.trace.finalOutput !== undefined) lines.push(`    Output: ${JSON.stringify(worst.trace.finalOutput)}`);
    lines.push(`    Outcome check: ${describeOutcome(worst)}`);
    lines.push("    Findings:");
    for (const line of formatFindingLines(worst, paint)) lines.push(`      ${line}`);
  }

  if (report.warnings.length) {
    lines.push("");
    lines.push("  Warnings:");
    for (const w of report.warnings) lines.push(`    - ${w}`);
  }
  return lines.join("\n");
}

/** One line per tool call, each followed by the state changes it made. */
export function formatCallLines(trial: GradedTrial, paint: Paint): string[] {
  if (trial.trace.calls.length === 0) return ["(no tool calls)"];
  const lines: string[] = [];
  for (const c of trial.trace.calls) {
    const saw = c.observed.ok ? `ok ${truncate(JSON.stringify(c.observed.result), 70)}` : `error ${c.observed.error}`;
    const fault = c.faultApplied ? paint("dim", `  [fault: ${c.faultApplied}]`) : "";
    const schema = c.schemaErrors?.length ? paint("dim", `  [schema: ${truncate(c.schemaErrors[0], 60)}]`) : "";
    lines.push(`${c.id} ${c.tool}#${c.callIndex}  ${callState(c)}  agent saw: ${saw}${fault}${schema}`);
    for (const change of c.changes) lines.push(`  ${paint("dim", "state:")} ${change}`);
  }
  return lines;
}

function formatFindingLines(trial: GradedTrial, paint: Paint): string[] {
  const lines: string[] = [];
  for (const f of trial.findings) {
    lines.push(`${paint(f.verdict, f.verdict.padEnd(14))} ${f.rule}`);
    lines.push(`  ${f.reason}`);
    for (const e of f.evidence) lines.push(`  ${paint("dim", `- ${e.summary}${e.callIds?.length ? ` [${e.callIds.join(", ")}]` : ""}`)}`);
  }
  return lines;
}

function describeOutcome(trial: GradedTrial): string {
  const o = trial.outcome;
  const path = o.path && o.path !== "expected" ? ` [${o.path}]` : "";
  return `${o.status.replace("_", " ")}${path}${o.summary ? ` (${o.summary})` : ""}`;
}

/**
 * A detailed, call-by-call view of one trial from a saved report, for `agentcrucible inspect`.
 * With `callId`, the full arguments, responses, and state changes of that call.
 */
export function formatTrialDetail(report: RunReport, trialIndex: number, callId?: string, color = false): string {
  const paint = painter(color);
  const trial = report.trials.find((t) => t.trace.trialIndex === trialIndex);
  if (!trial) throw new Error(`the report has trials 0-${report.trials.length - 1}; there is no trial ${trialIndex}`);
  const lines = [
    `${paint("bold", report.scenarioId)}  ${paint("dim", `agent ${report.agentId} · seed ${report.seed} · trial ${trialIndex} of ${report.trials.length} · AgentCrucible ${report.toolVersion}`)}`,
    `Verdict: ${paint(trial.verdict, trial.verdict)}: ${trial.reason}`,
    "",
  ];
  if (callId) {
    const call = trial.trace.calls.find((c) => c.id === callId);
    if (!call) throw new Error(`trial ${trialIndex} has calls ${trial.trace.calls.map((c) => c.id).join(", ") || "(none)"}; there is no ${callId}`);
    lines.push(`${paint("bold", `${call.id} ${call.tool}#${call.callIndex}`)}  ${callState(call)}${call.faultApplied ? `  fault: ${call.faultApplied} (faults[${call.faultIndex}])` : ""}`);
    lines.push(`arguments:      ${JSON.stringify(call.args, null, 2).replace(/\n/g, "\n                ")}`);
    lines.push(`agent saw:      ${(call.observed.ok ? JSON.stringify(call.observed.result, null, 2) : `error ${call.observed.code ?? ""} ${call.observed.error}`).replace(/\n/g, "\n                ")}`);
    if (call.committed) lines.push(`world returned: ${JSON.stringify(call.committedResult, null, 2).replace(/\n/g, "\n                ")}`);
    for (const e of call.schemaErrors ?? []) lines.push(`schema:         ${e}`);
    lines.push(`state changes:  ${call.changes.length ? call.changes.join("\n                ") : "none"}`);
    const citing = trial.findings.filter((f) => f.evidence.some((e) => e.callIds?.includes(call.id)));
    lines.push(`findings:       ${citing.length ? citing.map((f) => `${f.verdict} ${f.rule}`).join("\n                ") : "none cite this call"}`);
    return lines.join("\n");
  }
  lines.push(`Task: ${trial.trace.task}`, "", paint("bold", "Calls"));
  for (const line of formatCallLines(trial, paint)) lines.push(`  ${line}`);
  lines.push("", `${paint("bold", "Answer")} ${JSON.stringify(trial.trace.finalAnswer)}`);
  if (trial.trace.finalOutput !== undefined) lines.push(`${paint("bold", "Output")} ${JSON.stringify(trial.trace.finalOutput)}`);
  lines.push("", `${paint("bold", "Outcome")} ${describeOutcome(trial)}`);
  for (const a of trial.outcome.assertions) lines.push(`  ${a.status.padEnd(12)} ${a.assertion}: ${a.detail}`);
  lines.push("", paint("bold", "Findings"));
  for (const line of formatFindingLines(trial, paint)) lines.push(`  ${line}`);
  return lines.join("\n");
}

export function printReport(report: RunReport): void {
  console.log(formatReport(report, shouldColor(process.stdout)));
  console.log();
}

export function writeJsonReport(report: RunReport, outDir: string): string {
  return writeReportFile(outDir, report.scenarioId, ".report.json", JSON.stringify(report, null, 2));
}

/**
 * Reads a report written by `run --out` or `run --json`. A file with several reports needs
 * `scenarioId` to pick one. Only the current report format is accepted.
 */
export function readReportFile(path: string, scenarioId?: string): RunReport {
  if (!existsSync(path)) throw new Error(`${path}: file not found`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`${path}: not a JSON report: ${(err as Error).message}`);
  }
  const all = Array.isArray(parsed) ? parsed : [parsed];
  const reports = scenarioId ? all.filter((r) => (r as RunReport)?.scenarioId === scenarioId) : all;
  if (reports.length !== 1) {
    throw new Error(
      reports.length === 0
        ? `${path}: no report${scenarioId ? ` for scenario ${scenarioId}` : ""}`
        : `${path} holds ${reports.length} reports; choose one with --scenario (${all.map((r) => (r as RunReport).scenarioId).join(", ")})`
    );
  }
  const report = reports[0] as Partial<RunReport>;
  if (typeof report !== "object" || report === null || !Array.isArray(report.trials) || typeof report.scenarioId !== "string") {
    throw new Error(`${path}: not an AgentCrucible report`);
  }
  if (report.reportVersion !== REPORT_VERSION) {
    throw new Error(
      `${path}: report format ${report.reportVersion ?? 1} (AgentCrucible ${report.toolVersion ?? "0.4 or earlier"}); this version reads format ${REPORT_VERSION}. Run the scenario again to write a new report.`
    );
  }
  return report as RunReport;
}

/** Trials shown in full in the HTML report; the rest are listed with their verdicts. */
const HTML_TRIAL_LIMIT = 50;

/**
 * A self-contained HTML timeline: per trial, every call with its arguments, what the agent saw,
 * what the world returned, and the state it changed, next to the findings that cite it. It loads
 * no external resources; a short script switches trials and filters calls.
 */
export function writeHtmlReport(report: RunReport, outDir: string): string {
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
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>AgentCrucible: ${esc(report.scenarioId)} (${esc(report.agentId)})</title>
<style>
  body { margin:0; font:14px/1.5 system-ui,sans-serif; background:#fff; color:#1b1f24; }
  main { max-width:1200px; margin:0 auto; padding:24px 20px 56px; }
  h1 { font-size:20px; margin:0 0 4px; } h2 { font-size:16px; margin:0 0 8px; } h3 { font-size:13px; margin:14px 0 6px; text-transform:uppercase; color:#57606a; letter-spacing:.03em; }
  .meta { color:#57606a; margin-bottom:12px; }
  .panel { border:1px solid #d0d7de; border-radius:8px; padding:12px 16px; margin:12px 0; }
  .badge { display:inline-block; padding:1px 8px; border-radius:999px; font-weight:600; font-size:12px; color:#fff; }
  .HARMFUL_ACTION { background:#cf222e; } .SILENT_FAILURE { background:#8250df; } .DEGRADED { background:#9a6700; }
  .INCONCLUSIVE { background:#0969da; } .SAFE_FAILURE { background:#1b7c83; } .SAFE_SUCCESS { background:#1a7f37; }
  code, pre { font-family:ui-monospace,Menlo,monospace; font-size:12px; }
  pre { background:#f6f8fa; border-radius:6px; padding:8px; margin:4px 0 8px; white-space:pre-wrap; word-break:break-word; }
  .trial-nav { list-style:none; padding:0; margin:0; } .trial-nav li { margin:2px 0; }
  .trial-nav a { text-decoration:none; color:inherit; } .trial-nav a.current { font-weight:700; }
  .toolbar { display:flex; gap:16px; align-items:center; margin:8px 0; color:#57606a; }
  .trial { display:grid; grid-template-columns:minmax(0,3fr) minmax(0,2fr); gap:16px; }
  .js .trial:not(.current) { display:none; }
  .timeline { list-style:none; padding:0; margin:0; border-left:3px solid #d0d7de; }
  .timeline > li { margin:0 0 8px 12px; position:relative; }
  .timeline > li::before { content:""; position:absolute; left:-20px; top:9px; width:11px; height:11px; border-radius:50%; background:#8c959f; }
  .timeline > li.committed::before { background:#1a7f37; } .timeline > li.failed::before { background:#cf222e; } .timeline > li.faulted::before { box-shadow:0 0 0 3px #f2cc60; }
  .timeline > li:target > details { outline:2px solid #0969da; border-radius:6px; }
  .filter-faults .timeline > li.call:not(.faulted):not(.failed):not(.cited) { display:none; }
  summary { cursor:pointer; } summary code { font-weight:600; }
  .chip { display:inline-block; padding:0 6px; border-radius:4px; font-size:12px; background:#eaeef2; margin-left:4px; }
  .chip.fault { background:#fff8c5; } .chip.err { background:#ffebe9; color:#cf222e; } .chip.ok { background:#dafbe1; }
  .chip.pass { background:#dafbe1; } .chip.missing, .chip.ambiguous { background:#ddf4ff; } .chip.contradicted, .chip.invalid { background:#ffebe9; }
  .state { color:#1a7f37; } .finding { margin:8px 0; } .finding ul { margin:4px 0; padding-left:18px; }
  .answer { white-space:pre-wrap; background:#f6f8fa; border-radius:6px; padding:8px; }
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
  </div>
  ${warnings ? `<div class="panel"><h2>Warnings</h2><ul>${warnings}</ul></div>` : ""}
  <div class="panel"><h2>Trials</h2><ul class="trial-nav">${trialNav}</ul>
    <div>Flaky rate ${pct(report.stats.flakyRate)} · critical-rate 95% lower bound ${pct(report.stats.criticalRateLower95)} · faults fired in ${report.stats.trialsWithFault}/${report.stats.total} trials</div></div>
  <div class="toolbar"><label><input type="checkbox" id="filter-faults"/> only calls with faults, errors, or findings</label><span>Click a call to see arguments, responses, and state changes; click a call id in a finding to jump to it.</span></div>
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
    const target = location.hash ? document.getElementById(location.hash.slice(1)) : null;
    const trial = target ? target.closest(".trial") : null;
    show(trial ? trial.dataset.trial : document.querySelector(".trial.worst")?.dataset.trial);
    if (target && target.matches("li.call")) { target.querySelector("details").open = true; target.scrollIntoView({ block: "center" }); }
  };
  window.addEventListener("hashchange", follow);
  document.getElementById("filter-faults").addEventListener("change", (e) => document.body.classList.toggle("filter-faults", e.target.checked));
  follow();
})();
</script>
</body>
</html>
`;
  return writeReportFile(outDir, report.scenarioId, ".report.html", html);
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
      return `<li class="${classes}" id="t${t}-${esc(c.id)}"><details>
  <summary><code>${esc(c.id)}</code> <code>${esc(c.tool)}#${c.callIndex}</code> <span class="chip">${esc(callState(c))}</span>${c.faultApplied ? `<span class="chip fault">fault: ${esc(c.faultApplied)}</span>` : ""}${c.schemaErrors?.length ? '<span class="chip err">schema</span>' : ""} ${saw}${c.changes.map((change) => `<div class="state">${esc(change)}</div>`).join("")}</summary>
  <h3>Arguments</h3><pre>${esc(JSON.stringify(c.args, null, 2))}</pre>
  <h3>Agent saw</h3><pre>${esc(c.observed.ok ? JSON.stringify(c.observed.result, null, 2) : `${c.observed.code ?? "error"}: ${c.observed.error}`)}</pre>
  ${c.committed ? `<h3>World returned</h3><pre>${esc(JSON.stringify(c.committedResult, null, 2))}</pre>` : `<h3>World returned</h3><p>The call did not run.</p>`}
  ${c.schemaErrors?.length ? `<h3>Schema violations</h3><ul>${c.schemaErrors.map((e) => `<li><code>${esc(e)}</code></li>`).join("")}</ul>` : ""}
  ${findings.length ? `<h3>Findings citing this call</h3><ul>${findings.map((f) => `<li><span class="badge ${esc(f.verdict)}">${esc(f.verdict)}</span> <code>${esc(f.rule)}</code></li>`).join("")}</ul>` : ""}
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

/** One testcase per trial; a trial fails when its verdict is at least `failOn`. */
export function writeJUnitReport(report: RunReport, outDir: string, failOn: Verdict = "SILENT_FAILURE"): string {
  const classname = `agentcrucible.${esc(report.worlds.join("+"))}`;
  const failures = report.trials.filter((t) => atLeast(t.verdict, failOn)).length;
  const cases = report.trials
    .map((t) => {
      const name = esc(`${report.scenarioId}::${report.agentId}::trial${t.trace.trialIndex}`);
      const failure = atLeast(t.verdict, failOn) ? `\n    <failure message="${esc(t.verdict)}" type="${esc(t.verdict)}">${esc(t.reason)}</failure>` : "";
      return `  <testcase classname="${classname}" name="${name}" time="0">${failure}
    <system-out>${esc(`${t.verdict}: ${t.reason}`)}</system-out>
  </testcase>`;
    })
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="agentcrucible.${esc(report.scenarioId)}" tests="${report.trials.length}" failures="${failures}" time="${(report.durationMs / 1000).toFixed(3)}">
${cases}
</testsuite>
`;
  return writeReportFile(outDir, report.scenarioId, ".junit.xml", xml);
}

/** File names percent-encode the scenario id, so ids cannot leave `outDir` or collide with each other. */
function writeReportFile(outDir: string, scenarioId: string, suffix: string, body: string): string {
  const dir = resolve(outDir);
  const path = join(dir, `${encodeURIComponent(scenarioId)}${suffix}`);
  if (!path.startsWith(dir + sep)) throw new Error(`Refusing to write a report outside ${dir}: ${path}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, body);
  return join(outDir, `${encodeURIComponent(scenarioId)}${suffix}`);
}

export function describeFault(f: FaultSpec): string {
  return `${f.kind} on ${f.target} ${describeSchedule(f)}`;
}

function describeBudget(report: RunReport): string {
  const b = report.scenario.budget;
  return [
    ...(b.maxCalls === undefined ? [] : [`${b.maxCalls} calls`]),
    ...Object.entries(b.maxCallsPerTool ?? {}).map(([tool, n]) => `${n} ${tool} calls`),
  ].join(", ");
}

export function describeExpect(report: RunReport): string {
  return expectParts(report).join("; ");
}

/** The scenario's expectations, one item per outcome, allowance, invariant, and answer check. */
function expectParts(report: RunReport): string[] {
  const e = report.scenario.expect;
  if (!e) return ["none (task completion is not checked)"];
  const effects = (patterns: typeof e.outcomes[number]["effects"]) => (patterns.length ? patterns.map(describePattern).join("; ") : "no state changes");
  const parts =
    e.outcomes.length === 1
      ? [effects(e.outcomes[0].effects)]
      : e.outcomes.map((o) => `${o.name}${o.verdict === "SAFE_FAILURE" ? " (recovery)" : ""}: ${effects(o.effects)}`);
  if (e.allow.length) parts.push(`allowed: ${e.allow.map(describePattern).join("; ")}`);
  for (const inv of e.invariants) parts.push(`invariant ${inv.name}: ${describeInvariant(inv)}`);
  for (const a of e.answer) parts.push(describeAssertion(a));
  return parts;
}

function describeAssertion(a: AnswerAssertion): string {
  switch (a.type) {
    case "amount":
      return `answer states ${formatCents(a.cents)}`;
    case "id":
      return `answer names the id of the ${describePattern(a.of)}`;
    case "text":
      return a.contains !== undefined ? `answer contains ${JSON.stringify(a.contains)}` : a.notContains !== undefined ? `answer does not contain ${JSON.stringify(a.notContains)}` : `answer matches /${a.matches}/`;
    case "boolean":
      return typeof a.equals === "boolean"
        ? `answer says ${a.equals ? "yes" : "no"} to ${a.keywords.join("/")}`
        : `answer's yes or no on ${a.keywords.join("/")} matches ${describeRef(a.equals)}`;
    case "output":
      return `output ${[...(a.schema ? ["matches its schema"] : []), ...Object.entries(a.fields).map(([k, v]) => `${k} = ${isValueRef(v) ? describeRef(v) : JSON.stringify(v)}`)].join(", ")}`;
  }
}

function callState(c: ToolCallRecord): string {
  if (c.budgetExceeded) return "refused (budget)";
  if (!c.mutating) return c.committed ? "read" : "not executed";
  if (!c.committed) return "not committed";
  return (c.committedResult as { deduplicated?: unknown } | undefined)?.deduplicated === true ? "deduplicated" : "committed";
}

/** Escapes text for HTML and XML content and attribute values. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
