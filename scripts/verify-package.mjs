#!/usr/bin/env node
// Packs the package (or takes --tarball <file>), installs it into an empty project outside
// the checkout, and exercises the installed CLI, library, and type declarations.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const args = process.argv.slice(2);
const work = mkdtempSync(join(tmpdir(), "agentcrucible-package-"));
let failures = 0;

function check(label, ok, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok || !detail ? "" : `\n     ${detail}`}`);
  if (!ok) failures++;
}

function run(cmd, cmdArgs, cwd) {
  const r = spawnSync(cmd, cmdArgs, { cwd, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" }, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

try {
  let tarball = args.includes("--tarball") ? resolve(args[args.indexOf("--tarball") + 1]) : undefined;
  if (!tarball) {
    execFileSync("npm", ["pack", "--pack-destination", work], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
    tarball = join(work, `${pkg.name}-${pkg.version}.tgz`);
  }
  check(`tarball ${tarball}`, existsSync(tarball));

  const listing = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" }).trim().split("\n").map((f) => f.replace(/^package\//, ""));
  const unexpected = listing.filter((f) => !/^(dist\/.+\.(js|d\.ts)|scenarios\/.+\.yaml|schema\/scenario\.schema\.json|README\.md|LICENSE|CHANGELOG\.md|package\.json)$/.test(f));
  check("tarball holds only dist, scenarios, schema, README, LICENSE, CHANGELOG, package.json", unexpected.length === 0, unexpected.join(", "));
  for (const required of ["dist/cli.js", "dist/index.js", "dist/index.d.ts", "dist/ui/app.js", "schema/scenario.schema.json", "README.md", "LICENSE", "CHANGELOG.md"]) {
    check(`tarball includes ${required}`, listing.includes(required));
  }
  const bundled = listing.filter((f) => f.startsWith("scenarios/")).length;
  const inRepo = readdirSync(join(root, "scenarios"), { recursive: true }).filter((f) => String(f).endsWith(".yaml")).length;
  check(`tarball includes all ${inRepo} bundled scenarios`, bundled === inRepo, `${bundled} in the tarball`);

  const consumer = join(work, "consumer");
  mkdirSync(consumer);
  execFileSync("npm", ["init", "-y"], { cwd: consumer, stdio: "ignore" });
  const consumerPkg = JSON.parse(readFileSync(join(consumer, "package.json"), "utf8"));
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ ...consumerPkg, type: "module" }, null, 2));
  const install = run("npm", ["install", "--no-audit", "--no-fund", tarball], consumer);
  check("npm install <tarball> in an empty project", install.status === 0, install.stderr.trim());
  const installed = JSON.parse(readFileSync(join(consumer, "node_modules", "agentcrucible", "package.json"), "utf8"));
  check(`installed version ${installed.version} matches ${pkg.version}`, installed.version === pkg.version);
  const deps = Object.keys(JSON.parse(readFileSync(join(consumer, "package-lock.json"), "utf8")).packages).filter((p) => p.startsWith("node_modules/"));
  check(`installs only runtime dependencies (${deps.join(", ")})`, deps.every((d) => ["node_modules/agentcrucible", "node_modules/yaml"].includes(d)));

  const bin = join(consumer, "node_modules", ".bin", "agentcrucible");
  const cli = (...cliArgs) => run(bin, cliArgs, consumer);
  const version = cli("--version");
  check("agentcrucible --version", version.status === 0 && version.stdout.trim() === `agentcrucible ${pkg.version}`, version.stdout + version.stderr);
  const list = cli("list");
  check("agentcrucible list finds the bundled scenarios", list.status === 0 && list.stdout.includes(`${inRepo} scenario(s)`), list.stdout.slice(-200) + list.stderr);
  const demo = cli("demo");
  check("agentcrucible demo exits 0 and matches every expected verdict", demo.status === 0 && demo.stdout.includes("Every verdict matches the scenario's expected_verdicts."), demo.stderr || demo.stdout.slice(-300));
  check("agentcrucible demo writes no files", !existsSync(join(consumer, ".agentcrucible")));
  const workflow = cli("demo", "--scenario", "workflows/notification-outage");
  check("the multi-world workflow demo runs from the tarball", workflow.status === 0 && workflow.stdout.includes("workflow-careful    SAFE_FAILURE"), workflow.stderr || workflow.stdout.slice(-300));
  const checkCmd = cli("check");
  const tally = /^(\d+)\/(\d+) checks pass/m.exec(checkCmd.stdout);
  check("agentcrucible check passes", checkCmd.status === 0 && tally !== null && tally[1] === tally[2] && Number(tally[1]) > 0, checkCmd.stdout.slice(-300) + checkCmd.stderr);
  const runCmd = cli("run", "--scenario", "payments/timeout-after-commit", "--agent", "naive-retry", "--json", "--out", "reports");
  let report;
  try {
    report = JSON.parse(runCmd.stdout);
  } catch {
    report = undefined;
  }
  check("agentcrucible run --json prints parseable JSON and exits 2 for HARMFUL_ACTION", runCmd.status === 2 && report?.aggregateVerdict === "HARMFUL_ACTION" && runCmd.stderr === "", runCmd.stderr);
  check("run writes reports under the consumer's --out", existsSync(join(consumer, "reports", "payments%2Ftimeout-after-commit.report.html")));
  const compare = cli("compare", "--scenario", "database/silent-wrong-balance", "--agents", "gullible-reader,cross-checker", "--json");
  const verdicts = compare.status === 2 ? JSON.parse(compare.stdout).map((r) => r.aggregateVerdict) : [];
  check("agentcrucible compare --json", JSON.stringify(verdicts) === JSON.stringify(["SILENT_FAILURE", "SAFE_FAILURE"]), compare.stderr);
  const matrix = cli("run", "--scenario", "payments/phantom-success", "--agents", "cross-checker,verify-after-write", "--concurrency", "2", "--timeout", "10000", "--out", "matrix");
  check(
    "run --agents writes a report per agent and summary.md",
    matrix.status === 2 &&
      matrix.stdout.includes("Summary (2 agents)") &&
      existsSync(join(consumer, "matrix", "cross-checker", "payments%2Fphantom-success.report.json")) &&
      existsSync(join(consumer, "matrix", "verify-after-write", "payments%2Fphantom-success.report.html")) &&
      readFileSync(join(consumer, "matrix", "summary.md"), "utf8").includes("| `payments/phantom-success` | **SILENT_FAILURE** | SAFE_FAILURE |"),
    matrix.stderr || matrix.stdout.slice(-300)
  );
  const faultList = cli("faults", "--json");
  let kinds = [];
  try {
    kinds = JSON.parse(faultList.stdout).map((f) => `${f.kind}:${f.stage}`);
  } catch {
    kinds = [];
  }
  check(
    "faults --json lists the 1.1 fault kinds with their stages",
    ["phantom_success:before", "replica_lag:after", "partial_response:after", "duplicate_delivery:twice"].every((k) => kinds.includes(k)),
    faultList.stderr || kinds.join(", ")
  );
  const bad = cli("run", "--scenario", "payments/rate-limit", "--trials", "0");
  check("invalid input exits 1 with a message on stderr", bad.status === 1 && bad.stdout === "" && bad.stderr.includes("Invalid trials value: 0"), bad.stderr);

  copyFileSync(join(root, "examples", "custom-agent.mjs"), join(consumer, "custom-agent.mjs"));
  const example = run(process.execPath, ["custom-agent.mjs"], consumer);
  check("examples/custom-agent.mjs runs against the installed package", example.status === 0 && example.stdout.includes("Verdict: SAFE_SUCCESS"), example.stderr || example.stdout.slice(-300));

  cpSync(join(root, "examples", "agents"), join(consumer, "agents"), { recursive: true });
  const moduleRun = cli("run", "--scenario", "payments/timeout-after-commit", "--agent", "./agents/careful-refund.mjs", "--json", "--out", "module-reports");
  let moduleReport;
  try {
    moduleReport = JSON.parse(moduleRun.stdout);
  } catch {
    moduleReport = undefined;
  }
  check("run --agent <module path> grades examples/agents/careful-refund.mjs", moduleRun.status === 0 && moduleReport?.agentId === "careful-refund" && moduleReport?.aggregateVerdict === "SAFE_SUCCESS", moduleRun.stderr || moduleRun.stdout.slice(-300));

  writeFileSync(join(consumer, "typed-agent.ts"), 'export default async function (ctx: { callTool: (n: string, a: object) => Promise<{ ok: boolean }> }): Promise<string> {\n  const r = await ctx.callTool("list_refunds", { order_id: "1" });\n  return r.ok ? "Listed." : "failed";\n}\n');
  const tsAgent = cli("run", "--scenario", "payments/rate-limit", "--agent", "./typed-agent.ts", "--out", "ts-reports");
  const strips = Boolean(process.features.typescript);
  check(
    strips ? "a TypeScript agent module loads on this Node version" : "a TypeScript agent module on this Node version explains how to load it",
    strips ? tsAgent.status !== 1 && tsAgent.stdout.includes("agent typed-agent") : tsAgent.status === 1 && tsAgent.stderr.includes("compile the module to JavaScript"),
    tsAgent.stderr || tsAgent.stdout.slice(-300)
  );

  cpSync(join(root, "examples", "inventory"), join(consumer, "inventory"), { recursive: true });
  const inventory = (...cliArgs) => run(bin, cliArgs, join(consumer, "inventory"));
  const extCheck = inventory("check", "--scenario", "inventory/lost-reservation");
  check("examples/inventory loads as an extension and its scenario passes check", extCheck.status === 0 && extCheck.stdout.includes("2/2 checks pass"), extCheck.stdout.slice(-300) + extCheck.stderr);
  const extFaults = inventory("faults");
  check("faults lists the extension's lost_write kind", extFaults.status === 0 && /^lost_write\s+before/m.test(extFaults.stdout), extFaults.stdout.slice(-300) + extFaults.stderr);

  const workflowRun = cli("run", "--scenario", "workflows/refund-notify-resolve", "--agent", "workflow-reconcile", "--trials", "2", "--out", "traces", "--save-baseline", "baseline.json");
  const saved = join("traces", "workflows%2Frefund-notify-resolve.report.json");
  check("run --save-baseline writes a baseline", workflowRun.status === 0 && existsSync(join(consumer, "baseline.json")), workflowRun.stderr || workflowRun.stdout.slice(-300));
  const inspect = cli("inspect", saved, "--call", "call_4");
  check("inspect prints a saved call", inspect.status === 0 && inspect.stdout.includes('state changes:  ~ refund re_2_4471 status="voided"'), inspect.stderr || inspect.stdout.slice(-300));
  const replay = cli("replay", saved);
  check("replay reproduces a saved run", replay.status === 0 && replay.stdout.includes("Reproduced: every call, state, and verdict matches the report."), replay.stderr || replay.stdout.slice(-300));
  const html = readFileSync(join(consumer, "traces", "workflows%2Frefund-notify-resolve.report.html"), "utf8");
  check("the HTML report is a self-contained timeline", html.includes('<ol class="timeline">') && html.includes('href="#t0-call_4"') && !/<(?:link|img|iframe)\b|src=|https?:\/\//.test(html));
  const same = cli("run", "--scenario", "workflows/refund-notify-resolve", "--agent", "workflow-reconcile", "--trials", "2", "--out", "traces", "--baseline", "baseline.json");
  check("run --baseline passes when nothing changed", same.status === 0 && same.stdout.includes("No regressions against the baseline: exit 0"), same.stderr || same.stdout.slice(-300));
  const baseline = JSON.parse(readFileSync(join(consumer, "baseline.json"), "utf8"));
  baseline.entries[0].verdict = "SAFE_SUCCESS";
  writeFileSync(join(consumer, "baseline.json"), JSON.stringify(baseline));
  const worse = cli("run", "--scenario", "workflows/refund-notify-resolve", "--agent", "workflow-reconcile", "--trials", "2", "--out", "traces", "--baseline", "baseline.json");
  check("run --baseline exits 2 on a regression", worse.status === 2 && worse.stdout.includes("REGRESSION workflows/refund-notify-resolve workflow-reconcile: SAFE_SUCCESS -> DEGRADED"), worse.stderr || worse.stdout.slice(-300));

  const starter = join(consumer, "starter");
  mkdirSync(starter);
  const inStarter = (...cliArgs) => run(bin, cliArgs, starter);
  const init = inStarter("init");
  check("init writes a starter project", init.status === 0 && init.stdout.includes("created  agentcrucible.config.json"), init.stderr || init.stdout);
  const validate = inStarter("validate");
  check("validate accepts the starter and bundled scenarios", validate.status === 0 && /^\d+ scenario file\(s\) valid$/m.test(validate.stdout), validate.stderr || validate.stdout.slice(-300));
  const starterRun = inStarter("run", "--json");
  let starterReport;
  try {
    starterReport = JSON.parse(starterRun.stdout);
  } catch {
    starterReport = undefined;
  }
  check("run grades the starter agent on the starter scenario", starterRun.status === 0 && starterReport?.agentId === "my-agent" && starterReport?.aggregateVerdict === "SAFE_SUCCESS", starterRun.stderr || starterRun.stdout.slice(-300));

  const ui = spawn(bin, ["ui", "--port", "0"], { cwd: starter, env: { ...process.env, NO_COLOR: "1" } });
  try {
    const address = await new Promise((resolveAddress, reject) => {
      let out = "";
      const timer = setTimeout(() => reject(new Error(`no address after 15s: ${out}`)), 15_000);
      ui.stdout.on("data", (chunk) => {
        out += chunk;
        const match = /UI: (http:\/\/127\.0\.0\.1:\d+\/)/.exec(out);
        if (match) {
          clearTimeout(timer);
          resolveAddress(match[1]);
        }
      });
      ui.on("exit", (code) => reject(new Error(`ui exited with ${code}: ${out}`)));
    });
    const page = await (await fetch(address)).text();
    const token = /name="agentcrucible-token" content="([0-9a-f]+)"/.exec(page)?.[1];
    const bundle = await fetch(`${address}app.js`);
    const bundleText = await bundle.text();
    check("ui serves its page and browser bundle from the installed package", Boolean(token) && bundle.status === 200 && bundle.headers.get("content-type")?.startsWith("text/javascript") && bundleText.includes("agentcrucible-token") && !/https?:\/\/(?!127)/.test(page + bundleText.replace(/"http:\/\/www\.w3\.org[^"]*"/g, "")), `status ${bundle.status}`);
    const scenarios = await (await fetch(`${address}api/scenarios`, { headers: { "x-agentcrucible-token": token ?? "" } })).json();
    check("the ui API lists the bundled and starter scenarios", Array.isArray(scenarios) && scenarios.length === inRepo + 1 && scenarios.some((s) => s.id === "project/refund-lost-response"), JSON.stringify(scenarios).slice(0, 200));
    const denied = await fetch(`${address}api/scenarios`);
    check("the ui API refuses requests without the session token", denied.status === 403);
    const exited = new Promise((resolveExit) => ui.on("exit", (code) => resolveExit(code)));
    ui.kill("SIGINT");
    check("ui stops on SIGINT with exit 0", (await exited) === 0);
  } catch (err) {
    check("ui starts from the installed package", false, err.message);
  } finally {
    ui.kill();
  }

  writeFileSync(
    join(consumer, "typed.ts"),
    `import {
  builtinRegistry, compareBaseline, createBaseline, extendRegistry, findScenarios, renderRunSummary, replayReport, runMatrix, runScenario, sampleValue, VERDICTS, writeRunIndex,
  type AgentAnswer, type Extension, type FaultDefinition, type FaultStage, type JsonSchema, type MatrixOptions, type RunReport, type ScriptedAgent, type Verdict, type WorldFactory,
} from "agentcrucible";
const agent: ScriptedAgent = async (ctx) => {
  const tool = ctx.tools.find((t) => t.mutating);
  if (!tool) return "no tools";
  const schema: JsonSchema = tool.inputSchema;
  const res = await ctx.callTool(tool.name, { order_id: "1", amount_cents: 100 });
  const trial: number = ctx.trialIndex;
  const aborted: boolean = ctx.signal.aborted;
  const answer: AgentAnswer = { text: res.ok ? "done" : \`failed: \${res.error}\`, output: { required: schema.required ?? [], trial, aborted, scenario: ctx.scenarioId } };
  return answer;
};
const stage: FaultStage = "twice";
const fault: FaultDefinition = { description: "always 503", stage: "before", apply: () => ({ ok: false, error: "503", code: "E503" }) };
const twice: FaultDefinition = { description: "delivered twice", stage, apply: ({ result, outputSchema }) => ({ ok: true, result: outputSchema ? sampleValue(outputSchema) : result }) };
const extension: Extension = { faults: { unavailable: fault, twice } };
const registry = extendRegistry(builtinRegistry(), extension, "inline");
const world: WorldFactory | undefined = registry.worlds.get("payments")?.value;
const report: RunReport = await runScenario({ scenario: findScenarios({ id: "payments/rate-limit", registry })[0], agent, registry, timeoutMs: 5000 });
const options: MatrixOptions = { scenarios: findScenarios({ id: "payments", registry }), agents: ["honest-stop", "verify-after-write"], registry, concurrency: 4, timeoutMs: 5000 };
const reports: RunReport[] = await runMatrix(options);
const summary: string = renderRunSummary(reports.map((r) => ({ report: r })), { title: "Run", failOn: "SILENT_FAILURE" });
const reproduced: boolean = replayReport(report, registry).reproduced;
const regressions = compareBaseline(createBaseline([report]), [report]).regressions.length;
const verdict: Verdict = report.aggregateVerdict;
const severe: readonly Verdict[] = VERDICTS;
const index: string = writeRunIndex([{ report }], "index-out", "Run", "SILENT_FAILURE");
export { verdict, severe, reproduced, regressions, world, index, summary };
`
  );
  writeFileSync(
    join(consumer, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, noEmit: true, types: [] }, files: ["typed.ts"] })
  );
  const tsc = run(process.execPath, [join(root, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json"], consumer);
  check("type declarations compile in a strict NodeNext consumer", tsc.status === 0, tsc.stdout + tsc.stderr);
} finally {
  if (args.includes("--keep")) console.log(`kept ${work}`);
  else rmSync(work, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} package check(s) failed` : "\nAll package checks passed");
process.exitCode = failures ? 1 : 0;
