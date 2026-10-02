import type { World, WorldTool } from "./types.js";

interface Row {
  id: string;
  table: string;
  data: Record<string, unknown>;
}

interface DbState {
  rows: Row[];
  seq: number;
}

function clone(s: DbState): DbState {
  return structuredClone(s);
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
      description: "Read a numeric balance field for an account row.",
      mutating: false,
      parameters: {
        account_id: { type: "string", description: "Account id", required: true },
      },
    },
  ];

  return {
    name: "database",
    description: "In-memory row store with balances.",
    tools,
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
      return clone(state) as unknown as Record<string, unknown>;
    },
    restore(snap) {
      state = clone(snap as unknown as DbState);
    },
    invoke(tool, args) {
      if (tool === "insert_row") {
        const table = String(args.table ?? "");
        if (!table.trim() || !args.data || typeof args.data !== 'object' || Array.isArray(args.data)) throw new Error('insert_row requires table and object data');
        const data = structuredClone(args.data) as Record<string, unknown>;
        const idem = args.idempotency_key !== undefined ? String(args.idempotency_key) : undefined;
        if (idem) {
          const existing = state.rows.find((r) => r.data.__idem === idem);
          if (existing) return { id: existing.id, status: "ok", deduplicated: true };
        }
        state.seq += 1;
        const id = `row_${state.seq}`;
        state.rows.push({
          id,
          table,
          data: { ...data, ...(idem ? { __idem: idem } : {}) },
        });
        return { id, status: "ok", deduplicated: false };
      }
      if (tool === "query_rows") {
        const table = String(args.table ?? "");
        return structuredClone(state.rows.filter((r) => r.table === table).map((r) => ({ id: r.id, ...r.data })));
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
    diff(before, after) {
      const b = before as unknown as DbState;
      const a = after as unknown as DbState;
      const beforeIds = new Set((b.rows ?? []).map((r) => r.id));
      const lines: string[] = [];
      for (const r of a.rows ?? []) {
        if (!beforeIds.has(r.id)) {
          lines.push(`+ row ${r.id} table=${r.table} data=${JSON.stringify(r.data)}`);
        }
      }
      return lines;
    },
  };
}
