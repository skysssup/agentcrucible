import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAllScenarios, findScenarios, loadScenarioFile } from "../src/scenarios.js";
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

  it("loads the README scenario example without losing the task after a YAML comment", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    const yaml = readme.match(/```yaml\n([\s\S]*?)\n```/)?.[1];
    expect(yaml).toBeDefined();
    const dir = mkdtempSync(join(tmpdir(), "ac-readme-"));
    try {
      const path = join(dir, "scenario.yaml");
      writeFileSync(path, yaml!);
      const scenario = loadScenarioFile(path);
      expect(scenario.task).toBe("Refund order #4471 to the customer. The amount is $84.00.");
      expect(scenario.description).not.toBe("");
      expect(scenario.faults).toMatchObject([{ target: "create_refund", kind: "timeout_after_commit", onCall: 1 }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
