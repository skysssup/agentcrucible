import { readIdempotencyKey, type World, type WorldTool } from "./types.js";

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
      parameters: {
        table: { type: "string", description: "Table name", required: true },
        data: { type: "object", description: "Row payload", required: true },
        idempotency_key: { type: "string", description: "Optional idempotency key" },
      },
    },
    {
      name: "query_rows",
      description: "Query rows from a table.",
      mutating: false,
      parameters: {
        table: { type: "string", description: "Table name", required: true },
      },
    },
    {
      name: "get_balance",
      description: "Read the balance_cents field of an account row.",
      mutating: false,
      parameters: {
        account_id: { type: "string", description: "Account id", required: true },
      },
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
      state = {
        seq: 0,
        rows: [
          {
            id: "acct_1",
            table: "accounts",
            data: { account_id: "acct_1", balance_cents: 10_000 },
          },
        ],
      };
    },
    snapshot() {
      return structuredClone(state) as unknown as Record<string, unknown>;
    },
    invoke(tool, args) {
      if (tool === "insert_row") {
        const table = String(args.table ?? "").trim();
        if (!table || !args.data || typeof args.data !== "object" || Array.isArray(args.data)) {
          throw new Error("insert_row requires table and object data");
        }
        const idempotencyKey = readIdempotencyKey(tool, args);
        const existing = idempotencyKey
          ? state.rows.find((r) => r.idempotencyKey === idempotencyKey)
          : undefined;
        if (existing) return { id: existing.id, status: "ok", deduplicated: true };
        state.seq += 1;
        const id = `row_${state.seq}`;
        state.rows.push({
          id,
          table,
          data: structuredClone(args.data) as Record<string, unknown>,
          idempotencyKey,
        });
        return { id, status: "ok", deduplicated: false };
      }
      if (tool === "query_rows") {
        const table = String(args.table ?? "");
        return state.rows
          .filter((r) => r.table === table)
          .map((r) => ({ id: r.id, ...structuredClone(r.data) }));
      }
      if (tool === "get_balance") {
        const accountId = String(args.account_id ?? "");
        const row = state.rows.find(
          (r) => r.table === "accounts" && r.data.account_id === accountId
        );
        if (!row) throw new Error(`account not found: ${accountId}`);
        return { account_id: accountId, balance_cents: row.data.balance_cents };
      }
      throw new Error(`unknown tool: ${tool}`);
    },
    records(snapshot) {
      const rows = (snapshot as unknown as DbState).rows ?? [];
      return rows.map((r) => ({
        kind: "row",
        id: r.id,
        fields: {
          table: r.table,
          data: r.data,
          ...(r.idempotencyKey ? { idempotency_key: r.idempotencyKey } : {}),
        },
      }));
    },
  };
}
