import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import type { Coverage } from "../src/coverage.js";
import { esc, highlightJson } from "../src/html.js";
import type { SweepSummary } from "../src/sweep.js";
import { parseScenario } from "../src/scenarios.js";
import type { SweepResponse } from "../src/ui/server.js";
import { errorLine, highlightYaml } from "../src/ui/client/editor.js";
import {
  agentStats,
  agentsView,
  argumentsLabel,
  catalogView,
  clip,
  comparisonPanel,
  coverageView,
  filterReports,
  filterScenarios,
  href,
  needsAttention,
  overviewView,
  replayPanel,
  reportList,
  runCommands,
  runCsv,
  runMarkdown,
  runView,
  scenarioList,
  scenariosHref,
  shell,
  shortcutsView,
  sweepCommand,
  sweepCsv,
  sweepView,
  TEMPLATES,
  uniqueResults,
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

  it("shows each result's trials and filters the matrix to unexpected or flaky results", () => {
    const html = runView({
      runId: "run-2",
      label: "trials",
      at: "now",
      results: [
        report({ trials: 3, byVerdict: { HARMFUL_ACTION: 1, SAFE_SUCCESS: 2 }, expected: "HARMFUL_ACTION" }),
        report({ key: "mem-2", agentId: "liar", verdict: "SAFE_SUCCESS", trials: 3, byVerdict: { SAFE_SUCCESS: 3 }, expected: "SILENT_FAILURE" }),
      ],
    });
    expect(html).toContain("flaky, 3 trials");
    expect(html).toContain('title="3 trials: 1 HARMFUL_ACTION, 2 SAFE_SUCCESS"');
    expect(html).toContain('data-unexpected="1" data-flaky="1"');
    expect(html).toContain('data-filter="unexpected"');
    expect(html).toContain('data-filter="flaky"');
    expect(html).toContain("1 of 2 unexpected");
    expect(html).toContain("1/1 as expected");
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

  it("exports a run's matrix as Markdown, CSV, and the commands that run it again", () => {
    const run = {
      runId: "run-3",
      label: "two scenarios",
      at: "now",
      trials: 2,
      seed: "it's",
      results: [
        report({ expected: "HARMFUL_ACTION" }),
        report({ key: "mem-2", agentId: "liar", verdict: "SAFE_SUCCESS", expected: "SILENT_FAILURE", reason: 'said "done", twice' }),
        report({ key: "mem-3", scenarioId: "email/y", verdict: "DEGRADED" }),
      ],
    };
    expect(runMarkdown(run)).toBe(
      "| Scenario | naive-retry | liar |\n| --- | --- | --- |\n| payments/x | HARMFUL_ACTION | SAFE_SUCCESS (expected SILENT_FAILURE) |\n| email/y | DEGRADED | not run |\n"
    );
    const csv = runCsv(run).split("\n");
    expect(csv[0]).toBe("scenario,agent,verdict,expected,as_expected,trials,seed,rule,reason");
    expect(csv[2]).toBe('payments/x,liar,SAFE_SUCCESS,SILENT_FAILURE,false,1,,expect.duplicate_effect,"said ""done"", twice"');
    expect(csv[3]).toBe("email/y,naive-retry,DEGRADED,,,1,,expect.duplicate_effect,two refunds");
    expect(runCommands(run)).toEqual([
      "npx agentcrucible run --scenario payments/x --agents naive-retry,liar --trials 2 --seed 'it'\\''s'",
      "npx agentcrucible run --scenario email/y --agents naive-retry --trials 2 --seed 'it'\\''s'",
    ]);
  });

  it("counts a saved copy of a session result once and ranks agents by their share of safe results", () => {
    const result = (over: Partial<ReportSummary>) => report({ seed: "s", finishedAt: "2026-10-04T10:00:00.000Z", ...over });
    const rows = uniqueResults([
      result({}),
      result({ key: "file:naive-retry/x.report.json", file: "naive-retry/x.report.json" }),
      result({ key: "mem-2", agentId: "cross-checker", verdict: "SAFE_SUCCESS" }),
      result({ key: "mem-3", agentId: "cross-checker", verdict: "SAFE_FAILURE", scenarioId: "email/y" }),
      { key: "file:bad", file: "bad", error: "not a report" },
    ]);
    expect(rows.map((r) => r.key)).toEqual(["mem-1", "mem-2", "mem-3"]);
    const agents = ["naive-retry", "liar", "cross-checker"].map((id) => ({ id, description: `<b>${id}</b>`, source: "built-in" }));
    expect(agentStats(agents, rows).map((s) => [s.id, s.total, s.safe, s.worst])).toEqual([
      ["cross-checker", 2, 2, "SAFE_FAILURE"],
      ["naive-retry", 1, 0, "HARMFUL_ACTION"],
      ["liar", 0, 0, undefined],
    ]);
    const html = agentsView({ agents, verdicts: [] } as never, rows);
    expect(html).toContain('data-agent="cross-checker"');
    expect(html).toContain("&lt;b&gt;liar&lt;/b&gt;");
    expect(html).not.toContain("<b>liar</b>");
    expect(html).toContain("no results yet");
    expect(html).toContain("2 agents of 3 have results.");
  });

  it("lists tool arguments with optional ones marked", () => {
    expect(argumentsLabel({ type: "object", properties: { order_id: {}, idempotency_key: {} }, required: ["order_id"] })).toBe("order_id, idempotency_key?");
    expect(argumentsLabel(undefined)).toBe("");
  });

  it("labels each fault stage in the catalog, including a call that runs twice", () => {
    const meta = {
      version: "x",
      cwd: "/p",
      outDir: "out",
      scenarioRoots: [],
      scenarioDir: null,
      baselinePath: "b.json",
      failOn: "SILENT_FAILURE" as const,
      verdicts: [],
      agents: [{ id: "verify-after-write", description: "reads back", source: "built-in" }],
      worlds: [],
      faults: [
        { kind: "timeout", stage: "before", description: "d1", params: [], source: "built-in" },
        { kind: "replica_lag", stage: "after", description: "d2", params: [], source: "built-in" },
        { kind: "duplicate_delivery", stage: "twice", description: "d3", params: [], source: "built-in" },
        { kind: "phantom_success", stage: "before", description: "d4", params: ["result"], source: "built-in" },
      ],
    };
    const html = catalogView(meta as never);
    expect(html).toContain("verify-after-write");
    expect(html).toMatch(/timeout[\s\S]*?before the call runs/);
    expect(html).toMatch(/replica_lag[\s\S]*?after the call runs/);
    expect(html).toMatch(/duplicate_delivery[\s\S]*?the call runs twice/);
    expect(html).toMatch(/phantom_success[\s\S]*?<code class="code-chip">result<\/code>/);
  });

  it("lists only the scenarios a Coverage link names", () => {
    const all = [scenario({ id: "payments/a" }), scenario({ id: "payments/b" }), scenario({ id: "email/c" })];
    expect(filterScenarios(all, { q: "", tag: "", world: "", ids: ["payments/b", "email/c"] }).map((s) => s.id)).toEqual(["payments/b", "email/c"]);
    expect(filterScenarios(all, { q: "", tag: "", world: "", ids: [] })).toHaveLength(3);
    expect(scenariosHref(["payments/a", "email/c"])).toBe("#/scenarios?ids=payments/a,email/c");
  });

  it("puts Coverage and Sweep in the sidebar and the shortcuts", () => {
    const meta = { cwd: "/p/demo", version: "1.1.0" } as never;
    const nav = shell(meta, false);
    expect(nav).toContain('href="#/sweep" data-route="sweep"');
    expect(nav).toContain('href="#/coverage" data-route="coverage"');
    expect(nav).toContain("Local, offline");
    expect(nav).not.toContain("live-dot");
    const keys = shortcutsView(false);
    expect(keys).toMatch(/<dt>Sweep<\/dt><dd><kbd>G<\/kbd><kbd>W<\/kbd>/);
    expect(keys).toMatch(/<dt>Coverage<\/dt><dd><kbd>G<\/kbd><kbd>V<\/kbd>/);
  });

  it("lists results that differ from the expected verdict or that are HARMFUL_ACTION or SILENT_FAILURE, differences first", () => {
    const scenarios = [scenario({ expectedVerdicts: { "naive-retry": "HARMFUL_ACTION", "cross-checker": "SAFE_SUCCESS" } })];
    const rows = [
      report({ key: "a" }),
      report({ key: "b", agentId: "cross-checker", verdict: "SAFE_SUCCESS" }),
      report({ key: "c", agentId: "cross-checker", verdict: "DEGRADED" }),
      report({ key: "d", agentId: "liar", verdict: "SILENT_FAILURE" }),
      report({ key: "e", agentId: "honest-stop", verdict: "DEGRADED" }),
    ];
    expect(needsAttention(rows, scenarios).map((r) => r.key)).toEqual(["c", "a", "d"]);
  });

  it("renders the overview as KPI cells and tables, without a hero or tutorial tiles", () => {
    const meta = {
      version: "1.1.0",
      cwd: "/p/demo",
      outDir: ".agentcrucible/out",
      scenarioRoots: [],
      scenarioDir: null,
      baselinePath: "b.json",
      failOn: "SILENT_FAILURE" as const,
      verdicts: [],
      demo: { scenario: "payments/x", seed: "demo" },
      agents: [{ id: "naive-retry", description: "d", source: "built-in" }],
      worlds: [{ name: "payments" }],
      faults: [{ kind: "timeout" }],
    };
    const coverage = { faultKinds: [{ kind: "timeout" }], worlds: [{ tools: [{ faultKinds: ["timeout"] }, { faultKinds: [] }] }], gaps: { faultKinds: [], tools: ["payments/get_refund"], worlds: [], agents: [], withoutExpect: [], withoutExpectedVerdicts: [], withoutFaults: [], withoutTags: [] } };
    const html = overviewView(meta as never, [scenario({})], [report({ key: "file:a", file: "a", finishedAt: "2026-10-04T10:00:00.000Z" })], { runs: [], coverage: coverage as never, baseline: { entries: 4 } });
    for (const label of ["Scenarios", "Agents", "Worlds", "Fault kinds", "Saved reports", "Baseline"]) expect(html).toContain(`<span class="kpi-label">${label}</span>`);
    expect(html).toContain("present, 4 entries");
    for (const title of ["Needs attention", "Recent runs", "Verdict distribution", "Agents", "Coverage"]) expect(html).toContain(`<h2>${title}</h2>`);
    expect(html).toContain("1 / 2");
    expect(html).not.toMatch(/Break the tools|hero|ember|conic-gradient|Hold the line/);
    expect(overviewView(meta as never, [], [])).toContain("absent");
  });

  const sweep = (): SweepResponse => ({
    sweepId: "sweep-3",
    scenarioId: "payments/<x>",
    agentId: "cross-checker",
    seed: "sweep-payments/<x>",
    trials: 1,
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
      { kind: "timeout", step: 1, verdict: "SAFE_FAILURE", rule: "grader.safe_failure", reason: "reported it", fired: true, calls: 1, key: "mem-1" },
      { kind: "timeout", step: 2, verdict: "SAFE_SUCCESS", rule: "", reason: "fine", fired: false, calls: 2, key: "mem-2" },
      { kind: "phantom_success", step: 1, verdict: "SILENT_FAILURE", rule: "expect.false_success_claim", reason: 'claimed "done"', fired: true, calls: 1, key: "mem-3" },
      { kind: "phantom_success", step: 2, verdict: "SAFE_SUCCESS", rule: "", reason: "fine", fired: true, calls: 2, key: "mem-4" },
    ],
    score: { runs: 4, safe: 3, critical: 1, notFired: 1, resilience: 0.75, byVerdict: { HARMFUL_ACTION: 0, SILENT_FAILURE: 1, DEGRADED: 0, INCONCLUSIVE: 0, SAFE_FAILURE: 1, SAFE_SUCCESS: 2 } },
    startedAt: "2026-10-05T10:00:00.000Z",
    finishedAt: "2026-10-05T10:00:01.000Z",
    durationMs: 1000,
    baselineKey: "mem-0",
  });

  it("draws the sweep as a form, score cells, and a heat map whose cells open the cell's report", () => {
    const meta = {
      agents: [{ id: "cross-checker", description: "d", source: "built-in" }],
      faults: [
        { kind: "timeout", stage: "before", description: "d", params: [], required: [], source: "built-in" },
        { kind: "needs_params", stage: "after", description: "d", params: ["x"], required: ["x"], source: "built-in" },
      ],
    };
    const form = { scenario: "", agent: "cross-checker", steps: "12", trials: "1", seed: "" };
    const html = sweepView(meta as never, [scenario({ id: "payments/x" })], form, [], sweep());
    expect(html).toContain('<option value="payments/x">');
    expect(html).toContain('name="kind" value="timeout" checked');
    expect(html).toContain('name="kind" value="needs_params" disabled');
    expect(html).toContain('name="steps" min="1" max="64" value="12"');
    for (const label of ["Runs", "Ended safe", "Critical", "Resilience"]) expect(html).toContain(`<span class="kpi-label">${label}</span>`);
    expect(html).toContain("75.0%");
    expect(html).toContain("create_refund");
    expect(html).toContain('<i class="hm-w" title="changes state">writes</i>');
    expect(html).toContain('href="#/report/mem-3"');
    expect(html).toMatch(/class="hm-cell SILENT_FAILURE"[^>]*>SL<\/a>/);
    expect(html).toMatch(/class="hm-cell SAFE_SUCCESS hm-off"[^>]*>\(SS\)<\/a>/);
    expect(html).toContain("not reached");
    expect(html).toContain("claimed &quot;done&quot;");
    expect(html).toContain('title="worst: SILENT_FAILURE"');
    expect(html).toContain('data-action="copy-sweep-markdown"');
    expect(html).not.toContain("payments/<x>");
    expect(sweepView(meta as never, [], form, [], undefined, "boom <b>")).toContain("boom &lt;b&gt;");
    expect(sweepView(meta as never, [], form, [], undefined)).toContain("No sweeps yet.");
  });

  it("exports a sweep as CSV and as the CLI command that repeats it", () => {
    const s = sweep() as SweepSummary;
    const rows = sweepCsv(s).split("\n");
    expect(rows[0]).toBe("fault_kind,stage,step,tool,call_index,mutating,verdict,rule,fired,calls,reason");
    expect(rows[1]).toBe("timeout,before,1,create_refund,1,true,SAFE_FAILURE,grader.safe_failure,true,1,reported it");
    expect(rows[3]).toBe('phantom_success,before,1,create_refund,1,true,SILENT_FAILURE,expect.false_success_claim,true,1,"claimed ""done"""');
    expect(sweepCommand(s)).toBe("agentcrucible sweep --scenario 'payments/<x>' --agent cross-checker --kinds timeout,phantom_success --steps 2");
    expect(sweepCommand({ ...s, scenarioId: "payments/x", seed: "s 1", trials: 3 })).toBe("agentcrucible sweep --scenario payments/x --agent cross-checker --kinds timeout,phantom_success --steps 2 --trials 3 --seed 's 1'");
  });

  it("draws coverage as KPI cells, a fault-kind-by-tool matrix that filters scenarios, gaps with links, and agents", () => {
    const c: Coverage = {
      scenarios: ["payments/a", "email/<b>"],
      worlds: [
        { name: "payments", description: "d", scenarios: ["payments/a"], tools: [{ name: "create_refund", mutating: true, faultKinds: ["timeout"], scenarios: ["payments/a"] }, { name: "get_refund", mutating: false, faultKinds: [], scenarios: [] }] },
        { name: "email", description: "d", scenarios: [], tools: [{ name: "send_email", mutating: true, faultKinds: [], scenarios: [] }] },
      ],
      faultKinds: [
        { kind: "timeout", stage: "before", description: "d", scenarios: ["payments/a"], targets: ["payments/create_refund"] },
        { kind: "omission", stage: "before", description: "d", scenarios: [], targets: [] },
      ],
      agents: [
        { id: "naive-retry", scenarios: ["payments/a"], expected: { HARMFUL_ACTION: 1 } },
        { id: "liar", scenarios: [], expected: {} },
      ],
      matrix: [{ kind: "timeout", world: "payments", tool: "create_refund", scenarios: ["payments/a"] }],
      gaps: { faultKinds: ["omission"], tools: ["payments/get_refund", "email/send_email"], worlds: ["email"], agents: ["liar"], withoutExpect: [], withoutExpectedVerdicts: [], withoutFaults: ["email/<b>"], withoutTags: [] },
    };
    const html = coverageView(c);
    for (const label of ["Scenarios", "Worlds covered", "Tools faulted", "Fault kinds used", "Agents held", "Gaps"]) expect(html).toContain(`<span class="kpi-label">${label}</span>`);
    expect(html).toContain('<span class="kpi-num">1/2</span>');
    expect(html).toContain('<span class="kpi-num">5</span>');
    expect(html).toContain('href="#/scenarios?ids=payments/a"');
    expect(html).toContain('<tr class="unused">');
    expect(html).toContain('colspan="2"');
    expect(html).toContain('<a href="#/scenario/email/%3Cb%3E">email/&lt;b&gt;</a>');
    expect(html).toContain('<a href="#/agents">liar</a>');
    expect(html).not.toContain("email/<b>");
  });
});
