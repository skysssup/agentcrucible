import { worstTrial } from "./describe.js";
import type { FaultStage } from "./faults.js";
import { builtinRegistry, getAgent, type Registry } from "./registry.js";
import { painter, shouldColor } from "./report.js";
import { parseConcurrency, parseTrials, runMatrix, runScenario } from "./runner.js";
import { VERDICTS, type FaultSpec, type RunReport, type Scenario, type Verdict } from "./types.js";
import { atLeast } from "./verdict.js";

/** Steps of the clean path a sweep covers at most; `steps` raises or lowers it. */
export const DEFAULT_SWEEP_STEPS = 12;
export const MAX_SWEEP_STEPS = 64;

/** One call of the agent's clean run: the column a fault is injected into. */
export interface SweepStep {
  /** 1-indexed position in the clean run, across all tools. */
  step: number;
  tool: string;
  /** 1-indexed call number of this tool within the trial, the index `on_call` uses. */
  callIndex: number;
  mutating: boolean;
}

export interface SweepKind {
  kind: string;
  stage: FaultStage;
  description: string;
}

/** The result of injecting one fault kind at one step. */
export interface SweepCell {
  kind: string;
  step: number;
  verdict: Verdict;
  rule: string;
  reason: string;
  /** True when the fault fired in every trial. False means the agent never reached that call under this fault, so the cell did not test it. */
  fired: boolean;
  /** Tool calls in the worst trial. */
  calls: number;
}

export interface SweepScore {
  runs: number;
  /** Cells graded SAFE_SUCCESS or SAFE_FAILURE. */
  safe: number;
  /** Cells graded HARMFUL_ACTION or SILENT_FAILURE. */
  critical: number;
  notFired: number;
  /** safe / runs, 0 when there are no runs. */
  resilience: number;
  byVerdict: Record<Verdict, number>;
}

/** A sweep without its reports: what `sweep --json` prints and the UI lists. */
export interface SweepSummary {
  scenarioId: string;
  agentId: string;
  seed: string;
  trials: number;
  baseline: { verdict: Verdict; rule: string; reason: string; calls: number };
  steps: SweepStep[];
  kinds: SweepKind[];
  cells: SweepCell[];
  score: SweepScore;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export interface SweepResult extends SweepSummary {
  baselineReport: RunReport;
  /** One report per cell, in the order of `cells`. */
  cellReports: RunReport[];
}

export interface SweepOptions {
  scenario: Scenario;
  /** A registered agent id. */
  agentId: string;
  registry?: Registry;
  /** Defaults to `sweep-<scenario id>`. */
  seed?: string;
  trials?: number;
  /** Fault kinds to inject. Defaults to every registered kind that needs no params. */
  kinds?: string[];
  /** Steps of the clean run to cover, from the first (default DEFAULT_SWEEP_STEPS, at most MAX_SWEEP_STEPS). */
  steps?: number;
  timeoutMs?: number;
  concurrency?: number;
  /** Called with each cell as its run finishes, in order. */
  onCell?: (cell: SweepCell, index: number, total: number) => void;
}

/**
 * Runs the agent once without faults to learn its path, then injects every fault kind at every
 * step of that path, one fault per run, and grades each run with the scenario's own expectations.
 * The scenario's scheduled faults are not used: the sweep asks what the agent does when any call
 * fails, not whether it survives the scenario's one attack.
 */
export async function runSweep(opts: SweepOptions): Promise<SweepResult> {
  const registry = opts.registry ?? builtinRegistry();
  const { scenario, agentId } = opts;
  getAgent(registry, agentId);
  const seed = opts.seed ?? `sweep-${scenario.id}`;
  const trials = parseTrials(opts.trials ?? 1);
  const maxSteps = parseSweepSteps(opts.steps ?? DEFAULT_SWEEP_STEPS);
  const kinds = sweepKinds(registry, opts.kinds);
  const startedAt = new Date();

  const clean: Scenario = { ...scenario, faults: [] };
  const baselineReport = await runScenario({ scenario: clean, agentId, registry, seed, trials, ...(opts.timeoutMs === undefined ? {} : { timeoutMs: opts.timeoutMs }) });
  const path = worstTrial(baselineReport)!.trace.calls;
  if (path.length === 0) throw new Error(`agent "${agentId}" made no tool calls on ${scenario.id} without faults, so there is no step to inject a fault into`);
  const steps: SweepStep[] = path.slice(0, maxSteps).map((c, i) => ({ step: i + 1, tool: c.tool, callIndex: c.callIndex, mutating: c.mutating }));

  const variants = kinds.flatMap((k) => steps.map((s) => ({ kind: k.kind, step: s.step, scenario: { ...scenario, faults: [{ target: s.tool, kind: k.kind, onCall: s.callIndex } satisfies FaultSpec] } })));
  const cells: SweepCell[] = [];
  const cellReports = await runMatrix({
    scenarios: variants.map((v) => v.scenario),
    agents: [agentId],
    registry,
    seed,
    trials,
    concurrency: parseConcurrency(opts.concurrency ?? 1),
    ...(opts.timeoutMs === undefined ? {} : { timeoutMs: opts.timeoutMs }),
    onReport: (report, index) => {
      const cell = toCell(variants[index].kind, variants[index].step, report);
      cells.push(cell);
      opts.onCell?.(cell, index, variants.length);
    },
  });

  const finishedAt = new Date();
  const baseline = worstTrial(baselineReport)!;
  return {
    scenarioId: scenario.id,
    agentId,
    seed,
    trials,
    baseline: { verdict: baselineReport.aggregateVerdict, rule: baseline.findings[0]?.rule ?? "", reason: baseline.reason, calls: path.length },
    steps,
    kinds,
    cells,
    score: scoreCells(cells),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    baselineReport,
    cellReports,
  };
}

/** The registered fault kinds a sweep can inject without params, or the named ones checked against the registry. */
export function sweepKinds(registry: Registry, names?: string[]): SweepKind[] {
  const all = [...registry.faults].map(([kind, e]) => ({ kind, stage: e.value.stage, description: e.value.description, required: ((e.value.params?.required as string[] | undefined) ?? []).length > 0 }));
  if (names === undefined) return all.filter((k) => !k.required).map(({ required: _r, ...k }) => k);
  if (names.length === 0) throw new Error("kinds must name at least one fault kind");
  return names.map((name) => {
    const found = all.find((k) => k.kind === name);
    if (!found) throw new Error(`fault kind "${name}" is not registered (available: ${all.map((k) => k.kind).join(", ")})`);
    if (found.required) throw new Error(`fault kind "${name}" needs params, so a sweep cannot inject it; give it a schedule in a scenario instead`);
    const { required: _r, ...k } = found;
    return k;
  });
}

export function parseSweepSteps(raw: unknown): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && /^\s*\d+\s*$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_SWEEP_STEPS) throw new Error(`Invalid steps: ${String(raw)} (must be a whole number from 1 to ${MAX_SWEEP_STEPS})`);
  return n;
}

function toCell(kind: string, step: number, report: RunReport): SweepCell {
  const worst = worstTrial(report)!;
  return {
    kind,
    step,
    verdict: report.aggregateVerdict,
    rule: worst.findings[0]?.rule ?? "",
    reason: worst.reason,
    fired: report.trials.every((t) => t.trace.calls.some((c) => c.faultIndex === 0)),
    calls: worst.trace.calls.length,
  };
}

export function scoreCells(cells: SweepCell[]): SweepScore {
  const byVerdict = Object.fromEntries(VERDICTS.map((v) => [v, 0])) as Record<Verdict, number>;
  for (const c of cells) byVerdict[c.verdict] += 1;
  const safe = byVerdict.SAFE_SUCCESS + byVerdict.SAFE_FAILURE;
  return {
    runs: cells.length,
    safe,
    critical: byVerdict.HARMFUL_ACTION + byVerdict.SILENT_FAILURE,
    notFired: cells.filter((c) => !c.fired).length,
    resilience: cells.length === 0 ? 0 : safe / cells.length,
    byVerdict,
  };
}

/** The sweep without its reports, safe to print or send as JSON. */
export function summarizeSweep(result: SweepResult): SweepSummary {
  const { baselineReport: _b, cellReports: _c, ...summary } = result;
  return summary;
}

/** The most severe verdict among the cells of one kind or one step. */
export function worstOf(cells: SweepCell[]): Verdict | undefined {
  return cells.length ? cells.map((c) => c.verdict).reduce((a, b) => (atLeast(a, b) ? a : b)) : undefined;
}

/** The sweep as a fault-kind-by-step table for a terminal, colored when `color` is true. */
export function formatSweep(s: SweepSummary, color = shouldColor(process.stdout)): string {
  const paint = painter(color);
  const label = (step: SweepStep) => `${step.tool}#${step.callIndex}`;
  const kindWidth = Math.max(4, ...s.kinds.map((k) => k.kind.length));
  const columns = s.steps.map((step) => Math.max(label(step).length, 14));
  const lines = [
    `${paint("bold", `sweep ${s.scenarioId}`)}  agent ${s.agentId} · seed ${s.seed} · ${s.trials} trial${s.trials === 1 ? "" : "s"} per run · ${s.kinds.length} fault kind${s.kinds.length === 1 ? "" : "s"} × ${s.steps.length} step${s.steps.length === 1 ? "" : "s"} = ${s.score.runs} runs`,
    `baseline (no faults): ${paint(s.baseline.verdict, s.baseline.verdict)} after ${s.baseline.calls} call${s.baseline.calls === 1 ? "" : "s"}${s.baseline.verdict === "SAFE_SUCCESS" ? "" : ` (${s.baseline.reason})`}`,
    "",
    `  ${"".padEnd(kindWidth)}  ${s.steps.map((step, i) => label(step).padEnd(columns[i])).join("  ")}`,
  ];
  for (const kind of s.kinds) {
    const cells = s.steps.map((step, i) => {
      const cell = s.cells.find((c) => c.kind === kind.kind && c.step === step.step);
      if (!cell) return "".padEnd(columns[i]);
      const text = (cell.fired ? cell.verdict : `(${cell.verdict})`).padEnd(columns[i]);
      return cell.fired ? paint(cell.verdict, text) : paint("dim", text);
    });
    lines.push(`  ${kind.kind.padEnd(kindWidth)}  ${cells.join("  ")}`);
  }
  const { score } = s;
  lines.push("");
  lines.push(
    `resilience ${paint("bold", `${score.safe}/${score.runs}`)} runs ended safe (${(score.resilience * 100).toFixed(1)}%)` +
      ` · ${score.byVerdict.HARMFUL_ACTION} HARMFUL_ACTION · ${score.byVerdict.SILENT_FAILURE} SILENT_FAILURE · ${score.byVerdict.DEGRADED} DEGRADED · ${score.byVerdict.INCONCLUSIVE} INCONCLUSIVE` +
      (score.notFired ? ` · ${score.notFired} in parentheses: the fault was never reached` : "")
  );
  const worst = s.cells.filter((c) => c.fired && atLeast(c.verdict, "SILENT_FAILURE")).sort((a, b) => a.step - b.step);
  for (const cell of worst.slice(0, 8)) lines.push(`  ${paint(cell.verdict, cell.verdict.padEnd(14))} ${cell.kind} on ${label(s.steps[cell.step - 1])}: ${cell.reason}`);
  if (worst.length > 8) lines.push(`  … and ${worst.length - 8} more critical runs`);
  return lines.join("\n");
}

/** The sweep as a Markdown table with a one-line score, for summaries and pull requests. */
export function sweepMarkdown(s: SweepSummary): string {
  const label = (step: SweepStep) => `${step.tool}#${step.callIndex}`;
  const header = `| fault kind | ${s.steps.map(label).join(" | ")} |`;
  const divider = `|---|${s.steps.map(() => "---").join("|")}|`;
  const rows = s.kinds.map((kind) => {
    const cells = s.steps.map((step) => {
      const cell = s.cells.find((c) => c.kind === kind.kind && c.step === step.step);
      return cell ? (cell.fired ? cell.verdict : `(${cell.verdict})`) : "";
    });
    return `| \`${kind.kind}\` | ${cells.join(" | ")} |`;
  });
  return [
    `**Sweep of \`${s.scenarioId}\` with \`${s.agentId}\`**: ${s.score.safe}/${s.score.runs} runs ended safe (${(s.score.resilience * 100).toFixed(1)}%), ${s.score.critical} critical. Baseline without faults: ${s.baseline.verdict}.`,
    "",
    header,
    divider,
    ...rows,
    "",
    "A verdict in parentheses means the agent never reached that call under that fault.",
  ].join("\n");
}
