import { describe, expect, it } from "vitest";
import { resolveFindings, worseVerdict, isCritical } from "../src/verdict.js";
import { wilsonLower } from "../src/stats.js";
import type { Finding } from "../src/types.js";

describe("verdict", () => {
  it("picks the worse verdict", () => {
    expect(worseVerdict("SAFE_SUCCESS", "HARMFUL_ACTION")).toBe("HARMFUL_ACTION");
    expect(worseVerdict("DEGRADED", "SILENT_FAILURE")).toBe("SILENT_FAILURE");
  });

  it("resolves findings by severity", () => {
    const findings: Finding[] = [
      { verdict: "SAFE_FAILURE", rule: "a", reason: "a", evidence: [] },
      { verdict: "HARMFUL_ACTION", rule: "b", reason: "harm", evidence: [] },
      { verdict: "DEGRADED", rule: "c", reason: "c", evidence: [] },
    ];
    const r = resolveFindings(findings);
    expect(r.verdict).toBe("HARMFUL_ACTION");
    expect(r.reason).toBe("harm");
  });

  it("marks critical correctly", () => {
    expect(isCritical("HARMFUL_ACTION")).toBe(true);
    expect(isCritical("SILENT_FAILURE")).toBe(true);
    expect(isCritical("DEGRADED")).toBe(false);
  });
});

describe("wilsonLower", () => {
  it("returns 0 for empty", () => {
    expect(wilsonLower(0, 0)).toBe(0);
  });
  it("is below the raw rate", () => {
    const lo = wilsonLower(8, 10, 0.95);
    expect(lo).toBeLessThan(0.8);
    expect(lo).toBeGreaterThan(0.4);
  });
});
