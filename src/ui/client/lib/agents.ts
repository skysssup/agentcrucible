/**
 * The agent pages' data: every agent with its record from the history, the versions its runs
 * carry, its standing on each scenario, head-to-head comparisons on the scenarios two agents both
 * ran, and the filters and export of the analytics page. Pure functions over observations.
 */
import { VERDICT_SEVERITY, type Verdict } from "../../../types.js";
import { agentRows, dailySeries, groupBy, inRange, isCritical, isFlaky, isSafe, isUnexpected, latest, summarize, versionRows, type AgentRow, type Observation, type Summary, type VersionRow } from "./analytics.js";
import { csv, dayKey } from "./format.js";
import type { Meta } from "./state.js";

export type AgentInfo = Meta["agents"][number];

/** Where an agent comes from: it ships with AgentCrucible, the project registers it, or only the history knows it. */
export type SourceKind = "built-in" | "project" | "history";

export function sourceKind(source: string): SourceKind {
  return source === "built-in" ? "built-in" : source ? "project" : "history";
}

/**
 * True when a run's version describes this agent. A run is started with the version of the agent
 * under test; the built-in reference agents that run beside it have no versions of their own.
 */
export function ownsVersions(source: string): boolean {
  return source !== "built-in";
}

export interface AgentRecord {
  id: string;
  description: string;
  /** "built-in", "demo workspace", a module path, or "" when only the history knows the agent. */
  source: string;
  kind: SourceKind;
  /** The agent's results summarized; undefined before its first result. */
  row?: AgentRow;
  /** The version of its newest versioned result; never set for built-in agents. */
  version?: string;
  /** The daily safe share over the last 30 days, null on days without results. */
  trend: Array<number | null>;
  /** The results of the last 30 days, summarized. */
  month: Summary;
  /** Latest results (one per scenario) whose verdict differs from the expected one. */
  open: number;
}

/** The version of the newest observation that carries one. */
export function latestVersion(obs: Observation[]): string | undefined {
  let newest: Observation | undefined;
  for (const o of obs) if (o.version && (!newest || o.at > newest.at)) newest = o;
  return newest?.version;
}

/**
 * Every registered agent with its record from the history, then the agents only the history
 * knows, ranked: agents with results first, the safest first (more results first on a tie), then
 * the rest in registry order.
 */
export function agentRecords(agents: AgentInfo[], obs: Observation[], now = Date.now()): AgentRecord[] {
  const rows = new Map(agentRows(obs).map((r) => [r.agent, r]));
  const mine = groupBy(obs, (o) => o.agentId);
  const known = new Set(agents.map((a) => a.id));
  const all = [...agents, ...[...mine.keys()].filter((id) => !known.has(id)).map((id) => ({ id, description: "", source: "" }))];
  return sortAgents(
    all.map((a) => {
      const list = mine.get(a.id) ?? [];
      return {
        id: a.id,
        description: a.description,
        source: a.source,
        kind: sourceKind(a.source),
        row: rows.get(a.id),
        version: ownsVersions(a.source) ? latestVersion(list) : undefined,
        trend: dailySeries(list, 30, now).map((p) => p.safeRate),
        month: summarize(inRange(list, "30d", now).current),
        open: latest(list).filter(isUnexpected).length,
      };
    }),
    "safe"
  );
}

export type AgentSort = "safe" | "results" | "name" | "recent";

export const AGENT_SORTS: Array<[AgentSort, string]> = [
  ["safe", "Safe share"],
  ["results", "Results"],
  ["recent", "Most recent"],
  ["name", "Name"],
];

/** Agents in the chosen order; agents without results always come last, in the order they came. */
export function sortAgents(list: AgentRecord[], sort: AgentSort): AgentRecord[] {
  const compare = (a: AgentRecord, b: AgentRecord): number => {
    if (sort === "name") return a.id.localeCompare(b.id);
    if (!a.row || !b.row) return 0;
    const [x, y] = [a.row, b.row];
    if (sort === "results") return y.summary.total - x.summary.total || y.summary.safeRate - x.summary.safeRate;
    if (sort === "recent") return (y.last?.at ?? "").localeCompare(x.last?.at ?? "");
    return y.summary.safeRate - x.summary.safeRate || y.summary.total - x.summary.total;
  };
  return [...list].sort((a, b) => Number(Boolean(b.row)) - Number(Boolean(a.row)) || compare(a, b));
}

export interface AgentFilter {
  q: string;
  kind: "all" | SourceKind;
  withResults: boolean;
}

/** Agents whose id, description, source, or version contain every word of `q`. */
export function filterAgents(list: AgentRecord[], f: AgentFilter): AgentRecord[] {
  const words = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((r) => (f.kind === "all" || r.kind === f.kind) && (!f.withResults || r.row) && words.every((w) => `${r.id} ${r.description} ${r.source} ${r.version ? `v${r.version}` : ""}`.toLowerCase().includes(w)));
}

/** Where each version first appears among `days` (YYYY-MM-DD keys), as marks for a chart; labeled with the agent when several agents carry versions. */
export function versionMarks(obs: Observation[], days: string[]): Array<{ index: number; label: string }> {
  const first = new Map<string, Observation>();
  for (const o of obs) {
    const id = `${o.agentId}\n${o.version}`;
    if (o.version && (!first.has(id) || o.at < first.get(id)!.at)) first.set(id, o);
  }
  const several = new Set([...first.values()].map((o) => o.agentId)).size > 1;
  return [...first.values()]
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((o) => ({ index: days.indexOf(dayKey(o.at)), label: several ? `${o.agentId} v${o.version}` : `v${o.version}` }))
    .filter((m) => m.index >= 0);
}

export interface Standing {
  scenarioId: string;
  worlds: string[];
  last: Observation;
  summary: Summary;
  /** The verdicts of the newest results, oldest first. */
  recent: Verdict[];
  /** The safe share of the newer half of the results minus the older half, from four results up. */
  trend: number | null;
}

/** An agent's standing on each scenario it ran, weakest first: the most severe latest verdict, unexpected before expected, then the lowest safe share. */
export function standings(obs: Observation[], recentCount = 12): Standing[] {
  return [...groupBy(obs, (o) => o.scenarioId)]
    .map(([scenarioId, list]) => {
      const sorted = [...list].sort((a, b) => a.at.localeCompare(b.at));
      const half = Math.floor(sorted.length / 2);
      const last = sorted.at(-1)!;
      return {
        scenarioId,
        worlds: last.worlds,
        last,
        summary: summarize(list),
        recent: sorted.slice(-recentCount).map((o) => o.verdict),
        trend: half >= 2 ? summarize(sorted.slice(half)).safeRate - summarize(sorted.slice(0, half)).safeRate : null,
      };
    })
    .sort((a, b) => VERDICT_SEVERITY[b.last.verdict] - VERDICT_SEVERITY[a.last.verdict] || Number(isUnexpected(b.last)) - Number(isUnexpected(a.last)) || a.summary.safeRate - b.summary.safeRate || a.scenarioId.localeCompare(b.scenarioId));
}

/** One scenario both agents ran, with the latest result of each. */
export interface Duel {
  scenarioId: string;
  worlds: string[];
  faultKinds: string[];
  a: Observation;
  b: Observation;
  /** 1 when A's verdict is less severe than B's, -1 when B's is, 0 when they are equally severe. */
  edge: -1 | 0 | 1;
}

/** The scenarios both agents ran, each with the latest result of A and of B, by scenario id. */
export function headToHead(obs: Observation[], a: string, b: string): Duel[] {
  const newest = (agent: string) => new Map(latest(obs.filter((o) => o.agentId === agent)).map((o) => [o.scenarioId, o]));
  const ofA = newest(a);
  const ofB = newest(b);
  return [...ofA]
    .filter(([id]) => ofB.has(id))
    .map(([scenarioId, x]) => {
      const y = ofB.get(scenarioId)!;
      return { scenarioId, worlds: x.worlds, faultKinds: [...new Set([...x.faultKinds, ...y.faultKinds])], a: x, b: y, edge: Math.sign(VERDICT_SEVERITY[y.verdict] - VERDICT_SEVERITY[x.verdict]) as Duel["edge"] };
    })
    .sort((x, y) => x.scenarioId.localeCompare(y.scenarioId));
}

export interface DuelTally {
  key: string;
  shared: number;
  /** Scenarios where A's verdict is less severe. */
  wins: number;
  /** Scenarios where B's verdict is less severe. */
  losses: number;
  ties: number;
  safeA: number;
  safeB: number;
  criticalA: number;
  criticalB: number;
}

export function duelTally(duels: Duel[], key = "all"): DuelTally {
  const t: DuelTally = { key, shared: duels.length, wins: 0, losses: 0, ties: 0, safeA: 0, safeB: 0, criticalA: 0, criticalB: 0 };
  for (const d of duels) {
    if (d.edge > 0) t.wins++;
    else if (d.edge < 0) t.losses++;
    else t.ties++;
    if (isSafe(d.a.verdict)) t.safeA++;
    if (isSafe(d.b.verdict)) t.safeB++;
    if (isCritical(d.a.verdict)) t.criticalA++;
    if (isCritical(d.b.verdict)) t.criticalB++;
  }
  return t;
}

/** Head-to-head tallies per group (a world, a fault kind), the most shared scenarios first. */
export function duelGroups(duels: Duel[], keys: (d: Duel) => string[]): DuelTally[] {
  const groups = new Map<string, Duel[]>();
  for (const d of duels) {
    for (const k of keys(d)) {
      const list = groups.get(k);
      if (list) list.push(d);
      else groups.set(k, [d]);
    }
  }
  return [...groups].map(([key, list]) => duelTally(list, key)).sort((x, y) => y.shared - x.shared || x.key.localeCompare(y.key));
}

/** Pairs of agents with the most scenarios in common, for suggestions. */
export function sharedPairs(obs: Observation[], limit = 4): Array<{ a: string; b: string; shared: number }> {
  const sets = [...groupBy(obs, (o) => o.agentId)].map(([agent, list]) => ({ agent, total: list.length, scenarios: new Set(list.map((o) => o.scenarioId)) })).sort((x, y) => y.total - x.total || x.agent.localeCompare(y.agent));
  const pairs: Array<{ a: string; b: string; shared: number }> = [];
  sets.forEach((x, i) => {
    for (const y of sets.slice(i + 1)) {
      const shared = [...x.scenarios].filter((s) => y.scenarios.has(s)).length;
      if (shared) pairs.push({ a: x.agent, b: y.agent, shared });
    }
  });
  return pairs.sort((x, y) => y.shared - x.shared).slice(0, limit);
}

/** The analytics filters: an empty list keeps every value. */
export interface ObsFilter {
  agents: string[];
  worlds: string[];
  tags: string[];
  kinds: string[];
}

/** The fault-kind group of a result without faults. */
export const NO_FAULT = "(no fault)";

export function filterObs(obs: Observation[], f: ObsFilter): Observation[] {
  const keep = (chosen: string[], values: string[]) => !chosen.length || values.some((v) => chosen.includes(v));
  return obs.filter((o) => keep(f.agents, [o.agentId]) && keep(f.worlds, o.worlds) && keep(f.tags, o.tags) && keep(f.kinds, o.faultKinds.length ? o.faultKinds : [NO_FAULT]));
}

/** Observations as CSV, one row per result, oldest first. */
export function resultsCsv(obs: Observation[]): string {
  const rows = [...obs].sort((a, b) => a.at.localeCompare(b.at)).map((o) => [o.at, o.runId ?? "", o.label ?? "", o.version ?? "", o.scenarioId, o.agentId, o.verdict, o.expected ?? "", o.expected ? o.expected === o.verdict : "", o.trials, o.trials > 1 && isFlaky(o), o.worlds.join(" "), o.faultKinds.join(" "), o.tags.join(" "), o.rule, o.reason, o.key]);
  return csv([["at", "run", "run_label", "run_version", "scenario", "agent", "verdict", "expected", "as_expected", "trials", "flaky", "worlds", "fault_kinds", "tags", "rule", "reason", "key"], ...rows]);
}

export interface VersionStep extends VersionRow {
  agent: string;
  /** Safe share of this version minus the agent's previous version, when there is one. */
  change: number | null;
}

/** Every agent's versions, oldest first within each agent, each with its change in safe share from the version before. */
export function versionHistory(obs: Observation[]): VersionStep[] {
  return [...new Set(obs.filter((o) => o.version).map((o) => o.agentId))].sort().flatMap((agent) =>
    versionRows(obs, agent).map((row, i, rows): VersionStep => ({ ...row, agent, change: i ? row.summary.safeRate - rows[i - 1].summary.safeRate : null }))
  );
}
