import { describe, expect, it } from "vitest";
import { BUILTIN_FAULTS, describeSchedule, resolveOnCall, selectFault, shouldApplyFault } from "../src/faults.js";
import { pickInRange, unitRandom } from "../src/hash.js";
import { runHarness } from "../src/harness.js";
import { FAULT_KINDS, type FaultSpec } from "../src/types.js";
import { createWorld } from "./helpers.js";

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

describe("fault timing against world state", () => {
  const postCommit: string[] = ["timeout_after_commit", "malformed_response", "silent_wrong_data", "stale_cache", "schema_drift"];

  it("classifies every fault kind", () => {
    expect(Object.keys(BUILTIN_FAULTS).sort()).toEqual([...FAULT_KINDS].sort());
    expect(FAULT_KINDS.filter((k) => BUILTIN_FAULTS[k].stage === "after").sort()).toEqual([...postCommit].sort());
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
    expect(call.faultApplied).toBe(kind);
    if (postCommit.includes(kind)) {
      expect([call.committed, ledger.length]).toEqual([true, 1]);
      expect(call.committedResult).toMatchObject({ order_id: "1", amount_cents: 100, deduplicated: false });
      expect(call.observed).not.toEqual({ ok: true, result: call.committedResult });
    } else {
      expect([call.committed, ledger.length, call.committedResult]).toEqual([false, 0, undefined]);
      expect(call.observed.ok).toBe(false);
    }
    expect(call.worldSnapshotAfter).toEqual(trace.worldAfter);
  });
});
