/**
 * The Reports page's data: every result the workspace knows (runs, this session, saved files)
 * once each, the filters the page and its links apply, and the exports. Pure functions.
 */
import { VERDICT_SEVERITY, VERDICTS, type Verdict } from "../../../types.js";
import type { ReportSummary, RunRecord } from "../../api.js";
import { isCritical, isFlaky, isUnexpected, isSafe } from "./analytics.js";
import { csv, withQuery } from "./format.js";

/** Where a result's full report lives: a saved file, this server session's memory, or the workspace history. */
export type ResultSource = "saved" | "session" | "history";

export const SOURCES: ResultSource[] = ["saved", "session", "history"];

export function sourceOf(key: string): ResultSource {
  return key.startsWith("file:") ? "saved" : key.startsWith("mem-") ? "session" : "history";
}

export interface ResultRow {
  /** The key the report page opens: the history or session key, or the saved file's when only that exists. */
  key: string;
  scenarioId: string;
  agentId: string;
  verdict: Verdict;
  expected: Verdict | null;
  reason: string;
  rule: string;
  rules: string[];
  trials: number;
  byVerdict: Partial<Record<Verdict, number>>;
  faultKinds: string[];
  /** When the result was produced: its run's start, or the report's finish time. */
  at: string;
  source: ResultSource;
  /** The saved file of this result (itself, or a copy of it), and its key. */
  file?: string;
  savedKey?: string;
  run?: { runId: string; label?: string; version?: string };
  unexpected: boolean;
  critical: boolean;
  flaky: boolean;
}

export interface ResultList {
  rows: ResultRow[];
  /** Saved files that could not be read, with the reason. */
  unreadable: ReportSummary[];
}

/** The identity of a result across copies: a saved report and the run it came from share it. */
function identity(r: Pick<ReportSummary, "scenarioId" | "agentId" | "seed" | "trials" | "finishedAt">): string {
  return [r.scenarioId, r.agentId, r.seed, r.trials, r.finishedAt].join("\n");
}

/**
 * Every result once: the runs' results first, then this session's, then saved files that no run
 * accounts for. A saved copy of a run's result is not a second result; it marks the first as saved.
 */
export function resultList(runs: RunRecord[], memory: ReportSummary[], saved: ReportSummary[]): ResultList {
  const rows = new Map<string, ResultRow>();
  const unreadable: ReportSummary[] = [];
  const add = (r: ReportSummary, run?: RunRecord) => {
    if (r.error) {
      unreadable.push(r);
      return;
    }
    if (!r.verdict || !r.scenarioId || !r.agentId) return;
    const id = identity(r);
    const found = rows.get(id);
    if (found) {
      if (r.file && !found.file) {
        found.file = r.file;
        found.savedKey = r.key;
      }
      return;
    }
    const row: ResultRow = {
      key: r.key,
      scenarioId: r.scenarioId,
      agentId: r.agentId,
      verdict: r.verdict,
      expected: r.expected ?? null,
      reason: r.reason ?? "",
      rule: r.rule ?? "",
      rules: r.rules ?? (r.rule ? [r.rule] : []),
      trials: r.trials ?? 1,
      byVerdict: r.byVerdict ?? { [r.verdict]: r.trials ?? 1 },
      faultKinds: r.faultKinds ?? [],
      at: run?.startedAt ?? r.finishedAt ?? "",
      source: sourceOf(r.key),
      ...(r.file ? { file: r.file, savedKey: r.key } : {}),
      ...(run ? { run: { runId: run.runId, ...(run.label ? { label: run.label } : {}), ...(run.version ? { version: run.version } : {}) } } : {}),
      unexpected: false,
      critical: isCritical(r.verdict),
      flaky: (r.trials ?? 1) > 1 && isFlaky(r),
    };
    row.unexpected = isUnexpected(row);
    rows.set(id, row);
  };
  for (const run of runs) for (const r of run.results) add(r, run);
  for (const r of memory) add(r);
  for (const r of saved) add(r);
  return { rows: [...rows.values()], unreadable };
}

/** The keys a delete removes for a result: its saved file, or its session copy. History results stay. */
export function deletableKey(row: ResultRow): string | undefined {
  return row.savedKey ?? (row.source === "session" ? row.key : undefined);
}

export interface ReportFilters {
  q: string;
  /** A verdict, "critical" (HARMFUL_ACTION or SILENT_FAILURE), or "" for all. */
  verdict: string;
  unexpected: boolean;
  flaky: boolean;
  rule: string;
  agent: string;
  scenario: string;
  source: ResultSource | "";
}

export const NO_FILTERS: ReportFilters = { q: "", verdict: "", unexpected: false, flaky: false, rule: "", agent: "", scenario: "", source: "" };

/** The filters a link to #/reports names. Unknown values are ignored. */
export function parseFilters(query: URLSearchParams): ReportFilters {
  const verdict = query.get("verdict") ?? "";
  const source = query.get("source") ?? "";
  return {
    q: query.get("q") ?? "",
    verdict: verdict === "critical" || (VERDICTS as readonly string[]).includes(verdict) ? verdict : "",
    unexpected: query.get("unexpected") === "1",
    flaky: query.get("flaky") === "1",
    rule: query.get("rule") ?? "",
    agent: query.get("agent") ?? "",
    scenario: query.get("scenario") ?? "",
    source: (SOURCES as string[]).includes(source) ? (source as ResultSource) : "",
  };
}

/** The address of the Reports page with the filters applied; the inverse of `parseFilters`. */
export function filtersHref(f: ReportFilters): string {
  return withQuery("#/reports", { q: f.q.trim() || undefined, verdict: f.verdict, unexpected: f.unexpected ? 1 : undefined, flaky: f.flaky ? 1 : undefined, rule: f.rule, agent: f.agent, scenario: f.scenario, source: f.source });
}

export function activeFilters(f: ReportFilters): number {
  return [f.q.trim(), f.verdict, f.unexpected, f.flaky, f.rule, f.agent, f.scenario, f.source].filter(Boolean).length;
}

/** Results that match every word of the search and every filter. */
export function filterResults(rows: ResultRow[], f: ReportFilters): ResultRow[] {
  const words = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((r) => {
    if (f.verdict === "critical" ? !r.critical : f.verdict && r.verdict !== f.verdict) return false;
    if ((f.unexpected && !r.unexpected) || (f.flaky && !r.flaky)) return false;
    if (f.rule && !r.rules.includes(f.rule)) return false;
    if ((f.agent && r.agentId !== f.agent) || (f.scenario && r.scenarioId !== f.scenario) || (f.source && r.source !== f.source)) return false;
    if (!words.length) return true;
    const text = `${r.scenarioId} ${r.agentId} ${r.verdict} ${r.rules.join(" ")} ${r.reason} ${r.file ?? ""} ${r.run?.runId ?? ""} ${r.run?.label ?? ""} ${r.run?.version ? `v${r.run.version}` : ""}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

/** Results that differ from their expected verdict or that are HARMFUL_ACTION or SILENT_FAILURE, differences first, in the order given. */
export function needsAttention<T extends Pick<ResultRow, "unexpected" | "critical">>(rows: T[]): T[] {
  const attention = rows.filter((r) => r.unexpected || r.critical);
  return [...attention.filter((r) => r.unexpected), ...attention.filter((r) => !r.unexpected)];
}

/** How many results each verdict has among `rows`, for the filter counts. */
export function verdictCounts(rows: ResultRow[]): Record<string, number> {
  const out: Record<string, number> = { critical: 0 };
  for (const v of VERDICTS) out[v] = 0;
  for (const r of rows) {
    out[r.verdict]++;
    if (r.critical) out.critical++;
  }
  return out;
}

/** The share of results that ended safe, or null when there are none. */
export function safeShare(rows: ResultRow[]): number | null {
  return rows.length ? rows.filter((r) => isSafe(r.verdict)).length / rows.length : null;
}

/** The most severe verdict first, for sorting. */
export const severity = (r: Pick<ResultRow, "verdict">): number => VERDICT_SEVERITY[r.verdict];

/** The rows as CSV: one line per result, with where it lives and what the scenario expected. */
export function resultsCsv(rows: ResultRow[]): string {
  return csv([["key", "scenario", "agent", "verdict", "expected", "rule", "trials", "source", "run", "at", "reason"], ...rows.map((r) => [r.key, r.scenarioId, r.agentId, r.verdict, r.expected ?? "", r.rule, r.trials, r.source, r.run?.runId ?? "", r.at, r.reason])]);
}
