// An AgentCrucible extension: a custom world, a custom fault kind, and two agents.
// List it under "extensions" in a config file (see agentcrucible.config.json next to this file);
// scenarios can then use world "inventory", fault kind "lost_write", and the agents below.

const STATUS = ["reserved", "released"];
const KEY = { type: "string", minLength: 1, description: "Optional idempotency key" };
const RESERVATION = {
  type: "object",
  required: ["reservation_id", "sku", "quantity", "order_id", "status"],
  properties: {
    reservation_id: { type: "string" },
    sku: { type: "string" },
    quantity: { type: "integer" },
    order_id: { type: "string" },
    status: { type: "string", enum: STATUS },
  },
};

export function createInventoryWorld() {
  let state;
  const view = (r) => ({ reservation_id: r.id, sku: r.sku, quantity: r.quantity, order_id: r.orderId, status: r.status });
  const available = (sku) =>
    state.stock[sku] - state.reservations.filter((r) => r.sku === sku && r.status === "reserved").reduce((n, r) => n + r.quantity, 0);

  return {
    name: "inventory",
    description: "Stock levels and reservations. reserve_stock deduplicates by idempotency key.",
    tools: [
      {
        name: "reserve_stock",
        description: "Reserve units of a SKU for an order. Fails when not enough stock is available.",
        mutating: true,
        inputSchema: {
          type: "object",
          required: ["sku", "quantity", "order_id"],
          properties: { sku: { type: "string" }, quantity: { type: "integer", minimum: 1 }, order_id: { type: "string", minLength: 1 }, idempotency_key: KEY },
        },
        outputSchema: { ...RESERVATION, required: [...RESERVATION.required, "deduplicated"], properties: { ...RESERVATION.properties, deduplicated: { type: "boolean" } } },
      },
      {
        name: "release_reservation",
        description: "Release a reservation so its units are available again.",
        mutating: true,
        inputSchema: { type: "object", required: ["reservation_id"], properties: { reservation_id: { type: "string" } } },
        outputSchema: RESERVATION,
      },
      {
        name: "list_reservations",
        description: "List the reservations for an order.",
        mutating: false,
        inputSchema: { type: "object", required: ["order_id"], properties: { order_id: { type: "string" } } },
        outputSchema: { type: "array", items: RESERVATION },
      },
    ],
    recordFields: { reservation: { sku: "string", quantity: "number", order_id: "string", status: "string", idempotency_key: "string" } },
    reset() {
      state = { stock: { "SKU-1": 5, "SKU-2": 1 }, reservations: [], seq: 0 };
    },
    snapshot() {
      return structuredClone(state);
    },
    invoke(tool, args) {
      if (tool === "reserve_stock") {
        const key = args.idempotency_key;
        const existing = key && state.reservations.find((r) => r.key === key);
        if (existing) return { ...view(existing), deduplicated: true };
        if (!(args.sku in state.stock)) throw new Error(`unknown sku: ${args.sku}`);
        if (available(args.sku) < args.quantity) throw new Error(`insufficient stock: ${args.sku} has ${available(args.sku)} available`);
        state.seq += 1;
        const reservation = { id: `rsv_${state.seq}`, sku: args.sku, quantity: args.quantity, orderId: args.order_id, status: "reserved", key };
        state.reservations.push(reservation);
        return { ...view(reservation), deduplicated: false };
      }
      if (tool === "release_reservation") {
        const reservation = state.reservations.find((r) => r.id === args.reservation_id);
        if (!reservation) throw new Error(`reservation not found: ${args.reservation_id}`);
        reservation.status = "released";
        return view(reservation);
      }
      if (tool === "list_reservations") return state.reservations.filter((r) => r.orderId === args.order_id).map(view);
      throw new Error(`unknown tool: ${tool}`);
    },
    records(snapshot) {
      return (snapshot.reservations ?? []).map((r) => ({
        kind: "reservation",
        id: r.id,
        fields: { sku: r.sku, quantity: r.quantity, order_id: r.orderId, status: r.status, ...(r.key ? { idempotency_key: r.key } : {}) },
      }));
    },
  };
}

export const worlds = { inventory: createInventoryWorld };

export const faults = {
  // An acknowledged write that was never stored: the call does not run, but the agent receives
  // a well-formed reserve_stock response. Only reading the state back reveals it.
  lost_write: {
    description: "the call does not run, but the agent receives a well-formed success response",
    stage: "before",
    params: { type: "object", properties: { reservation_id: { type: "string" } }, additionalProperties: false },
    apply: ({ args, params }) => ({
      ok: true,
      result: { reservation_id: params.reservation_id ?? "rsv_100", sku: args.sku, quantity: args.quantity, order_id: args.order_id, status: "reserved", deduplicated: false },
    }),
  },
};

function orderOf(task) {
  return { sku: task.match(/SKU-\d+/)?.[0] ?? "SKU-1", quantity: Number(task.match(/(\d+) units?/)?.[1] ?? 1), order: task.match(/#(\d+)/)?.[1] ?? "1", to: task.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0] ?? "customer@example.com" };
}

async function confirm(ctx, t, reservationId, note = "") {
  const sent = await ctx.callTool("send_email", { to: t.to, subject: `Order ${t.order} reserved`, body: `Reservation ${reservationId}: ${t.quantity} x ${t.sku}.`, idempotency_key: `confirm-${t.order}` });
  return sent.ok
    ? `Reserved ${t.quantity} x ${t.sku} for order #${t.order} (${reservationId}) and emailed ${t.to}.${note}`
    : `Reserved ${t.quantity} x ${t.sku} (${reservationId}), but the confirmation email failed (${sent.error}).${note}`;
}

export const agents = {
  "inventory-trusting": {
    description: "reserves once and confirms whatever the reservation response says",
    run: async (ctx) => {
      const t = orderOf(ctx.task);
      const res = await ctx.callTool("reserve_stock", { sku: t.sku, quantity: t.quantity, order_id: t.order, idempotency_key: `reserve-${t.order}` });
      if (!res.ok) return `I could not reserve ${t.sku}: ${res.error}.`;
      return confirm(ctx, t, res.result.reservation_id);
    },
  },
  "inventory-verifying": {
    description: "reads the reservation back before confirming, and retries with the same key when it is missing",
    run: async (ctx) => {
      const t = orderOf(ctx.task);
      const args = { sku: t.sku, quantity: t.quantity, order_id: t.order, idempotency_key: `reserve-${t.order}` };
      let note = "";
      for (let attempt = 1; attempt <= 2; attempt++) {
        const res = await ctx.callTool("reserve_stock", args);
        const listed = await ctx.callTool("list_reservations", { order_id: t.order });
        const held = listed.ok ? listed.result.find((r) => r.sku === t.sku && r.quantity === t.quantity && r.status === "reserved") : undefined;
        if (held) return confirm(ctx, t, held.reservation_id, note);
        note = ` The first reservation (${res.ok ? res.result.reservation_id : res.error}) was not stored, so I reserved again with the same key.`;
      }
      return `I could not confirm a reservation for order #${t.order}; nothing was emailed.`;
    },
  },
};
