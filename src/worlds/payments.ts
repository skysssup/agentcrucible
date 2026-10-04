import { readIdempotencyKey, type World, type WorldTool } from "./types.js";

export interface LedgerEntry {
  refundId: string;
  orderId: string;
  amountCents: number;
  idempotencyKey?: string;
  atSeq: number;
}

interface PaymentsState {
  ledger: LedgerEntry[];
  seq: number;
}

export function createPaymentsWorld(): World {
  let state: PaymentsState = { ledger: [], seq: 0 };

  const tools: WorldTool[] = [
    {
      name: "create_refund",
      description: "Refund an order. Commits to the ledger immediately.",
      mutating: true,
      parameters: {
        order_id: { type: "string", description: "Order id", required: true },
        amount_cents: { type: "number", description: "Amount in cents", required: true },
        idempotency_key: { type: "string", description: "Optional idempotency key" },
      },
    },
    {
      name: "get_refund",
      description: "Look up a refund by id.",
      mutating: false,
      parameters: {
        refund_id: { type: "string", description: "Refund id", required: true },
      },
    },
    {
      name: "list_refunds",
      description: "List all refunds for an order.",
      mutating: false,
      parameters: {
        order_id: { type: "string", description: "Order id", required: true },
      },
    },
  ];

  const view = (e: LedgerEntry) => ({
    refund_id: e.refundId,
    order_id: e.orderId,
    amount_cents: e.amountCents,
    status: "succeeded",
  });

  return {
    name: "payments",
    description: "Refund ledger. create_refund deduplicates by idempotency key.",
    tools,
    recordFields: {
      refund: { order_id: "string", amount_cents: "number", idempotency_key: "string" },
    },
    reset() {
      state = { ledger: [], seq: 0 };
    },
    snapshot() {
      return structuredClone(state) as unknown as Record<string, unknown>;
    },
    invoke(tool, args) {
      if (tool === "create_refund") {
        const orderId = String(args.order_id ?? "");
        const amountCents = Number(args.amount_cents);
        const idempotencyKey = readIdempotencyKey(tool, args);
        if (!orderId || !Number.isFinite(amountCents) || amountCents < 0) {
          throw new Error("create_refund requires order_id and a non-negative amount_cents");
        }
        const existing = idempotencyKey
          ? state.ledger.find((e) => e.idempotencyKey === idempotencyKey)
          : undefined;
        if (existing) return { ...view(existing), deduplicated: true };
        state.seq += 1;
        const entry: LedgerEntry = {
          refundId: `re_${state.seq}_${orderId}`,
          orderId,
          amountCents,
          idempotencyKey,
          atSeq: state.seq,
        };
        state.ledger.push(entry);
        return { ...view(entry), deduplicated: false };
      }
      if (tool === "get_refund") {
        const id = String(args.refund_id ?? "");
        const hit = state.ledger.find((e) => e.refundId === id);
        if (!hit) throw new Error(`refund not found: ${id}`);
        return view(hit);
      }
      if (tool === "list_refunds") {
        const orderId = String(args.order_id ?? "");
        return state.ledger.filter((e) => e.orderId === orderId).map(view);
      }
      throw new Error(`unknown tool: ${tool}`);
    },
    records(snapshot) {
      const ledger = (snapshot as unknown as PaymentsState).ledger ?? [];
      return ledger.map((e) => ({
        kind: "refund",
        id: e.refundId,
        fields: {
          order_id: e.orderId,
          amount_cents: e.amountCents,
          ...(e.idempotencyKey ? { idempotency_key: e.idempotencyKey } : {}),
        },
      }));
    },
  };
}
