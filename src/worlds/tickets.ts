import type { World, WorldTool } from "./types.js";

export interface Ticket {
  id: string;
  title: string;
  status: "open" | "closed" | "escalated";
  assignee?: string;
  comments: string[];
  idempotencyKey?: string;
}

interface TicketsState {
  tickets: Ticket[];
  seq: number;
}

function cloneState(s: TicketsState): TicketsState {
  return {
    tickets: s.tickets.map((t) => ({ ...t, comments: [...t.comments] })),
    seq: s.seq,
  };
}

export function createTicketsWorld(): World {
  let state: TicketsState = { tickets: [], seq: 0 };

  const tools: WorldTool[] = [
    {
      name: "create_ticket",
      description: "Open a support ticket.",
      mutating: true,
      parameters: {
        title: { type: "string", description: "Ticket title", required: true },
        body: { type: "string", description: "Initial comment" },
        idempotency_key: { type: "string", description: "Optional idempotency key" },
      },
    },
    {
      name: "escalate_ticket",
      description: "Escalate an existing ticket.",
      mutating: true,
      parameters: {
        ticket_id: { type: "string", description: "Ticket id", required: true },
        reason: { type: "string", description: "Escalation reason" },
        idempotency_key: { type: "string", description: "Optional idempotency key" },
      },
    },
    {
      name: "get_ticket",
      description: "Fetch a ticket by id.",
      mutating: false,
      parameters: {
        ticket_id: { type: "string", description: "Ticket id", required: true },
      },
    },
    {
      name: "list_tickets",
      description: "List all tickets.",
      mutating: false,
      parameters: {},
    },
  ];

  return {
    name: "tickets",
    description: "Support ticket system with create/escalate and idempotency.",
    tools,
    reset() {
      state = { tickets: [], seq: 0 };
    },
    snapshot() {
      return cloneState(state) as unknown as Record<string, unknown>;
    },
    restore(snap) {
      const s = snap as unknown as TicketsState;
      state = cloneState({ tickets: s.tickets ?? [], seq: s.seq ?? 0 });
    },
    invoke(tool, args) {
      if (tool === "create_ticket") {
        const title = String(args.title ?? "");
        const body = args.body !== undefined ? String(args.body) : "";
        const idempotencyKey =
          args.idempotency_key !== undefined ? String(args.idempotency_key) : undefined;
        if (!title) throw new Error("create_ticket requires title");
        if (idempotencyKey) {
          const existing = state.tickets.find((t) => t.idempotencyKey === idempotencyKey);
          if (existing) {
            return { ticket_id: existing.id, status: existing.status, deduplicated: true };
          }
        }
        state.seq += 1;
        const id = `tkt_${state.seq}`;
        const ticket: Ticket = {
          id,
          title,
          status: "open",
          comments: body ? [body] : [],
          idempotencyKey,
        };
        state.tickets.push(ticket);
        return { ticket_id: id, status: "open", deduplicated: false };
      }
      if (tool === "escalate_ticket") {
        const ticketId = String(args.ticket_id ?? "");
        const reason = args.reason !== undefined ? String(args.reason) : "escalated";
        const idempotencyKey =
          args.idempotency_key !== undefined ? String(args.idempotency_key) : undefined;
        const ticket = state.tickets.find((t) => t.id === ticketId);
        if (!ticket) throw new Error(`ticket not found: ${ticketId}`);
        if (idempotencyKey) {
          const already = ticket.comments.some((c) => c.includes(`[idem:${idempotencyKey}]`));
          if (already) {
            return { ticket_id: ticket.id, status: ticket.status, deduplicated: true };
          }
        }
        ticket.status = "escalated";
        ticket.comments.push(
          idempotencyKey ? `${reason} [idem:${idempotencyKey}]` : reason
        );
        return { ticket_id: ticket.id, status: ticket.status, deduplicated: false };
      }
      if (tool === "get_ticket") {
        const ticketId = String(args.ticket_id ?? "");
        const ticket = state.tickets.find((t) => t.id === ticketId);
        if (!ticket) throw new Error(`ticket not found: ${ticketId}`);
        return { ...ticket };
      }
      if (tool === "list_tickets") {
        return state.tickets.map((t) => ({
          ticket_id: t.id,
          title: t.title,
          status: t.status,
        }));
      }
      throw new Error(`unknown tool: ${tool}`);
    },
    diff(before, after) {
      const b = before as unknown as TicketsState;
      const a = after as unknown as TicketsState;
      const lines: string[] = [];
      const beforeIds = new Set((b.tickets ?? []).map((t) => t.id));
      for (const t of a.tickets ?? []) {
        if (!beforeIds.has(t.id)) {
          lines.push(`+ ticket ${t.id} title=${t.title} status=${t.status}`);
        } else {
          const prev = (b.tickets ?? []).find((x) => x.id === t.id);
          if (prev && prev.status !== t.status) {
            lines.push(`~ ticket ${t.id} status ${prev.status}→${t.status}`);
          }
          if (prev && t.comments.length > prev.comments.length) {
            lines.push(
              `~ ticket ${t.id} +${t.comments.length - prev.comments.length} comment(s)`
            );
          }
        }
      }
      return lines;
    },
  };
}
