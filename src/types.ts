/** Core domain types for AgentCrucible. */

export type Verdict =
  | "SAFE_SUCCESS"
  | "SAFE_FAILURE"
  | "DEGRADED"
  | "SILENT_FAILURE"
  | "HARMFUL_ACTION";

export const VERDICT_SEVERITY: Record<Verdict, number> = {
  HARMFUL_ACTION: 5,
  SILENT_FAILURE: 4,
  DEGRADED: 3,
  SAFE_FAILURE: 2,
  SAFE_SUCCESS: 1,
};

export type FaultKind =
  | "timeout_after_commit"
  | "timeout"
  | "omission"
  | "silent_wrong_data"
  | "rate_limit_429"
  | "malformed_response"
  | "retry_storm"
  | "auth_expiry"
  | "stale_cache"
  | "schema_drift";

export interface FaultSpec {
  /** Tool name to target, or "*" for any. */
  target: string;
  kind: FaultKind;
  /** 1-indexed call number for this tool. Omit to apply on every matching call. */
  onCall?: number;
  /** Inclusive range alternative to onCall — used for property-based fuzzing. */
  onCallRange?: [number, number];
  /** Probability 0..1; deterministically resolved from seed. */
  probability?: number;
  params?: Record<string, unknown>;
}

export interface PolicySpec {
  /** Side-effecting tools must carry an idempotency key. */
  requireIdempotency?: boolean;
  /** Max times a mutating tool may be invoked for one task (default unlimited). */
  maxMutatingCalls?: number;
  /** Agent must disclose uncertainty when a tool error/timeout occurs. */
  mustDiscloseUncertainty?: boolean;
  /** Agent must not claim success if world state disagrees. */
  forbidFalseSuccess?: boolean;
  /** Mutating retries without idempotency are forbidden. */
  forbidBlindRetry?: boolean;
}

export interface Scenario {
  id: string;
  version: number;
  world: string;
  description: string;
  task: string;
  tags: string[];
  faults: FaultSpec[];
  policies: PolicySpec;
  /** Expected worst-case verdict when run against a naive-retry agent (docs/CI smoke). */
  expectedNaiveVerdict?: Verdict;
}

export interface ToolCallRecord {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  callIndex: number;
  /** Wall-clock-ish sequence number across all tools. */
  seq: number;
  /** Result the agent actually received (may be faulted). */
  observed: ToolObservation;
  /** What the world actually did before any fault masking. */
  committed: boolean;
  committedResult?: unknown;
  faultApplied?: FaultKind;
  worldSnapshotAfter: Record<string, unknown>;
}

export type ToolObservation =
  | { ok: true; result: unknown }
  | { ok: false; error: string; code?: string };

export interface AgentMessage {
  role: "assistant" | "user" | "system";
  content: string;
}

export interface TrialTrace {
  scenarioId: string;
  trialIndex: number;
  seed: string;
  task: string;
  messages: AgentMessage[];
  calls: ToolCallRecord[];
  finalAnswer: string;
  worldBefore: Record<string, unknown>;
  worldAfter: Record<string, unknown>;
  agentId: string;
}

export interface Evidence {
  kind: string;
  summary: string;
  callIds?: string[];
  details?: Record<string, unknown>;
}

export interface Finding {
  verdict: Verdict;
  rule: string;
  reason: string;
  evidence: Evidence[];
}

export interface GradedTrial {
  trace: TrialTrace;
  findings: Finding[];
  verdict: Verdict;
  reason: string;
  policyViolations: Finding[];
}

export interface TrialStats {
  total: number;
  byVerdict: Record<Verdict, number>;
  /** Fraction of trials that produced a different verdict than the mode. */
  flakyRate: number;
  modeVerdict: Verdict;
  /** Wilson score lower bound for "critical" (HARMFUL|SILENT) rate at 95%. */
  criticalRateLower95: number;
}

export interface RunReport {
  scenarioId: string;
  agentId: string;
  seed: string;
  trials: GradedTrial[];
  stats: TrialStats;
  aggregateVerdict: Verdict;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}
