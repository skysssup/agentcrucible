import { describe, expect, it } from "vitest";
import { esc, highlightJson } from "../src/html.js";
import type { ReportSummary, RunRecord } from "../src/ui/api.js";
import { agentRows, dailySeries, faultImpact, inRange, insights, isFlaky, latest, observations, summarize, topRules, versionRows } from "../src/ui/client/lib/analytics.js";
import { clip, csv, duration, href, initials, plural, relTime, scenariosHref, withQuery } from "../src/ui/client/lib/format.js";
import { highlight, rank } from "../src/ui/client/lib/search.js";
import { errorLine, highlightYaml } from "../src/ui/client/lib/yaml.js";
import { sparkline, donut, barList, rateColors } from "../src/ui/client/ui/charts.js";
import { emptyState, kpi, pageHead, panel } from "../src/ui/client/ui/layout.js";
import { button, delta, segmented } from "../src/ui/client/ui/primitives.js";
import { arrange, by, dataTable, tableState } from "../src/ui/client/ui/table.js";
import { badge, rateMeter, tally, verdictBar } from "../src/ui/client/ui/verdicts.js";

const result = (over: Partial<ReportSummary>): ReportSummary => ({
  key: "mem-1",
  scenarioId: "payments/x",
  agentId: "naive-retry",
  verdict: "HARMFUL_ACTION",
  reason: "two refunds",
  rule: "expect.duplicate_effect",
  rules: ["expect.duplicate_effect"],
  trials: 1,
  seed: "s",
  finishedAt: "2026-10-04T10:00:00.000Z",
  faultKinds: ["timeout_after_commit"],
  ...over,
});

const run = (over: Partial<RunRecord>): RunRecord => ({ runId: "run-1", startedAt: "2026-10-04T10:00:00.000Z", scenarios: ["payments/x"], agents: null, trials: 1, seed: null, draft: false, results: [], ...over });

describe("format", () => {
  it("escapes values and keeps ids readable in links", () => {
    expect(esc(`<a href="x">'&`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
    expect(esc(undefined)).toBe("");
    expect(href("scenario", "payments/timeout-after-commit")).toBe("#/scenario/payments/timeout-after-commit");
    expect(href("report", "file:naive-retry/payments%2Fx.report.json")).toBe("#/report/file:naive-retry/payments%252Fx.report.json");
    expect(decodeURIComponent(href("report", "file:a b#c").slice("#/report/".length))).toBe("file:a b#c");
    expect(scenariosHref(["payments/a", "email/c"])).toBe("#/scenarios?ids=payments/a,email/c");
    expect(withQuery("#/reports", { verdict: "HARMFUL_ACTION", q: "", page: 2 })).toBe("#/reports?verdict=HARMFUL_ACTION&page=2");
  });

  it("clips at a word boundary, pluralizes, and formats durations, initials, and relative times", () => {
    expect(clip("short", 10)).toBe("short");
    expect(clip("one two three four", 10)).toBe("one two…");
    expect(clip("abcdefghijklmnop", 10)).toBe("abcdefghij…");
    expect(plural(1, "run")).toBe("1 run");
    expect(plural(1200, "entry", "entries")).toBe("1,200 entries");
    expect(duration(420)).toBe("420 ms");
    expect(duration(3200)).toBe("3.2 s");
    expect(duration(252_000)).toBe("4 min 12 s");
    expect(initials("Maya Okafor")).toBe("MO");
    expect(initials("sky")).toBe("SK");
    const now = Date.parse("2026-10-05T12:00:00.000Z");
    expect(relTime("2026-10-05T11:59:40.000Z", now)).toBe("just now");
    expect(relTime("2026-10-05T09:00:00.000Z", now)).toBe("3 h ago");
    expect(relTime("2026-10-05T11:59:10.000Z", now)).toBe("1 min ago");
    expect(relTime("2026-10-05T11:00:10.000Z", now)).toBe("59 min ago");
    expect(relTime("2026-10-04T12:20:00.000Z", now)).toBe("23 h ago");
    expect(relTime("2026-10-04T09:00:00.000Z", now)).toBe("yesterday");
    expect(relTime("2026-10-01T12:00:00.000Z", now)).toBe("4 days ago");
    expect(relTime(undefined)).toBe("");
  });

  it("quotes CSV fields that need it", () => {
    expect(csv([["a", 'said "done", twice', 3], [null, "x\ny"]])).toBe('a,"said ""done"", twice",3\n,"x\ny"\n');
  });
});

describe("analytics", () => {
  const runs = [
    run({ runId: "run-2", startedAt: "2026-10-04T10:00:00.000Z", version: "2.0", label: "Nightly", results: [result({ key: "hist:run-2:0", verdict: "SAFE_SUCCESS", agentId: "support-agent", expected: "SAFE_SUCCESS", rule: "", rules: [] }), result({ key: "hist:run-2:1", scenarioId: "email/y", agentId: "support-agent", verdict: "SILENT_FAILURE", expected: "SAFE_FAILURE", rule: "expect.false_success_claim", rules: ["expect.false_success_claim"], trials: 3, byVerdict: { SILENT_FAILURE: 1, SAFE_FAILURE: 2 } })] }),
    run({ runId: "run-1", startedAt: "2026-09-25T10:00:00.000Z", version: "1.0", results: [result({ key: "hist:run-1:0", agentId: "support-agent", expected: "SAFE_SUCCESS", finishedAt: "2026-09-25T10:00:01.000Z" })] }),
  ];

  it("makes one observation per result, with its run, and counts a saved copy once", () => {
    const saved = [result({ key: "file:support-agent/x.report.json", file: "support-agent/x.report.json", agentId: "support-agent", verdict: "SAFE_SUCCESS", expected: "SAFE_SUCCESS", rule: "", rules: [] }), { key: "file:bad", file: "bad", error: "not a report" }];
    const obs = observations(runs, saved);
    expect(obs.map((o) => [o.key, o.runId, o.version])).toEqual([
      ["hist:run-2:0", "run-2", "2.0"],
      ["hist:run-2:1", "run-2", "2.0"],
      ["hist:run-1:0", "run-1", "1.0"],
    ]);
    expect(isFlaky(obs[1])).toBe(true);
  });

  it("summarizes safe, critical, unexpected, and flaky shares", () => {
    const s = summarize(observations(runs));
    expect(s).toMatchObject({ total: 3, safe: 1, critical: 2, graded: 3, unexpected: 2, flaky: 1, multiTrial: 1 });
    expect(s.safeRate).toBeCloseTo(1 / 3);
    expect(summarize([])).toMatchObject({ total: 0, safeRate: 0, unexpectedRate: 0 });
  });

  it("splits observations into a period and the one before, and buckets them by day", () => {
    const obs = observations(runs);
    const now = Date.parse("2026-10-05T12:00:00.000Z");
    const week = inRange(obs, "7d", now);
    expect(week.current.map((o) => o.runId)).toEqual(["run-2", "run-2"]);
    expect(week.previous.map((o) => o.runId)).toEqual(["run-1"]);
    const days = dailySeries(obs, 3, now);
    expect(days).toHaveLength(3);
    const oct4 = days.find((d) => d.day.endsWith("10-04"))!;
    expect(oct4).toMatchObject({ total: 2, safe: 1, critical: 1, unexpected: 1 });
    expect(days.find((d) => d.day.endsWith("10-05"))!.safeRate).toBeNull();
  });

  it("ranks agents, rules, fault kinds, and versions, and keeps the latest result of each pair", () => {
    const obs = observations(runs);
    expect(agentRows(obs).map((r) => [r.agent, r.summary.total])).toEqual([["support-agent", 3]]);
    expect(topRules(obs).map((r) => [r.rule, r.count])).toEqual([
      ["expect.false_success_claim", 1],
      ["expect.duplicate_effect", 1],
    ]);
    expect(faultImpact(obs)[0]).toMatchObject({ kind: "timeout_after_commit", total: 3, critical: 2 });
    expect(versionRows(obs, "support-agent").map((v) => [v.version, v.summary.total])).toEqual([
      ["1.0", 1],
      ["2.0", 2],
    ]);
    expect(latest(obs).map((o) => o.key).sort()).toEqual(["hist:run-2:0", "hist:run-2:1"]);
  });

  it("recommends looking at open unexpected verdicts first, with the reason", () => {
    const list = insights(observations(runs), { now: Date.parse("2026-10-05T12:00:00.000Z") });
    expect(list[0]).toMatchObject({ severity: "critical", title: "support-agent gets SILENT_FAILURE on email/y", link: "#/report/hist:run-2:1" });
    expect(list[0].detail).toContain("expects SAFE_FAILURE");
  });
});

describe("search", () => {
  const items = [
    { id: "a", scope: "scenarios" as const, label: "payments/timeout-after-commit", detail: "A lost response", keywords: "refund" },
    { id: "b", scope: "agents" as const, label: "cross-checker", detail: "validates responses" },
    { id: "c", scope: "scenarios" as const, label: "email/duplicate-send", keywords: "timeout" },
  ];

  it("needs every word to match and ranks label matches first", () => {
    expect(rank(items, "timeout").map((i) => i.id)).toEqual(["a", "c"]);
    expect(rank(items, "refund lost").map((i) => i.id)).toEqual(["a"]);
    expect(rank(items, "nothing")).toEqual([]);
    expect(rank(items, "", "agents").map((i) => i.id)).toEqual(["b"]);
  });

  it("marks matches without unescaping the label", () => {
    expect(highlight("<b>cross</b>", "cross")).toBe("&lt;b&gt;<mark>cross</mark>&lt;/b&gt;");
  });
});

describe("components", () => {
  it("escapes every value in buttons, headers, panels, and empty states", () => {
    expect(button("<x>", { href: '"q', icon: "play" })).toContain('href="&quot;q"');
    expect(button("<x>", { action: "go" })).toContain("<span>&lt;x&gt;</span>");
    expect(pageHead({ title: "<t>", desc: "safe" })).toContain("&lt;t&gt;");
    expect(panel({ title: "<p>" }, "body")).toContain("&lt;p&gt;");
    expect(emptyState({ title: "<e>", text: "t" })).toContain("&lt;e&gt;");
    expect(kpi({ label: "Safe", value: "<9>" })).toContain('<span class="kpi-num">&lt;9&gt;</span>');
  });

  it("shows deltas with a direction, and flips colors when up is bad", () => {
    expect(delta(12, { unit: "pts" })).toContain("delta up");
    expect(delta(-3, { unit: "%" })).toContain("3%");
    expect(delta(5, { inverse: true })).toContain("delta up inverse");
    expect(delta(0)).toContain("±0");
    expect(delta(null)).toBe("");
  });

  it("draws verdict bars, badges, rate meters, and segmented controls", () => {
    expect(tally([{ verdict: "SAFE_SUCCESS" }, { verdict: "HARMFUL_ACTION" }, { verdict: "SAFE_SUCCESS" }])).toEqual([
      ["HARMFUL_ACTION", 1],
      ["SAFE_SUCCESS", 2],
    ]);
    expect(verdictBar(tally([{ verdict: "DEGRADED" }]))).toContain('<span class="DEGRADED" style="flex:1">');
    expect(badge("SILENT_FAILURE")).toContain('class="badge SILENT_FAILURE"');
    expect(rateMeter(0.42)).toContain("42%");
    expect(rateMeter(null)).toContain("—");
    expect(segmented("range", "7d", [{ value: "7d", label: "7d" }, { value: "30d", label: "30d" }])).toContain('data-value="7d" aria-pressed="true"');
  });

  it("draws sparklines, donuts, bar lists, and rate colors from data", () => {
    expect(sparkline([0.1, null, 0.5, 0.9])).toContain("<path");
    expect(sparkline([null, null])).toContain("stroke-dasharray");
    expect(donut([["SAFE_SUCCESS", 3], ["HARMFUL_ACTION", 1]], { value: "75%", label: "safe" })).toContain("75%");
    const bars = barList([{ label: "x", value: 2, display: "2 · 50%" }, { label: "y", value: 1, display: "1" }]);
    expect(bars).toContain("width:100.0%");
    expect(bars).toContain("width:50.0%");
    expect(rateColors(0.9).fg).toBe("var(--ssucc-fg)");
    expect(rateColors(0.3).fg).toBe("var(--harm-fg)");
    expect(rateColors(null).bg).toBe("transparent");
  });

  it("sorts and pages table rows, and renders an empty state when there are none", () => {
    const columns = [{ id: "n", label: "N", sort: by.num((r: { n: number }) => r.n), render: (r: { n: number }) => String(r.n) }];
    const state = tableState("t-test", { sort: "n", dir: "asc", pageSize: 2 });
    const rows = [{ n: 3 }, { n: 1 }, { n: 2 }];
    expect(arrange(rows, columns, state)).toMatchObject({ shown: [{ n: 1 }, { n: 2 }], pages: 2 });
    state.page = 2;
    expect(arrange(rows, columns, state).shown).toEqual([{ n: 3 }]);
    const html = dataTable({ id: "t-test", columns, rows, state, empty: "none" });
    expect(html).toContain('data-action="dt-sort"');
    expect(html).toContain("Showing");
    expect(dataTable({ id: "t-empty", columns, rows: [], state: tableState("t-empty"), empty: "<p>nothing here</p>" })).toContain("nothing here");
  });
});

describe("highlighting", () => {
  it("highlights YAML and JSON without changing or unescaping their text", () => {
    const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
    for (const yaml of ['task: "<script>x</script>" # note\nlist: [a, "b: c", 3]\ndescription: >\n  one #two\n  three\nnext: true', "id: custom/x\nworld: payments\nfaults:\n  - { target: create_refund, kind: timeout, on_call: 1 }"]) {
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
});
