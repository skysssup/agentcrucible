import { describe, expect, it } from "vitest";
import { BUILTIN_FAULTS, describeSchedule, resolveOnCall, selectFault, shouldApplyFault } from "../src/faults.js";
import { pickInRange, unitRandom } from "../src/hash.js";
import { runHarness } from "../src/harness.js";
import { sampleValue, validate } from "../src/schema.js";
import { FAULT_KINDS, type FaultSpec } from "../src/types.js";
import { createPaymentsWorld } from "../src/worlds/payments.js";
import { createWorld } from "./helpers.js";

const BUILTIN_WORLD_TOOL = (name: string) => createPaymentsWorld().tools.find((t) => t.name === name)!;

function decideFault(specs: FaultSpec[], tool: string, callIndex: number, seed: string, trialIndex: number) {
  const index = selectFault(specs, tool, callIndex, seed, trialIndex);
  return index === -1 ? { apply: false } : { apply: true, kind: specs[index].kind, index };
}

const observe = (kind: string, result: unknown, params: Record<string, unknown> = {}) => BUILTIN_FAULTS[kind].apply({ tool: "t", args: {}, result, params });

describe("fault selection", () => {
  it("applies timeout_after_commit on the targeted call", () => {
    const d = decideFault([{ target: "create_refund", kind: "timeout_after_commit", onCall: 1 }], "create_refund", 1, "seed", 0);
    expect(d).toMatchObject({ apply: true, kind: "timeout_after_commit", index: 0 });
    expect(observe("timeout_after_commit", { refund_id: "re_1" })).toMatchObject({ ok: false, code: "ETIMEDOUT" });
  });

  it("skips other call indices and other tools", () => {
    expect(shouldApplyFault({ target: "create_refund", kind: "timeout", onCall: 2 }, "create_refund", 1, "seed", 0)).toBe(false);
    expect(shouldApplyFault({ target: "create_refund", kind: "timeout" }, "list_refunds", 1, "seed", 0)).toBe(false);
    expect(shouldApplyFault({ target: "*", kind: "timeout" }, "list_refunds", 7, "seed", 0)).toBe(true);
  });

  it("lets the first matching spec decide and reports its index", () => {
    const specs: FaultSpec[] = [
      { target: "create_refund", kind: "timeout", onCall: 2 },
      { target: "*", kind: "rate_limit_429" },
    ];
    expect(decideFault(specs, "create_refund", 2, "s", 0)).toMatchObject({ kind: "timeout", index: 0 });
    expect(decideFault(specs, "create_refund", 1, "s", 0)).toMatchObject({ kind: "rate_limit_429", index: 1 });
  });

  it("picks one call per trial from on_call_range, deterministically", () => {
    const spec: FaultSpec = { target: "x", kind: "timeout", onCallRange: [1, 3] };
    const picks = Array.from({ length: 60 }, (_, trial) => resolveOnCall(spec, "seed-a", trial)!);
    expect(picks).toEqual(Array.from({ length: 60 }, (_, trial) => resolveOnCall(spec, "seed-a", trial)));
    expect(new Set(picks)).toEqual(new Set([1, 2, 3]));
  });

  it("lets the whole seed influence small ranges", () => {
    const firstPicks = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].map((seed) =>
      Array.from({ length: 8 }, (_, trial) => pickInRange(`${seed}:trial${trial}`, 1, 2)).join("")
    );
    expect(new Set(firstPicks).size).toBeGreaterThan(5);
    const ones = Array.from({ length: 4000 }, (_, i) => pickInRange(`s:${i}`, 1, 2)).filter((p) => p === 1).length;
    expect(ones).toBeGreaterThan(1800);
    expect(ones).toBeLessThan(2200);
  });

  it("treats probability as a per-call chance resolved from the seed", () => {
    const hits = (probability: number) =>
      Array.from({ length: 1000 }, (_, call) => shouldApplyFault({ target: "*", kind: "timeout", probability }, "t", call + 1, "seed", 0)).filter(Boolean).length;
    expect(hits(0)).toBe(0);
    expect(hits(1)).toBe(1000);
    expect(hits(0.3)).toBeGreaterThan(240);
    expect(hits(0.3)).toBeLessThan(360);
    for (let i = 0; i < 1000; i++) expect(unitRandom(`u${i}`)).toBeLessThan(1);
  });

  it("changes amounts for silent_wrong_data", () => {
    const params = { field: "amount_cents", delta: -50 };
    expect(observe("silent_wrong_data", { amount_cents: 8400, refund_id: "re" }, params)).toEqual({ ok: true, result: { amount_cents: 8350, refund_id: "re" } });
    expect(observe("silent_wrong_data", { refund_id: "re" }, params)).toEqual({ ok: true, result: { refund_id: "re" } });
  });

  it("returns a stale value without marking it", () => {
    expect(observe("stale_cache", { account_id: "acct_1", balance_cents: 10000 }, { stale_value: 5 })).toEqual({ ok: true, result: { account_id: "acct_1", balance_cents: 5 } });
  });

  it("faults exactly the listed calls with on_calls, and every call from from_call on", () => {
    const listed: FaultSpec = { target: "send_email", kind: "rate_limit_429", onCalls: [1, 3] };
    const from: FaultSpec = { target: "send_email", kind: "rate_limit_429", fromCall: 2 };
    const fired = (spec: FaultSpec) => [1, 2, 3, 4].filter((call) => shouldApplyFault(spec, "send_email", call, "seed", 0));
    expect(fired(listed)).toEqual([1, 3]);
    expect(fired(from)).toEqual([2, 3, 4]);
    expect(fired({ ...from, probability: 0 })).toEqual([]);
    expect([listed, from, { target: "x", kind: "timeout" }, { target: "x", kind: "timeout", onCallRange: [1, 3] }].map((s) => describeSchedule(s as FaultSpec))).toEqual([
      "calls 1, 3",
      "calls 2 and later",
      "every call",
      "one call in 1-3 (seeded)",
    ]);
  });
});

describe("new fault kinds", () => {
  const refundSchema = BUILTIN_WORLD_TOOL("create_refund").outputSchema!;

  it("phantom_success synthesizes a well-formed response from the output schema and the arguments", () => {
    const args = { order_id: "4471", amount_cents: 8400, idempotency_key: "k" };
    const result = BUILTIN_FAULTS.phantom_success.apply({ tool: "create_refund", args, result: undefined, params: {}, outputSchema: refundSchema });
    expect(result).toEqual({ ok: true, result: { refund_id: "refund_0", order_id: "4471", amount_cents: 8400, status: "succeeded", deduplicated: false } });
    expect(validate(refundSchema, (result as { result: unknown }).result)).toEqual([]);
    expect(BUILTIN_FAULTS.phantom_success.apply({ tool: "t", args, result: undefined, params: {} })).toEqual({ ok: true, result: {} });
    expect(BUILTIN_FAULTS.phantom_success.apply({ tool: "t", args, result: undefined, params: { result: { id: "x" } }, outputSchema: refundSchema })).toEqual({ ok: true, result: { id: "x" } });
  });

  it("sampleValue honors const, enum, anyOf, minimums, and hints that fit", () => {
    expect(sampleValue({ const: "sent" })).toBe("sent");
    expect(sampleValue({ type: "string", enum: ["b", "a"] })).toBe("b");
    expect(sampleValue({ anyOf: [{ type: "integer", minimum: 3 }, { type: "string" }] })).toBe(3);
    expect(sampleValue({ type: "array", minItems: 2, items: { type: "boolean" } })).toEqual([false, false]);
    expect(sampleValue({ type: "object", properties: { amount_cents: { type: "integer" }, note: { type: "string", minLength: 2 }, id: { type: "string" } } }, { amount_cents: "12", id: "given" })).toEqual({ amount_cents: 0, note: "xx", id: "given" });
    expect(sampleValue({ type: ["null", "string"] })).toBeNull();
    expect(sampleValue({})).toBeNull();
  });

  it("replica_lag empties lists and leaves other results alone", () => {
    expect(observe("replica_lag", [{ refund_id: "re_1" }])).toEqual({ ok: true, result: [] });
    expect(observe("replica_lag", { balance_cents: 1 })).toEqual({ ok: true, result: { balance_cents: 1 } });
  });

  it("partial_response drops id fields by default, or the listed fields, in objects and list items", () => {
    expect(observe("partial_response", { id: "row_1", refund_id: "re_1", order_id: "4471", amount_cents: 1 })).toEqual({ ok: true, result: { amount_cents: 1 } });
    expect(observe("partial_response", [{ ticket_id: "t", title: "a" }], { fields: ["title"] })).toEqual({ ok: true, result: [{ ticket_id: "t" }] });
    expect(observe("partial_response", "text")).toEqual({ ok: true, result: "text" });
  });

  it("duplicate_delivery passes the first result through", () => {
    expect(BUILTIN_FAULTS.duplicate_delivery.stage).toBe("twice");
    expect(observe("duplicate_delivery", { refund_id: "re_1" })).toEqual({ ok: true, result: { refund_id: "re_1" } });
  });
});

describe("fault timing against world state", () => {
  /** How each built-in kind relates to the commit: whether the write ran (and how often), and what the agent sees. */
  const TIMING: Record<string, { commits: 0 | 1 | 2; sees: "error" | "same" | "altered" }> = {
    timeout: { commits: 0, sees: "error" },
    omission: { commits: 0, sees: "error" },
    rate_limit_429: { commits: 0, sees: "error" },
    retry_storm: { commits: 0, sees: "error" },
    auth_expiry: { commits: 0, sees: "error" },
    phantom_success: { commits: 0, sees: "altered" },
    timeout_after_commit: { commits: 1, sees: "error" },
    malformed_response: { commits: 1, sees: "altered" },
    silent_wrong_data: { commits: 1, sees: "altered" },
    stale_cache: { commits: 1, sees: "altered" },
    schema_drift: { commits: 1, sees: "altered" },
    partial_response: { commits: 1, sees: "altered" },
    replica_lag: { commits: 1, sees: "same" },
    duplicate_delivery: { commits: 2, sees: "same" },
  };

  it("classifies every fault kind", () => {
    expect(Object.keys(BUILTIN_FAULTS).sort()).toEqual([...FAULT_KINDS].sort());
    expect(Object.keys(TIMING).sort()).toEqual([...FAULT_KINDS].sort());
    for (const kind of FAULT_KINDS) {
      expect([kind, BUILTIN_FAULTS[kind].stage]).toEqual([kind, TIMING[kind].commits === 0 ? "before" : TIMING[kind].commits === 1 ? "after" : "twice"]);
    }
  });

  it.each(FAULT_KINDS.map((kind) => [kind]))("%s fires at the documented point relative to the commit", async (kind) => {
    const world = createWorld("payments");
    const trace = await runHarness({
      scenarioId: "timing", task: "t", seed: "s", trialIndex: 0, agentId: "probe", world,
      faults: [{ target: "create_refund", kind, onCall: 1 }],
      agent: async (ctx) => {
        await ctx.callTool("create_refund", { order_id: "1", amount_cents: 100 });
        return "done";
      },
    });
    const [call] = trace.calls;
    const ledger = trace.worldAfter.ledger as unknown[];
    const { commits, sees } = TIMING[kind];
    expect(call.faultApplied).toBe(kind);
    expect([call.committed, ledger.length]).toEqual([commits > 0, commits]);
    if (commits > 0) expect(call.committedResult).toMatchObject({ refund_id: "re_1_1", order_id: "1", amount_cents: 100, deduplicated: false });
    else expect(call.committedResult).toBeUndefined();
    if (sees === "error") expect(call.observed.ok).toBe(false);
    if (sees === "same") expect(call.observed).toEqual({ ok: true, result: call.committedResult });
    if (sees === "altered") {
      expect(call.observed.ok).toBe(true);
      expect(call.observed).not.toEqual({ ok: true, result: call.committedResult });
    }
    expect(call.changes).toHaveLength(commits);
    expect(call.worldSnapshotAfter).toEqual(trace.worldAfter);
  });

  it("duplicate_delivery deduplicates a keyed call the second time and reports a second rejection as nothing", async () => {
    const run = async (args: Record<string, unknown>) =>
      runHarness({
        scenarioId: "twice", task: "t", seed: "s", trialIndex: 0, agentId: "probe", world: createWorld("payments"),
        faults: [{ target: "*", kind: "duplicate_delivery" }],
        agent: async (ctx) => {
          const first = await ctx.callTool("create_refund", args);
          const refundId = (first.result as { refund_id: string }).refund_id;
          await ctx.callTool("void_refund", { refund_id: refundId });
          await ctx.callTool("get_refund", { refund_id: "missing" });
          return "done";
        },
      });
    const keyed = await run({ order_id: "1", amount_cents: 100, idempotency_key: "k" });
    expect((keyed.worldAfter.ledger as unknown[]).length).toBe(1);
    expect(keyed.calls[0].changes).toHaveLength(1);
    expect(keyed.calls[1]).toMatchObject({ committed: true, changes: ['~ refund re_1_1 status="voided"'], observed: { ok: true, result: { status: "voided", deduplicated: false } } });
    expect(keyed.calls[2]).toMatchObject({ committed: false, observed: { ok: false, code: "EWORLD" } });
    const unkeyed = await run({ order_id: "1", amount_cents: 100 });
    expect((unkeyed.worldAfter.ledger as Array<{ refundId: string }>).map((e) => e.refundId)).toEqual(["re_1_1", "re_2_1"]);
    expect(unkeyed.calls[0].observed).toEqual({ ok: true, result: unkeyed.calls[0].committedResult });
  });
});
