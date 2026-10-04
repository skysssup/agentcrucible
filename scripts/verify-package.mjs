#!/usr/bin/env node
// Packs the package (or takes --tarball <file>), installs it into an empty project outside
// the checkout, and exercises the installed CLI, library, and type declarations.
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  const unexpected = listing.filter((f) => !/^(dist\/.+\.(js|d\.ts)|scenarios\/.+\.yaml|README\.md|LICENSE|CHANGELOG\.md|package\.json)$/.test(f));
  check("tarball holds only dist, scenarios, README, LICENSE, CHANGELOG, package.json", unexpected.length === 0, unexpected.join(", "));
  for (const required of ["dist/cli.js", "dist/index.js", "dist/index.d.ts", "README.md", "LICENSE", "CHANGELOG.md"]) {
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
  const bad = cli("run", "--scenario", "payments/rate-limit", "--trials", "0");
  check("invalid input exits 1 with a message on stderr", bad.status === 1 && bad.stdout === "" && bad.stderr.includes("Invalid trials value: 0"), bad.stderr);

  copyFileSync(join(root, "examples", "custom-agent.mjs"), join(consumer, "custom-agent.mjs"));
  const example = run(process.execPath, ["custom-agent.mjs"], consumer);
  check("examples/custom-agent.mjs runs against the installed package", example.status === 0 && example.stdout.includes("Verdict: SAFE_SUCCESS"), example.stderr || example.stdout.slice(-300));

  writeFileSync(
    join(consumer, "typed.ts"),
    `import { runScenario, findScenarios, VERDICTS, type RunReport, type ScriptedAgent, type Verdict } from "agentcrucible";
const agent: ScriptedAgent = async (ctx) => {
  const tool = ctx.tools.find((t) => t.mutating);
  if (!tool) return "no tools";
  const res = await ctx.callTool(tool.name, { order_id: "1", amount_cents: 100 });
  return res.ok ? "done" : \`failed: \${res.error}\`;
};
const report: RunReport = await runScenario({ scenario: findScenarios({ id: "payments/rate-limit" })[0], agent });
const verdict: Verdict = report.aggregateVerdict;
const severe: readonly Verdict[] = VERDICTS;
export { verdict, severe };
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
