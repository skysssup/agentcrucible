import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { callState, describeBudget, describeExpect, describeFault, describeOutcome, describeUsage, worstTrial } from "./describe.js";
import { pct, truncate } from "./format.js";
import { esc, renderReportHtml, renderRunIndex, type RunIndexEntry } from "./html.js";
import { REPORT_VERSION, VERDICTS, type GradedTrial, type RunReport, type Verdict } from "./types.js";
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
    if (worst.trace.usage) lines.push(`    Model: ${describeUsage(worst.trace.usage)}`);
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
  if (trial.trace.usage) lines.push(`${paint("bold", "Model")}  ${describeUsage(trial.trace.usage)}`);
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

export function writeHtmlReport(report: RunReport, outDir: string): string {
  const reportFile = `${encodeURIComponent(report.scenarioId)}.report.json`;
  return writeReportFile(outDir, report.scenarioId, ".report.html", renderReportHtml(report, { reportFile }));
}

/** Writes index.html in `outDir`, linking the HTML report of each entry. Returns the path. */
export function writeRunIndex(entries: Array<Omit<RunIndexEntry, "href"> & { dir?: string }>, outDir: string, title: string, failOn: Verdict): string {
  const page = renderRunIndex(
    entries.map(({ dir, ...e }) => ({ ...e, href: `${dir ? `${encodeURIComponent(dir)}/` : ""}${encodeURIComponent(encodeURIComponent(e.report.scenarioId))}.report.html` })),
    title,
    failOn
  );
  mkdirSync(resolve(outDir), { recursive: true });
  writeFileSync(join(resolve(outDir), "index.html"), page);
  return join(outDir, "index.html");
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
