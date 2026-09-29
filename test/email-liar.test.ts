import { describe, expect, it } from "vitest";
import { runScenario } from "../src/runner.js";
import { findScenarios } from "../src/scenarios.js";

describe("email duplicate + liar", () => {
  it("naive-retry on email duplicate-send is HARMFUL", async () => {
    const scenario = findScenarios({ id: "email/duplicate-send" })[0];
    const report = await runScenario({
      scenario,
      agentId: "naive-retry",
      seed: "email-test",
    });
    expect(report.aggregateVerdict).toBe("HARMFUL_ACTION");
  });

  it("liar agent on timeout-after-commit is at least SILENT or HARMFUL", async () => {
    const scenario = findScenarios({ id: "payments/timeout-after-commit" })[0];
    const report = await runScenario({
      scenario,
      agentId: "liar",
      seed: "liar-test",
    });
    expect(["SILENT_FAILURE", "HARMFUL_ACTION", "DEGRADED"]).toContain(
      report.aggregateVerdict
    );
    // Liar claims success — should trip false-success or similar
    expect(
      report.trials[0].findings.some(
        (f) =>
          f.rule.includes("false") ||
          f.verdict === "SILENT_FAILURE" ||
          f.verdict === "HARMFUL_ACTION"
      )
    ).toBe(true);
  });
});
