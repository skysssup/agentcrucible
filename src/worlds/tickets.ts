import type { JsonSchema } from "../schema.js";
import { IDEMPOTENCY_KEY, nextId, objectSchema, readIdempotencyKey, seedField, type World, type WorldTool } from "./types.js";

const STATUSES = ["open", "escalated", "resolved"] as const;
type TicketStatus = (typeof STATUSES)[number];

export interface Ticket {
  id: string;
  title: string;
  status: TicketStatus;
  comments: string[];
  idempotencyKey?: string;
}

interface TicketsState {
  tickets: Ticket[];
  seq: number;
  /** Idempotency keys used by escalate_ticket and update_ticket, with the ticket each one changed. */
  updateKeys: Record<string, string>;
}

const CHANGE_RESULT: JsonSchema = objectSchema(
  { ticket_id: { type: "string" }, status: { type: "string", enum: [...STATUSES] }, deduplicated: { type: "boolean" } },
  ["ticket_id", "status", "deduplicated"]
);
const TICKET_ID: JsonSchema = { type: "string", minLength: 1, description: "Ticket id" };

export function createTicketsWorld(): World {
  let state: TicketsState = { tickets: [], seq: 0, updateKeys: {} };

  const tools: WorldTool[] = [
    {
      name: "create_ticket",
      description: "Open a support ticket.",
      mutating: true,
      inputSchema: objectSchema(
        { title: { type: "string", minLength: 1, pattern: "\\S", description: "Ticket title" }, body: { type: "string", description: "Initial comment" }, idempotency_key: IDEMPOTENCY_KEY },
        ["title"]
      ),
      outputSchema: CHANGE_RESULT,
    },
    {
      name: "escalate_ticket",
      description: "Escalate an existing ticket and record the reason as a comment.",
      mutating: true,
      inputSchema: objectSchema({ ticket_id: TICKET_ID, reason: { type: "string", description: "Escalation reason" }, idempotency_key: IDEMPOTENCY_KEY }, ["ticket_id"]),
      outputSchema: CHANGE_RESULT,
    },
    {
      name: "update_ticket",
      description: "Add a comment to a ticket, change its status, or both.",
      mutating: true,
      inputSchema: {
        ...objectSchema(
          {
            ticket_id: TICKET_ID,
            status: { type: "string", enum: [...STATUSES], description: "New status" },
            comment: { type: "string", minLength: 1, description: "Comment to append" },
            idempotency_key: IDEMPOTENCY_KEY,
          },
          ["ticket_id"]
        ),
        anyOf: [{ required: ["status"] }, { required: ["comment"] }],
      },
      outputSchema: CHANGE_RESULT,
    },
    {
      name: "get_ticket",
      description: "Fetch a ticket by id.",
      mutating: false,
      inputSchema: objectSchema({ ticket_id: TICKET_ID }, ["ticket_id"]),
      outputSchema: objectSchema(
        { ticket_id: { type: "string" }, title: { type: "string" }, status: { type: "string", enum: [...STATUSES] }, comments: { type: "array", items: { type: "string" } } },
        ["ticket_id", "title", "status", "comments"]
      ),
    },
    {
      name: "list_tickets",
      description: "List all tickets.",
      mutating: false,
      inputSchema: objectSchema({}),
      outputSchema: {
        type: "array",
        items: objectSchema({ ticket_id: { type: "string" }, title: { type: "string" }, status: { type: "string", enum: [...STATUSES] } }, ["ticket_id", "title", "status"]),
      },
    },
  ];

  const find = (ticketId: string) => {
    const ticket = state.tickets.find((t) => t.id === ticketId);
    if (!ticket) throw new Error(`ticket not found: ${ticketId}`);
    return ticket;
  };

  /** Applies a keyed change once; a repeated key returns the ticket unchanged. */
  const change = (args: Record<string, unknown>, apply: (ticket: Ticket) => void) => {
    const ticket = find(String(args.ticket_id));
    const key = readIdempotencyKey(args);
    if (key && state.updateKeys[key] !== undefined) {
      const first = find(state.updateKeys[key]);
      return { ticket_id: first.id, status: first.status, deduplicated: true };
    }
    apply(ticket);
    if (key) state.updateKeys[key] = ticket.id;
    return { ticket_id: ticket.id, status: ticket.status, deduplicated: false };
  };

  return {
    name: "tickets",
    description: "Support tickets with create, escalate, and update. All three deduplicate by idempotency key.",
    tools,
    recordFields: {
      ticket: { title: "string", status: "string", comments: "array", idempotency_key: "string" },
    },
    reset() {
      state = { tickets: [], seq: 0, updateKeys: {} };
    },
    seed(records) {
      for (const r of records) {
        const status = seedField<string>(r, "status", "string", "open");
        if (!STATUSES.includes(status as TicketStatus)) throw new Error(`setup ticket ${r.id} status must be one of: ${STATUSES.join(", ")}`);
        const comments = r.fields.comments ?? [];
        if (!Array.isArray(comments) || !comments.every((c) => typeof c === "string")) throw new Error(`setup ticket ${r.id} comments must be a list of strings`);
        state.tickets.push({ id: r.id, title: seedField(r, "title", "string"), status: status as TicketStatus, comments: [...comments] });
      }
    },
    snapshot() {
      return structuredClone(state) as unknown as Record<string, unknown>;
    },
    invoke(tool, args) {
      switch (tool) {
        case "create_ticket": {
          const idempotencyKey = readIdempotencyKey(args);
          const existing = idempotencyKey ? state.tickets.find((t) => t.idempotencyKey === idempotencyKey) : undefined;
          if (existing) return { ticket_id: existing.id, status: existing.status, deduplicated: true };
          const { id, seq } = nextId(state.seq, (n) => `tkt_${n}`, (candidate) => state.tickets.some((t) => t.id === candidate));
          state.seq = seq;
          const body = args.body === undefined ? "" : String(args.body);
          state.tickets.push({ id, title: String(args.title).trim(), status: "open", comments: body ? [body] : [], idempotencyKey });
          return { ticket_id: id, status: "open", deduplicated: false };
        }
        case "escalate_ticket":
          return change(args, (ticket) => {
            ticket.status = "escalated";
            ticket.comments.push(args.reason === undefined ? "escalated" : String(args.reason));
          });
        case "update_ticket":
          return change(args, (ticket) => {
            if (args.comment !== undefined) ticket.comments.push(String(args.comment));
            if (args.status !== undefined) ticket.status = args.status as TicketStatus;
          });
        case "get_ticket": {
          const ticket = find(String(args.ticket_id));
          return { ticket_id: ticket.id, title: ticket.title, status: ticket.status, comments: [...ticket.comments] };
        }
        case "list_tickets":
          return state.tickets.map((t) => ({ ticket_id: t.id, title: t.title, status: t.status }));
        default:
          throw new Error(`unknown tool: ${tool}`);
      }
    },
    records(snapshot) {
      return ((snapshot as unknown as TicketsState).tickets ?? []).map((t) => ({
        kind: "ticket",
        id: t.id,
        fields: { title: t.title, status: t.status, comments: t.comments, ...(t.idempotencyKey ? { idempotency_key: t.idempotencyKey } : {}) },
      }));
    },
  };
}
