import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { VERDICT_SEVERITY, VERDICTS, type RunReport, type Verdict } from "./types.js";
import { VERSION } from "./version.js";

/** One scenario and agent's result, as recorded in a baseline file. */
export interface BaselineEntry {
  scenario: string;
  agent: string;
  seed: string;
  trials: number;
  verdict: Verdict;
  /** Trials per verdict, omitting verdicts no trial received. */
  byVerdict: Partial<Record<Verdict, number>>;
  /** Rules of the findings that decided each trial's verdict, deduplicated and sorted. */
  rules: string[];
}

/** Results to compare future runs against. It has no timestamps, so it diffs cleanly in review. */
export interface Baseline {
  format: "agentcrucible-baseline";
  version: 1;
  toolVersion: string;
  entries: BaselineEntry[];
}

interface Change {
  scenario: string;
  agent: string;
  before: Verdict;
  after: Verdict;
  rulesAdded: string[];
  rulesRemoved: string[];
}

export interface BaselineComparison {
  /** Verdict became more severe. */
  regressions: Change[];
  /** Verdict became less severe. */
  improvements: Change[];
  /** Same verdict, different deciding rules. */
  changed: Change[];
  unchanged: number;
  /** Ran now, absent from the baseline. */
  added: BaselineEntry[];
  /** In the baseline for an agent that ran, but the scenario was not run. */
  notRun: BaselineEntry[];
  /** Ran with a different seed or trial count than the baseline, so verdicts are not comparable. */
  incomparable: Array<{ scenario: string; agent: string; detail: string }>;
}

export function baselineEntry(report: RunReport): BaselineEntry {
  return {
    scenario: report.scenarioId,
    agent: report.agentId,
    seed: report.seed,
    trials: report.stats.total,
    verdict: report.aggregateVerdict,
    byVerdict: Object.fromEntries(VERDICTS.filter((v) => report.stats.byVerdict[v] > 0).map((v) => [v, report.stats.byVerdict[v]])),
    rules: [...new Set(report.trials.flatMap((t) => t.findings.filter((f) => f.verdict === t.verdict).map((f) => f.rule)))].sort(),
  };
}

export function createBaseline(reports: RunReport[]): Baseline {
  const entries = reports.map(baselineEntry).sort((a, b) => key(a).localeCompare(key(b)));
  return { format: "agentcrucible-baseline", version: 1, toolVersion: VERSION, entries };
}

export function writeBaseline(path: string, baseline: Baseline): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(baseline, null, 2)}\n`);
}

export function readBaseline(path: string): Baseline {
  if (!existsSync(path)) throw new Error(`baseline ${path} not found; create it with --save-baseline ${path}`);
  let parsed: Partial<Baseline>;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`baseline ${path} is not JSON: ${(err as Error).message}`);
  }
  if (parsed?.format !== "agentcrucible-baseline" || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
    throw new Error(`${path} is not an AgentCrucible baseline (expected format "agentcrucible-baseline", version 1)`);
  }
  for (const [i, e] of parsed.entries.entries()) {
    if (typeof e?.scenario !== "string" || typeof e.agent !== "string" || !VERDICTS.includes(e.verdict) || typeof e.seed !== "string" || !Number.isSafeInteger(e.trials)) {
      throw new Error(`${path}: entries[${i}] needs scenario, agent, seed, trials, and a verdict`);
    }
  }
  return parsed as Baseline;
}

/** Compares a run with a baseline, entry by entry (scenario and agent). */
export function compareBaseline(baseline: Baseline, reports: RunReport[]): BaselineComparison {
  const before = new Map(baseline.entries.map((e) => [key(e), e]));
  const result: BaselineComparison = { regressions: [], improvements: [], changed: [], unchanged: 0, added: [], notRun: [], incomparable: [] };
  const seen = new Set<string>();
  for (const now of reports.map(baselineEntry)) {
    seen.add(key(now));
    const old = before.get(key(now));
    if (!old) {
      result.added.push(now);
      continue;
    }
    if (old.seed !== now.seed || old.trials !== now.trials) {
      result.incomparable.push({ scenario: now.scenario, agent: now.agent, detail: `baseline used seed "${old.seed}" and ${old.trials} trial(s); this run used seed "${now.seed}" and ${now.trials}` });
      continue;
    }
    const change: Change = {
      scenario: now.scenario,
      agent: now.agent,
      before: old.verdict,
      after: now.verdict,
      rulesAdded: now.rules.filter((r) => !old.rules.includes(r)),
      rulesRemoved: old.rules.filter((r) => !now.rules.includes(r)),
    };
    const delta = VERDICT_SEVERITY[now.verdict] - VERDICT_SEVERITY[old.verdict];
    if (delta > 0) result.regressions.push(change);
    else if (delta < 0) result.improvements.push(change);
    else if (change.rulesAdded.length || change.rulesRemoved.length) result.changed.push(change);
    else result.unchanged += 1;
  }
  const agents = new Set(reports.map((r) => r.agentId));
  result.notRun = baseline.entries.filter((e) => agents.has(e.agent) && !seen.has(key(e)));
  return result;
}

function key(e: { scenario: string; agent: string }): string {
  return `${e.scenario}\u0000${e.agent}`;
}
