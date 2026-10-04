import { BUILTIN_AGENTS } from "../src/fixtures/agents.js";
import { gradeTrial } from "../src/grader.js";
import type { ScriptedAgent } from "../src/harness.js";
import { builtinRegistry, createWorlds } from "../src/registry.js";
import { parseScenario } from "../src/scenarios.js";
import type { GradedTrial, PolicySpec, ScenarioExpectations, TrialTrace } from "../src/types.js";
import type { World } from "../src/worlds/types.js";

/** A fresh built-in world, or several combined. */
export function createWorld(name: string | string[]): World {
  return createWorlds(builtinRegistry(), Array.isArray(name) ? name : [name]);
}

export function getAgent(id: string): ScriptedAgent {
  return BUILTIN_AGENTS[id].run;
}

/** Expectations written the way a scenario file writes them. */
export function expectations(world: string | string[], expect: unknown): ScenarioExpectations {
  const where = Array.isArray(world) ? { worlds: world } : { world };
  return parseScenario({ id: "test", ...where, description: "d", task: "t", expect }).expect!;
}

export function grade(trace: TrialTrace, world: World, policies: PolicySpec = {}, expect?: ScenarioExpectations): GradedTrial {
  return gradeTrial(trace, world, { policies, expect });
}
