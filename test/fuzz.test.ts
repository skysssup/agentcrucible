import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { compareBaseline, createBaseline } from "../src/baseline.js";
import type { ScriptedAgent } from "../src/harness.js";
import { builtinRegistry } from "../src/registry.js";
import { replayReport } from "../src/replay.js";
import { formatReport, formatTrialDetail, writeHtmlReport } from "../src/report.js";
import { runScenario } from "../src/runner.js";
import { loadAllScenarios } from "../src/scenarios.js";
import type { JsonSchema } from "../src/schema.js";
import { VERDICT_SEVERITY, VERDICTS, type RunReport } from "../src/types.js";

/** Deterministic PRNG (mulberry32), so every failure reproduces from its seed. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STRINGS = ["4471", "1", "re_1_4471", "re_2_4471", "tkt_7", "tkt_1", "customer@example.com", "notes/release.md", "../escape", "", " ", "acct_1", "accounts", "SKU-1", '<script>alert("x")</script>'];
const NUMBERS = [0, 1, 100, 8400, 10000, -1, 1.5];
const ODD = [Number.NaN, Number.POSITIVE_INFINITY, undefined, null, [], {}, "8400", true];

function pick<T>(r: () => number, items: readonly T[]): T {
  return items[Math.floor(r() * items.length)];
}

function valueFor(schema: JsonSchema | undefined, r: () => number, depth = 0): unknown {
  if (r() < 0.06) return pick(r, ODD);
  if (schema?.enum && r() < 0.8) return pick(r, schema.enum);
  const type = Array.isArray(schema?.type) ? pick(r, schema!.type) : schema?.type;
  switch (type) {
    case "string":
      return pick(r, STRINGS);
    case "integer":
    case "number":
      return pick(r, NUMBERS);
    case "boolean":
      return r() < 0.5;
    case "array":
      return depth > 2 ? [] : Array.from({ length: Math.floor(r() * 3) }, () => valueFor(schema?.items, r, depth + 1));
    case "object":
    default:
      if (depth > 2) return {};
      return Object.fromEntries(
        Object.entries(schema?.properties ?? { a: { type: "number" } })
          .filter(([name]) => schema?.required?.includes(name) ? r() < 0.93 : r() < 0.5)
          .map(([name, child]) => [name, valueFor(child, r, depth + 1)])
      );
  }
}

const CLAIMS = ["Done.", "The refund succeeded.", "Successfully completed the task.", "I emailed the customer and resolved the ticket."];
const PROBLEMS = ["It failed.", "I could not confirm whether it worked.", "The email may have gone out.", "The tool returned an error, so I stopped."];

/** An agent that makes random calls (mostly valid, some not) and gives a random answer built from what it saw. */
function randomAgent(seed: number): ScriptedAgent {
  return async (ctx) => {
    const r = rng(seed);
    const seen: string[] = [];
    for (let i = Math.floor(r() * 10); i > 0; i--) {
      const tool = r() < 0.92 ? pick(r, ctx.tools) : undefined;
      const roll = r();
      const args = roll < 0.04 ? pick(r, [null, [1, 2], "args"]) : roll < 0.07 ? { nested: { fn: () => 1 } } : valueFor(tool?.inputSchema, r);
      const res = await ctx.callTool(tool?.name ?? "no_such_tool", args as Record<string, unknown>);
      if (res.ok) seen.push(...(JSON.stringify(res.result).match(/\b(?:re|msg|tkt|row|rsv)_\w+/g) ?? []));
    }
    const parts = [pick(r, CLAIMS), ...(r() < 0.5 ? [pick(r, PROBLEMS)] : []), ...(seen.length && r() < 0.6 ? [`The id is ${pick(r, seen)}.`] : []), ...(r() < 0.3 ? ["It came to $84.00."] : [])];
    if (r() < 0.15) parts.push('<script>alert("x")</script>');
    if (r() < 0.15) parts.push('```json\n{"refund_id": "re_1_4471", "customer_notified": true, "ticket_status": "resolved"}\n```');
    const text = parts.join(" ");
    if (r() < 0.15) return { text, output: { refund_id: seen[0] ?? null, customer_notified: r() < 0.5, ticket_status: pick(r, ["open", "resolved", 7]) } };
    if (r() < 0.05) return '{"refund_id": "re_1_4471", "customer_notified": false';
    return text;
  };
}

const dir = mkdtempSync(join(tmpdir(), "ac-fuzz-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function checkReport(report: RunReport, label: string): void {
  expect(report.trials.length, label).toBe(report.stats.total);
  const worst = report.trials.reduce((a, t) => Math.max(a, VERDICT_SEVERITY[t.verdict]), 0);
  expect(VERDICT_SEVERITY[report.aggregateVerdict], label).toBe(worst);
  for (const trial of report.trials) {
    const ids = new Set(trial.trace.calls.map((c) => c.id));
    expect(VERDICTS, label).toContain(trial.verdict);
    expect(trial.findings[0]?.verdict, label).toBe(trial.verdict);
    trial.findings.forEach((f, i) => {
      if (i > 0) expect(VERDICT_SEVERITY[f.verdict], `${label} ${f.rule} order`).toBeLessThanOrEqual(VERDICT_SEVERITY[trial.findings[i - 1].verdict]);
      expect(f.evidence.length, `${label} ${f.rule} has evidence`).toBeGreaterThan(0);
      for (const e of f.evidence) {
        expect(e.summary.length, `${label} ${f.rule} evidence summary`).toBeGreaterThan(0);
        for (const id of e.callIds ?? []) expect(ids.has(id), `${label} ${f.rule} cites ${id}`).toBe(true);
      }
    });
    if (trial.verdict === "SAFE_SUCCESS") expect(trial.outcome.status, label).toBe("met");
    expect(() => formatTrialDetail(report, trial.trace.trialIndex), label).not.toThrow();
    if (trial.trace.calls[0]) expect(() => formatTrialDetail(report, trial.trace.trialIndex, trial.trace.calls[0].id), label).not.toThrow();
  }
  expect(() => formatReport(report), label).not.toThrow();
  const html = readFileSync(writeHtmlReport(report, dir), "utf8");
  expect(html.match(/<script\b/g), `${label} html scripts`).toHaveLength(1);
  const saved = JSON.parse(JSON.stringify(report)) as RunReport;
  const replay = replayReport(saved, builtinRegistry());
  expect(replay.trials.find((t) => !t.reproduced) ?? null, `${label} replay`).toBeNull();
  const comparison = compareBaseline(createBaseline([saved]), [saved]);
  expect([comparison.unchanged, comparison.regressions.length, comparison.changed.length], `${label} baseline`).toEqual([1, 0, 0]);
}

describe("fuzz: random agents on every bundled scenario", () => {
  const scenarios = loadAllScenarios();
  it.each(scenarios.map((s, i) => [s.id, i] as const))("%s", async (_id, index) => {
    const scenario = scenarios[index];
    for (let k = 0; k < Number(process.env.FUZZ_AGENTS ?? 12); k++) {
      const seed = 1000 * (index + 1) + k;
      const report = await runScenario({ scenario, agent: randomAgent(seed), agentId: `fuzz-${seed}`, trials: 2, seed: `fuzz-${seed}` });
      checkReport(report, `${scenario.id} seed ${seed}`);
    }
  });
});
