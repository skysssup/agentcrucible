import type { JsonSchema } from "../schema.js";
import { IDEMPOTENCY_KEY, nextId, objectSchema, readIdempotencyKey, seedField, type World, type WorldTool } from "./types.js";

export interface LedgerEntry {
  refundId: string;
  orderId: string;
  amountCents: number;
  status: "succeeded" | "voided";
  idempotencyKey?: string;
}

interface PaymentsState {
  ledger: LedgerEntry[];
  seq: number;
}

const REFUND_PROPERTIES: Record<string, JsonSchema> = {
  refund_id: { type: "string" },
  order_id: { type: "string" },
  amount_cents: { type: "integer" },
  status: { type: "string", enum: ["succeeded", "voided"] },
};
const REFUND: JsonSchema = objectSchema(REFUND_PROPERTIES, Object.keys(REFUND_PROPERTIES));

export function createPaymentsWorld(): World {
  let state: PaymentsState = { ledger: [], seq: 0 };

  const tools: WorldTool[] = [
    {
      name: "create_refund",
      description: "Refund an order. Commits to the ledger immediately.",
      mutating: true,
      inputSchema: objectSchema(
        {
          order_id: { type: "string", minLength: 1, description: "Order id" },
          amount_cents: { type: "integer", minimum: 0, description: "Amount in cents" },
          idempotency_key: IDEMPOTENCY_KEY,
        },
        ["order_id", "amount_cents"]
      ),
      outputSchema: objectSchema({ ...REFUND_PROPERTIES, deduplicated: { type: "boolean" } }, [...Object.keys(REFUND_PROPERTIES), "deduplicated"]),
    },
    {
      name: "void_refund",
      description: "Void a refund so it does not settle. Voiding an already voided refund changes nothing.",
      mutating: true,
      inputSchema: objectSchema({ refund_id: { type: "string", minLength: 1, description: "Refund id" } }, ["refund_id"]),
      outputSchema: objectSchema(
        { refund_id: { type: "string" }, status: { const: "voided" }, deduplicated: { type: "boolean" } },
        ["refund_id", "status", "deduplicated"]
      ),
    },
    {
      name: "get_refund",
      description: "Look up a refund by id.",
      mutating: false,
      inputSchema: objectSchema({ refund_id: { type: "string", minLength: 1, description: "Refund id" } }, ["refund_id"]),
      outputSchema: REFUND,
    },
    {
      name: "list_refunds",
      description: "List all refunds for an order, including voided ones.",
      mutating: false,
      inputSchema: objectSchema({ order_id: { type: "string", minLength: 1, description: "Order id" } }, ["order_id"]),
      outputSchema: { type: "array", items: REFUND },
    },
  ];

  const view = (e: LedgerEntry) => ({ refund_id: e.refundId, order_id: e.orderId, amount_cents: e.amountCents, status: e.status });
  const find = (refundId: string) => {
    const entry = state.ledger.find((e) => e.refundId === refundId);
    if (!entry) throw new Error(`refund not found: ${refundId}`);
    return entry;
  };

  return {
    name: "payments",
    description: "Refund ledger. create_refund deduplicates by idempotency key; void_refund cancels a refund.",
    tools,
    recordFields: {
      refund: { order_id: "string", amount_cents: "number", status: "string", idempotency_key: "string" },
    },
    reset() {
      state = { ledger: [], seq: 0 };
    },
    seed(records) {
      for (const r of records) {
        state.ledger.push({
          refundId: r.id,
          orderId: seedField(r, "order_id", "string"),
          amountCents: seedField(r, "amount_cents", "number"),
          status: seedField(r, "status", "string", "succeeded"),
        });
      }
    },
    snapshot() {
      return structuredClone(state) as unknown as Record<string, unknown>;
    },
    invoke(tool, args) {
      switch (tool) {
        case "create_refund": {
          const orderId = String(args.order_id);
          const idempotencyKey = readIdempotencyKey(args);
          const existing = idempotencyKey ? state.ledger.find((e) => e.idempotencyKey === idempotencyKey) : undefined;
          if (existing) return { ...view(existing), deduplicated: true };
          const { id, seq } = nextId(state.seq, (n) => `re_${n}_${orderId}`, (candidate) => state.ledger.some((e) => e.refundId === candidate));
          state.seq = seq;
          const entry: LedgerEntry = { refundId: id, orderId, amountCents: Number(args.amount_cents), status: "succeeded", idempotencyKey };
          state.ledger.push(entry);
          return { ...view(entry), deduplicated: false };
        }
        case "void_refund": {
          const entry = find(String(args.refund_id));
          const already = entry.status === "voided";
          entry.status = "voided";
          return { refund_id: entry.refundId, status: "voided", deduplicated: already };
        }
        case "get_refund":
          return view(find(String(args.refund_id)));
        case "list_refunds":
          return state.ledger.filter((e) => e.orderId === String(args.order_id)).map(view);
        default:
          throw new Error(`unknown tool: ${tool}`);
      }
    },
    records(snapshot) {
      return ((snapshot as unknown as PaymentsState).ledger ?? []).map((e) => ({
        kind: "refund",
        id: e.refundId,
        fields: {
          order_id: e.orderId,
          amount_cents: e.amountCents,
          status: e.status,
          ...(e.idempotencyKey ? { idempotency_key: e.idempotencyKey } : {}),
        },
      }));
    },
  };
}
