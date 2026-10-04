import { IDEMPOTENCY_KEY, nextId, objectSchema, readIdempotencyKey, seedField, type World, type WorldTool } from "./types.js";

interface Mail {
  id: string;
  to: string;
  subject: string;
  body: string;
  idempotencyKey?: string;
}

interface EmailState {
  outbox: Mail[];
  seq: number;
}

export function createEmailWorld(): World {
  let state: EmailState = { outbox: [], seq: 0 };

  const tools: WorldTool[] = [
    {
      name: "send_email",
      description: "Send an email. Commits to the outbox immediately.",
      mutating: true,
      inputSchema: objectSchema(
        {
          to: { type: "string", minLength: 1, pattern: "\\S", description: "Recipient address" },
          subject: { type: "string", description: "Subject line" },
          body: { type: "string", description: "Message body" },
          idempotency_key: IDEMPOTENCY_KEY,
        },
        ["to", "subject", "body"]
      ),
      outputSchema: objectSchema(
        { message_id: { type: "string" }, status: { const: "sent" }, deduplicated: { type: "boolean" } },
        ["message_id", "status", "deduplicated"]
      ),
    },
    {
      name: "list_sent",
      description: "List sent emails.",
      mutating: false,
      inputSchema: objectSchema({}),
      outputSchema: {
        type: "array",
        items: objectSchema({ message_id: { type: "string" }, to: { type: "string" }, subject: { type: "string" } }, ["message_id", "to", "subject"]),
      },
    },
  ];

  return {
    name: "email",
    description: "Email outbox. send_email deduplicates by idempotency key.",
    tools,
    recordFields: {
      email: { to: "string", subject: "string", body: "string", idempotency_key: "string" },
    },
    reset() {
      state = { outbox: [], seq: 0 };
    },
    seed(records) {
      for (const r of records) {
        state.outbox.push({ id: r.id, to: seedField(r, "to", "string"), subject: seedField(r, "subject", "string", ""), body: seedField(r, "body", "string", "") });
      }
    },
    snapshot() {
      return structuredClone(state) as unknown as Record<string, unknown>;
    },
    invoke(tool, args) {
      if (tool === "send_email") {
        const idempotencyKey = readIdempotencyKey(args);
        const existing = idempotencyKey ? state.outbox.find((m) => m.idempotencyKey === idempotencyKey) : undefined;
        if (existing) return { message_id: existing.id, status: "sent", deduplicated: true };
        const { id, seq } = nextId(state.seq, (n) => `msg_${n}`, (candidate) => state.outbox.some((m) => m.id === candidate));
        state.seq = seq;
        state.outbox.push({ id, to: String(args.to).trim(), subject: String(args.subject), body: String(args.body), idempotencyKey });
        return { message_id: id, status: "sent", deduplicated: false };
      }
      if (tool === "list_sent") {
        return state.outbox.map((m) => ({ message_id: m.id, to: m.to, subject: m.subject }));
      }
      throw new Error(`unknown tool: ${tool}`);
    },
    records(snapshot) {
      return ((snapshot as unknown as EmailState).outbox ?? []).map((m) => ({
        kind: "email",
        id: m.id,
        fields: { to: m.to, subject: m.subject, body: m.body, ...(m.idempotencyKey ? { idempotency_key: m.idempotencyKey } : {}) },
      }));
    },
  };
}
