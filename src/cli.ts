#!/usr/bin/env node
import { accessSync, constants, existsSync, mkdirSync, statSync } from "node:fs";
import { findConfigPath, loadConfig, loadConfigFile, type CrucibleConfig } from "./config.js";
import { DEMO_SCENARIO, runDemo } from "./demo.js";
import { AGENT_DESCRIPTIONS, AGENTS } from "./fixtures/agents.js";
import { painter, printReport, shouldColor, worstTrial, writeHtmlReport, writeJsonReport, writeJUnitReport } from "./report.js";
import { parseTrials, runScenario } from "./runner.js";
import { bundledScenariosDir, findScenarios, loadAllScenarios } from "./scenarios.js";
import { VERDICTS, type RunReport, type Scenario, type Verdict } from "./types.js";
import { atLeast } from "./verdict.js";
import { VERSION } from "./version.js";
import { listWorlds } from "./worlds/index.js";

class UsageError extends Error {}

/** Trials per agent for `check`, so seeded faults get several chances to fire. */
const CHECK_TRIALS = 5;

type FlagSpec = Record<string, "value" | "boolean">;
type Flags = Record<string, string | true>;

const SELECT: FlagSpec = { "--scenario": "value", "--tag": "value", "--config": "value" };
const COMMANDS: Record<string, { flags: FlagSpec; run: (flags: Flags) => Promise<number> | number }> = {
  demo: { flags: { "--scenario": "value", "--out": "value", "--config": "value" }, run: cmdDemo },
  list: { flags: { "--tag": "value", "--config": "value" }, run: cmdList },
  run: {
    flags: { ...SELECT, "--agent": "value", "--trials": "value", "--seed": "value", "--fuzz-call": "value", "--out": "value", "--json": "boolean", "--fail-on": "value" },
    run: cmdRun,
  },
  compare: {
    flags: { "--scenario": "value", "--agents": "value", "--trials": "value", "--seed": "value", "--json": "boolean", "--fail-on": "value", "--config": "value" },
    run: cmdCompare,
  },
  check: { flags: { ...SELECT, "--trials": "value", "--json": "boolean" }, run: cmdCheck },
  agents: { flags: {}, run: () => (printAgents(), 0) },
  worlds: { flags: {}, run: () => (console.log(listWorlds().join("\n")), 0) },
  config: { flags: { "--config": "value" }, run: cmdConfig },
  examples: { flags: {}, run: () => (console.log(EXAMPLES), 0) },
  version: { flags: {}, run: () => (console.log(`agentcrucible ${VERSION}`), 0) },
  help: { flags: {}, run: () => (console.log(HELP), 0) },
};
const ALIASES: Record<string, string> = { "--version": "version", "-V": "version", "--help": "help", "-h": "help" };

async function main(argv: string[]): Promise<number> {
  const [first, ...rest] = argv;
  if (first === undefined) {
    console.error(HELP);
    return 1;
  }
  const name = ALIASES[first] ?? first;
  const command = COMMANDS[name];
  if (!command) throw new UsageError(`unknown command "${first}"`);
  return command.run(parseFlags(name, rest, command.flags));
}

function parseFlags(command: string, args: string[], spec: FlagSpec): Flags {
  const flags: Flags = {};
  for (let i = 0; i < args.length; i++) {
    const [name, inline] = args[i].startsWith("--") && args[i].includes("=")
      ? [args[i].slice(0, args[i].indexOf("=")), args[i].slice(args[i].indexOf("=") + 1)]
      : [args[i], undefined];
    const kind = spec[name];
    if (!kind) {
      const known = Object.keys(spec);
      throw new UsageError(
        name.startsWith("-")
          ? `${command} does not accept ${name}${known.length ? ` (options: ${known.join(", ")})` : ""}`
          : `unexpected argument "${name}" for ${command}`
      );
    }
    if (name in flags) throw new UsageError(`${name} was given more than once`);
    if (kind === "boolean") {
      if (inline !== undefined) throw new UsageError(`${name} does not take a value`);
      flags[name] = true;
      continue;
    }
    const value = inline ?? args[++i];
    if (value === undefined || (inline === undefined && value.startsWith("--")) || value.trim() === "") {
      throw new UsageError(`${name} needs a value`);
    }
    flags[name] = value;
  }
  return flags;
}

function str(flags: Flags, name: string): string | undefined {
  const v = flags[name];
  return typeof v === "string" ? v : undefined;
}

function readConfig(flags: Flags): CrucibleConfig {
  const path = str(flags, "--config");
  return path ? loadConfigFile(path) : loadConfig();
}

function scenarioRoots(cfg: CrucibleConfig): string[] {
  for (const dir of cfg.scenarioDirs ?? []) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      throw new UsageError(`scenarioDirs entry "${dir}" is not a directory (paths are relative to ${process.cwd()})`);
    }
  }
  return [bundledScenariosDir(), ...(cfg.scenarioDirs ?? [])];
}

function selectScenarios(flags: Flags, cfg: CrucibleConfig, fallbackTag?: string): Scenario[] {
  const id = str(flags, "--scenario");
  const tag = str(flags, "--tag") ?? (id ? undefined : fallbackTag);
  const roots = scenarioRoots(cfg);
  if (!id && !tag) return loadAllScenarios(roots);
  const found = findScenarios({ id, tag, root: roots });
  if (found.length === 0) {
    throw new UsageError(`no scenario matches ${[id && `--scenario ${id}`, tag && `--tag ${tag}`].filter(Boolean).join(" and ")}; run "agentcrucible list" to see ids and tags`);
  }
  return found;
}

function failOn(flags: Flags, cfg: CrucibleConfig): Verdict {
  const value = str(flags, "--fail-on") ?? cfg.failOn ?? "SILENT_FAILURE";
  if (!VERDICTS.includes(value as Verdict)) throw new UsageError(`--fail-on must be one of: ${VERDICTS.join(", ")}`);
  return value as Verdict;
}

function trials(flags: Flags, cfg: CrucibleConfig): number {
  const raw = str(flags, "--trials");
  if (raw === undefined) return cfg.trials ?? 1;
  try {
    return parseTrials(raw);
  } catch (err) {
    throw new UsageError(`--trials: ${(err as Error).message}`);
  }
}

function agentId(raw: string): string {
  if (!Object.hasOwn(AGENTS, raw)) throw new UsageError(`unknown agent "${raw}" (available: ${Object.keys(AGENTS).join(", ")})`);
  return raw;
}

function ensureWritableDir(dir: string): void {
  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
  } catch (err) {
    throw new UsageError(`cannot write reports to "${dir}": ${(err as Error).message}`);
  }
}

async function cmdRun(flags: Flags): Promise<number> {
  const cfg = readConfig(flags);
  const agent = agentId(str(flags, "--agent") ?? cfg.agent ?? "naive-retry");
  const trialCount = trials(flags, cfg);
  const threshold = failOn(flags, cfg);
  const seed = str(flags, "--seed") ?? cfg.seed;
  const out = str(flags, "--out") ?? cfg.out ?? ".agentcrucible/out";
  const asJson = flags["--json"] === true;
  const fuzz = str(flags, "--fuzz-call");
  let fuzzCallRange: [number, number] | undefined;
  if (fuzz !== undefined) {
    const m = /^(\d+)-(\d+)$/.exec(fuzz);
    if (!m || Number(m[1]) < 1 || Number(m[1]) > Number(m[2])) throw new UsageError(`--fuzz-call expects a range like 1-3 (got "${fuzz}")`);
    fuzzCallRange = [Number(m[1]), Number(m[2])];
  }
  if (!str(flags, "--scenario") && !str(flags, "--tag") && !cfg.defaultTag) {
    throw new UsageError('run needs --scenario <id> or --tag <tag> (or "defaultTag" in the config file)');
  }
  const scenarios = selectScenarios(flags, cfg, cfg.defaultTag);
  ensureWritableDir(out);

  const reports: RunReport[] = [];
  for (const scenario of scenarios) {
    const report = await runScenario({ scenario, agentId: agent, seed, trials: trialCount, fuzzCallRange });
    reports.push(report);
    writeJsonReport(report, out);
    writeHtmlReport(report, out);
    writeJUnitReport(report, out, threshold);
    if (!asJson) printReport(report);
  }
  const failing = reports.filter((r) => atLeast(r.aggregateVerdict, threshold));
  if (asJson) {
    console.log(JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2));
  } else {
    if (reports.length > 1) printSummary(reports, threshold);
    console.log(`Reports written to ${out}/ (*.report.json, *.report.html, *.junit.xml)`);
    console.log(
      failing.length
        ? `${failing.length} of ${reports.length} scenario(s) at or above --fail-on ${threshold}: exit 2`
        : `No scenario at or above --fail-on ${threshold}: exit 0`
    );
  }
  return failing.length ? 2 : 0;
}

function printSummary(reports: RunReport[], threshold: Verdict): void {
  const paint = painter(shouldColor(process.stdout));
  const width = Math.max(...reports.map((r) => r.scenarioId.length));
  console.log(paint("bold", `Summary (agent ${reports[0].agentId})`));
  for (const r of reports) {
    const marker = atLeast(r.aggregateVerdict, threshold) ? "FAIL" : "    ";
    console.log(`  ${marker} ${r.scenarioId.padEnd(width)}  ${paint(r.aggregateVerdict, r.aggregateVerdict)}`);
  }
  console.log();
}

async function cmdCompare(flags: Flags): Promise<number> {
  const cfg = readConfig(flags);
  const id = str(flags, "--scenario");
  if (!id) throw new UsageError("compare needs --scenario <id>");
  const scenarios = findScenarios({ id, root: scenarioRoots(cfg) });
  if (scenarios.length !== 1) {
    throw new UsageError(
      scenarios.length === 0
        ? `no scenario matches "${id}"; run "agentcrucible list"`
        : `"${id}" matches ${scenarios.length} scenarios (${scenarios.map((s) => s.id).join(", ")}); give the full id`
    );
  }
  const [scenario] = scenarios;
  const agents = (str(flags, "--agents") ?? "naive-retry,honest-stop,idempotent-retry,cross-checker")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean)
    .map(agentId);
  const trialCount = trials(flags, cfg);
  const threshold = failOn(flags, cfg);
  const seed = str(flags, "--seed") ?? cfg.seed ?? "compare";
  const reports: RunReport[] = [];
  for (const agent of agents) {
    reports.push(await runScenario({ scenario, agentId: agent, seed, trials: trialCount }));
  }
  if (flags["--json"] === true) {
    console.log(JSON.stringify(reports, null, 2));
  } else {
    const paint = painter(shouldColor(process.stdout));
    const width = Math.max(...agents.map((a) => a.length));
    console.log(`compare ${scenario.id} (seed=${seed}, trials=${trialCount}; every agent sees the same fault schedule)`);
    for (const r of reports) {
      const trial = worstTrial(r)!;
      console.log(`  ${r.agentId.padEnd(width)}  ${paint(r.aggregateVerdict, r.aggregateVerdict.padEnd(14))}  ${trial.reason}`);
    }
    for (const w of new Set(reports.flatMap((r) => r.warnings))) console.log(`  warning: ${w}`);
  }
  return reports.some((r) => atLeast(r.aggregateVerdict, threshold)) ? 2 : 0;
}

/** A row passes when the aggregate verdict matches and every scenario fault fired in at least one trial. */
async function cmdCheck(flags: Flags): Promise<number> {
  const cfg = readConfig(flags);
  const scenarios = selectScenarios(flags, cfg);
  const trialCount = str(flags, "--trials") === undefined ? CHECK_TRIALS : trials(flags, cfg);
  const rows: Array<{ scenarioId: string; agentId: string; expected: Verdict; actual: Verdict; unexercisedFaults: number[]; ok: boolean }> = [];
  for (const scenario of scenarios) {
    for (const [agent, expected] of Object.entries(scenario.expectedVerdicts)) {
      const report = await runScenario({ scenario, agentId: agent, trials: trialCount });
      const fired = new Set(report.trials.flatMap((t) => t.trace.calls.map((c) => c.faultIndex)));
      const unexercisedFaults = scenario.faults.map((_, i) => i).filter((i) => !fired.has(i));
      const actual = report.aggregateVerdict;
      rows.push({ scenarioId: scenario.id, agentId: agent, expected, actual, unexercisedFaults, ok: actual === expected && unexercisedFaults.length === 0 });
    }
  }
  const failed = rows.filter((r) => !r.ok);
  if (flags["--json"] === true) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    const paint = painter(shouldColor(process.stdout));
    for (const r of rows) {
      const problems = [
        ...(r.actual === r.expected ? [] : [`expected ${r.expected}`]),
        ...r.unexercisedFaults.map((i) => `faults[${i}] never fired`),
      ];
      console.log(`${r.ok ? "ok  " : paint("bold", "FAIL")} ${r.scenarioId} ${r.agentId}: ${paint(r.actual, r.actual)}${problems.length ? ` (${problems.join("; ")})` : ""}`);
    }
    const unchecked = scenarios.filter((s) => Object.keys(s.expectedVerdicts).length === 0).map((s) => s.id);
    if (unchecked.length) console.log(`no expected_verdicts: ${unchecked.join(", ")}`);
    console.log(`${rows.length - failed.length}/${rows.length} checks pass (trials=${trialCount}, default seeds)`);
  }
  return failed.length ? 2 : 0;
}

async function cmdDemo(flags: Flags): Promise<number> {
  const cfg = readConfig(flags);
  const id = str(flags, "--scenario") ?? DEMO_SCENARIO;
  const scenario = findScenarios({ id, root: scenarioRoots(cfg) }).find((s) => s.id === id);
  if (!scenario) throw new UsageError(`demo needs an exact scenario id; "${id}" was not found`);
  const out = str(flags, "--out");
  if (out) ensureWritableDir(out);
  const { mismatches } = await runDemo(scenario, out);
  return mismatches.length ? 2 : 0;
}

function cmdList(flags: Flags): number {
  const cfg = readConfig(flags);
  const tag = str(flags, "--tag");
  const roots = scenarioRoots(cfg);
  const scenarios = tag ? findScenarios({ tag, root: roots }) : loadAllScenarios(roots);
  for (const s of scenarios) {
    console.log(`${s.id.padEnd(34)} world=${s.world.padEnd(10)} [${s.tags.join(", ")}]`);
    console.log(`  ${s.description.split(/(?<=\.)\s/)[0]}`);
    console.log(`  faults: ${s.faults.map((f) => `${f.kind} on ${f.target}`).join(", ") || "none"} · expect: ${s.expect ? "yes" : "none"}`);
  }
  console.log(`\n${scenarios.length} scenario(s)${tag ? ` tagged ${tag}` : ""} · worlds: ${listWorlds().join(", ")}`);
  return 0;
}

function cmdConfig(flags: Flags): number {
  const explicit = str(flags, "--config");
  const path = explicit ?? findConfigPath();
  if (!path) {
    console.log("No config file found in the current directory.");
    console.log("Looked for: .agentcrucible.json, .agentcrucible.yaml, .agentcrucible.yml, agentcrucible.config.json, .agentcrucible/config.{json,yaml,yml}");
    return 0;
  }
  console.log(`Config: ${path}`);
  console.log(JSON.stringify(loadConfigFile(path), null, 2));
  return 0;
}

function printAgents(): void {
  const width = Math.max(...Object.keys(AGENTS).map((a) => a.length));
  for (const id of Object.keys(AGENTS)) console.log(`${id.padEnd(width)}  ${AGENT_DESCRIPTIONS[id]}`);
}

const HELP = `agentcrucible ${VERSION}: fault-injection tests for tool-using agents, in mock worlds

Usage: agentcrucible <command> [options]

Commands:
  demo        Run the scenario's expected agents side by side and explain each verdict
  list        List scenarios (--tag <tag>)
  run         Run one agent against scenarios and write reports
  compare     Run several agents on one scenario with the same seed
  check       Verify each scenario's expected_verdicts against the scripted agents
  agents      List scripted agents
  worlds      List mock worlds
  config      Show the config file in use
  examples    Print example commands
  version     Print the version

run options:
  --scenario <id>     Exact id, or leading/trailing path segments ("payments", "rate-limit")
  --tag <tag>         All scenarios with this tag
  --agent <id>        Scripted agent (default: config "agent" or naive-retry)
  --trials <n>        Trials per scenario, 1-10000 (default 1)
  --seed <text>       Seed for fault selection (default: seed-<scenario id>)
  --fuzz-call <a-b>   Fault one seeded call index in a..b per trial instead of the scenario's on_call
  --out <dir>         Report directory (default .agentcrucible/out)
  --json              Print the report as JSON (an array when several scenarios ran)
  --fail-on <verdict> Exit 2 when a verdict is at least this severe (default SILENT_FAILURE)
  --config <path>     Use this config file instead of searching the current directory

compare options: --scenario, --agents a,b,c, --trials, --seed, --json, --fail-on, --config
check options:   --scenario, --tag, --trials (default ${CHECK_TRIALS}), --json, --config
demo options:    --scenario (default ${DEMO_SCENARIO}), --out <dir> to also write reports

Verdicts, most to least severe: ${VERDICTS.join(", ")}

Exit status: 0 ok; 1 usage, config, or scenario error; 2 a verdict at or above --fail-on
(run, compare) or an expected verdict that did not hold (check, demo).`;

const EXAMPLES = `# Five agents on the lost-response refund, explained
agentcrucible demo

# A wrong balance reported as fact, and the agent that cross-checks it
agentcrucible compare --scenario database/silent-wrong-balance --agents gullible-reader,cross-checker

# One scenario, five trials, JSON for scripts
agentcrucible run --scenario payments/timeout-after-commit --agent naive-retry --trials 5 --json

# Which call fails is chosen per trial from the seed
agentcrucible run --scenario payments/retry-storm --agent honest-stop --trials 6 --seed ci

# Everything tagged smoke; fail the build on DEGRADED or worse
agentcrucible run --tag smoke --agent cross-checker --fail-on DEGRADED --out reports

# Confirm every scenario still grades the scripted agents as expected
agentcrucible check`;

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`agentcrucible: ${message}`);
    if (err instanceof UsageError) console.error('Run "agentcrucible help" for usage.');
    process.exitCode = 1;
  }
);
