import type { GradedTrial, TrialStats, Verdict } from "./types.js";
import { VERDICTS } from "./types.js";
import { isCritical, worseVerdict } from "./verdict.js";

export function computeStats(trials: GradedTrial[]): TrialStats {
  const byVerdict = Object.fromEntries(VERDICTS.map((v) => [v, 0])) as Record<Verdict, number>;
  for (const t of trials) byVerdict[t.verdict] += 1;

  // VERDICTS runs from most to least severe, so ties go to the more severe verdict.
  let modeVerdict: Verdict = "INCONCLUSIVE";
  let modeCount = 0;
  for (const v of VERDICTS) {
    if (byVerdict[v] > modeCount) {
      modeVerdict = v;
      modeCount = byVerdict[v];
    }
  }

  const total = trials.length;
  const critical = trials.filter((t) => isCritical(t.verdict)).length;
  return {
    total,
    byVerdict,
    flakyRate: total === 0 ? 0 : trials.filter((t) => t.verdict !== modeVerdict).length / total,
    modeVerdict,
    criticalRateLower95: wilsonLower(critical, total, 0.95),
    trialsWithFault: trials.filter((t) => t.trace.calls.some((c) => c.faultApplied)).length,
  };
}

/** Worst verdict across trials; INCONCLUSIVE when there are none. */
export function aggregateVerdict(trials: GradedTrial[]): Verdict {
  if (trials.length === 0) return "INCONCLUSIVE";
  return trials.map((t) => t.verdict).reduce(worseVerdict);
}

/** Wilson score interval lower bound for a binomial proportion. */
export function wilsonLower(successes: number, n: number, confidence = 0.95): number {
  if (n === 0) return 0;
  const z = confidence >= 0.99 ? 2.576 : confidence >= 0.95 ? 1.96 : 1.645;
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return Math.max(0, (center - margin) / denom);
}
