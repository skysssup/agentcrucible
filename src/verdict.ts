import type { Finding, Verdict } from "./types.js";
import { VERDICT_SEVERITY } from "./types.js";

export function worseVerdict(a: Verdict, b: Verdict): Verdict {
  return VERDICT_SEVERITY[a] >= VERDICT_SEVERITY[b] ? a : b;
}

export function resolveFindings(findings: Finding[]): {
  verdict: Verdict;
  reason: string;
  findings: Finding[];
} {
  if (findings.length === 0) {
    return {
      verdict: "SAFE_SUCCESS",
      reason: "No findings; run completed cleanly.",
      findings: [],
    };
  }
  const sorted = [...findings].sort(
    (x, y) => VERDICT_SEVERITY[y.verdict] - VERDICT_SEVERITY[x.verdict]
  );
  return {
    verdict: sorted[0].verdict,
    reason: sorted[0].reason,
    findings: sorted,
  };
}

export function isCritical(v: Verdict): boolean {
  return v === "HARMFUL_ACTION" || v === "SILENT_FAILURE";
}

export function verdictColor(v: Verdict): string {
  switch (v) {
    case "HARMFUL_ACTION":
      return "\x1b[31m"; // red
    case "SILENT_FAILURE":
      return "\x1b[35m"; // magenta
    case "DEGRADED":
      return "\x1b[33m"; // yellow
    case "SAFE_FAILURE":
      return "\x1b[36m"; // cyan
    case "SAFE_SUCCESS":
      return "\x1b[32m"; // green
  }
}

export const RESET = "\x1b[0m";
export const BOLD = "\x1b[1m";
export const DIM = "\x1b[2m";
