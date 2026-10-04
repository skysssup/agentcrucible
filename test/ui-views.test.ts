import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { highlightJson } from "../src/html.js";
import { parseScenario } from "../src/scenarios.js";
import { errorLine, highlightYaml } from "../src/ui/client/editor.js";
import {
  argumentsLabel,
  clip,
  comparisonPanel,
  esc,
  filterReports,
  filterScenarios,
  href,
  replayPanel,
  reportList,
  runView,
  scenarioList,
  TEMPLATES,
  validationPanel,
  type ReportSummary,
  type ScenarioSummary,
} from "../src/ui/client/views.js";

const scenario = (over: Partial<ScenarioSummary>): ScenarioSummary => ({
  id: "payments/x",
  worlds: ["payments"],
  tags: ["smoke"],
  description: "First sentence. Second sentence.",
  task: "Refund order #1",
  faults: ["timeout on create_refund call 1"],
  hasExpect: true,
  outcomes: [{ name: "expected", verdict: "SAFE_SUCCESS" }],
  invariants: 0,
  answerChecks: 1,
  budget: {},
  expectedVerdicts: { "naive-retry": "HARMFUL_ACTION" },
  source: "scenarios/payments/x.yaml",
  bundled: true,
  ...over,
});

const report = (over: Partial<ReportSummary>): ReportSummary => ({ key: "mem-1", scenarioId: "payments/x", agentId: "naive-retry", verdict: "HARMFUL_ACTION", reason: "two refunds", rule: "expect.duplicate_effect", trials: 1, ...over });

describe("UI views", () => {
  it.each(Object.entries(TEMPLATES))("ships a %s template that parses as a scenario", (_name, text) => {
    expect(() => parseScenario(parseYaml(text), "template")).not.toThrow();
  });

  it("escapes values and keeps ids readable in links", () => {
    expect(esc(`<a href="x">'&`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
    expect(esc(undefined)).toBe("");
    expect(href("scenario", "payments/timeout-after-commit")).toBe("#/scenario/payments/timeout-after-commit");
    expect(href("report", "file:naive-retry/payments%2Fx.report.json")).toBe("#/report/file:naive-retry/payments%252Fx.report.json");
    expect(decodeURIComponent(href("report", "file:a b#c").slice("#/report/".length))).toBe("file:a b#c");
  });

  it("filters scenarios by text, tag, and world", () => {
    const all = [scenario({ id: "payments/a" }), scenario({ id: "email/b", worlds: ["email"], tags: ["email"], task: "Send the receipt" })];
    expect(filterScenarios(all, { q: "", tag: "", world: "" })).toHaveLength(2);
    expect(filterScenarios(all, { q: "RECEIPT", tag: "", world: "" }).map((s) => s.id)).toEqual(["email/b"]);
    expect(filterScenarios(all, { q: "", tag: "smoke", world: "" }).map((s) => s.id)).toEqual(["payments/a"]);
    expect(filterScenarios(all, { q: "", tag: "", world: "email" }).map((s) => s.id)).toEqual(["email/b"]);
    expect(filterScenarios(all, { q: "create_refund", tag: "", world: "" })).toHaveLength(2);
  });

  it("escapes scenario text in the list and shows only the first sentence", () => {
    const html = scenarioList([scenario({ description: "<img src=x onerror=alert(1)>. More." })], new Set(["payments/x"]));
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;.");
    expect(html).not.toContain("More.");
    expect(html).toContain('data-id="payments/x" checked');
    expect(html).toContain("1 outcome, 1 answer check");
    expect(scenarioList([], new Set())).toContain("No scenario matches.");
  });

  it("filters reports and explains an empty list", () => {
    const rows = [report({}), report({ key: "file:a", file: "a", verdict: "SAFE_SUCCESS", agentId: "cross-checker" })];
    expect(filterReports(rows, { q: "cross", verdict: "" }).map((r) => r.key)).toEqual(["file:a"]);
    expect(filterReports(rows, { q: "", verdict: "HARMFUL_ACTION" }).map((r) => r.key)).toEqual(["mem-1"]);
    expect(reportList(rows, { q: "nothing", verdict: "" }, new Set())).toContain("No report matches.");
    expect(reportList([], { q: "", verdict: "" }, new Set())).toContain("No reports yet.");
    expect(reportList([{ key: "file:bad", file: "bad.report.json", error: "not a report" }], { q: "", verdict: "" }, new Set())).toContain("not a report");
  });

  it("marks results that differ from the scenario's expected verdicts", () => {
    const html = runView({
      runId: "run-1",
      label: "two agents",
      at: "now",
      results: [report({ expected: "HARMFUL_ACTION" }), report({ key: "mem-2", agentId: "liar", verdict: "SAFE_SUCCESS", expected: "SILENT_FAILURE" })],
    });
    expect(html).toContain("1 result differs from expected_verdicts");
    expect(html).toContain("✗ expected SILENT_FAILURE");
    expect(html).toContain('class="cell SAFE_SUCCESS mismatch"');
    expect(html).toContain('href="#/report/mem-2"');
  });

  it("counts regressions and new failures at the fail-on threshold", () => {
    const change = { scenario: "s", agent: "a", rulesAdded: [], rulesRemoved: [] };
    const html = comparisonPanel(
      {
        regressions: [{ ...change, before: "SAFE_SUCCESS", after: "HARMFUL_ACTION" }],
        improvements: [],
        changed: [],
        unchanged: 3,
        added: [
          { scenario: "n", agent: "a", verdict: "SILENT_FAILURE" },
          { scenario: "m", agent: "a", verdict: "DEGRADED" },
        ],
        notRun: [],
        incomparable: [],
      },
      "SILENT_FAILURE"
    );
    expect(html).toContain("2 regressions or new failures");
    expect(html).toContain('<span class="kind bad">new failure</span>');
    expect(html).toContain('<span class="kind">new</span>');
    expect(html).toContain("3 unchanged");
  });

  it("shows validation and replay results", () => {
    expect(validationPanel({ ok: false, error: "draft: <bad>" })).toContain("draft: &lt;bad&gt;");
    expect(validationPanel(undefined)).toContain("Checking");
    expect(validationPanel({ ok: true, summary: scenario({}), expect: ["refund"] })).toContain("<li>refund</li>");
    expect(replayPanel({ reproduced: false, trials: [{ trialIndex: 0, replayedCalls: 1, reproduced: false, recordedVerdict: "SAFE_SUCCESS", divergence: { at: "call_2", field: "observed", recorded: 1, replayed: 2 } }] })).toContain(
      "trial 0: diverged at call_2 (observed)"
    );
  });

  it("clips long reasons at a word boundary", () => {
    expect(clip("short", 10)).toBe("short");
    expect(clip("one two three four", 10)).toBe("one two…");
    expect(clip("abcdefghijklmnop", 10)).toBe("abcdefghij…");
  });

  it("highlights YAML and JSON without changing or unescaping their text", () => {
    const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
    for (const yaml of [...Object.values(TEMPLATES), 'task: "<script>x</script>" # note\nlist: [a, "b: c", 3]\ndescription: >\n  one #two\n  three\nnext: true']) {
      const html = highlightYaml(yaml);
      expect(text(html)).toBe(yaml);
      expect(html.split("\n")).toHaveLength(yaml.split("\n").length);
      expect(html).not.toContain("<script>");
    }
    expect(highlightYaml("a: 1\nb: >\n  text: here\nc: x")).toContain('<span class="tk-str">  text: here</span>');
    const json = JSON.stringify({ "<k>": "<v>", n: -1.5, ok: true, none: null }, null, 2);
    expect(text(highlightJson(json))).toBe(json);
    expect(highlightJson(json)).toContain('<span class="tk-key">&quot;&lt;k&gt;&quot;</span>:');
    expect(highlightJson(json)).toContain('<span class="tk-num">-1.5</span>');
    expect(errorLine("draft: cannot parse: Nested mappings are not allowed at line 3, column 5:")).toBe(3);
    expect(errorLine("draft: faults[0].kind must be one of x")).toBeUndefined();
  });

  it("lists tool arguments with optional ones marked", () => {
    expect(argumentsLabel({ type: "object", properties: { order_id: {}, idempotency_key: {} }, required: ["order_id"] })).toBe("order_id, idempotency_key?");
    expect(argumentsLabel(undefined)).toBe("");
  });
});
