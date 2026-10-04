import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { compareBaseline, createBaseline } from "../src/baseline.js";
import { builtinRegistry, extendRegistry } from "../src/registry.js";
import { replayReport } from "../src/replay.js";
import { readReportFile, writeHtmlReport, writeJsonReport } from "../src/report.js";
import { runScenario } from "../src/runner.js";
import { findScenarios, parseScenario } from "../src/scenarios.js";
import type { RunReport } from "../src/types.js";
import { createEmailWorld } from "../src/worlds/email.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const loader = pathToFileURL(join(root, "node_modules", "tsx", "dist", "loader.mjs")).href;
const REPORT = "workflows%2Frefund-notify-resolve.report.json";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ac-trace-"));
  dirs.push(dir);
  return dir;
}

function runCli(args: string[], cwd: string) {
  const r = spawnSync(process.execPath, ["--import", loader, join(root, "src", "cli.ts"), ...args], { cwd, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Writes a two-trial workflow report into a fresh directory and returns the directory. */
function savedRun(agent = "workflow-reconcile"): string {
  const dir = tempDir();
  const r = runCli(["run", "--scenario", "workflows/refund-notify-resolve", "--agent", agent, "--trials", "2", "--out", "out"], dir);
  expect(r.status, r.stderr).toBe(agent === "workflow-naive" ? 2 : 0);
  return dir;
}

const edit = (dir: string, change: (report: RunReport) => void) => {
  const path = join(dir, "out", REPORT);
  const report = JSON.parse(readFileSync(path, "utf8")) as RunReport;
  change(report);
  writeFileSync(path, JSON.stringify(report));
};

describe("inspect", () => {
  it("shows the worst trial call by call, and one call in full", () => {
    const dir = savedRun();
    const overview = runCli(["inspect", `out/${REPORT}`], dir);
    expect(overview.status).toBe(0);
    expect(overview.stdout).toContain("Verdict: DEGRADED");
    expect(overview.stdout).toContain('call_4 void_refund#1  committed  agent saw: ok {"refund_id":"re_2_4471","status":"voided","deduplicated":false}');
    expect(overview.stdout).toContain('    state: ~ refund re_2_4471 status="voided"');
    expect(overview.stdout).toMatch(/^ {2}pass {9}names the id of the refund with order_id="4471" status="succeeded": re_1_4471$/m);
    expect(overview.stdout).toContain("DEGRADED       invariant.violated_then_restored");

    const call = runCli(["inspect", `out/${REPORT}`, "--trial", "1", "--call", "call_2"], dir);
    expect(call.stdout).toContain("trial 1 of 2");
    expect(call.stdout).toContain("call_2 create_refund#2  committed");
    expect(call.stdout).toContain('arguments:      {\n                  "order_id": "4471",');
    expect(call.stdout).toContain('state changes:  + refund re_2_4471 order_id="4471" amount_cents=8400 status="succeeded" (no idempotency key)');
    expect(call.stdout).toContain("findings:       DEGRADED invariant.violated_then_restored");
  });

  it.each([
    [["inspect"], "inspect needs a report file: agentcrucible inspect <report.json>"],
    [["inspect", "missing.json"], "missing.json: file not found"],
    [["inspect", "out/" + REPORT, "--trial", "5"], "the report has trials 0-1; there is no trial 5"],
    [["inspect", "out/" + REPORT, "--call", "call_99"], "there is no call_99"],
    [["inspect", "out/" + REPORT, "--trial", "x"], '--trial must be a trial number (got "x")'],
  ])("explains %j", (args, message) => {
    const dir = savedRun();
    const r = runCli(args, dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(message);
  });

  it("refuses reports from 0.4 and earlier, and asks which report a multi-report file means", () => {
    const dir = savedRun();
    edit(dir, (report) => {
      delete (report as Partial<RunReport>).reportVersion;
      report.toolVersion = "0.4.0";
    });
    expect(runCli(["inspect", `out/${REPORT}`], dir).stderr).toContain("report format 1 (AgentCrucible 0.4.0); this version reads format 2. Run the scenario again to write a new report.");
    const json = runCli(["run", "--tag", "workflow", "--agent", "workflow-careful", "--json", "--out", "x"], dir);
    writeFileSync(join(dir, "both.json"), json.stdout);
    expect(runCli(["inspect", "both.json"], dir).stderr).toContain("both.json holds 2 reports; choose one with --scenario (workflows/notification-outage, workflows/refund-notify-resolve)");
    expect(runCli(["inspect", "both.json", "--scenario", "workflows/notification-outage"], dir).stdout).toContain("Verdict: SAFE_FAILURE");
  });
});

describe("replay", () => {
  it("re-executes the recorded calls and confirms every state and verdict", () => {
    const dir = savedRun();
    const r = runCli(["replay", `out/${REPORT}`], dir);
    expect(r.stdout).toContain("trial 0: 6 call(s) replayed identically; verdict DEGRADED as recorded");
    expect(r.stdout).toContain("Reproduced: every call, state, and verdict matches the report.");
    expect(r.status).toBe(0);
  });

  it("names the first call whose replay differs from the record", () => {
    const dir = savedRun();
    edit(dir, (report) => {
      (report.trials[1].trace.calls[1].committedResult as { refund_id: string }).refund_id = "re_9_4471";
    });
    const r = runCli(["replay", `out/${REPORT}`], dir);
    expect(r.status).toBe(2);
    expect(r.stdout).toContain("trial 0: 6 call(s) replayed identically");
    expect(r.stdout).toMatch(/trial 1: DIVERGED at call_2 \(committedResult\): recorded \{"refund_id":"re_9_4471".*replayed \{"refund_id":"re_2_4471"/);
  });

  it("reports grading drift when the recorded verdict no longer follows from the trace", () => {
    const dir = savedRun();
    edit(dir, (report) => {
      report.trials[0].verdict = "SAFE_SUCCESS";
    });
    const r = runCli(["replay", `out/${REPORT}`, "--json"], dir);
    expect(r.status).toBe(2);
    expect(JSON.parse(r.stdout)).toMatchObject({ reproduced: false, trials: [{ recordedVerdict: "SAFE_SUCCESS", verdict: "DEGRADED" }, { recordedVerdict: "DEGRADED", verdict: "DEGRADED" }] });
  });

  it("detects a world that does not behave the same way twice", async () => {
    let runs = 0;
    const drifting = () => {
      const world = createEmailWorld();
      const invoke = world.invoke;
      return { ...world, invoke: (tool: string, args: Record<string, unknown>) => (tool === "list_sent" ? [{ message_id: `msg_${runs++}`, to: "x", subject: "y" }] : invoke(tool, args)) };
    };
    const registry = extendRegistry(builtinRegistry(), { worlds: { drift: () => ({ ...drifting(), name: "drift" }) } });
    const scenario = parseScenario({ id: "d/drift", world: "drift", description: "d", task: "t" }, undefined, registry);
    const report = await runScenario({ scenario, registry, agent: async (ctx) => (await ctx.callTool("list_sent", {}), "Listed.") });
    expect(replayReport(report, registry).trials[0].divergence).toMatchObject({ at: "call_1", field: "committedResult" });
  });

  it("replays reports from extension worlds only with the extension loaded", () => {
    const dir = savedRun();
    edit(dir, (report) => {
      report.worlds = ["inventory"];
    });
    const r = runCli(["replay", `out/${REPORT}`], dir);
    expect([r.status, r.stderr.trim()]).toEqual([1, 'agentcrucible: cannot replay: world "inventory" is not registered (load its extension with --config)']);
  });
});

describe("baselines", () => {
  const args = ["run", "--tag", "workflow", "--agent", "workflow-reconcile", "--out", "out"];

  it("passes when nothing changed and records the comparison", () => {
    const dir = tempDir();
    expect(runCli([...args, "--save-baseline", "baseline.json"], dir).stdout).toContain("Baseline written to baseline.json (2 entries)");
    const baseline = JSON.parse(readFileSync(join(dir, "baseline.json"), "utf8"));
    expect(baseline).toMatchObject({ format: "agentcrucible-baseline", version: 1, entries: [{ scenario: "workflows/notification-outage", verdict: "DEGRADED" }, { scenario: "workflows/refund-notify-resolve" }] });
    expect(JSON.stringify(baseline)).not.toMatch(/startedAt|durationMs/);
    const r = runCli([...args, "--baseline", "baseline.json"], dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("2 unchanged, 0 regressed, 0 improved, 0 changed rules, 0 new");
    expect(JSON.parse(readFileSync(join(dir, "out", "baseline-comparison.json"), "utf8"))).toMatchObject({ unchanged: 2, regressions: [] });
  });

  it("fails on a verdict that got worse, but not on one that was already known", () => {
    const dir = tempDir();
    runCli([...args, "--save-baseline", "baseline.json"], dir);
    const baseline = JSON.parse(readFileSync(join(dir, "baseline.json"), "utf8"));
    baseline.entries[0].verdict = "SAFE_FAILURE";
    baseline.entries[1].verdict = "HARMFUL_ACTION";
    writeFileSync(join(dir, "baseline.json"), JSON.stringify(baseline));
    const r = runCli([...args, "--baseline", "baseline.json"], dir);
    expect(r.stdout).toContain("REGRESSION workflows/notification-outage workflow-reconcile: SAFE_FAILURE -> DEGRADED");
    expect(r.stdout).toContain("improved   workflows/refund-notify-resolve workflow-reconcile: HARMFUL_ACTION -> DEGRADED");
    expect(r.stdout).toContain("1 regression(s) and 0 new scenario(s) at or above --fail-on SILENT_FAILURE: exit 2");
    expect(r.status).toBe(2);
    const index = readFileSync(join(dir, "out", "index.html"), "utf8");
    expect(index).toContain('workflows/notification-outage</a></td><td><code>workflow-reconcile</code></td><td><span class="badge DEGRADED">DEGRADED</span> <span class="chip err">regression</span>');
    expect(index).toContain('<span class="chip ok">improved</span>');
  });

  it("treats a failing scenario that is not in the baseline as new, and other agents' entries as not run", () => {
    const dir = tempDir();
    runCli(["run", "--scenario", "workflows/notification-outage", "--agent", "workflow-naive", "--out", "out", "--save-baseline", "baseline.json"], dir);
    const naive = runCli(["run", "--tag", "workflow", "--agent", "workflow-naive", "--out", "out", "--baseline", "baseline.json"], dir);
    expect(naive.stdout).toContain("NEW FAIL   workflows/refund-notify-resolve workflow-naive: HARMFUL_ACTION (not in the baseline)");
    expect(naive.status).toBe(2);
    const other = runCli([...args, "--baseline", "baseline.json"], dir);
    expect(other.stdout).toContain("new        workflows/notification-outage workflow-reconcile: DEGRADED (not in the baseline)");
    expect(other.status).toBe(0);
  });

  it("refuses to compare runs made with a different seed or trial count", () => {
    const dir = tempDir();
    runCli([...args, "--save-baseline", "baseline.json"], dir);
    const r = runCli([...args, "--baseline", "baseline.json", "--seed", "other"], dir);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('NOT COMPARABLE workflows/notification-outage workflow-reconcile: baseline used seed "seed-workflows/notification-outage" and 1 trial(s); this run used seed "other" and 1');
    expect(r.stderr).toContain("2 result(s) are not comparable with baseline.json");
  });

  it("explains a missing or malformed baseline before running anything", () => {
    const dir = tempDir();
    const missing = runCli([...args, "--baseline", "baseline.json"], dir);
    expect([missing.status, missing.stderr.trim()]).toEqual([1, "agentcrucible: baseline baseline.json not found; create it with --save-baseline baseline.json"]);
    expect(existsSync(join(dir, "out"))).toBe(false);
    writeFileSync(join(dir, "baseline.json"), '{"format": "something-else"}');
    expect(runCli([...args, "--baseline", "baseline.json"], dir).stderr).toContain("baseline.json is not an AgentCrucible baseline");
  });

  it("keeps --json output parseable and puts the comparison on stderr", () => {
    const dir = tempDir();
    runCli([...args, "--save-baseline", "baseline.json"], dir);
    const r = runCli([...args, "--baseline", "baseline.json", "--json"], dir);
    expect(JSON.parse(r.stdout)).toHaveLength(2);
    expect(r.stderr).toContain("No regressions against the baseline: exit 0");
  });

  it("compares in the library too", async () => {
    const scenario = findScenarios({ id: "payments/timeout-after-commit" })[0];
    const safe = await runScenario({ scenario, agentId: "idempotent-retry" });
    const harmful = { ...(await runScenario({ scenario, agentId: "naive-retry" })), agentId: "idempotent-retry" };
    const comparison = compareBaseline(createBaseline([safe]), [harmful]);
    expect(comparison.regressions).toEqual([
      { scenario: scenario.id, agent: "idempotent-retry", before: "SAFE_SUCCESS", after: "HARMFUL_ACTION", rulesAdded: ["expect.duplicate_effect", "policy.forbidBlindRetry", "policy.maxMutatingCalls"], rulesRemoved: ["grader.verified_success"] },
    ]);
  });
});

describe("HTML timeline", () => {
  it("links every finding's evidence to a call that is on the page", async () => {
    const dir = tempDir();
    const report = await runScenario({ scenario: findScenarios({ id: "workflows/notification-outage" })[0], agentId: "workflow-naive", trials: 3 });
    const html = readFileSync(writeHtmlReport(report, dir), "utf8");
    const ids = new Set([...html.matchAll(/<li class="call[^"]*" id="([^"]+)">/g)].map((m) => m[1]));
    const links = [...html.matchAll(/<a href="#(t\d+-call_\d+)">/g)].map((m) => m[1]);
    expect(ids.size).toBe(3 * report.trials[0].trace.calls.length);
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((id) => ids.has(id))).toBe(true);
    expect(html).toContain('<span class="chip">refused (budget)</span>');
    expect(html).toContain('<span class="chip contradicted">contradicted</span>');
    expect(html).toContain("<h3>Structured output</h3>");
    expect(html.match(/<section class="trial/g)).toHaveLength(3);
  });

  it("round-trips through the JSON report that inspect and replay read", async () => {
    const dir = tempDir();
    const report = await runScenario({ scenario: findScenarios({ id: "workflows/refund-notify-resolve" })[0], agentId: "workflow-careful" });
    const saved = readReportFile(join(dir, writeJsonReport(report, dir).slice(dir.length + 1)));
    expect(saved).toEqual(JSON.parse(JSON.stringify(report)));
    expect(replayReport(saved, builtinRegistry()).reproduced).toBe(true);
  });
});
