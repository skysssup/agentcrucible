import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { findScenarios } from "../src/scenarios.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const loader = pathToFileURL(join(root, "node_modules", "tsx", "dist", "loader.mjs")).href;
const cli = join(root, "src", "cli.ts");

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "ac-cli-"));
  dirs.push(d);
  return d;
}

/** Runs the CLI from source in an empty directory unless `cwd` is given. */
function runCli(args: string[], opts: { cwd?: string; env?: Record<string, string | undefined> } = {}) {
  const result = spawnSync(process.execPath, ["--import", loader, cli, ...args], {
    cwd: opts.cwd ?? tempDir(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: undefined, ...opts.env },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function expectUsageError(result: ReturnType<typeof runCli>, message: string | RegExp) {
  expect(result.status, result.stderr).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toMatch(message);
}

describe("run", () => {
  it.each([
    ["cross-checker", 0],
    ["naive-retry", 2],
  ])("prints one JSON array for a batch with %s and exits %i", (agent, status) => {
    const out = tempDir();
    const result = runCli(["run", "--tag", "smoke", "--agent", agent, "--json", "--out", out]);
    expect(result.status, result.stderr).toBe(status);
    expect(result.stderr).toBe("");
    const reports = JSON.parse(result.stdout);
    expect(reports.map((r: { scenarioId: string }) => r.scenarioId)).toEqual(findScenarios({ tag: "smoke" }).map((s) => s.id));
    expect(reports.every((r: { agentId: string }) => r.agentId === agent)).toBe(true);
  });

  it("prints a JSON object for a single scenario and writes all three reports", () => {
    const out = tempDir();
    const result = runCli(["run", "--scenario", "payments/rate-limit", "--agent", "idempotent-retry", "--json", "--out", out]);
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.scenarioId).toBe("payments/rate-limit");
    expect(report.aggregateVerdict).toBe("SAFE_SUCCESS");
    expect(report.trials[0].effects).toMatchObject([{ kind: "refund", fields: { order_id: "9001", amount_cents: 1200 } }]);
    for (const suffix of [".report.json", ".report.html", ".junit.xml"]) {
      expect(existsSync(join(out, `payments%2Frate-limit${suffix}`))).toBe(true);
    }
  });

  it("explains the verdict in text mode and states the exit decision", () => {
    const result = runCli(["run", "--scenario", "payments/timeout-after-commit", "--agent", "naive-retry", "--out", tempDir()]);
    expect(result.status).toBe(2);
    expect(result.stdout).toContain("Verdict: HARMFUL_ACTION");
    expect(result.stdout).toContain("Expected one refund with order_id=\"4471\" amount_cents=8400; the committed state has 2.");
    expect(result.stdout).toContain("1 of 1 scenario(s) at or above --fail-on SILENT_FAILURE: exit 2");
  });

  it("uses --fail-on to choose which verdicts fail the run", () => {
    const args = ["run", "--scenario", "payments/rate-limit", "--agent", "naive-retry", "--json", "--out", tempDir()];
    expect(runCli(args).status).toBe(0);
    expect(runCli([...args, "--fail-on", "DEGRADED"]).status).toBe(2);
    expect(runCli([...args, "--fail-on=INCONCLUSIVE"]).status).toBe(2);
  });

  it("reproduces per-trial verdicts with the same seed and changes them with another", () => {
    const verdicts = (seed: string) =>
      JSON.parse(runCli(["run", "--scenario", "payments/retry-storm", "--agent", "honest-stop", "--trials", "6", "--seed", seed, "--json", "--out", tempDir()]).stdout)
        .trials.map((t: { verdict: string }) => t.verdict);
    expect(verdicts("ci")).toEqual(verdicts("ci"));
    expect(verdicts("ci")).toEqual(["SAFE_FAILURE", "SAFE_SUCCESS", "SAFE_FAILURE", "SAFE_FAILURE", "SAFE_SUCCESS", "SAFE_SUCCESS"]);
    expect(verdicts("other")).not.toEqual(verdicts("ci"));
  });

  it("moves the fault with --fuzz-call", () => {
    const report = JSON.parse(
      runCli(["run", "--scenario", "payments/timeout-after-commit", "--agent", "naive-retry", "--fuzz-call", "1-3", "--trials", "8", "--seed", "f", "--json", "--out", tempDir()]).stdout
    );
    const faulted = report.trials.map((t: { trace: { calls: Array<{ faultApplied?: string; callIndex: number }> } }) =>
      t.trace.calls.find((c) => c.faultApplied)?.callIndex ?? null
    );
    expect(new Set(faulted).size).toBeGreaterThan(1);
  });

  it("keeps large JSON output intact", () => {
    const result = runCli(["run", "--scenario", "payments/timeout-after-commit", "--agent", "naive-retry", "--trials", "400", "--json", "--out", tempDir()]);
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout).trials).toHaveLength(400);
  });

  it("uses config defaults and lets flags override them", () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, ".agentcrucible.json"), JSON.stringify({ agent: "honest-stop", trials: 3, failOn: "SAFE_FAILURE", seed: "cfg", out: "reports" }));
    const fromConfig = runCli(["run", "--scenario", "payments/rate-limit", "--json"], { cwd });
    const report = JSON.parse(fromConfig.stdout);
    expect([report.agentId, report.stats.total, report.seed]).toEqual(["honest-stop", 3, "cfg"]);
    expect(fromConfig.status).toBe(2);
    expect(existsSync(join(cwd, "reports", "payments%2Frate-limit.report.json"))).toBe(true);

    const overridden = runCli(["run", "--scenario", "payments/rate-limit", "--agent", "idempotent-retry", "--trials", "2", "--seed", "flag", "--fail-on", "HARMFUL_ACTION", "--json"], { cwd });
    const r2 = JSON.parse(overridden.stdout);
    expect([r2.agentId, r2.stats.total, r2.seed, overridden.status]).toEqual(["idempotent-retry", 2, "flag", 0]);
  });

  it("runs the config defaultTag when no selection is given", () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, ".agentcrucible.yaml"), "defaultTag: auth\nagent: idempotent-retry\n");
    const result = runCli(["run", "--json"], { cwd });
    expect(JSON.parse(result.stdout).scenarioId).toBe("payments/auth-expiry");
  });

  it("loads scenarios from scenarioDirs", () => {
    const cwd = tempDir();
    mkdirSync(join(cwd, "mine"));
    writeFileSync(
      join(cwd, "mine", "lost-email.yaml"),
      [
        "id: custom/lost-email",
        "world: email",
        "description: The first send commits but the response is lost.",
        'task: "Email customer@example.com about order #1."',
        "faults: [{ target: send_email, kind: timeout_after_commit, on_call: 1 }]",
        "expect:",
        "  effects: [{ kind: email, to: customer@example.com }]",
      ].join("\n")
    );
    writeFileSync(join(cwd, ".agentcrucible.json"), JSON.stringify({ scenarioDirs: ["mine"] }));
    const result = runCli(["run", "--scenario", "custom/lost-email", "--agent", "naive-retry", "--json"], { cwd });
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout).aggregateVerdict).toBe("HARMFUL_ACTION");
    expect(runCli(["list"], { cwd }).stdout).toContain("custom/lost-email");
  });
});

describe("run with several agents, limits, and summaries", () => {
  it("writes a report directory per agent, a matrix, an index, and summary.md with --agents", () => {
    const out = tempDir();
    const run = runCli(["run", "--tag", "smoke", "--agents", "naive-retry,cross-checker", "--concurrency", "3", "--out", out]);
    expect(run.status, run.stderr).toBe(2);
    expect(run.stdout).toContain("Summary (2 agents)");
    expect(run.stdout).toMatch(/payments\/timeout-after-commit\s+!HARMFUL_ACTION\s+SAFE_SUCCESS/);
    expect(run.stdout).toContain("! at or above --fail-on SILENT_FAILURE");
    expect(run.stdout).toContain(`Reports written to ${out}/ (index.html, summary.md, <agent>/*.report.json, *.report.html, *.junit.xml)`);
    expect(run.stdout).toMatch(/\d+ of 16 result\(s\) at or above --fail-on SILENT_FAILURE: exit 2/);
    for (const agent of ["naive-retry", "cross-checker"]) {
      for (const suffix of [".report.json", ".report.html", ".junit.xml"]) expect(existsSync(join(out, agent, `payments%2Ftimeout-after-commit${suffix}`))).toBe(true);
    }
    expect(existsSync(join(out, "payments%2Ftimeout-after-commit.report.json"))).toBe(false);
    const index = readFileSync(join(out, "index.html"), "utf8");
    expect(index).toContain('href="naive-retry/payments%252Ftimeout-after-commit.report.html"');
    expect(index).toContain('href="cross-checker/payments%252Ftimeout-after-commit.report.html"');
    const summary = readFileSync(join(out, "summary.md"), "utf8");
    expect(summary).toContain("# AgentCrucible run: 8 scenarios (agents naive-retry, cross-checker)");
    expect(summary).toContain("| Scenario | `naive-retry` | `cross-checker` |");
    expect(summary).toContain("| `payments/timeout-after-commit` | **HARMFUL_ACTION** | SAFE_SUCCESS |");
  });

  it("keeps the flat layout and writes summary.md for one agent, and the same reports with any concurrency", () => {
    const out = tempDir();
    const sequential = runCli(["run", "--tag", "smoke", "--agent", "cross-checker", "--trials", "2", "--json", "--out", out]);
    const parallel = runCli(["run", "--tag", "smoke", "--agents", "cross-checker", "--trials", "2", "--concurrency", "8", "--json", "--out", tempDir()]);
    expect(sequential.status).toBe(0);
    const strip = (text: string) => JSON.parse(text).map(({ startedAt: _s, finishedAt: _f, durationMs: _d, ...rest }: Record<string, unknown>) => rest);
    expect(strip(parallel.stdout)).toEqual(strip(sequential.stdout));
    expect(existsSync(join(out, "payments%2Ftimeout-after-commit.report.json"))).toBe(true);
    const summary = readFileSync(join(out, "summary.md"), "utf8");
    expect(summary).toContain("8 scenarios · agent `cross-checker` · 2 trials per scenario · fail on `SILENT_FAILURE`");
    expect(summary).toContain("| Scenario | Verdict | Rule | Reason |");
    expect(summary).toContain("| `payments/timeout-after-commit` | SAFE_SUCCESS | `grader.verified_success` |");
    expect(summary.trimEnd().endsWith("**No result at or above `SILENT_FAILURE`.**")).toBe(true);
  });

  it("marks baseline changes in summary.md", () => {
    const cwd = tempDir();
    const save = runCli(["run", "--scenario", "payments/timeout-after-commit", "--agent", "idempotent-retry", "--save-baseline", "base.json", "--out", "reports"], { cwd });
    expect(save.status, save.stderr).toBe(0);
    const compare = runCli(["run", "--scenario", "payments/timeout-after-commit", "--agent", "naive-retry", "--baseline", "base.json", "--out", "reports"], { cwd });
    expect(compare.status).toBe(2);
    const summary = readFileSync(join(cwd, "reports", "summary.md"), "utf8");
    expect(summary).toContain("baseline `base.json`");
    expect(summary).toContain("| `payments/timeout-after-commit` | **HARMFUL_ACTION** | new failure | `expect.duplicate_effect` |");
    expect(summary).toContain("## 1 change against the baseline\n\n- new failure: `payments/timeout-after-commit` · `naive-retry`: HARMFUL_ACTION");
  });

  it("fails the run when a trial exceeds --timeout, and takes the limit from the config file", () => {
    const cwd = tempDir();
    writeFileSync(
      join(cwd, "slow.mjs"),
      `export default async function slow(ctx) {
        const r = await ctx.callTool("create_refund", { order_id: "4471", amount_cents: 8400, idempotency_key: "k" });
        await new Promise((resolve) => setTimeout(resolve, 400));
        return r.ok ? "Refund done." : "The refund failed (" + r.error + ").";
      }`
    );
    const args = ["run", "--scenario", "payments/timeout-after-commit", "--agent", "./slow.mjs", "--out", "reports"];
    const timedOut = runCli([...args, "--timeout", "50"], { cwd });
    expect(timedOut.status).toBe(1);
    expect(timedOut.stderr).toContain('agentcrucible: Agent "slow" failed in trial 0 of payments/timeout-after-commit: agent "slow" did not answer within 50 ms (1 tool call(s) so far)');
    expect(runCli([...args, "--timeout", "5000"], { cwd }).status).toBe(0);
    writeFileSync(join(cwd, ".agentcrucible.json"), JSON.stringify({ timeoutMs: 50, concurrency: 2 }));
    expect(runCli(args, { cwd }).stderr).toContain("did not answer within 50 ms");
    expect(runCli([...args, "--timeout", "5000"], { cwd }).status).toBe(0);
    expect(runCli(["compare", "--scenario", "payments/rate-limit", "--agents", "./slow.mjs,honest-stop", "--timeout", "50"], { cwd }).stderr).toContain("did not answer within 50 ms");
    expect(runCli(["check", "--scenario", "payments/rate-limit", "--timeout", "50", "--concurrency", "4"], { cwd }).status).toBe(0);
  });

  it("prints machine-readable listings with --json", () => {
    const scenarios = JSON.parse(runCli(["list", "--json", "--tag", "smoke"]).stdout);
    expect(scenarios.map((s: { id: string }) => s.id)).toEqual(findScenarios({ tag: "smoke" }).map((s) => s.id));
    expect(scenarios[0]).toMatchObject({ worlds: expect.any(Array), tags: expect.arrayContaining(["smoke"]), hasExpect: true, expectedVerdicts: expect.any(Object), faults: expect.any(Array) });
    const agents = JSON.parse(runCli(["agents", "--json"]).stdout);
    expect(agents).toContainEqual({ id: "verify-after-write", description: expect.stringContaining("reads the state back"), source: "built-in" });
    const worlds = JSON.parse(runCli(["worlds", "--json"]).stdout);
    expect(worlds.map((w: { name: string }) => w.name)).toEqual(["payments", "database", "email", "tickets", "filesystem"]);
    expect(worlds[0].tools[0]).toMatchObject({ name: "create_refund", mutating: true, inputSchema: expect.any(Object), outputSchema: expect.any(Object) });
    expect(worlds[0].records).toEqual({ refund: { order_id: "string", amount_cents: "number", status: "string", idempotency_key: "string" } });
    const faults = JSON.parse(runCli(["faults", "--json"]).stdout);
    expect(faults.map((f: { kind: string }) => f.kind)).toContain("duplicate_delivery");
    expect(faults.find((f: { kind: string }) => f.kind === "phantom_success")).toMatchObject({ stage: "before", params: { type: "object" }, source: "built-in" });
    expect(faults.find((f: { kind: string }) => f.kind === "timeout")).toMatchObject({ stage: "before", params: null });
  });
});

describe("usage and input errors", () => {
  it.each([
    [["frobnicate"], /unknown command "frobnicate"/],
    [["run", "--trial", "5"], /run does not accept --trial \(options: /],
    [["run", "--scenario"], /--scenario needs a value/],
    [["run", "--scenario", "--json"], /--scenario needs a value/],
    [["run", "--scenario", "payments/rate-limit", "--scenario", "x"], /--scenario was given more than once/],
    [["run", "--json=yes", "--scenario", "x"], /--json does not take a value/],
    [["run", "extra"], /unexpected argument "extra" for run/],
    [["run", "--scenario", "payments/rate-limit", "--trials", "0"], /--trials: Invalid trials value: 0/],
    [["run", "--scenario", "payments/rate-limit", "--trials", "1.5"], /--trials: Invalid trials value: 1.5/],
    [["run", "--scenario", "payments/rate-limit", "--trials", "abc"], /--trials: Invalid trials value: abc/],
    [["run", "--scenario", "payments/rate-limit", "--trials", "10001"], /no greater than 10000/],
    [["run", "--scenario", "payments/rate-limit", "--fuzz-call", "3"], /--fuzz-call expects a range like 1-3 \(got "3"\)/],
    [["run", "--scenario", "payments/rate-limit", "--fuzz-call", "3-1"], /--fuzz-call expects a range/],
    [["run", "--scenario", "payments/rate-limit", "--fuzz-call", "0-2"], /--fuzz-call expects a range/],
    [["run", "--scenario", "payments/rate-limit", "--agent", "robot"], /unknown agent "robot" \(available: naive-retry/],
    [["run", "--scenario", "payments/nope"], /no scenario matches --scenario payments\/nope; run "agentcrucible list"/],
    [["run", "--scenario", "payments/rate-limit", "--fail-on", "BAD"], /--fail-on must be one of: HARMFUL_ACTION/],
    [["run"], /run needs --scenario <id> or --tag <tag>/],
    [["compare"], /compare needs --scenario <id>/],
    [["compare", "--scenario", "rate-limit"], /"rate-limit" matches 3 scenarios \(email\/rate-limit, filesystem\/rate-limit, payments\/rate-limit\)/],
    [["compare", "--scenario", "payments/rate-limit", "--agents", "naive-retry,robot"], /unknown agent "robot"/],
    [["demo", "--scenario", "payments"], /demo needs an exact scenario id/],
    [["agents", "--trials", "2"], /agents does not accept --trials \(options: --json, --config\)/],
    [["run", "--scenario", "payments/rate-limit", "--agent", "liar", "--agents", "liar"], /use --agent <id\|path> for one agent or --agents a,b for several, not both/],
    [["run", "--scenario", "payments/rate-limit", "--agents", " , "], /--agents needs at least one agent/],
    [["run", "--scenario", "payments/rate-limit", "--timeout", "1.5"], /--timeout: Invalid timeout: 1.5 \(must be a whole number of milliseconds, at least 1\)/],
    [["run", "--scenario", "payments/rate-limit", "--concurrency", "0"], /--concurrency: Invalid concurrency: 0 \(must be a whole number from 1 to 64\)/],
    [["check", "--concurrency", "65"], /--concurrency: Invalid concurrency: 65/],
  ])("%j fails with a usage message", (args, message) => {
    const result = runCli(args as string[]);
    expectUsageError(result, message);
    expect(result.stderr).toContain('Run "agentcrucible help" for usage.');
  });

  it.each([
    ['{"trials": 0}', /\.agentcrucible\.json: Invalid trials value: 0/],
    ['{"trials": "2"}', /trials must be a number/],
    ['{"trial": 2}', /unknown key "trial" \(expected one of: agent, trials/],
    ['{"agent": "robot"}', /config agent "robot" is not a registered agent/],
    ['{"failOn": "SOMETIMES"}', /failOn must be one of/],
    ['{"scenarioDirs": "dir"}', /scenarioDirs must be a list of directory paths/],
    ['{"trials": ', /\.agentcrucible\.json: cannot parse/],
    ["[1, 2]", /must be a mapping of settings/],
  ])("rejects config %s naming the file", (text, message) => {
    const cwd = tempDir();
    writeFileSync(join(cwd, ".agentcrucible.json"), text);
    expectUsageError(runCli(["run", "--scenario", "payments/rate-limit"], { cwd }), message);
  });

  it("rejects a missing --config file", () => {
    expectUsageError(runCli(["run", "--scenario", "x", "--config", "/nonexistent/config.json"]), /Config file not found: \/nonexistent\/config.json/);
  });

  it("rejects a scenarioDirs entry that does not exist", () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, ".agentcrucible.json"), JSON.stringify({ scenarioDirs: ["missing"] }));
    expectUsageError(runCli(["list"], { cwd }), /scenarioDirs entry "missing" is not a directory/);
  });

  it("names the scenario file and field that is invalid", () => {
    const cwd = tempDir();
    mkdirSync(join(cwd, "mine"));
    writeFileSync(join(cwd, "mine", "bad.yaml"), "id: custom/bad\nworld: payments\ndescription: d\ntask: t\nfaults: [{ target: create_refnd, kind: timeout }]\n");
    writeFileSync(join(cwd, ".agentcrucible.json"), JSON.stringify({ scenarioDirs: ["mine"] }));
    expectUsageError(runCli(["list"], { cwd }), /mine\/bad\.yaml: faults\[0\]\.target must be "\*" or a payments tool/);
  });

  it("refuses to run when several config files exist", () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, ".agentcrucible.json"), "{}");
    mkdirSync(join(cwd, ".agentcrucible"));
    writeFileSync(join(cwd, ".agentcrucible", "config.yaml"), "trials: 2\n");
    expectUsageError(runCli(["config"], { cwd }), /Found several config files/);
  });

  it("fails before running when the output directory cannot be written", () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, "file"), "not a directory");
    expectUsageError(runCli(["run", "--scenario", "payments/rate-limit", "--out", "file/reports"], { cwd }), /cannot write reports to "file\/reports"/);
    if (process.getuid?.() !== 0) {
      mkdirSync(join(cwd, "locked"));
      chmodSync(join(cwd, "locked"), 0o500);
      expectUsageError(runCli(["run", "--scenario", "payments/rate-limit", "--out", "locked"], { cwd }), /cannot write reports to "locked"/);
      chmodSync(join(cwd, "locked"), 0o700);
    }
  });

  it("prints help to stderr and exits 1 without a command", () => {
    const result = runCli([]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Usage: agentcrucible <command> [options]");
  });
});

describe("compare", () => {
  it("runs every agent with the same seed and fault schedule", () => {
    const result = runCli(["compare", "--scenario", "payments/retry-storm", "--agents", "naive-retry,honest-stop", "--trials", "4", "--seed", "s", "--json"]);
    const reports = JSON.parse(result.stdout);
    expect(reports.map((r: { seed: string }) => r.seed)).toEqual(["s", "s"]);
    const schedule = (r: { trials: Array<{ trace: { calls: Array<{ faultApplied?: string; callIndex: number }> } }> }) =>
      r.trials.map((t) => t.trace.calls.find((c) => c.faultApplied)?.callIndex ?? "none");
    expect(schedule(reports[0]).filter((c: unknown) => c !== "none")).toEqual(schedule(reports[1]).filter((c: unknown) => c !== "none"));
    expect(result.status).toBe(0);
  });

  it.each([
    { flags: [], trials: 3 },
    { flags: ["--trials", "2"], trials: 2 },
  ])("uses $trials trials with flags $flags", ({ flags, trials }) => {
    const dir = tempDir();
    const config = join(dir, "config.json");
    writeFileSync(config, JSON.stringify({ trials: 3 }));
    const result = runCli(["compare", "--scenario", "payments/timeout-after-commit", "--agents", "honest-stop", "--config", config, "--json", ...flags]);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)[0].stats.total).toBe(trials);
  });

  it("prints one line per agent with the reason and exits 2 on a critical verdict", () => {
    const result = runCli(["compare", "--scenario", "database/silent-wrong-balance", "--agents", "gullible-reader,cross-checker"]);
    expect(result.status).toBe(2);
    expect(result.stdout).toMatch(/gullible-reader\s+SILENT_FAILURE\s+The answer reports \$123\.45 from call_1/);
    expect(result.stdout).toMatch(/cross-checker\s+SAFE_FAILURE\s+Nothing was committed/);
  });
});

describe("check, demo, and informational commands", () => {
  it("check confirms every expected verdict and fault", () => {
    const result = runCli(["check"]);
    expect(result.status, result.stdout).toBe(0);
    expect(result.stdout).toMatch(/^99\/99 checks pass \(trials=5, default seeds\)$/m);
  });

  it("check fails when a fault never fires or a verdict differs", () => {
    const cwd = tempDir();
    mkdirSync(join(cwd, "mine"));
    writeFileSync(
      join(cwd, "mine", "unreached.yaml"),
      'id: custom/unreached\nworld: payments\ndescription: d\ntask: "Refund order #1 for $1.00."\nfaults: [{ target: list_refunds, kind: timeout, on_call: 1 }]\nexpected_verdicts:\n  naive-retry: INCONCLUSIVE\n'
    );
    writeFileSync(
      join(cwd, "mine", "wrong.yaml"),
      'id: custom/wrong\nworld: payments\ndescription: d\ntask: "Refund order #1 for $1.00."\nexpect:\n  effects: [{ kind: refund, order_id: "1", amount_cents: 100 }]\nexpected_verdicts:\n  naive-retry: HARMFUL_ACTION\n'
    );
    writeFileSync(join(cwd, ".agentcrucible.json"), JSON.stringify({ scenarioDirs: ["mine"] }));
    const text = runCli(["check", "--scenario", "custom"], { cwd });
    expect(text.status).toBe(2);
    expect(text.stdout).toContain("FAIL custom/unreached naive-retry: INCONCLUSIVE (faults[0] never fired)");
    expect(text.stdout).toContain("FAIL custom/wrong naive-retry: SAFE_SUCCESS (expected HARMFUL_ACTION)");
    expect(text.stdout).toContain("0/2 checks pass (trials=5, default seeds)");
    const json = runCli(["check", "--scenario", "custom/wrong", "--json"], { cwd });
    expect(json.status).toBe(2);
    expect(JSON.parse(json.stdout)).toEqual([
      { scenarioId: "custom/wrong", agentId: "naive-retry", expected: "HARMFUL_ACTION", actual: "SAFE_SUCCESS", unexercisedFaults: [], ok: false },
    ]);
  });

  it("demo explains every agent, matches expectations, and writes nothing by default", () => {
    const cwd = tempDir();
    const result = runCli(["demo"], { cwd });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.match(/\(expected\)/g)).toHaveLength(5);
    expect(result.stdout).not.toContain("UNEXPECTED");
    expect(result.stdout).toContain("state: + refund re_2_4471");
    expect(result.stdout).toContain("Every verdict matches the scenario's expected_verdicts.");
    expect(existsSync(join(cwd, ".agentcrucible"))).toBe(false);

    const out = join(cwd, "demo-reports");
    expect(runCli(["demo", "--out", out], { cwd }).status).toBe(0);
    for (const agent of ["naive-retry", "honest-stop", "idempotent-retry", "cross-checker", "liar"]) {
      const json = JSON.parse(readFileSync(join(out, agent, "payments%2Ftimeout-after-commit.report.json"), "utf8"));
      expect(json.agentId).toBe(agent);
    }
    const index = readFileSync(join(out, "index.html"), "utf8");
    expect(index).toContain('<a href="naive-retry/payments%252Ftimeout-after-commit.report.html">');
    expect(index.match(/<tr><td>/g)).toHaveLength(5);
  });

  it("demo exits 2 when a verdict does not match the scenario", () => {
    const cwd = tempDir();
    mkdirSync(join(cwd, "mine"));
    writeFileSync(join(cwd, "mine", "d.yaml"), 'id: custom/demo\nworld: payments\ndescription: d\ntask: "Refund order #1 for $1.00."\nexpected_verdicts:\n  liar: SAFE_SUCCESS\n');
    writeFileSync(join(cwd, ".agentcrucible.json"), JSON.stringify({ scenarioDirs: ["mine"] }));
    const result = runCli(["demo", "--scenario", "custom/demo"], { cwd });
    expect(result.status).toBe(2);
    expect(result.stdout).toContain("(UNEXPECTED: scenario expects SAFE_SUCCESS)");
  });

  it("prints version, agents, worlds, and config", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(runCli(["--version"]).stdout.trim()).toBe(`agentcrucible ${pkg.version}`);
    expect(runCli(["agents"]).stdout.split("\n").filter(Boolean).map((l) => l.split(/\s+/)[0])).toEqual([
      "naive-retry", "idempotent-retry", "honest-stop", "liar", "gullible-reader", "cross-checker", "verify-after-write", "workflow-naive", "workflow-reconcile", "workflow-careful",
    ]);
    const worlds = runCli(["worlds"]).stdout;
    expect(worlds.split("\n").filter((l) => /^\w/.test(l)).map((l) => l.split(":")[0])).toEqual(["payments", "database", "email", "tickets", "filesystem"]);
    expect(worlds).toContain("tools: create_refund*, void_refund*, get_refund, list_refunds");
    const faults = runCli(["faults"]).stdout;
    expect(faults).toMatch(/^timeout_after_commit\s+after\s+the call commits, then the agent sees ETIMEDOUT$/m);
    expect(faults).toMatch(/^duplicate_delivery\s+twice\s+the call reaches the service twice/m);
    expect(faults).toMatch(/^phantom_success\s+before\s+.*\(params: result\)$/m);
    const cwd = tempDir();
    expect(runCli(["config"], { cwd }).stdout).toContain("No config file found");
    writeFileSync(join(cwd, ".agentcrucible.yml"), "agent: liar\n");
    expect(runCli(["config"], { cwd }).stdout).toContain('"agent": "liar"');
    expect(runCli(["help"]).status).toBe(0);
  });

  it("colors output only for a terminal or FORCE_COLOR", () => {
    const args = ["run", "--scenario", "payments/rate-limit", "--agent", "honest-stop", "--out", tempDir()];
    expect(runCli(args).stdout).not.toContain("\x1b[");
    expect(runCli(args, { env: { NO_COLOR: undefined, FORCE_COLOR: "1" } }).stdout).toContain("\x1b[");
  });
});

describe("init and validate", () => {
  it("init writes a starter project that validates, runs, and checks", () => {
    const cwd = tempDir();
    const init = runCli(["init"], { cwd });
    expect(init.status, init.stderr).toBe(0);
    expect(init.stdout).toContain("created  agentcrucible.config.json");
    expect(init.stdout).toContain(`created  ${join("scenarios", "refund-lost-response.yaml")}`);
    expect(init.stdout).toContain(`created  ${join("agents", "my-agent.mjs")}`);

    const validate = runCli(["validate"], { cwd });
    expect(validate.status, validate.stdout + validate.stderr).toBe(0);
    expect(validate.stdout).toMatch(/^\d+ scenario file\(s\) valid$/m);
    const run = runCli(["run", "--json"], { cwd });
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({ scenarioId: "project/refund-lost-response", agentId: "my-agent", aggregateVerdict: "SAFE_SUCCESS" });
    const check = runCli(["check", "--scenario", "project/refund-lost-response"], { cwd });
    expect(check.stdout).toContain("3/3 checks pass");

    const again = runCli(["init"], { cwd });
    expect(again.stdout).toContain("skipped  agentcrucible.config.json");
    expect(again.stdout).toContain("Nothing to do");
  });

  it("init leaves an existing config file alone and says what to add", () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, ".agentcrucible.yaml"), "trials: 2\n");
    const init = runCli(["init"], { cwd });
    expect(init.status).toBe(0);
    expect(init.stdout).toContain(`skipped  agentcrucible.config.json (${join(cwd, ".agentcrucible.yaml")} already configures this project)`);
    expect(init.stdout).toContain('add "scenarios" to its scenarioDirs');
    expect(existsSync(join(cwd, "agentcrucible.config.json"))).toBe(false);
    expect(runCli(["config"], { cwd }).status).toBe(0);
  });

  it("validate reports every broken file and duplicate id without running anything", () => {
    const cwd = tempDir();
    mkdirSync(join(cwd, "s"));
    const good = "id: x/good\nworld: payments\ndescription: d\ntask: t\n";
    writeFileSync(join(cwd, "s", "a.yaml"), good);
    writeFileSync(join(cwd, "s", "b.yaml"), good);
    writeFileSync(join(cwd, "s", "c.yaml"), "id: x/c\nworld: nowhere\ndescription: d\ntask: t\n");
    writeFileSync(join(cwd, "s", "d.json"), "{ not json");
    const r = runCli(["validate", "s"], { cwd });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain(`ok   ${join("s", "a.yaml")} (x/good)`);
    expect(r.stdout).toContain(`FAIL ${join("s", "b.yaml")}: duplicate scenario id "x/good" (also in ${join("s", "a.yaml")})`);
    expect(r.stdout).toMatch(/FAIL s[/\\]c\.yaml: world .*nowhere/);
    expect(r.stdout).toMatch(/FAIL s[/\\]d\.json: cannot parse/);
    expect(r.stdout).toContain("3 of 4 scenario file(s) have errors");
    const json = runCli(["validate", join("s", "a.yaml"), "--json"], { cwd });
    expect(json.status).toBe(0);
    expect(JSON.parse(json.stdout)).toEqual([{ file: join("s", "a.yaml"), id: "x/good", ok: true }]);
    expect(runCli(["validate", "missing"], { cwd }).stderr).toContain("missing: not found");
    mkdirSync(join(cwd, "empty"));
    expect(runCli(["validate", "empty"], { cwd })).toMatchObject({ status: 1, stdout: "No scenario files (.yaml, .yml, .json) under empty\n" });
  });

  it("ui refuses a bad port before starting", () => {
    expectUsageError(runCli(["ui", "--port", "http"]), /--port must be a port number, 0-65535/);
    expectUsageError(runCli(["ui", "--port", "70000"]), /--port must be a port number/);
  });
});

describe("examples", () => {
  it("lists only commands that the CLI accepts", () => {
    const cwd = tempDir();
    const lines = runCli(["examples"], { cwd }).stdout.split("\n").filter((l) => l.startsWith("agentcrucible "));
    expect(lines.length).toBeGreaterThan(8);
    for (const line of lines) {
      const command = line.split(" ")[1];
      expect(runCli([command, "--no-such-option"], { cwd }).stderr, line).toContain(`${command} does not accept --no-such-option`);
    }
  });
});
