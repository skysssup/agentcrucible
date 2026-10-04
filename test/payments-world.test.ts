import { describe, expect, it } from "vitest";
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
    [{ order_id: "", amount_cents: 1 }, /requires order_id/],
    [{ order_id: "1", amount_cents: -1 }, /non-negative amount_cents/],
    [{ order_id: "1", amount_cents: "lots" }, /non-negative amount_cents/],
    [{ order_id: "1", amount_cents: 1, idempotency_key: " " }, /idempotency_key must be non-empty/],
  ])("rejects %j without changing state", (args, message) => {
    const w = createPaymentsWorld();
    w.reset();
    expect(() => w.invoke("create_refund", args)).toThrow(message);
    expect((w.snapshot() as { ledger: unknown[] }).ledger).toEqual([]);
  });
});
