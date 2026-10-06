import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createBaseline, compareBaseline } from "../src/baseline.js";
import { completionScript } from "../src/completion.js";
import { githubAnnotations, githubStepSummary } from "../src/github.js";
import { runScenario } from "../src/runner.js";
import { bundledScenariosDir, findScenarios } from "../src/scenarios.js";
import { VERDICTS } from "../src/types.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const loader = pathToFileURL(join(root, "node_modules", "tsx", "dist", "loader.mjs")).href;
const cli = join(root, "src", "cli.ts");
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "ac-cg-"));
  dirs.push(d);
  return d;
}
function runCli(args: string[], opts: { cwd?: string; env?: Record<string, string | undefined> } = {}) {
  const r = spawnSync(process.execPath, ["--import", loader, cli, ...args], { cwd: opts.cwd ?? tempDir(), encoding: "utf8", env: { ...process.env, NO_COLOR: "1", GITHUB_ACTIONS: undefined, GITHUB_STEP_SUMMARY: undefined, ...opts.env } });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const commands = [
  { name: "run", description: "Run agents", flags: ["--scenario", "--agent", "--json", "--fail-on", "--out"] },
  { name: "inspect", description: "Show a report", flags: ["--trial"] },
  { name: "completion", description: "Print a completion script", flags: [] },
];

describe("completion scripts", () => {
  it("bash: completes commands, flags, dynamic ids, verdicts, and files", () => {
    const script = completionScript("bash", commands, VERDICTS);
    expect(script).toContain('local commands="run inspect completion"');
    expect(script).toContain('run) flags="--scenario --agent --json --fail-on --out" ;;');
    expect(script).toContain('--scenario) COMPREPLY=( $(compgen -W "$(agentcrucible list --ids 2>/dev/null)" -- "$cur") ); return ;;');
    expect(script).toContain(`--fail-on) COMPREPLY=( $(compgen -W "${VERDICTS.join(" ")}" -- "$cur") ); return ;;`);
    expect(script).toContain("complete -F _agentcrucible agentcrucible");
    const bash = spawnSync("bash", ["-n"], { input: script, encoding: "utf8" });
    expect(bash.status, bash.stderr).toBe(0);
  });

  it("zsh and fish: one entry per command with its flags", () => {
    const zsh = completionScript("zsh", commands, VERDICTS);
    expect(zsh.startsWith("#compdef agentcrucible")).toBe(true);
    expect(zsh).toContain("'run:Run agents'");
    expect(zsh).toContain("'--agent[agent]:value:($(agentcrucible agents --ids 2>/dev/null))'");
    expect(zsh).toContain("inspect) _arguments '1:file:_files' '--trial[trial]:value:' ;;");
    expect(zsh).toContain("completion) _arguments '1:shell:(bash zsh fish)'  ;;");
    const fish = completionScript("fish", commands, VERDICTS);
    expect(fish).toContain("complete -c agentcrucible -n __fish_use_subcommand -a run -d 'Run agents'");
    expect(fish).toContain("complete -c agentcrucible -n '__fish_seen_subcommand_from run' -l scenario -x -a '(agentcrucible list --ids 2>/dev/null)'");
    expect(fish).toContain("complete -c agentcrucible -n '__fish_seen_subcommand_from run' -l json\n");
    expect(fish).toContain(`complete -c agentcrucible -n '__fish_seen_subcommand_from run' -l fail-on -x -a '${VERDICTS.join(" ")}'`);
    expect(fish).toContain("complete -c agentcrucible -n '__fish_seen_subcommand_from inspect' -F");
  });

  it("the CLI prints each shell's script from its real command table and lists ids for the dynamic parts", () => {
    for (const shell of ["bash", "zsh", "fish"] as const) {
      const r = runCli(["completion", shell]);
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toContain("sweep");
      expect(r.stdout).toContain("coverage");
      expect(r.stdout).toContain(shell === "fish" ? "-l record" : "--record");
    }
    expect(runCli(["completion"]).stderr).toContain("completion needs a shell: agentcrucible completion <bash|zsh|fish>");
    expect(runCli(["completion", "powershell"]).stderr).toContain("completion needs a shell");
    const ids = runCli(["list", "--ids"]).stdout.trim().split("\n");
    expect(ids).toContain("payments/timeout-after-commit");
    expect(ids.every((id) => /^[a-z0-9/._-]+$/.test(id))).toBe(true);
    expect(runCli(["list", "--tags"]).stdout.trim().split("\n")).toContain("smoke");
    expect(runCli(["agents", "--ids"]).stdout.trim().split("\n")).toContain("cross-checker");
    expect(runCli(["faults", "--ids"]).stdout.trim().split("\n")).toContain("phantom_success");
  });
});

describe("GitHub Actions output", () => {
  const scenario = findScenarios({ id: "payments/timeout-after-commit", root: [bundledScenariosDir()] })[0];

  it("annotates failing results with the scenario file when it is inside the workspace", async () => {
    const bad = await runScenario({ scenario, agentId: "naive-retry" });
    const good = await runScenario({ scenario, agentId: "cross-checker" });
    const previous = process.env.GITHUB_WORKSPACE;
    try {
      process.env.GITHUB_WORKSPACE = tempDir();
      const outside = githubAnnotations([bad, good], "SILENT_FAILURE");
      expect(outside).toHaveLength(1);
      expect(outside[0]).toMatch(/^::error title=AgentCrucible%3A payments\/timeout-after-commit \(naive-retry\)::HARMFUL_ACTION: Expected one refund/);
      expect(outside[0]).not.toContain("file=");
      process.env.GITHUB_WORKSPACE = root;
      const inside = githubAnnotations([bad], "SILENT_FAILURE");
      expect(inside[0]).toContain(",file=scenarios/payments/timeout-after-commit.yaml::");
      expect(githubAnnotations([bad, good], "HARMFUL_ACTION")).toHaveLength(1);
      expect(githubAnnotations([good], "DEGRADED")).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env.GITHUB_WORKSPACE;
      else process.env.GITHUB_WORKSPACE = previous;
    }
  });

  it("reports regressions as errors and improvements as notices against a baseline", async () => {
    const before = createBaseline([await runScenario({ scenario, agentId: "cross-checker" }), await runScenario({ scenario, agentId: "naive-retry" })]);
    const liar = { ...(await runScenario({ scenario, agentId: "liar" })), agentId: "cross-checker" };
    const fixed = { ...(await runScenario({ scenario, agentId: "idempotent-retry" })), agentId: "naive-retry" };
    const comparison = compareBaseline(before, [liar, fixed]);
    expect(comparison.regressions).toHaveLength(1);
    expect(comparison.improvements).toHaveLength(1);
    const previous = process.env.GITHUB_WORKSPACE;
    process.env.GITHUB_WORKSPACE = tempDir();
    let lines: string[];
    try {
      lines = githubAnnotations([liar, fixed], "SILENT_FAILURE", comparison);
    } finally {
      if (previous === undefined) delete process.env.GITHUB_WORKSPACE;
      else process.env.GITHUB_WORKSPACE = previous;
    }
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^::error title=AgentCrucible%3A payments\/timeout-after-commit \(cross-checker\) \(regression\)::SILENT_FAILURE: /);
    expect(lines[1]).toMatch(/^::notice title=AgentCrucible%3A payments\/timeout-after-commit \(naive-retry\) improved::HARMFUL_ACTION -> SAFE_SUCCESS$/);
    expect(githubAnnotations.error("x (y)", "line one\nline two", undefined)).toBe("::error title=AgentCrucible%3A x (y)::line one%0Aline two");
  });

  it("appends to the step summary only when GitHub provides one", () => {
    const dir = tempDir();
    const path = join(dir, "summary.md");
    writeFileSync(path, "# before\n");
    expect(githubStepSummary("hello", {})).toBe(false);
    expect(githubStepSummary("hello", { GITHUB_STEP_SUMMARY: path })).toBe(true);
    expect(readFileSync(path, "utf8")).toBe("# before\nhello\n");
  });

  it("run, check, and sweep print annotations and write the summary under GITHUB_ACTIONS", () => {
    const cwd = tempDir();
    const summary = join(cwd, "step-summary.md");
    writeFileSync(summary, "");
    const env = { GITHUB_ACTIONS: "true", GITHUB_STEP_SUMMARY: summary, GITHUB_WORKSPACE: cwd };
    const run = runCli(["run", "--scenario", "payments/timeout-after-commit", "--agents", "naive-retry,cross-checker", "--out", "reports"], { cwd, env });
    expect(run.status).toBe(2);
    expect(run.stdout).toMatch(/^::error title=AgentCrucible%3A payments\/timeout-after-commit \(naive-retry\)::HARMFUL_ACTION: /m);
    expect(run.stdout).not.toMatch(/^::error .*cross-checker/m);
    expect(readFileSync(summary, "utf8")).toContain("| Scenario |");
    const check = runCli(["check", "--scenario", "payments/timeout-after-commit", "--github"], { cwd });
    expect(check.status).toBe(0);
    expect(readFileSync(summary, "utf8")).not.toContain("agentcrucible check");
    const sweep = runCli(["sweep", "--scenario", "payments/timeout-after-commit", "--agent", "cross-checker", "--kinds", "phantom_success,timeout"], { cwd, env });
    expect(sweep.status).toBe(2);
    expect(sweep.stdout).toMatch(/^::error title=AgentCrucible%3A payments\/timeout-after-commit \(cross-checker\)%3A phantom_success on create_refund#1::SILENT_FAILURE: /m);
    expect(readFileSync(summary, "utf8")).toContain("### agentcrucible sweep");
    expect(readFileSync(summary, "utf8")).toContain("| `phantom_success` | SILENT_FAILURE |");
  });

  it("keeps --json output parseable under GITHUB_ACTIONS and prints the annotations on stderr", () => {
    const cwd = tempDir();
    const env = { GITHUB_ACTIONS: "true", GITHUB_WORKSPACE: cwd };
    const run = runCli(["run", "--scenario", "payments/timeout-after-commit", "--agent", "naive-retry", "--json", "--out", "reports"], { cwd, env });
    expect(run.status).toBe(2);
    expect(JSON.parse(run.stdout).aggregateVerdict).toBe("HARMFUL_ACTION");
    expect(run.stderr).toMatch(/^::error title=AgentCrucible%3A payments\/timeout-after-commit \(naive-retry\)::HARMFUL_ACTION: /m);
    const sweep = runCli(["sweep", "--scenario", "payments/timeout-after-commit", "--agent", "cross-checker", "--kinds", "phantom_success", "--json"], { cwd, env });
    expect(sweep.status).toBe(2);
    expect(JSON.parse(sweep.stdout).cells.length).toBeGreaterThan(0);
    expect(sweep.stderr).toMatch(/^::error title=AgentCrucible%3A payments\/timeout-after-commit \(cross-checker\)%3A phantom_success on create_refund#1::SILENT_FAILURE: /m);
  });
});
