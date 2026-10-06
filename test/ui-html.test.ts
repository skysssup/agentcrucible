import { describe, expect, it } from "vitest";
import { renderRunIndex, renderSweepHtml, sweepHeatMap, VERDICT_CODE } from "../src/html.js";
import { builtinRegistry } from "../src/registry.js";
import { runScenario } from "../src/runner.js";
import { bundledScenariosDir, findScenarios } from "../src/scenarios.js";
import { runSweep, summarizeSweep, type SweepSummary } from "../src/sweep.js";
import { UI_CSS } from "../src/ui/styles.js";
import { VERDICTS } from "../src/types.js";

const registry = builtinRegistry();
const scenario = findScenarios({ id: "payments/timeout-after-commit", root: [bundledScenariosDir()], registry })[0];

const summary = (): SweepSummary => ({
  scenarioId: "payments/<x>",
  agentId: "cross-checker",
  seed: "s'1",
  trials: 2,
  baseline: { verdict: "SAFE_SUCCESS", rule: "", reason: "ok", calls: 2 },
  steps: [
    { step: 1, tool: "create_refund", callIndex: 1, mutating: true },
    { step: 2, tool: "list_refunds", callIndex: 1, mutating: false },
  ],
  kinds: [
    { kind: "timeout", stage: "before", description: "d" },
    { kind: "phantom_success", stage: "before", description: "d" },
  ],
  cells: [
    { kind: "timeout", step: 1, verdict: "SAFE_FAILURE", rule: "grader.safe_failure", reason: "reported it", fired: true, calls: 1 },
    { kind: "timeout", step: 2, verdict: "SAFE_SUCCESS", rule: "", reason: "never reached", fired: false, calls: 2 },
    { kind: "phantom_success", step: 1, verdict: "SILENT_FAILURE", rule: "expect.false_success_claim", reason: 'said "done" <b>', fired: true, calls: 1 },
    { kind: "phantom_success", step: 2, verdict: "SAFE_SUCCESS", rule: "", reason: "fine", fired: true, calls: 2 },
  ],
  score: { runs: 4, safe: 3, critical: 1, notFired: 1, resilience: 0.75, byVerdict: { HARMFUL_ACTION: 0, SILENT_FAILURE: 1, DEGRADED: 0, INCONCLUSIVE: 0, SAFE_FAILURE: 1, SAFE_SUCCESS: 2 } },
  startedAt: "2026-10-05T10:00:00.000Z",
  finishedAt: "2026-10-05T10:00:01.000Z",
  durationMs: 1000,
});

describe("renderSweepHtml", () => {
  it("is a self-contained page with the header, the score, the heat map, and the critical runs", () => {
    const html = renderSweepHtml(summary(), { version: "1.2.3" });
    expect(html).toContain("<title>Sweep of payments/&lt;x&gt; with cross-checker</title>");
    expect(html).toContain("v1.2.3");
    expect(html).toContain('<span class="badge SAFE_SUCCESS" title="Verdict of the agent\'s run without faults">baseline SAFE_SUCCESS</span>');
    expect(html).toContain("agent <code>cross-checker</code>");
    expect(html).toContain("seed <code>s&#39;1</code>");
    expect(html).toContain("2 trials per run");
    for (const [label, value] of [["Runs", "4"], ["Ended safe", "3"], ["Critical", "1"], ["Resilience", "75.0%"]]) expect(html).toContain(`<span class="kpi-label">${label}</span><span class="kpi-num">${value}</span>`);
    expect(html).toContain("1 not reached");
    expect(html).toContain('<span class="hm-tool">create_refund</span>');
    expect(html).toMatch(/<span class="hm-cell SAFE_FAILURE" title="SAFE_FAILURE\ngrader.safe_failure\nreported it"[^>]*>SF<\/span>/);
    expect(html).toMatch(/class="hm-cell SAFE_SUCCESS hm-off" title="not reached\n[^"]*"[^>]*>\(SS\)<\/span>/);
    expect(html).toContain('title="worst: SILENT_FAILURE"');
    expect(html).toContain('<tr><td><span class="verdict SILENT_FAILURE">SILENT_FAILURE</span></td><td><code>phantom_success</code></td><td><code>create_refund#1</code></td><td><code class="rule">expect.false_success_claim</code></td><td class="reason">said &quot;done&quot; &lt;b&gt;</td></tr>');
    expect(html.match(/<tr><td><span class="verdict/g)).toHaveLength(1);
    expect(html).not.toMatch(/<script\b|<(?:link|img|iframe)\b|src=|https?:\/\//);
    expect(html).not.toContain("payments/<x>");
  });

  it("takes a title and says when nothing ended critical", () => {
    const quiet = { ...summary(), cells: summary().cells.filter((c) => c.verdict !== "SILENT_FAILURE") };
    const html = renderSweepHtml(quiet, { title: "My <sweep>" });
    expect(html).toContain("<title>My &lt;sweep&gt;</title>");
    expect(html).toContain("No run ended HARMFUL_ACTION or SILENT_FAILURE.");
  });

  it("renders a real sweep, one heat map cell per fault kind and step", async () => {
    const result = await runSweep({ scenario, agentId: "cross-checker", registry, kinds: ["timeout", "phantom_success"] });
    const html = renderSweepHtml(summarizeSweep(result));
    expect(html.match(/class="hm-cell [^"]*" title=/g)).toHaveLength(result.cells.length);
    expect(html).toContain("phantom_success");
    expect(sweepHeatMap(summarizeSweep(result), (cell) => `#/report/${cell.kind}`)).toContain('href="#/report/phantom_success"');
  });

  it("gives every verdict a code", () => {
    expect(VERDICTS.map((v) => VERDICT_CODE[v])).toEqual(["HA", "SL", "DE", "IN", "SF", "SS"]);
  });
});

describe("the design system", () => {
  it("styles the UI and the standalone pages without gradients, glows, blur, or large radii", async () => {
    const report = await runScenario({ scenario, agentId: "naive-retry", registry, trials: 1 });
    const pages = [UI_CSS, renderSweepHtml(summary()), renderRunIndex([{ report, href: "r.html" }], "Run", "SILENT_FAILURE")];
    for (const css of pages) {
      expect(css).not.toMatch(/gradient\(|backdrop-filter|text-shadow|@keyframes (glow|shimmer|pulse)/);
      expect(css).not.toMatch(/border-radius:\s*(?:[7-9]|[1-9]\d)px/);
    }
    expect(UI_CSS).toContain("--canvas:light-dark(#f4f3ef,#0c0c0b)");
    expect(UI_CSS).toContain("--accent:light-dark(#c4471a,#ec6a33)");
    expect(UI_CSS).toContain("html :not(#_) { font-variant-numeric:tabular-nums; }");
    expect(UI_CSS).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("keeps the verdict classes the pages rely on", () => {
    for (const v of VERDICTS) expect(UI_CSS).toContain(`.${v} { --v:`);
    for (const name of ["harm", "silent", "degr", "inc", "sfail", "ssucc"]) for (const part of ["", "-fg", "-bg", "-bd"]) expect(UI_CSS).toContain(`--${name}${part}:`);
  });
});
