#!/usr/bin/env node
import { accessSync, constants, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { isIP } from "node:net";
import { join } from "node:path";
import { compareBaseline, createBaseline, readBaseline, writeBaseline, type BaselineComparison } from "./baseline.js";
import { findConfigPath, loadConfig, loadConfigFile, type CrucibleConfig } from "./config.js";
import { DEMO_SCENARIO, runDemo } from "./demo.js";
import type { RunIndexEntry } from "./html.js";
import { initProject } from "./init.js";
import { formatTrialDetail, painter, printReport, readReportFile, shouldColor, worstTrial, writeHtmlReport, writeJsonReport, writeJUnitReport, writeRunIndex } from "./report.js";
import { builtinRegistry, isModulePath, loadAgentModule, loadExtension, type Registry } from "./registry.js";
import { replayReport } from "./replay.js";
import { parseTrials, runScenario } from "./runner.js";
import { bundledScenariosDir, findScenarios, loadAllScenarios, loadScenarioFile, scenarioFiles } from "./scenarios.js";
import { VERDICTS, type RunReport, type Scenario, type Verdict } from "./types.js";
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
  flags: FlagSpec;
  /** Name of the one positional argument the command takes, if any. */
  positional?: string;
  /** The positional argument may be left out. */
  optional?: boolean;
  run: (flags: Flags, positional?: string) => Promise<number> | number;
}

const SELECT: FlagSpec = { "--scenario": "value", "--tag": "value", "--config": "value" };
const COMMANDS: Record<string, Command> = {
  demo: { flags: { "--scenario": "value", "--out": "value", "--config": "value" }, run: cmdDemo },
  list: { flags: { "--tag": "value", "--config": "value" }, run: cmdList },
  run: {
    flags: {
      ...SELECT,
      "--agent": "value",
      "--trials": "value",
      "--seed": "value",
      "--fuzz-call": "value",
      "--out": "value",
      "--json": "boolean",
      "--fail-on": "value",
      "--baseline": "value",
      "--save-baseline": "value",
    },
    run: cmdRun,
  },
  compare: {
    flags: { "--scenario": "value", "--agents": "value", "--trials": "value", "--seed": "value", "--json": "boolean", "--fail-on": "value", "--config": "value" },
    run: cmdCompare,
  },
  check: { flags: { ...SELECT, "--trials": "value", "--json": "boolean" }, run: cmdCheck },
  inspect: { flags: { "--trial": "value", "--call": "value", "--scenario": "value" }, positional: "report", run: cmdInspect },
  replay: { flags: { "--scenario": "value", "--json": "boolean", "--config": "value" }, positional: "report", run: cmdReplay },
  validate: { flags: { "--json": "boolean", "--config": "value" }, positional: "path", optional: true, run: cmdValidate },
  ui: {
    flags: { "--port": "value", "--host": "value", "--out": "value", "--baseline": "value", "--agents": "value", "--fail-on": "value", "--config": "value" },
    run: cmdUi,
  },
  init: { flags: {}, run: cmdInit },
  agents: { flags: { "--config": "value" }, run: cmdAgents },
  worlds: { flags: { "--config": "value" }, run: cmdWorlds },
  faults: { flags: { "--config": "value" }, run: cmdFaults },
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

/** The config file (from --config or the working directory) and a registry with its extensions loaded. */
async function context(flags: Flags): Promise<{ cfg: CrucibleConfig; registry: Registry }> {
  const path = str(flags, "--config");
  const cfg = path ? loadConfigFile(path) : loadConfig();
  let registry = builtinRegistry();
  for (const extension of cfg.extensions ?? []) registry = await loadExtension(registry, extension);
  return { cfg, registry };
}

/** A registered agent id, or a module path that is loaded and registered under its file name. */
async function resolveAgent(value: string, registry: Registry, from = "--agent"): Promise<{ registry: Registry; id: string }> {
  if (isModulePath(value)) return loadAgentModule(registry, value);
  if (!registry.agents.has(value)) {
    throw new UsageError(
      `${from === "config" ? `config agent "${value}" is not a registered agent` : `unknown agent "${value}"`} (available: ${[...registry.agents.keys()].join(", ")}; or give a module path such as ./my-agent.mjs)`
    );
  }
  return { registry, id: value };
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
  const { registry, id: agent } = await resolveAgent(agentFlag ?? cfg.agent ?? "naive-retry", ctx.registry, agentFlag === undefined && cfg.agent ? "config" : "--agent");
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
  const baselinePath = str(flags, "--baseline");
  const baseline = baselinePath ? readBaseline(baselinePath) : undefined;
  const scenarios = selectScenarios(flags, cfg, registry, cfg.defaultTag);
  ensureWritableDir(out);

  const reports: RunReport[] = [];
  for (const scenario of scenarios) {
    const report = await runScenario({ scenario, agentId: agent, seed, trials: trialCount, fuzzCallRange, registry });
    reports.push(report);
    writeJsonReport(report, out);
    writeHtmlReport(report, out);
    writeJUnitReport(report, out, threshold);
    if (!asJson) printReport(report);
  }
  const log = asJson ? (line = "") => console.error(line) : (line = "") => console.log(line);
  const savePath = str(flags, "--save-baseline");
  if (savePath) {
    writeBaseline(savePath, createBaseline(reports));
    log(`Baseline written to ${savePath} (${reports.length} entr${reports.length === 1 ? "y" : "ies"})`);
  }
  const failing = reports.filter((r) => atLeast(r.aggregateVerdict, threshold));
  const comparison = baseline ? compareBaseline(baseline, reports) : undefined;
  writeRunIndex(
    reports.map((report) => ({ report, ...(comparison ? { change: baselineChange(comparison, report, threshold) } : {}) })),
    out,
    `AgentCrucible run: ${reports.length === 1 ? reports[0].scenarioId : `${reports.length} scenarios`} (agent ${agent})`,
    threshold
  );
  if (asJson) console.log(JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2));
  else if (reports.length > 1) printSummary(reports, threshold);
  if (!asJson) console.log(`Reports written to ${out}/ (index.html, *.report.json, *.report.html, *.junit.xml)`);

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
    console.log(
      failing.length
        ? `${failing.length} of ${reports.length} scenario(s) at or above --fail-on ${threshold}: exit 2`
        : `No scenario at or above --fail-on ${threshold}: exit 0`
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

async function cmdCompare(flags: Flags): Promise<number> {
  const ctx = await context(flags);
  let { registry } = ctx;
  const id = str(flags, "--scenario");
  if (!id) throw new UsageError("compare needs --scenario <id>");
  const agents: string[] = [];
  for (const value of (str(flags, "--agents") ?? "naive-retry,honest-stop,idempotent-retry,cross-checker").split(",").map((a) => a.trim()).filter(Boolean)) {
    const resolved = await resolveAgent(value, registry);
    registry = resolved.registry;
    agents.push(resolved.id);
  }
  const scenarios = findScenarios({ id, root: scenarioRoots(ctx.cfg), registry });
  if (scenarios.length !== 1) {
    throw new UsageError(
      scenarios.length === 0
        ? `no scenario matches "${id}"; run "agentcrucible list"`
        : `"${id}" matches ${scenarios.length} scenarios (${scenarios.map((s) => s.id).join(", ")}); give the full id`
    );
  }
  const [scenario] = scenarios;
  const trialCount = trials(flags, ctx.cfg);
  const threshold = failOn(flags, ctx.cfg);
  const seed = str(flags, "--seed") ?? ctx.cfg.seed ?? "compare";
  const reports: RunReport[] = [];
  for (const agent of agents) {
    reports.push(await runScenario({ scenario, agentId: agent, seed, trials: trialCount, registry }));
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
  const { cfg, registry } = await context(flags);
  const scenarios = selectScenarios(flags, cfg, registry);
  const trialCount = str(flags, "--trials") === undefined ? CHECK_TRIALS : trials(flags, cfg);
  const rows: Array<{ scenarioId: string; agentId: string; expected: Verdict; actual: Verdict; unexercisedFaults: number[]; ok: boolean }> = [];
  for (const scenario of scenarios) {
    for (const [agent, expected] of Object.entries(scenario.expectedVerdicts)) {
      const report = await runScenario({ scenario, agentId: agent, trials: trialCount, registry });
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
      const problems = [...(r.actual === r.expected ? [] : [`expected ${r.expected}`]), ...r.unexercisedFaults.map((i) => `faults[${i}] never fired`)];
      console.log(`${r.ok ? "ok  " : paint("bold", "FAIL")} ${r.scenarioId} ${r.agentId}: ${paint(r.actual, r.actual)}${problems.length ? ` (${problems.join("; ")})` : ""}`);
    }
    const unchecked = scenarios.filter((s) => Object.keys(s.expectedVerdicts).length === 0).map((s) => s.id);
    if (unchecked.length) console.log(`no expected_verdicts: ${unchecked.join(", ")}`);
    console.log(`${rows.length - failed.length}/${rows.length} checks pass (trials=${trialCount}, default seeds)`);
  }
  return failed.length ? 2 : 0;
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
  const width = Math.max(...[...registry.agents.keys()].map((a) => a.length));
  for (const [id, entry] of registry.agents) {
    console.log(`${id.padEnd(width)}  ${entry.value.description || "(no description)"}${entry.source === "built-in" ? "" : `  [${entry.source}]`}`);
  }
  return 0;
}

async function cmdWorlds(flags: Flags): Promise<number> {
  const { registry } = await context(flags);
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
  const width = Math.max(...[...registry.faults.keys()].map((k) => k.length));
  for (const [kind, entry] of registry.faults) {
    const params = Object.keys(entry.value.params?.properties ?? {});
    console.log(
      `${kind.padEnd(width)}  ${entry.value.stage === "before" ? "before" : "after "}  ${entry.value.description}${params.length ? ` (params: ${params.join(", ")})` : ""}${entry.source === "built-in" ? "" : `  [${entry.source}]`}`
    );
  }
  console.log("\nbefore: the call does not run. after: the call runs, then the agent sees a changed response.");
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

/** Serves the local UI until interrupted. */
async function cmdUi(flags: Flags): Promise<number> {
  const ctx = await context(flags);
  let { registry } = ctx;
  const modules = [...(ctx.cfg.agent && isModulePath(ctx.cfg.agent) ? [ctx.cfg.agent] : []), ...(str(flags, "--agents") ?? "").split(",").map((a) => a.trim()).filter(Boolean)];
  for (const value of new Set(modules)) registry = (await resolveAgent(value, registry)).registry;
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
  list        List scenarios (--tag <tag>)
  run         Run one agent against scenarios and write reports
  compare     Run several agents on one scenario with the same seed
  check       Verify each scenario's expected_verdicts against the registered agents
  inspect     Show a saved report call by call (inspect <report.json> [--trial n] [--call call_2])
  replay      Re-execute a saved report's tool calls and confirm they reproduce (replay <report.json>)
  validate    Check scenario files without running them (validate [file or directory])
  ui          Browse, run, compare, and edit scenarios in a local web UI
  init        Write a starter config, scenario, and agent into the current directory
  agents      List agents (built-in and from extensions)
  worlds      List mock worlds with their tools and record kinds
  faults      List fault kinds
  config      Show the config file in use
  examples    Print example commands
  version     Print the version

run options:
  --scenario <id>        Exact id, or leading/trailing path segments ("payments", "rate-limit")
  --tag <tag>            All scenarios with this tag
  --agent <id|path>      Registered agent, or a module whose default export is your agent
                         (default: config "agent" or naive-retry)
  --trials <n>           Trials per scenario, 1-10000 (default 1)
  --seed <text>          Seed for fault selection (default: seed-<scenario id>)
  --fuzz-call <a-b>      Fault one seeded call index in a..b per trial instead of the scenario's schedule
  --out <dir>            Report directory (default .agentcrucible/out)
  --json                 Print the report as JSON (an array when several scenarios ran)
  --fail-on <verdict>    Exit 2 when a verdict is at least this severe (default SILENT_FAILURE)
  --save-baseline <file> Write the results as a baseline to compare later runs with
  --baseline <file>      Compare with a baseline; exit 2 only for regressions and new failing scenarios
  --config <path>        Use this config file instead of searching the current directory

compare options: --scenario, --agents a,b,./agent.mjs, --trials, --seed, --json, --fail-on, --config
check options:   --scenario, --tag, --trials (default ${CHECK_TRIALS}), --json, --config
demo options:    --scenario (default ${DEMO_SCENARIO}), --out <dir> to also write reports, --config
inspect options: --trial <n> (default: the worst trial), --call <id>, --scenario <id> for multi-report files
replay options:  --scenario <id>, --json, --config (to load extension worlds and faults)
validate:        a file or directory (default: the bundled and configured scenario directories), --json, --config
ui options:      --port <n> (default ${UI_PORT}, or the next free one), --host <addr> (default 127.0.0.1),
                 --out <dir>, --baseline <file> (default agentcrucible-baseline.json),
                 --agents ./a.mjs,./b.mjs to add agent modules, --fail-on, --config

Verdicts, most to least severe: ${VERDICTS.join(", ")}

Exit status: 0 ok; 1 usage, config, scenario, or extension error (validate: a file with errors);
2 a verdict at or above --fail-on
(run, compare), a regression against --baseline (run), an expected verdict that did not hold
(check, demo), or a replay that did not reproduce (replay).`;

const EXAMPLES = `# Five agents on the lost-response refund, explained
agentcrucible demo

# A refund, a customer email, and a ticket update across three worlds, with the email service down
agentcrucible demo --scenario workflows/notification-outage

# A wrong balance reported as fact, and the agent that cross-checks it
agentcrucible compare --scenario database/silent-wrong-balance --agents gullible-reader,cross-checker

# Your own agent module (default export: async (ctx) => answer)
agentcrucible run --scenario payments/timeout-after-commit --agent ./my-agent.mjs

# Save a baseline, then fail CI only when a verdict gets worse
agentcrucible run --tag smoke --agent cross-checker --save-baseline baseline.json
agentcrucible run --tag smoke --agent cross-checker --baseline baseline.json

# Look at a saved run call by call, and re-execute its tool calls
agentcrucible inspect .agentcrucible/out/payments%2Ftimeout-after-commit.report.json --call call_2
agentcrucible replay .agentcrucible/out/payments%2Ftimeout-after-commit.report.json

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
