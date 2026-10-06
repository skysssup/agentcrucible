import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { isIP, type AddressInfo } from "node:net";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { compareBaseline, createBaseline, readBaseline, writeBaseline } from "../baseline.js";
import type { CrucibleConfig } from "../config.js";
import { computeCoverage } from "../coverage.js";
import { DEMO_SCENARIO, DEMO_SEED } from "../demo.js";
import { describeFault, expectParts, worstTrial } from "../describe.js";
import { logo, renderReportHtml } from "../html.js";
import type { Registry } from "../registry.js";
import { replayReport } from "../replay.js";
import { readReportFile, writeHtmlReport, writeJsonReport, writeJUnitReport } from "../report.js";
import { parseTrials, runMatrix, runScenario } from "../runner.js";
import { loadAllScenarios, parseScenario } from "../scenarios.js";
import { DEFAULT_SWEEP_STEPS, parseSweepSteps, runSweep, summarizeSweep, sweepKinds, sweepMarkdown, type SweepCell } from "../sweep.js";
import { VERDICT_SEVERITY, VERDICTS, type FaultSpec, type RunReport, type Scenario, type Verdict } from "../types.js";
import { VERSION } from "../version.js";
import type { ActivityEvent, Job, NotificationList, Regeneration, ReportSummary, RunRecord, ScenarioSummary, SweepListItem, SweepResponse, SystemInfo, Validation } from "./api.js";
import { UI_CSS } from "./styles.js";
import { AVATAR_COLORS, Workspace, type NewEvent } from "./workspace.js";

export type { ReportSummary, RunRecord, ScenarioSummary, SweepListItem, SweepResponse, Validation } from "./api.js";

export interface UiOptions {
  /** Interface to listen on. Default 127.0.0.1; anything else exposes the API to the network. */
  host?: string;
  /** Port; 0 picks a free one. */
  port?: number;
  /** Where saved reports are listed from and saved to. */
  outDir: string;
  /** Scenario directories, bundled first. */
  scenarioRoots: string[];
  /** Directory the editor saves scenarios to (the first configured scenarioDirs entry), if any. */
  scenarioDir?: string;
  /** Baseline file the baseline view reads and writes. */
  baselinePath: string;
  registry: Registry;
  failOn: Verdict;
  /** Milliseconds each trial may take; a run past it fails with an error. */
  timeoutMs?: number;
  /** Scenario-and-agent runs in flight at once (default 1). */
  concurrency?: number;
  /** Directory of the workspace history (runs, sweeps, activity, profile). Without it the history lives in memory. */
  stateDir?: string;
  /** The config file the UI was started with, shown on the Settings page. */
  config?: { path: string | null; values: CrucibleConfig };
  /** True when serving the generated demo workspace. */
  demo?: boolean;
}

export interface UiServer {
  url: string;
  token: string;
  /** The workspace history, for tests and the demo generator. */
  workspace: Workspace;
  close(): Promise<void>;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Lets the client tell errors apart: "exists" means the save needs overwrite: true; "token" means the page is stale. */
    readonly code?: string
  ) {
    super(message);
  }
}

/** Full reports kept in memory so the UI can show them before (or without) saving them. */
const MEMORY_LIMIT = 200;
/** Reports regenerated from the history, kept so reopening one is instant. */
const REGENERATED_LIMIT = 100;
/** Finished jobs listed for the top bar; running ones are always listed. */
const JOB_LIMIT = 20;
const BODY_LIMIT = 1_000_000;
/** An imported workspace file may be larger than other requests. */
const IMPORT_LIMIT = 25_000_000;

type Progress = (done: number, total: number, partial: { result?: ReportSummary; cell?: SweepCell }) => void;

/**
 * Serves the local UI and its JSON API. Every API request must carry the session token from the
 * page (header x-agentcrucible-token), and the Host header must name this server, so other web
 * pages cannot drive it. Nothing is loaded from the network.
 */
export async function startUi(opts: UiOptions): Promise<UiServer> {
  const host = opts.host ?? "127.0.0.1";
  let token = randomBytes(24).toString("hex");
  const startedAt = new Date().toISOString();
  const workspace = new Workspace(opts.stateDir ? join(opts.stateDir, "workspace.json") : undefined);
  const memory = new Map<string, RunReport>();
  /** Where each memory report came from, so an evicted one can be regenerated instead of lost. */
  const origins = new Map<string, string>();
  const regenerated = new Map<string, RunReport & { regeneration: Regeneration }>();
  /** Keys of the reports that sweeps produced; the Reports page does not list them and they cannot be saved. */
  const sweepKeys = new Set<string>();
  const summaryCache = new Map<string, { mtimeMs: number; summary: ReportSummary }>();
  const jobs: Job[] = [];
  let nextReport = 1;
  let nextJob = 1;

  if (workspace.loadError) workspace.addEvent({ type: "workspace.reset", category: "system", severity: "warning", title: "The workspace history could not be read", detail: `${workspace.loadError}. It was moved aside and a new history started.`, notify: true });

  const scenarios = () => loadAllScenarios(opts.scenarioRoots, opts.registry);
  const findScenario = (id: string, all = scenarios()) => {
    const scenario = all.find((s) => s.id === id);
    if (!scenario) throw new HttpError(404, `no scenario with id ${id}`);
    return scenario;
  };
  const summarize = (s: Scenario) => scenarioSummary(s, opts.scenarioRoots);
  const event = (e: NewEvent): ActivityEvent => workspace.addEvent(e);

  const remember = (r: RunReport, origin?: string, limit = MEMORY_LIMIT): string => {
    const key = `mem-${nextReport++}`;
    memory.set(key, r);
    if (origin) origins.set(key, origin);
    while (memory.size > limit) {
      const oldest = memory.keys().next().value!;
      memory.delete(oldest);
      sweepKeys.delete(oldest);
    }
    return key;
  };

  /** A report of the history, run again from its scenario, agent, seed, and trials. */
  const regenerate = async (key: string): Promise<RunReport & { regeneration: Regeneration }> => {
    const cached = regenerated.get(key);
    if (cached) return cached;
    const [kind, id, index] = key.split(":");
    let scenario: Scenario;
    let agentId: string;
    let seed: string;
    let trials: number;
    let recorded: ReportSummary | { verdict: Verdict; byVerdict?: undefined; scenarioHash?: string };
    if (kind === "hist") {
      const run = workspace.runs.find((r) => r.runId === id);
      const result = run?.results[Number(index)];
      if (!run || !result?.scenarioId || !result.agentId || !result.verdict) throw new HttpError(404, `no result ${key} in the workspace history`);
      scenario = run.draft && run.draftText ? parseDraftOr400(run.draftText, opts.registry) : findScenario(result.scenarioId);
      agentId = result.agentId;
      seed = result.seed ?? `seed-${result.scenarioId}`;
      trials = result.trials ?? 1;
      recorded = result;
    } else if (kind === "sweep") {
      const sweep = workspace.sweeps.find((s) => s.sweepId === id);
      if (!sweep) throw new HttpError(404, `no sweep ${id} in the workspace history`);
      const base = findScenario(sweep.scenarioId);
      if (index === "base") {
        scenario = { ...base, faults: [] };
        recorded = { verdict: sweep.baseline.verdict };
      } else {
        const cell = sweep.cells[Number(index)];
        const step = cell && sweep.steps[cell.step - 1];
        if (!cell || !step) throw new HttpError(404, `no cell ${key} in the workspace history`);
        scenario = { ...base, faults: [{ target: step.tool, kind: cell.kind, onCall: step.callIndex } satisfies FaultSpec] };
        recorded = { verdict: cell.verdict };
      }
      agentId = sweep.agentId;
      seed = sweep.seed;
      trials = sweep.trials;
    } else throw new HttpError(400, "report keys start with mem-, file:, hist:, or sweep:");
    if (!opts.registry.agents.has(agentId)) throw new HttpError(404, `agent ${agentId} is not registered in this session, so ${key} cannot be regenerated`);
    const report = await runScenario({ scenario, agentId, seed, trials, registry: opts.registry, ...(opts.timeoutMs === undefined ? {} : { timeoutMs: opts.timeoutMs }) });
    const sameSplit = !recorded.byVerdict || VERDICTS.every((v) => (recorded.byVerdict?.[v] ?? 0) === report.stats.byVerdict[v]);
    const regeneration: Regeneration = {
      matches: report.aggregateVerdict === recorded.verdict && sameSplit,
      scenarioChanged: Boolean(recorded.scenarioHash && recorded.scenarioHash !== scenarioHash(scenario)),
      recordedVerdict: recorded.verdict,
    };
    const value = { ...report, regeneration };
    regenerated.set(key, value);
    if (regenerated.size > REGENERATED_LIMIT) regenerated.delete(regenerated.keys().next().value!);
    return value;
  };

  const report = async (key: string): Promise<RunReport> => {
    if (key.startsWith("mem-")) {
      const found = memory.get(key);
      if (found) return found;
      const origin = origins.get(key);
      if (origin) return regenerate(origin);
      throw new HttpError(404, `run ${key} is no longer in memory; save runs to keep them`);
    }
    if (key.startsWith("hist:") || key.startsWith("sweep:")) return regenerate(key);
    if (!key.startsWith("file:")) throw new HttpError(400, "report keys start with mem-, file:, hist:, or sweep:");
    return readReportFile(reportPath(opts.outDir, key.slice(5)));
  };

  /** Checks a run request and returns the work to do, so a bad request fails before a job starts. */
  const prepareRun = (input: Record<string, unknown>) => {
    const ids = input.text === undefined ? stringList(input.scenarioIds, "scenarioIds") : [];
    const all = ids.length ? scenarios() : [];
    const draftText = input.text !== undefined ? stringField(input.text, "text") : undefined;
    const chosen: Scenario[] = draftText !== undefined ? [parseDraftOr400(draftText, opts.registry)] : ids.map((id) => findScenario(id, all));
    if (chosen.length === 0) throw new HttpError(400, "choose at least one scenario");
    const requested = stringList(input.agents, "agents");
    const agents = requested.length ? requested : undefined;
    for (const id of agents ?? []) if (!opts.registry.agents.has(id)) throw new HttpError(400, `unknown agent ${id}`);
    let trials: number;
    try {
      trials = parseTrials(input.trials ?? 1);
    } catch (err) {
      throw new HttpError(400, (err as Error).message);
    }
    const seed = input.seed === undefined ? undefined : stringField(input.seed, "seed");
    if (seed !== undefined && !seed.trim()) throw new HttpError(400, "seed must be a non-empty string");
    const label = input.label === undefined ? undefined : stringField(input.label, "label").trim().slice(0, 80) || undefined;
    const version = input.version === undefined ? undefined : stringField(input.version, "version").trim().slice(0, 40) || undefined;
    for (const scenario of chosen) {
      if (!agents && Object.keys(scenario.expectedVerdicts).length === 0) throw new HttpError(400, `${scenario.id} lists no expected agents; choose agents to run`);
    }
    const total = chosen.reduce((n, s) => n + (agents ?? Object.keys(s.expectedVerdicts)).length, 0);
    const describe = `${plural(chosen.length, "scenario")} × ${agents ? plural(agents.length, "agent") : "expected agents"} × ${plural(trials, "trial")}`;
    const execute = async (onProgress?: Progress): Promise<RunRecord> => {
      const started = new Date();
      const runId = workspace.nextRunId();
      const results: ReportSummary[] = [];
      await runMatrix({
        scenarios: chosen,
        agents: agents ?? ((s) => Object.keys(s.expectedVerdicts)),
        trials,
        seed,
        registry: opts.registry,
        timeoutMs: opts.timeoutMs,
        concurrency: opts.concurrency,
        onReport: (r, i) => {
          const result: ReportSummary = { key: remember(r, `hist:${runId}:${i}`), ...reportSummary(r), expected: r.scenario.expectedVerdicts[r.agentId] ?? null };
          results.push(result);
          onProgress?.(i + 1, total, { result });
        },
      });
      const finished = new Date();
      const run: RunRecord = {
        runId,
        startedAt: started.toISOString(),
        finishedAt: finished.toISOString(),
        durationMs: finished.getTime() - started.getTime(),
        scenarios: chosen.map((s) => s.id),
        agents: agents ?? null,
        trials,
        seed: seed ?? null,
        draft: draftText !== undefined,
        actor: workspace.profile.name,
        origin: "ui",
        ...(label ? { label } : {}),
        ...(version ? { version } : {}),
        ...(draftText !== undefined ? { draftText } : {}),
        results,
      };
      workspace.addRun(run);
      event(runEvent(run));
      return run;
    };
    return { total, label: label ?? (draftText !== undefined ? `Draft ${chosen[0].id}` : chosen.length === 1 ? chosen[0].id : plural(chosen.length, "scenario")), detail: describe, execute };
  };

  const prepareSweep = (input: Record<string, unknown>) => {
    const scenarioId = stringField(input.scenarioId, "scenarioId");
    const agentId = stringField(input.agentId, "agentId");
    const names = input.kinds === undefined ? undefined : stringList(input.kinds, "kinds");
    const seed = input.seed === undefined ? undefined : stringField(input.seed, "seed");
    if (seed !== undefined && !seed.trim()) throw new HttpError(400, "seed must be a non-empty string");
    let steps: number;
    let trials: number;
    let kindCount: number;
    try {
      steps = parseSweepSteps(input.steps ?? DEFAULT_SWEEP_STEPS);
      trials = parseTrials(input.trials ?? 1);
      kindCount = sweepKinds(opts.registry, names).length;
    } catch (err) {
      throw new HttpError(400, (err as Error).message);
    }
    if (!opts.registry.agents.has(agentId)) throw new HttpError(400, `unknown agent ${agentId}`);
    const scenario = findScenario(scenarioId);
    const execute = async (onProgress?: Progress): Promise<SweepResponse> => {
      let result;
      try {
        result = await runSweep({ scenario, agentId, registry: opts.registry, kinds: names, steps, trials, seed, timeoutMs: opts.timeoutMs, concurrency: opts.concurrency, onCell: (cell, i, total) => onProgress?.(i + 1, total, { cell }) });
      } catch (err) {
        throw new HttpError(400, (err as Error).message);
      }
      const sweepId = workspace.nextSweepId();
      const limit = Math.max(MEMORY_LIMIT, result.cellReports.length + 1);
      const baselineKey = remember(result.baselineReport, `sweep:${sweepId}:base`, limit);
      const cells = result.cells.map((cell, i) => ({ ...cell, key: remember(result.cellReports[i], `sweep:${sweepId}:${i}`, limit) }));
      for (const key of [baselineKey, ...cells.map((c) => c.key)]) sweepKeys.add(key);
      const response: SweepResponse = { sweepId, ...summarizeSweep(result), baselineKey, cells, actor: workspace.profile.name };
      workspace.addSweep(response);
      event(sweepEvent(response));
      return response;
    };
    return { total: kindCount * steps, label: `Sweep ${scenario.id}`, detail: `${agentId} · ${plural(kindCount, "fault kind")} × up to ${plural(steps, "step")}`, execute };
  };

  /** Starts `work` without waiting for it; GET /api/job reports its progress. */
  const startJob = <T extends RunRecord | SweepResponse>(kind: Job["kind"], prepared: { total: number; label: string; detail: string; execute: (p: Progress) => Promise<T> }): Job => {
    const job: Job = { jobId: `job-${nextJob++}`, kind, status: "running", label: prepared.label, detail: prepared.detail, total: prepared.total, done: 0, startedAt: new Date().toISOString(), ...(kind === "run" ? { results: [] } : { cells: [] }) };
    jobs.unshift(job);
    const keep = jobs.filter((j) => j.status === "running").length + JOB_LIMIT;
    jobs.length = Math.min(jobs.length, keep);
    prepared
      .execute((done, total, partial) => {
        job.done = done;
        job.total = total;
        if (partial.result) job.results!.push(partial.result);
        if (partial.cell) job.cells!.push(partial.cell);
      })
      .then((value) => {
        job.status = "done";
        job.done = job.total;
        if ("runId" in value) job.runId = value.runId;
        else job.sweepId = value.sweepId;
      })
      .catch((err: Error) => {
        job.status = "failed";
        job.error = err.message;
        event({ type: `${kind}.failed`, category: kind === "run" ? "runs" : "sweeps", severity: "critical", title: `${kind === "run" ? "Run" : "Sweep"} failed: ${prepared.label}`, detail: err.message, notify: true, link: kind === "run" ? "#/runs" : "#/sweep" });
      })
      .finally(() => {
        job.finishedAt = new Date().toISOString();
      });
    return job;
  };

  const api: Record<string, (req: IncomingMessage, url: URL) => Promise<unknown> | unknown> = {
    "GET /api/meta": () => meta(opts),
    "GET /api/scenarios": () => scenarios().map(summarize),
    "GET /api/scenario": (_req, url) => scenarioDetail(findScenario(param(url, "id")), opts.scenarioRoots),
    "POST /api/validate": async (req): Promise<Validation> => {
      const text = stringField((await body(req)).text, "text");
      try {
        const scenario = parseDraft(text, opts.registry);
        return { ok: true, summary: summarize(scenario), expect: expectParts({ scenario } as RunReport) };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
    "POST /api/run": async (req) => prepareRun(await body(req)).execute(),
    "POST /api/sweep": async (req): Promise<SweepResponse> => prepareSweep(await body(req)).execute(),
    "POST /api/jobs/run": async (req) => startJob("run", prepareRun(await body(req))),
    "POST /api/jobs/sweep": async (req) => startJob("sweep", prepareSweep(await body(req))),
    "GET /api/jobs": () => jobs.map(({ results: _r, cells: _c, ...j }) => j),
    "GET /api/job": (_req, url) => {
      const id = param(url, "id");
      const job = jobs.find((j) => j.jobId === id);
      if (!job) throw new HttpError(404, `no job ${id}; the server keeps the last ${JOB_LIMIT} finished jobs`);
      return job;
    },
    "GET /api/sweeps": (): SweepListItem[] => workspace.sweeps.map(({ cells, ...item }) => ({ ...item, cellCount: cells.length })),
    "GET /api/sweep": (_req, url) => {
      const id = param(url, "id");
      const found = workspace.sweeps.find((s) => s.sweepId === id);
      if (!found) throw new HttpError(404, `no sweep with id ${id}`);
      return found;
    },
    "GET /api/sweep/markdown": (_req, url) => {
      const id = param(url, "id");
      const found = workspace.sweeps.find((s) => s.sweepId === id);
      if (!found) throw new HttpError(404, `no sweep with id ${id}`);
      return { markdown: `${sweepMarkdown(found)}\n` };
    },
    "GET /api/coverage": () => computeCoverage(scenarios(), opts.registry),
    "GET /api/runs": () => workspace.runs.map(({ draftText: _d, ...r }) => r),
    "GET /api/run": (_req, url) => {
      const id = param(url, "id");
      const found = workspace.runs.find((r) => r.runId === id);
      if (!found) throw new HttpError(404, `no run with id ${id}`);
      const { draftText: _d, ...run } = found;
      return run;
    },
    "GET /api/reports": () => {
      const saved = listReportFiles(opts.outDir).map((file) => {
        const path = join(opts.outDir, file);
        const mtimeMs = statSync(path).mtimeMs;
        const cached = summaryCache.get(file);
        if (cached?.mtimeMs === mtimeMs) return cached.summary;
        let summary: ReportSummary;
        try {
          summary = { key: `file:${file}`, file, ...reportSummary(readReportFile(path)) };
        } catch (err) {
          summary = { key: `file:${file}`, file, error: (err as Error).message };
        }
        summaryCache.set(file, { mtimeMs, summary });
        return summary;
      });
      return { outDir: opts.outDir, saved, memory: [...memory].filter(([key]) => !sweepKeys.has(key)).reverse().map(([key, r]) => ({ key, ...reportSummary(r) })) };
    },
    "GET /api/report": async (_req, url) => report(param(url, "key")),
    "POST /api/replay": async (req) => {
      const key = stringField((await body(req)).key, "key");
      const r = await report(key);
      const result = replayReport(r, opts.registry);
      if (!result.reproduced) event({ type: "replay.diverged", category: "reports", severity: "critical", title: `Replay diverged: ${r.scenarioId} with ${r.agentId}`, detail: "The recorded calls no longer produce the recorded states and verdicts.", link: `#/report/${key}`, notify: true });
      return result;
    },
    "POST /api/save": async (req) => {
      const keys = stringList((await body(req)).keys, "keys");
      if (keys.length === 0 || keys.some((k) => !k.startsWith("mem-") && !k.startsWith("hist:"))) throw new HttpError(400, "choose runs from this session or the history to save (keys mem-N or hist:)");
      if (keys.some((k) => sweepKeys.has(k))) throw new HttpError(400, "reports of a sweep cannot be saved; they stay in memory with the sweep");
      const files: string[] = [];
      for (const key of keys) {
        const r = await report(key);
        const dir = join(opts.outDir, encodeURIComponent(r.agentId));
        writeJsonReport(r, dir);
        writeHtmlReport(r, dir);
        writeJUnitReport(r, dir, opts.failOn);
        files.push(relative(opts.outDir, join(dir, `${encodeURIComponent(r.scenarioId)}.report.json`)).split(sep).join("/"));
      }
      event({ type: "reports.saved", category: "reports", severity: "info", title: `Saved ${plural(files.length, "report")}`, detail: `Written under ${opts.outDir}`, link: "#/reports", data: { files: files.length } });
      return { outDir: opts.outDir, files };
    },
    "POST /api/reports/delete": async (req) => {
      const keys = stringList((await body(req)).keys, "keys");
      if (keys.length === 0 || keys.some((k) => !k.startsWith("file:") && !k.startsWith("mem-"))) throw new HttpError(400, "choose saved reports (file:) or reports of this session (mem-N) to delete");
      let deleted = 0;
      for (const key of keys) {
        if (key.startsWith("mem-")) {
          if (memory.delete(key)) deleted++;
          continue;
        }
        const path = reportPath(opts.outDir, key.slice(5));
        for (const file of [path, path.replace(/\.report\.json$/, ".report.html"), path.replace(/\.report\.json$/, ".junit.xml")]) if (existsSync(file)) rmSync(file);
        summaryCache.delete(key.slice(5));
        deleted++;
      }
      event({ type: "reports.deleted", category: "reports", severity: "info", title: `Deleted ${plural(deleted, "report")}`, link: "#/reports", data: { deleted } });
      return { deleted };
    },
    "GET /api/baseline": () => {
      if (!existsSync(opts.baselinePath)) return { path: opts.baselinePath, baseline: null };
      try {
        return { path: opts.baselinePath, baseline: readBaseline(opts.baselinePath) };
      } catch (err) {
        return { path: opts.baselinePath, baseline: null, error: (err as Error).message };
      }
    },
    "POST /api/baseline/compare": async (req) => {
      const keys = stringList((await body(req)).keys, "keys");
      if (!existsSync(opts.baselinePath)) throw new HttpError(404, `baseline ${opts.baselinePath} not found; save one first`);
      const reports = await Promise.all(keys.map(report));
      const comparison = compareBaseline(readBaseline(opts.baselinePath), reports);
      const newFailures = comparison.added.filter((e) => VERDICT_SEVERITY[e.verdict] >= VERDICT_SEVERITY[opts.failOn]).length;
      const failing = comparison.regressions.length + newFailures;
      event({
        type: "baseline.compared",
        category: failing ? "regressions" : "baseline",
        severity: failing ? "critical" : "success",
        title: failing ? `${plural(failing, "regression or new failure", "regressions or new failures")} against the baseline` : `No regressions against the baseline`,
        detail: `${plural(reports.length, "result")} compared · ${comparison.improvements.length} improved · ${comparison.unchanged} unchanged`,
        link: "#/baseline",
        notify: true,
        data: { regressions: comparison.regressions.length, newFailures, improvements: comparison.improvements.length, unchanged: comparison.unchanged },
      });
      return comparison;
    },
    "POST /api/baseline/save": async (req) => {
      const keys = stringList((await body(req)).keys, "keys");
      if (keys.length === 0) throw new HttpError(400, "choose at least one report");
      const baseline = createBaseline(await Promise.all(keys.map(report)));
      writeBaseline(opts.baselinePath, baseline);
      event({ type: "baseline.saved", category: "baseline", severity: "success", title: `Baseline updated with ${plural(baseline.entries.length, "entry", "entries")}`, detail: opts.baselinePath, link: "#/baseline", notify: true, data: { entries: baseline.entries.length } });
      return { path: opts.baselinePath, entries: baseline.entries.length };
    },
    "POST /api/scenario/save": async (req) => {
      const input = await body(req);
      const text = stringField(input.text, "text");
      const overwrite = input.overwrite === true;
      if (!opts.scenarioDir) throw new HttpError(400, 'no scenario directory to save to; add "scenarioDirs" to the config file');
      const scenario = parseDraftOr400(text, opts.registry);
      const path = resolve(opts.scenarioDir, ...scenario.id.split("/")) + ".yaml";
      if (!path.startsWith(resolve(opts.scenarioDir) + sep)) throw new HttpError(400, "the scenario id does not map to a file inside the scenario directory");
      const existing = scenarios().find((s) => s.id === scenario.id);
      if (existing && resolve(existing.source ?? "") !== path) throw new HttpError(409, `${scenario.id} already exists in ${existing.source}`);
      if (existsSync(path) && !overwrite) throw new HttpError(409, `${path} already exists`, "exists");
      const created = !existsSync(path);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text.endsWith("\n") ? text : `${text}\n`);
      event({ type: created ? "scenario.created" : "scenario.updated", category: "scenarios", severity: "info", title: `${created ? "Created" : "Updated"} scenario ${scenario.id}`, detail: path, link: `#/scenario/${scenario.id}`, data: { id: scenario.id } });
      return { path, id: scenario.id };
    },
    "POST /api/scenario/delete": async (req) => {
      const id = stringField((await body(req)).id, "id");
      if (!opts.scenarioDir) throw new HttpError(400, 'no scenario directory; add "scenarioDirs" to the config file');
      const scenario = findScenario(id);
      const path = resolve(scenario.source ?? "");
      if (!scenario.source || !path.startsWith(resolve(opts.scenarioDir) + sep)) throw new HttpError(400, `${id} is not a file in ${opts.scenarioDir}; only the project's own scenarios can be deleted here`);
      rmSync(path);
      event({ type: "scenario.deleted", category: "scenarios", severity: "info", title: `Deleted scenario ${id}`, detail: path, link: "#/scenarios", data: { id } });
      return { path, id };
    },
    "GET /api/activity": (_req, url) => {
      const limit = Math.min(2000, Math.max(1, Number(url.searchParams.get("limit") ?? 500) || 500));
      return workspace.events.slice(0, limit);
    },
    "GET /api/notifications": (): NotificationList => {
      const items = workspace.events.filter((e) => e.notify && !e.dismissed).slice(0, 200);
      return { unread: items.filter((e) => !e.read).length, items };
    },
    "POST /api/notifications/read": async (req) => {
      const input = await body(req);
      const ids = input.all === true ? "all" : stringList(input.ids, "ids");
      return { changed: workspace.markRead(ids, input.read !== false) };
    },
    "POST /api/notifications/dismiss": async (req) => {
      const input = await body(req);
      return { changed: workspace.dismiss(input.all === true ? "all" : stringList(input.ids, "ids")) };
    },
    "GET /api/profile": () => workspace.profile,
    "POST /api/profile": async (req) => {
      const input = await body(req);
      const update: Record<string, string> = {};
      for (const [key, max] of [["name", 60], ["role", 60], ["email", 120]] as const) {
        if (input[key] === undefined) continue;
        const value = stringField(input[key], key).trim();
        if (value.length > max) throw new HttpError(400, `${key} must be at most ${max} characters`);
        if (key === "name" && !value) throw new HttpError(400, "name must not be empty");
        if (key === "email" && value && !/^[^\s@]+@[^\s@]+$/.test(value)) throw new HttpError(400, "email must look like name@example.com");
        update[key] = value;
      }
      if (input.color !== undefined) {
        const color = stringField(input.color, "color");
        if (!(AVATAR_COLORS as readonly string[]).includes(color)) throw new HttpError(400, `color must be one of ${AVATAR_COLORS.join(", ")}`);
        update.color = color;
      }
      const profile = workspace.setProfile(update);
      event({ type: "profile.updated", category: "system", severity: "info", title: "Profile updated" });
      return profile;
    },
    "GET /api/system": (): SystemInfo => systemInfo(),
    "POST /api/session/rotate": () => {
      token = randomBytes(24).toString("hex");
      event({ type: "session.rotated", category: "system", severity: "info", title: "Session token rotated", detail: "Other tabs of this UI must reload to reconnect.", notify: true });
      return { token, tokenFingerprint: token.slice(0, 8) };
    },
    "GET /api/workspace/export": () => workspace.toFile(),
    "POST /api/workspace/import": async (req) => {
      const input = await body(req, IMPORT_LIMIT);
      let added;
      try {
        added = workspace.merge(input.workspace);
      } catch (err) {
        throw new HttpError(400, (err as Error).message);
      }
      event({ type: "workspace.imported", category: "system", severity: "success", title: `Imported ${plural(added.runs, "run")}, ${plural(added.sweeps, "sweep")}, and ${plural(added.events, "event")}`, link: "#/runs", notify: true, data: added });
      return added;
    },
    "POST /api/workspace/clear": async (req) => {
      const what = stringField((await body(req)).what, "what");
      if (what !== "runs" && what !== "activity" && what !== "all") throw new HttpError(400, 'what must be "runs", "activity", or "all"');
      workspace.clear(what);
      event({ type: "workspace.cleared", category: "system", severity: "warning", title: what === "all" ? "Cleared the workspace history" : what === "runs" ? "Cleared the run and sweep history" : "Cleared the activity log", notify: true });
      return { cleared: what };
    },
  };

  const systemInfo = (): SystemInfo => {
    const address = server.address() as AddressInfo;
    const workflows = existsSync(".github/workflows")
      ? readdirSync(".github/workflows").filter((f) => /\.ya?ml$/.test(f) && /agentcrucible/.test(readFileSync(join(".github/workflows", f), "utf8")))
      : [];
    return {
      version: VERSION,
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
      pid: process.pid,
      startedAt,
      url: `http://${host.includes(":") ? `[${host}]` : host}:${address.port}/`,
      host,
      loopback: ["127.0.0.1", "::1", "localhost"].includes(host),
      tokenFingerprint: token.slice(0, 8),
      history: { enabled: Boolean(workspace.file), path: workspace.file ?? null, runs: workspace.runs.length, sweeps: workspace.sweeps.length, events: workspace.events.length, bytes: workspace.size() },
      config: { path: opts.config?.path ?? null, values: { ...(opts.config?.values ?? {}) } },
      limits: { timeoutMs: opts.timeoutMs ?? null, concurrency: opts.concurrency ?? 1, memoryReports: MEMORY_LIMIT, keptRuns: 250, keptSweeps: 100 },
      providers: [
        { id: "openai", label: "OpenAI", variable: "OPENAI_API_KEY", configured: Boolean(process.env.OPENAI_API_KEY) },
        { id: "anthropic", label: "Anthropic", variable: "ANTHROPIC_API_KEY", configured: Boolean(process.env.ANTHROPIC_API_KEY) },
        { id: "ollama", label: "Ollama", variable: "OLLAMA_HOST", configured: Boolean(process.env.OLLAMA_HOST) },
        { id: "openai-compatible", label: "OpenAI-compatible endpoint", variable: "OPENAI_BASE_URL", configured: Boolean(process.env.OPENAI_BASE_URL) },
      ],
      ci: { workflows },
      demo: Boolean(opts.demo),
    };
  };

  const server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      const status = err instanceof HttpError ? err.status : 500;
      send(res, status, { error: err instanceof Error ? err.message : String(err), ...(err instanceof HttpError && err.code ? { code: err.code } : {}) });
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!hostAllowed(req.headers.host, host, (server.address() as AddressInfo).port)) throw new HttpError(403, "unexpected Host header");
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    if (req.method === "GET" && url.pathname === "/") return page(res, indexHtml(token));
    if (req.method === "GET" && url.pathname === "/app.css") return asset(res, "text/css", UI_CSS);
    if (req.method === "GET" && url.pathname === "/theme.js") return asset(res, "text/javascript", THEME_JS);
    if (req.method === "GET" && url.pathname === "/favicon.svg") return asset(res, "image/svg+xml", favicon());
    if (req.method === "GET" && url.pathname.startsWith("/fonts/")) {
      const { FONTS } = await import("./fonts.js");
      const name = url.pathname.slice("/fonts/".length);
      if (!Object.hasOwn(FONTS, name)) throw new HttpError(404, `no font ${name}`);
      res.writeHead(200, { "Content-Type": "font/woff2", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      res.end(Buffer.from(FONTS[name], "base64"));
      return;
    }
    if (req.method === "GET" && url.pathname === "/app.js") {
      const bundle = clientBundle();
      if (!bundle) throw new HttpError(503, "the UI bundle is missing; run npm run build");
      return asset(res, "text/javascript", readFileSync(bundle, "utf8"));
    }
    if (req.method === "GET" && url.pathname === "/report-view") {
      if (url.searchParams.get("token") !== token) throw new HttpError(403, "missing or wrong token", "token");
      const theme = url.searchParams.get("theme");
      const key = param(url, "key");
      const r = await report(key);
      const reportFile = key.startsWith("file:") ? join(opts.outDir, key.slice(5)) : undefined;
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(renderReportHtml(r, { reportFile, ...(theme === "light" || theme === "dark" ? { theme } : {}) }));
      return;
    }
    const handler = api[`${req.method} ${url.pathname}`];
    if (!handler) throw new HttpError(404, `no route ${req.method} ${url.pathname}`);
    if (req.headers["x-agentcrucible-token"] !== token) throw new HttpError(403, "missing or wrong token", "token");
    send(res, 200, await handler(req, url));
  }

  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, host, () => resolveListen());
  });
  const { port } = server.address() as AddressInfo;
  if (!workspace.events.some((e) => e.type === "workspace.created")) {
    event({ type: "workspace.created", category: "system", severity: "info", title: opts.demo ? "Opened the demo workspace" : "Workspace history started", detail: workspace.file ? `Runs, sweeps, and activity are kept in ${workspace.file}` : "Runs, sweeps, and activity are kept in memory for this session" });
  }
  return {
    url: `http://${host.includes(":") ? `[${host}]` : host}:${port}/`,
    get token() {
      return token;
    },
    workspace,
    close: () =>
      new Promise((done) => {
        workspace.flush();
        server.close(() => done());
        server.closeAllConnections();
      }),
  };
}

/** The activity event for a finished run: its outcome against expected_verdicts in one line. */
export function runEvent(run: RunRecord): NewEvent {
  const results = run.results.length;
  const unexpected = run.results.filter((r) => r.expected && r.expected !== r.verdict);
  const critical = run.results.filter((r) => r.verdict === "HARMFUL_ACTION" || r.verdict === "SILENT_FAILURE").length;
  const flaky = run.results.filter((r) => Object.values(r.byVerdict ?? {}).filter((n) => (n ?? 0) > 0).length > 1).length;
  const safe = run.results.filter((r) => r.verdict === "SAFE_SUCCESS" || r.verdict === "SAFE_FAILURE").length;
  const graded = run.results.filter((r) => r.expected).length;
  const agents = new Set(run.results.map((r) => r.agentId)).size;
  const what = run.label ?? (run.draft ? `draft ${run.scenarios[0]}` : run.scenarios.length === 1 ? run.scenarios[0] : plural(run.scenarios.length, "scenario"));
  const unexpectedCritical = unexpected.some((r) => r.verdict === "HARMFUL_ACTION" || r.verdict === "SILENT_FAILURE");
  return {
    type: "run.completed",
    category: unexpected.length ? "regressions" : "runs",
    severity: unexpectedCritical ? "critical" : unexpected.length ? "warning" : graded ? "success" : "info",
    title: unexpected.length ? `${plural(unexpected.length, "unexpected verdict")} in ${run.runId}` : `${run.runId} finished: ${graded ? `${graded}/${graded} as expected` : plural(results, "result")}`,
    detail: `${what} · ${plural(agents, "agent")} · ${plural(run.trials, "trial")} · ${Math.round((safe / Math.max(1, results)) * 100)}% ended safe`,
    link: `#/run/${run.runId}`,
    notify: true,
    at: run.finishedAt,
    data: { runId: run.runId, results, unexpected: unexpected.length, critical, flaky, safe, graded, agents, scenarios: run.scenarios.length, trials: run.trials },
  };
}

export function sweepEvent(s: SweepResponse): NewEvent {
  return {
    type: "sweep.completed",
    category: "sweeps",
    severity: s.score.critical ? "warning" : "success",
    title: `${s.sweepId}: ${s.agentId} ${(s.score.resilience * 100).toFixed(0)}% resilient on ${s.scenarioId}`,
    detail: `${plural(s.score.runs, "run")} · ${s.score.critical} critical · ${s.score.notFired} not reached`,
    link: `#/sweep/${s.sweepId}`,
    notify: true,
    at: s.finishedAt,
    data: { sweepId: s.sweepId, runs: s.score.runs, critical: s.score.critical, resilience: s.score.resilience },
  };
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The project, its directories, and every agent, world, and fault kind the registry holds (GET /api/meta). */
function meta(opts: UiOptions) {
  return {
    version: VERSION,
    cwd: process.cwd(),
    outDir: opts.outDir,
    scenarioRoots: opts.scenarioRoots,
    scenarioDir: opts.scenarioDir ?? null,
    baselinePath: opts.baselinePath,
    failOn: opts.failOn,
    verdicts: VERDICTS,
    history: Boolean(opts.stateDir),
    demoWorkspace: Boolean(opts.demo),
    /** The scenario and seed of `agentcrucible demo`, which the guided demo runs. */
    demo: { scenario: DEMO_SCENARIO, seed: DEMO_SEED },
    agents: [...opts.registry.agents].map(([id, e]) => ({ id, description: e.value.description, source: e.source })),
    worlds: [...opts.registry.worlds].map(([name, e]) => {
      const world = e.value();
      return {
        name,
        description: world.description,
        source: e.source,
        tools: world.tools.map((t) => ({ name: t.name, description: t.description, mutating: t.mutating, inputSchema: t.inputSchema, outputSchema: t.outputSchema ?? null })),
        records: world.recordFields,
      };
    }),
    faults: [...opts.registry.faults].map(([kind, e]) => ({ kind, stage: e.value.stage, description: e.value.description, params: Object.keys(e.value.params?.properties ?? {}), required: (e.value.params?.required as string[] | undefined) ?? [], source: e.source })),
  };
}

/** One scenario in full, with its source text (GET /api/scenario). */
function scenarioDetail(scenario: Scenario, roots: string[]) {
  return {
    summary: scenarioSummary(scenario, roots),
    scenario,
    expect: expectParts({ scenario } as RunReport),
    faults: scenario.faults.map(describeFault),
    text: scenario.source ? readFileSync(scenario.source, "utf8") : "",
  };
}

export type Meta = ReturnType<typeof meta>;
export type ScenarioDetail = ReturnType<typeof scenarioDetail>;

/**
 * Accepts Host headers a browser sends for this server: localhost, an IP literal, or the
 * configured host, with this port. A DNS-rebinding page sends its own domain name, so it is refused.
 */
export function hostAllowed(header: string | undefined, host: string, port: number): boolean {
  const match = /^(\[[^\]]+\]|[^:]+):(\d+)$/.exec(header ?? "");
  if (!match || Number(match[2]) !== port) return false;
  const name = match[1].replace(/^\[|\]$/g, "").toLowerCase();
  return name === "localhost" || isIP(name) !== 0 || name === host.toLowerCase();
}

/** A stable fingerprint of a scenario's content, ignoring where it was loaded from. */
export function scenarioHash(s: Scenario): string {
  const { source: _s, ...content } = s;
  return createHash("sha1").update(JSON.stringify(content)).digest("hex").slice(0, 12);
}

/** A report as the API's lists show it. */
export function reportSummary(r: RunReport): Omit<ReportSummary, "key"> {
  const worst = worstTrial(r);
  return {
    scenarioId: r.scenarioId,
    agentId: r.agentId,
    worlds: r.worlds,
    verdict: r.aggregateVerdict,
    reason: worst?.reason ?? "",
    rule: worst?.findings[0]?.rule ?? "",
    trials: r.stats.total,
    byVerdict: Object.fromEntries(VERDICTS.filter((v) => r.stats.byVerdict[v] > 0).map((v) => [v, r.stats.byVerdict[v]])),
    seed: r.seed,
    toolVersion: r.toolVersion,
    finishedAt: r.finishedAt,
    rules: [...new Set(worst?.findings.map((f) => f.rule) ?? [])],
    faultKinds: [...new Set(r.faults.map((f) => f.kind))],
    faultsFired: r.stats.trialsWithFault,
    calls: worst?.trace.calls.length ?? 0,
    mutations: worst?.trace.calls.filter((c) => c.mutating && c.committed).length ?? 0,
    durationMs: r.durationMs,
    tags: r.scenario.tags,
    scenarioHash: scenarioHash(r.scenario),
  };
}

function scenarioSummary(s: Scenario, roots: string[]): ScenarioSummary {
  return {
    id: s.id,
    worlds: s.worlds,
    tags: s.tags,
    description: s.description,
    task: s.task,
    faults: s.faults.map(describeFault),
    faultKinds: s.faults.map((f) => f.kind),
    hasExpect: Boolean(s.expect),
    outcomes: s.expect?.outcomes.map((o) => ({ name: o.name, verdict: o.verdict })) ?? [],
    invariants: s.expect?.invariants.length ?? 0,
    answerChecks: s.expect?.answer.length ?? 0,
    budget: s.budget,
    expectedVerdicts: s.expectedVerdicts,
    source: s.source ? displayPath(s.source, roots) : null,
    bundled: s.source ? resolve(s.source).startsWith(resolve(roots[0]) + sep) : false,
  };
}

function displayPath(path: string, roots: string[]): string {
  const root = roots.find((r) => resolve(path).startsWith(resolve(r) + sep));
  return root ? relative(dirname(resolve(root)), resolve(path)).split(sep).join("/") : path;
}

/** A scenario from editor text (YAML or JSON), checked like a file. */
function parseDraft(text: string, registry: Registry): Scenario {
  if (typeof text !== "string" || !text.trim()) throw new Error("draft: the scenario is empty");
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (err) {
    throw new Error(`draft: cannot parse: ${(err as Error).message}`);
  }
  return parseScenario(raw, "draft", registry);
}

function parseDraftOr400(text: string, registry: Registry): Scenario {
  try {
    return parseDraft(text, registry);
  } catch (err) {
    throw new HttpError(400, (err as Error).message);
  }
}

/** Saved report files under `dir`, as forward-slash paths relative to it, newest first. */
function listReportFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: Array<{ path: string; mtimeMs: number }> = [];
  const walk = (current: string, depth: number) => {
    for (const name of readdirSync(current)) {
      if (name.startsWith(".")) continue;
      const path = join(current, name);
      const stat = statSync(path);
      if (stat.isDirectory() && depth < 3) walk(path, depth + 1);
      else if (stat.isFile() && name.endsWith(".report.json")) files.push({ path, mtimeMs: stat.mtimeMs });
    }
  };
  walk(dir, 0);
  return files.sort((a, b) => b.mtimeMs - a.mtimeMs).map((f) => relative(dir, f.path).split(sep).join("/"));
}

/** The absolute path of a saved report, refusing anything outside the reports directory. */
function reportPath(outDir: string, file: string): string {
  const root = resolve(outDir);
  const path = resolve(root, file);
  if (!path.startsWith(root + sep) || !path.endsWith(".report.json")) throw new HttpError(400, "not a report file in the reports directory");
  if (!existsSync(path)) throw new HttpError(404, `${file} not found`);
  return path;
}

function param(url: URL, name: string): string {
  const value = url.searchParams.get(name);
  if (!value) throw new HttpError(400, `missing ?${name}=`);
  return value;
}

function stringField(value: unknown, name: string): string {
  if (typeof value !== "string") throw new HttpError(400, `${name} must be a string`);
  return value;
}

function stringList(value: unknown, name: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) throw new HttpError(400, `${name} must be a list of strings`);
  return value;
}

async function body(req: IncomingMessage, limit = BODY_LIMIT): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size <= limit) chunks.push(chunk as Buffer);
  }
  if (size > limit) throw new HttpError(413, "request body too large");
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "the request body must be a JSON object");
  }
}

function send(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(value));
}

function asset(res: ServerResponse, type: string, content: string): void {
  res.writeHead(200, { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(content);
}

function page(res: ServerResponse, html: string): void {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-src 'none'; img-src 'self' data:; object-src 'none'; base-uri 'none'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  res.end(html);
}

/** The brand mark on its ink tile, for the browser tab. */
function favicon(): string {
  return logo(32, { tile: true }).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
}

function indexHtml(token: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<meta name="agentcrucible-token" content="${token}"/>
<title>AgentCrucible</title>
<meta name="color-scheme" content="light dark"/>
<link rel="icon" href="/favicon.svg" type="image/svg+xml"/>
<link rel="preload" href="/fonts/geist.woff2" as="font" type="font/woff2" crossorigin/>
<link rel="preload" href="/fonts/geist-mono.woff2" as="font" type="font/woff2" crossorigin/>
<script src="/theme.js"></script>
<link rel="stylesheet" href="/app.css"/>
</head>
<body>
<div id="app"><noscript>The AgentCrucible UI needs JavaScript.</noscript></div>
<script type="module" src="/app.js"></script>
</body>
</html>
`;
}

/** Applies the saved theme, density, and sidebar width before the page paints, so nothing flashes. */
const THEME_JS = `try { const p = JSON.parse(localStorage.getItem("agentcrucible-prefs") || "{}"); const r = document.documentElement; if (p.theme === "light" || p.theme === "dark") r.dataset.theme = p.theme; if (p.density === "compact") r.dataset.density = "compact"; if (p.sidebar === "collapsed") r.dataset.sidebar = "collapsed"; if (p.motion === "reduce") r.dataset.motion = "reduce"; } catch {}\n`;

/** The browser bundle: next to the CLI in dist/ui, or in dist/ui of a checkout when run from source. */
function clientBundle(): string | undefined {
  const here = dirname(fileURLToPath(import.meta.url));
  return [join(here, "ui", "app.js"), join(here, "..", "..", "dist", "ui", "app.js")].find((p) => existsSync(p));
}
