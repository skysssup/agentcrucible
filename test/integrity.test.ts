import { describe, expect, it } from "vitest";
import { gradeTrial } from "../src/grader.js";
import { runHarness, type ScriptedAgent } from "../src/harness.js";
import { runScenario } from "../src/runner.js";
import { findScenarios } from "../src/scenarios.js";
import { createWorld } from "../src/worlds/index.js";

const base = { scenarioId: "integrity", task: "check", seed: "test", trialIndex: 0, agentId: "test", faults: [] };

describe("trace integrity", () => {
  it("isolates arguments, results, history, and snapshots from the agent", async () => {
    const world = createWorld("database");
    const trace = await runHarness({
      ...base,
      world,
      agent: async (ctx) => {
        const data = { nested: { value: 1 } };
        await ctx.callTool("insert_row", { table: "items", data });
        data.nested.value = 2;
        const result = await ctx.callTool("query_rows", { table: "items" });
        (result.result as Array<{ nested: { value: number } }>)[0].nested.value = 3;
        ctx.history.length = 0;
        return "done";
      },
    });
    expect((trace.calls[0].args.data as { nested: { value: number } }).nested.value).toBe(1);
    expect((trace.calls[1].observed as { result: Array<{ nested: { value: number } }> }).result[0].nested.value).toBe(1);
    expect((trace.worldAfter.rows as Array<{ data: { nested: { value: number } } }>)[1].data.nested.value).toBe(1);
    expect(trace.messages).toHaveLength(6);
    (world.snapshot().rows as Array<{ data: { nested: { value: number } } }>)[1].data.nested.value = 4;
    expect((world.snapshot().rows as Array<{ data: { nested: { value: number } } }>)[1].data.nested.value).toBe(1);
  });

  it("keeps idempotency keys out of returned rows", async () => {
    const world = createWorld("database");
    world.invoke("insert_row", { table: "t", data: { a: 1 }, idempotency_key: "k" });
    expect(world.invoke("query_rows", { table: "t" })).toEqual([{ id: "row_1", a: 1 }]);
  });

  it("gives each trial its own copy of the tool definitions", async () => {
    const scenario = findScenarios({ id: "payments/rate-limit" })[0];
    const seen: string[] = [];
    const vandal: ScriptedAgent = async (ctx) => {
      seen.push(ctx.tools[0].name);
      ctx.tools[0].name = "renamed";
      ctx.tools[0].parameters.order_id.required = false;
      return "nothing to do";
    };
    await runScenario({ scenario, agentId: "vandal", agent: vandal, trials: 3 });
    expect(seen).toEqual(["create_refund", "create_refund", "create_refund"]);
    expect(createWorld("payments").tools[0].parameters.order_id.required).toBe(true);
  });

  it("records unknown tools and catches a later success claim", async () => {
    const world = createWorld("payments");
    const trace = await runHarness({
      ...base,
      world,
      agent: async (ctx) => {
        await ctx.callTool("missing_tool", {});
        return "Successfully completed";
      },
    });
    expect(trace.calls[0]).toMatchObject({ mutating: false, committed: false, observed: { ok: false, code: "ENOTOOL" } });
    expect(gradeTrial(trace, world, {}).findings.map((f) => f.rule)).toContain("grader.no_false_success_claim");
  });

  it("records world errors in the transcript", async () => {
    const trace = await runHarness({
      ...base,
      world: createWorld("database"),
      agent: async (ctx) => {
        await ctx.callTool("insert_row", { table: "items", data: null });
        return "failed";
      },
    });
    expect(trace.messages.some((m) => m.content.startsWith("tool_error insert_row requires table"))).toBe(true);
    expect(trace.calls[0]).toMatchObject({ committed: false, observed: { code: "EWORLD" } });
  });

  it.each([
    ["an array", [1, 2]],
    ["null", null],
    ["a function inside", { cb: () => 1 }],
  ])("rejects tool arguments that are %s", async (_label, args) => {
    const trace = await runHarness({
      ...base,
      world: createWorld("payments"),
      agent: async (ctx) => {
        const res = await ctx.callTool("create_refund", args as Record<string, unknown>);
        return res.ok ? "ok" : res.error!;
      },
    });
    expect(trace.calls[0]).toMatchObject({ args: {}, committed: false, observed: { ok: false, code: "EARGS" } });
    expect(trace.worldAfter.ledger).toEqual([]);
  });

  it("does not confuse an amount prefix with a matching committed refund", async () => {
    const world = createWorld("payments");
    const trace = await runHarness({
      ...base,
      world,
      faults: [{ target: "create_refund", kind: "silent_wrong_data", params: { delta: -5500 } }],
      agent: async (ctx) => {
        await ctx.callTool("create_refund", { order_id: "42", amount_cents: 10000 });
        return "Refunded $10.00.";
      },
    });
    expect(gradeTrial(trace, world, {}).findings.map((f) => f.rule)).toContain("grader.no_fabricated_value");
  });
});

describe("agent failures are errors, not verdicts", () => {
  const scenario = () => findScenarios({ id: "payments/rate-limit" })[0];

  it("names the agent, trial, and scenario when the agent throws", async () => {
    let calls = 0;
    const flaky: ScriptedAgent = async () => {
      if (++calls === 2) throw new Error("model API unreachable");
      return "nothing";
    };
    await expect(runScenario({ scenario: scenario(), agentId: "flaky", agent: flaky, trials: 3 })).rejects.toThrow(
      'Agent "flaky" failed in trial 1 of payments/rate-limit: model API unreachable'
    );
  });

  it("rejects a final answer that is not a string", async () => {
    const agent = (async () => ({ text: "hi" })) as unknown as ScriptedAgent;
    await expect(runScenario({ scenario: scenario(), agentId: "obj", agent })).rejects.toThrow(
      'agent "obj" must return its final answer as a string'
    );
  });
});
