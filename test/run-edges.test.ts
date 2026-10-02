import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseTrials, runScenario } from "../src/runner.js";
import { findScenarios } from "../src/scenarios.js";
import { writeJUnitReport } from "../src/report.js";

describe("parseTrials", () => {
  it("accepts positive integers", () => {
    expect(parseTrials(1)).toBe(1);
    expect(parseTrials("3")).toBe(3);
  });

  it("rejects zero, negative, non-integer, non-finite", () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity, "abc", ""]) {
      expect(() => parseTrials(bad)).toThrow(/positive integer/i);
    }
  });
});

describe("runScenario trials edge", () => {
  it("throws before running when trials is zero", async () => {
    const scenarios = findScenarios({ id: "payments/timeout-after-commit" });
    expect(scenarios.length).toBe(1);
    await expect(
      runScenario({ scenario: scenarios[0], agentId: "honest-stop", trials: 0 })
    ).rejects.toThrow(/positive integer/i);
  });
});

describe("junit per-scenario files", () => {
  it("writes distinct junit files so multi-scenario runs do not overwrite", () => {
    const dir = mkdtempSync(join(tmpdir(), "ac-junit-"));
    try {
      const a = writeJUnitReport(
        {
          scenarioId: "scenario-a",
          agentId: "naive-retry",
          seed: "s",
          world: "payments",
          durationMs: 1,
          aggregateVerdict: "SAFE_SUCCESS",
          stats: {
            total: 1,
            byVerdict: { SAFE_SUCCESS: 1 },
            flakyRate: 0,
            criticalRateLower95: 0,
            modeVerdict: "SAFE_SUCCESS",
          },
          trials: [
            {
              verdict: "SAFE_SUCCESS",
              reason: "ok",
              findings: [],
              trace: { trialIndex: 0, finalAnswer: "ok", calls: [] },
            },
          ],
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        } as never,
        dir
      );
      const b = writeJUnitReport(
        {
          scenarioId: "scenario-b",
          agentId: "naive-retry",
          seed: "s",
          world: "payments",
          durationMs: 1,
          aggregateVerdict: "HARMFUL_ACTION",
          stats: {
            total: 1,
            byVerdict: { HARMFUL_ACTION: 1 },
            flakyRate: 0,
            criticalRateLower95: 1,
            modeVerdict: "HARMFUL_ACTION",
          },
          trials: [
            {
              verdict: "HARMFUL_ACTION",
              reason: "dup",
              findings: [],
              trace: { trialIndex: 0, finalAnswer: "ok", calls: [] },
            },
          ],
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        } as never,
        dir
      );
      expect(a).not.toBe(b);
      expect(a.endsWith("scenario-a.junit.xml")).toBe(true);
      expect(b.endsWith("scenario-b.junit.xml")).toBe(true);
      expect(existsSync(join(dir, "junit.xml"))).toBe(false);
      expect(readFileSync(b, "utf8")).toContain("HARMFUL_ACTION");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
