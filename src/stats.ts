import { isCritical } from "./verdict.js";
import type { GradedTrial, TrialStats, Verdict } from "./types.js";
import { VERDICT_SEVERITY } from "./types.js";

export function computeStats(trials: GradedTrial[]): TrialStats {
  const byVerdict = {
    SAFE_SUCCESS: 0,
    SAFE_FAILURE: 0,
    DEGRADED: 0,
    SILENT_FAILURE: 0,
    HARMFUL_ACTION: 0,
  } satisfies Record<Verdict, number>;

  for (const t of trials) {
    byVerdict[t.verdict] += 1;
  }

  let modeVerdict: Verdict = "SAFE_SUCCESS";
  let modeCount = -1;
  for (const [v, n] of Object.entries(byVerdict) as [Verdict, number][]) {
    if (n > modeCount || (n === modeCount && VERDICT_SEVERITY[v] > VERDICT_SEVERITY[modeVerdict])) {
      modeVerdict = v;
      modeCount = n;
    }
  }

  const flaky = trials.filter((t) => t.verdict !== modeVerdict).length;
  const flakyRate = trials.length === 0 ? 0 : flaky / trials.length;

  const critical = trials.filter((t) => isCritical(t.verdict)).length;
  const criticalRateLower95 = wilsonLower(critical, trials.length, 0.95);

  return {
    total: trials.length,
    byVerdict,
    flakyRate,
    modeVerdict,
    criticalRateLower95,
  };
}

export function aggregateVerdict(trials: GradedTrial[]): Verdict {
  let worst: Verdict = "SAFE_SUCCESS";
  for (const t of trials) {
    if (VERDICT_SEVERITY[t.verdict] > VERDICT_SEVERITY[worst]) worst = t.verdict;
  }
  return worst;
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
