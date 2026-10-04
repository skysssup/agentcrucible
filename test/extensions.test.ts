import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { builtinRegistry, extendRegistry, loadAgentModule, loadExtension, type Registry } from "../src/registry.js";
import { replayReport } from "../src/replay.js";
import { runScenario } from "../src/runner.js";
import { findScenarios, loadScenarioFile, parseScenario } from "../src/scenarios.js";
import type { World } from "../src/worlds/types.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const loader = pathToFileURL(join(root, "node_modules", "tsx", "dist", "loader.mjs")).href;
const inventoryDir = join(root, "examples", "inventory");

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
function tempDir(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "ac-ext-"));
  dirs.push(dir);
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

function runCli(args: string[], cwd: string) {
  const r = spawnSync(process.execPath, ["--import", loader, join(root, "src", "cli.ts"), ...args], { cwd, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** A small valid world whose parts each test can break. */
function counterWorld(overrides: Partial<World> = {}): () => World {
  return () => {
    let count = 0;
    return {
      name: "counter",
      description: "A counter.",
      tools: [
        { name: "bump", description: "Add one.", mutating: true, inputSchema: { type: "object" }, outputSchema: { type: "object", required: ["count"], properties: { count: { type: "integer" } } } },
      ],
      recordFields: { counter: { value: "number" } },
      reset: () => void (count = 0),
      snapshot: () => ({ count }),
      invoke: () => ({ counter_id: "c", count: ++count }),
      records: (s) => [{ kind: "counter", id: "c", fields: { value: (s as { count: number }).count } }],
      ...overrides,
    };
  };
}

describe("the inventory example extension", () => {
  let registry: Registry;
  const load = async () => (registry ??= await loadExtension(builtinRegistry(), join(inventoryDir, "inventory.mjs")));

  it("registers its world, fault kind, and agents next to the built-ins", async () => {
    const r = await load();
    expect(r.worlds.get("inventory")?.source).toBe(join(inventoryDir, "inventory.mjs"));
    expect(r.faults.get("lost_write")?.value.stage).toBe("before");
    expect([...r.agents.keys()].slice(-2)).toEqual(["inventory-trusting", "inventory-verifying"]);
    expect(r.worlds.get("payments")?.source).toBe("built-in");
  });

  it("grades a lost write against the composed inventory and email worlds", async () => {
    const r = await load();
    const scenario = loadScenarioFile(join(inventoryDir, "scenarios", "lost-reservation.yaml"), r);
    const trusting = await runScenario({ scenario, agentId: "inventory-trusting", registry: r });
    expect(trusting.aggregateVerdict).toBe("HARMFUL_ACTION");
    expect(trusting.trials[0].trace.calls[0]).toMatchObject({ faultApplied: "lost_write", committed: false, observed: { ok: true } });
    expect(trusting.trials[0].findings[0]).toMatchObject({ rule: "invariant.violated", evidence: [{ callIds: ["call_2"] }] });
    const verifying = await runScenario({ scenario, agentId: "inventory-verifying", registry: r });
    expect(verifying.aggregateVerdict).toBe("SAFE_SUCCESS");
    expect(replayReport(verifying, r).reproduced).toBe(true);
    expect(() => replayReport(verifying, builtinRegistry())).toThrow('cannot replay: fault kind "lost_write" is not registered');
  });

  it("is rejected by a registry that does not load it", () => {
    expect(() => loadScenarioFile(join(inventoryDir, "scenarios", "lost-reservation.yaml"))).toThrow(/worlds\[0\] "inventory" is not one of: payments/);
  });
});

describe("extension validation", () => {
  const extend = (ext: Parameters<typeof extendRegistry>[1]) => () => extendRegistry(builtinRegistry(), ext, "ext.mjs");

  it("accepts a valid world and runs scenarios in it", async () => {
    const registry = extendRegistry(builtinRegistry(), { worlds: { counter: counterWorld() } }, "ext.mjs");
    const scenario = parseScenario({ id: "c/bump", world: "counter", description: "d", task: "t", expect: { effects: [{ kind: "counter", value: 1 }] } }, undefined, registry);
    const report = await runScenario({ scenario, registry, agent: async (ctx) => ((await ctx.callTool("bump", {})).ok ? "Bumped successfully." : "failed") });
    expect(report.aggregateVerdict).toBe("SAFE_SUCCESS");
  });

  it.each([
    [{ name: "other" }, 'worlds.counter: name is "other"; it must equal the registered name "counter"'],
    [{ tools: [] }, "worlds.counter: tools must be a non-empty list"],
    [{ tools: [{ name: "bump", description: "d", mutating: "yes", inputSchema: { type: "array" } }] }, 'worlds.counter: tools[0].mutating must be true or false\n  worlds.counter: tools[0].inputSchema.type must be "object"'],
    [{ tools: [{ name: "bump", description: "d", mutating: true, inputSchema: { type: "object", oneOf: [] } }] }, "worlds.counter: tools[0].inputSchema.oneOf is not a supported keyword"],
    [{ recordFields: { counter: { value: "int" } } }, "worlds.counter: recordFields.counter.value must be one of string, number, boolean, object, array"],
    [{ snapshot: () => ({ at: new Date(0) }) }, "worlds.counter: snapshot() must return plain JSON data"],
    [{ records: () => [{ kind: "tally", id: "c", fields: {} }] }, 'worlds.counter: records() returned kind "tally", which recordFields does not declare'],
    [{ reset: undefined }, "worlds.counter: reset must be a function"],
  ] as Array<[Partial<World>, string]>)("rejects a world with %j", (override, message) => {
    expect(extend({ worlds: { counter: counterWorld(override) } })).toThrow(`ext.mjs: ${message}`);
  });

  it("reports every problem at once, and refuses to shadow built-ins", () => {
    const run = extend({
      worlds: { payments: counterWorld(), Counter: counterWorld() },
      faults: { timeout: { description: "d", stage: "before", apply: () => ({ ok: false, error: "x" }) }, flaky: { description: "", stage: "during", apply: 1 } as never },
      agents: { liar: async () => "x", helper: "not a function" as never },
    });
    expect(run).toThrow(
      [
        "ext.mjs: worlds.payments: already defined by built-in",
        "  worlds.Counter: name must match /^[a-z][a-z0-9_-]*$/",
        "  faults.timeout: already defined by built-in",
        "  faults.flaky: description must be a non-empty string",
        '  faults.flaky: stage must be "before" (the call does not run) or "after" (it runs, then the response changes)',
        "  faults.flaky: apply must be a function ({ tool, args, result, params }) => observation",
        "  agents.liar: already defined by built-in",
        "  agents.helper: must be a function (ctx) => answer, or { run, description }",
      ].join("\n")
    );
    expect(extend({})).toThrow("ext.mjs: exports none of worlds, faults, or agents");
  });

  it("checks fault params with the fault's schema, and what apply returns at run time", async () => {
    const registry = extendRegistry(builtinRegistry(), {
      faults: {
        garble: { description: "returns nonsense", stage: "after", params: { type: "object", properties: { level: { type: "integer" } }, additionalProperties: false }, apply: () => "nonsense" as never },
      },
    });
    const base = { id: "g/x", world: "email", description: "d", task: "t" };
    expect(() => parseScenario({ ...base, faults: [{ target: "send_email", kind: "garble", params: { level: "high" } }] }, undefined, registry)).toThrow(
      'faults[0] params.level: expected integer, got string "high"'
    );
    const scenario = parseScenario({ ...base, faults: [{ target: "send_email", kind: "garble", params: { level: 2 } }] }, undefined, registry);
    await expect(runScenario({ scenario, registry, agent: async (ctx) => (await ctx.callTool("send_email", { to: "a@example.com", subject: "s", body: "b" }), "sent") })).rejects.toThrow(
      'fault garble must return { ok: true, result } or { ok: false, error, code? } (got "nonsense")'
    );
  });

  it("stops a run when a world returns a result that breaks its own outputSchema", async () => {
    const registry = extendRegistry(builtinRegistry(), { worlds: { counter: counterWorld({ invoke: () => ({ count: "one" }) }) } });
    const scenario = parseScenario({ id: "c/bad", world: "counter", description: "d", task: "t" }, undefined, registry);
    await expect(runScenario({ scenario, registry, agent: async (ctx) => (await ctx.callTool("bump", {}), "done") })).rejects.toThrow(
      'world counter: bump returned a result that violates its outputSchema ($.count: expected integer, got string "one")'
    );
  });
});

describe("agent modules", () => {
  it("registers a default export under its file name, with its description", async () => {
    const dir = tempDir({ "My Agent.mjs": 'export const description = "says hi";\nexport default async () => "hi";\n' });
    const { registry, id } = await loadAgentModule(builtinRegistry(), join(dir, "My Agent.mjs"));
    expect(id).toBe("my-agent");
    expect(registry.agents.get(id)).toMatchObject({ value: { description: "says hi" }, source: join(dir, "My Agent.mjs") });
  });

  it("loads the same module once when it is named twice", async () => {
    const dir = tempDir({ "twice.mjs": 'export default async () => "ok";\n' });
    const first = await loadAgentModule(builtinRegistry(), join(dir, "twice.mjs"));
    const second = await loadAgentModule(first.registry, join(dir, "twice.mjs"));
    expect([second.id, second.registry]).toEqual(["twice", first.registry]);
  });

  it("accepts { run, description } as the default export", async () => {
    const dir = tempDir({ "obj.mjs": 'export default { description: "object form", run: async () => "ok" };\n' });
    expect((await loadAgentModule(builtinRegistry(), join(dir, "obj.mjs"))).registry.agents.get("obj")?.value.description).toBe("object form");
  });

  it.each([
    [{ "none.mjs": "export const x = 1;\n" }, "none.mjs", "export the agent as the default export"],
    [{ "broken.mjs": "export default async (ctx => {\n" }, "broken.mjs", "cannot load module"],
    [{ "naive-retry.mjs": 'export default async () => "x";\n' }, "naive-retry.mjs", "agents.naive-retry: already defined by built-in"],
    [{}, "missing.mjs", "missing.mjs: file not found"],
  ])("explains a module that cannot be used (%j)", async (files, name, message) => {
    const dir = tempDir(files as Record<string, string>);
    await expect(loadAgentModule(builtinRegistry(), join(dir, name))).rejects.toThrow(message);
  });
});

describe("CLI with modules and extensions", () => {
  const agentModule = `export const description = "keyed refund";
export default async function (ctx) {
  const args = { order_id: "4471", amount_cents: 8400, idempotency_key: "k" };
  const first = await ctx.callTool("create_refund", args);
  const res = first.ok ? first : await ctx.callTool("create_refund", args);
  return res.ok ? \`The first attempt failed (\${first.error}); I retried with the same key and refund \${res.result.refund_id} succeeded.\` : "Refund failed.";
}
`;

  it("runs and compares an agent given as a module path", () => {
    const dir = tempDir({ "keyed.mjs": agentModule });
    const run = runCli(["run", "--scenario", "payments/timeout-after-commit", "--agent", "./keyed.mjs", "--json", "--out", "out"], dir);
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({ agentId: "keyed", aggregateVerdict: "SAFE_SUCCESS" });
    const compare = runCli(["compare", "--scenario", "payments/timeout-after-commit", "--agents", "naive-retry,./keyed.mjs"], dir);
    expect(compare.stdout).toMatch(/keyed\s+SAFE_SUCCESS/);
    expect(compare.status).toBe(2);
  });

  it("loads extensions from the config file for every command", () => {
    const listing = (command: string) => runCli([command], inventoryDir).stdout;
    expect(listing("agents")).toMatch(/^inventory-verifying\s+reads the reservation back.*\[inventory\.mjs\]$/m);
    expect(listing("worlds")).toContain("inventory  [inventory.mjs]: Stock levels and reservations.");
    expect(listing("faults")).toMatch(/^lost_write\s+before\s+the call does not run, but the agent receives a well-formed success response \(params: reservation_id\)\s+\[inventory\.mjs\]$/m);
    const check = runCli(["check", "--scenario", "inventory/lost-reservation"], inventoryDir);
    expect(check.stdout).toContain("2/2 checks pass");
    expect(check.status).toBe(0);
  });

  it("fails with the module path when an extension cannot be loaded", () => {
    const dir = tempDir({ ".agentcrucible.json": JSON.stringify({ extensions: ["nope.mjs"] }), "bad.mjs": 'export const worlds = { Bad: () => ({}) };\n' });
    const missing = runCli(["list"], dir);
    expect([missing.status, missing.stderr.trim()]).toEqual([1, "agentcrucible: nope.mjs: file not found"]);
    writeFileSync(join(dir, ".agentcrucible.json"), JSON.stringify({ extensions: ["bad.mjs"] }));
    expect(runCli(["list"], dir).stderr).toContain("agentcrucible: bad.mjs: worlds.Bad: name must match");
  });

  it("finds the bundled workflow scenarios and their agents with no config", () => {
    expect(findScenarios({ tag: "workflow" }).map((s) => s.id)).toEqual(["workflows/notification-outage", "workflows/refund-notify-resolve"]);
  });
});
