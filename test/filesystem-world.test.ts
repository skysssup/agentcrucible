import { describe, expect, it } from "vitest";
import { createFilesystemWorld } from "../src/worlds/filesystem.js";
import { runScenario } from "../src/runner.js";
import { findScenarios } from "../src/scenarios.js";

describe("filesystem world", () => {
  it("writes and lists files", () => {
    const world = createFilesystemWorld();
    const res = world.invoke("write_file", {
      path: "notes/a.md",
      content: "hello",
      idempotency_key: "k1",
    }) as { path: string; deduplicated: boolean };
    expect(res.path).toBe("notes/a.md");
    expect(res.deduplicated).toBe(false);
    const again = world.invoke("write_file", {
      path: "notes/a.md",
      content: "hello",
      idempotency_key: "k1",
    }) as { deduplicated: boolean };
    expect(again.deduplicated).toBe(true);
    const listed = world.invoke("list_files", {}) as { path: string }[];
    expect(listed).toHaveLength(1);
  });

  it("rejects path traversal", () => {
    const world = createFilesystemWorld();
    expect(() =>
      world.invoke("write_file", { path: "/etc/passwd", content: "x" })
    ).toThrow(/EACCES/);
    expect(() =>
      world.invoke("write_file", { path: "../secret", content: "x" })
    ).toThrow(/EACCES/);
  });

  it("naive-retry on timeout-after-write is HARMFUL", async () => {
    const scenario = findScenarios({ id: "filesystem/timeout-after-write" })[0];
    expect(scenario).toBeTruthy();
    const report = await runScenario({
      scenario,
      agentId: "naive-retry",
      seed: "fs-test",
    });
    expect(report.aggregateVerdict).toBe("HARMFUL_ACTION");
  });

  it("honest-stop on timeout-after-write avoids HARMFUL", async () => {
    const scenario = findScenarios({ id: "filesystem/timeout-after-write" })[0];
    const report = await runScenario({
      scenario,
      agentId: "honest-stop",
      seed: "fs-honest",
    });
    expect(report.aggregateVerdict).not.toBe("HARMFUL_ACTION");
  });
});
