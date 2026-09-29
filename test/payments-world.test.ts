import { describe, expect, it } from "vitest";
import { createPaymentsWorld } from "../src/worlds/payments.js";

describe("payments world", () => {
  it("commits refunds and respects idempotency", () => {
    const w = createPaymentsWorld();
    w.reset();
    const a = w.invoke("create_refund", {
      order_id: "1",
      amount_cents: 100,
      idempotency_key: "k1",
    }) as { refund_id: string; deduplicated: boolean };
    const b = w.invoke("create_refund", {
      order_id: "1",
      amount_cents: 100,
      idempotency_key: "k1",
    }) as { refund_id: string; deduplicated: boolean };
    expect(a.deduplicated).toBe(false);
    expect(b.deduplicated).toBe(true);
    expect(a.refund_id).toBe(b.refund_id);
    const snap = w.snapshot() as { ledger: unknown[] };
    expect(snap.ledger).toHaveLength(1);
  });

  it("double-charges without idempotency", () => {
    const w = createPaymentsWorld();
    w.reset();
    w.invoke("create_refund", { order_id: "1", amount_cents: 100 });
    w.invoke("create_refund", { order_id: "1", amount_cents: 100 });
    const snap = w.snapshot() as { ledger: unknown[] };
    expect(snap.ledger).toHaveLength(2);
  });
});
