import { pickInRange, unitRandom } from "./hash.js";
import type { FaultKind, FaultSpec } from "./types.js";

export interface FaultDecision {
  apply: boolean;
  kind?: FaultKind;
  /** Index of the matching spec in the scenario's fault list. */
  index?: number;
  /** Replaces the committed result in what the agent observes. */
  mutateResult?: (committed: unknown) => unknown;
  /** Error the agent observes instead of the result. */
  maskAsError?: { error: string; code: string };
}

/** Faults that fire before the world runs the call, so nothing commits. */
const PRE_COMMIT: ReadonlySet<FaultKind> = new Set([
  "timeout",
  "rate_limit_429",
  "auth_expiry",
  "retry_storm",
  "omission",
]);

export function isPreCommitFault(kind: FaultKind): boolean {
  return PRE_COMMIT.has(kind);
}

export function resolveOnCall(spec: FaultSpec, seed: string, trialIndex: number): number | undefined {
  if (spec.onCall !== undefined) return spec.onCall;
  if (spec.onCallRange) {
    const [lo, hi] = spec.onCallRange;
    return pickInRange(`${seed}:trial${trialIndex}:${spec.target}:${spec.kind}:call`, lo, hi);
  }
  return undefined;
}

export function shouldApplyFault(
  spec: FaultSpec,
  tool: string,
  callIndex: number,
  seed: string,
  trialIndex: number
): boolean {
  if (spec.target !== "*" && spec.target !== tool) return false;
  const onCall = resolveOnCall(spec, seed, trialIndex);
  if (onCall !== undefined && onCall !== callIndex) return false;
  if (spec.probability === undefined) return true;
  return unitRandom(`${seed}:trial${trialIndex}:${tool}:${callIndex}:${spec.kind}`) < spec.probability;
}

/** The first spec that matches the call decides the fault. */
export function decideFault(
  specs: FaultSpec[],
  tool: string,
  callIndex: number,
  seed: string,
  trialIndex: number
): FaultDecision {
  const index = specs.findIndex((spec) => shouldApplyFault(spec, tool, callIndex, seed, trialIndex));
  if (index === -1) return { apply: false };
  const spec = specs[index];
  return { apply: true, kind: spec.kind, index, ...faultEffect(spec.kind, spec.params ?? {}) };
}

function faultEffect(kind: FaultKind, params: Record<string, unknown>): Pick<FaultDecision, "mutateResult" | "maskAsError"> {
  switch (kind) {
    case "timeout_after_commit":
      return { maskAsError: { error: "ETIMEDOUT: connection timed out after commit", code: "ETIMEDOUT" } };
    case "timeout":
      return { maskAsError: { error: "ETIMEDOUT: request timed out", code: "ETIMEDOUT" } };
    case "retry_storm":
      return { maskAsError: { error: "ETIMEDOUT: transient failure", code: "ETIMEDOUT" } };
    case "omission":
      return { maskAsError: { error: "tool returned empty response", code: "EOMISSION" } };
    case "rate_limit_429":
      return { maskAsError: { error: "429 Too Many Requests", code: "ERATE" } };
    case "auth_expiry":
      return { maskAsError: { error: "401 Unauthorized: token expired", code: "EAUTH" } };
    case "malformed_response":
      return { mutateResult: () => "<<<not-json>>>{{{" };
    case "silent_wrong_data": {
      const field = String(params.field ?? "amount_cents");
      const delta = Number(params.delta ?? -100);
      return {
        mutateResult: (result) => {
          if (!isRecord(result) || !Number.isFinite(Number(result[field]))) return result;
          return { ...result, [field]: Number(result[field]) + delta };
        },
      };
    }
    case "stale_cache": {
      const field = String(params.field ?? "balance_cents");
      const stale = params.stale_value ?? 999999;
      return { mutateResult: (result) => (isRecord(result) ? { ...result, [field]: stale } : result) };
    }
    case "schema_drift":
      return {
        mutateResult: (result) => {
          if (!isRecord(result)) return result;
          const drifted: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(result)) {
            drifted[key.endsWith("_cents") ? key.slice(0, -"_cents".length) : key] = value;
          }
          return { ...drifted, api_version: "v0-deprecated" };
        },
      };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
