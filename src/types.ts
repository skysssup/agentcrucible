/** Verdicts from most to least severe. */
export const VERDICTS = [
  "HARMFUL_ACTION",
  "SILENT_FAILURE",
  "DEGRADED",
  "INCONCLUSIVE",
  "SAFE_FAILURE",
  "SAFE_SUCCESS",
] as const;

export type Verdict = (typeof VERDICTS)[number];

export const VERDICT_SEVERITY: Record<Verdict, number> = {
  HARMFUL_ACTION: 6,
  SILENT_FAILURE: 5,
  DEGRADED: 4,
  INCONCLUSIVE: 3,
  SAFE_FAILURE: 2,
  SAFE_SUCCESS: 1,
};

export const FAULT_KINDS = [
  "timeout_after_commit",
  "timeout",
  "omission",
  "silent_wrong_data",
  "rate_limit_429",
  "malformed_response",
  "retry_storm",
  "auth_expiry",
  "stale_cache",
  "schema_drift",
] as const;

export type FaultKind = (typeof FAULT_KINDS)[number];

export interface FaultSpec {
  /** Tool name to target, or "*" for any tool. */
  target: string;
  kind: FaultKind;
  /** 1-indexed call number for the targeted tool. Omit (with onCallRange) to apply on every matching call. */
  onCall?: number;
  /** Inclusive range; one call index in it is chosen per trial from the seed. */
  onCallRange?: [number, number];
  /** Probability 0..1 that a matching call is faulted, resolved from the seed. */
  probability?: number;
  params?: Record<string, unknown>;
}

export interface PolicySpec {
  /** Committed mutating calls must carry an idempotency key. */
  requireIdempotency?: boolean;
  /** Maximum number of committed, non-deduplicated mutating calls. */
  maxMutatingCalls?: number;
  /** The final answer must disclose uncertainty when any tool call returned an error. */
  mustDiscloseUncertainty?: boolean;
  /** The final answer must not claim success after tool errors without acknowledging them. */
  forbidFalseSuccess?: boolean;
  /** Repeating a mutating call so that it commits again is forbidden. */
  forbidBlindRetry?: boolean;
}

/** A committed change the task requires, matched against effect fields. */
export interface EffectExpectation {
  kind: string;
  /** Fields that must match; nested objects match as subsets. */
  fields: Record<string, unknown>;
}

export interface ScenarioExpectations {
  /** Every committed change a correct run makes. Each must occur exactly once; any other change is unexpected. */
  effects: EffectExpectation[];
  /** Amount in cents the final answer must state, for tasks that ask a question. */
  answerAmountCents?: number;
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
  /** Outcome checks. Without them a run can never be graded SAFE_SUCCESS. */
  expect?: ScenarioExpectations;
  /** Aggregate verdict each listed scripted agent should receive with the default seed. */
  expectedVerdicts: Record<string, Verdict>;
  /** File the scenario was loaded from, when loaded from disk. */
  source?: string;
}

export type ToolObservation =
  | { ok: true; result: unknown }
  | { ok: false; error: string; code?: string };

export interface ToolCallRecord {
  id: string;
  tool: string;
  /** True for tools that can change durable state. */
  mutating: boolean;
  args: Record<string, unknown>;
  /** 1-indexed call number for this tool within the trial. */
  callIndex: number;
  /** Order of the call across all tools within the trial. */
  seq: number;
  /** What the agent received, after any fault. */
  observed: ToolObservation;
  /** True when the world executed the call (state may have changed). */
  committed: boolean;
  /** What the world actually returned, before any fault changed it. */
  committedResult?: unknown;
  faultApplied?: FaultKind;
  /** Index of the scenario fault that fired on this call. */
  faultIndex?: number;
  worldSnapshotAfter: Record<string, unknown>;
}

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

/** A durable change between two world snapshots. */
export interface Effect {
  kind: string;
  /** Refund id, message id, row id, ticket id, or file path. */
  id: string;
  fields: Record<string, unknown>;
  summary: string;
  /** Calls after which this record changed. */
  callIds: string[];
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

export interface TrialOutcome {
  /**
   * met: the committed state and the final answer match the scenario's expectations.
   * not_met: they do not.
   * unchecked: the scenario declares no expectations.
   */
  status: "met" | "not_met" | "unchecked";
  summary: string;
}

export interface GradedTrial {
  trace: TrialTrace;
  /** Committed changes between the start and end of the trial. */
  effects: Effect[];
  outcome: TrialOutcome;
  /** Findings sorted from most to least severe; the first one decides the verdict. */
  findings: Finding[];
  verdict: Verdict;
  reason: string;
  /** The subset of findings produced by scenario policies. */
  policyViolations: Finding[];
}

export interface TrialStats {
  total: number;
  byVerdict: Record<Verdict, number>;
  /** Fraction of trials whose verdict differs from the most common one. */
  flakyRate: number;
  modeVerdict: Verdict;
  /** Wilson score 95% lower bound for the rate of HARMFUL_ACTION or SILENT_FAILURE trials. */
  criticalRateLower95: number;
  /** Trials in which at least one scenario fault fired. */
  trialsWithFault: number;
}

export interface RunReport {
  toolVersion: string;
  scenarioId: string;
  world: string;
  agentId: string;
  seed: string;
  scenario: Scenario;
  trials: GradedTrial[];
  stats: TrialStats;
  /** Worst verdict across trials. */
  aggregateVerdict: Verdict;
  /** Limits of this run that the verdict alone does not show. */
  warnings: string[];
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}
