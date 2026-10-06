#!/usr/bin/env node
import { accessSync, constants, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { isIP } from "node:net";
import { join } from "node:path";
import { compareBaseline, createBaseline, readBaseline, writeBaseline, type BaselineComparison } from "./baseline.js";
import { findConfigPath, loadConfig, loadConfigFile, type CrucibleConfig } from "./config.js";
import { DEMO_SCENARIO, runDemo } from "./demo.js";
import { worstTrial } from "./describe.js";
import { renderSweepHtml, type RunIndexEntry } from "./html.js";
import { initProject } from "./init.js";
import { parseMaxSteps, parseModelAgentId, registerModelAgent, type ModelAgentOptions } from "./models.js";
import { formatReport, formatTrialDetail, painter, printReport, readReportFile, shouldColor, writeHtmlReport, writeJsonReport, writeJUnitReport, writeRunIndex } from "./report.js";
import { builtinRegistry, isModulePath, loadAgentModule, loadExtension, type Registry } from "./registry.js";
import { replayReport } from "./replay.js";
import { MAX_CONCURRENCY, parseConcurrency, parseTimeout, parseTrials, runMatrix } from "./runner.js";
import { bundledScenariosDir, findScenarios, loadAllScenarios, loadScenarioFile, scenarioFiles } from "./scenarios.js";
import { VERDICTS, type RunReport, type Scenario, type Verdict } from "./types.js";
import { writeRunSummary } from "./summary.js";
import { formatSweep, runSweep, summarizeSweep, sweepMarkdown, parseSweepSteps, type SweepCell } from "./sweep.js";
import { computeCoverage, formatCoverage } from "./coverage.js";
import { scenarioJsonSchema } from "./scenario-schema.js";
import { COMPLETION_SHELLS, completionScript, type CompletionShell } from "./completion.js";
import { githubAnnotations, githubStepSummary } from "./github.js";
import { serveMcp } from "./mcp.js";
import { startUi, type UiServer } from "./ui/server.js";
import { atLeast } from "./verdict.js";
import { VERSION } from "./version.js";

class UsageError extends Error {}

/** Trials per agent for `check`, so seeded faults get several chances to fire. */
const CHECK_TRIALS = 5;
/** Port `ui` tries first; the next nine are tried when it is taken. */
const UI_PORT = 7357;

type FlagSpec = Record<string, "value" | "boolean">;
type Flags = Record<string, string | true>;
interface Command {
  /** One line for shell completion. */
  description: string;
  flags: FlagSpec;
  /** Name of the one positional argument the command takes, if any. */
  positional?: string;
  /** The positional argument may be left out. */
  optional?: boolean;
  run: (flags: Flags, positional?: string) => Promise<number> | number;
}

const SELECT: FlagSpec = { "--scenario": "value", "--tag": "value", "--config": "value" };
/** Flags for model-backed agents (--agent openai:gpt-4o-mini and the like). */
const MODEL: FlagSpec = { "--record": "value", "--system": "value", "--max-steps": "value" };
/** Flags of every command that runs agents. */
const RUNNING: FlagSpec = { "--trials": "value", "--timeout": "value", "--concurrency": "value", "--config": "value", ...MODEL };
const COMMANDS: Record<string, Command> = {
  demo: { description: "Run a scenario's expected agents side by side and explain each verdict", flags: { "--scenario": "value", "--out": "value", "--config": "value" }, run: cmdDemo },
  list: { description: "List scenarios", flags: { "--tag": "value", "--json": "boolean", "--ids": "boolean", "--tags": "boolean", "--config": "value" }, run: cmdList },
  run: {
    description: "Run agents against scenarios and write reports",
    flags: {
      ...SELECT,
      ...RUNNING,
      "--agent": "value",
      "--agents": "value",
      "--seed": "value",
      "--fuzz-call": "value",
      "--out": "value",
      "--json": "boolean",
      "--fail-on": "value",
      "--baseline": "value",
      "--save-baseline": "value",
      "--github": "boolean",
    },
    run: cmdRun,
  },
  compare: {
    description: "Run several agents on one scenario with the same seed",
    flags: { ...RUNNING, "--scenario": "value", "--agents": "value", "--seed": "value", "--json": "boolean", "--fail-on": "value" },
    run: cmdCompare,
  },
  check: { description: "Verify each scenario's expected_verdicts", flags: { ...SELECT, ...RUNNING, "--json": "boolean", "--github": "boolean" }, run: cmdCheck },
  sweep: {
    description: "Inject every fault kind at every step of an agent's path",
    flags: { ...RUNNING, "--scenario": "value", "--agent": "value", "--kinds": "value", "--steps": "value", "--seed": "value", "--out": "value", "--json": "boolean", "--fail-on": "value", "--github": "boolean" },
    run: cmdSweep,
  },
  coverage: { description: "Show what the scenarios cover and what nothing covers", flags: { "--tag": "value", "--json": "boolean", "--config": "value" }, run: cmdCoverage },
  inspect: { description: "Show a saved report call by call", flags: { "--trial": "value", "--call": "value", "--scenario": "value" }, positional: "report", run: cmdInspect },
  replay: { description: "Re-execute a saved report's tool calls", flags: { "--scenario": "value", "--json": "boolean", "--config": "value" }, positional: "report", run: cmdReplay },
  validate: { description: "Check scenario files without running them", flags: { "--json": "boolean", "--config": "value" }, positional: "path", optional: true, run: cmdValidate },
  mcp: { description: "Serve a scenario's tools to an MCP client over stdio and grade its answer", flags: { "--scenario": "value", "--seed": "value", "--out": "value", "--agent-id": "value", "--config": "value" }, run: cmdMcp },
  ui: {
    description: "Browse, run, compare, and edit scenarios in a local web UI",
    flags: { "--port": "value", "--host": "value", "--out": "value", "--baseline": "value", "--agents": "value", "--fail-on": "value", "--config": "value", ...MODEL },
    run: cmdUi,
  },
  init: { description: "Write a starter config, scenario, and agent", flags: {}, run: cmdInit },
  agents: { description: "List agents", flags: { "--json": "boolean", "--ids": "boolean", "--config": "value" }, run: cmdAgents },
  worlds: { description: "List mock worlds with their tools and record kinds", flags: { "--json": "boolean", "--config": "value" }, run: cmdWorlds },
  faults: { description: "List fault kinds", flags: { "--json": "boolean", "--ids": "boolean", "--config": "value" }, run: cmdFaults },
  config: { description: "Show the config file in use", flags: { "--config": "value" }, run: cmdConfig },
  schema: { description: "Print the JSON Schema for scenario files", flags: { "--config": "value" }, run: cmdSchema },
  completion: { description: "Print a shell completion script", flags: {}, positional: "shell", optional: true, run: cmdCompletion },
  examples: { description: "Print example commands", flags: {}, run: () => (console.log(EXAMPLES), 0) },
  version: { description: "Print the version", flags: {}, run: () => (console.log(`agentcrucible ${VERSION}`), 0) },
  help: { description: "Print usage", flags: {}, run: () => (console.log(HELP), 0) },
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
  const { flags, positional } = parseArgs(name, rest, command);
  return command.run(flags, positional);
}

function parseArgs(command: string, args: string[], spec: Command): { flags: Flags; positional?: string } {
  const flags: Flags = {};
  let positional: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const [name, inline] = args[i].startsWith("--") && args[i].includes("=")
      ? [args[i].slice(0, args[i].indexOf("=")), args[i].slice(args[i].indexOf("=") + 1)]
      : [args[i], undefined];
    const kind = spec.flags[name];
    if (!kind) {
      if (!name.startsWith("-") && spec.positional && positional === undefined) {
        positional = name;
        continue;
      }
      const known = Object.keys(spec.flags);
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
  if (spec.positional && !spec.optional && positional === undefined) throw new UsageError(`${command} needs a ${spec.positional} file: agentcrucible ${command} <${spec.positional}.json>`);
  return { flags, positional };
}

function str(flags: Flags, name: string): string | undefined {
  const v = flags[name];
  return typeof v === "string" ? v : undefined;
}

interface Context {
  cfg: CrucibleConfig;
  registry: Registry;
  /** Settings for agents named provider:model, from the flags and the config file. */
  model: ModelAgentOptions;
}

/** True under GitHub Actions or with --github: results are also printed as workflow annotations and a step summary. */
function onGitHub(flags: Flags): boolean {
  return flags["--github"] === true || process.env.GITHUB_ACTIONS === "true";
}

/** The config file (from --config or the working directory) and a registry with its extensions loaded. */
async function context(flags: Flags): Promise<Context> {
  const path = str(flags, "--config");
  const cfg = path ? loadConfigFile(path) : loadConfig();
  let registry = builtinRegistry();
  for (const extension of cfg.extensions ?? []) registry = await loadExtension(registry, extension);
  return { cfg, registry, model: modelOptions(flags, cfg) };
}

function modelOptions(flags: Flags, cfg: CrucibleConfig): ModelAgentOptions {
  const options: ModelAgentOptions = {};
  const record = str(flags, "--record") ?? cfg.record;
  if (record !== undefined) options.cassetteDir = record;
  const system = str(flags, "--system") ?? cfg.systemPrompt;
  if (system !== undefined) {
    if (!existsSync(system)) throw new UsageError(`--system: file not found: ${system}`);
    options.systemPrompt = readFileSync(system, "utf8");
  }
  const steps = str(flags, "--max-steps");
  if (steps !== undefined) {
    try {
      options.maxSteps = parseMaxSteps(steps);
    } catch (err) {
      throw new UsageError(`--max-steps: ${(err as Error).message}`);
    }
  } else if (cfg.maxSteps !== undefined) options.maxSteps = cfg.maxSteps;
  return options;
}

/**
 * A registered agent id, a module path that is loaded and registered under its file name, or a
 * provider:model id that is registered as a model-backed agent.
 */
async function resolveAgent(value: string, ctx: Context, from = "--agent"): Promise<{ registry: Registry; id: string }> {
  const { registry } = ctx;
  if (isModulePath(value)) return loadAgentModule(registry, value);
  let model;
  try {
    model = parseModelAgentId(value);
  } catch (err) {
    throw new UsageError((err as Error).message);
  }
  if (model) return { registry: registerModelAgent(registry, value, ctx.model), id: value };
  if (!registry.agents.has(value)) {
    throw new UsageError(
      `${from === "config" ? `config agent "${value}" is not a registered agent` : `unknown agent "${value}"`} (available: ${[...registry.agents.keys()].join(", ")}; or give a module path such as ./my-agent.mjs, or provider:model such as openai:gpt-4o-mini)`
    );
  }
  return { registry, id: value };
}

/** Registers every provider:model agent the scenarios' expected_verdicts name, so check and the UI can run them. */
function registerExpectedModelAgents(scenarios: Scenario[], ctx: Context): Registry {
  let { registry } = ctx;
  for (const id of new Set(scenarios.flatMap((s) => Object.keys(s.expectedVerdicts)))) {
    if (!registry.agents.has(id) && parseModelAgentId(id)) registry = registerModelAgent(registry, id, ctx.model);
  }
  return registry;
}

function scenarioRoots(cfg: CrucibleConfig): string[] {
  for (const dir of cfg.scenarioDirs ?? []) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      throw new UsageError(`scenarioDirs entry "${dir}" is not a directory (paths are relative to ${process.cwd()})`);
    }
  }
  return [bundledScenariosDir(), ...(cfg.scenarioDirs ?? [])];
}

function selectScenarios(flags: Flags, cfg: CrucibleConfig, registry: Registry, fallbackTag?: string): Scenario[] {
  const id = str(flags, "--scenario");
  const tag = str(flags, "--tag") ?? (id ? undefined : fallbackTag);
  const root = scenarioRoots(cfg);
  if (!id && !tag) return loadAllScenarios(root, registry);
  const found = findScenarios({ id, tag, root, registry });
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

function timeout(flags: Flags, cfg: CrucibleConfig): number | undefined {
  const raw = str(flags, "--timeout");
  if (raw === undefined) return cfg.timeoutMs;
  try {
    return parseTimeout(raw);
  } catch (err) {
    throw new UsageError(`--timeout: ${(err as Error).message}`);
  }
}

function concurrency(flags: Flags, cfg: CrucibleConfig): number {
  const raw = str(flags, "--concurrency");
  if (raw === undefined) return cfg.concurrency ?? 1;
  try {
    return parseConcurrency(raw);
  } catch (err) {
    throw new UsageError(`--concurrency: ${(err as Error).message}`);
  }
}

/** The agents of a comma-separated list, each a registered id, a module path, or provider:model, loaded into the registry. */
async function resolveAgents(value: string, ctx: Context, from: string): Promise<{ registry: Registry; ids: string[] }> {
  const ids: string[] = [];
  let { registry } = ctx;
  for (const item of value.split(",").map((a) => a.trim()).filter(Boolean)) {
    const resolved = await resolveAgent(item, { ...ctx, registry }, from);
    registry = resolved.registry;
    if (!ids.includes(resolved.id)) ids.push(resolved.id);
  }
  if (ids.length === 0) throw new UsageError(`${from} needs at least one agent`);
  return { registry, ids };
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
  const ctx = await context(flags);
  const { cfg } = ctx;
  const agentFlag = str(flags, "--agent");
  const agentsFlag = str(flags, "--agents");
  if (agentFlag !== undefined && agentsFlag !== undefined) throw new UsageError("use --agent <id|path> for one agent or --agents a,b for several, not both");
  const { registry, ids: agents } = await resolveAgents(
    agentsFlag ?? agentFlag ?? cfg.agent ?? "naive-retry",
    ctx,
    agentsFlag !== undefined ? "--agents" : agentFlag === undefined && cfg.agent ? "config" : "--agent"
  );
  const trialCount = trials(flags, cfg);
  const threshold = failOn(flags, cfg);
  const timeoutMs = timeout(flags, cfg);
  const parallel = concurrency(flags, cfg);
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
  const baselinePath = str(flags, "--baseline");
  const baseline = baselinePath ? readBaseline(baselinePath) : undefined;
  const scenarios = selectScenarios(flags, cfg, registry, cfg.defaultTag);
  ensureWritableDir(out);

  // One agent writes flat into `out`, as before; several agents get a directory each, as the UI does.
  const dirOf = (agent: string) => (agents.length === 1 ? undefined : agent);
  const reports = await runMatrix({
    scenarios,
    agents,
    seed,
    trials: trialCount,
    fuzzCallRange,
    registry,
    timeoutMs,
    concurrency: parallel,
    onReport: (report) => {
      const dir = dirOf(report.agentId);
      const target = dir ? join(out, encodeURIComponent(dir)) : out;
      writeJsonReport(report, target);
      writeHtmlReport(report, target);
      writeJUnitReport(report, target, threshold);
      if (!asJson) printReport(report);
    },
  });
  const log = asJson ? (line = "") => console.error(line) : (line = "") => console.log(line);
  const savePath = str(flags, "--save-baseline");
  if (savePath) {
    writeBaseline(savePath, createBaseline(reports));
    log(`Baseline written to ${savePath} (${reports.length} entr${reports.length === 1 ? "y" : "ies"})`);
  }
  const failing = reports.filter((r) => atLeast(r.aggregateVerdict, threshold));
  const comparison = baseline ? compareBaseline(baseline, reports) : undefined;
  const entries = reports.map((report) => ({ report, dir: dirOf(report.agentId), ...(comparison ? { change: baselineChange(comparison, report, threshold) } : {}) }));
  const title = `AgentCrucible run: ${scenarios.length === 1 ? scenarios[0].id : `${scenarios.length} scenarios`} (${agents.length === 1 ? `agent ${agents[0]}` : `agents ${agents.join(", ")}`})`;
  writeRunIndex(entries, out, title, threshold);
  writeRunSummary(entries, out, { title, failOn: threshold, ...(baselinePath ? { baselinePath } : {}) });
  if (asJson) console.log(JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2));
  else if (agents.length > 1) printMatrix(reports, agents, threshold);
  else if (reports.length > 1) printSummary(reports, threshold);
  if (!asJson) console.log(`Reports written to ${out}/ (index.html, summary.md, ${agents.length > 1 ? "<agent>/" : ""}*.report.json, *.report.html, *.junit.xml)`);
  if (onGitHub(flags)) {
    for (const line of githubAnnotations(reports, threshold, comparison)) console.log(line);
    githubStepSummary(readFileSync(join(out, "summary.md"), "utf8"));
  }

  if (comparison && baselinePath) {
    writeFileSync(join(out, "baseline-comparison.json"), `${JSON.stringify(comparison, null, 2)}\n`);
    printComparison(comparison, baselinePath, threshold, log);
    if (comparison.incomparable.length) {
      throw new UsageError(`${comparison.incomparable.length} result(s) are not comparable with ${baselinePath}; run with the baseline's seed and trials, or write a new baseline with --save-baseline`);
    }
    const newFailures = comparison.added.filter((e) => atLeast(e.verdict, threshold));
    const failed = comparison.regressions.length + newFailures.length;
    log(
      failed
        ? `${comparison.regressions.length} regression(s) and ${newFailures.length} new scenario(s) at or above --fail-on ${threshold}: exit 2`
        : "No regressions against the baseline: exit 0"
    );
    return failed ? 2 : 0;
  }
  if (!asJson) {
    const unit = agents.length > 1 ? "result" : "scenario";
    console.log(
      failing.length
        ? `${failing.length} of ${reports.length} ${unit}(s) at or above --fail-on ${threshold}: exit 2`
        : `No ${unit} at or above --fail-on ${threshold}: exit 0`
    );
  }
  return failing.length ? 2 : 0;
}

function baselineChange(c: BaselineComparison, report: RunReport, threshold: Verdict): NonNullable<RunIndexEntry["change"]> {
  const is = (e: { scenario: string; agent: string }) => e.scenario === report.scenarioId && e.agent === report.agentId;
  if (c.regressions.some(is)) return "regression";
  if (c.improvements.some(is)) return "improved";
  if (c.changed.some(is)) return "changed";
  if (c.added.some(is)) return atLeast(report.aggregateVerdict, threshold) ? "new failure" : "new";
  return "unchanged";
}

function printComparison(c: BaselineComparison, path: string, threshold: Verdict, log: (line?: string) => void): void {
  const rules = (ch: BaselineComparison["regressions"][number]) =>
    [...ch.rulesAdded.map((r) => `+${r}`), ...ch.rulesRemoved.map((r) => `-${r}`)].join(" ");
  log(`Baseline ${path}:`);
  for (const ch of c.regressions) log(`  REGRESSION ${ch.scenario} ${ch.agent}: ${ch.before} -> ${ch.after} ${rules(ch)}`.trimEnd());
  for (const ch of c.improvements) log(`  improved   ${ch.scenario} ${ch.agent}: ${ch.before} -> ${ch.after} ${rules(ch)}`.trimEnd());
  for (const ch of c.changed) log(`  changed    ${ch.scenario} ${ch.agent}: ${ch.after}, rules ${rules(ch)}`);
  for (const e of c.added) log(`  ${atLeast(e.verdict, threshold) ? "NEW FAIL  " : "new       "} ${e.scenario} ${e.agent}: ${e.verdict} (not in the baseline)`);
  for (const e of c.notRun) log(`  not run    ${e.scenario} ${e.agent} (baseline: ${e.verdict})`);
  for (const e of c.incomparable) log(`  NOT COMPARABLE ${e.scenario} ${e.agent}: ${e.detail}`);
  log(`  ${c.unchanged} unchanged, ${c.regressions.length} regressed, ${c.improvements.length} improved, ${c.changed.length} changed rules, ${c.added.length} new`);
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

/** A scenario-by-agent table of verdicts; a result at or above the threshold is marked with "!". */
function printMatrix(reports: RunReport[], agents: string[], threshold: Verdict): void {
  const paint = painter(shouldColor(process.stdout));
  const scenarios = [...new Set(reports.map((r) => r.scenarioId))];
  const width = Math.max(...scenarios.map((s) => s.length));
  const columns = agents.map((a) => Math.max(a.length, 16));
  console.log(paint("bold", `Summary (${agents.length} agents)`));
  console.log(`  ${"".padEnd(width)}  ${agents.map((a, i) => a.padEnd(columns[i])).join("  ")}`);
  for (const scenario of scenarios) {
    const cells = agents.map((agent, i) => {
      const report = reports.find((r) => r.scenarioId === scenario && r.agentId === agent);
      if (!report) return "".padEnd(columns[i]);
      const mark = atLeast(report.aggregateVerdict, threshold) ? "!" : " ";
      return paint(report.aggregateVerdict, `${mark}${report.aggregateVerdict}`.padEnd(columns[i]));
    });
    console.log(`  ${scenario.padEnd(width)}  ${cells.join("  ")}`);
  }
  console.log(`  ! at or above --fail-on ${threshold}`);
  console.log();
}

async function cmdCompare(flags: Flags): Promise<number> {
  const ctx = await context(flags);
  let { registry } = ctx;
  const id = str(flags, "--scenario");
  if (!id) throw new UsageError("compare needs --scenario <id>");
  const resolved = await resolveAgents(str(flags, "--agents") ?? "naive-retry,honest-stop,idempotent-retry,cross-checker", ctx, "--agents");
  registry = resolved.registry;
  const agents = resolved.ids;
  const scenario = oneScenario(id, ctx.cfg, registry);
  const trialCount = trials(flags, ctx.cfg);
  const threshold = failOn(flags, ctx.cfg);
  const seed = str(flags, "--seed") ?? ctx.cfg.seed ?? "compare";
  const reports = await runMatrix({ scenarios: [scenario], agents, seed, trials: trialCount, registry, timeoutMs: timeout(flags, ctx.cfg), concurrency: concurrency(flags, ctx.cfg) });
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
  const ctx = await context(flags);
  const { cfg } = ctx;
  const scenarios = selectScenarios(flags, cfg, ctx.registry);
  const registry = registerExpectedModelAgents(scenarios, ctx);
  const trialCount = str(flags, "--trials") === undefined ? CHECK_TRIALS : trials(flags, cfg);
  const timeoutMs = timeout(flags, cfg);
  const parallel = concurrency(flags, cfg);
  const reports = await runMatrix({ scenarios, agents: (s) => Object.keys(s.expectedVerdicts), trials: trialCount, registry, timeoutMs, concurrency: parallel });
  const rows = reports.map((report) => {
    const expected = report.scenario.expectedVerdicts[report.agentId];
    const fired = new Set(report.trials.flatMap((t) => t.trace.calls.map((c) => c.faultIndex)));
    const unexercisedFaults = report.scenario.faults.map((_, i) => i).filter((i) => !fired.has(i));
    const actual = report.aggregateVerdict;
    return { scenarioId: report.scenarioId, agentId: report.agentId, expected, actual, unexercisedFaults, ok: actual === expected && unexercisedFaults.length === 0 };
  });
  const failed = rows.filter((r) => !r.ok);
  if (flags["--json"] === true) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    const paint = painter(shouldColor(process.stdout));
    for (const r of rows) {
      const problems = [...(r.actual === r.expected ? [] : [`expected ${r.expected}`]), ...r.unexercisedFaults.map((i) => `faults[${i}] never fired`)];
      console.log(`${r.ok ? "ok  " : paint("bold", "FAIL")} ${r.scenarioId} ${r.agentId}: ${paint(r.actual, r.actual)}${problems.length ? ` (${problems.join("; ")})` : ""}`);
    }
    const unchecked = scenarios.filter((s) => Object.keys(s.expectedVerdicts).length === 0).map((s) => s.id);
    if (unchecked.length) console.log(`no expected_verdicts: ${unchecked.join(", ")}`);
    console.log(`${rows.length - failed.length}/${rows.length} checks pass (trials=${trialCount}, default seeds)`);
    if (onGitHub(flags)) {
      for (const r of failed) {
        const scenario = scenarios.find((s) => s.id === r.scenarioId)!;
        const problems = [...(r.actual === r.expected ? [] : [`expected ${r.expected}, got ${r.actual}`]), ...r.unexercisedFaults.map((i) => `faults[${i}] never fired`)];
        console.log(githubAnnotations.error(`${r.scenarioId} (${r.agentId})`, problems.join("; "), scenario.source));
      }
      githubStepSummary(`### agentcrucible check\n\n${rows.length - failed.length}/${rows.length} checks pass.${failed.length ? `\n\n${failed.map((r) => `- **${r.scenarioId}** ${r.agentId}: ${r.actual}${r.actual === r.expected ? "" : ` (expected ${r.expected})`}${r.unexercisedFaults.map((i) => `, faults[${i}] never fired`).join("")}`).join("\n")}` : ""}\n`);
    }
  }
  return failed.length ? 2 : 0;
}

/** The one scenario an exact or unique partial id names. */
function oneScenario(id: string, cfg: CrucibleConfig, registry: Registry): Scenario {
  const scenarios = findScenarios({ id, root: scenarioRoots(cfg), registry });
  if (scenarios.length === 1) return scenarios[0];
  throw new UsageError(
    scenarios.length === 0
      ? `no scenario matches "${id}"; run "agentcrucible list"`
      : `"${id}" matches ${scenarios.length} scenarios (${scenarios.map((s) => s.id).join(", ")}); give the full id`
  );
}

/** Injects every fault kind at every step of the agent's clean path and prints the kind-by-step table. */
async function cmdSweep(flags: Flags): Promise<number> {
  const ctx = await context(flags);
  const { cfg } = ctx;
  const id = str(flags, "--scenario");
  if (!id) throw new UsageError("sweep needs --scenario <id>");
  const resolved = await resolveAgent(str(flags, "--agent") ?? cfg.agent ?? "naive-retry", ctx, str(flags, "--agent") === undefined && cfg.agent ? "config" : "--agent");
  const { registry } = resolved;
  const scenario = oneScenario(id, cfg, registry);
  const kinds = str(flags, "--kinds")?.split(",").map((k) => k.trim()).filter(Boolean);
  let steps: number | undefined;
  if (str(flags, "--steps") !== undefined) {
    try {
      steps = parseSweepSteps(str(flags, "--steps"));
    } catch (err) {
      throw new UsageError(`--steps: ${(err as Error).message}`);
    }
  }
  const threshold = failOn(flags, cfg);
  const out = str(flags, "--out");
  if (out) ensureWritableDir(out);
  const asJson = flags["--json"] === true;
  const paint = painter(!asJson && shouldColor(process.stdout));
  let result;
  try {
    result = await runSweep({
      scenario,
      agentId: resolved.id,
      registry,
      kinds,
      steps,
      seed: str(flags, "--seed"),
      trials: trials(flags, cfg),
      timeoutMs: timeout(flags, cfg),
      concurrency: concurrency(flags, cfg),
      onCell: asJson || !process.stderr.isTTY ? undefined : (cell: SweepCell, index: number, total: number) => process.stderr.write(`\r  ${index + 1}/${total} ${cell.kind} @ step ${cell.step}: ${paint(cell.verdict, cell.verdict)}\x1b[K${index + 1 === total ? "\r\x1b[K" : ""}`),
    });
  } catch (err) {
    throw new UsageError((err as Error).message);
  }
  const summary = summarizeSweep(result);
  if (out) {
    writeFileSync(join(out, "sweep.json"), `${JSON.stringify(summary, null, 2)}\n`);
    writeFileSync(join(out, "sweep.md"), `${sweepMarkdown(summary)}\n`);
    writeFileSync(join(out, "sweep.html"), renderSweepHtml(summary, { version: VERSION }));
    const cells = join(out, "cells");
    mkdirSync(cells, { recursive: true });
    writeFileSync(join(cells, "baseline.report.json"), JSON.stringify(result.baselineReport, null, 2));
    result.cells.forEach((cell, i) => writeFileSync(join(cells, `${cell.kind}@${cell.step}.report.json`), JSON.stringify(result.cellReports[i], null, 2)));
  }
  if (asJson) console.log(JSON.stringify(summary, null, 2));
  else {
    console.log(formatSweep(summary, shouldColor(process.stdout)));
    if (out) console.log(`\nWritten to ${out}/ (sweep.json, sweep.md, sweep.html, cells/<kind>@<step>.report.json)`);
  }
  const failingCells = result.cells.filter((c) => c.fired && atLeast(c.verdict, threshold));
  const failing = failingCells.length;
  if (!asJson) console.log(failing ? `${failing} of ${result.cells.length} runs at or above --fail-on ${threshold}: exit 2` : `No run at or above --fail-on ${threshold}: exit 0`);
  if (onGitHub(flags)) {
    for (const c of failingCells) console.log(githubAnnotations.error(`${scenario.id} (${resolved.id}): ${c.kind} on ${result.steps[c.step - 1].tool}#${result.steps[c.step - 1].callIndex}`, `${c.verdict}: ${c.reason}`, scenario.source));
    githubStepSummary(`### agentcrucible sweep\n\n${sweepMarkdown(summary)}\n`);
  }
  return failing ? 2 : 0;
}

/** What the scenario set exercises and what it leaves out. */
async function cmdCoverage(flags: Flags): Promise<number> {
  const { cfg, registry } = await context(flags);
  const tag = str(flags, "--tag");
  const root = scenarioRoots(cfg);
  const scenarios = tag ? findScenarios({ tag, root, registry }) : loadAllScenarios(root, registry);
  const coverage = computeCoverage(scenarios, registry);
  if (flags["--json"] === true) console.log(JSON.stringify(coverage, null, 2));
  else console.log(formatCoverage(coverage, shouldColor(process.stdout)));
  return 0;
}

async function cmdDemo(flags: Flags): Promise<number> {
  const { cfg, registry } = await context(flags);
  const id = str(flags, "--scenario") ?? DEMO_SCENARIO;
  const scenario = findScenarios({ id, root: scenarioRoots(cfg), registry }).find((s) => s.id === id);
  if (!scenario) throw new UsageError(`demo needs an exact scenario id; "${id}" was not found`);
  const out = str(flags, "--out");
  if (out) ensureWritableDir(out);
  const { mismatches } = await runDemo(scenario, registry, out);
  return mismatches.length ? 2 : 0;
}

function cmdInspect(flags: Flags, path?: string): number {
  const report = readReportFile(path!, str(flags, "--scenario"));
  const raw = str(flags, "--trial");
  if (raw !== undefined && !/^\d+$/.test(raw)) throw new UsageError(`--trial must be a trial number (got "${raw}")`);
  const trial = raw === undefined ? worstTrial(report)!.trace.trialIndex : Number(raw);
  console.log(formatTrialDetail(report, trial, str(flags, "--call"), shouldColor(process.stdout)));
  return 0;
}

async function cmdReplay(flags: Flags, path?: string): Promise<number> {
  const { registry } = await context(flags);
  const report = readReportFile(path!, str(flags, "--scenario"));
  const result = replayReport(report, registry);
  if (flags["--json"] === true) {
    console.log(JSON.stringify(result, null, 2));
    return result.reproduced ? 0 : 2;
  }
  console.log(`replay ${report.scenarioId} (agent ${report.agentId}, seed ${report.seed}, ${report.trials.length} trial(s), recorded by AgentCrucible ${report.toolVersion})`);
  for (const t of result.trials) {
    if (t.divergence) {
      const d = t.divergence;
      console.log(`  trial ${t.trialIndex}: DIVERGED at ${d.at} (${d.field}): recorded ${JSON.stringify(d.recorded)}; replayed ${JSON.stringify(d.replayed)}`);
      continue;
    }
    console.log(
      `  trial ${t.trialIndex}: ${t.replayedCalls} call(s) replayed identically; ${t.reproduced ? `verdict ${t.verdict} as recorded` : `GRADED DIFFERENTLY: ${t.verdict} [${t.rules!.join(", ")}], recorded ${t.recordedVerdict} [${t.recordedRules.join(", ")}]`}`
    );
  }
  console.log(result.reproduced ? "Reproduced: every call, state, and verdict matches the report." : "Not reproduced: see the differences above (exit 2).");
  return result.reproduced ? 0 : 2;
}

async function cmdList(flags: Flags): Promise<number> {
  const { cfg, registry } = await context(flags);
  const tag = str(flags, "--tag");
  const root = scenarioRoots(cfg);
  const scenarios = tag ? findScenarios({ tag, root, registry }) : loadAllScenarios(root, registry);
  if (flags["--ids"] === true) {
    for (const s of scenarios) console.log(s.id);
    return 0;
  }
  if (flags["--tags"] === true) {
    for (const t of [...new Set(scenarios.flatMap((s) => s.tags))].sort()) console.log(t);
    return 0;
  }
  if (flags["--json"] === true) {
    console.log(
      JSON.stringify(
        scenarios.map((s) => ({
          id: s.id,
          worlds: s.worlds,
          tags: s.tags,
          description: s.description,
          task: s.task,
          faults: s.faults,
          hasExpect: s.expect !== undefined,
          expectedVerdicts: s.expectedVerdicts,
          source: s.source ?? null,
        })),
        null,
        2
      )
    );
    return 0;
  }
  for (const s of scenarios) {
    console.log(`${s.id.padEnd(34)} world=${s.worlds.join("+").padEnd(10)} [${s.tags.join(", ")}]`);
    console.log(`  ${s.description.split(/(?<=\.)\s/)[0]}`);
    console.log(`  faults: ${s.faults.map((f) => `${f.kind} on ${f.target}`).join(", ") || "none"} · expect: ${s.expect ? "yes" : "none"}`);
  }
  console.log(`\n${scenarios.length} scenario(s)${tag ? ` tagged ${tag}` : ""} · worlds: ${[...registry.worlds.keys()].join(", ")}`);
  return 0;
}

async function cmdAgents(flags: Flags): Promise<number> {
  const { registry } = await context(flags);
  if (flags["--ids"] === true) {
    for (const id of registry.agents.keys()) console.log(id);
    return 0;
  }
  if (flags["--json"] === true) {
    console.log(JSON.stringify([...registry.agents].map(([id, e]) => ({ id, description: e.value.description, source: e.source })), null, 2));
    return 0;
  }
  const width = Math.max(...[...registry.agents.keys()].map((a) => a.length));
  for (const [id, entry] of registry.agents) {
    console.log(`${id.padEnd(width)}  ${entry.value.description || "(no description)"}${entry.source === "built-in" ? "" : `  [${entry.source}]`}`);
  }
  return 0;
}

async function cmdWorlds(flags: Flags): Promise<number> {
  const { registry } = await context(flags);
  if (flags["--json"] === true) {
    console.log(
      JSON.stringify(
        [...registry.worlds].map(([name, e]) => {
          const world = e.value();
          return { name, description: world.description, source: e.source, tools: world.tools, records: world.recordFields };
        }),
        null,
        2
      )
    );
    return 0;
  }
  for (const [name, entry] of registry.worlds) {
    const world = entry.value();
    console.log(`${name}${entry.source === "built-in" ? "" : `  [${entry.source}]`}: ${world.description}`);
    console.log(`  tools: ${world.tools.map((t) => `${t.name}${t.mutating ? "*" : ""}`).join(", ")}`);
    console.log(`  records: ${Object.entries(world.recordFields).map(([kind, fields]) => `${kind} (${Object.keys(fields).join(", ")})`).join("; ")}`);
  }
  console.log("\n* changes state");
  return 0;
}

async function cmdFaults(flags: Flags): Promise<number> {
  const { registry } = await context(flags);
  if (flags["--ids"] === true) {
    for (const kind of registry.faults.keys()) console.log(kind);
    return 0;
  }
  if (flags["--json"] === true) {
    console.log(JSON.stringify([...registry.faults].map(([kind, e]) => ({ kind, stage: e.value.stage, description: e.value.description, params: e.value.params ?? null, source: e.source })), null, 2));
    return 0;
  }
  const width = Math.max(...[...registry.faults.keys()].map((k) => k.length));
  for (const [kind, entry] of registry.faults) {
    const params = Object.keys(entry.value.params?.properties ?? {});
    console.log(
      `${kind.padEnd(width)}  ${entry.value.stage.padEnd(6)}  ${entry.value.description}${params.length ? ` (params: ${params.join(", ")})` : ""}${entry.source === "built-in" ? "" : `  [${entry.source}]`}`
    );
  }
  console.log("\nbefore: the call does not run. after: the call runs, then the agent sees a changed response. twice: the call runs twice; the agent sees the first response.");
  return 0;
}

/** Parses every scenario file and reports each problem, without running anything. */
async function cmdValidate(flags: Flags, path?: string): Promise<number> {
  const { cfg, registry } = await context(flags);
  const files = path ? scenarioFiles(path) : scenarioRoots(cfg).flatMap((root) => scenarioFiles(root));
  const seen = new Map<string, string>();
  const rows = files.map((file): { file: string; id?: string; ok: boolean; error?: string } => {
    try {
      const { id } = loadScenarioFile(file, registry);
      const previous = seen.get(id);
      if (previous) return { file, id, ok: false, error: `duplicate scenario id "${id}" (also in ${previous})` };
      seen.set(id, file);
      return { file, id, ok: true };
    } catch (err) {
      return { file, ok: false, error: (err as Error).message };
    }
  });
  const failed = rows.filter((r) => !r.ok);
  if (flags["--json"] === true) {
    console.log(JSON.stringify(rows, null, 2));
    return failed.length ? 1 : 0;
  }
  if (path) for (const r of rows.filter((r) => r.ok)) console.log(`ok   ${r.file} (${r.id})`);
  for (const r of failed) console.log(`FAIL ${r.error!.startsWith(r.file) ? r.error : `${r.file}: ${r.error}`}`);
  console.log(
    files.length === 0
      ? `No scenario files (.yaml, .yml, .json) under ${path}`
      : failed.length
        ? `${failed.length} of ${files.length} scenario file(s) have errors`
        : `${files.length} scenario file(s) valid`
  );
  return failed.length || files.length === 0 ? 1 : 0;
}

/** Serves one trial of a scenario to an MCP client on stdin/stdout, grades the submitted answer, and exits. */
async function cmdMcp(flags: Flags): Promise<number> {
  const { cfg, registry } = await context(flags);
  const id = str(flags, "--scenario");
  if (!id) throw new UsageError("mcp needs --scenario <id>");
  const scenario = oneScenario(id, cfg, registry);
  const out = str(flags, "--out");
  if (out) ensureWritableDir(out);
  const log = (line: string) => console.error(line);
  log(`agentcrucible ${VERSION} mcp: serving ${scenario.id} (${scenario.worlds.join("+")}) on stdio; call ${"submit_answer"} to finish`);
  const report = await serveMcp({ scenario, registry, seed: str(flags, "--seed"), agentId: str(flags, "--agent-id") ?? "mcp-client", input: process.stdin, output: process.stdout, log });
  if (out) {
    writeJsonReport(report, out);
    writeHtmlReport(report, out);
    writeJUnitReport(report, out, failOn(flags, cfg));
    log(`Report written to ${out}/`);
  }
  log(formatReport(report, shouldColor(process.stderr)));
  return atLeast(report.aggregateVerdict, failOn(flags, cfg)) ? 2 : 0;
}

/** Serves the local UI until interrupted. */
async function cmdUi(flags: Flags): Promise<number> {
  const ctx = await context(flags);
  let { registry } = ctx;
  const modules = [...(ctx.cfg.agent && isModulePath(ctx.cfg.agent) ? [ctx.cfg.agent] : []), ...(str(flags, "--agents") ?? "").split(",").map((a) => a.trim()).filter(Boolean)];
  for (const value of new Set(modules)) registry = (await resolveAgent(value, { ...ctx, registry })).registry;
  registry = registerExpectedModelAgents(loadAllScenarios(scenarioRoots(ctx.cfg), registry), { ...ctx, registry });
  const host = str(flags, "--host") ?? "127.0.0.1";
  const rawPort = str(flags, "--port");
  if (rawPort !== undefined && !(/^\d+$/.test(rawPort) && Number(rawPort) <= 65535)) throw new UsageError(`--port must be a port number, 0-65535 (got "${rawPort}")`);
  const out = str(flags, "--out") ?? ctx.cfg.out ?? ".agentcrucible/out";
  const options = {
    host,
    outDir: out,
    scenarioRoots: scenarioRoots(ctx.cfg),
    scenarioDir: ctx.cfg.scenarioDirs?.[0],
    baselinePath: str(flags, "--baseline") ?? "agentcrucible-baseline.json",
    registry,
    failOn: failOn(flags, ctx.cfg),
    timeoutMs: ctx.cfg.timeoutMs,
    concurrency: ctx.cfg.concurrency,
  };
  const ports = rawPort === undefined ? [...Array.from({ length: 10 }, (_, i) => UI_PORT + i), 0] : [Number(rawPort)];
  let server: UiServer | undefined;
  for (const port of ports) {
    try {
      server = await startUi({ ...options, port });
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EADDRINUSE") throw err;
      if (rawPort !== undefined) throw new UsageError(`port ${rawPort} is in use; choose another with --port, or --port 0 for any free port`);
    }
  }
  console.log(`AgentCrucible ${VERSION} UI: ${server!.url}`);
  console.log(`  scenarios: bundled${ctx.cfg.scenarioDirs?.length ? `, ${ctx.cfg.scenarioDirs.join(", ")}` : ""}${options.scenarioDir ? ` (the editor saves to ${options.scenarioDir})` : ' (add "scenarioDirs" to the config file to save from the editor)'}`);
  console.log(`  reports:   ${out}`);
  console.log(`  baseline:  ${options.baselinePath}`);
  if (!["127.0.0.1", "::1", "localhost"].includes(host)) {
    console.error(`warning: listening on ${host}${isIP(host) ? "" : " (a host name)"}; anyone who can reach it can run agents and write reports, scenarios, and the baseline here.`);
  }
  console.log("Press Ctrl+C to stop.");
  await new Promise<void>((resolveStop) => {
    process.once("SIGINT", () => resolveStop());
    process.once("SIGTERM", () => resolveStop());
  });
  await server!.close();
  return 0;
}

function cmdInit(): number {
  const { created, skipped } = initProject();
  for (const path of created) console.log(`created  ${path}`);
  for (const { path, reason } of skipped) console.log(`skipped  ${path} (${reason})`);
  if (created.length === 0) {
    console.log("Nothing to do: the starter files are already here.");
    return 0;
  }
  console.log(`
Next steps:
  agentcrucible validate   check the scenario files
  agentcrucible run        run the "project" scenarios against agents/my-agent.mjs
  agentcrucible check      confirm every scenario's expected_verdicts
  agentcrucible ui         browse, run, compare, and edit scenarios in a browser`);
  if (skipped.some((s) => s.path === "agentcrucible.config.json")) {
    console.log('\nYour config file was left unchanged. To use the starter files, add "scenarios" to its scenarioDirs and set agent to "./agents/my-agent.mjs".');
  }
  return 0;
}

/** JSON Schema for scenario files, with the registry's worlds and fault kinds (extensions included). */
async function cmdSchema(flags: Flags): Promise<number> {
  const { registry } = await context(flags);
  console.log(JSON.stringify(scenarioJsonSchema(registry), null, 2));
  return 0;
}

function cmdCompletion(_flags: Flags, shell?: string): number {
  if (!(COMPLETION_SHELLS as readonly string[]).includes(shell ?? "")) throw new UsageError(`completion needs a shell: agentcrucible completion <${COMPLETION_SHELLS.join("|")}>`);
  const commands = Object.entries(COMMANDS).map(([name, c]) => ({ name, description: c.description, flags: Object.keys(c.flags) }));
  process.stdout.write(completionScript(shell as CompletionShell, commands, VERDICTS));
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

const HELP = `agentcrucible ${VERSION}: fault-injection tests for tool-using agents, in mock worlds

Usage: agentcrucible <command> [options]

Commands:
  demo        Run the scenario's expected agents side by side and explain each verdict
  list        List scenarios (--tag <tag>, --json)
  run         Run one or more agents against scenarios and write reports
  compare     Run several agents on one scenario with the same seed
  check       Verify each scenario's expected_verdicts against the registered agents
  sweep       Inject every fault kind at every step of an agent's path and score how many runs end safe
  coverage    Show which tools, fault kinds, and agents the scenarios cover, and what nothing covers
  inspect     Show a saved report call by call (inspect <report.json> [--trial n] [--call call_2])
  replay      Re-execute a saved report's tool calls and confirm they reproduce (replay <report.json>)
  validate    Check scenario files without running them (validate [file or directory])
  mcp         Serve a scenario's tools to an MCP client over stdio, then grade the answer it submits
  ui          Browse, run, compare, and edit scenarios in a local web UI
  init        Write a starter config, scenario, and agent into the current directory
  agents      List agents (built-in and from extensions; --json)
  worlds      List mock worlds with their tools and record kinds (--json)
  faults      List fault kinds (--json)
  config      Show the config file in use
  schema      Print the JSON Schema for scenario files (with --config, including extension worlds and faults)
  completion  Print a completion script (completion bash|zsh|fish)
  examples    Print example commands
  version     Print the version

run options:
  --scenario <id>        Exact id, or leading/trailing path segments ("payments", "rate-limit")
  --tag <tag>            All scenarios with this tag
  --agent <id|path>      Registered agent, a module whose default export is your agent, or a model:
                         openai:<model>, anthropic:<model>, ollama:<model> (default: config "agent" or naive-retry)
  --agents a,b,./x.mjs   Several agents: every scenario runs against each, with reports in <out>/<agent>/
  --trials <n>           Trials per scenario, 1-10000 (default 1)
  --seed <text>          Seed for fault selection (default: seed-<scenario id>)
  --fuzz-call <a-b>      Fault one seeded call index in a..b per trial instead of the scenario's schedule
  --timeout <ms>         Fail the run when a trial takes longer; the agent's ctx.signal aborts at the limit
  --concurrency <n>      Scenario-and-agent runs in flight at once, 1-${MAX_CONCURRENCY} (default 1; results do not change)
  --out <dir>            Report directory (default .agentcrucible/out); also gets index.html and summary.md
  --json                 Print the report as JSON (an array when several scenarios or agents ran)
  --fail-on <verdict>    Exit 2 when a verdict is at least this severe (default SILENT_FAILURE)
  --save-baseline <file> Write the results as a baseline to compare later runs with
  --baseline <file>      Compare with a baseline; exit 2 only for regressions and new failing scenarios
  --github               Also print GitHub Actions annotations and write the step summary (automatic under GITHUB_ACTIONS)
  --config <path>        Use this config file instead of searching the current directory

model agents (run, compare, check, sweep, ui), with OPENAI_API_KEY / ANTHROPIC_API_KEY and optional *_BASE_URL:
  --record <dir>         Record provider responses here and replay them on later runs (no network, no key needed)
  --system <file>        Replace the default system prompt with this file's text
  --max-steps <n>        Tool-calling steps per trial before the agent is stopped (default 12)

compare options: --scenario, --agents a,b,./agent.mjs, --trials, --seed, --timeout, --concurrency, --json, --fail-on, --config
check options:   --scenario, --tag, --trials (default ${CHECK_TRIALS}), --timeout, --concurrency, --json, --config
sweep options:   --scenario <id> (required), --agent, --kinds a,b (default: every fault kind), --steps <n> (default 12),
                 --trials, --seed, --timeout, --concurrency, --out <dir> (sweep.json, sweep.md, sweep.html, cells/), --json, --fail-on, --config
coverage options: --tag, --json, --config
mcp options:     --scenario <id> (required), --seed <text>, --out <dir> to write the report, --agent-id <name> (default mcp-client), --config
list options:    --tag, --json, --ids (one id per line), --tags (one tag per line); agents and faults take --ids too
demo options:    --scenario (default ${DEMO_SCENARIO}), --out <dir> to also write reports, --config
inspect options: --trial <n> (default: the worst trial), --call <id>, --scenario <id> for multi-report files
replay options:  --scenario <id>, --json, --config (to load extension worlds and faults)
validate:        a file or directory (default: the bundled and configured scenario directories), --json, --config
ui options:      --port <n> (default ${UI_PORT}, or the next free one), --host <addr> (default 127.0.0.1),
                 --out <dir>, --baseline <file> (default agentcrucible-baseline.json),
                 --agents ./a.mjs,./b.mjs to add agent modules, --fail-on, --config

Verdicts, most to least severe: ${VERDICTS.join(", ")}

Exit status: 0 ok; 1 usage, config, scenario, extension, or agent error, including a trial past --timeout
(validate: a file with errors); 2 a verdict at or above --fail-on (run, compare), a regression against
--baseline (run), an expected verdict that did not hold (check, demo), or a replay that did not reproduce (replay).`;

const EXAMPLES = `# Five agents on the lost-response refund, explained
agentcrucible demo

# Start a project: a config file, a starter scenario, and a starter agent, then run them
agentcrucible init
agentcrucible run

# Browse, run, compare, and edit scenarios in a local web UI
agentcrucible ui

# A refund, a customer email, and a ticket update across three worlds, with the email service down
agentcrucible demo --scenario workflows/notification-outage

# A wrong balance reported as fact, and the agent that cross-checks it
agentcrucible compare --scenario database/silent-wrong-balance --agents gullible-reader,cross-checker

# Your own agent module (default export: async (ctx) => answer)
agentcrucible run --scenario payments/timeout-after-commit --agent ./my-agent.mjs

# Every smoke scenario against three agents at once, four runs in flight, then the Markdown summary
agentcrucible run --tag smoke --agents naive-retry,cross-checker,./my-agent.mjs --concurrency 4 --out reports
cat reports/summary.md

# Save a baseline, then fail CI only when a verdict gets worse
agentcrucible run --tag smoke --agent cross-checker --save-baseline baseline.json
agentcrucible run --tag smoke --agent cross-checker --baseline baseline.json

# Look at a saved run call by call, and re-execute its tool calls
agentcrucible inspect .agentcrucible/out/payments%2Ftimeout-after-commit.report.json --call call_2
agentcrucible replay .agentcrucible/out/payments%2Ftimeout-after-commit.report.json

# Check scenario files without running them, then confirm every expected verdict
agentcrucible validate
agentcrucible check

# Every fault kind at every step of an agent's path, as a kind-by-step table with a resilience score
agentcrucible sweep --scenario workflows/refund-notify-resolve --agent workflow-careful

# Which tools and fault kinds the scenarios cover, and what nothing covers
agentcrucible coverage

# A model-backed agent, with its responses recorded so the next run replays offline
OPENAI_API_KEY=... agentcrucible run --tag smoke --agent openai:gpt-4o-mini --record cassettes --out reports
agentcrucible run --tag smoke --agent openai:gpt-4o-mini --record cassettes --out reports`;

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
