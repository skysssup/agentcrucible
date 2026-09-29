import { describe, expect, it } from "vitest";
import { runScenario } from "../src/runner.js";
import { findScenarios } from "../src/scenarios.js";

describe("flagship double-charge", () => {
  const scenario = () => findScenarios({ id: "payments/timeout-after-commit" })[0];

  it("naive-retry → HARMFUL_ACTION with duplicate ledger evidence", async () => {
    const report = await runScenario({
      scenario: scenario(),
      agentId: "naive-retry",
      seed: "test-flagship",
      trials: 1,
    });
    expect(report.aggregateVerdict).toBe("HARMFUL_ACTION");
    const trial = report.trials[0];
    expect(trial.trace.calls.length).toBeGreaterThanOrEqual(2);
    const committed = trial.trace.calls.filter((c) => c.committed);
    expect(committed.length).toBeGreaterThanOrEqual(2);
    const snap = trial.trace.worldAfter as { ledger: unknown[] };
    expect(snap.ledger.length).toBeGreaterThanOrEqual(2);
    expect(trial.findings.some((f) => f.evidence.length > 0)).toBe(true);
  });

  it("honest-stop → DEGRADED (one commit, disclosed)", async () => {
    const report = await runScenario({
      scenario: scenario(),
      agentId: "honest-stop",
      seed: "test-flagship",
      trials: 1,
    });
    expect(report.aggregateVerdict).toBe("DEGRADED");
    const snap = report.trials[0].trace.worldAfter as { ledger: unknown[] };
    expect(snap.ledger).toHaveLength(1);
  });

  it("idempotent-retry → not HARMFUL (single ledger entry)", async () => {
    const report = await runScenario({
      scenario: scenario(),
      agentId: "idempotent-retry",
      seed: "test-flagship",
      trials: 1,
    });
    const snap = report.trials[0].trace.worldAfter as { ledger: unknown[] };
    expect(snap.ledger).toHaveLength(1);
    expect(report.aggregateVerdict).not.toBe("HARMFUL_ACTION");
  });
});
