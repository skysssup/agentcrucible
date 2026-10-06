import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import type { Coverage } from "../src/coverage.js";
import { esc, highlightJson } from "../src/html.js";
import { parseScenario } from "../src/scenarios.js";
import type { ReportSummary, ScenarioSummary } from "../src/ui/api.js";
import { argumentsLabel, sectionBody } from "../src/ui/client/pages/catalog.js";
import { coverageBody, gapGroups } from "../src/ui/client/pages/coverage.js";
import { draftFor, draftResults, locateError, outlineList, replayPanel, validationPanel } from "../src/ui/client/pages/editor.js";
import { scenarioList, filterScenarios } from "../src/ui/client/pages/scenarios.js";
import { faultSchedule } from "../src/ui/client/pages/scenario.js";
import { gapDraft, outline, snippetEdit, snippetLines, TEMPLATES, applyEdit } from "../src/ui/client/lib/draft.js";
import { href, scenariosHref } from "../src/ui/client/lib/format.js";
import { errorLine, highlightYaml } from "../src/ui/client/lib/yaml.js";
import { checksLabel, duplicateText, fixHref, scheduleLabel, stageDiagram, suggestKind } from "../src/ui/client/ui/scenario-kit.js";

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

const coverage = (): Coverage => ({
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
});

const plain = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

describe("Scenarios pages", () => {
  it.each(TEMPLATES.map((t) => [t.name, t.text]))("ships a %s template that parses as a scenario", (_name, text) => {
    expect(() => parseScenario(parseYaml(text), "template")).not.toThrow();
  });

  it("filters scenarios by text, tag, and world", () => {
    const all = [scenario({ id: "payments/a" }), scenario({ id: "email/b", worlds: ["email"], tags: ["email"], task: "Send the receipt" })];
    expect(filterScenarios(all, { q: "", tag: "", world: "" })).toHaveLength(2);
    expect(filterScenarios(all, { q: "RECEIPT", tag: "", world: "" }).map((s) => s.id)).toEqual(["email/b"]);
    expect(filterScenarios(all, { q: "", tag: "smoke", world: "" }).map((s) => s.id)).toEqual(["payments/a"]);
    expect(filterScenarios(all, { q: "", tag: "", world: "email" }).map((s) => s.id)).toEqual(["email/b"]);
    expect(filterScenarios(all, { q: "create_refund", tag: "", world: "" })).toHaveLength(2);
  });

  it("filters by source, fault kind, and the scenarios that need attention", () => {
    const all = [scenario({ id: "a", faultKinds: ["timeout"] }), scenario({ id: "b", bundled: false, faultKinds: ["omission"] })];
    expect(filterScenarios(all, { q: "", tag: "", world: "", source: "project" }).map((s) => s.id)).toEqual(["b"]);
    expect(filterScenarios(all, { q: "", tag: "", world: "", kinds: ["omission"] }).map((s) => s.id)).toEqual(["b"]);
    expect(filterScenarios(all, { q: "", tag: "", world: "", attention: new Set(["a"]) }).map((s) => s.id)).toEqual(["a"]);
  });

  it("escapes scenario text in the list and shows only the first sentence", () => {
    const html = scenarioList([scenario({ description: "<img src=x onerror=alert(1)>. More." })], new Set(["payments/x"]));
    expect(html).not.toContain("<img");
    const visible = /class="sub" data-tip="[^"]*">([^<]*)</.exec(html)![1];
    expect(visible).toBe("&lt;img src=x onerror=alert(1)&gt;.");
    expect(html).toMatch(/data-key="payments\/x"[^>]*checked/);
    expect(html).toContain("1 outcome, 1 answer check");
  });

  it("tells an empty library from a search with no match", () => {
    expect(scenarioList([], new Set())).toContain("No scenarios yet");
    const none = scenarioList([scenario({})], new Set(), new Map(), "zzz");
    expect(none).toContain("No scenario matches");
    expect(none).toContain("Clear filters");
  });

  it("lists only the scenarios a Coverage link names", () => {
    const all = [scenario({ id: "payments/a" }), scenario({ id: "payments/b" }), scenario({ id: "email/c" })];
    expect(filterScenarios(all, { q: "", tag: "", world: "", ids: ["payments/b", "email/c"] }).map((s) => s.id)).toEqual(["payments/b", "email/c"]);
    expect(filterScenarios(all, { q: "", tag: "", world: "", ids: [] })).toHaveLength(3);
    expect(scenariosHref(["payments/a", "email/c"])).toBe("#/scenarios?ids=payments/a,email/c");
  });

  it("escapes values and keeps ids readable in links", () => {
    expect(esc(`<a href="x">'&`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
    expect(href("scenario", "payments/timeout-after-commit")).toBe("#/scenario/payments/timeout-after-commit");
    expect(fixHref("payments", "create_refund", "timeout")).toBe("#/editor?new=1&world=payments&tool=create_refund&kind=timeout");
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
      worlds: [
        { name: "payments", description: "refunds", source: "built-in", tools: [{ name: "create_refund", description: "Refund an order", mutating: true, inputSchema: { type: "object", properties: { order_id: {}, idempotency_key: {} }, required: ["order_id"] }, outputSchema: null }], records: { refund: { order_id: "string" } } },
      ],
      faults: [
        { kind: "timeout", stage: "before", description: "d1", params: [], required: [], source: "built-in" },
        { kind: "replica_lag", stage: "after", description: "d2", params: [], required: [], source: "built-in" },
        { kind: "duplicate_delivery", stage: "twice", description: "d3", params: [], required: [], source: "built-in" },
        { kind: "phantom_success", stage: "before", description: "d4", params: ["result"], required: [], source: "built-in" },
      ],
    };
    const data = { meta: meta as never, obs: [] };
    const faults = sectionBody(data, "faults");
    expect(faults).toMatch(/timeout[\s\S]*?before the call runs/);
    expect(faults).toMatch(/replica_lag[\s\S]*?after the call runs/);
    expect(faults).toMatch(/duplicate_delivery[\s\S]*?the call runs twice/);
    expect(faults).toMatch(/phantom_success[\s\S]*?<code class="code-chip">result<\/code><span class="cat-opt">optional<\/span>/);
    expect(sectionBody(data, "agents")).toContain("verify-after-write");
    const worlds = sectionBody(data, "worlds");
    expect(worlds).toContain("create_refund");
    expect(worlds).toContain("idempotency_key?");
    expect(worlds).not.toContain("order_id?");
    expect(sectionBody(data, "verdicts")).toContain("fails the check");
    expect(sectionBody(data, "policies")).toContain("forbidBlindRetry");
  });

  it("draws coverage as KPI cells, a fault-kind-by-tool matrix that filters scenarios, gaps with links, and agents", () => {
    const html = coverageBody(coverage(), { world: "", unused: true });
    for (const label of ["Scenarios", "Worlds covered", "Tools faulted", "Fault kinds used", "Agents held", "Gaps"]) expect(html).toMatch(new RegExp(`class="kpi-label">(?:<svg[^>]*>.*?</svg>)?${label}</span>`));
    expect(html).toContain('<span class="kpi-num">1/2</span>');
    expect(html).toContain('<span class="kpi-num">5</span>');
    expect(html).toContain('href="#/scenarios?ids=payments/a"');
    expect(html).toContain('<tr class="unused">');
    expect(html).toContain('colspan="2"');
    expect(html).toContain('href="#/scenario/email/%3Cb%3E"');
    expect(html).toContain("email/&lt;b&gt;");
    expect(html).toContain('href="#/agent/liar"');
    expect(html).toContain('href="#/editor?new=1&amp;world=payments&amp;tool=get_refund&amp;kind=timeout"');
    expect(html).not.toContain("email/<b>");
  });

  it("links each coverage gap to the page that closes it and hides unused kinds on request", () => {
    const c = coverage();
    const groups = gapGroups(c);
    expect(groups.map((g) => g.id)).toEqual(["worlds", "tools", "kinds", "agents", "faults"]);
    expect(groups.find((g) => g.id === "tools")!.link("email/send_email")).toBe("#/editor?new=1&world=email&tool=send_email&kind=timeout");
    expect(groups.find((g) => g.id === "worlds")!.link("email")).toBe("#/editor?new=1&world=email");
    expect(coverageBody(c, { world: "", unused: false }, "")).not.toContain('<tr class="unused">');
    expect(coverageBody(c, { world: "email", unused: true })).not.toContain("create_refund</span>");
    expect(coverageBody({ ...c, scenarios: [] }, { world: "", unused: true })).toContain("Nothing to cover yet");
    expect(suggestKind(["timeout", "timeout_after_commit"], true)).toBe("timeout_after_commit");
    expect(suggestKind(["omission"], false)).toBe("omission");
  });

  it("shows validation and replay results", () => {
    expect(validationPanel({ ok: false, error: "draft: <bad>" })).toContain("draft: &lt;bad&gt;");
    expect(validationPanel({ ok: false, error: "x" }, { line: 4 })).toContain('data-line="4"');
    expect(validationPanel(undefined)).toContain("Checking");
    expect(validationPanel({ ok: true, summary: scenario({}), expect: ["refund"] })).toContain("<li>refund</li>");
    expect(validationPanel({ ok: true, summary: scenario({ expectedVerdicts: {} }), expect: [] })).toContain("will skip this scenario");
    expect(replayPanel({ reproduced: false, trials: [{ trialIndex: 0, replayedCalls: 1, reproduced: false, recordedVerdict: "SAFE_SUCCESS", recordedRules: [], divergence: { at: "call_2", field: "observed", recorded: 1, replayed: 2 } }] })).toContain("trial 0: diverged at call_2 (observed)");
    const result = { key: "mem-1", scenarioId: "payments/x", agentId: "naive-<retry>", verdict: "HARMFUL_ACTION", reason: "two <b>refunds</b>", rule: "r", trials: 1 } as ReportSummary;
    const list = draftResults([result], new Map([["mem-1", "replay <failed>"]]));
    expect(list).toContain("naive-&lt;retry&gt;");
    expect(list).toContain("replay &lt;failed&gt;");
    expect(list).not.toContain("<b>refunds");
    expect(draftResults([])).toBe("");
  });

  it("marks the line an error names, in the text or by the fault or key it points at", () => {
    const text = "id: x\nfaults:\n  - target: a\n    kind: nope\n  - target: b\n    kind: timeout\n";
    expect(locateError(text, "draft: cannot parse: Nested mappings are not allowed at line 3, column 5:")).toBe(3);
    expect(locateError(text, "draft: faults[0].kind must be one of x")).toBe(4);
    expect(locateError(text, "draft: faults[1].kind must be one of x")).toBe(6);
    expect(locateError(text, "draft: faults is not valid")).toBe(2);
    expect(locateError(text, "something else entirely")).toBeUndefined();
    expect(errorLine("draft: faults[0].kind must be one of x")).toBeUndefined();
  });

  it("outlines the draft, escaping what it shows, and builds drafts for links", () => {
    expect(outlineList([])).toContain("Nothing to outline yet");
    const items = outline('id: <x>\nfaults:\n  - target: create_refund\n    kind: timeout\n    on_call: 1\n');
    expect(items.map((i) => i.kind)).toEqual(["key", "key", "fault"]);
    const html = outlineList(items);
    expect(html).toContain("&lt;x&gt;");
    expect(html).toContain('data-line="3"');
    const meta = { worlds: [{ name: "payments", description: "", source: "", records: {}, tools: [{ name: "get_refund", description: "", mutating: false, inputSchema: {}, outputSchema: null }, { name: "create_refund", description: "", mutating: true, inputSchema: { properties: { idempotency_key: {} } }, outputSchema: null }] }], faults: [{ kind: "timeout", stage: "before", description: "d", params: [], required: [], source: "built-in" }, { kind: "timeout_after_commit", stage: "after", description: "d", params: [], required: [], source: "built-in" }] } as unknown as Parameters<typeof draftFor>[0];
    expect(draftFor(meta, new URLSearchParams("template=workflow"))?.text).toContain("custom/refund-and-notify");
    expect(draftFor(meta, new URLSearchParams(""))).toBeUndefined();
    expect(draftFor(meta, new URLSearchParams("new=1"))?.text).toContain("id: custom/refund-lost-response");
    const gap = draftFor(meta, new URLSearchParams("new=1&world=payments&tool=get_refund&kind=timeout"))!;
    expect(gap.text).toBe(gapDraft(meta, "payments", "get_refund", "timeout"));
    expect(() => parseYaml(gap.text)).not.toThrow();
    expect(draftFor(meta, new URLSearchParams("new=1&world=payments"))?.text).toContain("target: create_refund\n    kind: timeout_after_commit");
  });

  it("inserts a snippet where it belongs", () => {
    const text = "id: x\nworld: payments\nfaults:\n  - target: create_refund\n    kind: timeout\n";
    const lines = snippetLines("fault", text, [], ["timeout"]);
    const edit = snippetEdit(text, "fault", lines)!;
    expect(applyEdit(text, edit)).toMatch(/kind: timeout\n {2}- /);
  });

  it("highlights YAML and JSON without changing or unescaping their text", () => {
    for (const yaml of [...TEMPLATES.map((t) => t.text), 'task: "<script>x</script>" # note\nlist: [a, "b: c", 3]\ndescription: >\n  one #two\n  three\nnext: true']) {
      const html = highlightYaml(yaml);
      expect(plain(html)).toBe(yaml);
      expect(html.split("\n")).toHaveLength(yaml.split("\n").length);
      expect(html).not.toContain("<script>");
    }
    expect(highlightYaml("a: 1\nb: >\n  text: here\nc: x")).toContain('<span class="tk-str">  text: here</span>');
    const json = JSON.stringify({ "<k>": "<v>", n: -1.5, ok: true, none: null }, null, 2);
    expect(plain(highlightJson(json))).toBe(json);
    expect(highlightJson(json)).toContain('<span class="tk-key">&quot;&lt;k&gt;&quot;</span>:');
    expect(highlightJson(json)).toContain('<span class="tk-num">-1.5</span>');
  });

  it("describes checks, schedules, stages, and duplicates in plain words", () => {
    expect(checksLabel(scenario({}))).toBe("1 outcome, 1 answer check");
    expect(checksLabel(scenario({ hasExpect: false }))).toBe("no expectations");
    expect(scheduleLabel({ onCall: 1 })).toBe("#1");
    expect(scheduleLabel({ onCalls: [1, 3] })).toBe("#1, #3");
    expect(scheduleLabel({ onCallRange: [1, 2] })).toBe("#1–2");
    expect(scheduleLabel({ fromCall: 2 })).toBe("#2 on");
    expect(scheduleLabel({})).toBe("every call");
    expect(stageDiagram("twice")).toContain("×2");
    expect(stageDiagram("before", { service: "<s>" })).toContain("&lt;s&gt;");
    expect(duplicateText("id: payments/x\nworld: payments\n", "payments/x")).toBe("id: payments/x-copy\nworld: payments\n");
  });

  it("explains the fault schedule of a scenario with no faults", () => {
    const d = { scenario: { faults: [], worlds: ["payments"] } } as never;
    expect(faultSchedule(d)).toContain("No faults");
  });
});
