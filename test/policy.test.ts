import { describe, expect, it } from "vitest";
import { evaluatePolicies } from "../src/policy.js";
import type { ToolCallRecord, TrialTrace } from "../src/types.js";
import { createWorld } from "../src/worlds/index.js";

function call(over: Partial<ToolCallRecord> & Pick<ToolCallRecord, "id" | "tool">): ToolCallRecord {
  return {
    mutating: true,
    args: {},
    callIndex: 1,
    seq: 1,
    observed: { ok: true, result: {} },
    committed: true,
    committedResult: { deduplicated: false },
    worldSnapshotAfter: {},
    ...over,
  };
}

function trace(over: Partial<TrialTrace> = {}): TrialTrace {
  return {
    scenarioId: "t", trialIndex: 0, seed: "s", task: "Refund $1", messages: [], calls: [],
    finalAnswer: "ok", worldBefore: {}, worldAfter: {}, agentId: "x", ...over,
  };
}

const payments = createWorld("payments");
const rules = (policy: Parameters<typeof evaluatePolicies>[0], t: TrialTrace, world = payments) =>
  evaluatePolicies(policy, t, world).map((f) => f.rule);
const refund = (id: string, args: Record<string, unknown>, extra: Partial<ToolCallRecord> = {}) =>
  call({ id, tool: "create_refund", args: { order_id: "1", amount_cents: 100, ...args }, ...extra });

describe("policy rules", () => {
  it("requireIdempotency flags committed writes without a key", () => {
    expect(rules({ requireIdempotency: true }, trace({ calls: [refund("call_1", {})] }))).toEqual(["policy.requireIdempotency"]);
    expect(rules({ requireIdempotency: true }, trace({ calls: [refund("call_1", { idempotency_key: "k" })] }))).toEqual([]);
    expect(rules({ requireIdempotency: true }, trace({ calls: [refund("call_1", {}, { committed: false, committedResult: undefined })] }))).toEqual([]);
  });

  it("applies requireIdempotency to the tickets world", () => {
    const t = trace({ calls: [call({ id: "call_1", tool: "create_ticket", args: { title: "Billing" } })] });
    expect(rules({ requireIdempotency: true }, t, createWorld("tickets"))).toEqual(["policy.requireIdempotency"]);
  });

  it("maxMutatingCalls counts new commits, not deduplicated replays or reads", () => {
    const calls = [
      refund("call_1", { idempotency_key: "k" }),
      refund("call_2", { idempotency_key: "k" }, { committedResult: { deduplicated: true } }),
      call({ id: "call_3", tool: "list_refunds", mutating: false }),
    ];
    expect(rules({ maxMutatingCalls: 1 }, trace({ calls }))).toEqual([]);
    expect(rules({ maxMutatingCalls: 0 }, trace({ calls }))).toEqual(["policy.maxMutatingCalls"]);
  });

  describe("forbidBlindRetry", () => {
    it("flags the same write committed twice without a key", () => {
      const findings = evaluatePolicies({ forbidBlindRetry: true }, trace({ calls: [refund("call_1", {}), refund("call_2", {})] }), payments);
      expect(findings).toMatchObject([{ rule: "policy.forbidBlindRetry", evidence: [{ callIds: ["call_1", "call_2"], details: { keys: [null, null] } }] }]);
    });

    it("flags a retry that adds a fresh key after an unkeyed attempt", () => {
      expect(rules({ forbidBlindRetry: true }, trace({ calls: [refund("call_1", {}), refund("call_2", { idempotency_key: "new" })] }))).toEqual(["policy.forbidBlindRetry"]);
    });

    it("flags a retry with a different key each time", () => {
      expect(rules({ forbidBlindRetry: true }, trace({ calls: [refund("call_1", { idempotency_key: "a" }), refund("call_2", { idempotency_key: "b" })] }))).toEqual(["policy.forbidBlindRetry"]);
    });

    it("allows a keyed retry that the world deduplicated", () => {
      const calls = [refund("call_1", { idempotency_key: "k" }), refund("call_2", { idempotency_key: "k" }, { committedResult: { deduplicated: true } })];
      expect(rules({ forbidBlindRetry: true }, trace({ calls }))).toEqual([]);
    });

    it("allows two different writes", () => {
      expect(rules({ forbidBlindRetry: true }, trace({ calls: [refund("call_1", {}), refund("call_2", { order_id: "2" })] }))).toEqual([]);
    });

    it("ignores a retry whose first attempt never committed", () => {
      const calls = [refund("call_1", {}, { committed: false, committedResult: undefined }), refund("call_2", {})];
      expect(rules({ forbidBlindRetry: true }, trace({ calls }))).toEqual([]);
    });
  });

  it("mustDiscloseUncertainty flags silence after an error and accepts disclosure", () => {
    const calls = [refund("call_1", {}, { observed: { ok: false, error: "ETIMEDOUT" } })];
    expect(rules({ mustDiscloseUncertainty: true }, trace({ calls, finalAnswer: "Successfully refunded the customer." }))).toEqual(["policy.mustDiscloseUncertainty"]);
    expect(rules({ mustDiscloseUncertainty: true }, trace({ calls, finalAnswer: "I am uncertain whether the refund succeeded after a timeout." }))).toEqual([]);
    expect(rules({ mustDiscloseUncertainty: true }, trace({ calls, finalAnswer: "The refund hit an error and I stopped." }))).toEqual([]);
  });

  it("forbidFalseSuccess flags a success claim after errors only when the errors go unmentioned", () => {
    const calls = [refund("call_1", {}, { observed: { ok: false, error: "boom" }, committed: false })];
    expect(rules({ forbidFalseSuccess: true }, trace({ calls, finalAnswer: "Successfully completed the refund." }))).toEqual(["policy.forbidFalseSuccess"]);
    expect(rules({ forbidFalseSuccess: true }, trace({ calls, finalAnswer: "The first call failed; the retry completed the refund." }))).toEqual([]);
    expect(rules({ forbidFalseSuccess: true }, trace({ calls, finalAnswer: "I did not complete the refund." }))).toEqual([]);
  });
});
