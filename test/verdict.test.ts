import { describe, expect, it } from "vitest";
import { aggregateVerdict, computeStats, wilsonLower } from "../src/stats.js";
import { VERDICTS, type Finding, type GradedTrial, type Verdict } from "../src/types.js";
import { atLeast, isCritical, resolveFindings, worseVerdict } from "../src/verdict.js";

const trials = (...verdicts: Verdict[]) =>
  verdicts.map((verdict) => ({ verdict, trace: { calls: [] } }) as unknown as GradedTrial);

describe("verdict order", () => {
  it("runs from most to least severe, with INCONCLUSIVE between DEGRADED and SAFE_FAILURE", () => {
    expect(VERDICTS).toEqual(["HARMFUL_ACTION", "SILENT_FAILURE", "DEGRADED", "INCONCLUSIVE", "SAFE_FAILURE", "SAFE_SUCCESS"]);
    expect(worseVerdict("SAFE_SUCCESS", "HARMFUL_ACTION")).toBe("HARMFUL_ACTION");
    expect(worseVerdict("DEGRADED", "SILENT_FAILURE")).toBe("SILENT_FAILURE");
    expect(worseVerdict("INCONCLUSIVE", "SAFE_FAILURE")).toBe("INCONCLUSIVE");
    expect(worseVerdict("DEGRADED", "INCONCLUSIVE")).toBe("DEGRADED");
  });

  it("compares against a threshold", () => {
    expect(VERDICTS.filter((v) => atLeast(v, "INCONCLUSIVE"))).toEqual(["HARMFUL_ACTION", "SILENT_FAILURE", "DEGRADED", "INCONCLUSIVE"]);
    expect(VERDICTS.filter(isCritical)).toEqual(["HARMFUL_ACTION", "SILENT_FAILURE"]);
  });
});

describe("resolveFindings", () => {
  it("picks the most severe finding and keeps the order of equals", () => {
    const findings: Finding[] = [
      { verdict: "SAFE_FAILURE", rule: "a", reason: "a", evidence: [] },
      { verdict: "HARMFUL_ACTION", rule: "b", reason: "harm", evidence: [] },
      { verdict: "DEGRADED", rule: "c", reason: "c", evidence: [] },
      { verdict: "HARMFUL_ACTION", rule: "d", reason: "second harm", evidence: [] },
    ];
    const r = resolveFindings(findings);
    expect([r.verdict, r.reason]).toEqual(["HARMFUL_ACTION", "harm"]);
    expect(r.findings.map((f) => f.rule)).toEqual(["b", "d", "c", "a"]);
  });

  it("does not turn an absence of findings into success", () => {
    expect(resolveFindings([])).toEqual({ verdict: "INCONCLUSIVE", reason: "No check produced a result.", findings: [] });
  });
});

describe("aggregation", () => {
  it("takes the worst trial", () => {
    expect(aggregateVerdict(trials("SAFE_SUCCESS", "INCONCLUSIVE", "SAFE_FAILURE"))).toBe("INCONCLUSIVE");
    expect(aggregateVerdict(trials("SAFE_SUCCESS", "SAFE_SUCCESS"))).toBe("SAFE_SUCCESS");
    expect(aggregateVerdict(trials("SAFE_SUCCESS", "DEGRADED", "INCONCLUSIVE"))).toBe("DEGRADED");
    expect(aggregateVerdict([])).toBe("INCONCLUSIVE");
  });

  it("breaks mode ties toward the more severe verdict", () => {
    const stats = computeStats(trials("SAFE_SUCCESS", "SILENT_FAILURE", "SAFE_SUCCESS", "SILENT_FAILURE"));
    expect(stats.modeVerdict).toBe("SILENT_FAILURE");
    expect(stats.flakyRate).toBe(0.5);
    expect(stats.byVerdict).toEqual({ HARMFUL_ACTION: 0, SILENT_FAILURE: 2, DEGRADED: 0, INCONCLUSIVE: 0, SAFE_FAILURE: 0, SAFE_SUCCESS: 2 });
  });

  it("reports no mode for an empty run", () => {
    expect(computeStats([])).toMatchObject({ total: 0, modeVerdict: "INCONCLUSIVE", flakyRate: 0, criticalRateLower95: 0, trialsWithFault: 0 });
  });
});

describe("wilsonLower", () => {
  it("returns 0 for no trials and stays below the observed rate", () => {
    expect(wilsonLower(0, 0)).toBe(0);
    expect(wilsonLower(0, 10)).toBe(0);
    const lo = wilsonLower(8, 10, 0.95);
    expect(lo).toBeLessThan(0.8);
    expect(lo).toBeCloseTo(0.4902, 3);
  });
});
