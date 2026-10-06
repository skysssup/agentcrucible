import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import { dirname, join } from "node:path";
import type { ActivityCategory, ActivityEvent, ActivitySeverity, Profile, RunRecord, SweepResponse } from "./api.js";

/** Runs, sweeps, and events the history keeps; older ones are dropped first. */
export const HISTORY_LIMITS = { runs: 250, sweeps: 100, events: 2000 } as const;

export const AVATAR_COLORS = ["clay", "moss", "slate", "plum", "ochre", "teal"] as const;

/** What a workspace file holds: the profile and the history of runs, sweeps, and events. */
export interface WorkspaceFile {
  format: "agentcrucible-workspace";
  version: 1;
  profile: Profile;
  runs: RunRecord[];
  sweeps: SweepResponse[];
  events: ActivityEvent[];
}

export interface NewEvent {
  type: string;
  category: ActivityCategory;
  severity: ActivitySeverity;
  title: string;
  detail?: string;
  link?: string;
  notify?: boolean;
  data?: Record<string, unknown>;
  /** Defaults to now. */
  at?: string;
}

/**
 * The workspace history behind the UI: runs and sweeps (as summaries, with history keys in place
 * of this session's memory keys), activity events with their read state, and the profile. With a
 * file it is loaded at start and written shortly after every change; without one it lives only in
 * memory, like the runs of earlier versions.
 */
export class Workspace {
  profile: Profile;
  runs: RunRecord[] = [];
  sweeps: SweepResponse[] = [];
  events: ActivityEvent[] = [];
  /** Set when the file could not be read; it is renamed to <file>.bad and a new history starts. */
  loadError?: string;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private counters = { run: 0, sweep: 0, event: 0 };

  constructor(readonly file?: string) {
    this.profile = defaultProfile();
    if (!file || !existsSync(file)) return;
    try {
      this.replace(parseWorkspace(JSON.parse(readFileSync(file, "utf8"))));
    } catch (err) {
      this.loadError = `${file}: ${(err as Error).message}`;
      try {
        renameSync(file, `${file}.bad`);
      } catch {
        // The next write replaces the file anyway.
      }
    }
  }

  /** Replaces everything with `w`, as when loading or after clearing. */
  private replace(w: WorkspaceFile): void {
    this.profile = w.profile;
    this.runs = w.runs.map((r) => ({ ...r, archived: true }));
    this.sweeps = w.sweeps.map((s) => ({ ...s, archived: true }));
    this.events = w.events;
    this.counters = {
      run: maxSuffix(this.runs.map((r) => r.runId)),
      sweep: maxSuffix(this.sweeps.map((s) => s.sweepId)),
      event: maxSuffix(this.events.map((e) => e.id)),
    };
  }

  nextRunId(): string {
    return `run-${++this.counters.run}`;
  }

  nextSweepId(): string {
    return `sweep-${++this.counters.sweep}`;
  }

  /** Records a finished run. Its results keep their keys in memory; the file gets history keys. */
  addRun(run: RunRecord): void {
    this.runs.unshift(run);
    this.runs.length = Math.min(this.runs.length, HISTORY_LIMITS.runs);
    this.changed();
  }

  addSweep(sweep: SweepResponse): void {
    this.sweeps.unshift(sweep);
    this.sweeps.length = Math.min(this.sweeps.length, HISTORY_LIMITS.sweeps);
    this.changed();
  }

  addEvent(e: NewEvent): ActivityEvent {
    const event: ActivityEvent = {
      id: `evt-${++this.counters.event}`,
      at: e.at ?? new Date().toISOString(),
      type: e.type,
      category: e.category,
      severity: e.severity,
      actor: this.profile.name,
      title: e.title,
      ...(e.detail ? { detail: e.detail } : {}),
      ...(e.link ? { link: e.link } : {}),
      notify: e.notify ?? false,
      ...(e.data ? { data: e.data } : {}),
    };
    this.events.unshift(event);
    this.events.length = Math.min(this.events.length, HISTORY_LIMITS.events);
    this.changed();
    return event;
  }

  /** Marks the given notifications (or all of them) read or unread. Returns how many changed. */
  markRead(ids: string[] | "all", read = true): number {
    let n = 0;
    for (const e of this.events) {
      if (!e.notify || (ids !== "all" && !ids.includes(e.id)) || Boolean(e.read) === read) continue;
      e.read = read;
      n++;
    }
    if (n) this.changed();
    return n;
  }

  /** Removes notifications from the notification center; they stay in the activity log. */
  dismiss(ids: string[] | "all"): number {
    let n = 0;
    for (const e of this.events) {
      if (!e.notify || e.dismissed || (ids !== "all" && !ids.includes(e.id))) continue;
      e.dismissed = true;
      e.read = true;
      n++;
    }
    if (n) this.changed();
    return n;
  }

  setProfile(update: Partial<Pick<Profile, "name" | "role" | "email" | "color">>): Profile {
    this.profile = { ...this.profile, ...update };
    this.changed();
    return this.profile;
  }

  /** The whole history as a workspace file, with history keys. */
  toFile(): WorkspaceFile {
    return {
      format: "agentcrucible-workspace",
      version: 1,
      profile: this.profile,
      runs: this.runs.map(archiveRun),
      sweeps: this.sweeps.map(archiveSweep),
      events: this.events,
    };
  }

  /** Adds the runs, sweeps, and events of another workspace file that this one does not have. */
  merge(raw: unknown): { runs: number; sweeps: number; events: number } {
    const w = parseWorkspace(raw);
    const runIds = new Set(this.runs.map((r) => r.runId));
    const sweepIds = new Set(this.sweeps.map((s) => s.sweepId));
    const eventIds = new Set(this.events.map((e) => e.id));
    const runs = w.runs.filter((r) => !runIds.has(r.runId)).map((r) => ({ ...r, archived: true, origin: r.origin ?? ("import" as const) }));
    const sweeps = w.sweeps.filter((s) => !sweepIds.has(s.sweepId)).map((s) => ({ ...s, archived: true }));
    const events = w.events.filter((e) => !eventIds.has(e.id));
    const byTime = <T>(at: (x: T) => string) => (a: T, b: T) => at(b).localeCompare(at(a));
    this.runs = [...this.runs, ...runs].sort(byTime((r) => r.startedAt)).slice(0, HISTORY_LIMITS.runs);
    this.sweeps = [...this.sweeps, ...sweeps].sort(byTime((s) => s.startedAt)).slice(0, HISTORY_LIMITS.sweeps);
    this.events = [...this.events, ...events].sort(byTime((e) => e.at)).slice(0, HISTORY_LIMITS.events);
    this.counters = {
      run: Math.max(this.counters.run, maxSuffix(this.runs.map((r) => r.runId))),
      sweep: Math.max(this.counters.sweep, maxSuffix(this.sweeps.map((s) => s.sweepId))),
      event: Math.max(this.counters.event, maxSuffix(this.events.map((e) => e.id))),
    };
    this.changed();
    return { runs: runs.length, sweeps: sweeps.length, events: events.length };
  }

  clear(what: "runs" | "activity" | "all"): void {
    if (what !== "activity") {
      this.runs = [];
      this.sweeps = [];
    }
    if (what !== "runs") this.events = [];
    this.changed();
  }

  /** Bytes of the file on disk, or of the history as JSON when there is no file. */
  size(): number {
    if (this.file && existsSync(this.file)) return statSync(this.file).size;
    return Buffer.byteLength(JSON.stringify(this.toFile()));
  }

  private changed(): void {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => this.flush(), 150);
  }

  /** Writes the file now (through a temporary file, so a crash never leaves half of it). */
  flush(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = join(dirname(this.file), `.workspace-${process.pid}.tmp`);
    writeFileSync(tmp, JSON.stringify(this.toFile()));
    renameSync(tmp, this.file);
  }
}

function defaultProfile(): Profile {
  let name = "Operator";
  try {
    const user = userInfo().username;
    if (user) name = user.charAt(0).toUpperCase() + user.slice(1);
  } catch {
    // Some containers have no passwd entry for the user.
  }
  return { name, role: "Engineer", email: "", color: AVATAR_COLORS[0], createdAt: new Date().toISOString() };
}

/** The highest N among ids like "run-N", or 0. */
function maxSuffix(ids: string[]): number {
  return ids.reduce((max, id) => Math.max(max, Number(/-(\d+)$/.exec(id)?.[1] ?? 0)), 0);
}

/** A run with history keys: `hist:<run>:<i>` for every result kept only in this session's memory. */
export function archiveRun(run: RunRecord): RunRecord {
  const { archived: _a, ...rest } = run;
  return { ...rest, results: run.results.map((r, i) => (r.key.startsWith("mem-") ? { ...r, key: `hist:${run.runId}:${i}` } : r)) };
}

/** A sweep with history keys: `sweep:<sweep>:base` for its run without faults and `sweep:<sweep>:<i>` per cell. */
export function archiveSweep(sweep: SweepResponse): SweepResponse {
  const { archived: _a, ...rest } = sweep;
  return { ...rest, baselineKey: `sweep:${sweep.sweepId}:base`, cells: sweep.cells.map((c, i) => ({ ...c, key: `sweep:${sweep.sweepId}:${i}` })) };
}

/** Checks the shape of a workspace file well enough that the UI can rely on it. */
export function parseWorkspace(raw: unknown): WorkspaceFile {
  const w = raw as Partial<WorkspaceFile> | null;
  if (typeof w !== "object" || w === null || w.format !== "agentcrucible-workspace") throw new Error('not an AgentCrucible workspace file (format must be "agentcrucible-workspace")');
  if (w.version !== 1) throw new Error(`workspace version ${String(w.version)} is not supported (expected 1)`);
  for (const key of ["runs", "sweeps", "events"] as const) if (!Array.isArray(w[key])) throw new Error(`${key} must be a list`);
  const runs = w.runs!.filter((r): r is RunRecord => typeof r?.runId === "string" && typeof r.startedAt === "string" && Array.isArray(r.results));
  const sweeps = w.sweeps!.filter((s): s is SweepResponse => typeof s?.sweepId === "string" && typeof s.startedAt === "string" && Array.isArray(s.cells) && Array.isArray(s.steps));
  const events = w.events!.filter((e): e is ActivityEvent => typeof e?.id === "string" && typeof e.at === "string" && typeof e.title === "string");
  const p = (w.profile ?? {}) as Partial<Profile>;
  const base = defaultProfile();
  const text = (v: unknown, fallback: string, max = 80) => (typeof v === "string" ? v.slice(0, max) : fallback);
  const profile: Profile = {
    name: text(p.name, base.name) || base.name,
    role: text(p.role, base.role),
    email: text(p.email, "", 120),
    color: (AVATAR_COLORS as readonly string[]).includes(p.color ?? "") ? p.color! : base.color,
    createdAt: text(p.createdAt, base.createdAt, 40),
  };
  return { format: "agentcrucible-workspace", version: 1, profile, runs: runs.map(archiveRun), sweeps: sweeps.map(archiveSweep), events };
}
