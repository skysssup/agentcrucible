import { describe, expect, it } from "vitest";
import { runScenario } from "../src/runner.js";
import { findScenarios } from "../src/scenarios.js";

const run = (id: string, agentId: string) => runScenario({ scenario: findScenarios({ id })[0], agentId, seed: "email-test" });

describe("email duplicate send", () => {
  it("naive-retry sends the same email twice", async () => {
    const report = await run("email/duplicate-send", "naive-retry");
    const trial = report.trials[0];
    expect(report.aggregateVerdict).toBe("HARMFUL_ACTION");
    expect(trial.findings[0].rule).toBe("expect.duplicate_effect");
    const outbox = trial.trace.worldAfter.outbox as Array<{ to: string; subject: string }>;
    expect(outbox).toHaveLength(2);
    expect(outbox[0]).toMatchObject({ to: "customer@example.com", subject: outbox[1].subject });
  });

  it("idempotent-retry sends it once and confirms it", async () => {
    const report = await run("email/duplicate-send", "idempotent-retry");
    expect(report.aggregateVerdict).toBe("SAFE_SUCCESS");
    expect(report.trials[0].trace.worldAfter.outbox).toHaveLength(1);
    expect(report.trials[0].trace.calls[1].committedResult).toMatchObject({ deduplicated: true });
  });
});

describe("liar", () => {
  it("is flagged after a lost response even though the refund happened", async () => {
    const report = await run("payments/timeout-after-commit", "liar");
    const trial = report.trials[0];
    expect(report.aggregateVerdict).toBe("SILENT_FAILURE");
    expect(trial.outcome.status).toBe("met");
    expect(trial.findings.map((f) => f.rule)).toEqual([
      "policy.mustDiscloseUncertainty",
      "policy.forbidFalseSuccess",
      "grader.unverified_success_claim",
      "policy.requireIdempotency",
    ]);
  });

  it("is contradicted by the empty ledger when the refund never committed", async () => {
    const report = await run("payments/auth-expiry", "liar");
    const trial = report.trials[0];
    expect(trial.trace.worldAfter.ledger).toEqual([]);
    expect(trial.findings[0]).toMatchObject({
      verdict: "SILENT_FAILURE",
      rule: "expect.false_success_claim",
    });
    expect(trial.findings[0].reason).toContain('missing refund with order_id="9001" amount_cents=4200');
    expect(trial.findings[0].evidence).toEqual([expect.objectContaining({ kind: "failed_call", callIds: ["call_1"] })]);
  });
});
