import { readIdempotencyKey, type World, type WorldTool } from "./types.js";

export interface Ticket {
  id: string;
  title: string;
  status: "open" | "closed" | "escalated";
  comments: string[];
  idempotencyKey?: string;
}

interface TicketsState {
  tickets: Ticket[];
  seq: number;
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
    description: "Support tickets with create and escalate. Both deduplicate by idempotency key.",
    tools,
    recordFields: {
      ticket: { title: "string", status: "string", comments: "array", idempotency_key: "string" },
    },
    reset() {
      state = { tickets: [], seq: 0 };
    },
    snapshot() {
      return structuredClone(state) as unknown as Record<string, unknown>;
    },
    invoke(tool, args) {
      if (tool === "create_ticket") {
        const title = String(args.title ?? "").trim();
        const body = args.body !== undefined ? String(args.body) : "";
        const idempotencyKey = readIdempotencyKey(tool, args);
        if (!title) throw new Error("create_ticket requires title");
        const existing = idempotencyKey
          ? state.tickets.find((t) => t.idempotencyKey === idempotencyKey)
          : undefined;
        if (existing) return { ticket_id: existing.id, status: existing.status, deduplicated: true };
        state.seq += 1;
        const id = `tkt_${state.seq}`;
        state.tickets.push({ id, title, status: "open", comments: body ? [body] : [], idempotencyKey });
        return { ticket_id: id, status: "open", deduplicated: false };
      }
      if (tool === "escalate_ticket") {
        const ticketId = String(args.ticket_id ?? "");
        const reason = args.reason !== undefined ? String(args.reason) : "escalated";
        const idempotencyKey = readIdempotencyKey(tool, args);
        const ticket = state.tickets.find((t) => t.id === ticketId);
        if (!ticket) throw new Error(`ticket not found: ${ticketId}`);
        const marker = idempotencyKey ? ` [idem:${idempotencyKey}]` : "";
        if (marker && ticket.comments.some((c) => c.endsWith(marker))) {
          return { ticket_id: ticket.id, status: ticket.status, deduplicated: true };
        }
        ticket.status = "escalated";
        ticket.comments.push(reason + marker);
        return { ticket_id: ticket.id, status: ticket.status, deduplicated: false };
      }
      if (tool === "get_ticket") {
        const ticketId = String(args.ticket_id ?? "");
        const ticket = state.tickets.find((t) => t.id === ticketId);
        if (!ticket) throw new Error(`ticket not found: ${ticketId}`);
        return { id: ticket.id, title: ticket.title, status: ticket.status, comments: [...ticket.comments] };
      }
      if (tool === "list_tickets") {
        return state.tickets.map((t) => ({ ticket_id: t.id, title: t.title, status: t.status }));
      }
      throw new Error(`unknown tool: ${tool}`);
    },
    records(snapshot) {
      const tickets = (snapshot as unknown as TicketsState).tickets ?? [];
      return tickets.map((t) => ({
        kind: "ticket",
        id: t.id,
        fields: {
          title: t.title,
          status: t.status,
          comments: t.comments,
          ...(t.idempotencyKey ? { idempotency_key: t.idempotencyKey } : {}),
        },
      }));
    },
  };
}
