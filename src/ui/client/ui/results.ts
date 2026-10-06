/**
 * What the Reports, Report, and Baseline pages share about results: where a result's full report
 * lives, the actions on results (save as reports, delete, compare with the baseline, save as the
 * baseline), and the last comparison, which the Baseline page shows after another page runs it.
 */
import type { Comparison } from "../../api.js";
import { VERDICT_SEVERITY, type Verdict } from "../../../types.js";
import { api } from "../lib/api.js";
import { esc, plural } from "../lib/format.js";
import { runtime } from "../lib/runtime.js";
import { invalidate, load, store } from "../lib/state.js";
import { confirmDialog, toast } from "./overlays.js";

/** Where a key's full report lives: a saved file, this server session's memory, the workspace history, or a sweep. */
export type SourceKind = "saved" | "session" | "history" | "sweep";

export function sourceKind(key: string): SourceKind {
  if (key.startsWith("file:")) return "saved";
  if (key.startsWith("mem-")) return "session";
  if (key.startsWith("sweep:")) return "sweep";
  return "history";
}

/** Keys POST /api/save accepts: results of this session and of the history. */
export const canSave = (key: string): boolean => key.startsWith("mem-") || key.startsWith("hist:");

/** Keys POST /api/reports/delete accepts: saved files and results of this session. */
export const canDelete = (key: string): boolean => key.startsWith("file:") || key.startsWith("mem-");

/** Shows the busy state on the control that started `work` until it settles. */
export async function withBusy<T>(el: HTMLElement | null | undefined, work: () => Promise<T>): Promise<T> {
  el?.classList.add("is-busy");
  el?.setAttribute("aria-busy", "true");
  try {
    return await work();
  } finally {
    el?.classList.remove("is-busy");
    el?.removeAttribute("aria-busy");
  }
}

/** New results at or above the fail-on verdict: with regressions, what makes CI fail. */
export function newFailures(c: Pick<Comparison, "added">, failOn: Verdict): Comparison["added"] {
  return c.added.filter((e) => VERDICT_SEVERITY[e.verdict] >= VERDICT_SEVERITY[failOn]);
}

export interface Gate {
  /** failing: regressions or new failures (CI exits 2); incomparable: a seed or trial count differs (CI exits 1). */
  state: "passing" | "failing" | "incomparable";
  regressions: number;
  newFailures: number;
  incomparable: number;
  /** "Gate failing: 1 new failure", "Gate passing". */
  title: string;
}

/** The CI gate a comparison implies, as `agentcrucible run --baseline` decides it. */
export function gateOf(c: Pick<Comparison, "regressions" | "added" | "incomparable">, failOn: Verdict): Gate {
  const regressions = c.regressions.length;
  const fresh = newFailures(c, failOn).length;
  const incomparable = c.incomparable.length;
  const parts = [regressions ? plural(regressions, "regression") : "", fresh ? plural(fresh, "new failure") : ""].filter(Boolean);
  if (parts.length) return { state: "failing", regressions, newFailures: fresh, incomparable, title: `Gate failing: ${parts.join(" and ")}` };
  if (incomparable) return { state: "incomparable", regressions, newFailures: fresh, incomparable, title: `Not comparable: ${plural(incomparable, "result")} ran with another seed or trial count` };
  return { state: "passing", regressions, newFailures: fresh, incomparable, title: "Gate passing" };
}

export interface ComparisonRecord {
  comparison: Comparison;
  /** What was compared, in a few words: "run-58 · Nightly regression", "3 selected results". */
  label: string;
  keys: string[];
  /** The run compared, when the keys are one run's results. */
  runId?: string;
  at: string;
}

let last: ComparisonRecord | undefined;

/** The comparison this tab ran most recently, until the baseline changes. */
export function lastComparison(): ComparisonRecord | undefined {
  return last;
}

/**
 * Compares results with the baseline file (POST /api/baseline/compare), keeps the comparison for
 * the Baseline page, and toasts the gate. The server records the comparison in the activity log.
 */
export async function compareWithBaseline(keys: string[], o: { label: string; runId?: string; el?: HTMLElement | null }): Promise<ComparisonRecord> {
  const comparison = await withBusy(o.el, () => api<Comparison>("/api/baseline/compare", { keys }));
  last = { comparison, label: o.label, keys, ...(o.runId ? { runId: o.runId } : {}), at: new Date().toISOString() };
  const gate = gateOf(comparison, store.meta.failOn);
  toast(`${plural(keys.length, "result")} compared · ${comparison.unchanged} unchanged · ${comparison.improvements.length} improved.`, gate.state === "passing" ? "ok" : "bad", { title: gate.title });
  invalidate("activity");
  void load.notifications().then(() => runtime.refreshShell(), () => undefined);
  return last;
}

/** Writes the results as the new baseline after a confirmation (POST /api/baseline/save). Resolves false when cancelled. */
export async function saveAsBaseline(keys: string[], o: { el?: HTMLElement | null } = {}): Promise<boolean> {
  if (!keys.length) return false;
  const path = store.meta.baselinePath;
  if (
    store.prefs.confirm &&
    !(await confirmDialog({
      title: "Replace the baseline?",
      body: `${esc(plural(keys.length, "result"))} will be written to <code>${esc(path)}</code> as the new baseline. This replaces the file, and CI compares every run against it from then on.`,
      confirm: "Replace the baseline",
      danger: true,
      icon: "compare",
    }))
  )
    return false;
  const saved = await withBusy(o.el, () => api<{ path: string; entries: number }>("/api/baseline/save", { keys }));
  last = undefined;
  toast(`${saved.path} now has ${plural(saved.entries, "entry", "entries")}.`, "ok", { title: "Baseline replaced", action: { label: "Open", href: "#/baseline" } });
  invalidate("baseline", "activity");
  runtime.changed(["baseline", "activity"]);
  return true;
}

/** Saves results of this session or the history as report files (POST /api/save). Other keys are skipped and said so. */
export async function saveReports(keys: string[], o: { el?: HTMLElement | null } = {}): Promise<string[]> {
  const eligible = keys.filter(canSave);
  if (!eligible.length) {
    toast("Only results of this session or the history can be saved; the others already are report files.", "info");
    return [];
  }
  const saved = await withBusy(o.el, () => api<{ outDir: string; files: string[] }>("/api/save", { keys: eligible }));
  const skipped = keys.length - eligible.length;
  toast(`Written under ${saved.outDir}${skipped ? `; ${plural(skipped, "result")} already saved were skipped` : ""}.`, "ok", { title: `Saved ${plural(saved.files.length, "report")}`, action: { label: "View", href: "#/reports?source=saved" } });
  invalidate("reports", "activity");
  runtime.changed(["reports", "activity"]);
  return saved.files;
}

/** Deletes saved report files and results of this session after a confirmation (POST /api/reports/delete). Resolves with the count deleted. */
export async function deleteReports(keys: string[], o: { el?: HTMLElement | null } = {}): Promise<number> {
  const eligible = keys.filter(canDelete);
  if (!eligible.length) {
    toast("Results of the history cannot be deleted here; clear the history under Settings, Data.", "info");
    return 0;
  }
  const files = eligible.filter((k) => k.startsWith("file:")).length;
  const session = eligible.length - files;
  const what = [files ? plural(files, "saved report") : "", session ? plural(session, "result of this session", "results of this session") : ""].filter(Boolean).join(" and ");
  if (
    store.prefs.confirm &&
    !(await confirmDialog({
      title: `Delete ${plural(eligible.length, "report")}?`,
      body: `This deletes ${esc(what)}${files ? ", with each file's HTML and JUnit companions" : ""}. It cannot be undone.${keys.length > eligible.length ? ` ${esc(plural(keys.length - eligible.length, "history result"))} stay, because the history keeps them.` : ""}`,
      confirm: "Delete",
      danger: true,
      icon: "trash",
    }))
  )
    return 0;
  const { deleted } = await withBusy(o.el, () => api<{ deleted: number }>("/api/reports/delete", { keys: eligible }));
  for (const key of eligible) store.reports.delete(key);
  toast(`Deleted ${plural(deleted, "report")}.`, "ok");
  invalidate("reports", "activity");
  runtime.changed(["reports", "activity"]);
  return deleted;
}
