import { IDEMPOTENCY_KEY, nextId, objectSchema, readIdempotencyKey, seedField, type World, type WorldTool } from "./types.js";

interface Row {
  id: string;
  table: string;
  data: Record<string, unknown>;
  idempotencyKey?: string;
}

interface DbState {
  rows: Row[];
  seq: number;
}

export function createDatabaseWorld(): World {
  let state: DbState = { rows: [], seq: 0 };

  const tools: WorldTool[] = [
    {
      name: "insert_row",
      description: "Insert a row into a table.",
      mutating: true,
      inputSchema: objectSchema(
        { table: { type: "string", minLength: 1, pattern: "\\S", description: "Table name" }, data: { type: "object", description: "Row payload" }, idempotency_key: IDEMPOTENCY_KEY },
        ["table", "data"]
      ),
      outputSchema: objectSchema({ id: { type: "string" }, status: { const: "ok" }, deduplicated: { type: "boolean" } }, ["id", "status", "deduplicated"]),
    },
    {
      name: "query_rows",
      description: "Query rows from a table. Each row is its data plus its id.",
      mutating: false,
      inputSchema: objectSchema({ table: { type: "string", minLength: 1, description: "Table name" } }, ["table"]),
      outputSchema: { type: "array", items: objectSchema({ id: { type: "string" } }, ["id"]) },
    },
    {
      name: "get_balance",
      description: "Read the balance_cents field of an account row.",
      mutating: false,
      inputSchema: objectSchema({ account_id: { type: "string", minLength: 1, description: "Account id" } }, ["account_id"]),
      outputSchema: objectSchema({ account_id: { type: "string" }, balance_cents: { type: "integer" } }, ["account_id", "balance_cents"]),
    },
  ];

  return {
    name: "database",
    description: "Row store seeded with account acct_1 (balance_cents 10000).",
    tools,
    recordFields: {
      row: { table: "string", data: "object", idempotency_key: "string" },
    },
    reset() {
      state = { seq: 0, rows: [{ id: "acct_1", table: "accounts", data: { account_id: "acct_1", balance_cents: 10_000 } }] };
    },
    seed(records) {
      for (const r of records) {
        const data = r.fields.data;
        if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error(`setup row ${r.id} needs data (object)`);
        state.rows = state.rows.filter((row) => row.id !== r.id);
        state.rows.push({ id: r.id, table: seedField(r, "table", "string"), data: structuredClone(data) as Record<string, unknown> });
      }
    },
    snapshot() {
      return structuredClone(state) as unknown as Record<string, unknown>;
    },
    invoke(tool, args) {
      if (tool === "insert_row") {
        const idempotencyKey = readIdempotencyKey(args);
        const existing = idempotencyKey ? state.rows.find((r) => r.idempotencyKey === idempotencyKey) : undefined;
        if (existing) return { id: existing.id, status: "ok", deduplicated: true };
        const { id, seq } = nextId(state.seq, (n) => `row_${n}`, (candidate) => state.rows.some((r) => r.id === candidate));
        state.seq = seq;
        state.rows.push({ id, table: String(args.table).trim(), data: structuredClone(args.data) as Record<string, unknown>, idempotencyKey });
        return { id, status: "ok", deduplicated: false };
      }
      if (tool === "query_rows") {
        return state.rows.filter((r) => r.table === String(args.table)).map((r) => ({ id: r.id, ...structuredClone(r.data) }));
      }
      if (tool === "get_balance") {
        const accountId = String(args.account_id);
        const row = state.rows.find((r) => r.table === "accounts" && r.data.account_id === accountId);
        if (!row) throw new Error(`account not found: ${accountId}`);
        return { account_id: accountId, balance_cents: row.data.balance_cents };
      }
      throw new Error(`unknown tool: ${tool}`);
    },
    records(snapshot) {
      return ((snapshot as unknown as DbState).rows ?? []).map((r) => ({
        kind: "row",
        id: r.id,
        fields: { table: r.table, data: r.data, ...(r.idempotencyKey ? { idempotency_key: r.idempotencyKey } : {}) },
      }));
    },
  };
}
