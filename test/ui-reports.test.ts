import { describe, expect, it } from "vitest";
import { esc } from "../src/html.js";
import type { Comparison, ReportSummary, RunRecord } from "../src/ui/api.js";
import { clip, href } from "../src/ui/client/lib/format.js";
import { activeFilters, deletableKey, filterResults, filtersHref, NO_FILTERS, needsAttention, parseFilters, resultList, resultsCsv, verdictCounts, type ResultRow } from "../src/ui/client/lib/results.js";
import { changeRows, comparisonPanel, gateBanner } from "../src/ui/client/pages/baseline.js";
import { diffSnapshot, filterCalls, regenerationCallout, replayPanel, reproduceCommands, timelineHref } from "../src/ui/client/pages/report.js";
import { emptyList, sourceTag } from "../src/ui/client/pages/reports.js";
import { canDelete, canSave, gateOf, newFailures, sourceKind } from "../src/ui/client/ui/results.js";
import type { ToolCallRecord } from "../src/types.js";

const summary = (over: Partial<ReportSummary>): ReportSummary => ({ key: "mem-1", scenarioId: "payments/x", agentId: "naive-retry", verdict: "HARMFUL_ACTION", reason: "two refunds", rule: "expect.duplicate_effect", rules: ["expect.duplicate_effect"], trials: 1, seed: "s", finishedAt: "2026-10-04T10:00:00.000Z", ...over });
const run = (over: Partial<RunRecord>): RunRecord => ({ runId: "run-1", startedAt: "2026-10-04T09:00:00.000Z", scenarios: ["payments/x"], agents: null, trials: 1, seed: null, draft: false, results: [], ...over });
const rows = (list: ReportSummary[]): ResultRow[] => resultList([], list, []).rows;

describe("Reports list", () => {
  it("escapes values and keeps ids readable in links", () => {
    expect(esc(`<a href="x">'&`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
    expect(href("report", "hist:run-58:4")).toBe("#/report/hist:run-58:4");
    expect(href("report", "file:a b#c")).not.toContain("#c");
    expect(timelineHref("hist:run-1:0", 2, "call_3")).toBe("#/report/hist:run-1:0?tab=timeline&trial=2&call=call_3");
    const html = sourceTag({ source: "saved", file: `<img src=x>` });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("filters reports and explains an empty list", () => {
    const list = rows([summary({}), summary({ key: "file:a", file: "a", verdict: "SAFE_SUCCESS", agentId: "cross-checker", seed: "t", rules: ["grader.verified_success"], rule: "grader.verified_success" })]);
    expect(filterResults(list, { ...NO_FILTERS, q: "cross" }).map((r) => r.key)).toEqual(["file:a"]);
    expect(filterResults(list, { ...NO_FILTERS, verdict: "HARMFUL_ACTION" }).map((r) => r.key)).toEqual(["mem-1"]);
    expect(filterResults(list, { ...NO_FILTERS, verdict: "critical" }).map((r) => r.key)).toEqual(["mem-1"]);
    expect(filterResults(list, { ...NO_FILTERS, rule: "grader.verified_success", source: "saved" }).map((r) => r.key)).toEqual(["file:a"]);
    expect(filterResults(list, { ...NO_FILTERS, q: "duplicate nothing" })).toEqual([]);
    expect(emptyList(2, { ...NO_FILTERS, q: "nothing" })).toContain("No report matches");
    expect(emptyList(2, { ...NO_FILTERS, q: "nothing" })).toContain("Clear the filters");
    expect(emptyList(0, NO_FILTERS)).toContain("No reports yet");
    expect(emptyList(0, NO_FILTERS)).toContain("Guided demo");
  });

  it("reads the filters a link names and writes them back", () => {
    const f = parseFilters(new URLSearchParams("verdict=critical&unexpected=1&flaky=1&rule=a.b&agent=x&scenario=payments/y&source=saved&q=hello"));
    expect(f).toEqual({ q: "hello", verdict: "critical", unexpected: true, flaky: true, rule: "a.b", agent: "x", scenario: "payments/y", source: "saved" });
    expect(activeFilters(f)).toBe(8);
    expect(parseFilters(new URLSearchParams(filtersHref(f).split("?")[1]))).toEqual(f);
    expect(parseFilters(new URLSearchParams("verdict=NOPE&source=elsewhere"))).toEqual(NO_FILTERS);
    expect(filtersHref(NO_FILTERS)).toBe("#/reports");
  });

  it("marks results that differ from the scenario's expected verdicts", () => {
    const list = rows([summary({ expected: "HARMFUL_ACTION" }), summary({ key: "mem-2", seed: "u", agentId: "liar", verdict: "SAFE_SUCCESS", expected: "SILENT_FAILURE" }), summary({ key: "mem-3", seed: "v", trials: 3, byVerdict: { SAFE_SUCCESS: 2, DEGRADED: 1 }, verdict: "DEGRADED" })]);
    expect(list.map((r) => [r.key, r.unexpected, r.flaky])).toEqual([
      ["mem-1", false, false],
      ["mem-2", true, false],
      ["mem-3", false, true],
    ]);
    expect(filterResults(list, { ...NO_FILTERS, unexpected: true }).map((r) => r.key)).toEqual(["mem-2"]);
    expect(filterResults(list, { ...NO_FILTERS, flaky: true }).map((r) => r.key)).toEqual(["mem-3"]);
    expect(verdictCounts(list)).toMatchObject({ critical: 1, HARMFUL_ACTION: 1, SAFE_SUCCESS: 1, DEGRADED: 1 });
  });

  it("counts a saved copy of a session result once and keeps unreadable files apart", () => {
    const first = summary({});
    const copy = summary({ key: "file:naive-retry/x.report.json", file: "naive-retry/x.report.json" });
    const inRun = summary({ key: "hist:run-1:0", seed: "other" });
    const out = resultList([run({ results: [inRun] })], [first], [copy, { key: "file:bad", file: "bad.report.json", error: "not a <report>" }]);
    expect(out.rows.map((r) => r.key)).toEqual(["hist:run-1:0", "mem-1"]);
    const saved = out.rows[1];
    expect(saved.file).toBe("naive-retry/x.report.json");
    expect(deletableKey(saved)).toBe("file:naive-retry/x.report.json");
    expect(deletableKey(out.rows[0])).toBeUndefined();
    expect(out.rows[0].run).toEqual({ runId: "run-1" });
    expect(out.unreadable.map((r) => r.error)).toEqual(["not a <report>"]);
    expect(resultsCsv(out.rows).split("\n")[0]).toContain("scenario,agent,verdict");
  });

  it("lists results that differ from the expected verdict or that are HARMFUL_ACTION or SILENT_FAILURE, differences first", () => {
    const list = rows([
      summary({ key: "a", seed: "1", expected: "HARMFUL_ACTION" }),
      summary({ key: "b", seed: "2", agentId: "cross-checker", verdict: "SAFE_SUCCESS", expected: "SAFE_SUCCESS" }),
      summary({ key: "c", seed: "3", agentId: "cross-checker", verdict: "DEGRADED", expected: "SAFE_SUCCESS" }),
      summary({ key: "d", seed: "4", agentId: "liar", verdict: "SILENT_FAILURE" }),
      summary({ key: "e", seed: "5", agentId: "honest-stop", verdict: "DEGRADED" }),
    ]);
    expect(needsAttention(list).map((r) => r.key)).toEqual(["c", "a", "d"]);
  });

  it("clips long reasons at a word boundary", () => {
    expect(clip("short", 10)).toBe("short");
    expect(clip("one two three four", 10)).toBe("one two…");
    expect(clip("abcdefghijklmnop", 10)).toBe("abcdefghij…");
  });

  it("says where each result lives and what can be saved or deleted", () => {
    expect(sourceKind("file:a")).toBe("saved");
    expect(sourceKind("mem-3")).toBe("session");
    expect(sourceKind("hist:run-1:0")).toBe("history");
    expect(sourceKind("sweep:s:base")).toBe("sweep");
    expect([canSave("mem-1"), canSave("hist:run-1:0"), canSave("file:a")]).toEqual([true, true, false]);
    expect([canDelete("file:a"), canDelete("mem-1"), canDelete("hist:run-1:0")]).toEqual([true, true, false]);
  });
});

describe("Baseline", () => {
  const change = { scenario: "s", agent: "a", rulesAdded: [], rulesRemoved: [] };
  const comparison: Comparison = {
    regressions: [{ ...change, before: "SAFE_SUCCESS", after: "HARMFUL_ACTION" }],
    improvements: [],
    changed: [{ ...change, scenario: "r", before: "DEGRADED", after: "DEGRADED", rulesAdded: ["<x>"], rulesRemoved: ["y"] }],
    unchanged: 3,
    added: [
      { scenario: "n", agent: "a", seed: "s", trials: 1, verdict: "SILENT_FAILURE", byVerdict: {}, rules: [] },
      { scenario: "m", agent: "a", seed: "s", trials: 1, verdict: "DEGRADED", byVerdict: {}, rules: [] },
    ],
    notRun: [],
    incomparable: [],
  };

  it("counts regressions and new failures at the fail-on threshold", () => {
    expect(newFailures(comparison, "SILENT_FAILURE").map((e) => e.scenario)).toEqual(["n"]);
    expect(newFailures(comparison, "DEGRADED").map((e) => e.scenario)).toEqual(["n", "m"]);
    const gate = gateOf(comparison, "SILENT_FAILURE");
    expect(gate).toMatchObject({ state: "failing", regressions: 1, newFailures: 1, title: "Gate failing: 1 regression and 1 new failure" });
    const html = comparisonPanel(comparison, "SILENT_FAILURE");
    expect(html).toContain("Gate failing: 1 regression and 1 new failure");
    expect(html).toContain("CI exits <code>2</code>");
    expect(html).toContain('<span class="pill bad">new failure</span>');
    expect(html).toContain('<span class="pill ">new</span>');
    expect(html).toContain("&lt;x&gt;");
    expect(html).not.toContain("<x>");
    expect(changeRows(comparison, "SILENT_FAILURE").map((r) => r.kind)).toEqual(["regression", "new failure", "rules changed", "new"]);
  });

  it("passes a comparison without regressions and stops on results that cannot be compared", () => {
    const calm: Comparison = { ...comparison, regressions: [], added: [], changed: [], unchanged: 5 };
    expect(gateOf(calm, "SILENT_FAILURE").title).toBe("Gate passing");
    expect(gateBanner(gateOf(calm, "SILENT_FAILURE"), "SILENT_FAILURE")).toContain("CI exits <code>0</code>");
    const other: Comparison = { ...calm, incomparable: [{ scenario: "s", agent: "a", detail: "seed differs" }] };
    expect(gateOf(other, "SILENT_FAILURE").state).toBe("incomparable");
    expect(gateBanner(gateOf(other, "SILENT_FAILURE"), "SILENT_FAILURE")).toContain("CI exits <code>1</code>");
  });
});

describe("Report explorer", () => {
  it("shows an honest callout when a regenerated report differs from the recorded one", () => {
    const old = { runId: "run-3", label: "<Nightly>", version: "1.1", startedAt: "2026-09-01T10:00:00.000Z" };
    const differs = regenerationCallout({ matches: false, scenarioChanged: false, recordedVerdict: "HARMFUL_ACTION" }, { verdict: "SAFE_SUCCESS", run: old });
    expect(differs).toContain("callout warn");
    expect(differs).toContain("HARMFUL_ACTION");
    expect(differs).toContain("regenerating runs today's agent");
    expect(differs).toContain("&lt;Nightly&gt;");
    const same = regenerationCallout({ matches: true, scenarioChanged: true }, { verdict: "SAFE_SUCCESS", run: old });
    expect(same).toContain("callout info");
    expect(same).toContain("scenario file changed");
  });

  it("shows replay results line by line", () => {
    const html = replayPanel({ reproduced: false, trials: [{ trialIndex: 0, replayedCalls: 1, reproduced: false, recordedVerdict: "SAFE_SUCCESS", verdict: "SAFE_SUCCESS", divergence: { at: "call_2", field: "observed", recorded: 1, replayed: 2 } }] });
    expect(html).toContain("trial 0: diverged at call_2 (observed)");
    expect(html).toContain("callout bad");
  });

  const call = (over: Partial<ToolCallRecord>): ToolCallRecord => ({ id: "call_1", tool: "create_refund", mutating: true, args: { order: "4410" }, callIndex: 1, seq: 1, observed: { ok: true, result: { id: "re_1" } }, committed: true, changes: ["+ refund re_1"], worldSnapshotAfter: {}, ...over });

  it("filters calls to the faulted, failed, or cited ones and searches their text", () => {
    const calls = [call({}), call({ id: "call_2", seq: 2, tool: "send_email", mutating: true, faultApplied: "timeout_after_commit", observed: { ok: false, error: "timed out", code: "ETIMEDOUT" } }), call({ id: "call_3", seq: 3, tool: "get_balance", mutating: false })];
    const cited = new Set(["call_3"]);
    expect(filterCalls(calls, cited, "all", "").length).toBe(3);
    expect(filterCalls(calls, cited, "faulted", "").map((c) => c.id)).toEqual(["call_2"]);
    expect(filterCalls(calls, cited, "failed", "").map((c) => c.id)).toEqual(["call_2"]);
    expect(filterCalls(calls, cited, "cited", "").map((c) => c.id)).toEqual(["call_3"]);
    expect(filterCalls(calls, cited, "all", "etimedout").map((c) => c.id)).toEqual(["call_2"]);
    expect(filterCalls(calls, cited, "all", "4410").length).toBe(3);
  });

  it("diffs world snapshots by record id and marks what was added, changed, and removed", () => {
    const before = { payments: { refunds: [{ id: "re_1", amount: 5 }], balance: { cents: 100 } } };
    const after = { payments: { refunds: [{ id: "re_1", amount: 7 }, { id: "re_2", amount: 5 }], balance: { cents: 100 } } };
    const diff = diffSnapshot(before, after);
    const refunds = diff.find((c) => c.path.join("/") === "payments/refunds")!;
    expect(refunds.records.map((r) => [r.id, r.change])).toEqual([
      ["re_1", "changed"],
      ["re_2", "added"],
    ]);
    expect(refunds.records[0].fields).toEqual(["amount"]);
    expect(diffSnapshot(after, before).find((c) => c.path.join("/") === "payments/refunds")!.records.map((r) => r.change)).toContain("removed");
  });

  it("builds the commands that reproduce a report", () => {
    const report = { scenarioId: "payments/x", agentId: "naive-retry", seed: "s 1", stats: { total: 3 } } as never;
    expect(reproduceCommands(report)).toEqual(["npx agentcrucible run --scenario payments/x --agents naive-retry --trials 3 --seed 's 1'"]);
    expect(reproduceCommands(report, "reports/a.report.json")[1]).toBe("npx agentcrucible replay reports/a.report.json");
  });
});
