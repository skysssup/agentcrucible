/**
 * Every result the workspace knows, once each: saved reports, this session's runs, and the
 * history. Filters come from the address, so the links on other pages open a ready-made view.
 * Select results to compare them with the baseline, save them, or delete them.
 */
import { VERDICTS } from "../../../types.js";
import { isSafe } from "../lib/analytics.js";
import { copy, download } from "../lib/dom.js";
import { absTime, clip, esc, href, num, pct, plural, relTime, withQuery } from "../lib/format.js";
import { activeFilters, deletableKey, filterResults, filtersHref, NO_FILTERS, parseFilters, resultList, resultsCsv, SOURCES, severity, verdictCounts, type ReportFilters, type ResultList, type ResultRow } from "../lib/results.js";
import { patch, runtime } from "../lib/runtime.js";
import { load, store } from "../lib/state.js";
import { icon } from "../icons.js";
import type { Page } from "../routes.js";
import { callout, emptyState, kpi, kpis, metaItem, pageHead, panel } from "../ui/layout.js";
import { openMenu, toast } from "../ui/overlays.js";
import { button, codeChip, iconButton, searchInput, segmented, select, tip } from "../ui/primitives.js";
import { canSave, compareWithBaseline, deleteReports, saveAsBaseline, saveReports } from "../ui/results.js";
import { arrange, by, dataTable, registerTable, tableState, type Column } from "../ui/table.js";
import { expectedMark, rateMeter, tally, verdictBar, verdictText, VERDICT_META } from "../ui/verdicts.js";

const TABLE = "reports-table";

let filters: ReportFilters = { ...NO_FILTERS };
let appliedHash: string | undefined;
let all: ResultList = { rows: [], unreadable: [] };
const selected = new Set<string>();

const SOURCE_LABEL = { saved: "Saved", session: "This session", history: "History" } as const;
const SOURCE_ICON = { saved: "save", session: "clock", history: "history" } as const;

/** Where a result lives, as a short label with an icon. */
export function sourceTag(row: Pick<ResultRow, "source" | "file">): string {
  const label = row.file && row.source !== "saved" ? `${SOURCE_LABEL[row.source]}, saved` : SOURCE_LABEL[row.source];
  const title = row.file ? `Saved as ${row.file}` : row.source === "session" ? "Held in memory until the server stops; save it to keep it" : row.source === "history" ? "Kept in the workspace history; the report is regenerated from its seed" : "";
  return `<span class="rl-src"${title ? tip(title) : ""}>${icon(row.file ? "save" : SOURCE_ICON[row.source], 12)}${esc(label)}</span>`;
}

const columns: Column<ResultRow>[] = [
  {
    id: "scenario",
    label: "Result",
    sort: by.text((r) => r.scenarioId),
    render: (r) => `<div class="cell-2"><a class="row-link" href="${esc(href("report", r.key))}">${esc(r.scenarioId)}</a><span class="rl-reason"${r.reason.length > 120 ? tip(r.reason) : ""}>${esc(clip(r.reason, 120))}</span></div>`,
  },
  { id: "agent", label: "Agent", sort: by.text((r) => r.agentId), render: (r) => `<a class="link-mono" href="${esc(href("agent", r.agentId))}">${esc(r.agentId)}</a>` },
  {
    id: "verdict",
    label: "Verdict",
    sort: (a, b) => severity(a) - severity(b),
    render: (r) => `${verdictText(r.verdict)}${r.expected ? ` <span class="small">${expectedMark(r)}</span>` : ""}`,
  },
  {
    id: "trials",
    label: "Trials",
    num: true,
    sort: by.num((r) => r.trials),
    render: (r) => `${num(r.trials)}${r.flaky ? ` <span${tip("The trials ended with different verdicts")}>${icon("split", 12, "warn-text")}</span>` : ""}`,
  },
  { id: "rule", label: "Deciding rule", sort: by.text((r) => r.rule), render: (r) => (r.rule ? codeChip(r.rule) : '<span class="faint">—</span>') },
  { id: "source", label: "Source", sort: by.text((r) => r.source), render: sourceTag },
  { id: "when", label: "When", thCls: "when", cls: "when", sort: by.time((r) => r.at), render: (r) => `<span${tip(absTime(r.at))}>${esc(relTime(r.at))}</span>` },
  { id: "menu", label: "", cls: "row-actions", render: (r) => iconButton("moreH", `Actions for ${r.scenarioId} with ${r.agentId}`, { action: "row-menu", size: "sm", data: { key: r.key } }) },
];

/** Why the list is empty: nothing exists, or the filters leave nothing. */
export function emptyList(total: number, f: ReportFilters): string {
  if (!total)
    return emptyState({
      icon: "file",
      title: "No reports yet",
      text: `Results appear here when you run scenarios. Runs from this session stay in memory until the server stops; save them to keep them as files under <code>${esc(store.outDir || "the reports directory")}</code>. Runs kept in the history are listed too.`,
      actions: `${button("Guided demo", { href: "#/demo", icon: "spark" })}${button("Start a run", { href: "#/launch", kind: "primary", icon: "play" })}`,
    });
  const n = activeFilters(f);
  return emptyState({
    icon: "search",
    title: "No report matches",
    text: `${plural(total, "result")} exist${total === 1 ? "s" : ""}, but none matches ${n === 1 ? "this filter" : `these ${n} filters`}. Clear a filter or widen the search.`,
    actions: button("Clear the filters", { action: "clear-filters", size: "sm" }),
  });
}

function selectionBar(rows: ResultRow[]): string {
  const picked = rows.filter((r) => selected.has(r.key));
  const hasBaseline = Boolean(store.baseline?.baseline);
  const saveable = picked.filter((r) => canSave(r.key) && !r.file).length;
  const deletable = picked.filter((r) => deletableKey(r)).length;
  return `<span><b>${picked.length}</b> selected</span>
  ${button("Compare with the baseline", { action: "compare-selected", icon: "compare", size: "sm", disabled: !hasBaseline, title: hasBaseline ? "Check the selected results against the baseline, as CI does" : "There is no baseline yet; save one first" })}
  ${button("Save as reports", { action: "save-selected", icon: "save", size: "sm", disabled: !saveable, title: saveable ? "Write the JSON, HTML, and JUnit files" : "Everything selected is saved already" })}
  ${button("Delete", { action: "delete-selected", icon: "trash", size: "sm", kind: "danger", disabled: !deletable, title: deletable ? "Delete saved files and session results; the history keeps its results" : "The history keeps its results; there is nothing here to delete" })}
  <span class="spacer"></span>
  ${button("Save as the baseline", { action: "baseline-selected", icon: "compare", size: "sm", kind: "primary", title: "Replace the baseline with the selected results" })}
  ${iconButton("x", "Clear the selection", { action: "clear-selection", size: "sm" })}`;
}

function drawSelection(): void {
  const bar = document.getElementById("rl-selbar");
  if (!bar) return;
  const rows = filterResults(all.rows, filters);
  const n = rows.filter((r) => selected.has(r.key)).length;
  bar.hidden = n === 0;
  bar.innerHTML = selectionBar(rows);
}

function table(rows: ResultRow[]): string {
  const state = tableState(TABLE, { sort: "when", dir: "desc", pageSize: store.prefs.pageSize });
  return dataTable({ id: TABLE, columns, rows, state, rowKey: (r) => r.key, selected, cards: true, empty: emptyList(all.rows.length, filters), caption: "Results" });
}

function unreadablePanel(): string {
  if (!all.unreadable.length) return "";
  return `<div class="mt-16">${panel(
    { title: "Saved files that cannot be read", icon: "alert", meta: plural(all.unreadable.length, "file"), flush: true },
    `<ul class="list">${all.unreadable
      .map((r) => `<li class="list-row"><span class="grow"><span class="title mono">${esc(r.file ?? r.key)}</span><span class="detail bad-text">${esc(r.error)}</span></span>${iconButton("trash", `Delete ${r.file ?? r.key}`, { action: "delete-one", size: "sm", data: { key: r.key } })}</li>`)
      .join("")}</ul>`
  )}</div>`;
}

/** The count line and the table: the part of the page that follows the filters. */
function results(): string {
  const rows = filterResults(all.rows, filters);
  const n = activeFilters(filters);
  registerTable(TABLE, () => table(rows), { selected, onSelect: drawSelection });
  const line = `<div class="rl-bar"><span class="rl-count">${n ? `<b>${num(rows.length)}</b> of ${plural(all.rows.length, "result")}` : `<b>${num(rows.length)}</b> ${rows.length === 1 ? "result" : "results"}`}${rows.length ? `<span class="sep-dot"></span>${esc(pct(rows.filter((r) => isSafe(r.verdict)).length, rows.length))} ended safe` : ""}</span>${n ? button("Clear the filters", { action: "clear-filters", kind: "ghost", size: "sm", icon: "x" }) : ""}</div>`;
  return `${line}${table(rows)}`;
}

function toggle(action: string, label: string, on: boolean, n: number, title: string): string {
  return `<button type="button" class="rl-chip rl-toggle${on ? " on" : ""}" data-action="${action}" aria-pressed="${on}" title="${esc(title)}">${esc(label)}<span class="seg-count">${n}</span></button>`;
}

function options(label: string, values: string[]): Array<{ value: string; label: string }> {
  return [{ value: "", label }, ...[...new Set(values)].sort().map((v) => ({ value: v, label: v }))];
}

function controls(): string {
  const rows = all.rows;
  const c = verdictCounts(rows);
  const present = VERDICTS.filter((v) => c[v] || filters.verdict === v);
  const keep = (v: string, list: string[]) => (v && !list.includes(v) ? [...list, v] : list);
  return `<div class="rl-bar">
    ${searchInput({ id: "report-q", value: filters.q, placeholder: "Search scenario, agent, rule, reason, file, run", kbd: "/", label: "Search results" })}
    ${segmented("rep-verdict", filters.verdict, [{ value: "", label: "All", count: rows.length }, ...(c.critical ? [{ value: "critical", label: "Critical", count: c.critical, title: "HARMFUL_ACTION or SILENT_FAILURE" }] : []), ...present.map((v) => ({ value: v, label: VERDICT_META[v].short, count: c[v], title: v }))], { label: "Filter by verdict", wrap: true })}
  </div>
  <div class="rl-bar">
    ${toggle("rep-unexpected", "Unexpected", filters.unexpected, rows.filter((r) => r.unexpected).length, "Results that differ from the scenario's expected_verdicts")}
    ${toggle("rep-flaky", "Flaky", filters.flaky, rows.filter((r) => r.flaky).length, "Results whose trials ended with different verdicts")}
    ${select({ input: "rep-agent", value: filters.agent, label: "Agent", width: "170px", options: options("All agents", keep(filters.agent, rows.map((r) => r.agentId))) })}
    ${select({ input: "rep-scenario", value: filters.scenario, label: "Scenario", width: "210px", options: options("All scenarios", keep(filters.scenario, rows.map((r) => r.scenarioId))) })}
    ${select({ input: "rep-rule", value: filters.rule, label: "Deciding rule", width: "210px", options: options("All rules", keep(filters.rule, rows.flatMap((r) => r.rules))) })}
    ${select({ input: "rep-source", value: filters.source, label: "Source", width: "140px", options: [{ value: "", label: "All sources" }, ...SOURCES.map((s) => ({ value: s, label: SOURCE_LABEL[s] }))] })}
  </div>`;
}

function syncAddress(): void {
  const target = filtersHref(filters);
  if (location.hash !== target) history.replaceState(null, "", target);
  appliedHash = location.hash;
}

function setFilters(next: Partial<ReportFilters>): Promise<void> {
  filters = { ...filters, ...next };
  syncAddress();
  return runtime.rerender();
}

function redrawResults(): void {
  syncAddress();
  patch("rl-results", results());
  drawSelection();
}

function pickedRows(): ResultRow[] {
  return all.rows.filter((r) => selected.has(r.key));
}

function rowMenu(el: HTMLElement): void {
  const row = all.rows.find((r) => r.key === el.dataset.key);
  if (!row) return;
  const del = deletableKey(row);
  openMenu(
    [
      { heading: `${row.scenarioId} · ${row.agentId}` },
      { label: "Open the report", icon: "file", href: href("report", row.key) },
      { label: "Open the scenario", icon: "layers", href: href("scenario", row.scenarioId) },
      { label: "Open the agent", icon: "bot", href: href("agent", row.agentId) },
      ...(row.run ? [{ label: `Open ${row.run.runId}`, icon: "runs" as const, href: href("run", row.run.runId) }] : []),
      { label: "Other results of this pair", icon: "filter", href: withQuery("#/reports", { scenario: row.scenarioId, agent: row.agentId }) },
      "-",
      { label: "Copy the report key", icon: "copy", hint: clip(row.key, 24), run: () => void copy(row.key) },
      ...(canSave(row.key) && !row.file ? [{ label: "Save as a report", icon: "save" as const, run: () => void saveReports([row.key]) }] : []),
      ...(del ? ["-" as const, { label: "Delete", icon: "trash" as const, danger: true, run: () => void deleteReports([del]) }] : []),
    ],
    el,
    { align: "end" }
  );
}

const page: Page = {
  nav: "reports",
  title: () => "Reports",
  skeleton: "table",
  watches: ["reports", "runs", "baseline"],
  async render(ctx) {
    await Promise.all([load.runs(), load.reports(), load.baseline().catch(() => undefined)]);
    if (location.hash !== appliedHash) {
      filters = parseFilters(ctx.query);
      appliedHash = location.hash;
      selected.clear();
    }
    all = resultList(store.runs, store.memory, store.saved);
    for (const key of [...selected]) if (!all.rows.some((r) => r.key === key)) selected.delete(key);
    const rows = all.rows;
    const saved = rows.filter((r) => r.file).length;
    const unexpected = rows.filter((r) => r.unexpected).length;
    const critical = rows.filter((r) => r.critical).length;
    const flaky = rows.filter((r) => r.flaky).length;
    const safe = rows.filter((r) => isSafe(r.verdict)).length;
    const head = pageHead({
      eyebrow: `${icon("file", 11)}Results`,
      title: "Reports",
      desc: "Every graded result in this workspace, each listed once: files saved on disk, runs from this session, and runs kept in the history. Open one for its call-by-call timeline, or select several to compare them with the baseline.",
      meta: [
        metaItem("save", `<b class="fg">${num(saved)}</b> saved`),
        metaItem("folder", `<code>${esc(store.outDir || "no reports directory")}</code>`, store.outDir),
        metaItem("compare", store.baseline?.baseline ? `Baseline <b class="fg">${plural(store.baseline.baseline.entries.length, "entry", "entries")}</b>` : "No baseline"),
      ],
      actions: `${button("Export CSV", { action: "export-csv", icon: "download", title: "Download the results shown as CSV" })}${button("Open the baseline", { href: "#/baseline", icon: "compare" })}${button("New run", { href: "#/launch", kind: "primary", icon: "play", kbd: "N" })}`,
    });
    if (!rows.length && !all.unreadable.length) return `<div class="page">${head}${panel({}, emptyList(0, filters))}</div>`;
    const strip = kpis([
      kpi({ label: "Results", icon: "file", value: num(rows.length), sub: `${num(saved)} saved · ${num(rows.length - saved)} not saved`, href: "#/reports" }),
      kpi({ label: "Safe share", icon: "shieldCheck", value: pct(safe, rows.length), sub: `${num(safe)} ended safe` }),
      kpi({ label: "Critical", icon: "octagon", value: critical, tone: critical ? "bad" : "", sub: "harmful or silent", href: "#/reports?verdict=critical" }),
      kpi({ label: "Unexpected", icon: "xCircle", value: unexpected, tone: unexpected ? "warn" : "ok", sub: "differ from expected_verdicts", href: "#/reports?unexpected=1" }),
      kpi({ label: "Flaky", icon: "split", value: flaky, tone: flaky ? "warn" : "", sub: "trials disagree", href: "#/reports?flaky=1" }),
    ]);
    const mix = tally(rows.map((r) => ({ verdict: r.verdict })));
    return `<div class="page">
  ${head}
  ${strip}
  <div class="rl-mix">${verdictBar(mix, { size: "sm" })}</div>
  ${all.unreadable.length ? callout("warn", `${esc(plural(all.unreadable.length, "saved file"))} could not be read and ${all.unreadable.length === 1 ? "is" : "are"} listed at the bottom of the page.`, { icon: "alert" }) : ""}
  ${controls()}
  <div class="rl-selbar" id="rl-selbar"${selected.size ? "" : " hidden"}>${selectionBar(filterResults(rows, filters))}</div>
  <div id="rl-results">${results()}</div>
  ${unreadablePanel()}
</div>`;
  },
  actions: {
    "rep-verdict": (el) => setFilters({ verdict: el.dataset.value ?? "" }),
    "rep-unexpected": () => setFilters({ unexpected: !filters.unexpected }),
    "rep-flaky": () => setFilters({ flaky: !filters.flaky }),
    "clear-filters": () => setFilters({ ...NO_FILTERS }),
    "row-menu": (el) => rowMenu(el),
    "clear-selection": () => {
      selected.clear();
      return runtime.rerender();
    },
    "export-csv": () => {
      const rows = filterResults(all.rows, filters);
      const { sorted } = arrange(rows, columns, tableState(TABLE));
      download("reports.csv", resultsCsv(sorted), "text/csv");
      toast(`${plural(sorted.length, "result")} exported.`, "ok");
    },
    "compare-selected": async (el) => {
      const rows = pickedRows();
      await compareWithBaseline(rows.map((r) => r.key), { label: `${plural(rows.length, "selected result")}`, el });
      runtime.navigate("#/baseline");
    },
    "baseline-selected": async (el) => {
      if (await saveAsBaseline(pickedRows().map((r) => r.key), { el })) runtime.navigate("#/baseline");
    },
    "save-selected": async (el) => {
      await saveReports(pickedRows().map((r) => r.key), { el });
    },
    "delete-selected": async (el) => {
      const keys = pickedRows().map(deletableKey).filter((k): k is string => Boolean(k));
      if (await deleteReports(keys, { el })) selected.clear();
    },
    "delete-one": async (el) => {
      await deleteReports([el.dataset.key ?? ""], { el });
    },
  },
  inputs: {
    "report-q": (el) => {
      filters = { ...filters, q: el.value };
      redrawResults();
    },
    "rep-agent": (el) => void setFilters({ agent: el.value }),
    "rep-scenario": (el) => void setFilters({ scenario: el.value }),
    "rep-rule": (el) => void setFilters({ rule: el.value }),
    "rep-source": (el) => void setFilters({ source: el.value as ReportFilters["source"] }),
  },
};

export default page;
