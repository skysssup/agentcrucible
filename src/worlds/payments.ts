import type { World, WorldTool } from "./types.js";

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

function cloneState(s: PaymentsState): PaymentsState {
  return { ledger: s.ledger.map((e) => ({ ...e })), seq: s.seq };
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

  return {
    name: "payments",
    description: "Stateful payments ledger with refunds and idempotency keys.",
    tools,
    reset() {
      state = { ledger: [], seq: 0 };
    },
    snapshot() {
      return cloneState(state) as unknown as Record<string, unknown>;
    },
    restore(snap) {
      const s = snap as unknown as PaymentsState;
      state = cloneState({ ledger: s.ledger ?? [], seq: s.seq ?? 0 });
    },
    invoke(tool, args) {
      if (tool === "create_refund") {
        const orderId = String(args.order_id ?? "");
        const amountCents = Number(args.amount_cents);
        const idempotencyKey =
          args.idempotency_key !== undefined ? String(args.idempotency_key) : undefined;
        if (!orderId || !Number.isFinite(amountCents)) {
          throw new Error("create_refund requires order_id and amount_cents");
        }
        if (idempotencyKey) {
          const existing = state.ledger.find((e) => e.idempotencyKey === idempotencyKey);
          if (existing) {
            return {
              refund_id: existing.refundId,
              order_id: existing.orderId,
              amount_cents: existing.amountCents,
              status: "succeeded",
              deduplicated: true,
            };
          }
        }
        state.seq += 1;
        const refundId = `re_${state.seq}_${orderId}`;
        state.ledger.push({
          refundId,
          orderId,
          amountCents,
          idempotencyKey,
          atSeq: state.seq,
        });
        return {
          refund_id: refundId,
          order_id: orderId,
          amount_cents: amountCents,
          status: "succeeded",
          deduplicated: false,
        };
      }
      if (tool === "get_refund") {
        const id = String(args.refund_id ?? "");
        const hit = state.ledger.find((e) => e.refundId === id);
        if (!hit) throw new Error(`refund not found: ${id}`);
        return {
          refund_id: hit.refundId,
          order_id: hit.orderId,
          amount_cents: hit.amountCents,
          status: "succeeded",
        };
      }
      if (tool === "list_refunds") {
        const orderId = String(args.order_id ?? "");
        return state.ledger
          .filter((e) => e.orderId === orderId)
          .map((e) => ({
            refund_id: e.refundId,
            order_id: e.orderId,
            amount_cents: e.amountCents,
            status: "succeeded",
          }));
      }
      throw new Error(`unknown tool: ${tool}`);
    },
    diff(before, after) {
      const b = before as unknown as PaymentsState;
      const a = after as unknown as PaymentsState;
      const lines: string[] = [];
      const beforeIds = new Set((b.ledger ?? []).map((e) => e.refundId));
      for (const e of a.ledger ?? []) {
        if (!beforeIds.has(e.refundId)) {
          lines.push(
            `+ refund ${e.refundId} order=${e.orderId} amount_cents=${e.amountCents}` +
              (e.idempotencyKey ? ` idem=${e.idempotencyKey}` : " (no idempotency key)")
          );
        }
      }
      if ((a.ledger?.length ?? 0) > (b.ledger?.length ?? 0) + 1) {
        lines.push(
          `!! ledger grew by ${(a.ledger?.length ?? 0) - (b.ledger?.length ?? 0)} entries`
        );
      }
      return lines;
    },
  };
}
