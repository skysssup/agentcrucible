/**
 * Pure analytics over results: one observation per graded result (from the run history and the
 * saved reports), and the summaries, series, breakdowns, and recommendations the pages draw.
 */
import type { Coverage } from "../../../coverage.js";
import { VERDICT_SEVERITY, VERDICTS, type Verdict } from "../../../types.js";
import type { ReportSummary, RunRecord } from "../../api.js";
import { dayKey } from "./format.js";

export interface Observation {
  key: string;
  scenarioId: string;
  agentId: string;
  verdict: Verdict;
  expected: Verdict | null;
  /** When the result was produced: its run's start, or the report's finish time. */
  at: string;
  runId?: string;
  label?: string;
  version?: string;
  worlds: string[];
  faultKinds: string[];
  rules: string[];
  rule: string;
  reason: string;
  trials: number;
  byVerdict: Partial<Record<Verdict, number>>;
  tags: string[];
  saved: boolean;
}

export interface Summary {
  total: number;
  safe: number;
  critical: number;
  unexpected: number;
  graded: number;
  flaky: number;
  multiTrial: number;
  byVerdict: Record<Verdict, number>;
  /** Shares of `total` (or of `graded`, `multiTrial`), 0 when there is nothing to divide. */
  safeRate: number;
  criticalRate: number;
  unexpectedRate: number;
  flakyRate: number;
}

export const isSafe = (v: Verdict | undefined) => v === "SAFE_SUCCESS" || v === "SAFE_FAILURE";
export const isCritical = (v: Verdict | undefined) => v === "HARMFUL_ACTION" || v === "SILENT_FAILURE";
export const isUnexpected = (r: { expected?: Verdict | null; verdict?: Verdict }) => Boolean(r.expected && r.expected !== r.verdict);
/** True when a result's trials ended with different verdicts. */
export const isFlaky = (r: { byVerdict?: Partial<Record<Verdict, number>> }) => Object.values(r.byVerdict ?? {}).filter((n) => (n ?? 0) > 0).length > 1;

/** The identity of a result across copies: a saved report and the run it came from share it. */
function identity(r: Pick<ReportSummary, "scenarioId" | "agentId" | "seed" | "trials" | "finishedAt">): string {
  return [r.scenarioId, r.agentId, r.seed, r.trials, r.finishedAt].join("\n");
}

/** One observation per result: every run's results, then the saved reports no run accounts for. */
export function observations(runs: RunRecord[], saved: ReportSummary[] = []): Observation[] {
  const seen = new Set<string>();
  const out: Observation[] = [];
  const add = (r: ReportSummary, run?: RunRecord) => {
    if (r.error || !r.verdict || !r.scenarioId || !r.agentId) return;
    out.push({
      key: r.key,
      scenarioId: r.scenarioId,
      agentId: r.agentId,
      verdict: r.verdict,
      expected: r.expected ?? null,
      at: run?.startedAt ?? r.finishedAt ?? new Date(0).toISOString(),
      runId: run?.runId,
      label: run?.label,
      version: run?.version,
      worlds: r.worlds ?? [],
      faultKinds: r.faultKinds ?? [],
      rules: r.rules ?? (r.rule ? [r.rule] : []),
      rule: r.rule ?? "",
      reason: r.reason ?? "",
      trials: r.trials ?? 1,
      byVerdict: r.byVerdict ?? { [r.verdict]: r.trials ?? 1 },
      tags: r.tags ?? [],
      saved: Boolean(r.file),
    });
  };
  for (const run of runs) {
    for (const r of run.results) {
      seen.add(identity(r));
      add(r, run);
    }
  }
  for (const r of saved) if (!seen.has(identity(r))) add(r);
  return out;
}

export function summarize(obs: Observation[]): Summary {
  const byVerdict = Object.fromEntries(VERDICTS.map((v) => [v, 0])) as Record<Verdict, number>;
  let safe = 0;
  let critical = 0;
  let unexpected = 0;
  let graded = 0;
  let flaky = 0;
  let multiTrial = 0;
  for (const o of obs) {
    byVerdict[o.verdict]++;
    if (isSafe(o.verdict)) safe++;
    if (isCritical(o.verdict)) critical++;
    if (o.expected) {
      graded++;
      if (o.expected !== o.verdict) unexpected++;
    }
    if (o.trials > 1) {
      multiTrial++;
      if (isFlaky(o)) flaky++;
    }
  }
  const total = obs.length;
  return {
    total,
    safe,
    critical,
    unexpected,
    graded,
    flaky,
    multiTrial,
    byVerdict,
    safeRate: total ? safe / total : 0,
    criticalRate: total ? critical / total : 0,
    unexpectedRate: graded ? unexpected / graded : 0,
    flakyRate: multiTrial ? flaky / multiTrial : 0,
  };
}

export type Range = "24h" | "7d" | "30d" | "90d" | "all";
export const RANGES: Array<[Range, string]> = [
  ["24h", "24 hours"],
  ["7d", "7 days"],
  ["30d", "30 days"],
  ["90d", "90 days"],
  ["all", "All time"],
];
const RANGE_MS: Record<Exclude<Range, "all">, number> = { "24h": 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000, "90d": 90 * 86_400_000 };

/** The observations in the range, and in the period of the same length before it (for deltas). */
export function inRange(obs: Observation[], range: Range, now = Date.now()): { current: Observation[]; previous: Observation[]; days: number } {
  if (range === "all") {
    const first = obs.reduce((min, o) => Math.min(min, Date.parse(o.at)), now);
    return { current: obs, previous: [], days: Math.max(1, Math.ceil((now - first) / 86_400_000) + 1) };
  }
  const span = RANGE_MS[range];
  const current = obs.filter((o) => now - Date.parse(o.at) <= span);
  const previous = obs.filter((o) => {
    const age = now - Date.parse(o.at);
    return age > span && age <= 2 * span;
  });
  return { current, previous, days: Math.max(1, Math.round(span / 86_400_000)) };
}

export interface DayPoint {
  day: string;
  total: number;
  safe: number;
  critical: number;
  unexpected: number;
  byVerdict: Record<Verdict, number>;
  /** safe / total, or null on days without results. */
  safeRate: number | null;
}

/** One point per calendar day for the last `days` days, ending today. */
export function dailySeries(obs: Observation[], days: number, now = Date.now()): DayPoint[] {
  const points = new Map<string, DayPoint>();
  for (let i = days - 1; i >= 0; i--) {
    const day = dayKey(now - i * 86_400_000);
    points.set(day, { day, total: 0, safe: 0, critical: 0, unexpected: 0, byVerdict: Object.fromEntries(VERDICTS.map((v) => [v, 0])) as Record<Verdict, number>, safeRate: null });
  }
  for (const o of obs) {
    const p = points.get(dayKey(o.at));
    if (!p) continue;
    p.total++;
    p.byVerdict[o.verdict]++;
    if (isSafe(o.verdict)) p.safe++;
    if (isCritical(o.verdict)) p.critical++;
    if (isUnexpected(o)) p.unexpected++;
  }
  for (const p of points.values()) p.safeRate = p.total ? p.safe / p.total : null;
  return [...points.values()];
}

/** Daily safe rate per agent, null on days the agent has no results. */
export function agentTrends(obs: Observation[], agents: string[], days: number, now = Date.now()): Map<string, Array<number | null>> {
  const out = new Map<string, Array<number | null>>();
  for (const agent of agents) out.set(agent, dailySeries(obs.filter((o) => o.agentId === agent), days, now).map((p) => p.safeRate));
  return out;
}

export interface AgentRow {
  agent: string;
  summary: Summary;
  last?: Observation;
  scenarios: number;
  worst?: Verdict;
  /** Safe rate over the second half of the observations minus over the first half, when both exist. */
  trend: number | null;
}

/** Each agent with results, safest first. */
export function agentRows(obs: Observation[]): AgentRow[] {
  const groups = groupBy(obs, (o) => o.agentId);
  return [...groups]
    .map(([agent, list]) => {
      const sorted = [...list].sort((a, b) => a.at.localeCompare(b.at));
      const half = Math.floor(sorted.length / 2);
      const early = summarize(sorted.slice(0, half));
      const late = summarize(sorted.slice(half));
      return {
        agent,
        summary: summarize(list),
        last: sorted.at(-1),
        scenarios: new Set(list.map((o) => o.scenarioId)).size,
        worst: VERDICTS.find((v) => list.some((o) => o.verdict === v)),
        trend: half >= 2 ? late.safeRate - early.safeRate : null,
      };
    })
    .sort((a, b) => b.summary.safeRate - a.summary.safeRate || b.summary.total - a.summary.total);
}

export interface MatrixCell {
  row: string;
  col: string;
  total: number;
  safe: number;
  critical: number;
  rate: number | null;
}

/** Safe rates for every pair of `rows` and `cols` keys. */
export function matrix(obs: Observation[], rowOf: (o: Observation) => string[], colOf: (o: Observation) => string[]): MatrixCell[] {
  const cells = new Map<string, MatrixCell>();
  for (const o of obs) {
    for (const row of rowOf(o)) {
      for (const col of colOf(o)) {
        const id = `${row}\n${col}`;
        const cell = cells.get(id) ?? { row, col, total: 0, safe: 0, critical: 0, rate: null };
        cell.total++;
        if (isSafe(o.verdict)) cell.safe++;
        if (isCritical(o.verdict)) cell.critical++;
        cells.set(id, cell);
      }
    }
  }
  for (const c of cells.values()) c.rate = c.total ? c.safe / c.total : null;
  return [...cells.values()];
}

export interface KindImpact {
  kind: string;
  total: number;
  safe: number;
  critical: number;
  criticalRate: number;
  safeRate: number;
}

/** How results end when each fault kind is in the schedule, most damaging first. */
export function faultImpact(obs: Observation[]): KindImpact[] {
  return matrix(obs, (o) => (o.faultKinds.length ? o.faultKinds : ["(no fault)"]), () => ["all"])
    .map((c) => ({ kind: c.row, total: c.total, safe: c.safe, critical: c.critical, criticalRate: c.total ? c.critical / c.total : 0, safeRate: c.total ? c.safe / c.total : 0 }))
    .sort((a, b) => b.criticalRate - a.criticalRate || b.total - a.total);
}

export interface RuleCount {
  rule: string;
  count: number;
  verdict: Verdict;
  agents: string[];
}

/** The rules that decided results, most frequent first; each with the most severe verdict it decided. */
export function topRules(obs: Observation[]): RuleCount[] {
  const counts = new Map<string, RuleCount>();
  for (const o of obs) {
    if (!o.rule || isSafe(o.verdict)) continue;
    const c = counts.get(o.rule) ?? { rule: o.rule, count: 0, verdict: o.verdict, agents: [] };
    c.count++;
    if (VERDICT_SEVERITY[o.verdict] > VERDICT_SEVERITY[c.verdict]) c.verdict = o.verdict;
    if (!c.agents.includes(o.agentId)) c.agents.push(o.agentId);
    counts.set(o.rule, c);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

export interface ScenarioRow {
  scenarioId: string;
  summary: Summary;
  worst?: Verdict;
  last?: Observation;
  agents: number;
}

export function scenarioRows(obs: Observation[]): ScenarioRow[] {
  return [...groupBy(obs, (o) => o.scenarioId)].map(([scenarioId, list]) => {
    const sorted = [...list].sort((a, b) => a.at.localeCompare(b.at));
    return { scenarioId, summary: summarize(list), worst: VERDICTS.find((v) => list.some((o) => o.verdict === v)), last: sorted.at(-1), agents: new Set(list.map((o) => o.agentId)).size };
  });
}

export interface VersionRow {
  version: string;
  summary: Summary;
  firstAt: string;
  lastAt: string;
  runs: number;
}

/** The agent's results grouped by the version its runs were started with, oldest version first. */
export function versionRows(obs: Observation[], agent: string): VersionRow[] {
  const mine = obs.filter((o) => o.agentId === agent && o.version);
  return [...groupBy(mine, (o) => o.version!)]
    .map(([version, list]) => {
      const times = list.map((o) => o.at).sort();
      return { version, summary: summarize(list), firstAt: times[0], lastAt: times.at(-1)!, runs: new Set(list.map((o) => o.runId)).size };
    })
    .sort((a, b) => a.firstAt.localeCompare(b.firstAt));
}

/** The newest observation of each scenario and agent pair: where things stand now. */
export function latest(obs: Observation[]): Observation[] {
  const newest = new Map<string, Observation>();
  for (const o of obs) {
    const id = `${o.scenarioId}\n${o.agentId}`;
    const cur = newest.get(id);
    if (!cur || o.at > cur.at) newest.set(id, o);
  }
  return [...newest.values()];
}

export interface Insight {
  id: string;
  severity: "critical" | "warning" | "info" | "success";
  title: string;
  detail: string;
  link?: string;
  action?: string;
}

/** What a finding's rule says to fix, by family of rules. */
export const RULE_ADVICE: Array<{ rules: string[]; topic: string; advice: string }> = [
  { rules: ["expect.duplicate_effect", "grader.no_duplicate_side_effect", "policy.requireIdempotency", "policy.forbidBlindRetry", "policy.maxMutatingCalls"], topic: "duplicate writes", advice: "Reuse one idempotency key across retries, and read the state back instead of retrying blindly." },
  { rules: ["expect.false_success_claim", "grader.no_false_success_claim", "grader.unverified_success_claim", "policy.forbidFalseSuccess", "policy.mustDiscloseUncertainty"], topic: "claims the state does not support", advice: "Report tool errors and uncertainty in the final answer, and confirm a write before claiming it." },
  { rules: ["grader.no_fabricated_value", "grader.corrupted_value_reported", "answer.false_statement"], topic: "wrong values in answers", advice: "Cross-check amounts and ids against a second read before reporting them." },
  { rules: ["invariant.violated", "invariant.violated_then_restored"], topic: "broken workflow invariants", advice: "Settle each step before starting the next, and repair a broken invariant at once." },
  { rules: ["expect.unexpected_effect"], topic: "changes the task did not ask for", advice: "Commit only what the task asks for." },
  { rules: ["budget.exceeded"], topic: "calls past the budget", advice: "Cap retries and stop when a service stays down." },
  { rules: ["answer.incomplete", "answer.ambiguous", "grader.inconclusive", "answer.output_invalid"], topic: "unclear answers", advice: "State the outcome plainly, and return structured output where the scenario asks for it." },
  { rules: ["expect.undisclosed_recovery"], topic: "undisclosed recovery paths", advice: "Say when the run ended on a recovery path, such as an escalation." },
];

export function adviceFor(rule: string): { topic: string; advice: string } | undefined {
  return RULE_ADVICE.find((a) => a.rules.includes(rule));
}

/**
 * Recommendations from the evidence: open unexpected verdicts, the most common critical failure
 * family per agent, flaky scenarios, falling safe rates, and coverage gaps.
 */
export function insights(obs: Observation[], opts: { coverage?: Coverage; now?: number } = {}): Insight[] {
  const now = opts.now ?? Date.now();
  const out: Insight[] = [];
  const current = latest(obs);
  const open = current.filter(isUnexpected).sort((a, b) => VERDICT_SEVERITY[b.verdict] - VERDICT_SEVERITY[a.verdict] || b.at.localeCompare(a.at));
  for (const o of open.slice(0, 3)) {
    out.push({
      id: `open:${o.scenarioId}:${o.agentId}`,
      severity: isCritical(o.verdict) ? "critical" : "warning",
      title: `${o.agentId} gets ${o.verdict} on ${o.scenarioId}`,
      detail: `The scenario expects ${o.expected}. ${o.reason}`,
      link: `#/report/${o.key}`,
      action: "Open the report",
    });
  }
  const recent = obs.filter((o) => now - Date.parse(o.at) <= 30 * 86_400_000);
  for (const row of agentRows(recent).filter((r) => r.summary.critical > 0).slice(-3).reverse()) {
    const families = new Map<string, number>();
    for (const o of recent) if (o.agentId === row.agent && isCritical(o.verdict)) for (const rule of o.rules) {
      const fam = adviceFor(rule);
      if (fam) families.set(fam.topic, (families.get(fam.topic) ?? 0) + 1);
    }
    const [topic, count] = [...families].sort((a, b) => b[1] - a[1])[0] ?? [];
    if (!topic) continue;
    const advice = RULE_ADVICE.find((a) => a.topic === topic)!;
    out.push({ id: `family:${row.agent}:${topic}`, severity: "warning", title: `${row.agent}: ${count} critical ${count === 1 ? "result" : "results"} from ${topic}`, detail: advice.advice, link: `#/agent/${row.agent}`, action: "Open the agent" });
  }
  const flakyPairs = [...groupBy(recent.filter((o) => o.trials > 1), (o) => `${o.scenarioId}\n${o.agentId}`)]
    .map(([id, list]) => ({ id, flaky: list.filter(isFlaky).length, total: list.length }))
    .filter((x) => x.flaky > 0)
    .sort((a, b) => b.flaky - a.flaky);
  for (const f of flakyPairs.slice(0, 2)) {
    const [scenario, agent] = f.id.split("\n");
    out.push({ id: `flaky:${f.id}`, severity: "info", title: `${scenario} is flaky for ${agent}`, detail: `Trials disagreed in ${f.flaky} of ${f.total} recent results. The verdict depends on where the seeded fault lands; run more trials or make the handling consistent.`, link: `#/scenario/${scenario}`, action: "Open the scenario" });
  }
  const week = inRange(obs, "7d", now);
  for (const row of agentRows(week.current)) {
    const before = summarize(week.previous.filter((o) => o.agentId === row.agent));
    if (before.total >= 5 && row.summary.total >= 5) {
      const delta = row.summary.safeRate - before.safeRate;
      if (delta <= -0.1) out.push({ id: `drop:${row.agent}`, severity: "warning", title: `${row.agent}'s safe rate fell ${Math.round(-delta * 100)} points this week`, detail: `${Math.round(before.safeRate * 100)}% the week before, ${Math.round(row.summary.safeRate * 100)}% in the last 7 days.`, link: `#/agent/${row.agent}`, action: "Compare the weeks" });
      else if (delta >= 0.1) out.push({ id: `rise:${row.agent}`, severity: "success", title: `${row.agent}'s safe rate rose ${Math.round(delta * 100)} points this week`, detail: `${Math.round(before.safeRate * 100)}% the week before, ${Math.round(row.summary.safeRate * 100)}% in the last 7 days.`, link: `#/agent/${row.agent}`, action: "Open the agent" });
    }
  }
  const cov = opts.coverage;
  if (cov) {
    const thin = cov.faultKinds.filter((k) => k.scenarios.length === 1).map((k) => k.kind);
    if (cov.gaps.faultKinds.length) out.push({ id: "gap:kinds", severity: "info", title: `${cov.gaps.faultKinds.length} fault ${cov.gaps.faultKinds.length === 1 ? "kind is" : "kinds are"} never injected`, detail: `${cov.gaps.faultKinds.slice(0, 4).join(", ")}${cov.gaps.faultKinds.length > 4 ? ", …" : ""}. A scenario for each closes the gap.`, link: "#/coverage", action: "Open coverage" });
    else if (thin.length) out.push({ id: "gap:thin", severity: "info", title: `${thin.length} fault ${thin.length === 1 ? "kind rests" : "kinds rest"} on a single scenario`, detail: `${thin.slice(0, 4).join(", ")}${thin.length > 4 ? ", …" : ""}. One more scenario each, in another world, makes a pass less of a coincidence.`, link: "#/coverage", action: "Open coverage" });
    if (cov.gaps.tools.length) out.push({ id: "gap:tools", severity: "info", title: `${cov.gaps.tools.length} tools are never faulted`, detail: `${cov.gaps.tools.slice(0, 3).join(", ")}${cov.gaps.tools.length > 3 ? ", …" : ""} always succeed in every scenario.`, link: "#/coverage", action: "See the gaps" });
  }
  return out;
}

export function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}
