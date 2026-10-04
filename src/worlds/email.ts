import { readIdempotencyKey, type World, type WorldTool } from "./types.js";

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
      parameters: {
        to: { type: "string", description: "Recipient", required: true },
        subject: { type: "string", description: "Subject", required: true },
        body: { type: "string", description: "Body", required: true },
        idempotency_key: { type: "string", description: "Optional idempotency key" },
      },
    },
    {
      name: "list_sent",
      description: "List sent emails.",
      mutating: false,
      parameters: {},
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
    snapshot() {
      return structuredClone(state) as unknown as Record<string, unknown>;
    },
    invoke(tool, args) {
      if (tool === "send_email") {
        const to = String(args.to ?? "").trim();
        const subject = String(args.subject ?? "");
        const body = String(args.body ?? "");
        const idempotencyKey = readIdempotencyKey(tool, args);
        if (!to) throw new Error("send_email requires a recipient");
        const existing = idempotencyKey
          ? state.outbox.find((m) => m.idempotencyKey === idempotencyKey)
          : undefined;
        if (existing) return { message_id: existing.id, status: "sent", deduplicated: true };
        state.seq += 1;
        const id = `msg_${state.seq}`;
        state.outbox.push({ id, to, subject, body, idempotencyKey });
        return { message_id: id, status: "sent", deduplicated: false };
      }
      if (tool === "list_sent") {
        return state.outbox.map((m) => ({ message_id: m.id, to: m.to, subject: m.subject }));
      }
      throw new Error(`unknown tool: ${tool}`);
    },
    records(snapshot) {
      const outbox = (snapshot as unknown as EmailState).outbox ?? [];
      return outbox.map((m) => ({
        kind: "email",
        id: m.id,
        fields: {
          to: m.to,
          subject: m.subject,
          body: m.body,
          ...(m.idempotencyKey ? { idempotency_key: m.idempotencyKey } : {}),
        },
      }));
    },
  };
}
