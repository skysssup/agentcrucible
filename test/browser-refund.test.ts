import { expect, it } from "vitest";
import { runRefundExperiment } from "../src/browser-refund.js";
import { runScenario } from "../src/runner.js";
import { findScenarios } from "../src/scenarios.js";

it("the browser slice produces the same trace, effects, and verdict as the CLI engine", async () => {
  const scenario = findScenarios({ id: "payments/timeout-after-commit" })[0];
  const browser = await runRefundExperiment(scenario);
  expect(browser).toHaveLength(5);
  for (const result of browser) {
    const cli = await runScenario({ scenario, agentId: result.agentId, seed: "demo" });
    expect(result.trace).toEqual(cli.trials[0].trace);
    expect(result.effects).toEqual(cli.trials[0].effects);
    expect(result.verdict).toBe(cli.aggregateVerdict);
  }
});
