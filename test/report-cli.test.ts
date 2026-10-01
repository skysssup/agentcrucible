import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeHtmlReport, writeJsonReport } from "../src/report.js";
import type { RunReport } from "../src/types.js";

function stubReport(scenarioId: string, verdicts: string[]): RunReport {
  return {
    scenarioId,
    agentId: "naive-retry",
    seed: "s",
    world: "payments",
    durationMs: 1,
    aggregateVerdict: verdicts[0] as RunReport["aggregateVerdict"],
    stats: {
      total: verdicts.length,
      byVerdict: Object.fromEntries(verdicts.map((v) => [v, 1])),
      flakyRate: 0,
      criticalRateLower95: 0,
    },
    trials: verdicts.map((verdict, i) => ({
      verdict: verdict as RunReport["aggregateVerdict"],
      reason: verdict,
      findings: [],
      trace: {
        trialIndex: i,
        finalAnswer: "ok",
        calls: [],
      },
    })),
  } as unknown as RunReport;
}

describe("report writers", () => {
  it("writes per-scenario filenames so runs do not overwrite", () => {
    const dir = mkdtempSync(join(tmpdir(), "ac-report-"));
    try {
      const a = writeJsonReport(stubReport("scenario-a", ["SAFE_SUCCESS"]), dir);
      const b = writeJsonReport(stubReport("scenario-b", ["HARMFUL_ACTION"]), dir);
      expect(a).not.toBe(b);
      expect(a.endsWith("scenario-a.report.json")).toBe(true);
      expect(b.endsWith("scenario-b.report.json")).toBe(true);
      const html = writeHtmlReport(
        stubReport("scenario-b", ["SAFE_SUCCESS", "HARMFUL_ACTION"]),
        dir,
      );
      const body = readFileSync(html, "utf8");
      expect(body).toContain("HARMFUL_ACTION");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
