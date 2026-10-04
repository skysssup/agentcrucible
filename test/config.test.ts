import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CONFIG_FILES, findConfigPath, loadConfig, loadConfigFile, parseConfigText } from "../src/config.js";
import { loadAllScenarios } from "../src/scenarios.js";
import { builtinRegistry } from "../src/registry.js";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
const tempDir = () => {
  const d = mkdtempSync(join(tmpdir(), "ac-cfg-"));
  dirs.push(d);
  return d;
};

describe("config discovery", () => {
  it("returns an empty config when no file is present", () => {
    const dir = tempDir();
    expect(findConfigPath(dir)).toBeNull();
    expect(loadConfig(dir)).toEqual({});
  });

  it.each(CONFIG_FILES)("finds %s", (name) => {
    const dir = tempDir();
    mkdirSync(join(dir, ".agentcrucible"));
    writeFileSync(join(dir, name), name.endsWith(".json") ? '{"agent": "honest-stop", "trials": 3}' : "agent: honest-stop\ntrials: 3\n");
    expect(findConfigPath(dir)).toBe(join(dir, name));
    expect(loadConfig(dir)).toEqual({ agent: "honest-stop", trials: 3 });
  });

  it("refuses to guess between two config files", () => {
    const dir = tempDir();
    writeFileSync(join(dir, ".agentcrucible.json"), "{}");
    writeFileSync(join(dir, ".agentcrucible.yaml"), "trials: 2\n");
    expect(() => findConfigPath(dir)).toThrow(/Found several config files .*\.agentcrucible\.json, .*\.agentcrucible\.yaml/);
  });
});

describe("config parsing", () => {
  it("keeps only the keys that are set", () => {
    expect(parseConfigText("defaultTag: smoke\nfailOn: DEGRADED\nscenarioDirs: [a, b]\n", "c.yaml")).toEqual({
      defaultTag: "smoke",
      failOn: "DEGRADED",
      scenarioDirs: ["a", "b"],
    });
    expect(parseConfigText('{ "timeoutMs": 30000, "concurrency": 4 }', "c.json")).toEqual({ timeoutMs: 30000, concurrency: 4 });
  });

  it("treats an empty file as no settings", () => {
    expect(parseConfigText("", "c.yaml")).toEqual({});
    expect(parseConfigText("  \n", "c.yml")).toEqual({});
  });

  it("parses explicit YAML paths with the YAML parser", () => {
    const dir = tempDir();
    const path = join(dir, "custom.yaml");
    writeFileSync(path, "agent: honest-stop\ntrials: 4\n");
    expect(loadConfigFile(path)).toEqual({ agent: "honest-stop", trials: 4 });
  });

  it.each([
    [{ trials: 0 }, /Invalid trials value: 0/],
    [{ trials: -3 }, /Invalid trials value: -3/],
    [{ trials: 1.5 }, /Invalid trials value: 1.5/],
    [{ trials: "2" }, /trials must be a number/],
    [{ trials: 10001 }, /no greater than 10000/],
    [{ scenarioDirs: [4] }, /scenarioDirs must be a list of directory paths/],
    [{ extensions: "ext.mjs" }, /extensions must be a list of module paths/],
    [{ agent: 5 }, /agent must be a non-empty string/],
    [{ seed: "" }, /seed must be a non-empty string/],
    [{ failOn: "sometimes" }, /failOn must be one of: HARMFUL_ACTION, SILENT_FAILURE, DEGRADED, INCONCLUSIVE, SAFE_FAILURE, SAFE_SUCCESS/],
    [{ defualtTag: "smoke" }, /unknown key "defualtTag"/],
    [{ timeoutMs: "500" }, /timeoutMs must be a number/],
    [{ timeoutMs: 0 }, /Invalid timeout: 0 \(must be a whole number of milliseconds, at least 1\)/],
    [{ timeoutMs: 1.5 }, /Invalid timeout: 1.5/],
    [{ concurrency: "4" }, /concurrency must be a number/],
    [{ concurrency: 65 }, /Invalid concurrency: 65 \(must be a whole number from 1 to 64\)/],
  ])("rejects %j and names the file", (config, message) => {
    const dir = tempDir();
    const path = join(dir, "config.json");
    writeFileSync(path, JSON.stringify(config));
    expect(() => loadConfigFile(path)).toThrow(message);
    expect(() => loadConfigFile(path)).toThrow(path);
  });

  it("leaves agent names to the CLI, which also knows extension agents and module paths", () => {
    const dir = tempDir();
    const path = join(dir, "config.json");
    writeFileSync(path, JSON.stringify({ agent: "./agents/mine.mjs", extensions: ["ext/inventory.mjs"] }));
    expect(loadConfigFile(path)).toEqual({ agent: "./agents/mine.mjs", extensions: ["ext/inventory.mjs"] });
  });

  it("reports malformed JSON with the file name", () => {
    const dir = tempDir();
    const path = join(dir, ".agentcrucible.json");
    writeFileSync(path, "{ trials: ");
    expect(() => loadConfig(dir)).toThrow(`${path}: cannot parse`);
  });
});

describe("bundled scenarios", () => {
  it("cover every world", () => {
    const worlds = new Set(loadAllScenarios().flatMap((s) => s.worlds));
    expect([...worlds].sort()).toEqual([...builtinRegistry().worlds.keys()].sort());
  });
});
