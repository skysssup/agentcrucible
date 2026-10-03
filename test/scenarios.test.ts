import { describe, expect, it } from "vitest";
import { loadAllScenarios, findScenarios } from "../src/scenarios.js";
import { runScenario } from "../src/runner.js";

describe("bundled scenario expectations", () => {
  it.each(loadAllScenarios())("matches the naive verdict for $id", async scenario => {
    const report = await runScenario({ scenario, agentId: "naive-retry", seed: "scenario-check", trials: 5 });
    expect(scenario.expectedNaiveVerdict).toBeDefined();
    expect(report.aggregateVerdict).toBe(scenario.expectedNaiveVerdict);
    const again = await runScenario({ scenario, agentId: "naive-retry", seed: "scenario-check", trials: 5 });
    expect(again.trials.map(trial => trial.verdict)).toEqual(report.trials.map(trial => trial.verdict));
  });

  it.each(loadAllScenarios().filter(scenario => scenario.faults.length > 0))(
    "exercises the configured fault in $id",
    async scenario => {
      const agentId = scenario.world === "database" ? "gullible-reader" : "naive-retry";
      const report = await runScenario({ scenario, agentId, seed: "scenario-check", trials: 5 });
      for (const fault of scenario.faults) {
        expect(report.trials.some(trial => trial.trace.calls.some(call =>
          call.tool === fault.target && call.faultApplied === fault.kind
        ))).toBe(true);
      }
    }
  );

  it("changes the database balance to the stated value", async () => {
    const report = await runScenario({
      scenario: findScenarios({ id: "database/silent-wrong-balance" })[0], agentId: "gullible-reader",
    });
    expect(report.trials[0].trace.calls[0].observed).toMatchObject({ result: { balance_cents: 12345 } });
    expect(report.trials[0].trace.calls[0].committedResult).toMatchObject({ balance_cents: 10000 });
  });

  it("renames an existing result field in the schema-drift drill", async () => {
    const report = await runScenario({
      scenario: findScenarios({ id: "database/schema-drift" })[0], agentId: "gullible-reader",
    });
    const observation = report.trials[0].trace.calls[0].observed;
    expect(observation).toEqual({
      ok: true, result: { account_id: "acct_1", balance: 10000, api_version: "v0-deprecated" },
    });
  });
});
