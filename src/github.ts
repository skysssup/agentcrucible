import { appendFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import type { BaselineComparison } from "./baseline.js";
import { worstTrial } from "./describe.js";
import type { RunReport, Verdict } from "./types.js";
import { atLeast } from "./verdict.js";

/** Escapes a value for a GitHub Actions workflow command (`::error ...::message`). */
function property(value: string): string {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A").replace(/:/g, "%3A").replace(/,/g, "%2C");
}

function message(value: string): string {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

/** The scenario file relative to the workspace, so an annotation attaches to it, or undefined for a bundled or absent file. */
function workspaceFile(source: string | undefined, cwd = process.env.GITHUB_WORKSPACE ?? process.cwd()): string | undefined {
  if (!source) return undefined;
  const path = resolve(source);
  if (!path.startsWith(resolve(cwd) + sep) || path.includes(`${sep}node_modules${sep}`)) return undefined;
  return relative(cwd, path).split(sep).join("/");
}

function command(level: "error" | "warning" | "notice", title: string, text: string, file?: string): string {
  const where = workspaceFile(file);
  return `::${level} title=${property(title)}${where ? `,file=${property(where)}` : ""}::${message(text)}`;
}

/**
 * Workflow commands for a run: an error per result at or above the threshold (attached to the
 * scenario file when it is in the workspace), and with a baseline, an error per regression and
 * a notice per improvement.
 */
export function githubAnnotations(reports: RunReport[], threshold: Verdict, comparison?: BaselineComparison): string[] {
  const lines: string[] = [];
  const regressed = new Set(comparison?.regressions.map((r) => `${r.scenario}\u0000${r.agent}`));
  for (const r of reports) {
    if (!atLeast(r.aggregateVerdict, threshold)) continue;
    const key = `${r.scenarioId}\u0000${r.agentId}`;
    const change = comparison ? (regressed.has(key) ? " (regression)" : comparison.added.some((e) => e.scenario === r.scenarioId && e.agent === r.agentId) ? " (new)" : "") : "";
    lines.push(command("error", `AgentCrucible: ${r.scenarioId} (${r.agentId})${change}`, `${r.aggregateVerdict}: ${worstTrial(r)?.reason ?? ""}`, r.scenario.source));
  }
  for (const ch of comparison?.regressions ?? []) {
    if (reports.some((r) => r.scenarioId === ch.scenario && r.agentId === ch.agent && atLeast(r.aggregateVerdict, threshold))) continue;
    const report = reports.find((r) => r.scenarioId === ch.scenario && r.agentId === ch.agent);
    lines.push(command("error", `AgentCrucible: ${ch.scenario} (${ch.agent}) regressed`, `${ch.before} -> ${ch.after}`, report?.scenario.source));
  }
  for (const ch of comparison?.improvements ?? []) {
    const report = reports.find((r) => r.scenarioId === ch.scenario && r.agentId === ch.agent);
    lines.push(command("notice", `AgentCrucible: ${ch.scenario} (${ch.agent}) improved`, `${ch.before} -> ${ch.after}`, report?.scenario.source));
  }
  return lines;
}

githubAnnotations.error = (title: string, text: string, file?: string): string => command("error", `AgentCrucible: ${title}`, text, file);

/** Appends Markdown to the job summary when GitHub provides one (`GITHUB_STEP_SUMMARY`). */
export function githubStepSummary(markdown: string, env: Record<string, string | undefined> = process.env): boolean {
  const path = env.GITHUB_STEP_SUMMARY;
  if (!path) return false;
  appendFileSync(path, markdown.endsWith("\n") ? markdown : `${markdown}\n`);
  return true;
}
