/**
 * Runs: every run of the matrix in the workspace, from the history and this session. The week's
 * numbers, the jobs running now, and a table to search, filter, sort, select, compare, and export.
 */
import type { Job, RunRecord } from "../../api.js";
import { onJob } from "../jobs.js";
import { copy, download } from "../lib/dom.js";
import { dayLabel, duration, esc, href, num, pct, plural, relTime, withQuery } from "../lib/format.js";
import { actorColor, filterRuns, matchesStatus, NO_VERSION, periodNumbers, resultCounts, runAgents, runCommands, runDays, runPeriods, runScope, runsCsv, runStatus, runTitle, type RunFilter, type RunStatusFilter } from "../lib/runs.js";
import { patch, runtime } from "../lib/runtime.js";
import { load, store } from "../lib/state.js";
import { icon } from "../icons.js";
import type { Page } from "../routes.js";
import { sparkline } from "../ui/charts.js";
import { emptyState, kpi, kpis, metaItem, pageHead, panel, progressBar } from "../ui/layout.js";
import { openChecklist, toast } from "../ui/overlays.js";
import { avatar, button, delta, filterButton, iconButton, searchInput, segmented, tip } from "../ui/primitives.js";
import { originChip, scopeTip, statusMark, when } from "../ui/run-view.js";
import { by, dataTable, redrawTable, registerTable, tableState, type Column } from "../ui/table.js";
import { tally, verdictBar } from "../ui/verdicts.js";

const TABLE = "runs-table";
const filter: RunFilter = { q: "", status: "all", agents: [], versions: [] };
const selected = new Set<string>();
let day: string | undefined;
let stopJobs: Array<() => void> = [];

function shownRuns(): RunRecord[] {
  return filterRuns(store.runs, { ...filter, day });
}

const columns: Column<RunRecord>[] = [
  { id: "status", label: "", width: "40px", title: "Status against expected_verdicts", render: (r) => statusMark(r) },
  {
    id: "run",
    label: "Run",
    sort: by.text(runTitle),
    render: (r) => `<div class="cell-2"><a class="row-link" href="${href("run", r.runId)}">${esc(runTitle(r))}</a><span class="sub mono">${esc(r.runId)}${r.version ? ` · v${esc(r.version)}` : ""}</span></div>`,
  },
  { id: "scope", label: "Scope", title: "Scenarios × agents × trials", sort: by.num((r) => r.results.length), render: (r) => `<span class="scope mono"${tip(scopeTip(r))}>${esc(runScope(r).text)}</span>` },
  { id: "verdicts", label: "Verdicts", width: "15%", render: (r) => verdictBar(tally(r.results), { size: "sm" }) },
  {
    id: "safe",
    label: "Safe",
    num: true,
    sort: by.num((r) => (r.results.length ? resultCounts(r.results).safe / r.results.length : null)),
    render: (r) => {
      const c = resultCounts(r.results);
      return `<span${tip(`${c.safe} of ${c.total} results ended SAFE_SUCCESS or SAFE_FAILURE`)}>${pct(c.safe, c.total)}</span>`;
    },
  },
  {
    id: "unexpected",
    label: "Unexpected",
    num: true,
    sort: by.num((r) => (runStatus(r).graded ? runStatus(r).unexpected : null)),
    render: (r) => {
      const s = runStatus(r);
      return s.graded ? (s.unexpected ? `<span class="bad-text strong">${s.unexpected}</span>` : `<span class="muted">0</span>`) : `<span class="faint"${tip("No expected verdicts for these results")}>—</span>`;
    },
  },
  { id: "duration", label: "Duration", num: true, sort: by.num((r) => r.durationMs), render: (r) => esc(duration(r.durationMs)) },
  { id: "by", label: "By", sort: by.text((r) => r.actor), render: (r) => (r.actor ? `<span class="actor">${avatar(r.actor, actorColor(r.actor, store.profile), "sm")}<span class="clip">${esc(r.actor)}</span></span>` : '<span class="faint">—</span>') },
  { id: "started", label: "Started", thCls: "when", cls: "when", sort: by.time((r) => r.startedAt), render: (r) => when(r.startedAt, store.prefs.time === "absolute") },
  { id: "origin", label: "", render: originChip },
];

function table(): string {
  const rows = shownRuns();
  const anyFilter = filter.q || filter.status !== "all" || filter.agents.length || filter.versions.length || day;
  return dataTable({
    id: TABLE,
    columns,
    rows,
    state: tableState(TABLE, { sort: "started", dir: "desc", pageSize: store.prefs.pageSize }),
    rowKey: (r) => r.runId,
    rowHref: (r) => href("run", r.runId),
    selected,
    cards: true,
    caption: "Runs",
    empty: anyFilter
      ? emptyState({ icon: "search", title: "No run matches these filters", text: "Change the search or the filters to see more runs.", actions: button("Clear filters", { action: "runs-clear", size: "sm" }), compact: true })
      : emptyState({ icon: "runs", title: "No runs", compact: true }),
  });
}

function filters(): string {
  const base = filterRuns(store.runs, { q: "", status: "all", agents: [], versions: [], day });
  const count = (s: RunStatusFilter) => base.filter((r) => matchesStatus(r, s)).length;
  const agents = agentOptions();
  const versions = versionOptions();
  const active = filter.q || filter.status !== "all" || filter.agents.length || filter.versions.length || day;
  return `${segmented(
    "runs-status",
    filter.status,
    [
      { value: "all", label: "All", count: count("all") },
      { value: "unexpected", label: "Unexpected", count: count("unexpected") },
      { value: "expected", label: "As expected", count: count("expected") },
      { value: "drafts", label: "Drafts", count: count("drafts") },
    ],
    { label: "Status" }
  )}${filterButton("Agent", "runs-agents", filter.agents.length, agents.length, { icon: "bot" })}${filterButton("Version", "runs-versions", filter.versions.length, versions.length, { icon: "flag" })}${
    day ? `<a class="tag on" href="#/runs"${tip("Runs started on this day, from the command center's chart. Click to show every day.")}>${icon("calendar", 12)}${esc(dayLabel(day))}${icon("x", 12, "x")}</a>` : ""
  }${active ? button("Clear", { action: "runs-clear", kind: "ghost", size: "sm", icon: "x" }) : ""}`;
}

function countText(): string {
  const shown = shownRuns().length;
  return shown === store.runs.length ? plural(shown, "run") : `${num(shown)} of ${plural(store.runs.length, "run")}`;
}

function agentOptions(): string[] {
  return [...new Set(store.runs.flatMap(runAgents))].sort();
}

function versionOptions(): string[] {
  const versions = [...new Set(store.runs.map((r) => r.version ?? NO_VERSION))];
  return versions.sort((a, b) => (a === NO_VERSION ? 1 : b === NO_VERSION ? -1 : b.localeCompare(a, undefined, { numeric: true })));
}

function bulkbar(): string {
  const n = selected.size;
  if (!n) return "";
  return `<div class="bulkbar" role="region" aria-label="Selected runs"><b>${n}</b><span>selected</span>${button("Compare", { action: "runs-compare", icon: "compare", size: "sm", disabled: n !== 2, title: n === 2 ? "Show the verdicts that changed between the two runs" : "Select exactly two runs to compare them" })}${button("Export CSV", { action: "runs-export", icon: "download", size: "sm" })}${button("Copy CLI commands", { action: "runs-cli", icon: "terminal", size: "sm" })}${iconButton("x", "Clear the selection", { action: "runs-unselect", size: "sm" })}</div>`;
}

/** Redraws what the filters change without drawing the search box again, so it keeps the focus. */
function refresh(): void {
  patch("runs-filters", filters());
  patch("runs-count", esc(countText()));
  redrawTable(TABLE);
}

function jobRow(j: Job): string {
  const link = j.kind === "run" ? `#/launch?job=${encodeURIComponent(j.jobId)}` : `#/sweep?job=${encodeURIComponent(j.jobId)}`;
  return `<li><a class="list-row job-row" href="${esc(link)}"><span class="glyph">${icon(j.kind === "run" ? "runs" : "grid", 14)}</span><span class="grow"><span class="title">${esc(j.label)}</span><span class="detail">${esc(j.detail)}</span></span><span class="job-progress">${progressBar(j.total ? j.done / j.total : null, { label: `${j.label}: ${j.done} of ${j.total}` })}<span class="mono">${num(j.done)}/${num(j.total)}</span></span><span class="feed-meta"${tip(`Started ${new Date(j.startedAt).toLocaleTimeString()}`)}>${esc(relTime(j.startedAt))}</span><span class="link-quiet">Watch ${icon("arrowRight", 12)}</span></a></li>`;
}

function jobList(): string {
  return store.jobs.filter((j) => j.status === "running").map(jobRow).join("");
}

function activeJobs(): string {
  const running = store.jobs.filter((j) => j.status === "running");
  if (!running.length) return "";
  return panel({ title: "Active jobs", icon: "activity", meta: `${plural(running.length, "job")} running on this server`, flush: true, cls: "mb-16" }, `<ul class="list" id="runs-jobs">${jobList()}</ul>`);
}

function weekKpis(): string {
  const { current, previous } = runPeriods(store.runs, 7);
  const now = periodNumbers(current);
  const before = periodNumbers(previous);
  const days = runDays(store.runs, 7);
  const hasPrev = previous.length > 0;
  const change = (a: number, b: number) => (hasPrev && b ? ((a - b) / b) * 100 : null);
  const trials = current.reduce((n, r) => n + r.results.reduce((m, x) => m + (x.trials ?? 1), 0), 0);
  const longest = [...current].sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))[0];
  return kpis([
    kpi({ label: "Runs · 7 days", icon: "runs", value: num(now.runs), delta: delta(change(now.runs, before.runs), { unit: "%", title: `${before.runs} in the 7 days before` }), spark: sparkline(days.map((d) => d.runs), { width: 120, min: 0, label: "runs by day" }), sub: hasPrev ? `${plural(before.runs, "run")} the 7 days before` : "nothing the 7 days before" }),
    kpi({ label: "Results", icon: "target", value: num(now.results), delta: delta(change(now.results, before.results), { unit: "%", title: `${before.results} in the 7 days before` }), spark: sparkline(days.map((d) => d.results), { width: 120, min: 0, label: "results by day" }), sub: `${num(trials)} trials graded`, href: "#/reports" }),
    kpi({
      label: "As expected",
      icon: "checkCircle",
      value: now.asExpected === null ? "—" : pct(now.graded - now.unexpected, now.graded),
      tone: now.asExpected === null ? "" : now.unexpected ? "warn" : "ok",
      delta: now.asExpected !== null && before.asExpected !== null ? delta((now.asExpected - before.asExpected) * 100, { unit: "pts", title: `${pct(before.graded - before.unexpected, before.graded)} the 7 days before` }) : "",
      spark: sparkline(days.map((d) => d.asExpected), { width: 120, min: 0, max: 1, color: "var(--ssucc)", label: "share as expected by day" }),
      sub: now.graded ? `${num(now.graded - now.unexpected)} of ${num(now.graded)} graded results` : "no expected verdicts in the period",
      href: "#/reports?unexpected=1",
    }),
    kpi({
      label: "Median duration",
      icon: "timer",
      value: duration(now.medianMs ?? undefined),
      delta: now.medianMs !== null && before.medianMs ? delta(((now.medianMs - before.medianMs) / before.medianMs) * 100, { unit: "%", inverse: true, title: `${duration(before.medianMs)} the 7 days before` }) : "",
      spark: sparkline(days.map((d) => d.medianMs), { width: 120, min: 0, label: "median duration by day" }),
      sub: longest ? `longest ${duration(longest.durationMs)} · ${longest.runId}` : "no runs in the period",
    }),
  ]);
}

function selectedRuns(): RunRecord[] {
  return store.runs.filter((r) => selected.has(r.runId));
}

const page: Page = {
  nav: "runs",
  title: () => "Runs",
  skeleton: "table",
  watches: ["runs"],
  async render(ctx) {
    await Promise.all([load.runs(), load.profile().catch(() => undefined), load.system().catch(() => undefined)]);
    const q = ctx.query.get("day") ?? "";
    day = /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : undefined;
    const runs = store.runs;
    const last = runs[0];
    const actors = new Set(runs.map((r) => r.actor).filter(Boolean)).size;
    const results = runs.reduce((n, r) => n + r.results.length, 0);
    const head = pageHead({
      eyebrow: `${icon("runs", 11)}Execute`,
      title: "Runs",
      desc: "Every run of the matrix in this workspace, from the history and this session: what ran, how the verdicts compare with expected_verdicts, and who started it.",
      meta: runs.length
        ? [
            metaItem("runs", `<b class="fg">${num(runs.length)}</b> runs · ${num(results)} results`),
            metaItem("clock", `Last run <b class="fg">${esc(relTime(last.finishedAt ?? last.startedAt))}</b>`),
            metaItem("users", plural(actors, "person", "people")),
            ...(store.system ? [metaItem("archive", `History keeps the last ${store.system.limits.keptRuns} runs`, store.system.history.path ?? "kept in memory for this session")] : []),
          ]
        : [metaItem("runs", "No runs yet")],
      actions: `${runs.length ? button("Export CSV", { action: "runs-export-all", icon: "download", title: "Download the runs shown as CSV" }) : ""}${button("Sweep", { href: "#/sweep", icon: "grid" })}${button("New run", { href: "#/launch", kind: "primary", icon: "play", kbd: "N" })}`,
    });
    if (!runs.length) {
      return `<div class="page runs-page">${head}${activeJobs()}${emptyState({
        icon: "runs",
        title: "No runs yet",
        text: "Start a run to grade agents against your scenarios. Each run lands here with its verdicts, and stays in the workspace history.",
        actions: `${button("New run", { href: "#/launch", kind: "primary", icon: "play" })}${button("Run the guided demo", { href: "#/demo?play=1", icon: "spark" })}`,
      })}</div>`;
    }
    registerTable(TABLE, table, { selected, onSelect: () => patch("runs-bulk", bulkbar()) });
    return `<div class="page runs-page">
  ${head}
  ${weekKpis()}
  ${activeJobs()}
  <div class="dt-toolbar">${searchInput({ id: "runs-q", value: filter.q, placeholder: "Search runs, scenarios, agents", label: "Search runs", kbd: "/" })}<span class="row row-wrap" id="runs-filters">${filters()}</span><span class="spacer"></span><span class="count" id="runs-count">${esc(countText())}</span></div>
  ${table()}
  <div id="runs-bulk">${bulkbar()}</div>
</div>`;
  },
  mount() {
    for (const j of store.jobs.filter((x) => x.status === "running")) stopJobs.push(onJob(j.jobId, () => patch("runs-jobs", jobList())));
  },
  unmount() {
    for (const stop of stopJobs) stop();
    stopJobs = [];
  },
  inputs: {
    "runs-q": (el) => {
      filter.q = el.value;
      tableState(TABLE).page = 1;
      patch("runs-count", esc(countText()));
      patch("runs-filters", filters());
      redrawTable(TABLE);
    },
  },
  actions: {
    "runs-status": (el) => {
      filter.status = el.dataset.value as RunStatusFilter;
      tableState(TABLE).page = 1;
      refresh();
    },
    "runs-agents": (el) =>
      openChecklist(el, {
        title: "Agents",
        search: true,
        options: agentOptions().map((a) => ({ value: a, label: a, checked: filter.agents.includes(a), extra: `<span class="menu-hint">${store.runs.filter((r) => runAgents(r).includes(a)).length}</span>` })),
        onChange: (values) => {
          filter.agents = values;
          tableState(TABLE).page = 1;
          refresh();
        },
      }),
    "runs-versions": (el) =>
      openChecklist(el, {
        title: "Agent versions",
        options: versionOptions().map((v) => ({ value: v, label: v === NO_VERSION ? "No version" : `v${v}`, checked: filter.versions.includes(v), extra: `<span class="menu-hint">${store.runs.filter((r) => (r.version ?? NO_VERSION) === v).length}</span>` })),
        onChange: (values) => {
          filter.versions = values;
          tableState(TABLE).page = 1;
          refresh();
        },
      }),
    "runs-clear": () => {
      Object.assign(filter, { q: "", status: "all", agents: [], versions: [] });
      const input = document.getElementById("runs-q") as HTMLInputElement | null;
      if (input) input.value = "";
      if (day) return runtime.navigate("#/runs");
      refresh();
    },
    "runs-unselect": () => {
      selected.clear();
      patch("runs-bulk", "");
      redrawTable(TABLE);
    },
    "runs-compare": () => {
      const [after, before] = selectedRuns().sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      if (!after || !before) return;
      runtime.navigate(withQuery(href("run", after.runId), { compare: before.runId }));
    },
    "runs-export": () => {
      const runs = selectedRuns();
      download(`agentcrucible-runs-${runs.length}.csv`, runsCsv(runs), "text/csv");
      toast(`Exported ${plural(runs.length, "run")} as CSV.`, "ok", { ms: 2500 });
    },
    "runs-export-all": () => {
      const runs = shownRuns();
      download("agentcrucible-runs.csv", runsCsv(runs), "text/csv");
      toast(`Exported ${plural(runs.length, "run")} as CSV.`, "ok", { ms: 2500 });
    },
    "runs-cli": (el) => {
      const text = selectedRuns()
        .map((r) => `# ${r.runId} · ${runTitle(r)}\n${r.draft ? "# a draft run: the editor's text is not saved, so the command line cannot repeat it" : runCommands(r).join("\n")}`)
        .join("\n\n");
      return copy(`${text}\n`, el);
    },
  },
};

export default page;
