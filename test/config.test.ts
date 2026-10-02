import { describe, expect, it } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, loadConfigFile, findConfigPath } from "../src/config.js";
import { loadAllScenarios } from "../src/scenarios.js";

describe("config", () => {
  it("returns empty object when no config present", () => {
    const dir = mkdtempSync(join(tmpdir(), "ac-cfg-"));
    try {
      expect(findConfigPath(dir)).toBeNull();
      expect(loadConfig(dir)).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loads .agentcrucible.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "ac-cfg-"));
    try {
      writeFileSync(
        join(dir, ".agentcrucible.json"),
        JSON.stringify({ agent: "honest-stop", trials: 3, defaultTag: "smoke" })
      );
      const cfg = loadConfig(dir);
      expect(cfg.agent).toBe("honest-stop");
      expect(cfg.trials).toBe(3);
      expect(cfg.defaultTag).toBe("smoke");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("bundled scenarios", () => {
  it("ships scenarios across all worlds", () => {
    const all = loadAllScenarios();
    const worlds = new Set(all.map((s) => s.world));
    expect(worlds.has("payments")).toBe(true);
    expect(worlds.has("email")).toBe(true);
    expect(worlds.has("database")).toBe(true);
    expect(worlds.has("tickets")).toBe(true);
    expect(all.length).toBeGreaterThanOrEqual(12);
  });
});

describe("config YAML + explicit path", () => {
  it("loads .agentcrucible.yaml via auto-discovery", () => {
    const dir = mkdtempSync(join(tmpdir(), "ac-cfg-"));
    try {
      writeFileSync(
        join(dir, ".agentcrucible.yaml"),
        "agent: liar\ntrials: 2\ndefaultTag: smoke\n"
      );
      const cfg = loadConfig(dir);
      expect(cfg.agent).toBe("liar");
      expect(cfg.trials).toBe(2);
      expect(cfg.defaultTag).toBe("smoke");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loadConfigFile parses explicit YAML paths (not JSON.parse)", () => {
    const dir = mkdtempSync(join(tmpdir(), "ac-cfg-"));
    try {
      const path = join(dir, "custom.yaml");
      writeFileSync(path, "agent: honest-stop\ntrials: 4\n");
      const cfg = loadConfigFile(path);
      expect(cfg.agent).toBe("honest-stop");
      expect(cfg.trials).toBe(4);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects non-positive trials in config", () => {
    const dir = mkdtempSync(join(tmpdir(), "ac-cfg-"));
    try {
      writeFileSync(join(dir, ".agentcrucible.json"), JSON.stringify({ trials: 0 }));
      expect(() => loadConfig(dir)).toThrow(/trials/);
      writeFileSync(join(dir, ".agentcrucible.json"), JSON.stringify({ trials: -3 }));
      expect(() => loadConfig(dir)).toThrow(/trials/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
