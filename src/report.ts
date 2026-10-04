import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { GradedTrial, RunReport, ToolCallRecord, Verdict } from "./types.js";
import { VERDICTS } from "./types.js";
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
  lines.push(
    `${paint("bold", report.scenarioId)}  ${paint("dim", `world ${report.world} · agent ${report.agentId} · seed ${report.seed} · ${trials} trial${trials === 1 ? "" : "s"}`)}`
  );
  lines.push(`  Task:    ${s.task}`);
  lines.push(`  Faults:  ${s.faults.length ? s.faults.map(describeFault).join("; ") : "none"}`);
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
  }

  if (worst) {
    lines.push("");
    lines.push(`  ${paint("bold", `Trial ${worst.trace.trialIndex}`)}${trials > 1 ? " (first trial with the aggregate verdict)" : ""}`);
    lines.push("    Tool calls:");
    for (const line of formatCallLines(worst, paint)) lines.push(`      ${line}`);
    lines.push(`    Final answer: ${JSON.stringify(worst.trace.finalAnswer)}`);
    lines.push(`    Outcome check: ${worst.outcome.status.replace("_", " ")}${worst.outcome.summary ? ` (${worst.outcome.summary})` : ""}`);
    lines.push("    Findings:");
    for (const f of worst.findings) {
      lines.push(`      ${paint(f.verdict, f.verdict.padEnd(14))} ${f.rule}`);
      lines.push(`        ${f.reason}`);
      for (const e of f.evidence) {
        lines.push(`        ${paint("dim", `- ${e.summary}${e.callIds?.length ? ` [${e.callIds.join(", ")}]` : ""}`)}`);
      }
    }
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
    lines.push(`${c.id} ${c.tool}#${c.callIndex}  ${callState(c)}  agent saw: ${saw}${fault}`);
    for (const e of trial.effects.filter((e) => e.callIds.includes(c.id))) {
      lines.push(`  ${paint("dim", "state:")} ${e.summary}`);
    }
  }
  return lines;
}

export function printReport(report: RunReport): void {
  console.log(formatReport(report, shouldColor(process.stdout)));
  console.log();
}

export function writeJsonReport(report: RunReport, outDir: string): string {
  return writeReportFile(outDir, report.scenarioId, ".report.json", JSON.stringify(report, null, 2));
}

export function writeHtmlReport(report: RunReport, outDir: string): string {
  const worst = worstTrial(report);
  const rows = (worst?.trace.calls ?? [])
    .map((c) => {
      const observed = c.observed.ok
        ? `<code>${escapeMarkup(JSON.stringify(c.observed.result))}</code>`
        : `<span class="err">${escapeMarkup(c.observed.error)}</span>`;
      const changes = (worst?.effects ?? []).filter((e) => e.callIds.includes(c.id)).map((e) => escapeMarkup(e.summary)).join("<br>");
      return `<tr><td>${escapeMarkup(c.id)}</td><td>${escapeMarkup(c.tool)}#${c.callIndex}</td><td>${escapeMarkup(callState(c))}</td><td>${escapeMarkup(c.faultApplied ?? "—")}</td><td>${observed}</td><td>${changes || "—"}</td></tr>`;
    })
    .join("\n");
  const findings = (worst?.findings ?? [])
    .map(
      (f) => `<li><span class="badge ${escapeMarkup(f.verdict)}">${escapeMarkup(f.verdict)}</span> <code>${escapeMarkup(f.rule)}</code>
        <div>${escapeMarkup(f.reason)}</div>
        <ul>${f.evidence.map((e) => `<li>${escapeMarkup(e.summary)}${e.callIds?.length ? ` <code>${escapeMarkup(e.callIds.join(", "))}</code>` : ""}</li>`).join("")}</ul></li>`
    )
    .join("\n");
  const trialList = report.trials
    .map((t) => `<li>trial ${t.trace.trialIndex}: <span class="badge ${escapeMarkup(t.verdict)}">${escapeMarkup(t.verdict)}</span> ${escapeMarkup(t.reason)}</li>`)
    .join("\n");
  const warnings = report.warnings.map((w) => `<li>${escapeMarkup(w)}</li>`).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>AgentCrucible — ${escapeMarkup(report.scenarioId)}</title>
<style>
  body { margin:0; font:14px/1.5 system-ui,sans-serif; background:#fff; color:#1b1f24; }
  main { max-width:1040px; margin:0 auto; padding:28px 20px 56px; }
  h1 { font-size:20px; margin:0 0 4px; } h2 { font-size:15px; margin:0 0 8px; }
  .meta { color:#57606a; margin-bottom:16px; }
  .panel { border:1px solid #d0d7de; border-radius:8px; padding:14px 16px; margin:14px 0; }
  .badge { display:inline-block; padding:2px 8px; border-radius:999px; font-weight:600; font-size:12px; color:#fff; }
  .HARMFUL_ACTION { background:#cf222e; } .SILENT_FAILURE { background:#8250df; } .DEGRADED { background:#9a6700; }
  .INCONCLUSIVE { background:#0969da; } .SAFE_FAILURE { background:#1b7c83; } .SAFE_SUCCESS { background:#1a7f37; }
  table { width:100%; border-collapse:collapse; } th,td { text-align:left; padding:6px 8px; border-bottom:1px solid #d0d7de; vertical-align:top; }
  th { color:#57606a; font-weight:600; font-size:12px; }
  code { font-family:ui-monospace,Menlo,monospace; font-size:12px; word-break:break-all; }
  .err { color:#cf222e; } .answer { white-space:pre-wrap; background:#f6f8fa; border-radius:6px; padding:10px; }
</style>
</head>
<body>
<main>
  <h1>${escapeMarkup(report.scenarioId)} <span class="badge ${escapeMarkup(report.aggregateVerdict)}">${escapeMarkup(report.aggregateVerdict)}</span></h1>
  <div class="meta">world <code>${escapeMarkup(report.world)}</code> · agent <code>${escapeMarkup(report.agentId)}</code> · seed <code>${escapeMarkup(report.seed)}</code> · ${report.stats.total} trial(s) · AgentCrucible ${escapeMarkup(report.toolVersion)}</div>
  <div class="panel">
    <div><strong>Task:</strong> ${escapeMarkup(report.scenario.task)}</div>
    <div><strong>Faults:</strong> ${escapeMarkup(report.scenario.faults.map(describeFault).join("; ") || "none")}</div>
    <div><strong>Expect:</strong> ${escapeMarkup(describeExpect(report))}</div>
    <div><strong>Verdict reason:</strong> ${escapeMarkup(worst?.reason ?? "")}</div>
  </div>
  ${warnings ? `<div class="panel"><h2>Warnings</h2><ul>${warnings}</ul></div>` : ""}
  <div class="panel"><h2>Trials</h2><ul>${trialList}</ul>
    <div>Flaky rate ${pct(report.stats.flakyRate)} · critical-rate 95% lower bound ${pct(report.stats.criticalRateLower95)} · faults fired in ${report.stats.trialsWithFault}/${report.stats.total} trials</div></div>
  <div class="panel"><h2>Trial ${worst?.trace.trialIndex ?? "—"}: tool calls and state changes</h2>
    <table><thead><tr><th>Call</th><th>Tool</th><th>Result</th><th>Fault</th><th>Agent saw</th><th>State change</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6">No calls</td></tr>'}</tbody></table></div>
  <div class="panel"><h2>Final answer</h2><div class="answer">${escapeMarkup(worst?.trace.finalAnswer ?? "")}</div>
    <p><strong>Outcome check:</strong> ${escapeMarkup(worst ? `${worst.outcome.status} — ${worst.outcome.summary}` : "")}</p></div>
  <div class="panel"><h2>Findings</h2><ol>${findings || "<li>None</li>"}</ol></div>
</main>
</body>
</html>
`;
  return writeReportFile(outDir, report.scenarioId, ".report.html", html);
}

/** One testcase per trial; a trial fails when its verdict is at least `failOn`. */
export function writeJUnitReport(report: RunReport, outDir: string, failOn: Verdict = "SILENT_FAILURE"): string {
  const classname = `agentcrucible.${escapeMarkup(report.world)}`;
  const failures = report.trials.filter((t) => atLeast(t.verdict, failOn)).length;
  const cases = report.trials
    .map((t) => {
      const name = escapeMarkup(`${report.scenarioId}::${report.agentId}::trial${t.trace.trialIndex}`);
      const failure = atLeast(t.verdict, failOn)
        ? `\n    <failure message="${escapeMarkup(t.verdict)}" type="${escapeMarkup(t.verdict)}">${escapeMarkup(t.reason)}</failure>`
        : "";
      return `  <testcase classname="${classname}" name="${name}" time="0">${failure}
    <system-out>${escapeMarkup(`${t.verdict}: ${t.reason}`)}</system-out>
  </testcase>`;
    })
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="agentcrucible.${escapeMarkup(report.scenarioId)}" tests="${report.trials.length}" failures="${failures}" time="${(report.durationMs / 1000).toFixed(3)}">
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

export function describeFault(f: RunReport["scenario"]["faults"][number]): string {
  const when = f.onCall !== undefined
    ? `call ${f.onCall}`
    : f.onCallRange
      ? `one call in ${f.onCallRange[0]}-${f.onCallRange[1]} (seeded)`
      : "every call";
  const chance = f.probability !== undefined ? ` with probability ${f.probability}` : "";
  return `${f.kind} on ${f.target} ${when}${chance}`;
}

function describeExpect(report: RunReport): string {
  const e = report.scenario.expect;
  if (!e) return "none (task completion is not checked)";
  const parts = e.effects.map((x) => `${x.kind} ${Object.entries(x.fields).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ")}`.trim());
  if (e.effects.length === 0) parts.push("no state changes");
  if (e.answerAmountCents !== undefined) parts.push(`answer states $${(e.answerAmountCents / 100).toFixed(2)}`);
  return parts.join("; ");
}

function callState(c: ToolCallRecord): string {
  if (!c.mutating) return c.committed ? "read" : "not executed";
  if (!c.committed) return "not committed";
  return (c.committedResult as { deduplicated?: unknown } | undefined)?.deduplicated === true ? "deduplicated" : "committed";
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Escapes text for HTML and XML content and attribute values. */
function escapeMarkup(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
