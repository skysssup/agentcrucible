#!/usr/bin/env node
import { runDemo } from "./demo.js";
import { AGENTS } from "./fixtures/agents.js";
import { printReport, writeHtmlReport, writeJsonReport, writeJUnitReport } from "./report.js";
import { runScenario } from "./runner.js";
import { findScenarios, loadAllScenarios } from "./scenarios.js";
import { listWorlds } from "./worlds/index.js";
import { isCritical } from "./verdict.js";

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
    case "help":
    case undefined:
      printHelp();
      return cmd === "help" ? 0 : 1;
    default:
      console.error(`Unknown command: ${cmd}`);
      printHelp();
      return 1;
  }
}

function printHelp(): void {
  console.log(`agentcrucible — pre-deploy fault injection for AI agents

Usage:
  agentcrucible demo
  agentcrucible list [--tag <tag>]
  agentcrucible run --scenario <id> --agent <id> [options]
  agentcrucible agents
  agentcrucible worlds

Run options:
  --scenario <id>     Scenario id (e.g. payments/timeout-after-commit)
  --agent <id>        Scripted agent (naive-retry|idempotent-retry|honest-stop|liar|gullible-reader)
  --tag <tag>         Run all scenarios with tag
  --trials <n>        Multi-trial flaky detection (default 1)
  --seed <s>          Deterministic seed
  --fuzz-call <lo-hi> Property-based call targeting, e.g. 1-3
  --out <dir>         Write report.json / report.html / junit.xml
  --json              Print JSON report to stdout
`);
}

function cmdList(args: string[]): number {
  const tag = flag(args, "--tag");
  const all = tag ? findScenarios({ tag }) : loadAllScenarios();
  for (const s of all) {
    console.log(`${s.id.padEnd(36)} [${s.tags.join(", ")}]  ${s.world}`);
    console.log(`  ${s.description.trim().split("\n")[0]}`);
  }
  console.log(`\n${all.length} scenarios`);
  return 0;
}

async function cmdRun(args: string[]): Promise<number> {
  const scenarioId = flag(args, "--scenario");
  const tag = flag(args, "--tag");
  const agentId = flag(args, "--agent") ?? "naive-retry";
  const trials = Number(flag(args, "--trials") ?? "1");
  const seed = flag(args, "--seed");
  const out = flag(args, "--out") ?? ".agentcrucible/out";
  const asJson = args.includes("--json");
  const fuzz = flag(args, "--fuzz-call");
  let fuzzCallRange: [number, number] | undefined;
  if (fuzz) {
    const [lo, hi] = fuzz.split("-").map(Number);
    fuzzCallRange = [lo, hi];
  }

  const scenarios = scenarioId
    ? findScenarios({ id: scenarioId })
    : tag
      ? findScenarios({ tag })
      : [];
  if (scenarios.length === 0) {
    console.error("No scenarios matched. Use --scenario or --tag.");
    return 1;
  }

  let exit = 0;
  for (const scenario of scenarios) {
    const report = await runScenario({
      scenario,
      agentId,
      seed: seed ?? undefined,
      trials,
      fuzzCallRange,
    });
    if (asJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printReport(report);
    }
    writeJsonReport(report, out);
    writeHtmlReport(report, out);
    writeJUnitReport(report, out);
    if (isCritical(report.aggregateVerdict)) exit = 2;
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
