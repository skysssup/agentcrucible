import { describe, expect, it } from "vitest";
import { runHarness, type ScriptedAgent } from "../src/harness.js";
import { builtinRegistry, extendRegistry } from "../src/registry.js";
import { MAX_CONCURRENCY, parseConcurrency, parseTimeout, runMatrix, runScenario } from "../src/runner.js";
import { findScenarios, loadAllScenarios } from "../src/scenarios.js";
import type { RunReport } from "../src/types.js";
import { createWorld } from "./helpers.js";

/** A report without the fields that differ between two runs of the same thing. */
const stable = ({ startedAt: _s, finishedAt: _f, durationMs: _d, ...rest }: RunReport) => rest;

describe("parseTimeout and parseConcurrency", () => {
  it("accept whole numbers as numbers or digit strings", () => {
    expect(parseTimeout(250)).toBe(250);
    expect(parseTimeout(" 10 ")).toBe(10);
    expect(parseConcurrency("8")).toBe(8);
    expect(parseConcurrency(MAX_CONCURRENCY)).toBe(MAX_CONCURRENCY);
  });

  it.each([0, -1, 1.5, "abc", "", NaN, null])("reject timeout %j", (raw) => {
    expect(() => parseTimeout(raw)).toThrow(/Invalid timeout: .* \(must be a whole number of milliseconds, at least 1\)/);
  });

  it.each([0, MAX_CONCURRENCY + 1, 2.5, "two"])("reject concurrency %j", (raw) => {
    expect(() => parseConcurrency(raw)).toThrow(/Invalid concurrency: .* \(must be a whole number from 1 to 64\)/);
  });

  it("are enforced by runScenario", async () => {
    const scenario = findScenarios({ id: "payments/rate-limit" })[0];
    await expect(runScenario({ scenario, agentId: "honest-stop", timeoutMs: 0 })).rejects.toThrow(/Invalid timeout: 0/);
  });
});

describe("runMatrix", () => {
  const scenarios = loadAllScenarios().filter((s) => s.tags.includes("smoke"));
  const agents = ["naive-retry", "cross-checker", "verify-after-write"];

  it("returns every scenario against every agent, in that order, whatever the concurrency", async () => {
    const sequential = await runMatrix({ scenarios, agents, trials: 2 });
    expect(sequential.map((r) => [r.scenarioId, r.agentId])).toEqual(scenarios.flatMap((s) => agents.map((a) => [s.id, a])));
    for (const concurrency of [3, 8, 64]) {
      const seen: string[] = [];
      const parallel = await runMatrix({ scenarios, agents, trials: 2, concurrency, onReport: (r, i) => seen.push(`${i}:${r.scenarioId}:${r.agentId}`) });
      expect(parallel.map(stable)).toEqual(sequential.map(stable));
      expect(seen).toEqual(sequential.map((r, i) => `${i}:${r.scenarioId}:${r.agentId}`));
    }
  });

  it("takes a per-scenario agent list from a function", async () => {
    const reports = await runMatrix({ scenarios, agents: (s) => Object.keys(s.expectedVerdicts).slice(0, 2) });
    expect(reports.map((r) => [r.scenarioId, r.agentId])).toEqual(scenarios.flatMap((s) => Object.keys(s.expectedVerdicts).slice(0, 2).map((a) => [s.id, a])));
    expect(await runMatrix({ scenarios, agents: () => [] })).toEqual([]);
  });

  it("runs the same trials as runScenario does", async () => {
    const [matrix] = await runMatrix({ scenarios: scenarios.slice(0, 1), agents: ["idempotent-retry"], trials: 3, seed: "m" });
    const single = await runScenario({ scenario: scenarios[0], agentId: "idempotent-retry", trials: 3, seed: "m" });
    expect(stable(matrix)).toEqual(stable(single));
  });

  it("really runs jobs at the same time when asked to", async () => {
    let inFlight = 0;
    let peak = 0;
    const slow: ScriptedAgent = async (ctx) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      await ctx.callTool("create_refund", { order_id: "1", amount_cents: 1, idempotency_key: "k" });
      inFlight -= 1;
      return "Refund done.";
    };
    const registry = extendRegistry(builtinRegistry(), { agents: { slow } });
    const scenario = findScenarios({ id: "payments/rate-limit" })[0];
    await runMatrix({ scenarios: [scenario, scenario, scenario, scenario], agents: ["slow"], registry, concurrency: 4 });
    expect(peak).toBe(4);
    peak = 0;
    await runMatrix({ scenarios: [scenario, scenario], agents: ["slow"], registry });
    expect(peak).toBe(1);
  });

  it("rejects with the failing run's error and starts no further runs", async () => {
    const started: string[] = [];
    const agent: ScriptedAgent = async (ctx) => {
      started.push(ctx.scenarioId);
      if (ctx.scenarioId === scenarios[1].id) throw new Error("boom");
      return "I could not do it.";
    };
    const registry = extendRegistry(builtinRegistry(), { agents: { flaky: agent } });
    await expect(runMatrix({ scenarios, agents: ["flaky"], registry })).rejects.toThrow(`Agent "flaky" failed in trial 0 of ${scenarios[1].id}: boom`);
    expect(started).toEqual(scenarios.slice(0, 2).map((s) => s.id));
  });

  it("validates the concurrency", async () => {
    await expect(runMatrix({ scenarios, agents, concurrency: 0 })).rejects.toThrow(/Invalid concurrency: 0/);
  });
});

describe("trial time limits", () => {
  const base = { scenarioId: "limits", task: "t", seed: "s", trialIndex: 2, agentId: "slow" };

  it("gives the agent the scenario id, the trial index, and a signal", async () => {
    let seen: { scenarioId: string; trialIndex: number; aborted: boolean } | undefined;
    await runHarness({
      ...base,
      world: createWorld("payments"),
      faults: [],
      agent: async (ctx) => {
        seen = { scenarioId: ctx.scenarioId, trialIndex: ctx.trialIndex, aborted: ctx.signal.aborted };
        return "done";
      },
    });
    expect(seen).toEqual({ scenarioId: "limits", trialIndex: 2, aborted: false });
  });

  it("fails the trial when the agent is too slow, aborts the signal, and refuses later calls", async () => {
    let late: unknown;
    let reason: unknown;
    let settled: Promise<void> | undefined;
    const run = runHarness({
      ...base,
      world: createWorld("payments"),
      faults: [],
      timeoutMs: 30,
      agent: async (ctx) => {
        await ctx.callTool("create_refund", { order_id: "1", amount_cents: 1 });
        settled = new Promise((resolve) => {
          ctx.signal.addEventListener("abort", () => {
            reason = ctx.signal.reason;
            void ctx.callTool("list_refunds", { order_id: "1" }).then((r) => {
              late = r;
              resolve();
            });
          });
        });
        await new Promise((resolve) => setTimeout(resolve, 200));
        return "done";
      },
    });
    await expect(run).rejects.toThrow('agent "slow" did not answer within 30 ms (1 tool call(s) so far)');
    await settled;
    expect(reason).toEqual(new Error("the trial's time limit of 30 ms ran out"));
    expect(late).toEqual({ ok: false, error: "the trial is over; this call was not run", code: "ECLOSED" });
  });

  it("leaves a fast agent alone and clears the timer", async () => {
    const trace = await runHarness({
      ...base,
      world: createWorld("payments"),
      faults: [],
      timeoutMs: 5000,
      agent: async (ctx) => {
        await ctx.callTool("create_refund", { order_id: "1", amount_cents: 1, idempotency_key: "k" });
        return "Refund done.";
      },
    });
    expect(trace.calls).toHaveLength(1);
    expect(trace.finalAnswer).toBe("Refund done.");
  });

  it("names the agent, trial, and scenario when a run times out", async () => {
    const hang: ScriptedAgent = () => new Promise(() => {});
    const registry = extendRegistry(builtinRegistry(), { agents: { hang } });
    const scenario = findScenarios({ id: "payments/rate-limit" })[0];
    await expect(runScenario({ scenario, agentId: "hang", registry, timeoutMs: 20 })).rejects.toThrow(
      'Agent "hang" failed in trial 0 of payments/rate-limit: agent "hang" did not answer within 20 ms (0 tool call(s) so far)'
    );
  });
});
