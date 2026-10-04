import { gradeTrial } from "./grader.js";
import { runHarness, type ScriptedAgent } from "./harness.js";
import { builtinRegistry, createWorlds, faultDefinitions, getAgent, type Registry } from "./registry.js";
import { aggregateVerdict, computeStats } from "./stats.js";
import { REPORT_VERSION, type FaultSpec, type GradedTrial, type RunReport, type Scenario } from "./types.js";
import { VERSION } from "./version.js";

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
  /** A registered agent id, or the label for `agent`. */
  agentId?: string;
  /** Your own agent function. When given, `agentId` is only a label (default "custom"). */
  agent?: ScriptedAgent;
  /** Defaults to `seed-<scenario id>`. */
  seed?: string;
  trials?: number;
  /** Replaces every fault's call selection with one seeded call index in this range per trial. */
  fuzzCallRange?: [number, number];
  /** Worlds, fault kinds, and agents to use. Defaults to the built-ins; pass the registry the scenario was loaded with. */
  registry?: Registry;
}

export async function runScenario(opts: RunOptions): Promise<RunReport> {
  const { scenario } = opts;
  const registry = opts.registry ?? builtinRegistry();
  const seed = opts.seed ?? `seed-${scenario.id}`;
  const trialCount = parseTrials(opts.trials ?? 1);
  const range = opts.fuzzCallRange;
  if (range && !(range.length === 2 && range.every((n) => Number.isSafeInteger(n) && n >= 1) && range[0] <= range[1])) {
    throw new Error(`Invalid fuzz call range ${JSON.stringify(range)} (expected [low, high] with positive integers and low <= high)`);
  }
  if (!opts.agent && !opts.agentId) throw new Error("runScenario needs agentId (a registered agent) or agent (your own function)");
  const agentId = opts.agentId ?? "custom";
  const agent = opts.agent ?? getAgent(registry, agentId).run;
  const faults: FaultSpec[] = range
    ? scenario.faults.map(({ onCall: _a, onCalls: _b, fromCall: _c, onCallRange: _d, ...f }) => ({ ...f, onCallRange: range }))
    : scenario.faults;
  const world = createWorlds(registry, scenario.worlds);
  const faultKinds = faultDefinitions(registry);
  const startedAt = new Date();
  const trials: GradedTrial[] = [];

  for (let i = 0; i < trialCount; i++) {
    let trace;
    try {
      trace = await runHarness({
        scenarioId: scenario.id,
        task: scenario.task,
        seed,
        trialIndex: i,
        agentId,
        faults,
        faultKinds,
        budget: scenario.budget,
        setup: scenario.setup,
        world,
        agent,
      });
    } catch (err) {
      throw new Error(`Agent "${agentId}" failed in trial ${i} of ${scenario.id}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }
    trials.push(gradeTrial(trace, world, scenario));
  }

  const finishedAt = new Date();
  return {
    reportVersion: REPORT_VERSION,
    toolVersion: VERSION,
    scenarioId: scenario.id,
    worlds: scenario.worlds,
    agentId,
    seed,
    scenario,
    faults,
    trials,
    stats: computeStats(trials),
    aggregateVerdict: aggregateVerdict(trials),
    warnings: runWarnings(scenario, faults, trials),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
  };
}

function runWarnings(scenario: Scenario, faults: FaultSpec[], trials: GradedTrial[]): string[] {
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
