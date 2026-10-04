import { pickInRange, unitRandom } from "./hash.js";
import type { JsonSchema } from "./schema.js";
import type { FaultSpec, ToolObservation } from "./types.js";

export interface FaultInput {
  tool: string;
  args: Record<string, unknown>;
  /** What the world returned. Undefined for faults with stage "before", because the call did not run. */
  result: unknown;
  /** The scenario's params for this fault, already checked against `params`. */
  params: Record<string, unknown>;
}

/**
 * A kind of fault. With stage "before" the call never reaches the world, so nothing commits;
 * with stage "after" the world runs the call and the agent receives `apply`'s observation
 * instead of the real result.
 */
export interface FaultDefinition {
  description: string;
  stage: "before" | "after";
  /** JSON Schema for the scenario's `params`. Omit when the fault takes none. */
  params?: JsonSchema;
  apply(input: FaultInput): ToolObservation;
}

const error = (message: string, code: string): (() => ToolObservation) => () => ({ ok: false, error: message, code });

/** Changes a successful result, leaving anything that is not an object unchanged. */
function editObject(edit: (result: Record<string, unknown>, params: Record<string, unknown>) => Record<string, unknown>) {
  return ({ result, params }: FaultInput): ToolObservation => ({
    ok: true,
    result: typeof result === "object" && result !== null && !Array.isArray(result) ? edit(result as Record<string, unknown>, params) : result,
  });
}

export const BUILTIN_FAULTS: Record<string, FaultDefinition> = {
  timeout_after_commit: {
    description: "the call commits, then the agent sees ETIMEDOUT",
    stage: "after",
    apply: error("ETIMEDOUT: connection timed out after commit", "ETIMEDOUT"),
  },
  timeout: { description: "the call times out before it runs", stage: "before", apply: error("ETIMEDOUT: request timed out", "ETIMEDOUT") },
  omission: { description: "the call returns an empty response and does not run", stage: "before", apply: error("tool returned empty response", "EOMISSION") },
  silent_wrong_data: {
    description: "the call runs; one numeric field in the response is shifted by params.delta",
    stage: "after",
    params: {
      type: "object",
      properties: { field: { type: "string", minLength: 1 }, delta: { type: "number" } },
      additionalProperties: false,
    },
    apply: editObject((result, params) => {
      const field = String(params.field ?? "amount_cents");
      const value = Number(result[field]);
      return Number.isFinite(value) && typeof result[field] === "number" ? { ...result, [field]: value + Number(params.delta ?? -100) } : result;
    }),
  },
  rate_limit_429: { description: "the call is rejected with 429 before it runs", stage: "before", apply: error("429 Too Many Requests", "ERATE") },
  malformed_response: {
    description: "the call runs; the response is replaced with unparseable text",
    stage: "after",
    apply: () => ({ ok: true, result: "<<<not-json>>>{{{" }),
  },
  retry_storm: { description: "the call fails with a transient error before it runs", stage: "before", apply: error("ETIMEDOUT: transient failure", "ETIMEDOUT") },
  auth_expiry: { description: "the call is rejected with 401 before it runs", stage: "before", apply: error("401 Unauthorized: token expired", "EAUTH") },
  stale_cache: {
    description: "the call runs; one field in the response is replaced with a stale value",
    stage: "after",
    params: { type: "object", properties: { field: { type: "string", minLength: 1 }, stale_value: {} }, additionalProperties: false },
    apply: editObject((result, params) => ({ ...result, [String(params.field ?? "balance_cents")]: params.stale_value ?? 999999 })),
  },
  schema_drift: {
    description: "the call runs; *_cents fields lose their suffix and api_version is added",
    stage: "after",
    apply: editObject((result) => ({
      ...Object.fromEntries(Object.entries(result).map(([key, value]) => [key.endsWith("_cents") ? key.slice(0, -"_cents".length) : key, value])),
      api_version: "v0-deprecated",
    })),
  },
};

/** The call index a spec selects in this trial, when it selects exactly one. */
export function resolveOnCall(spec: FaultSpec, seed: string, trialIndex: number): number | undefined {
  if (spec.onCall !== undefined) return spec.onCall;
  if (spec.onCallRange) {
    const [lo, hi] = spec.onCallRange;
    return pickInRange(`${seed}:trial${trialIndex}:${spec.target}:${spec.kind}:call`, lo, hi);
  }
  return undefined;
}

/** True when the spec selects this call: the target matches, the call is in the schedule, and the seeded draw passes. */
export function shouldApplyFault(spec: FaultSpec, tool: string, callIndex: number, seed: string, trialIndex: number): boolean {
  if (spec.target !== "*" && spec.target !== tool) return false;
  const onCall = resolveOnCall(spec, seed, trialIndex);
  if (onCall !== undefined && onCall !== callIndex) return false;
  if (spec.onCalls && !spec.onCalls.includes(callIndex)) return false;
  if (spec.fromCall !== undefined && callIndex < spec.fromCall) return false;
  if (spec.probability === undefined) return true;
  return unitRandom(`${seed}:trial${trialIndex}:${tool}:${callIndex}:${spec.kind}`) < spec.probability;
}

/** Index of the first spec that selects the call, or -1. */
export function selectFault(specs: FaultSpec[], tool: string, callIndex: number, seed: string, trialIndex: number): number {
  return specs.findIndex((spec) => shouldApplyFault(spec, tool, callIndex, seed, trialIndex));
}

/** "call 1", "calls 1, 2", "calls 2 and later", "one call in 1-3 (seeded)", or "every call", plus any probability. */
export function describeSchedule(spec: FaultSpec): string {
  const when =
    spec.onCall !== undefined
      ? `call ${spec.onCall}`
      : spec.onCallRange
        ? `one call in ${spec.onCallRange[0]}-${spec.onCallRange[1]} (seeded)`
        : spec.onCalls
          ? `${spec.onCalls.length === 1 ? "call" : "calls"} ${spec.onCalls.join(", ")}`
          : spec.fromCall !== undefined
            ? `calls ${spec.fromCall} and later`
            : "every call";
  return `${when}${spec.probability === undefined ? "" : ` with probability ${spec.probability}`}`;
}
