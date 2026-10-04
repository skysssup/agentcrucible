import { describe, expect, it } from "vitest";
import { decideFault, isPreCommitFault, resolveOnCall, shouldApplyFault } from "../src/faults.js";
import { pickInRange, unitRandom } from "../src/hash.js";
import { runHarness } from "../src/harness.js";
import { FAULT_KINDS, type FaultKind, type FaultSpec } from "../src/types.js";
import { createWorld } from "../src/worlds/index.js";

describe("fault selection", () => {
  it("applies timeout_after_commit on the targeted call", () => {
    const d = decideFault([{ target: "create_refund", kind: "timeout_after_commit", onCall: 1 }], "create_refund", 1, "seed", 0);
    expect(d).toMatchObject({ apply: true, kind: "timeout_after_commit", index: 0, maskAsError: { code: "ETIMEDOUT" } });
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
    const d = decideFault([{ target: "create_refund", kind: "silent_wrong_data", onCall: 1, params: { field: "amount_cents", delta: -50 } }], "create_refund", 1, "s", 0);
    expect(d.mutateResult?.({ amount_cents: 8400, refund_id: "re" })).toEqual({ amount_cents: 8350, refund_id: "re" });
    expect(d.mutateResult?.({ refund_id: "re" })).toEqual({ refund_id: "re" });
  });

  it("returns a stale value without marking it", () => {
    const d = decideFault([{ target: "get_balance", kind: "stale_cache", params: { stale_value: 5 } }], "get_balance", 1, "s", 0);
    expect(d.mutateResult?.({ account_id: "acct_1", balance_cents: 10000 })).toEqual({ account_id: "acct_1", balance_cents: 5 });
  });
});

describe("fault timing against world state", () => {
  const postCommit: FaultKind[] = ["timeout_after_commit", "malformed_response", "silent_wrong_data", "stale_cache", "schema_drift"];

  it("classifies every fault kind", () => {
    expect(FAULT_KINDS.filter((k) => !isPreCommitFault(k)).sort()).toEqual([...postCommit].sort());
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
