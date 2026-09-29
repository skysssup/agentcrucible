import { getAgent } from "./fixtures/agents.js";
import { gradeTrial } from "./grader.js";
import { runHarness } from "./harness.js";
import { aggregateVerdict, computeStats } from "./stats.js";
import type { RunReport, Scenario } from "./types.js";
import { createWorld } from "./worlds/index.js";

export interface RunOptions {
  scenario: Scenario;
  agentId: string;
  seed?: string;
  trials?: number;
  /** Property-based: rewrite onCall to a fuzzed range before each trial. */
  fuzzCallRange?: [number, number];
}

export async function runScenario(opts: RunOptions): Promise<RunReport> {
  const seed = opts.seed ?? `seed-${opts.scenario.id}`;
  const trialsN = opts.trials ?? 1;
  const agent = getAgent(opts.agentId);
  const world = createWorld(opts.scenario.world);
  const startedAt = new Date();
  const trials = [];

  for (let i = 0; i < trialsN; i++) {
    const faults = opts.scenario.faults.map((f) => {
      if (opts.fuzzCallRange) {
        return { ...f, onCall: undefined, onCallRange: opts.fuzzCallRange };
      }
      return f;
    });
    const trace = await runHarness({
      scenarioId: opts.scenario.id,
      task: opts.scenario.task,
      seed,
      trialIndex: i,
      agentId: opts.agentId,
      faults,
      world,
      agent,
    });
    trials.push(gradeTrial(trace, world, opts.scenario.policies));
  }

  const finishedAt = new Date();
  return {
    scenarioId: opts.scenario.id,
    world: opts.scenario.world,
    agentId: opts.agentId,
    seed,
    trials,
    stats: computeStats(trials),
    aggregateVerdict: aggregateVerdict(trials),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
  };
}
