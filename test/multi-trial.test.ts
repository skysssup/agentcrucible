import { describe, expect, it } from "vitest";
import { runScenario } from "../src/runner.js";
import { findScenarios } from "../src/scenarios.js";

describe("multi-trial stats", () => {
  it("runs N trials and reports the distribution", async () => {
    const report = await runScenario({ scenario: findScenarios({ id: "payments/timeout-after-commit" })[0], agentId: "naive-retry", seed: "multi", trials: 5 });
    expect(report.stats).toMatchObject({ total: 5, flakyRate: 0, modeVerdict: "HARMFUL_ACTION", trialsWithFault: 5 });
    expect(report.stats.byVerdict.HARMFUL_ACTION).toBe(5);
    expect(report.stats.criticalRateLower95).toBeCloseTo(0.5655, 3);
  });

  it("reports a mixed run by its worst trial and flags the variation", async () => {
    const report = await runScenario({ scenario: findScenarios({ id: "payments/retry-storm" })[0], agentId: "honest-stop", seed: "seed-a", trials: 6 });
    expect(report.aggregateVerdict).toBe("SAFE_FAILURE");
    expect(report.stats).toMatchObject({ modeVerdict: "SAFE_SUCCESS", trialsWithFault: 2 });
    expect(report.stats.flakyRate).toBeCloseTo(2 / 6);
    expect(report.warnings).toEqual(["faults[0] (timeout on create_refund) fired in 2 of 6 trials; the others ran without it."]);
  });

  it("keeps fuzzed call selection deterministic per seed", async () => {
    const scenario = findScenarios({ id: "payments/timeout-after-commit" })[0];
    const run = () => runScenario({ scenario, agentId: "naive-retry", seed: "fuzz-seed", trials: 6, fuzzCallRange: [1, 2] });
    const [a, b] = [await run(), await run()];
    expect(a.trials.map((t) => t.trace)).toEqual(b.trials.map((t) => t.trace));
    expect(new Set(a.trials.map((t) => t.verdict)).size).toBeGreaterThan(1);
  });
});
