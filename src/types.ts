import type { JsonSchema } from "./schema.js";
import type { WorldRecord } from "./worlds/types.js";

/** Verdicts from most to least severe. */
export const VERDICTS = ["HARMFUL_ACTION", "SILENT_FAILURE", "DEGRADED", "INCONCLUSIVE", "SAFE_FAILURE", "SAFE_SUCCESS"] as const;

export type Verdict = (typeof VERDICTS)[number];

export const VERDICT_SEVERITY: Record<Verdict, number> = {
  HARMFUL_ACTION: 6,
  SILENT_FAILURE: 5,
  DEGRADED: 4,
  INCONCLUSIVE: 3,
  SAFE_FAILURE: 2,
  SAFE_SUCCESS: 1,
};

/** Built-in fault kinds. Extensions can register more. */
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
  "phantom_success",
  "replica_lag",
  "partial_response",
  "duplicate_delivery",
] as const;

export interface FaultSpec {
  /** Tool name to target, or "*" for any tool. */
  target: string;
  /** A built-in kind (see FAULT_KINDS) or one registered by an extension. */
  kind: string;
  /** Fault only this call of the targeted tool (1-indexed). */
  onCall?: number;
  /** Fault one call in this inclusive range, chosen per trial from the seed. */
  onCallRange?: [number, number];
  /** Fault exactly these calls. */
  onCalls?: number[];
  /** Fault this call and every later one. */
  fromCall?: number;
  /** Probability 0..1 that a selected call is faulted, drawn from the seed. */
  probability?: number;
  params?: Record<string, unknown>;
}

/** Limits on tool calls per trial. Calls beyond a limit are refused with code EBUDGET and do not run. */
export interface Budget {
  maxCalls?: number;
  maxCallsPerTool?: Record<string, number>;
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

/** A value computed from the committed records at the end of the trial. */
export type ValueRef =
  | { exists: RecordPattern }
  | { count: RecordPattern }
  | { id_of: RecordPattern }
  | { field: string; of: RecordPattern };

/** How one record field (or the record id) is compared. */
export type FieldMatcher =
  | { equals: unknown }
  /** Strings: case-insensitive substring. Lists: some item contains it. */
  | { contains: string | ValueRef }
  | { matches: string }
  | { one_of: unknown[] }
  /** Objects: every listed key matches. */
  | { subset: Record<string, unknown> };

/** Selects records of one kind whose id and fields match. */
export interface RecordPattern {
  kind: string;
  id?: FieldMatcher;
  fields: Record<string, FieldMatcher>;
}

/** An acceptable end state. */
export interface OutcomeSpec {
  name: string;
  /** SAFE_SUCCESS for the intended result, SAFE_FAILURE for a declared recovery path. */
  verdict: "SAFE_SUCCESS" | "SAFE_FAILURE";
  /** Every committed change on this path. Each must occur exactly once; other changes are unexpected unless allowed. */
  effects: RecordPattern[];
}

/** Checked against the state after every tool call. */
export type InvariantSpec =
  | { name: string; atMost: number; of: RecordPattern }
  | { name: string; when: RecordPattern; requires: RecordPattern };

/** A check on the agent's final answer. */
export type AnswerAssertion =
  /** An unhedged sentence states this amount. */
  | { type: "amount"; cents: number }
  /** The answer names the id of a committed record that matches. */
  | { type: "id"; of: RecordPattern }
  /** Literal text checks on the whole answer, case-insensitive. */
  | { type: "text"; contains?: string; notContains?: string; matches?: string }
  /** The answer states a yes/no fact about something named by one of the keywords. */
  | { type: "boolean"; keywords: string[]; equals: boolean | ValueRef }
  /** The structured output (a JSON object) matches a schema and field values. */
  | { type: "output"; schema?: JsonSchema; fields: Record<string, unknown> };

export interface ScenarioExpectations {
  /** Acceptable end states, in order of preference. */
  outcomes: OutcomeSpec[];
  /** Changes that any outcome may include without requiring them. */
  allow: RecordPattern[];
  invariants: InvariantSpec[];
  answer: AnswerAssertion[];
}

export interface Scenario {
  id: string;
  version: number;
  /** Worlds the agent works in; with several, their tools are combined. */
  worlds: string[];
  description: string;
  task: string;
  tags: string[];
  /** Records added to the worlds before every trial. */
  setup: WorldRecord[];
  faults: FaultSpec[];
  budget: Budget;
  policies: PolicySpec;
  /** Outcome checks. Without them a run can never be graded SAFE_SUCCESS. */
  expect?: ScenarioExpectations;
  /** Aggregate verdict each listed agent should receive with the default seed. */
  expectedVerdicts: Record<string, Verdict>;
  /** File the scenario was loaded from, when loaded from disk. */
  source?: string;
}

export type ToolObservation = { ok: true; result: unknown } | { ok: false; error: string; code?: string };

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
  faultApplied?: string;
  /** Index of the scenario fault that fired on this call. */
  faultIndex?: number;
  /** True when the call was refused because the scenario's budget was used up. */
  budgetExceeded?: boolean;
  /** Ways the observed result violates the tool's outputSchema. */
  schemaErrors?: string[];
  /** What was passed instead of a JSON object, when the arguments were rejected for that reason. */
  argsError?: string;
  /** Records this call added or changed, as one-line summaries. */
  changes: string[];
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
  /** Structured output the agent returned with its answer, if any. */
  finalOutput?: unknown;
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

export interface AssertionResult {
  type: AnswerAssertion["type"];
  /** Human-readable form of the assertion. */
  assertion: string;
  /**
   * pass: the answer states what the committed state shows. missing: it does not say.
   * contradicted: it states something else. ambiguous: the wording cannot be read either way.
   * invalid: the structured output does not match its schema.
   */
  status: "pass" | "missing" | "contradicted" | "ambiguous" | "invalid";
  detail: string;
}

export interface TrialOutcome {
  /**
   * met: the committed state and the final answer match one of the scenario's outcomes.
   * not_met: they do not.
   * unchecked: the scenario declares no expectations.
   */
  status: "met" | "not_met" | "unchecked";
  summary: string;
  /** The outcome the committed state matched, or the closest one. */
  path?: string;
  assertions: AssertionResult[];
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

/** Version of the saved report format. `inspect` and `replay` read this version. */
export const REPORT_VERSION = 2;

export interface RunReport {
  reportVersion: number;
  toolVersion: string;
  scenarioId: string;
  worlds: string[];
  agentId: string;
  seed: string;
  scenario: Scenario;
  /** The fault schedule the trials ran with (the scenario's, or its --fuzz-call variant). */
  faults: FaultSpec[];
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
