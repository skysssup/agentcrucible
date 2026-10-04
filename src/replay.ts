import { gradeTrial } from "./grader.js";
import { createToolCaller } from "./harness.js";
import { createWorlds, faultDefinitions, type Registry } from "./registry.js";
import { sameJson as same } from "./schema.js";
import type { RunReport, ToolCallRecord, Verdict } from "./types.js";

export interface ReplayDivergence {
  /** The call whose replay differs, or "setup" / "end" for the state before the first call or after the last. */
  at: string;
  field: string;
  recorded: unknown;
  replayed: unknown;
}

export interface ReplayedTrial {
  trialIndex: number;
  /** Recorded calls that were replayed before the trial ended or diverged. */
  replayedCalls: number;
  divergence?: ReplayDivergence;
  recordedVerdict: Verdict;
  /** Verdict of the replayed trace under the current grader; absent when the replay diverged. */
  verdict?: Verdict;
  recordedRules: string[];
  rules?: string[];
  /** True when the calls replayed identically and the trial graded the same. */
  reproduced: boolean;
}

export interface ReplayResult {
  scenarioId: string;
  agentId: string;
  trials: ReplayedTrial[];
  /** True when every trial replayed identically and graded the same. */
  reproduced: boolean;
}

const COMPARED: Array<keyof ToolCallRecord> = ["tool", "args", "committed", "committedResult", "observed", "faultApplied", "faultIndex", "budgetExceeded", "schemaErrors", "worldSnapshotAfter"];

/**
 * Re-executes the tool calls recorded in a report, in order, against fresh instances of the same
 * worlds with the same seed, fault schedule, and budget, without running the agent. Each replayed
 * call must match the recorded one (what ran, what the world returned, what the agent saw, and the
 * state after it); the first difference is reported. Matching trials are graded again with the
 * current grader and the report's scenario, so a changed verdict shows grading drift.
 */
export function replayReport(report: RunReport, registry: Registry): ReplayResult {
  for (const kind of new Set(report.faults.map((f) => f.kind))) {
    if (!registry.faults.has(kind)) throw new Error(`cannot replay: fault kind "${kind}" is not registered (load its extension with --config)`);
  }
  for (const name of report.worlds) {
    if (!registry.worlds.has(name)) throw new Error(`cannot replay: world "${name}" is not registered (load its extension with --config)`);
  }
  const world = createWorlds(registry, report.worlds);
  const faultKinds = faultDefinitions(registry);
  const scenario = report.scenario;

  const trials = report.trials.map((trial): ReplayedTrial => {
    const recorded = trial.trace;
    const base = {
      trialIndex: recorded.trialIndex,
      recordedVerdict: trial.verdict,
      recordedRules: trial.findings.map((f) => f.rule),
    };
    world.reset();
    if (scenario.setup.length) world.seed!(structuredClone(scenario.setup));
    const before = world.snapshot();
    if (!same(before, recorded.worldBefore)) {
      return { ...base, replayedCalls: 0, reproduced: false, divergence: { at: "setup", field: "worldBefore", recorded: recorded.worldBefore, replayed: before } };
    }
    const caller = createToolCaller({ world, faults: report.faults, faultKinds, seed: report.seed, trialIndex: recorded.trialIndex, budget: scenario.budget });
    for (const [i, call] of recorded.calls.entries()) {
      let replayed: ToolCallRecord;
      try {
        replayed = caller.call(call.tool, call.argsError === undefined ? call.args : null);
      } catch (err) {
        return { ...base, replayedCalls: i, reproduced: false, divergence: { at: call.id, field: "error", recorded: call.observed, replayed: (err as Error).message } };
      }
      const field = COMPARED.find((key) => !same(call[key], replayed[key]));
      if (field) return { ...base, replayedCalls: i + 1, reproduced: false, divergence: { at: call.id, field, recorded: call[field], replayed: replayed[field] } };
    }
    const after = world.snapshot();
    if (!same(after, recorded.worldAfter)) {
      return { ...base, replayedCalls: recorded.calls.length, reproduced: false, divergence: { at: "end", field: "worldAfter", recorded: recorded.worldAfter, replayed: after } };
    }
    const graded = gradeTrial({ ...recorded, calls: caller.calls, worldAfter: after }, world, scenario);
    const rules = graded.findings.map((f) => f.rule);
    return { ...base, replayedCalls: recorded.calls.length, verdict: graded.verdict, rules, reproduced: graded.verdict === trial.verdict && same(rules, base.recordedRules) };
  });

  return {
    scenarioId: report.scenarioId,
    agentId: report.agentId,
    trials,
    reproduced: trials.every((t) => t.reproduced),
  };
}
