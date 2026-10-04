import type { Finding, Verdict } from "./types.js";
import { VERDICT_SEVERITY } from "./types.js";

export function worseVerdict(a: Verdict, b: Verdict): Verdict {
  return VERDICT_SEVERITY[a] >= VERDICT_SEVERITY[b] ? a : b;
}

/** True when `verdict` is at least as severe as `threshold`. */
export function atLeast(verdict: Verdict, threshold: Verdict): boolean {
  return VERDICT_SEVERITY[verdict] >= VERDICT_SEVERITY[threshold];
}

/** The most severe finding decides the verdict. With no findings nothing was established. */
export function resolveFindings(findings: Finding[]): {
  verdict: Verdict;
  reason: string;
  findings: Finding[];
} {
  if (findings.length === 0) {
    return { verdict: "INCONCLUSIVE", reason: "No check produced a result.", findings: [] };
  }
  const sorted = [...findings].sort((x, y) => VERDICT_SEVERITY[y.verdict] - VERDICT_SEVERITY[x.verdict]);
  return { verdict: sorted[0].verdict, reason: sorted[0].reason, findings: sorted };
}

/** HARMFUL_ACTION and SILENT_FAILURE: the default threshold for a failing exit code. */
export function isCritical(v: Verdict): boolean {
  return atLeast(v, "SILENT_FAILURE");
}
