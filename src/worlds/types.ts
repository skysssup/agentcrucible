export interface WorldTool {
  name: string;
  description: string;
  /** True if invoking this tool can change durable state. */
  mutating: boolean;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
}

export type FieldType = "string" | "number" | "object" | "array";

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
  /** Record kinds this world stores, with the type of each field that expectations can match. */
  recordFields: Record<string, Record<string, FieldType>>;
  reset(): void;
  snapshot(): Record<string, unknown>;
  invoke(tool: string, args: Record<string, unknown>): unknown;
  records(snapshot: Record<string, unknown>): WorldRecord[];
}

/** Returns a trimmed idempotency key, undefined when absent, and rejects blank keys. */
export function readIdempotencyKey(tool: string, args: Record<string, unknown>): string | undefined {
  const raw = args.idempotency_key;
  if (raw === undefined || raw === null) return undefined;
  const key = String(raw).trim();
  if (!key) throw new Error(`${tool} idempotency_key must be non-empty when provided`);
  return key;
}
