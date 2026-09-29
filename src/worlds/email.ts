import type { World, WorldTool } from "./types.js";

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

function clone(s: EmailState): EmailState {
  return { seq: s.seq, outbox: s.outbox.map((m) => ({ ...m })) };
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
    description: "Stateful email outbox.",
    tools,
    reset() {
      state = { outbox: [], seq: 0 };
    },
    snapshot() {
      return clone(state) as unknown as Record<string, unknown>;
    },
    restore(snap) {
      state = clone(snap as unknown as EmailState);
    },
    invoke(tool, args) {
      if (tool === "send_email") {
        const to = String(args.to ?? "");
        const subject = String(args.subject ?? "");
        const body = String(args.body ?? "");
        const idem =
          args.idempotency_key !== undefined ? String(args.idempotency_key) : undefined;
        if (idem) {
          const existing = state.outbox.find((m) => m.idempotencyKey === idem);
          if (existing) {
            return { message_id: existing.id, status: "sent", deduplicated: true };
          }
        }
        state.seq += 1;
        const id = `msg_${state.seq}`;
        state.outbox.push({ id, to, subject, body, idempotencyKey: idem });
        return { message_id: id, status: "sent", deduplicated: false };
      }
      if (tool === "list_sent") {
        return state.outbox.map((m) => ({
          message_id: m.id,
          to: m.to,
          subject: m.subject,
        }));
      }
      throw new Error(`unknown tool: ${tool}`);
    },
    diff(before, after) {
      const b = before as unknown as EmailState;
      const a = after as unknown as EmailState;
      const beforeIds = new Set((b.outbox ?? []).map((m) => m.id));
      return (a.outbox ?? [])
        .filter((m) => !beforeIds.has(m.id))
        .map(
          (m) =>
            `+ email ${m.id} to=${m.to} subject=${JSON.stringify(m.subject)}` +
            (m.idempotencyKey ? ` idem=${m.idempotencyKey}` : " (no idempotency key)")
        );
    },
  };
}
