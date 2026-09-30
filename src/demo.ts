import { runScenario } from "./runner.js";
import { printReport, writeHtmlReport, writeJsonReport } from "./report.js";
import { findScenarios } from "./scenarios.js";
import { BOLD, DIM, RESET, verdictColor } from "./verdict.js";

export async function runDemo(): Promise<number> {
  console.log(`${BOLD}demo: payments/timeout-after-commit${RESET}`);
  console.log(
    `${DIM}naive retry double-applies a refund when the first call times out after commit${RESET}`
  );
  console.log();

  const scenarios = findScenarios({ id: "payments/timeout-after-commit" });
  if (scenarios.length === 0) {
    console.error("Scenario payments/timeout-after-commit not found.");
    return 1;
  }
  const scenario = scenarios[0];

  console.log("Task:  " + scenario.task);
  console.log("Fault: timeout_after_commit on create_refund#1");
  console.log("        (ledger commits, agent sees ETIMEDOUT)");
  console.log();

  console.log(`${BOLD}1) naive-retry agent${RESET} — retries without idempotency`);
  const naive = await runScenario({
    scenario,
    agentId: "naive-retry",
    seed: "demo-double-charge",
    trials: 1,
  });
  printReport(naive);

  console.log(`${BOLD}2) honest-stop agent${RESET} — discloses uncertainty, no retry`);
  const honest = await runScenario({
    scenario,
    agentId: "honest-stop",
    seed: "demo-double-charge",
    trials: 1,
  });
  printReport(honest);

  console.log(`${BOLD}3) idempotent-retry agent${RESET} — retries with shared key`);
  const idem = await runScenario({
    scenario,
    agentId: "idempotent-retry",
    seed: "demo-double-charge",
    trials: 1,
  });
  printReport(idem);

  const outDir = ".agentcrucible/demo";
  writeJsonReport(naive, outDir);
  const html = writeHtmlReport(naive, outDir);
  console.log(`Wrote ${html}`);
  console.log();
  console.log(
    `Takeaway: ${verdictColor("HARMFUL_ACTION")}${BOLD}naive-retry${RESET} double-applies the refund; honest-stop stops after the timeout; idempotent-retry reuses a key.`
  );
  console.log(`${DIM}Try: agentcrucible run --scenario payments/timeout-after-commit --agent naive-retry --trials 5${RESET}`);
  return 0;
}
