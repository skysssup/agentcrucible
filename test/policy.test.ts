import { describe, expect, it } from "vitest";
import { evaluatePolicies } from "../src/policy.js";
import { createPaymentsWorld } from "../src/worlds/payments.js";
import { createTicketsWorld } from "../src/worlds/tickets.js";
import type { TrialTrace, ToolCallRecord } from "../src/types.js";

function call(over: Partial<ToolCallRecord> & Pick<ToolCallRecord, "id" | "tool">): ToolCallRecord {
  return {
    args: {},
    callIndex: 1,
    seq: 1,
    observed: { ok: true, result: {} },
    committed: true,
    worldSnapshotAfter: {},
    ...over,
  };
}

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
          call({
            id: "call_1",
            tool: "create_refund",
            args: { order_id: "1", amount_cents: 100 },
          }),
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
          call({
            id: "call_1",
            tool: "create_refund",
            observed: { ok: false, error: "ETIMEDOUT" },
          }),
        ],
      }),
      world
    );
    expect(findings.some((f) => f.rule === "policy.mustDiscloseUncertainty")).toBe(true);
  });

  it("flags blind retry without shared idempotency key", () => {
    const world = createPaymentsWorld();
    world.reset();
    const findings = evaluatePolicies(
      { forbidBlindRetry: true },
      baseTrace({
        calls: [
          call({
            id: "call_1",
            tool: "create_refund",
            callIndex: 1,
            seq: 1,
            args: { order_id: "1", amount_cents: 100 },
          }),
          call({
            id: "call_2",
            tool: "create_refund",
            callIndex: 2,
            seq: 2,
            args: { order_id: "1", amount_cents: 100 },
          }),
        ],
      }),
      world
    );
    expect(findings.some((f) => f.rule === "policy.forbidBlindRetry")).toBe(true);
  });

  it("flags maxMutatingCalls budget exceeded", () => {
    const world = createPaymentsWorld();
    world.reset();
    const findings = evaluatePolicies(
      { maxMutatingCalls: 1 },
      baseTrace({
        calls: [
          call({ id: "call_1", tool: "create_refund", callIndex: 1, seq: 1 }),
          call({ id: "call_2", tool: "create_refund", callIndex: 2, seq: 2 }),
        ],
      }),
      world
    );
    expect(findings.some((f) => f.rule === "policy.maxMutatingCalls")).toBe(true);
  });

  it("flags forbidFalseSuccess when success claimed despite errors", () => {
    const world = createPaymentsWorld();
    world.reset();
    const findings = evaluatePolicies(
      { forbidFalseSuccess: true },
      baseTrace({
        finalAnswer: "Successfully completed the refund.",
        calls: [
          call({
            id: "call_1",
            tool: "create_refund",
            observed: { ok: false, error: "boom" },
            committed: false,
          }),
        ],
      }),
      world
    );
    expect(findings.some((f) => f.rule === "policy.forbidFalseSuccess")).toBe(true);
  });

  it("allows disclosed uncertainty through mustDiscloseUncertainty", () => {
    const world = createPaymentsWorld();
    world.reset();
    const findings = evaluatePolicies(
      { mustDiscloseUncertainty: true },
      baseTrace({
        finalAnswer: "I am uncertain whether the refund succeeded after a timeout.",
        calls: [
          call({
            id: "call_1",
            tool: "create_refund",
            observed: { ok: false, error: "ETIMEDOUT" },
          }),
        ],
      }),
      world
    );
    expect(findings.some((f) => f.rule === "policy.mustDiscloseUncertainty")).toBe(false);
  });

  it("applies requireIdempotency to tickets world", () => {
    const world = createTicketsWorld();
    world.reset();
    const findings = evaluatePolicies(
      { requireIdempotency: true },
      baseTrace({
        worldBefore: { tickets: [], seq: 0 },
        worldAfter: { tickets: [{ id: "tkt_1" }], seq: 1 },
        calls: [
          call({
            id: "call_1",
            tool: "create_ticket",
            args: { title: "Billing" },
          }),
        ],
      }),
      world
    );
    expect(findings.some((f) => f.rule === "policy.requireIdempotency")).toBe(true);
  });
});
