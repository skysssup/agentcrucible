import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { worstTrial } from "./describe.js";
import type { RunIndexEntry } from "./html.js";
import { VERDICTS, type RunReport, type Verdict } from "./types.js";
import { atLeast } from "./verdict.js";

export interface SummaryOptions {
  title: string;
  failOn: Verdict;
  /** Path of the baseline the run was compared with, when it was. */
  baselinePath?: string;
}

/**
 * A Markdown summary of a run, for a CI job summary or a pull request comment: one table with a
 * row per scenario (and, with several agents, a column per agent), followed by the failing
 * results in detail. It names nothing that changes between identical runs, so it diffs cleanly.
 */
export function renderRunSummary(entries: Array<Omit<RunIndexEntry, "href">>, opts: SummaryOptions): string {
  const reports = entries.map((e) => e.report);
  const agents = [...new Set(reports.map((r) => r.agentId))];
  const scenarios = [...new Set(reports.map((r) => r.scenarioId))];
  const trials = [...new Set(reports.map((r) => r.stats.total))];
  const failing = entries.filter((e) => atLeast(e.report.aggregateVerdict, opts.failOn));
  const changed = entries.filter((e) => e.change && e.change !== "unchanged");
  const lines = [`# ${opts.title}`, ""];
  lines.push(
    [
      `${scenarios.length} scenario${scenarios.length === 1 ? "" : "s"}`,
      `${agents.length === 1 ? `agent \`${agents[0]}\`` : `${agents.length} agents`}`,
      `${trials.length === 1 ? `${trials[0]} trial${trials[0] === 1 ? "" : "s"}` : "mixed trial counts"} per scenario`,
      `fail on \`${opts.failOn}\``,
      ...(opts.baselinePath ? [`baseline \`${opts.baselinePath}\``] : []),
    ].join(" · ")
  );
  lines.push("");
  if (agents.length === 1) {
    const withChange = Boolean(opts.baselinePath);
    lines.push(`| Scenario | Verdict |${withChange ? " Change |" : ""} Rule | Reason |`);
    lines.push(`|---|---|${withChange ? "---|" : ""}---|---|`);
    for (const e of entries) {
      const worst = worstTrial(e.report);
      lines.push(
        `| \`${cell(e.report.scenarioId)}\` | ${verdictCell(e.report, opts.failOn)} |${withChange ? ` ${cell(e.change ?? "")} |` : ""} ${worst ? `\`${cell(worst.findings[0]?.rule ?? "")}\`` : ""} | ${cell(worst?.reason ?? "")} |`
      );
    }
  } else {
    const byKey = new Map(entries.map((e) => [`${e.report.scenarioId}\u0000${e.report.agentId}`, e]));
    lines.push(`| Scenario | ${agents.map((a) => `\`${cell(a)}\``).join(" | ")} |`);
    lines.push(`|---|${agents.map(() => "---").join("|")}|`);
    for (const scenario of scenarios) {
      const cells = agents.map((agent) => {
        const e = byKey.get(`${scenario}\u0000${agent}`);
        return e ? `${verdictCell(e.report, opts.failOn)}${e.change && e.change !== "unchanged" ? ` (${cell(e.change)})` : ""}` : "";
      });
      lines.push(`| \`${cell(scenario)}\` | ${cells.join(" | ")} |`);
    }
  }
  lines.push("");
  if (failing.length) {
    lines.push(`## ${failing.length} result${failing.length === 1 ? "" : "s"} at or above \`${opts.failOn}\``, "");
    for (const e of failing) lines.push(`- ${detail(e.report)}`);
    lines.push("");
  }
  if (opts.baselinePath) {
    lines.push(
      changed.length
        ? `## ${changed.length} change${changed.length === 1 ? "" : "s"} against the baseline`
        : "No changes against the baseline.",
      ""
    );
    for (const e of changed) lines.push(`- ${e.change}: ${detail(e.report)}`);
    if (changed.length) lines.push("");
  }
  const total = entries.length;
  lines.push(
    failing.length
      ? `**${failing.length} of ${total} result${total === 1 ? "" : "s"} at or above \`${opts.failOn}\`.**`
      : `**No result at or above \`${opts.failOn}\`.**`
  );
  return `${lines.join("\n")}\n`;
}

/** Writes summary.md in `outDir` and returns its path. */
export function writeRunSummary(entries: Array<Omit<RunIndexEntry, "href">>, outDir: string, opts: SummaryOptions): string {
  mkdirSync(resolve(outDir), { recursive: true });
  writeFileSync(join(resolve(outDir), "summary.md"), renderRunSummary(entries, opts));
  return join(outDir, "summary.md");
}

/** The verdict, bold at or above the threshold, with the split of trials when they disagree. */
function verdictCell(report: RunReport, failOn: Verdict): string {
  const verdict = report.aggregateVerdict;
  const split = VERDICTS.filter((v) => report.stats.byVerdict[v] > 0);
  const counts = split.length > 1 ? ` (${split.map((v) => `${report.stats.byVerdict[v]} ${v}`).join(", ")})` : "";
  return `${atLeast(verdict, failOn) ? `**${verdict}**` : verdict}${counts}`;
}

function detail(report: RunReport): string {
  const worst = worstTrial(report);
  return `\`${cell(report.scenarioId)}\` · \`${cell(report.agentId)}\`: ${report.aggregateVerdict}${worst?.findings[0] ? ` (\`${cell(worst.findings[0].rule)}\`)` : ""}${worst ? `: ${cell(worst.reason)}` : ""}`;
}

/** Text safe inside a Markdown table cell: no pipes or line breaks. */
function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
}
