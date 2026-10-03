import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeHtmlReport, writeJsonReport, writeJUnitReport } from "../src/report.js";
import { runHarness } from "../src/harness.js";
import { createWorld } from "../src/worlds/index.js";
import { gradeTrial } from "../src/grader.js";
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

  it.each([
    { name: "JSON", write: writeJsonReport },
    { name: "HTML", write: writeHtmlReport },
    { name: "JUnit", write: writeJUnitReport },
  ])("keeps colliding scenario IDs separate in $name reports", ({ write }) => {
    const dir = mkdtempSync(join(tmpdir(), "ac-report-"));
    try {
      const ids = ["a/b", "a_b", "a%2Fb", "a\\b", "a b"];
      const paths = ids.map(id => write(stubReport(id, ["SAFE_SUCCESS"]), dir));
      expect(new Set(paths).size).toBe(ids.length);
      for (const path of paths) expect(readFileSync(path, "utf8").length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("escapes unknown tool names and report text instead of inserting markup", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ac-report-"));
    try {
      const text = '<script>"marker"</script>';
      const world = createWorld("payments");
      const trace = await runHarness({
        scenarioId: "escape", task: "Check an unknown tool", seed: "escape", trialIndex: 0,
        agentId: "escape", world, faults: [],
        agent: async ctx => {
          await ctx.callTool(text, {});
          return `Tool failed: ${text}`;
        },
      });
      const report = stubReport(text, ["SAFE_FAILURE"]);
      report.agentId = text;
      report.seed = text;
      report.trials = [gradeTrial(trace, world, {})];
      report.trials[0].findings[0].rule = text;
      report.trials[0].findings[0].reason = text;
      report.trials[0].findings[0].evidence[0].kind = text;
      report.trials[0].findings[0].evidence[0].summary = text;
      const html = readFileSync(writeHtmlReport(report, dir), "utf8");
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;&quot;marker&quot;&lt;/script&gt;#1");
      expect(html).toContain("<code>&lt;script&gt;&quot;marker&quot;&lt;/script&gt;</code>");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
