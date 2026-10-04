import { describe, expect, it } from "vitest";
import { createToolCaller } from "../src/harness.js";
import { createPaymentsWorld } from "../src/worlds/payments.js";

describe("payments world", () => {
  it("commits refunds and returns the original for a repeated key", () => {
    const w = createPaymentsWorld();
    w.reset();
    const a = w.invoke("create_refund", { order_id: "1", amount_cents: 100, idempotency_key: "k1" }) as Record<string, unknown>;
    const b = w.invoke("create_refund", { order_id: "1", amount_cents: 100, idempotency_key: "k1" });
    expect(a).toEqual({ refund_id: "re_1_1", order_id: "1", amount_cents: 100, status: "succeeded", deduplicated: false });
    expect(b).toEqual({ ...a, deduplicated: true });
    expect((w.snapshot() as { ledger: unknown[] }).ledger).toHaveLength(1);
  });

  it("refunds twice without a key, and twice with two different keys", () => {
    const w = createPaymentsWorld();
    w.reset();
    w.invoke("create_refund", { order_id: "1", amount_cents: 100 });
    w.invoke("create_refund", { order_id: "1", amount_cents: 100 });
    w.invoke("create_refund", { order_id: "1", amount_cents: 100, idempotency_key: "a" });
    w.invoke("create_refund", { order_id: "1", amount_cents: 100, idempotency_key: "b" });
    expect(w.invoke("list_refunds", { order_id: "1" })).toHaveLength(4);
  });

  it("returns the first refund for a reused key even if the arguments differ", () => {
    const w = createPaymentsWorld();
    w.reset();
    w.invoke("create_refund", { order_id: "1", amount_cents: 100, idempotency_key: "k" });
    expect(w.invoke("create_refund", { order_id: "2", amount_cents: 999, idempotency_key: "k" })).toMatchObject({
      order_id: "1", amount_cents: 100, deduplicated: true,
    });
  });

  it.each([
    [{ order_id: "", amount_cents: 1 }, '$.order_id: must have at least 1 characters'],
    [{ order_id: "1", amount_cents: -1 }, "$.amount_cents: must be at least 0 (got -1)"],
    [{ order_id: "1", amount_cents: "lots" }, '$.amount_cents: expected integer, got string "lots"'],
    [{ order_id: "1", amount_cents: 1.5 }, "$.amount_cents: expected integer, got number"],
    [{ order_id: "1", amount_cents: 1, idempotency_key: " " }, "$.idempotency_key: must match /\\S/"],
    [{ amount_cents: 1 }, '$: missing required property "order_id"'],
  ])("rejects %j before the world runs it", (args, message) => {
    const world = createPaymentsWorld();
    world.reset();
    const caller = createToolCaller({ world, faults: [], seed: "s", trialIndex: 0 });
    const call = caller.call("create_refund", args);
    expect(call).toMatchObject({ committed: false, observed: { ok: false, code: "EARGS", error: `invalid arguments for create_refund: ${message}` } });
    expect((world.snapshot() as { ledger: unknown[] }).ledger).toEqual([]);
  });

  it("voids a refund once and keeps it in the ledger", () => {
    const w = createPaymentsWorld();
    w.reset();
    w.invoke("create_refund", { order_id: "1", amount_cents: 100 });
    expect(w.invoke("void_refund", { refund_id: "re_1_1" })).toEqual({ refund_id: "re_1_1", status: "voided", deduplicated: false });
    expect(w.invoke("void_refund", { refund_id: "re_1_1" })).toEqual({ refund_id: "re_1_1", status: "voided", deduplicated: true });
    expect(w.invoke("list_refunds", { order_id: "1" })).toEqual([{ refund_id: "re_1_1", order_id: "1", amount_cents: 100, status: "voided" }]);
    expect(() => w.invoke("void_refund", { refund_id: "re_9" })).toThrow("refund not found: re_9");
  });

  it("seeds refunds from setup records and never reuses their ids", () => {
    const w = createPaymentsWorld();
    w.reset();
    w.seed!([{ kind: "refund", id: "re_1_1", fields: { order_id: "1", amount_cents: 500 } }]);
    expect(w.invoke("create_refund", { order_id: "1", amount_cents: 100 })).toMatchObject({ refund_id: "re_2_1" });
    expect(w.records(w.snapshot()).map((r) => [r.id, r.fields.status])).toEqual([["re_1_1", "succeeded"], ["re_2_1", "succeeded"]]);
    expect(() => w.seed!([{ kind: "refund", id: "re_x", fields: { order_id: "1" } }])).toThrow("setup refund re_x needs amount_cents (number)");
  });
});
