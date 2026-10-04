import { join } from "node:path";
import { describeFault, worstTrial } from "./describe.js";
import { formatCallLines, painter, shouldColor, writeHtmlReport, writeJsonReport, writeRunIndex } from "./report.js";
import type { Registry } from "./registry.js";
import { runScenario } from "./runner.js";
import type { RunReport, Scenario } from "./types.js";

export const DEMO_SCENARIO = "payments/timeout-after-commit";
export const DEMO_SEED = "demo";

export interface DemoResult {
  reports: RunReport[];
  /** Agents whose verdict differs from the scenario's expected_verdicts. */
  mismatches: string[];
}

/** Runs every agent listed in the scenario's expected_verdicts with one seed and explains the results. */
export async function runDemo(scenario: Scenario, registry: Registry, out?: string): Promise<DemoResult> {
  const paint = painter(shouldColor(process.stdout));
  const agents = Object.keys(scenario.expectedVerdicts);
  if (agents.length === 0) throw new Error(`${scenario.id} has no expected_verdicts, so there is nothing to demonstrate`);
  const log = (line = "") => console.log(line);

  log(paint("bold", `AgentCrucible demo: ${scenario.id}`));
  log();
  log(`Task:  ${scenario.task}`);
  log(`Fault: ${scenario.faults.map(describeFault).join("; ") || "none"}`);
  if (scenario.worlds.length > 1) log(`Worlds: ${scenario.worlds.join(", ")}`);
  log(`Risk:  ${scenario.description}`);
  log();
  log(`Each agent below runs the same scenario with seed "${DEMO_SEED}", so the fault hits the same call every time.`);

  const reports: RunReport[] = [];
  const mismatches: string[] = [];
  for (const [i, agentId] of agents.entries()) {
    const report = await runScenario({ scenario, agentId, seed: DEMO_SEED, registry });
    reports.push(report);
    const trial = worstTrial(report)!;
    const expected = scenario.expectedVerdicts[agentId];
    const matches = report.aggregateVerdict === expected;
    if (!matches) mismatches.push(agentId);
    log();
    log(`${paint("bold", `${i + 1}. ${agentId}`)} ${paint("dim", `- ${registry.agents.get(agentId)?.value.description ?? ""}`)}`);
    for (const line of formatCallLines(trial, paint)) log(`   ${line}`);
    log(`   answer:  ${JSON.stringify(trial.trace.finalAnswer)}`);
    log(
      `   verdict: ${paint(report.aggregateVerdict, report.aggregateVerdict)} ${matches ? paint("dim", "(expected)") : paint("bold", `(UNEXPECTED: scenario expects ${expected})`)}`
    );
    log(`   why:     ${trial.reason}`);
  }

  log();
  log(paint("bold", "Comparison"));
  const width = Math.max(...agents.map((a) => a.length));
  for (const report of reports) {
    const trial = worstTrial(report)!;
    const changes = `${trial.effects.length} state change${trial.effects.length === 1 ? "" : "s"}`;
    log(`  ${report.agentId.padEnd(width)}  ${paint(report.aggregateVerdict, report.aggregateVerdict.padEnd(14))}  ${changes.padEnd(16)}  ${trial.findings[0]?.rule ?? ""}`);
  }
  log();
  if (out) {
    for (const report of reports) {
      writeJsonReport(report, join(out, report.agentId));
      writeHtmlReport(report, join(out, report.agentId));
    }
    writeRunIndex(reports.map((report) => ({ report, dir: report.agentId })), out, `AgentCrucible demo: ${scenario.id}`, "SILENT_FAILURE");
    log(`Wrote JSON and HTML reports to ${join(out, "<agent>")}/ and an index to ${join(out, "index.html")}`);
  }
  if (mismatches.length === 0) {
    log("Every verdict matches the scenario's expected_verdicts. HARMFUL_ACTION and SILENT_FAILURE here are the");
    log("behaviors this scenario is designed to catch; they are not errors in the demo.");
  } else {
    log(paint("bold", `Self-check failed: ${mismatches.join(", ")} did not get the expected verdict.`));
  }
  log(paint("dim", `Next: agentcrucible run --scenario ${scenario.id} --agent ${agents[0]} --trials 5`));
  return { reports, mismatches };
}
