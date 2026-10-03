#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runDemo } from "./demo.js";
import { loadConfig, loadConfigFile, findConfigPath } from "./config.js";
import { AGENTS } from "./fixtures/agents.js";
import { printReport, writeHtmlReport, writeJsonReport, writeJUnitReport } from "./report.js";
import { runScenario, parseTrials } from "./runner.js";
import { findScenarios, loadAllScenarios, bundledScenariosDir } from "./scenarios.js";
import { listWorlds } from "./worlds/index.js";
import { isCritical } from "./verdict.js";
import type { RunReport } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function packageVersion(): string {
  const candidates = [
    join(__dirname, "..", "package.json"),
    join(__dirname, "..", "..", "package.json"),
  ];
  for (const p of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(p, "utf8")) as { version?: string };
      if (pkg.version) return pkg.version;
    } catch {
      /* continue */
    }
  }
  return "0.0.0";
}

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "demo":
      return runDemo();
    case "list":
      return cmdList(rest);
    case "run":
      return cmdRun(rest);
    case "agents":
      console.log(Object.keys(AGENTS).join("\n"));
      return 0;
    case "worlds":
      console.log(listWorlds().join("\n"));
      return 0;
    case "version":
    case "--version":
    case "-V":
      console.log(`agentcrucible ${packageVersion()}`);
      return 0;
    case "compare":
      return cmdCompare(rest);
    case "config":
      return cmdConfig(rest);
    case "examples":
      printExamples();
      return 0;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      return cmd === "help" || cmd === "--help" || cmd === "-h" ? 0 : 1;
    default:
      console.error(`Unknown command: ${cmd}`);
      printHelp();
      return 1;
  }
}

function printHelp(): void {
  console.log(`agentcrucible ${packageVersion()} — mock-tool fault tests for scripted agents

Usage:
  agentcrucible <command> [options]

Commands:
  demo                  Run the duplicate-refund demo (no API key)
  list [--tag <tag>]    List bundled scenarios
  run [options]         Run one scenario or a tag set
  agents                List scripted agents
  worlds                List mock worlds
  compare               Run one scenario across multiple agents
  config                Show resolved config file (if any)
  examples              Print common command examples
  version               Print version
  help                  Show this help

Run options:
  --scenario <id>       Scenario id (e.g. payments/timeout-after-commit)
  --agent <id>          Scripted agent (default from config or naive-retry)
  --tag <tag>           Run all scenarios with tag (e.g. smoke)
  --trials <n>          Multi-trial flaky detection (default 1)
  --seed <s>            Deterministic seed
  --fuzz-call <lo-hi>   Property-based call targeting, e.g. 1-3
  --out <dir>           Write per-scenario JSON, HTML, and JUnit reports
  --json                Print a JSON report (array for multiple scenarios)
  --config <path>       Load a specific config file

Config file (optional):
  .agentcrucible.json | .agentcrucible.yaml | .agentcrucible/config.json
  Fields: agent, trials, seed, out, scenarioDirs, defaultTag

Exit codes:
  0  ok
  1  usage / missing scenario
  2  critical verdict (HARMFUL_ACTION or SILENT_FAILURE)

Try: agentcrucible examples
`);
}

function printExamples(): void {
  console.log(`# Duplicate-refund demo (naive vs honest vs idempotent)
agentcrucible demo

# List everything tagged smoke
agentcrucible list --tag smoke

# Single scenario, 5 trials
agentcrucible run --scenario payments/timeout-after-commit --agent naive-retry --trials 5

# Honest agent on the same scenario
agentcrucible run --scenario payments/timeout-after-commit --agent honest-stop

# Email duplicate-send with liar agent
agentcrucible run --scenario email/duplicate-send --agent liar

# Tickets world duplicate create
agentcrucible run --scenario tickets/duplicate-create --agent naive-retry

# Run the whole smoke suite into .agentcrucible/out
agentcrucible run --tag smoke --agent honest-stop --out .agentcrucible/out

# Property-based fuzz of which call fails
agentcrucible run --scenario payments/timeout-after-commit --agent naive-retry --fuzz-call 1-3 --trials 9 --seed ci

# JSON to stdout (CI)
agentcrucible run --scenario payments/rate-limit --agent idempotent-retry --json

# Compare agents on one scenario
agentcrucible compare --scenario payments/timeout-after-commit --agents naive-retry,honest-stop,idempotent-retry
`);
}

function scenarioRoots(cfgScenarioDirs?: string[]): string[] {
  const roots = [bundledScenariosDir()];
  for (const d of cfgScenarioDirs ?? []) {
    if (d && !roots.includes(d)) roots.push(d);
  }
  return roots;
}

function cmdList(args: string[]): number {
  const cfg = loadConfig();
  const tag = flag(args, "--tag") ?? undefined;
  const roots = scenarioRoots(cfg.scenarioDirs);
  const all = tag
    ? findScenarios({ tag, root: roots })
    : loadAllScenarios(roots);
  for (const s of all) {
    const policies = Object.entries(s.policies)
      .filter(([, v]) => v !== false && v !== undefined)
      .map(([k, v]) => (typeof v === "boolean" ? k : `${k}=${v}`))
      .join(", ");
    console.log(`${s.id.padEnd(40)} [${s.tags.join(", ")}]  world=${s.world}`);
    console.log(`  ${s.description.trim().split("\n")[0]}`);
    if (policies) console.log(`  policies: ${policies}`);
  }
  console.log(`\n${all.length} scenarios · worlds: ${listWorlds().join(", ")}`);
  return 0;
}

function cmdConfig(args: string[]): number {
  const explicit = flag(args, "--config");
  const path = explicit ?? findConfigPath();
  if (!path) {
    console.log("No config file found.");
    console.log("Looked for: .agentcrucible.json, .agentcrucible.yaml, .agentcrucible/config.json");
    return 0;
  }
  const cfg = explicit ? loadConfigFile(explicit) : loadConfig();
  console.log(`Config: ${path}`);
  console.log(JSON.stringify(cfg, null, 2));
  return 0;
}

async function cmdRun(args: string[]): Promise<number> {
  const configPath = flag(args, "--config");
  const cfg = configPath ? loadConfigFile(configPath) : loadConfig();

  const scenarioId = flag(args, "--scenario");
  const tag = flag(args, "--tag") ?? (!scenarioId ? cfg.defaultTag : undefined);
  const agentId = flag(args, "--agent") ?? cfg.agent ?? "naive-retry";
  let trials: number;
  try {
    trials = parseTrials(flag(args, "--trials") ?? cfg.trials ?? 1);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return 1;
  }
  const seed = flag(args, "--seed") ?? cfg.seed;
  const out = flag(args, "--out") ?? cfg.out ?? ".agentcrucible/out";
  const asJson = args.includes("--json");
  const fuzz = flag(args, "--fuzz-call");
  let fuzzCallRange: [number, number] | undefined;
  if (fuzz) {
    const [lo, hi] = fuzz.split("-").map(Number);
    fuzzCallRange = [lo, hi];
  }

  const roots = scenarioRoots(cfg.scenarioDirs);
  const scenarios = scenarioId
    ? findScenarios({ id: scenarioId, root: roots })
    : tag
      ? findScenarios({ tag, root: roots })
      : [];
  if (scenarios.length === 0) {
    console.error("No scenarios matched. Use --scenario or --tag (or set defaultTag in config).");
    console.error("Try: agentcrucible list");
    return 1;
  }

  let exit = 0;
  const reports: RunReport[] = [];
  for (const scenario of scenarios) {
    const report = await runScenario({
      scenario,
      agentId,
      seed: seed ?? undefined,
      trials,
      fuzzCallRange,
    });
    if (asJson) {
      reports.push(report);
    } else {
      printReport(report);
    }
    writeJsonReport(report, out);
    writeHtmlReport(report, out);
    writeJUnitReport(report, out);
    if (isCritical(report.aggregateVerdict)) exit = 2;
  }
  if (asJson) {
    console.log(JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2));
  } else {
    console.log(`Reports written to ${out}/ (*.report.json, *.report.html, *.junit.xml)`);
  }
  return exit;
}

async function cmdCompare(args: string[]): Promise<number> {
  const configPath = flag(args, "--config");
  const cfg = configPath ? loadConfigFile(configPath) : loadConfig();
  const scenarioId = flag(args, "--scenario");
  if (!scenarioId) {
    console.error("compare requires --scenario <id>");
    return 1;
  }
  const agentsRaw =
    flag(args, "--agents") ??
    "naive-retry,honest-stop,idempotent-retry";
  const agentIds = agentsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  let trials: number;
  try {
    trials = parseTrials(flag(args, "--trials") ?? cfg.trials ?? 1);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return 1;
  }
  const seed = flag(args, "--seed") ?? cfg.seed ?? "compare";
  const roots = scenarioRoots(cfg.scenarioDirs);
  const scenarios = findScenarios({ id: scenarioId, root: roots });
  if (scenarios.length === 0) {
    console.error(`No scenario matched: ${scenarioId}`);
    return 1;
  }
  const scenario = scenarios[0];
  const rows: { agent: string; verdict: string; findings: number }[] = [];
  let exit = 0;
  for (const agentId of agentIds) {
    const report = await runScenario({
      scenario,
      agentId,
      seed: `${seed}:${agentId}`,
      trials,
    });
    rows.push({
      agent: agentId,
      verdict: report.aggregateVerdict,
      findings: report.trials.reduce((n, t) => n + t.findings.length, 0),
    });
    if (isCritical(report.aggregateVerdict)) exit = 2;
  }
  console.log(`compare ${scenario.id} (seed=${seed}, trials=${trials})`);
  const width = Math.max(12, ...rows.map((r) => r.agent.length));
  for (const r of rows) {
    console.log(`  ${r.agent.padEnd(width)}  ${r.verdict.padEnd(16)}  findings=${r.findings}`);
  }
  return exit;
}


function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  return args[i + 1];
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
