import { getAgent } from "./fixtures/agents.js";
import { gradeTrial } from "./grader.js";
import { runHarness, type ScriptedAgent } from "./harness.js";
import { aggregateVerdict, computeStats } from "./stats.js";
import type { GradedTrial, RunReport, Scenario } from "./types.js";
import { VERSION } from "./version.js";
import { createWorld } from "./worlds/index.js";

export const MAX_TRIALS = 10_000;

/** Accepts integers 1..MAX_TRIALS, as numbers or digit strings. */
export function parseTrials(raw: unknown): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && /^\s*\d+\s*$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_TRIALS) {
    throw new Error(`Invalid trials value: ${String(raw)} (must be a positive integer no greater than ${MAX_TRIALS})`);
  }
  return n;
}

export interface RunOptions {
  scenario: Scenario;
  /** A built-in scripted agent id, or the label for `agent`. */
  agentId?: string;
  /** Your own agent function. When given, `agentId` is only a label (default "custom"). */
  agent?: ScriptedAgent;
  /** Defaults to `seed-<scenario id>`. */
  seed?: string;
  trials?: number;
  /** Replaces every fault's call selection with one seeded call index in this range per trial. */
  fuzzCallRange?: [number, number];
}

export async function runScenario(opts: RunOptions): Promise<RunReport> {
  const { scenario } = opts;
  const seed = opts.seed ?? `seed-${scenario.id}`;
  const trialCount = parseTrials(opts.trials ?? 1);
  const range = opts.fuzzCallRange;
  if (range && !(range.length === 2 && range.every((n) => Number.isSafeInteger(n) && n >= 1) && range[0] <= range[1])) {
    throw new Error(`Invalid fuzz call range ${JSON.stringify(range)} (expected [low, high] with positive integers and low <= high)`);
  }
  if (!opts.agent && !opts.agentId) throw new Error("runScenario needs agentId (a scripted agent) or agent (your own function)");
  const agentId = opts.agentId ?? "custom";
  const agent = opts.agent ?? getAgent(agentId);
  const faults = range
    ? scenario.faults.map(({ onCall: _onCall, ...f }) => ({ ...f, onCallRange: range }))
    : scenario.faults;
  const world = createWorld(scenario.world);
  const startedAt = new Date();
  const trials: GradedTrial[] = [];

  for (let i = 0; i < trialCount; i++) {
    let trace;
    try {
      trace = await runHarness({ scenarioId: scenario.id, task: scenario.task, seed, trialIndex: i, agentId, faults, world, agent });
    } catch (err) {
      throw new Error(`Agent "${agentId}" failed in trial ${i} of ${scenario.id}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }
    trials.push(gradeTrial(trace, world, scenario.policies, scenario.expect));
  }

  const finishedAt = new Date();
  const stats = computeStats(trials);
  return {
    toolVersion: VERSION,
    scenarioId: scenario.id,
    world: scenario.world,
    agentId,
    seed,
    scenario,
    trials,
    stats,
    aggregateVerdict: aggregateVerdict(trials),
    warnings: runWarnings(scenario, faults, trials),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
  };
}

function runWarnings(scenario: Scenario, faults: Scenario["faults"], trials: GradedTrial[]): string[] {
  const warnings: string[] = [];
  if (!scenario.expect) {
    warnings.push("The scenario declares no expectations, so task completion was not checked and no trial can be SAFE_SUCCESS.");
  }
  faults.forEach((fault, index) => {
    const fired = trials.filter((t) => t.trace.calls.some((c) => c.faultIndex === index)).length;
    if (fired === trials.length) return;
    const label = `faults[${index}] (${fault.kind} on ${fault.target})`;
    warnings.push(
      fired === 0
        ? `${label} did not fire in any of ${trials.length} trial(s); this run did not exercise it.`
        : `${label} fired in ${fired} of ${trials.length} trials; the others ran without it.`
    );
  });
  return warnings;
}
