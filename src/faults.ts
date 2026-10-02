import type { FaultKind, FaultSpec, ToolObservation } from "./types.js";
import { pickInRange, unitRandom } from "./hash.js";

export interface FaultDecision {
  apply: boolean;
  kind?: FaultKind;
  /** For silent_wrong_data etc. */
  mutateResult?: (committed: unknown) => unknown;
  /** Mask the committed result as an error/timeout to the agent. */
  maskAsError?: { error: string; code?: string };
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
  if (spec.probability !== undefined) {
    const p = unitRandom(`${seed}:trial${trialIndex}:${tool}:${callIndex}:${spec.kind}`);
    if (spec.probability <= 0 || (spec.probability < 1 && p >= spec.probability)) return false;
  }
  return true;
}

export function decideFault(
  specs: FaultSpec[],
  tool: string,
  callIndex: number,
  seed: string,
  trialIndex: number,
  committed: unknown
): FaultDecision {
  for (const spec of specs) {
    if (!shouldApplyFault(spec, tool, callIndex, seed, trialIndex)) continue;
    return buildDecision(spec.kind, committed, spec.params ?? {});
  }
  return { apply: false };
}

function buildDecision(
  kind: FaultKind,
  committed: unknown,
  params: Record<string, unknown>
): FaultDecision {
  switch (kind) {
    case "timeout_after_commit":
      return {
        apply: true,
        kind,
        maskAsError: {
          error: "ETIMEDOUT: connection timed out after commit",
          code: "ETIMEDOUT",
        },
      };
    case "timeout":
      return {
        apply: true,
        kind,
        maskAsError: { error: "ETIMEDOUT: request timed out", code: "ETIMEDOUT" },
      };
    case "omission":
      return {
        apply: true,
        kind,
        maskAsError: { error: "tool returned empty response", code: "EOMISSION" },
      };
    case "rate_limit_429":
      return {
        apply: true,
        kind,
        maskAsError: { error: "429 Too Many Requests", code: "ERATE" },
      };
    case "auth_expiry":
      return {
        apply: true,
        kind,
        maskAsError: { error: "401 Unauthorized: token expired", code: "EAUTH" },
      };
    case "malformed_response":
      return {
        apply: true,
        kind,
        mutateResult: () => "<<<not-json>>>{{{",
      };
    case "silent_wrong_data": {
      const field = String(params.field ?? "amount_cents");
      const delta = Number(params.delta ?? -100);
      return {
        apply: true,
        kind,
        mutateResult: (c) => {
          if (c && typeof c === "object") {
            const copy = { ...(c as Record<string, unknown>) };
            const cur = Number(copy[field]);
            if (Number.isFinite(cur)) copy[field] = cur + delta;
            return copy;
          }
          return c;
        },
      };
    }
    case "stale_cache": {
      const field = String(params.field ?? "balance_cents");
      const stale = params.stale_value ?? 999999;
      return {
        apply: true,
        kind,
        mutateResult: (c) => {
          if (c && typeof c === "object") {
            return { ...(c as Record<string, unknown>), [field]: stale, _stale: true };
          }
          return c;
        },
      };
    }
    case "schema_drift":
      return {
        apply: true,
        kind,
        mutateResult: (c) => {
          if (c && typeof c === "object") {
            const copy = { ...(c as Record<string, unknown>) };
            // Rename a common field to simulate API version skew.
            if ("amount_cents" in copy) {
              copy.amount = copy.amount_cents;
              delete copy.amount_cents;
            }
            if ("balance_cents" in copy) {
              copy.balance = copy.balance_cents;
              delete copy.balance_cents;
            }
            copy.api_version = "v0-deprecated";
            return copy;
          }
          return c;
        },
      };
    case "retry_storm":
      // onCallRange selects one seeded call; omit it to time out every matching call.
      return {
        apply: true,
        kind,
        maskAsError: { error: "ETIMEDOUT: transient failure", code: "ETIMEDOUT" },
      };
  }
}

export function observationFromDecision(
  decision: FaultDecision,
  committed: unknown
): { observation: ToolObservation; committed: boolean } {
  if (!decision.apply) {
    return { observation: { ok: true, result: committed }, committed: true };
  }
  // timeout_after_commit: world committed, agent sees error
  if (decision.kind === "timeout_after_commit") {
    return {
      observation: {
        ok: false,
        error: decision.maskAsError!.error,
        code: decision.maskAsError!.code,
      },
      committed: true,
    };
  }
  // Pure timeouts / rate limits / auth: if we got here after invoke, for
  // timeout_after_commit we already handled. For plain timeout we should NOT
  // have committed — caller must skip invoke. That path is handled in harness.
  if (decision.maskAsError && decision.kind !== "timeout_after_commit") {
    return {
      observation: {
        ok: false,
        error: decision.maskAsError.error,
        code: decision.maskAsError.code,
      },
      committed: false,
    };
  }
  if (decision.mutateResult) {
    return {
      observation: { ok: true, result: decision.mutateResult(committed) },
      committed: true,
    };
  }
  return { observation: { ok: true, result: committed }, committed: true };
}

/** Faults that must run BEFORE the world invoke (no commit). */
export function isPreCommitFault(kind: FaultKind): boolean {
  return (
    kind === "timeout" ||
    kind === "rate_limit_429" ||
    kind === "auth_expiry" ||
    kind === "retry_storm" ||
    kind === "omission"
  );
}
