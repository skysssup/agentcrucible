import { describe, expect, it } from "vitest";
import type { ReportSummary, RunRecord } from "../src/ui/api.js";
import { observations } from "../src/ui/client/lib/analytics.js";
import { agentRecords, duelGroups, duelTally, filterAgents, filterObs, headToHead, latestVersion, ownsVersions, resultsCsv, sharedPairs, sortAgents, standings, versionHistory, versionMarks } from "../src/ui/client/lib/agents.js";
import { filterOptions } from "../src/ui/client/pages/analytics.js";
import { agentCard, agentsTable } from "../src/ui/client/pages/agents.js";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");

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
  worlds: ["payments"],
  faultKinds: ["timeout_after_commit"],
  ...over,
});

const run = (over: Partial<RunRecord>): RunRecord => ({ runId: "run-1", startedAt: "2026-10-04T09:00:00.000Z", scenarios: ["payments/x"], agents: null, trials: 1, seed: null, draft: false, results: [], ...over });

const agents = ["naive-retry", "liar", "cross-checker"].map((id) => ({ id, description: `<b>${id}</b>`, source: "built-in" }));

describe("Agents", () => {
  it("counts a saved copy of a session result once and ranks agents by their share of safe results", () => {
    const base = { seed: "s", finishedAt: "2026-10-04T10:00:00.000Z" };
    const session = [
      result({ ...base }),
      result({ ...base, key: "mem-2", agentId: "cross-checker", verdict: "SAFE_SUCCESS" }),
      result({ ...base, key: "mem-3", agentId: "cross-checker", verdict: "SAFE_FAILURE", scenarioId: "email/y" }),
    ];
    const saved = [result({ ...base, key: "file:naive-retry/x.report.json", file: "naive-retry/x.report.json" }), { key: "file:bad", file: "bad", error: "not a report" }];
    const obs = observations([run({ results: session })], saved);
    expect(obs.map((o) => o.key)).toEqual(["mem-1", "mem-2", "mem-3"]);
    const records = agentRecords(agents, obs, NOW);
    expect(records.map((r) => [r.id, r.row?.summary.total, r.row?.summary.safe, r.row?.worst])).toEqual([
      ["cross-checker", 2, 2, "SAFE_FAILURE"],
      ["naive-retry", 1, 0, "HARMFUL_ACTION"],
      ["liar", undefined, undefined, undefined],
    ]);
  });

  it("escapes agent descriptions in cards and tables and says when an agent has no results", () => {
    const records = agentRecords(agents, observations([run({ results: [result({})] })]), NOW);
    const card = agentCard(records.find((r) => r.id === "liar")!);
    expect(card).toContain("No results yet");
    expect(card).toContain("data-id=\"liar\"");
    const table = agentsTable(records);
    expect(table).toContain("&lt;b&gt;liar&lt;/b&gt;");
    expect(table).not.toContain("<b>liar</b>");
    expect(table).toContain("no results yet");
    expect(agentCard(records[0], true)).toContain("is-picked");
  });

  it("sorts and filters agents, keeping those without results last", () => {
    const obs = observations([run({ results: [result({}), result({ key: "mem-2", seed: "t", agentId: "cross-checker", verdict: "SAFE_SUCCESS" })] })]);
    const records = agentRecords(agents, obs, NOW);
    expect(sortAgents(records, "name").map((r) => r.id)).toEqual(["cross-checker", "naive-retry", "liar"]);
    expect(sortAgents(records, "results").map((r) => r.id).at(-1)).toBe("liar");
    expect(filterAgents(records, { q: "retry", kind: "all", withResults: false }).map((r) => r.id)).toEqual(["naive-retry"]);
    expect(filterAgents(records, { q: "", kind: "all", withResults: true }).map((r) => r.id)).toEqual(["cross-checker", "naive-retry"]);
    expect(filterAgents(records, { q: "", kind: "project", withResults: false })).toEqual([]);
  });

  it("knows only history for agents that are no longer registered, and versions only for non-built-in agents", () => {
    const obs = observations([run({ version: "1.2", results: [result({ agentId: "retired" })] })]);
    const [retired] = agentRecords([], obs, NOW);
    expect(retired).toMatchObject({ id: "retired", kind: "history" });
    expect(ownsVersions("built-in")).toBe(false);
    expect(ownsVersions("demo workspace")).toBe(true);
    expect(latestVersion(obs)).toBe("1.2");
  });

  const history = () => {
    const mk = (n: number, version: string, startedAt: string, verdicts: Array<ReportSummary["verdict"]>) =>
      run({ runId: `run-${n}`, version, startedAt, results: verdicts.map((verdict, i) => result({ key: `hist:run-${n}:${i}`, agentId: "support-agent", verdict, seed: `${n}-${i}`, scenarioId: `s/${i}` })) });
    return observations([mk(1, "1.0", "2026-08-01T10:00:00.000Z", ["HARMFUL_ACTION", "SAFE_SUCCESS"]), mk(2, "2.0", "2026-09-01T10:00:00.000Z", ["SAFE_SUCCESS", "SAFE_SUCCESS"])]);
  };

  it("lists each version with its change in safe share from the one before", () => {
    const steps = versionHistory(history());
    expect(steps.map((s) => [s.agent, s.version, s.change])).toEqual([
      ["support-agent", "1.0", null],
      ["support-agent", "2.0", 0.5],
    ]);
    expect(versionMarks(history(), ["2026-08-01", "2026-09-01"]).map((m) => m.label)).toEqual(["v1.0", "v2.0"]);
  });

  it("orders an agent's scenarios weakest first", () => {
    const rows = standings(history());
    expect(rows.map((r) => [r.scenarioId, r.last.verdict])).toEqual([
      ["s/0", "SAFE_SUCCESS"],
      ["s/1", "SAFE_SUCCESS"],
    ]);
    const worse = standings(observations([run({ results: [result({}), result({ key: "mem-2", seed: "t", scenarioId: "payments/z", verdict: "SAFE_SUCCESS" })] })]));
    expect(worse[0].scenarioId).toBe("payments/x");
  });

  it("compares two agents on the scenarios both ran", () => {
    const obs = observations([
      run({
        results: [
          result({ key: "a1", agentId: "a", verdict: "SAFE_SUCCESS", scenarioId: "s/1", seed: "1" }),
          result({ key: "b1", agentId: "b", verdict: "HARMFUL_ACTION", scenarioId: "s/1", seed: "2" }),
          result({ key: "a2", agentId: "a", verdict: "DEGRADED", scenarioId: "s/2", seed: "3", worlds: ["email"] }),
          result({ key: "b2", agentId: "b", verdict: "DEGRADED", scenarioId: "s/2", seed: "4", worlds: ["email"] }),
          result({ key: "a3", agentId: "a", verdict: "SAFE_SUCCESS", scenarioId: "s/only-a", seed: "5" }),
        ],
      }),
    ]);
    const duels = headToHead(obs, "a", "b");
    expect(duels.map((d) => [d.scenarioId, d.edge])).toEqual([
      ["s/1", 1],
      ["s/2", 0],
    ]);
    expect(duelTally(duels)).toMatchObject({ shared: 2, wins: 1, losses: 0, ties: 1, safeA: 1, safeB: 0, criticalB: 1 });
    expect(duelGroups(duels, (d) => d.worlds).map((g) => [g.key, g.shared])).toEqual([
      ["email", 1],
      ["payments", 1],
    ]);
    expect(sharedPairs(obs)).toEqual([{ a: "a", b: "b", shared: 2 }]);
  });
});

describe("Analytics filters", () => {
  const obs = observations([
    run({
      results: [
        result({ key: "1", seed: "1", tags: ["smoke"] }),
        result({ key: "2", seed: "2", agentId: "cross-checker", verdict: "SAFE_SUCCESS", worlds: ["email"], faultKinds: [], tags: [] }),
        result({ key: "3", seed: "3", agentId: "cross-checker", verdict: "SAFE_SUCCESS", worlds: ["email"], faultKinds: ["timeout"], tags: ["smoke"] }),
      ],
    }),
  ]);

  it("keeps results that match any chosen value of each filter and all of the filters together", () => {
    const all = { agents: [], worlds: [], tags: [], kinds: [] };
    expect(filterObs(obs, all)).toHaveLength(3);
    expect(filterObs(obs, { ...all, agents: ["cross-checker"] }).map((o) => o.key)).toEqual(["2", "3"]);
    expect(filterObs(obs, { ...all, tags: ["smoke"], worlds: ["email"] }).map((o) => o.key)).toEqual(["3"]);
    expect(filterObs(obs, { ...all, kinds: ["(no fault)"] }).map((o) => o.key)).toEqual(["2"]);
  });

  it("counts the results behind each filter value, most first", () => {
    const opts = filterOptions(obs);
    expect(opts.agents).toEqual([
      { value: "cross-checker", count: 2 },
      { value: "naive-retry", count: 1 },
    ]);
    expect(opts.kinds.map((k) => k.value)).toContain("(no fault)");
    expect(opts.tags).toEqual([{ value: "smoke", count: 2 }]);
  });

  it("exports the results in view as CSV, oldest first, quoting commas", () => {
    const lines = resultsCsv([...obs.slice(0, 1).map((o) => ({ ...o, reason: 'says "hi", twice' }))]).split("\n");
    expect(lines[0].startsWith("at,run,run_label")).toBe(true);
    expect(lines[1]).toContain('"says ""hi"", twice"');
  });
});
