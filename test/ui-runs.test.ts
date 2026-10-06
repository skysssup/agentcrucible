import { beforeEach, describe, expect, it } from "vitest";
import type { SweepSummary } from "../src/sweep.js";
import type { ReportSummary, RunRecord, ScenarioSummary, SweepListItem, SweepResponse } from "../src/ui/api.js";
import { store } from "../src/ui/client/lib/state.js";
import { actorColor, diffCounts, diffCsv, filterRuns, filterSweeps, launchCommands, matrixAxes, periodNumbers, plannedPairs, previousRun, resultCounts, runCommands, runCsv, runDiff, runJson, runMarkdown, runPeriods, runStatus, runsCsv, sweepCommand, sweepCsv, sweepRequestCommand } from "../src/ui/client/lib/runs.js";
import { lanes } from "../src/ui/client/pages/demo.js";
import { launchForm } from "../src/ui/client/pages/launch.js";
import { runCompare, runDetail } from "../src/ui/client/pages/run.js";
import { sweepDetail, sweepForm, sweepJob, sweepList } from "../src/ui/client/pages/sweep.js";
import { liveMatrix, runMatrix, trialStrip } from "../src/ui/client/ui/run-view.js";

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

const run = (over: Partial<RunRecord>): RunRecord => ({ runId: "run-1", startedAt: "2026-10-04T10:00:00.000Z", scenarios: ["payments/x"], agents: null, trials: 1, seed: null, draft: false, results: [], ...over });

const meta = {
  agents: [
    { id: "cross-checker", description: "d", source: "built-in" },
    { id: "naive-retry", description: "retries <blindly>", source: "built-in" },
  ],
  faults: [
    { kind: "timeout", stage: "before", description: "d", params: [], required: [], source: "built-in" },
    { kind: "needs_params", stage: "after", description: "d", params: ["x"], required: ["x"], source: "built-in" },
  ],
  demo: { scenario: "payments/timeout-after-commit", seed: "demo" },
  failOn: "SILENT_FAILURE",
  baselinePath: "baseline.json",
};

beforeEach(() => {
  store.meta = meta as never;
  store.scenarios = [scenario({ id: "payments/x" })];
  store.runs = [];
  store.sweeps = [];
});

describe("run helpers", () => {
  it("names a run's status from expected_verdicts, and counts results", () => {
    expect(runStatus({ draft: false, results: [report({ expected: "HARMFUL_ACTION" })] }).kind).toBe("expected");
    expect(runStatus({ draft: false, results: [report({ expected: "SAFE_SUCCESS" })] })).toMatchObject({ kind: "unexpected", unexpected: 1, label: "1 unexpected" });
    expect(runStatus({ draft: true, results: [report({})] }).kind).toBe("draft");
    expect(runStatus({ draft: false, results: [report({})] }).kind).toBe("ungraded");
    const counts = resultCounts([report({ expected: "SAFE_SUCCESS" }), report({ key: "b", verdict: "SAFE_SUCCESS", trials: 3, byVerdict: { SAFE_SUCCESS: 2, DEGRADED: 1 } })]);
    expect(counts).toMatchObject({ total: 2, safe: 1, critical: 1, flaky: 1, multiTrial: 1, graded: 1, unexpected: 1 });
  });

  it("filters runs by search, status, agent, version, and day", () => {
    const runs = [
      run({ runId: "run-1", label: "Nightly", version: "2.0", agents: ["naive-retry"], results: [report({ expected: "SAFE_SUCCESS" })] }),
      run({ runId: "run-2", startedAt: "2026-10-05T10:00:00.000Z", agents: ["liar"], results: [report({ agentId: "liar", expected: "HARMFUL_ACTION" })] }),
    ];
    const none = { q: "", status: "all" as const, agents: [], versions: [] };
    expect(filterRuns(runs, none)).toHaveLength(2);
    expect(filterRuns(runs, { ...none, q: "NIGHT" }).map((r) => r.runId)).toEqual(["run-1"]);
    expect(filterRuns(runs, { ...none, status: "unexpected" }).map((r) => r.runId)).toEqual(["run-1"]);
    expect(filterRuns(runs, { ...none, status: "expected" }).map((r) => r.runId)).toEqual(["run-2"]);
    expect(filterRuns(runs, { ...none, agents: ["liar"] }).map((r) => r.runId)).toEqual(["run-2"]);
    expect(filterRuns(runs, { ...none, versions: ["(none)"] }).map((r) => r.runId)).toEqual(["run-2"]);
    expect(filterRuns(runs, { ...none, day: "2026-10-05" }).map((r) => r.runId)).toEqual(["run-2"]);
    expect(filterRuns(runs, { ...none, q: "zzz" })).toEqual([]);
  });

  it("splits the last days from the days before and sums a period", () => {
    const now = Date.parse("2026-10-06T00:00:00.000Z");
    const runs = [run({ runId: "a", startedAt: "2026-10-05T00:00:00.000Z", durationMs: 100, results: [report({ expected: "SAFE_SUCCESS" })] }), run({ runId: "b", startedAt: "2026-09-27T00:00:00.000Z" })];
    const { current, previous } = runPeriods(runs, 7, now);
    expect(current.map((r) => r.runId)).toEqual(["a"]);
    expect(previous.map((r) => r.runId)).toEqual(["b"]);
    expect(periodNumbers(current)).toMatchObject({ runs: 1, graded: 1, unexpected: 1, asExpected: 0, medianMs: 100 });
    expect(periodNumbers([]).asExpected).toBeNull();
  });

  it("diffs two runs: regressions first, then improvements, splits, and pairs in only one run", () => {
    const before = run({ results: [report({ scenarioId: "a", verdict: "SAFE_SUCCESS" }), report({ scenarioId: "b", verdict: "HARMFUL_ACTION" }), report({ scenarioId: "c", verdict: "SAFE_SUCCESS", trials: 2, byVerdict: { SAFE_SUCCESS: 2 } }), report({ scenarioId: "gone", verdict: "DEGRADED" }), report({ scenarioId: "same", verdict: "DEGRADED" })] });
    const after = run({ results: [report({ scenarioId: "a", verdict: "HARMFUL_ACTION" }), report({ scenarioId: "b", verdict: "SAFE_SUCCESS" }), report({ scenarioId: "c", verdict: "SAFE_SUCCESS", trials: 2, byVerdict: { SAFE_SUCCESS: 1, SAFE_FAILURE: 1 } }), report({ scenarioId: "new", verdict: "DEGRADED" }), report({ scenarioId: "same", verdict: "DEGRADED" })] });
    const rows = runDiff(after, before);
    expect(rows.map((r) => `${r.scenarioId}:${r.change}`)).toEqual(["a:regression", "b:improvement", "c:split", "new:added", "gone:removed", "same:same"]);
    expect(diffCounts(rows)).toMatchObject({ regression: 1, improvement: 1, split: 1, added: 1, removed: 1, same: 1 });
    expect(diffCsv(rows).split("\n")[1]).toBe("a,naive-retry,regression,SAFE_SUCCESS,HARMFUL_ACTION,,");
  });

  it("finds the earlier run that shares the most scenarios", () => {
    const runs = [run({ runId: "r1", startedAt: "2026-10-01T00:00:00.000Z", scenarios: ["a"] }), run({ runId: "r2", startedAt: "2026-10-02T00:00:00.000Z", scenarios: ["a", "b"] }), run({ runId: "r3", startedAt: "2026-10-03T00:00:00.000Z", scenarios: ["a", "b"] })];
    expect(previousRun(runs[2], runs)?.runId).toBe("r2");
    expect(previousRun(runs[0], runs)).toBeUndefined();
  });

  it("exports a run's matrix as Markdown, CSV, and the commands that run it again", () => {
    const r = run({
      runId: "run-3",
      trials: 2,
      seed: "it's",
      results: [report({ expected: "HARMFUL_ACTION" }), report({ key: "mem-2", agentId: "liar", verdict: "SAFE_SUCCESS", expected: "SILENT_FAILURE", reason: 'said "done", twice' }), report({ key: "mem-3", scenarioId: "email/y", verdict: "DEGRADED" })],
    });
    expect(runMarkdown(r)).toBe("| Scenario | naive-retry | liar |\n| --- | --- | --- |\n| payments/x | HARMFUL_ACTION | SAFE_SUCCESS (expected SILENT_FAILURE) |\n| email/y | DEGRADED | not run |\n");
    const rows = runCsv(r).split("\n");
    expect(rows[0]).toBe("scenario,agent,verdict,expected,as_expected,trials,seed,rule,reason");
    expect(rows[2]).toBe('payments/x,liar,SAFE_SUCCESS,SILENT_FAILURE,false,1,,expect.duplicate_effect,"said ""done"", twice"');
    expect(rows[3]).toBe("email/y,naive-retry,DEGRADED,,,1,,expect.duplicate_effect,two refunds");
    expect(runCommands(r)).toEqual(["npx agentcrucible run --scenario payments/x --agents naive-retry,liar --trials 2 --seed 'it'\\''s'", "npx agentcrucible run --scenario email/y --agents naive-retry --trials 2 --seed 'it'\\''s'"]);
    const json = JSON.parse(runJson(r));
    expect(json.summary).toMatchObject({ results: 3, graded: 2, unexpected: 1 });
    expect(runsCsv([r]).split("\n")[0]).toContain("run,label,version");
    expect(matrixAxes(r).agents).toEqual(["naive-retry", "liar"]);
  });

  it("writes the launcher's commands: one per scenario, or one for a whole tag, with a changed threshold", () => {
    const a = scenario({ id: "a", tags: ["smoke"], expectedVerdicts: { liar: "SILENT_FAILURE" } });
    const b = scenario({ id: "b", tags: ["smoke"], expectedVerdicts: {} });
    expect(launchCommands({ scenarios: [a], agents: null, trials: 3 }, [a, b])).toEqual(["npx agentcrucible run --scenario a --agents liar --trials 3"]);
    expect(launchCommands({ scenarios: [a, b], agents: null, trials: 1 }, [a, b])).toHaveLength(1);
    expect(launchCommands({ scenarios: [a, b], agents: ["liar"], trials: 2, seed: "s 1", failOn: "DEGRADED" }, [a, b])).toEqual(["npx agentcrucible run --tag smoke --agents liar --trials 2 --seed 's 1' --fail-on DEGRADED"]);
    expect(plannedPairs({ scenarios: [a, b], agents: ["x"] })).toHaveLength(2);
    expect(actorColor("Maya", { name: "Maya", color: "plum" })).toBe("plum");
  });
});

describe("run pages", () => {
  const trialRun = run({
    runId: "run-2",
    label: "trials <b>",
    startedAt: "2026-10-05T10:00:00.000Z",
    results: [report({ trials: 3, byVerdict: { HARMFUL_ACTION: 1, SAFE_SUCCESS: 2 }, expected: "HARMFUL_ACTION" }), report({ key: "mem-2", agentId: "liar", verdict: "SAFE_SUCCESS", trials: 3, byVerdict: { SAFE_SUCCESS: 3 }, expected: "SILENT_FAILURE" })],
  });

  it("shows each result's trials and filters the matrix to unexpected or flaky results", () => {
    store.runs = [trialRun];
    const html = runDetail(trialRun);
    expect(html).toContain("flaky, 3 trials");
    expect(html).toContain('data-tip="3 trials: 1 HARMFUL_ACTION, 2 SAFE_SUCCESS"');
    expect(html).toContain('data-unexpected="1" data-flaky="1"');
    expect(html).toContain('data-action="matrix-filter" data-value="unexpected"');
    expect(html).toContain('data-action="matrix-filter" data-value="flaky"');
    expect(html).toContain("1 of 2 unexpected");
    expect(html).toContain("1/1 as expected");
    expect(runMatrix(trialRun, { filter: "flaky", density: "detailed" })).toContain('data-filter="flaky" data-density="detailed"');
    expect(trialStrip(report({ trials: 1 }))).toBe("");
  });

  it("escapes the label, offers the commands, and marks runs from the history", () => {
    const archived = { ...trialRun, archived: true, seed: "demo" };
    store.runs = [archived];
    const html = runDetail(archived);
    expect(html).not.toContain("trials <b>");
    expect(html).toContain("trials &lt;b&gt;");
    expect(html).toContain("npx agentcrucible run --scenario payments/x");
    expect(html).toContain("This run comes from the workspace history");
    expect(runDetail({ ...trialRun, draft: true })).toContain("the command line cannot repeat it");
  });

  it("compares two runs by their changed verdicts and warns when the seeds differ", () => {
    const earlier = run({ runId: "run-1", seed: "a", results: [report({ verdict: "SAFE_SUCCESS" })] });
    const later = run({ runId: "run-2", seed: "b", startedAt: "2026-10-05T10:00:00.000Z", results: [report({ verdict: "HARMFUL_ACTION", key: "mem-9" })] });
    const html = runCompare(later, earlier);
    expect(html).toContain("Regressed");
    expect(html).toContain('href="#/report/mem-9"');
    expect(html).toContain("The runs are not directly comparable");
    expect(html).toContain('data-action="diff-swap"');
  });

  it("draws the live grid with finished, running, and waiting cells", () => {
    const pairs = [
      { scenarioId: "a", agentId: "x" },
      { scenarioId: "a", agentId: "y" },
    ];
    const html = liveMatrix(pairs, [report({ scenarioId: "a", agentId: "x", key: "mem-1", verdict: "SAFE_SUCCESS", expected: "SAFE_SUCCESS" })], true);
    expect(html).toContain('href="#/report/mem-1"');
    expect(html).toContain("lm-cell running");
    expect(liveMatrix(pairs, [], false)).toContain("lm-cell pending");
  });

  it("draws the launcher with a prefilled plan, the equivalent command, and a reason when it cannot start", () => {
    const html = launchForm();
    expect(html).toContain("payments/x");
    expect(html).toContain('data-action="launch-start"');
    expect(html).toContain("Choose at least one scenario.");
    store.scenarios = [];
    expect(launchForm()).toContain("No scenarios");
  });
});

describe("sweep pages", () => {
  const sweep = (): SweepResponse => ({
    sweepId: "sweep-3",
    scenarioId: "payments/<x>",
    agentId: "cross-checker",
    seed: "s",
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
    const form = sweepForm();
    expect(form).toContain('<option value="payments/x">');
    expect(form).toMatch(/value="timeout" checked/);
    expect(form).toMatch(/value="needs_params"[^>]*disabled/);
    expect(form).toContain('min="1" max="64" value="12"');
    const html = sweepDetail(sweep(), "sweep-3");
    for (const label of ["Runs", "Ended safe", "Critical", "Resilience", "Not reached"]) expect(html).toMatch(new RegExp(`kpi-label">(<svg[^>]*>.*?</svg>)?${label}</span>`));
    expect(html).toContain("75.0%");
    expect(html).toContain("create_refund");
    expect(html).toContain('<i class="hm-w" data-tip="changes state">writes</i>');
    expect(html).toContain('href="#/report/mem-3"');
    expect(html).toMatch(/class="hm-cell SILENT_FAILURE"[^>]*>SL<\/a>/);
    expect(html).toMatch(/class="hm-cell SAFE_SUCCESS hm-off"[^>]*>\(SS\)<\/a>/);
    expect(html).toContain("not reached");
    expect(html).toContain("claimed &quot;done&quot;");
    expect(html).toContain('data-tip="worst: SILENT_FAILURE"');
    expect(html).toMatch(/data-sweep="sweep-3" data-action="sweep-export"/);
    expect(html).not.toContain("payments/<x>");
  });

  it("lists past sweeps, and says so when there are none", () => {
    expect(sweepList()).toContain("No sweeps yet");
    const item: SweepListItem = { ...sweep(), cellCount: 4 } as never;
    store.sweeps = [item];
    const html = sweepList();
    expect(html).toContain('href="#/sweep/sweep-3"');
    expect(html).toContain("1 sweep");
    expect(filterSweeps(store.sweeps, { q: "CROSS", agents: [], outcome: "all" })).toHaveLength(1);
    expect(filterSweeps(store.sweeps, { q: "", agents: [], outcome: "clean" })).toHaveLength(0);
    expect(filterSweeps(store.sweeps, { q: "", agents: ["liar"], outcome: "all" })).toHaveLength(0);
  });

  it("follows a sweep in progress and shows a failure", () => {
    const job = { jobId: "job-4", kind: "sweep" as const, status: "running" as const, label: "Sweep a<b", detail: "d", total: 4, done: 1, startedAt: "2026-10-05T10:00:00.000Z", cells: [sweep().cells[0]] };
    const html = sweepJob(job);
    expect(html).toContain("Sweep a&lt;b");
    expect(html).toContain("hm-running");
    expect(sweepJob({ ...job, status: "failed", error: "boom <b>" })).toContain("boom &lt;b&gt;");
  });

  it("exports a sweep as CSV and as the CLI command that repeats it", () => {
    const s = sweep() as SweepSummary;
    const rows = sweepCsv(s).split("\n");
    expect(rows[0]).toBe("fault_kind,stage,step,tool,call_index,mutating,verdict,rule,fired,calls,reason");
    expect(rows[1]).toBe("timeout,before,1,create_refund,1,true,SAFE_FAILURE,grader.safe_failure,true,1,reported it");
    expect(rows[3]).toBe('phantom_success,before,1,create_refund,1,true,SILENT_FAILURE,expect.false_success_claim,true,1,"claimed ""done"""');
    expect(sweepCommand(s)).toBe("agentcrucible sweep --scenario 'payments/<x>' --agent cross-checker --kinds timeout,phantom_success --steps 2 --seed s");
    expect(sweepCommand({ ...s, scenarioId: "payments/x", seed: "sweep-payments/x" })).toBe("agentcrucible sweep --scenario payments/x --agent cross-checker --kinds timeout,phantom_success --steps 2");
    expect(sweepCommand({ ...s, scenarioId: "payments/x", seed: "s 1", trials: 3 })).toBe("agentcrucible sweep --scenario payments/x --agent cross-checker --kinds timeout,phantom_success --steps 2 --trials 3 --seed 's 1'");
    expect(sweepRequestCommand({ scenarioId: "a", agentId: "b", kinds: ["timeout"], steps: 4, trials: 1 })).toBe("agentcrucible sweep --scenario a --agent b --kinds timeout --steps 4");
  });
});

describe("guided demo", () => {
  it("lays out one waiting lane per expected agent and escapes what the registry says", () => {
    const s = scenario({ expectedVerdicts: { "naive-retry": "HARMFUL_ACTION", liar: "SILENT_FAILURE" } });
    const html = lanes(s);
    expect(html.match(/class="lane pending/g)).toHaveLength(2);
    expect(html).toContain("retries &lt;blindly&gt;");
    expect(html).toContain("Waiting for the demo to start");
  });
});
