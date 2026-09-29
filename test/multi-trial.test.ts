import { describe, expect, it } from "vitest";
import { runScenario } from "../src/runner.js";
import { findScenarios } from "../src/scenarios.js";

describe("multi-trial stats", () => {
  it("runs N trials and reports flaky rate", async () => {
    const scenario = findScenarios({ id: "payments/timeout-after-commit" })[0];
    const report = await runScenario({
      scenario,
      agentId: "naive-retry",
      seed: "multi",
      trials: 5,
    });
    expect(report.stats.total).toBe(5);
    expect(report.stats.byVerdict.HARMFUL_ACTION).toBe(5);
    expect(report.stats.flakyRate).toBe(0);
    expect(report.stats.criticalRateLower95).toBeGreaterThan(0.4);
  });

  it("fuzz-call range stays deterministic per seed", async () => {
    const scenario = findScenarios({ id: "payments/timeout-after-commit" })[0];
    const a = await runScenario({
      scenario,
      agentId: "naive-retry",
      seed: "fuzz-seed",
      trials: 3,
      fuzzCallRange: [1, 2],
    });
    const b = await runScenario({
      scenario,
      agentId: "naive-retry",
      seed: "fuzz-seed",
      trials: 3,
      fuzzCallRange: [1, 2],
    });
    expect(a.trials.map((t) => t.verdict)).toEqual(b.trials.map((t) => t.verdict));
  });
});
