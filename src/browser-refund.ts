/** Browser-safe slice of the real engine. No server, model adapter, or file access. */
import { BUILTIN_AGENTS } from "./fixtures/agents.js";
import { gradeTrial } from "./grader.js";
import { runHarness } from "./harness.js";
import type { Scenario } from "./types.js";
import { createPaymentsWorld } from "./worlds/payments.js";

export async function runRefundExperiment(scenario: Scenario, seed = "demo", agentIds = Object.keys(scenario.expectedVerdicts)) {
  if (scenario.worlds.length !== 1 || scenario.worlds[0] !== "payments") throw new Error("This browser experiment supports the payments world only.");
  const results = [];
  for (const agentId of agentIds) {
    const agent = BUILTIN_AGENTS[agentId];
    if (!agent) throw new Error(`Unknown scripted agent: ${agentId}`);
    const world = createPaymentsWorld();
    const trace = await runHarness({ scenarioId: scenario.id, task: scenario.task, seed, trialIndex: 0, agentId, world, agent: agent.run, faults: scenario.faults, setup: scenario.setup, budget: scenario.budget, timeoutMs: 5000 });
    results.push({ agentId, seed, scenarioId: scenario.id, ...gradeTrial(trace, world, scenario) });
  }
  return results;
}
