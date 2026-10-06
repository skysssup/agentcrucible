/**
 * Pure helpers for the run and sweep pages: names and status of runs, filters, the numbers of a
 * period, the diff between two runs, the launcher's plan, and every export (Markdown, CSV, CLI
 * commands, JSON). Nothing here touches the DOM, so the tests import it directly.
 */
import type { SweepSummary } from "../../../sweep.js";
import { VERDICT_SEVERITY, type Verdict } from "../../../types.js";
import type { ReportSummary, RunRecord, ScenarioSummary, SweepListItem } from "../../api.js";
import { isCritical, isFlaky, isSafe, isUnexpected } from "./analytics.js";
import { csv, dayKey, plural, shellQuote } from "./format.js";

/** A run's name without a label: the draft it ran, its one scenario, or how many it ran. */
export function runScopeLabel(run: Pick<RunRecord, "scenarios" | "draft">): string {
  if (run.draft) return `Draft ${run.scenarios[0] ?? "scenario"}`;
  return run.scenarios.length === 1 ? run.scenarios[0] : plural(run.scenarios.length, "scenario");
}

/** The label a run was started with, or what it ran. */
export function runTitle(run: Pick<RunRecord, "label" | "scenarios" | "draft">): string {
  return run.label ?? runScopeLabel(run);
}

/** The agents a run graded: the ones asked for, or the expected agents its results show. */
export function runAgents(run: Pick<RunRecord, "agents" | "results">): string[] {
  if (run.agents?.length) return run.agents;
  return [...new Set(run.results.map((r) => r.agentId).filter((a): a is string => Boolean(a)))];
}

/** Scenarios × agents × trials, as the run's scope. */
export function runScope(run: Pick<RunRecord, "agents" | "results" | "scenarios" | "trials">): { scenarios: number; agents: number; trials: number; text: string } {
  const agents = runAgents(run).length;
  return { scenarios: run.scenarios.length, agents, trials: run.trials, text: `${run.scenarios.length} × ${agents} × ${run.trials}` };
}

export type RunStatusKind = "unexpected" | "draft" | "expected" | "ungraded";

export interface RunStatus {
  kind: RunStatusKind;
  graded: number;
  unexpected: number;
  label: string;
}

/** How a run's results compare with expected_verdicts; a difference outranks being a draft. */
export function runStatus(run: Pick<RunRecord, "results" | "draft">): RunStatus {
  const graded = run.results.filter((r) => r.expected).length;
  const unexpected = run.results.filter(isUnexpected).length;
  if (unexpected) return { kind: "unexpected", graded, unexpected, label: `${unexpected} unexpected` };
  if (run.draft) return { kind: "draft", graded, unexpected, label: "draft" };
  return graded ? { kind: "expected", graded, unexpected, label: "as expected" } : { kind: "ungraded", graded, unexpected, label: "no expectations" };
}

/** The counts the run pages show: safe, critical, flaky, and against expected_verdicts. */
export function resultCounts(results: ReportSummary[]): { total: number; safe: number; critical: number; flaky: number; multiTrial: number; graded: number; unexpected: number } {
  return {
    total: results.length,
    safe: results.filter((r) => isSafe(r.verdict)).length,
    critical: results.filter((r) => isCritical(r.verdict)).length,
    flaky: results.filter((r) => (r.trials ?? 1) > 1 && isFlaky(r)).length,
    multiTrial: results.filter((r) => (r.trials ?? 1) > 1).length,
    graded: results.filter((r) => r.expected).length,
    unexpected: results.filter(isUnexpected).length,
  };
}

export type RunStatusFilter = "all" | "unexpected" | "expected" | "drafts";

export interface RunFilter {
  q: string;
  status: RunStatusFilter;
  agents: string[];
  versions: string[];
  /** A calendar day, YYYY-MM-DD, as the command center's chart links it. */
  day?: string;
}

/** The value the version filter uses for runs started without a version. */
export const NO_VERSION = "(none)";

/** Whether a run passes the status filter. */
export function matchesStatus(run: Pick<RunRecord, "results" | "draft">, status: RunStatusFilter): boolean {
  const s = runStatus(run);
  if (status === "unexpected") return s.unexpected > 0;
  if (status === "expected") return s.graded > 0 && s.unexpected === 0;
  if (status === "drafts") return run.draft;
  return true;
}

/** The runs that pass every filter; the search looks at the label, run id, version, scenario ids, and agents. */
export function filterRuns(runs: RunRecord[], f: RunFilter): RunRecord[] {
  const q = f.q.trim().toLowerCase();
  return runs.filter((run) => {
    if (!matchesStatus(run, f.status)) return false;
    if (f.day && dayKey(run.startedAt) !== f.day) return false;
    const agents = runAgents(run);
    if (f.agents.length && !agents.some((a) => f.agents.includes(a))) return false;
    if (f.versions.length && !f.versions.includes(run.version ?? NO_VERSION)) return false;
    return !q || [run.label, run.runId, run.version, ...run.scenarios, ...agents].some((text) => text?.toLowerCase().includes(q));
  });
}

/** The runs started in the last `days` days, and in the same span before them. */
export function runPeriods(runs: RunRecord[], days: number, now = Date.now()): { current: RunRecord[]; previous: RunRecord[] } {
  const span = days * 86_400_000;
  const age = (r: RunRecord) => now - Date.parse(r.startedAt);
  return { current: runs.filter((r) => age(r) <= span), previous: runs.filter((r) => age(r) > span && age(r) <= 2 * span) };
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface PeriodNumbers {
  runs: number;
  results: number;
  graded: number;
  unexpected: number;
  /** Graded results that match expected_verdicts, as a share, or null with nothing graded. */
  asExpected: number | null;
  medianMs: number | null;
}

export function periodNumbers(runs: RunRecord[]): PeriodNumbers {
  const results = runs.flatMap((r) => r.results);
  const graded = results.filter((r) => r.expected).length;
  const unexpected = results.filter(isUnexpected).length;
  return {
    runs: runs.length,
    results: results.length,
    graded,
    unexpected,
    asExpected: graded ? (graded - unexpected) / graded : null,
    medianMs: median(runs.map((r) => r.durationMs).filter((d): d is number => typeof d === "number")),
  };
}

/** The numbers of each calendar day of the last `days` days, ending today. */
export function runDays(runs: RunRecord[], days: number, now = Date.now()): Array<PeriodNumbers & { day: string }> {
  const keys = Array.from({ length: days }, (_, i) => dayKey(now - (days - 1 - i) * 86_400_000));
  return keys.map((day) => ({ day, ...periodNumbers(runs.filter((r) => dayKey(r.startedAt) === day)) }));
}

export type DiffChange = "regression" | "improvement" | "split" | "added" | "removed" | "same";

export interface DiffRow {
  scenarioId: string;
  agentId: string;
  before?: ReportSummary;
  after?: ReportSummary;
  change: DiffChange;
}

const DIFF_ORDER: DiffChange[] = ["regression", "improvement", "split", "added", "removed", "same"];

function sameSplit(a: ReportSummary, b: ReportSummary): boolean {
  const keys = new Set([...Object.keys(a.byVerdict ?? {}), ...Object.keys(b.byVerdict ?? {})]) as Set<Verdict>;
  return (a.trials ?? 1) === (b.trials ?? 1) && [...keys].every((v) => (a.byVerdict?.[v] ?? 0) === (b.byVerdict?.[v] ?? 0));
}

/**
 * Each scenario and agent pair of two runs, matched by ids: a regression when the later run's
 * verdict is more severe, an improvement when it is less, a split when the verdict held but the
 * trials divided differently. Regressions come first, the most severe first.
 */
export function runDiff(after: Pick<RunRecord, "results">, before: Pick<RunRecord, "results">): DiffRow[] {
  const id = (r: ReportSummary) => `${r.scenarioId}\n${r.agentId}`;
  const old = new Map(before.results.filter((r) => r.verdict).map((r) => [id(r), r]));
  const rows: DiffRow[] = [];
  for (const a of after.results.filter((r) => r.verdict)) {
    const b = old.get(id(a));
    old.delete(id(a));
    const change: DiffChange = !b ? "added" : VERDICT_SEVERITY[a.verdict!] > VERDICT_SEVERITY[b.verdict!] ? "regression" : VERDICT_SEVERITY[a.verdict!] < VERDICT_SEVERITY[b.verdict!] ? "improvement" : sameSplit(a, b) ? "same" : "split";
    rows.push({ scenarioId: a.scenarioId ?? "", agentId: a.agentId ?? "", before: b, after: a, change });
  }
  for (const b of old.values()) rows.push({ scenarioId: b.scenarioId ?? "", agentId: b.agentId ?? "", before: b, change: "removed" });
  const severity = (r: DiffRow) => VERDICT_SEVERITY[(r.after ?? r.before)!.verdict!];
  return rows.sort((x, y) => DIFF_ORDER.indexOf(x.change) - DIFF_ORDER.indexOf(y.change) || severity(y) - severity(x) || x.scenarioId.localeCompare(y.scenarioId) || x.agentId.localeCompare(y.agentId));
}

export function diffCounts(rows: DiffRow[]): Record<DiffChange, number> {
  const counts = Object.fromEntries(DIFF_ORDER.map((c) => [c, 0])) as Record<DiffChange, number>;
  for (const r of rows) counts[r.change]++;
  return counts;
}

/** The scenarios and agents of a run's results, in the order they appear. */
export function matrixAxes(run: Pick<RunRecord, "results">) {
  const scenarios = [...new Set(run.results.map((r) => r.scenarioId!))];
  const agents = [...new Set(run.results.map((r) => r.agentId!))];
  return { scenarios, agents, at: (s: string, a: string) => run.results.find((r) => r.scenarioId === s && r.agentId === a) };
}

/** The run's matrix as a Markdown table: one row per scenario, one column per agent. */
export function runMarkdown(run: Pick<RunRecord, "results">): string {
  const { scenarios, agents, at } = matrixAxes(run);
  const cell = (r: ReportSummary | undefined) => (r ? `${r.verdict}${isUnexpected(r) ? ` (expected ${r.expected})` : ""}` : "not run");
  return `${[`| Scenario | ${agents.join(" | ")} |`, `| --- |${" --- |".repeat(agents.length)}`, ...scenarios.map((s) => `| ${s} | ${agents.map((a) => cell(at(s, a))).join(" | ")} |`)].join("\n")}\n`;
}

/** Every result of the run as CSV, one row per scenario and agent. */
export function runCsv(run: Pick<RunRecord, "results">): string {
  const rows = run.results.map((r) => [r.scenarioId, r.agentId, r.verdict, r.expected ?? "", r.expected ? r.expected === r.verdict : "", r.trials, r.seed, r.rule, r.reason]);
  return csv([["scenario", "agent", "verdict", "expected", "as_expected", "trials", "seed", "rule", "reason"], ...rows]);
}

function runLine(scenario: string, agents: string[], trials: number, seed: string | null | undefined): string {
  return `npx agentcrucible run --scenario ${scenario} --agents ${agents.join(",")} --trials ${trials}${seed ? ` --seed ${shellQuote(seed)}` : ""}`;
}

/** The commands that run the same matrix from the command line: one per scenario, with the agents it ran. */
export function runCommands(run: Pick<RunRecord, "results" | "trials" | "seed">): string[] {
  const { scenarios } = matrixAxes(run);
  return scenarios.map((s) => runLine(s, run.results.filter((r) => r.scenarioId === s).map((r) => r.agentId!), run.trials, run.seed));
}

/** One row per run with its scope and outcome, for the Runs page's CSV export. */
export function runsCsv(runs: RunRecord[]): string {
  const rows = runs.map((r) => {
    const c = resultCounts(r.results);
    return [r.runId, r.label ?? "", r.version ?? "", r.startedAt, r.durationMs ?? "", r.scenarios.length, runAgents(r).join(" "), r.trials, r.seed ?? "", c.total, c.safe, c.critical, c.graded, c.unexpected, runStatus(r).label, r.actor ?? "", r.draft ? "draft" : (r.origin ?? "")];
  });
  return csv([["run", "label", "version", "started_at", "duration_ms", "scenarios", "agents", "trials", "seed", "results", "safe", "critical", "graded", "unexpected", "status", "started_by", "origin"], ...rows]);
}

/** The run as a JSON document: what was asked for, the outcome, and every result. */
export function runJson(run: RunRecord): string {
  const c = resultCounts(run.results);
  const byVerdict: Partial<Record<Verdict, number>> = {};
  for (const r of run.results) if (r.verdict) byVerdict[r.verdict] = (byVerdict[r.verdict] ?? 0) + 1;
  const doc = {
    runId: run.runId,
    label: run.label ?? null,
    version: run.version ?? null,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt ?? null,
    durationMs: run.durationMs ?? null,
    startedBy: run.actor ?? null,
    origin: run.origin ?? null,
    draft: run.draft,
    scenarios: run.scenarios,
    agents: run.agents,
    trials: run.trials,
    seed: run.seed,
    summary: { results: c.total, safe: c.safe, critical: c.critical, flaky: c.flaky, graded: c.graded, unexpected: c.unexpected, byVerdict },
    results: run.results.map((r) => ({ key: r.key, scenario: r.scenarioId, agent: r.agentId, verdict: r.verdict, expected: r.expected ?? null, asExpected: r.expected ? r.expected === r.verdict : null, trials: r.trials, byVerdict: r.byVerdict, rule: r.rule, reason: r.reason, seed: r.seed })),
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/** What the launcher is about to run. `agents` null means each scenario's expected agents. */
export interface LaunchPlan {
  scenarios: ScenarioSummary[];
  agents: string[] | null;
  trials: number;
  seed?: string;
}

/** The scenario and agent pairs a plan runs, in the order the server runs them. */
export function plannedPairs(plan: Pick<LaunchPlan, "scenarios" | "agents">): Array<{ scenarioId: string; agentId: string }> {
  return plan.scenarios.flatMap((s) => (plan.agents ?? Object.keys(s.expectedVerdicts)).map((agentId) => ({ scenarioId: s.id, agentId })));
}

/**
 * The CLI commands that run the plan: one `--tag` command when the chosen agents run exactly the
 * scenarios of one tag, otherwise one command per scenario. Scenarios that list no expected agents
 * cannot run in expected mode and get no command.
 */
export function launchCommands(plan: LaunchPlan, all: ScenarioSummary[]): string[] {
  const ids = new Set(plan.scenarios.map((s) => s.id));
  if (plan.agents?.length && ids.size > 1) {
    const tags = [...new Set(plan.scenarios.flatMap((s) => s.tags))];
    const tag = tags.find((t) => {
      const tagged = all.filter((s) => s.tags.includes(t));
      return tagged.length === ids.size && tagged.every((s) => ids.has(s.id));
    });
    if (tag) return [`npx agentcrucible run --tag ${shellQuote(tag)} --agents ${plan.agents.join(",")} --trials ${plan.trials}${plan.seed ? ` --seed ${shellQuote(plan.seed)}` : ""}`];
  }
  return plan.scenarios
    .map((s) => ({ id: s.id, agents: plan.agents ?? Object.keys(s.expectedVerdicts) }))
    .filter((s) => s.agents.length)
    .map((s) => runLine(s.id, s.agents, plan.trials, plan.seed));
}

const AVATAR_COLORS = ["clay", "moss", "slate", "plum", "ochre", "teal"];

/** The avatar color of whoever started a run: the profile's own color, or a stable one from the name. */
export function actorColor(name: string, profile?: { name: string; color: string }): string {
  if (profile && profile.name === name) return profile.color;
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/** The CLI command that repeats a sweep. */
export function sweepCommand(s: SweepSummary): string {
  const parts = ["agentcrucible", "sweep", "--scenario", shellQuote(s.scenarioId), "--agent", shellQuote(s.agentId), "--kinds", s.kinds.map((k) => k.kind).join(","), "--steps", String(s.steps.length)];
  if (s.trials !== 1) parts.push("--trials", String(s.trials));
  if (s.seed !== `sweep-${s.scenarioId}`) parts.push("--seed", shellQuote(s.seed));
  return parts.join(" ");
}

/** Every cell of a sweep as CSV, one row per fault kind and step. */
export function sweepCsv(s: SweepSummary): string {
  const rows = s.cells.map((c) => {
    const step = s.steps[c.step - 1];
    return [c.kind, s.kinds.find((k) => k.kind === c.kind)?.stage ?? "", c.step, step.tool, step.callIndex, step.mutating, c.verdict, c.rule, c.fired, c.calls, c.reason];
  });
  return csv([["fault_kind", "stage", "step", "tool", "call_index", "mutating", "verdict", "rule", "fired", "calls", "reason"], ...rows]);
}

export interface SweepFilter {
  q: string;
  agents: string[];
  /** "critical" keeps sweeps where some run ended HARMFUL_ACTION or SILENT_FAILURE. */
  outcome: "all" | "critical" | "clean";
}

/** The sweeps that pass the filter; the search looks at the sweep id, scenario, and agent. */
export function filterSweeps(sweeps: SweepListItem[], f: SweepFilter): SweepListItem[] {
  const q = f.q.trim().toLowerCase();
  return sweeps.filter((s) => {
    if (f.agents.length && !f.agents.includes(s.agentId)) return false;
    if (f.outcome === "critical" && !s.score.critical) return false;
    if (f.outcome === "clean" && s.score.critical) return false;
    return !q || [s.sweepId, s.scenarioId, s.agentId].some((text) => text.toLowerCase().includes(q));
  });
}
