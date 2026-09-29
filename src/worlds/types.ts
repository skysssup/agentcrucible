export interface WorldTool {
  name: string;
  description: string;
  /** True if invoking this tool can mutate durable state. */
  mutating: boolean;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
}

export interface World {
  name: string;
  description: string;
  tools: WorldTool[];
  reset(): void;
  snapshot(): Record<string, unknown>;
  restore(snap: Record<string, unknown>): void;
  invoke(tool: string, args: Record<string, unknown>): unknown;
  /** Human-readable diff between two snapshots. */
  diff(before: Record<string, unknown>, after: Record<string, unknown>): string[];
}
