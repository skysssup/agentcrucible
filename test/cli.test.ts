import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { findScenarios } from "../src/scenarios.js";

function runCli(args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8",
  });
}

describe("CLI output and configuration", () => {
  it.each([
    ["honest-stop", 0],
    ["naive-retry", 2],
  ])("prints one JSON array for a batch with %s", (agent, exit) => {
    const out = mkdtempSync(join(tmpdir(), "ac-cli-"));
    try {
      const result = runCli(["run", "--tag", "smoke", "--agent", String(agent), "--json", "--out", out]);
      expect(result.status, result.stderr).toBe(exit);
      const reports = JSON.parse(result.stdout);
      expect(Array.isArray(reports)).toBe(true);
      expect(reports.map((report: { scenarioId: string }) => report.scenarioId)).toEqual(
        findScenarios({ tag: "smoke" }).map(scenario => scenario.id)
      );
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("preserves a JSON object for a single scenario", () => {
    const out = mkdtempSync(join(tmpdir(), "ac-cli-"));
    try {
      const result = runCli([
        "run", "--scenario", "payments/rate-limit", "--agent", "idempotent-retry", "--json", "--out", out,
      ]);
      expect(result.status, result.stderr).toBe(0);
      const report = JSON.parse(result.stdout);
      expect(Array.isArray(report)).toBe(false);
      expect(report.scenarioId).toBe("payments/rate-limit");
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it.each([
    { flags: [], trials: 3 },
    { flags: ["--trials", "2"], trials: 2 },
  ])("uses $trials comparison trials with flags $flags", ({ flags, trials }) => {
    const dir = mkdtempSync(join(tmpdir(), "ac-cli-"));
    try {
      const config = join(dir, "config.json");
      writeFileSync(config, JSON.stringify({ trials: 3 }));
      const result = runCli([
        "compare", "--scenario", "payments/timeout-after-commit", "--agents", "honest-stop", "--config", config, ...flags,
      ]);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain(`trials=${trials})`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
