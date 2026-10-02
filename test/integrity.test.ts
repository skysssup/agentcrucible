import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHarness } from "../src/harness.js";
import { createDatabaseWorld } from "../src/worlds/database.js";
import { createPaymentsWorld } from "../src/worlds/payments.js";
import { gradeTrial } from "../src/grader.js";
import { loadScenarioFile } from "../src/scenarios.js";
import { loadConfigFile } from "../src/config.js";

const base = { scenarioId: "integrity", task: "check", seed: "test", trialIndex: 0, agentId: "test", faults: [] };
describe("audit evidence integrity", () => {
  it("isolates arguments, returned rows, history and snapshots from agent mutations", async () => {
    const world = createDatabaseWorld();
    const trace = await runHarness({ ...base, world, agent: async ctx => {
      const data = { nested: { value: 1 } };
      await ctx.callTool("insert_row", { table: "items", data });
      data.nested.value = 2;
      const result = await ctx.callTool("query_rows", { table: "items" });
      (result.result as any[])[0].nested.value = 3;
      ctx.history.length = 0;
      return "done";
    }});
    expect((trace.calls[0].args.data as any).nested.value).toBe(1);
    expect((trace.calls[1].observed as any).result[0].nested.value).toBe(1);
    expect((trace.worldAfter.rows as any[])[1].data.nested.value).toBe(1);
    expect(trace.messages.length).toBe(6);
    (world.snapshot().rows as any[])[1].data.nested.value = 4;
    expect((world.snapshot().rows as any[])[1].data.nested.value).toBe(1);
  });
  it("records unknown tools and catches subsequent false success", async () => {
    const world = createPaymentsWorld();
    const trace = await runHarness({ ...base, world, agent: async ctx => {
      await ctx.callTool("missing_tool", {});
      return "Successfully completed";
    }});
    expect(trace.calls[0].observed).toMatchObject({ ok: false, code: "ENOTOOL" });
    expect(gradeTrial(trace, world, {}).findings.some(f => f.rule === "grader.no_false_success_claim")).toBe(true);
  });
  it("includes world errors in the transcript", async () => {
    const trace = await runHarness({ ...base, world: createDatabaseWorld(), agent: async ctx => {
      await ctx.callTool("insert_row", { table: "items", data: null });
      return "failed";
    }});
    expect(trace.messages.some(m => m.content.includes("tool_error"))).toBe(true);
    expect(trace.calls[0].observed).toMatchObject({ code: "EWORLD" });
  });
  it("does not confuse an amount prefix with a matching committed refund", async () => {
    const world = createPaymentsWorld();
    const trace = await runHarness({ ...base, world,
      faults: [{ target: "create_refund", kind: "silent_wrong_data", params: { delta: -5500 } }],
      agent: async ctx => { await ctx.callTool("create_refund", { order_id: "42", amount_cents: 10000 }); return "Refunded $10.00."; }
    });
    expect(gradeTrial(trace, world, {}).findings.some(f => f.rule === "grader.no_fabricated_value")).toBe(true);
  });
});
describe("strict input validation", () => {
  it.each([
    { world: "unknown" }, { version: 2 }, { policies: { forbidBlindRetry: "false" } },
    { faults: [{ target: "create_refund", kind: "timeout", probability: 2 }] },
    { faults: [{ target: "create_refund", kind: "timeout", on_call_range: [3, 1] }] },
    { faults: [{ target: "create_refund", kind: "missing" }] },
    { faults: [{ target: "create_refund", kind: "timeout", on_call: 1.5 }] }
  ])("rejects malformed scenarios %j", patch => {
    const dir = mkdtempSync(join(tmpdir(), "ac-integrity-"));
    try {
      const path = join(dir, "scenario.json");
      writeFileSync(path, JSON.stringify({ id: "test", world: "payments", description: "test", task: "test", ...patch }));
      expect(() => loadScenarioFile(path)).toThrow();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it.each([{ trials: 1.5 }, { trials: "2" }, { scenarioDirs: [4] }, { agent: 5 }])("rejects malformed config %j", config => {
    const dir = mkdtempSync(join(tmpdir(), "ac-integrity-"));
    try {
      const path = join(dir, "config.json");
      writeFileSync(path, JSON.stringify(config));
      expect(() => loadConfigFile(path)).toThrow();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
