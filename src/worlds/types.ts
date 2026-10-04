import type { JsonSchema } from "../schema.js";

export interface WorldTool {
  name: string;
  description: string;
  /** True if invoking this tool can change durable state. */
  mutating: boolean;
  /** JSON Schema for the arguments. The harness rejects calls that violate it (code EARGS) before the world sees them. */
  inputSchema: JsonSchema;
  /** JSON Schema for a successful result. Every response the agent receives is checked against it. */
  outputSchema?: JsonSchema;
}

export type FieldType = "string" | "number" | "boolean" | "object" | "array";

/** A durable record in a world snapshot, such as a refund or a file. */
export interface WorldRecord {
  kind: string;
  id: string;
  fields: Record<string, unknown>;
}

export interface World {
  name: string;
  description: string;
  tools: WorldTool[];
  /** Record kinds this world stores, with the type of each field that scenarios can match. */
  recordFields: Record<string, Record<string, FieldType>>;
  /** Restores the initial state. Called before every trial. */
  reset(): void;
  /** Adds records after reset, for a scenario's `setup`. Worlds without it cannot be seeded. */
  seed?(records: WorldRecord[]): void;
  /** A JSON-serializable copy of the current state. */
  snapshot(): Record<string, unknown>;
  /** Runs a tool. Arguments have already passed the tool's inputSchema; throw an Error to report a failure. */
  invoke(tool: string, args: Record<string, unknown>): unknown;
  /** The durable records in a snapshot taken by this world. */
  records(snapshot: Record<string, unknown>): WorldRecord[];
}

export type WorldFactory = () => World;

export const IDEMPOTENCY_KEY: JsonSchema = {
  type: "string",
  minLength: 1,
  pattern: "\\S",
  description: "Optional. Repeating a call with the same key returns the first result instead of acting again.",
};

export function objectSchema(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return { type: "object", properties, required };
}

/** Returns the trimmed idempotency key, or undefined when absent. */
export function readIdempotencyKey(args: Record<string, unknown>): string | undefined {
  const key = args.idempotency_key === undefined ? "" : String(args.idempotency_key).trim();
  return key || undefined;
}

/** The next generated id that does not collide with an existing (for example, seeded) one. */
export function nextId(seq: number, make: (n: number) => string, taken: (id: string) => boolean): { id: string; seq: number } {
  let n = seq + 1;
  while (taken(make(n))) n += 1;
  return { id: make(n), seq: n };
}

/** Throws unless a seed record has these fields with these types. */
export function seedField<T>(record: WorldRecord, field: string, type: "string" | "number", fallback?: T): T {
  const value = record.fields[field] ?? fallback;
  if (typeof value !== type) throw new Error(`setup ${record.kind} ${record.id} needs ${field} (${type})`);
  return value as T;
}
