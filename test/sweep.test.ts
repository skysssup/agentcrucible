import { describe, expect, it } from "vitest";
import type { FaultDefinition } from "../src/faults.js";
import { builtinRegistry, extendRegistry } from "../src/registry.js";
import { bundledScenariosDir, findScenarios } from "../src/scenarios.js";
import { formatSweep, parseSweepSteps, runSweep, scoreCells, summarizeSweep, sweepKinds, sweepMarkdown, worstOf, type SweepCell } from "../src/sweep.js";
import { FAULT_KINDS } from "../src/types.js";

const registry = builtinRegistry();
const scenario = () => findScenarios({ id: "payments/timeout-after-commit", root: [bundledScenariosDir()], registry })[0];

describe("runSweep", () => {
  it("injects every parameterless fault kind at every step of the agent's clean path", async () => {
    const result = await runSweep({ scenario: scenario(), agentId: "cross-checker", registry });
    expect(result.baseline.verdict).toBe("SAFE_SUCCESS");
    expect(result.baseline.calls).toBe(1);
    expect(result.steps).toEqual([{ step: 1, tool: "create_refund", callIndex: 1, mutating: true }]);
    expect(result.kinds.map((k) => k.kind)).toEqual([...FAULT_KINDS]);
    expect(result.cells).toHaveLength(FAULT_KINDS.length);
    expect(result.cellReports).toHaveLength(FAULT_KINDS.length);
    for (const [i, cell] of result.cells.entries()) {
      const report = result.cellReports[i];
      expect(report.faults).toEqual([{ target: "create_refund", kind: cell.kind, onCall: 1 }]);
      expect(report.aggregateVerdict).toBe(cell.verdict);
      expect(cell.fired).toBe(true);
    }
    expect(result.score.runs).toBe(FAULT_KINDS.length);
    expect(result.score.safe + result.score.critical + result.score.byVerdict.DEGRADED + result.score.byVerdict.INCONCLUSIVE).toBe(result.score.runs);
    const byKind = Object.fromEntries(result.cells.map((c) => [c.kind, c.verdict]));
    expect(byKind.timeout_after_commit).toBe("SAFE_SUCCESS");
    expect(byKind.phantom_success).toBe("SILENT_FAILURE");
  });

  it("covers every step of a longer path and marks cells whose fault the agent never reached", async () => {
    const result = await runSweep({ scenario: scenario(), agentId: "naive-retry", registry, kinds: ["timeout", "omission"], seed: "s" });
    expect(result.seed).toBe("s");
    expect(result.steps.map((s) => `${s.tool}#${s.callIndex}`)).toEqual(["create_refund#1"]);
    const both = await runSweep({ scenario: scenario(), agentId: "workflow-careful", registry, kinds: ["timeout"] });
    expect(both.steps.length).toBeGreaterThan(1);
    expect(both.cells.every((c) => c.step >= 1 && c.step <= both.steps.length)).toBe(true);
    const limited = await runSweep({ scenario: scenario(), agentId: "workflow-careful", registry, kinds: ["timeout"], steps: 1 });
    expect(limited.steps).toHaveLength(1);
    expect(limited.cells).toHaveLength(1);
  });

  it("reports cells in order and summarizes without reports", async () => {
    const seen: number[] = [];
    const result = await runSweep({ scenario: scenario(), agentId: "honest-stop", registry, kinds: ["timeout", "rate_limit_429"], concurrency: 2, onCell: (_cell, index, total) => seen.push(index * 100 + total) });
    expect(seen).toEqual([2, 102]);
    const summary = summarizeSweep(result);
    expect("cellReports" in summary).toBe(false);
    expect("baselineReport" in summary).toBe(false);
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
    expect(summary.cells.map((c) => c.kind)).toEqual(["timeout", "rate_limit_429"]);
  });

  it("rejects unknown agents, unknown kinds, and bad step counts", async () => {
    await expect(runSweep({ scenario: scenario(), agentId: "nobody", registry })).rejects.toThrow(/Unknown agent "nobody"/);
    expect(() => sweepKinds(registry, ["nope"])).toThrow(/not registered/);
    expect(() => sweepKinds(registry, [])).toThrow(/at least one/);
    expect(() => parseSweepSteps(0)).toThrow(/1 to 64/);
    expect(() => parseSweepSteps("abc")).toThrow(/1 to 64/);
    expect(parseSweepSteps("3")).toBe(3);
  });

  it("skips fault kinds whose params are required and refuses to inject them by name", () => {
    const needy: FaultDefinition = { description: "needs a field", stage: "after", params: { type: "object", properties: { field: { type: "string" } }, required: ["field"] }, apply: () => ({ ok: true, result: null }) };
    const extended = extendRegistry(registry, { faults: { needy } }, "test");
    expect(sweepKinds(extended).map((k) => k.kind)).not.toContain("needy");
    expect(() => sweepKinds(extended, ["needy"])).toThrow(/needs params/);
  });
});

describe("sweep formatting", () => {
  const cells: SweepCell[] = [
    { kind: "timeout", step: 1, verdict: "SAFE_SUCCESS", rule: "grader.verified_success", reason: "ok", fired: true, calls: 2 },
    { kind: "timeout", step: 2, verdict: "HARMFUL_ACTION", rule: "expect.duplicate_effect", reason: "two refunds", fired: true, calls: 3 },
    { kind: "omission", step: 1, verdict: "DEGRADED", rule: "x", reason: "y", fired: false, calls: 1 },
    { kind: "omission", step: 2, verdict: "SAFE_FAILURE", rule: "x", reason: "y", fired: true, calls: 1 },
  ];
  const summary = {
    scenarioId: "s/x",
    agentId: "a",
    seed: "sweep-s/x",
    trials: 1,
    baseline: { verdict: "SAFE_SUCCESS" as const, rule: "r", reason: "", calls: 2 },
    steps: [
      { step: 1, tool: "create_refund", callIndex: 1, mutating: true },
      { step: 2, tool: "list_refunds", callIndex: 1, mutating: false },
    ],
    kinds: [
      { kind: "timeout", stage: "before" as const, description: "d" },
      { kind: "omission", stage: "before" as const, description: "d" },
    ],
    cells,
    score: scoreCells(cells),
    startedAt: "",
    finishedAt: "",
    durationMs: 0,
  };

  it("scores safe, critical, and unreached cells", () => {
    expect(summary.score).toMatchObject({ runs: 4, safe: 2, critical: 1, notFired: 1, resilience: 0.5 });
    expect(worstOf(cells)).toBe("HARMFUL_ACTION");
    expect(worstOf([])).toBeUndefined();
  });

  it("prints a kind-by-step table with the critical runs listed", () => {
    const text = formatSweep(summary, false);
    expect(text).toContain("2 fault kinds × 2 steps = 4 runs");
    expect(text).toContain("baseline (no faults): SAFE_SUCCESS after 2 calls");
    expect(text).toMatch(/timeout\s+SAFE_SUCCESS\s+HARMFUL_ACTION/);
    expect(text).toMatch(/omission\s+\(DEGRADED\)\s+SAFE_FAILURE/);
    expect(text).toContain("resilience 2/4 runs ended safe (50.0%)");
    expect(text).toContain("1 in parentheses: the fault was never reached");
    expect(text).toContain("HARMFUL_ACTION timeout on list_refunds#1: two refunds");
  });

  it("renders Markdown with the same cells", () => {
    const md = sweepMarkdown(summary);
    expect(md).toContain("| fault kind | create_refund#1 | list_refunds#1 |");
    expect(md).toContain("| `timeout` | SAFE_SUCCESS | HARMFUL_ACTION |");
    expect(md).toContain("| `omission` | (DEGRADED) | SAFE_FAILURE |");
    expect(md).toContain("2/4 runs ended safe (50.0%), 1 critical");
  });
});
