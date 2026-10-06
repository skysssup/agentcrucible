/**
 * The JSON contract between the UI server and the browser. The server builds these values; the
 * client imports the types only, so nothing here may depend on Node.
 */
import type { Baseline, BaselineComparison } from "../baseline.js";
import type { Budget, Verdict } from "../types.js";
import type { SweepCell, SweepSummary } from "../sweep.js";

/** A scenario in the API's lists (GET /api/scenarios). */
export interface ScenarioSummary {
  id: string;
  worlds: string[];
  tags: string[];
  description: string;
  task: string;
  /** Each fault as one line: "timeout_after_commit on create_refund call 1". */
  faults: string[];
  /** The fault kinds the scenario injects, in order. */
  faultKinds?: string[];
  hasExpect: boolean;
  outcomes: Array<{ name: string; verdict: "SAFE_SUCCESS" | "SAFE_FAILURE" }>;
  invariants: number;
  answerChecks: number;
  budget: Budget;
  expectedVerdicts: Record<string, Verdict>;
  /** The file, relative to its scenario root's parent, or null for an inline scenario. */
  source: string | null;
  bundled: boolean;
}

/**
 * One result in the API's lists: a report's summary, or the error that kept a saved file from
 * loading. Keys say where the full report lives: `mem-N` (this session), `file:<path>` (saved),
 * `hist:<run>:<i>` (a run kept in the workspace history), or `sweep:<sweep>:<i|base>`.
 */
export interface ReportSummary {
  key: string;
  file?: string;
  error?: string;
  /** The verdict the scenario's expected_verdicts lists for this agent, or null. */
  expected?: Verdict | null;
  scenarioId?: string;
  agentId?: string;
  worlds?: string[];
  verdict?: Verdict;
  reason?: string;
  rule?: string;
  trials?: number;
  byVerdict?: Partial<Record<Verdict, number>>;
  seed?: string;
  toolVersion?: string;
  finishedAt?: string;
  /** Rules of every finding of the worst trial, most severe first. */
  rules?: string[];
  /** Fault kinds in the schedule the run used. */
  faultKinds?: string[];
  /** Trials in which at least one scheduled fault fired. */
  faultsFired?: number;
  /** Tool calls in the worst trial. */
  calls?: number;
  /** Committed state-changing calls in the worst trial. */
  mutations?: number;
  durationMs?: number;
  tags?: string[];
  /** Hash of the scenario the run used, to tell whether it changed since. */
  scenarioHash?: string;
}

/** One run: what was asked for and a summary of each report it produced (POST /api/run, GET /api/runs). */
export interface RunRecord {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  scenarios: string[];
  /** The agents asked for, or null when each scenario ran the agents in its expected_verdicts. */
  agents: string[] | null;
  trials: number;
  seed: string | null;
  /** True for a run of the editor's unsaved text. */
  draft: boolean;
  /** Who started the run: the workspace profile's name at the time. */
  actor?: string;
  /** "ui" for runs started here, "demo" for the generated demo history, "import" for imported history. */
  origin?: "ui" | "demo" | "import";
  /** A label given when the run was started, such as "Nightly regression". */
  label?: string;
  /** The version of the agent under test, when the run was started with one. */
  version?: string;
  /** True for runs loaded from the workspace history rather than started in this server session. */
  archived?: boolean;
  /** The editor text a draft run used, kept so its reports can be regenerated. The API leaves it out. */
  draftText?: string;
  results: ReportSummary[];
}

/** One sweep, as POST /api/sweep answers it and GET /api/sweep returns it. */
export interface SweepResponse extends SweepSummary {
  sweepId: string;
  /** Key of the report of the run without faults. */
  baselineKey: string;
  /** The cells in the order of `SweepSummary.cells`, each with the key of its report. */
  cells: Array<SweepCell & { key: string }>;
  actor?: string;
  archived?: boolean;
}

/** An entry of GET /api/sweeps: a sweep without its cells. */
export type SweepListItem = Omit<SweepResponse, "cells"> & { cellCount: number };

/** POST /api/validate: the draft's summary and expectations, or why it is not a valid scenario. */
export type Validation = { ok: true; summary: ScenarioSummary; expect: string[] } | { ok: false; error: string };

export type ActivityCategory = "runs" | "regressions" | "baseline" | "scenarios" | "reports" | "sweeps" | "system";
export type ActivitySeverity = "critical" | "warning" | "success" | "info";

/** Something that happened in the workspace; the notification center shows the ones with `notify`. */
export interface ActivityEvent {
  id: string;
  at: string;
  type: string;
  category: ActivityCategory;
  severity: ActivitySeverity;
  actor: string;
  title: string;
  detail?: string;
  /** A page of the UI, as a hash route. */
  link?: string;
  notify: boolean;
  read?: boolean;
  dismissed?: boolean;
  /** Counts and ids the views use, such as { results: 15, unexpected: 1 }. */
  data?: Record<string, unknown>;
}

export interface NotificationList {
  unread: number;
  items: ActivityEvent[];
}

export interface Profile {
  name: string;
  role: string;
  email: string;
  /** One of the avatar colors, by name. */
  color: string;
  createdAt: string;
}

/** A run or sweep the server is working on (POST /api/jobs/run, POST /api/jobs/sweep, GET /api/jobs). */
export interface Job {
  jobId: string;
  kind: "run" | "sweep";
  status: "running" | "done" | "failed";
  label: string;
  detail: string;
  total: number;
  done: number;
  startedAt: string;
  finishedAt?: string;
  runId?: string;
  sweepId?: string;
  error?: string;
  /** Results so far, in order, for a run. */
  results?: ReportSummary[];
  /** Cells so far, in order, for a sweep. */
  cells?: SweepCell[];
}

/** GET /api/system: the server, the session, and what the workspace is connected to. Never secret values. */
export interface SystemInfo {
  version: string;
  node: string;
  platform: string;
  pid: number;
  startedAt: string;
  url: string;
  host: string;
  loopback: boolean;
  /** The first characters of the session token, to tell sessions apart. */
  tokenFingerprint: string;
  history: { enabled: boolean; path: string | null; runs: number; sweeps: number; events: number; bytes: number };
  config: { path: string | null; values: Record<string, unknown> };
  limits: { timeoutMs: number | null; concurrency: number; memoryReports: number; keptRuns: number; keptSweeps: number };
  providers: Array<{ id: string; label: string; configured: boolean; variable: string }>;
  ci: { workflows: string[] };
  demo: boolean;
}

/** GET /api/baseline. */
export interface BaselineInfo {
  path: string;
  baseline: Baseline | null;
  error?: string;
}

/** A report as GET /api/report returns it for history keys: the report, regenerated from its seed. */
export interface Regeneration {
  /** True when the regenerated verdicts equal the recorded ones. */
  matches: boolean;
  /** True when the scenario file changed since the run, so the report reflects the current file. */
  scenarioChanged: boolean;
  recordedVerdict?: Verdict;
}

export type Comparison = BaselineComparison;
