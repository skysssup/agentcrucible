/**
 * Runs and sweeps as background jobs: start one, follow its progress, and hear when it ends. The
 * top bar shows what is running; a toast links to the result when a job finishes.
 */
import type { Job, RunRecord } from "../api.js";
import { api } from "./lib/api.js";
import { plural } from "./lib/format.js";
import { runtime } from "./lib/runtime.js";
import { invalidate, load, store } from "./lib/state.js";
import { toast } from "./ui/overlays.js";

type Listener = (job: Job) => void;
const listeners = new Map<string, Set<Listener>>();
let timer: ReturnType<typeof setTimeout> | undefined;

export interface RunRequest {
  scenarioIds?: string[];
  text?: string;
  agents: string[];
  trials: number;
  seed?: string;
  label?: string;
  version?: string;
}

export async function startRunJob(request: RunRequest): Promise<Job> {
  const job = await api<Job>("/api/jobs/run", { ...request, ...(request.seed ? { seed: request.seed } : {}) });
  track(job);
  return job;
}

export async function startSweepJob(request: { scenarioId: string; agentId: string; kinds: string[]; steps: number; trials: number; seed?: string }): Promise<Job> {
  const job = await api<Job>("/api/jobs/sweep", request);
  track(job);
  return job;
}

/** Calls `fn` with every update of the job until it ends (and once more with its final state). */
export function onJob(jobId: string, fn: Listener): () => void {
  const set = listeners.get(jobId) ?? new Set<Listener>();
  set.add(fn);
  listeners.set(jobId, set);
  return () => set.delete(fn);
}

/** Resolves with the job once it has finished or failed. */
export function jobDone(jobId: string): Promise<Job> {
  const known = store.jobs.find((j) => j.jobId === jobId);
  if (known && known.status !== "running") return Promise.resolve(known);
  return new Promise((resolve) => {
    const off = onJob(jobId, (job) => {
      if (job.status === "running") return;
      off();
      resolve(job);
    });
  });
}

function track(job: Job): void {
  store.jobs = [job, ...store.jobs.filter((j) => j.jobId !== job.jobId)];
  runtime.refreshShell();
  schedule(job.status === "running" ? 120 : 0);
}

/** Starts following jobs the server reports as running, as after a reload. */
export async function resumeJobs(): Promise<void> {
  await load.jobs().catch(() => undefined);
  if (store.jobs.some((j) => j.status === "running")) schedule(200);
}

function schedule(ms: number): void {
  if (timer) return;
  timer = setTimeout(tick, ms);
}

async function tick(): Promise<void> {
  timer = undefined;
  const running = store.jobs.filter((j) => j.status === "running");
  for (const j of running) {
    const fresh = await api<Job>(`/api/job?id=${encodeURIComponent(j.jobId)}`).catch(() => undefined);
    if (!fresh) continue;
    store.jobs = store.jobs.map((x) => (x.jobId === fresh.jobId ? fresh : x));
    for (const fn of listeners.get(fresh.jobId) ?? []) fn(fresh);
    if (fresh.status !== "running") await finished(fresh);
  }
  runtime.refreshShell();
  if (store.jobs.some((j) => j.status === "running")) schedule(300);
}

async function finished(job: Job): Promise<void> {
  invalidate("runs", "reports", "activity", "sweeps", "baseline");
  await Promise.all([load.runs(true), load.notifications(), job.kind === "sweep" ? load.sweeps(true) : undefined]).catch(() => undefined);
  runtime.changed(["runs", "reports", "activity", "notifications", ...(job.kind === "sweep" ? ["sweeps"] : [])]);
  if (location.hash.includes(job.jobId) || !store.prefs.notifyRuns) return;
  if (job.status === "failed") return void toast(job.error ?? "The job failed.", "bad", { title: `${job.kind === "run" ? "Run" : "Sweep"} failed: ${job.label}` });
  if (job.kind === "sweep") return void toast(job.detail, "ok", { title: `${job.sweepId} finished`, action: { label: "Open", href: `#/sweep/${job.sweepId}` } });
  const run = store.runs.find((r) => r.runId === job.runId);
  toast(run ? runSummary(run) : job.detail, run && run.results.some((r) => r.expected && r.expected !== r.verdict) ? "bad" : "ok", { title: `${job.runId} finished`, action: { label: "Open", href: `#/run/${job.runId}` } });
}

/** "15 results · 14/15 as expected" for a toast or a notification. */
export function runSummary(run: RunRecord): string {
  const graded = run.results.filter((r) => r.expected);
  const off = graded.filter((r) => r.expected !== r.verdict).length;
  return `${plural(run.results.length, "result")}${graded.length ? ` · ${off ? `${plural(off, "unexpected verdict")}` : `${graded.length}/${graded.length} as expected`}` : ""}`;
}
