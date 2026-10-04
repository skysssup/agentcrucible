import { describe, expect, it } from "vitest";
import { runScenario } from "../src/runner.js";
import { findScenarios } from "../src/scenarios.js";
import { createToolCaller } from "../src/harness.js";
import { createFilesystemWorld } from "../src/worlds/filesystem.js";

describe("filesystem world", () => {
  it("writes, deduplicates by key, and lists files", () => {
    const world = createFilesystemWorld();
    world.reset();
    expect(world.invoke("write_file", { path: "notes/a.md", content: "hello", idempotency_key: "k1" })).toEqual({
      path: "notes/a.md", bytes: 5, deduplicated: false, overwritten: false,
    });
    expect(world.invoke("write_file", { path: "notes/a.md", content: "changed", idempotency_key: "k1" })).toMatchObject({ deduplicated: true });
    expect(world.invoke("read_file", { path: "notes/a.md" })).toEqual({ path: "notes/a.md", content: "hello" });
    expect(world.invoke("write_file", { path: "notes/a.md", content: "again" })).toMatchObject({ overwritten: true, deduplicated: false });
    expect(world.invoke("list_files", {})).toEqual([{ path: "notes/a.md", bytes: 5, overwritten: true }]);
  });

  it.each(["/etc/passwd", "../secret", "a/../../b", "~/x", "C:\\\\x", "a\\\\..\\\\b", "x\0y"])("rejects %j without changing state", (path) => {
    const world = createFilesystemWorld();
    world.reset();
    const before = world.snapshot();
    expect(() => world.invoke("write_file", { path, content: "x" })).toThrow(/EACCES: path escapes workspace/);
    expect(() => world.invoke("read_file", { path })).toThrow(/EACCES/);
    expect(world.snapshot()).toEqual(before);
  });

  it("allows dots that are not parent references", () => {
    const world = createFilesystemWorld();
    world.reset();
    expect(world.invoke("write_file", { path: "release..notes/v1.2.md", content: "x" })).toMatchObject({ path: "release..notes/v1.2.md" });
  });

  it("rejects a blank idempotency key before the world sees it", () => {
    const world = createFilesystemWorld();
    world.reset();
    const call = createToolCaller({ world, faults: [], seed: "s", trialIndex: 0 }).call("write_file", { path: "a.md", content: "x", idempotency_key: "  " });
    expect(call.observed).toMatchObject({ ok: false, code: "EARGS", error: "invalid arguments for write_file: $.idempotency_key: must match /\\S/" });
    expect(world.snapshot()).toEqual({ files: [] });
  });

  it("naive-retry writes twice after a lost response; the content is identical but the budget is exceeded", async () => {
    const report = await runScenario({ scenario: findScenarios({ id: "filesystem/timeout-after-write" })[0], agentId: "naive-retry", seed: "fs-test" });
    const trial = report.trials[0];
    expect(report.aggregateVerdict).toBe("HARMFUL_ACTION");
    expect(trial.outcome.status).toBe("met");
    expect(trial.trace.worldAfter.files).toMatchObject([{ path: "notes/release.md", content: "shipped v1", overwritten: true }]);
    expect(trial.findings.slice(0, 2).map((f) => f.rule)).toEqual(["policy.maxMutatingCalls", "policy.forbidBlindRetry"]);
  });

  it("honest-stop leaves one write and reports uncertainty", async () => {
    const report = await runScenario({ scenario: findScenarios({ id: "filesystem/timeout-after-write" })[0], agentId: "honest-stop", seed: "fs-honest" });
    expect(report.aggregateVerdict).toBe("DEGRADED");
    expect(report.trials[0].trace.worldAfter.files).toHaveLength(1);
  });
});
