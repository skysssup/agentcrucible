import { describe, expect, it } from "vitest";
import { AGENTS } from "../src/fixtures/agents.js";
import { runHarness } from "../src/harness.js";
import { runScenario } from "../src/runner.js";
import { findScenarios, loadAllScenarios } from "../src/scenarios.js";
import type { RunReport } from "../src/types.js";
import { createWorld } from "../src/worlds/index.js";

/** Everything except wall-clock timing. */
const stable = ({ startedAt: _s, finishedAt: _f, durationMs: _d, ...rest }: RunReport) => rest;

describe("reproducibility", () => {
  it.each(loadAllScenarios())("$id gives identical reports for the same seed", async (scenario) => {
    for (const agentId of Object.keys(AGENTS)) {
      const a = await runScenario({ scenario, agentId, trials: 3, seed: "repro" });
      const b = await runScenario({ scenario, agentId, trials: 3, seed: "repro" });
      expect(stable(a)).toEqual(stable(b));
    }
  });

  it("gives the same results when runs execute concurrently", async () => {
    const jobs = loadAllScenarios().flatMap((scenario) =>
      ["naive-retry", "cross-checker"].map((agentId) => ({ scenario, agentId }))
    );
    const sequential = [];
    for (const job of jobs) sequential.push(stable(await runScenario({ ...job, trials: 4, seed: "conc" })));
    const concurrent = await Promise.all(jobs.map(async (job) => stable(await runScenario({ ...job, trials: 4, seed: "conc" }))));
    expect(concurrent).toEqual(sequential);
  });
});

describe("isolation", () => {
  it("starts every trial from the initial world state", async () => {
    const world = createWorld("payments");
    const initial = world.snapshot();
    for (let trialIndex = 0; trialIndex < 3; trialIndex++) {
      const trace = await runHarness({
        scenarioId: "iso", task: "t", seed: "s", trialIndex, agentId: "a", faults: [], world,
        agent: async (ctx) => {
          await ctx.callTool("create_refund", { order_id: "1", amount_cents: 100 });
          return "done";
        },
      });
      expect(trace.worldBefore).toEqual(initial);
      expect(trace.calls[0].committedResult).toMatchObject({ refund_id: "re_1_1" });
    }
  });

  it("does not let one scenario affect the next", async () => {
    const target = findScenarios({ id: "payments/rate-limit" })[0];
    const alone = stable(await runScenario({ scenario: target, agentId: "naive-retry" }));
    for (const scenario of loadAllScenarios()) await runScenario({ scenario, agentId: "naive-retry", trials: 2 });
    expect(stable(await runScenario({ scenario: target, agentId: "naive-retry" }))).toEqual(alone);
  });

  it("numbers calls and effects per trial", async () => {
    const report = await runScenario({ scenario: findScenarios({ id: "payments/timeout-after-commit" })[0], agentId: "naive-retry", trials: 3 });
    for (const trial of report.trials) {
      expect(trial.trace.calls.map((c) => c.id)).toEqual(["call_1", "call_2"]);
      expect(trial.effects.map((e) => e.id)).toEqual(["re_1_4471", "re_2_4471"]);
    }
  });
});
