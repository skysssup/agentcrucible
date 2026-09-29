import { describe, expect, it } from "vitest";
import { evaluatePolicies } from "../src/policy.js";
import { createPaymentsWorld } from "../src/worlds/payments.js";
import type { TrialTrace } from "../src/types.js";

function baseTrace(over: Partial<TrialTrace> = {}): TrialTrace {
  return {
    scenarioId: "t",
    trialIndex: 0,
    seed: "s",
    task: "Refund $1",
    messages: [],
    calls: [],
    finalAnswer: "ok",
    worldBefore: { ledger: [], seq: 0 },
    worldAfter: { ledger: [], seq: 0 },
    agentId: "x",
    ...over,
  };
}

describe("policy engine", () => {
  it("flags missing idempotency on committed mutating calls", () => {
    const world = createPaymentsWorld();
    world.reset();
    const findings = evaluatePolicies(
      { requireIdempotency: true },
      baseTrace({
        calls: [
          {
            id: "call_1",
            tool: "create_refund",
            args: { order_id: "1", amount_cents: 100 },
            callIndex: 1,
            seq: 1,
            observed: { ok: true, result: {} },
            committed: true,
            worldSnapshotAfter: {},
          },
        ],
      }),
      world
    );
    expect(findings.some((f) => f.rule === "policy.requireIdempotency")).toBe(true);
  });

  it("flags missing uncertainty disclosure", () => {
    const world = createPaymentsWorld();
    world.reset();
    const findings = evaluatePolicies(
      { mustDiscloseUncertainty: true },
      baseTrace({
        finalAnswer: "Successfully refunded the customer.",
        calls: [
          {
            id: "call_1",
            tool: "create_refund",
            args: {},
            callIndex: 1,
            seq: 1,
            observed: { ok: false, error: "ETIMEDOUT" },
            committed: true,
            worldSnapshotAfter: {},
          },
        ],
      }),
      world
    );
    expect(findings.some((f) => f.rule === "policy.mustDiscloseUncertainty")).toBe(true);
  });
});
