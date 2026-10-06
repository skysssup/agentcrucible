/**
 * The UI's state: what the server sent (cached, with loaders that refetch on demand), the user's
 * preferences and recent items (kept in localStorage), and each page's filters.
 */
import type { Coverage } from "../../../coverage.js";
import type { RunReport } from "../../../types.js";
import type { ActivityEvent, BaselineInfo, Job, NotificationList, Profile, ReportSummary, RunRecord, ScenarioSummary, SweepListItem, SweepResponse, SystemInfo } from "../../api.js";
import type { Meta, ScenarioDetail } from "../../server.js";
import { api, ApiError } from "./api.js";

export type { Meta, ScenarioDetail } from "../../server.js";

export type Theme = "system" | "light" | "dark";

export interface Prefs {
  theme: Theme;
  density: "comfortable" | "compact";
  sidebar: "expanded" | "collapsed";
  motion: "system" | "reduce";
  /** Trials preselected in run forms. */
  trials: number;
  /** Rows per page in tables. */
  pageSize: number;
  /** "relative" shows "3 h ago"; "absolute" shows the date and time. */
  time: "relative" | "absolute";
  /** The page the app opens on. */
  landing: string;
  /** Ask before deleting files or replacing the baseline. */
  confirm: boolean;
  /** Pop up a toast when a run started in the background finishes. */
  notifyRuns: boolean;
}

const PREFS_KEY = "agentcrucible-prefs";
const RECENT_KEY = "agentcrucible-recent";
const SEARCHES_KEY = "agentcrucible-searches";
const DRAFT_KEY = "agentcrucible-draft";

export const DEFAULT_PREFS: Prefs = { theme: "system", density: "comfortable", sidebar: "expanded", motion: "system", trials: 3, pageSize: 25, time: "relative", landing: "", confirm: true, notifyRuns: true };

export interface RecentItem {
  kind: "scenario" | "run" | "report" | "agent" | "sweep";
  id: string;
  label: string;
  detail?: string;
  at: number;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  } catch {
    // Private windows may refuse storage; the UI still works for this tab.
  }
}

/** Freshness of each cached resource; `invalidate` makes the next load refetch. */
const loadedAt = new Map<string, number>();
const FRESH_MS = 30_000;

function stale(name: string, force?: boolean): boolean {
  if (force) return true;
  const at = loadedAt.get(name);
  return at === undefined || Date.now() - at > FRESH_MS;
}

export function invalidate(...names: string[]): void {
  for (const name of names) loadedAt.delete(name);
}

export const store = {
  meta: undefined as unknown as Meta,
  scenarios: undefined as ScenarioSummary[] | undefined,
  scenarioError: undefined as string | undefined,
  runs: [] as RunRecord[],
  saved: [] as ReportSummary[],
  memory: [] as ReportSummary[],
  outDir: "",
  sweeps: [] as SweepListItem[],
  coverage: undefined as Coverage | undefined,
  baseline: undefined as BaselineInfo | undefined,
  activity: [] as ActivityEvent[],
  notifications: { unread: 0, items: [] } as NotificationList,
  profile: undefined as Profile | undefined,
  system: undefined as SystemInfo | undefined,
  jobs: [] as Job[],
  /** Full reports, by key; mem- and file: keys never change, so they are fetched once. */
  reports: new Map<string, RunReport>(),
  sweepDetails: new Map<string, SweepResponse>(),
  scenarioDetails: new Map<string, ScenarioDetail>(),
  prefs: { ...DEFAULT_PREFS, ...read<Partial<Prefs>>(PREFS_KEY, {}) } as Prefs,
  recent: read<RecentItem[]>(RECENT_KEY, []),
  searches: read<string[]>(SEARCHES_KEY, []),
  draft: typeof localStorage === "undefined" ? null : localStorage.getItem(DRAFT_KEY),
};

export function savePrefs(update: Partial<Prefs>): void {
  store.prefs = { ...store.prefs, ...update };
  write(PREFS_KEY, store.prefs);
}

export function resetPrefs(): void {
  store.prefs = { ...DEFAULT_PREFS };
  write(PREFS_KEY, store.prefs);
}

/** Remembers that the user opened something, most recent first, at most 12. */
export function remember(item: Omit<RecentItem, "at">): void {
  store.recent = [{ ...item, at: Date.now() }, ...store.recent.filter((r) => !(r.kind === item.kind && r.id === item.id))].slice(0, 12);
  write(RECENT_KEY, store.recent);
}

export function clearRecent(): void {
  store.recent = [];
  write(RECENT_KEY, []);
}

export function rememberSearch(q: string): void {
  const query = q.trim();
  if (query.length < 2) return;
  store.searches = [query, ...store.searches.filter((s) => s !== query)].slice(0, 8);
  write(SEARCHES_KEY, store.searches);
}

export function clearSearches(): void {
  store.searches = [];
  write(SEARCHES_KEY, []);
}

export function saveDraft(text: string): void {
  store.draft = text;
  write(DRAFT_KEY, text);
}

/** Loaders: each fetches when its cache is stale or `force` is set, and keeps the result in `store`. */
export const load = {
  async meta(): Promise<Meta> {
    store.meta = await api<Meta>("/api/meta");
    return store.meta;
  },
  /** A load that failed (a broken scenario file, say) is shown on the page and retried on the next visit. */
  async scenarios(force?: boolean): Promise<ScenarioSummary[]> {
    if (store.scenarios && !stale("scenarios", force)) return store.scenarios;
    try {
      store.scenarios = await api<ScenarioSummary[]>("/api/scenarios");
      store.scenarioError = undefined;
      loadedAt.set("scenarios", Date.now());
    } catch (err) {
      if (err instanceof ApiError && (err.code === "token" || err.code === "offline")) throw err;
      store.scenarioError = (err as Error).message;
    }
    return store.scenarios ?? [];
  },
  async runs(force?: boolean): Promise<RunRecord[]> {
    if (!stale("runs", force)) return store.runs;
    store.runs = await api<RunRecord[]>("/api/runs");
    loadedAt.set("runs", Date.now());
    return store.runs;
  },
  async reports(force?: boolean): Promise<void> {
    if (!stale("reports", force)) return;
    const r = await api<{ outDir: string; saved: ReportSummary[]; memory: ReportSummary[] }>("/api/reports");
    store.saved = r.saved;
    store.memory = r.memory;
    store.outDir = r.outDir;
    loadedAt.set("reports", Date.now());
  },
  async sweeps(force?: boolean): Promise<SweepListItem[]> {
    if (!stale("sweeps", force)) return store.sweeps;
    store.sweeps = await api<SweepListItem[]>("/api/sweeps");
    loadedAt.set("sweeps", Date.now());
    return store.sweeps;
  },
  async sweep(id: string): Promise<SweepResponse> {
    const cached = store.sweepDetails.get(id);
    if (cached) return cached;
    const sweep = await api<SweepResponse>(`/api/sweep?id=${encodeURIComponent(id)}`);
    store.sweepDetails.set(id, sweep);
    return sweep;
  },
  async coverage(force?: boolean): Promise<Coverage | undefined> {
    if (store.coverage && !stale("coverage", force)) return store.coverage;
    store.coverage = await api<Coverage>("/api/coverage").catch(() => store.coverage);
    loadedAt.set("coverage", Date.now());
    return store.coverage;
  },
  async baseline(force?: boolean): Promise<BaselineInfo | undefined> {
    if (store.baseline && !stale("baseline", force)) return store.baseline;
    store.baseline = await api<BaselineInfo>("/api/baseline");
    loadedAt.set("baseline", Date.now());
    return store.baseline;
  },
  async activity(force?: boolean): Promise<ActivityEvent[]> {
    if (!stale("activity", force)) return store.activity;
    store.activity = await api<ActivityEvent[]>("/api/activity?limit=2000");
    loadedAt.set("activity", Date.now());
    return store.activity;
  },
  async notifications(): Promise<NotificationList> {
    store.notifications = await api<NotificationList>("/api/notifications");
    return store.notifications;
  },
  async profile(force?: boolean): Promise<Profile> {
    if (store.profile && !force) return store.profile;
    store.profile = await api<Profile>("/api/profile");
    return store.profile;
  },
  async system(force?: boolean): Promise<SystemInfo> {
    if (store.system && !stale("system", force)) return store.system;
    store.system = await api<SystemInfo>("/api/system");
    loadedAt.set("system", Date.now());
    return store.system;
  },
  async jobs(): Promise<Job[]> {
    store.jobs = await api<Job[]>("/api/jobs");
    return store.jobs;
  },
  async report(key: string): Promise<RunReport> {
    const cached = store.reports.get(key);
    if (cached) return cached;
    const report = await api<RunReport>(`/api/report?key=${encodeURIComponent(key)}`);
    store.reports.set(key, report);
    return report;
  },
  async scenario(id: string, force?: boolean): Promise<ScenarioDetail> {
    const cached = store.scenarioDetails.get(id);
    if (cached && !force) return cached;
    const detail = await api<ScenarioDetail>(`/api/scenario?id=${encodeURIComponent(id)}`);
    store.scenarioDetails.set(id, detail);
    return detail;
  },
};

/** The summary of any result the UI knows by its key: from a run, the session, or the saved reports. */
export function findResult(key: string): ReportSummary | undefined {
  for (const run of store.runs) {
    const found = run.results.find((r) => r.key === key);
    if (found) return found;
  }
  return [...store.memory, ...store.saved].find((r) => r.key === key);
}

/** The run a result key belongs to. */
export function runOf(key: string): RunRecord | undefined {
  if (key.startsWith("hist:")) return store.runs.find((r) => r.runId === key.split(":")[1]);
  return store.runs.find((r) => r.results.some((x) => x.key === key));
}

export function agentDescription(id: string): string {
  return store.meta.agents.find((a) => a.id === id)?.description ?? "";
}

/** The directory name of the project, shown as the workspace name. */
export function projectName(meta: Meta = store.meta): string {
  return meta.cwd.split(/[\\/]/).filter(Boolean).pop() ?? meta.cwd;
}
