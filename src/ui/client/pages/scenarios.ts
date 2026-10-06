/**
 * The scenario library: every scenario with its worlds, faults, checks, expected verdicts, and how
 * the latest result of each agent stands, with search, facets, sorting, grouping, bulk actions,
 * and a menu per row.
 */
import type { ScenarioSummary } from "../../api.js";
import { observations } from "../lib/analytics.js";
import { copy, download } from "../lib/dom.js";
import { absTime, csv, esc, firstSentence, href, plural, relTime } from "../lib/format.js";
import { patch, runtime } from "../lib/runtime.js";
import { load, store } from "../lib/state.js";
import { icon } from "../icons.js";
import type { Page } from "../routes.js";
import { callout, emptyState, metaItem, pageHead, panel } from "../ui/layout.js";
import { openChecklist, openMenu, type MenuItem } from "../ui/overlays.js";
import { button, faultTag, filterButton, iconButton, searchInput, segmented, tip, toggle, worldChip, WORLD_ICONS } from "../ui/primitives.js";
import { checksLabel, deleteScenarios, duplicateInEditor, healthBar, healthByScenario, kindsOf, latestLines, runHref, scenarioCommand, sweepHref, type Health } from "../ui/scenario-kit.js";
import { by, dataTable, redrawTable, registerTable, tableState, type Column, type TableState } from "../ui/table.js";
import { vdot } from "../ui/verdicts.js";

export interface ScenarioFilter {
  q: string;
  tag: string;
  world: string;
  /** Show only these scenario ids, as the Coverage page links to them. */
  ids?: string[];
  /** Show scenarios that inject any of these fault kinds. */
  kinds?: string[];
  source?: "" | "bundled" | "project";
  /** Show only these ids: the scenarios whose latest results need attention. */
  attention?: ReadonlySet<string>;
}

/** The scenarios that pass every filter; the text query matches ids, descriptions, tasks, tags, and faults. */
export function filterScenarios(scenarios: ScenarioSummary[], f: ScenarioFilter): ScenarioSummary[] {
  const q = f.q.trim().toLowerCase();
  return scenarios.filter(
    (s) =>
      (!f.ids?.length || f.ids.includes(s.id)) &&
      (!f.tag || s.tags.includes(f.tag)) &&
      (!f.world || s.worlds.includes(f.world)) &&
      (!f.kinds?.length || kindsOf(s).some((k) => f.kinds!.includes(k))) &&
      (!f.source || (f.source === "bundled") === s.bundled) &&
      (!f.attention || f.attention.has(s.id)) &&
      (!q || [s.id, s.description, s.task, ...s.tags, ...s.faults].some((t) => t.toLowerCase().includes(q)))
  );
}

/** The scenarios as CSV, with how their latest results stand. */
export function scenariosCsv(rows: ScenarioSummary[], health: Map<string, Health>): string {
  return csv([
    ["id", "worlds", "tags", "faults", "checks", "expected_verdicts", "source", "origin", "latest_results", "latest_safe_share", "last_run"],
    ...rows.map((s) => {
      const h = health.get(s.id);
      return [
        s.id,
        s.worlds.join(" "),
        s.tags.join(" "),
        s.faults.join("; "),
        checksLabel(s),
        Object.entries(s.expectedVerdicts).map(([a, v]) => `${a}=${v}`).join(" "),
        s.source ?? "",
        s.bundled ? "bundled" : "project",
        h ? latestLines(h).join("; ") : "",
        h?.rate === null || h?.rate === undefined ? "" : h.rate.toFixed(2),
        h?.lastAt ?? "",
      ];
    }),
  ]);
}

const TABLE = "scenario-library";

const filter = { q: "", tag: "", world: "", kinds: [] as string[], source: "" as "" | "bundled" | "project", attention: false };
let ids: string[] = [];
let grouped = false;
const selected = new Set<string>();
let all: ScenarioSummary[] = [];
let health = new Map<string, Health>();

const folder = (s: ScenarioSummary) => s.id.split("/")[0];

function attentionIds(): Set<string> {
  return new Set([...health].filter(([, h]) => h.attention.length).map(([id]) => id));
}

function current(over: Partial<ScenarioFilter> = {}): ScenarioFilter {
  return { q: filter.q, tag: filter.tag, world: filter.world, ids, kinds: filter.kinds, source: filter.source, attention: filter.attention ? attentionIds() : undefined, ...over };
}

function filtersActive(): boolean {
  return Boolean(filter.q.trim() || filter.tag || filter.world || filter.kinds.length || filter.source || filter.attention);
}

function resetFilters(): void {
  Object.assign(filter, { q: "", tag: "", world: "", kinds: [], source: "", attention: false });
}

function count(list: ScenarioSummary[], test: (s: ScenarioSummary) => boolean): number {
  return list.filter(test).length;
}

function worldsControl(): string {
  const pool = filterScenarios(all, current({ world: "" }));
  const worlds = [...new Set(all.flatMap((s) => s.worlds))].sort();
  return segmented("world", filter.world, [{ value: "", label: "All worlds", count: pool.length }, ...worlds.map((w) => ({ value: w, label: w, count: count(pool, (s) => s.worlds.includes(w)), icon: WORLD_ICONS[w] ?? "cube" }))], { label: "World", wrap: true });
}

function filtersControl(): string {
  const bySource = filterScenarios(all, current({ source: "" }));
  const kinds = [...new Set(all.flatMap(kindsOf))];
  const attention = filterScenarios(all, current({ attention: undefined })).filter((s) => health.get(s.id)?.attention.length).length;
  return `${segmented("source", filter.source, [
    { value: "", label: "All", count: bySource.length },
    { value: "bundled", label: "Bundled", count: count(bySource, (s) => s.bundled), title: "Scenarios that ship with AgentCrucible" },
    { value: "project", label: "Project", count: count(bySource, (s) => !s.bundled), title: "Scenarios written for this project" },
  ], { label: "Source" })}${filterButton("Fault kind", "kinds", filter.kinds.length, kinds.length, { icon: "zap" })}<span class="scn-attn"${tip("Scenarios whose latest result differs from expected_verdicts, or is HARMFUL_ACTION or SILENT_FAILURE with no expected verdict to explain it")}>${toggle({ checked: filter.attention, label: "Needs attention", attrs: 'data-input="attention"' })}<b class="scn-attn-n${attention ? " on" : ""}">${attention}</b></span><span class="spacer"></span>${segmented("group", grouped ? "folder" : "flat", [
    { value: "flat", label: "List", icon: "list" },
    { value: "folder", label: "By folder", icon: "folder" },
  ], { label: "Layout" })}`;
}

function tagsControl(): string {
  const pool = filterScenarios(all, current({ tag: "" }));
  const tags = [...new Set(all.flatMap((s) => s.tags))]
    .map((t) => ({ t, n: count(pool, (s) => s.tags.includes(t)) }))
    .sort((a, b) => b.n - a.n || a.t.localeCompare(b.t));
  return `<span class="scn-tags-label">${icon("hash", 13)}Tags</span>${tags.map(({ t, n }) => `<button type="button" class="tag${t === filter.tag ? " on" : ""}${n ? "" : " empty"}" data-action="tag" data-value="${esc(t)}" aria-pressed="${t === filter.tag}">${esc(t)}<span class="tag-n">${n}</span></button>`).join("")}`;
}

function statusLine(shown: number): string {
  const chips = [
    ids.length ? `<span class="scn-chip">${icon("shieldCheck", 12)}${plural(ids.length, "scenario")} from Coverage<a href="#/scenarios" class="scn-chip-x" aria-label="Show every scenario" title="Show every scenario">${icon("x", 11)}</a></span>` : "",
    filtersActive() ? `<button type="button" class="btn btn-link btn-sm" data-action="clear-filters">Clear filters</button>` : "",
  ].join("");
  return `<span><b class="fg">${shown}</b> of ${plural(all.length, "scenario")}</span>${chips}`;
}

function runButton(): string {
  const n = selected.size;
  if (n) return button(`Run ${n} selected`, { href: runHref([...selected]), kind: "primary", icon: "play", title: `Open the launcher with the ${plural(n, "selected scenario")}` });
  const shown = filterScenarios(all, current()).map((s) => s.id);
  const label = filtersActive() || ids.length ? `Run ${shown.length} shown` : `Run all ${shown.length}`;
  return button(shown.length ? label : "Run selection", { href: runHref(shown), kind: "primary", icon: "play", disabled: !shown.length, title: "Open the launcher with every scenario shown; select rows to run fewer" });
}

/** The selected scenarios whose files the project owns, which are the only ones the API deletes. */
function ownFiles(): ScenarioSummary[] {
  return store.meta.scenarioDir ? all.filter((s) => selected.has(s.id) && !s.bundled && s.source) : [];
}

function bulkBar(): string {
  if (!selected.size) return "";
  const n = selected.size;
  const hidden = [...selected].filter((id) => !filterScenarios(all, current()).some((s) => s.id === id)).length;
  return `<div class="bulkbar" role="region" aria-label="Selected scenarios"><b>${n}</b><span>selected${hidden ? ` · ${hidden} hidden by filters` : ""}</span>${button(`Run ${plural(n, "scenario")}`, { href: runHref([...selected]), kind: "primary", icon: "play", size: "sm" })}${button("Sweep", { action: "bulk-sweep", icon: "grid", size: "sm", iconEnd: "chevronDown", attrs: 'aria-haspopup="menu"', title: "Open the sweep page for one of the selected scenarios" })}${button("Copy CLI commands", { action: "bulk-copy", icon: "terminal", size: "sm" })}${button("Export CSV", { action: "bulk-csv", icon: "download", size: "sm" })}${ownFiles().length ? button(`Delete ${ownFiles().length}`, { action: "bulk-delete", icon: "trash", kind: "danger", size: "sm", title: store.meta.scenarioDir ? "Delete the selected project scenario files; bundled scenarios stay" : "" }) : ""}${iconButton("x", "Clear the selection", { action: "bulk-clear", size: "sm" })}</div>`;
}

function syncSelection(): void {
  patch("scn-bulk", bulkBar());
  patch("scn-run", runButton());
}

function faultsCell(s: ScenarioSummary): string {
  if (!s.faults.length) return '<span class="muted small">no faults</span>';
  const [first] = s.faults;
  const kind = kindsOf(s)[0] ?? first.split(" ")[0];
  const where = first.slice(kind.length).replace(/^ on /, "");
  const more = s.faults.length > 1 ? `<span class="scn-more"${tip(s.faults.join("\n"))}>+${s.faults.length - 1}</span>` : "";
  return `<div class="cell-2 scn-faults">${faultTag(kind, first)}<span class="sub">${esc(where)}${more}</span></div>`;
}

function expectedCell(s: ScenarioSummary): string {
  const entries = Object.entries(s.expectedVerdicts);
  if (!entries.length) return `<span class="muted small"${tip("No expected_verdicts: agentcrucible check skips this scenario")}>none</span>`;
  return `<span class="scn-exp"${tip(entries.map(([a, v]) => `${a}: ${v}`).join("\n"))}><span class="vdots">${entries.map(([, v]) => vdot(v)).join("")}</span><b>${entries.length}</b></span>`;
}

function columns(state: TableState): Column<ScenarioSummary>[] {
  const sorted = (cmp: (a: ScenarioSummary, b: ScenarioSummary) => number) => (grouped ? (a: ScenarioSummary, b: ScenarioSummary) => (state.dir === "asc" ? 1 : -1) * folder(a).localeCompare(folder(b)) || cmp(a, b) : cmp);
  return [
    { id: "id", label: "Scenario", sort: sorted(by.text((s) => s.id)), cls: "scn-main", render: (s) => `<div class="cell-2" data-id="${esc(s.id)}"><a class="row-link mono" href="${href("scenario", s.id)}">${esc(s.id)}</a><span class="sub"${tip(s.description)}>${esc(firstSentence(s.description))}</span></div>` },
    { id: "worlds", label: "Worlds", cls: "scn-worlds", render: (s) => `<span class="chip-row">${s.worlds.map(worldChip).join("")}</span>` },
    { id: "faults", label: "Faults", sort: sorted(by.num((s) => s.faults.length)), cls: "scn-fault-col", render: faultsCell },
    { id: "checks", label: "Checks", cls: "scn-checks", thCls: "scn-checks", render: (s) => `<span class="${s.hasExpect ? "" : "warn-text"}">${esc(checksLabel(s))}</span>` },
    { id: "expected", label: "Expected", title: "Agents with an expected verdict", render: expectedCell },
    { id: "health", label: "Health", title: "The latest result of each agent, and the share that ended safe", sort: sorted(by.num((s) => health.get(s.id)?.rate)), cls: "scn-health", render: (s) => healthBar(health.get(s.id)) },
    { id: "last", label: "Last run", sort: sorted(by.time((s) => health.get(s.id)?.lastAt)), thCls: "when", cls: "when", render: (s) => (health.get(s.id)?.lastAt ? `<span${tip(absTime(health.get(s.id)?.lastAt))}>${esc(relTime(health.get(s.id)?.lastAt))}</span>` : '<span class="faint">—</span>') },
    { id: "source", label: "Source", cls: "scn-source", thCls: "scn-source", render: (s) => (s.bundled ? `<span class="src-tag"${tip(s.source ?? "bundled")}>bundled</span>` : `<span class="pill outline"${tip(s.source ?? "inline")}>project</span>`) },
    { id: "more", label: "Actions", cls: "actions scn-more-col", thCls: "sr-col", render: (s) => iconButton("moreH", `Actions for ${s.id}`, { action: "row-menu", size: "sm", data: { id: s.id } }) },
  ];
}

function emptyTable(): string {
  if (!all.length)
    return emptyState({ icon: "layers", title: "No scenarios yet", text: "A scenario names a world, a task, the faults to inject, and what a correct run commits. Write one in the editor.", actions: button("New scenario", { href: "#/editor", kind: "primary", icon: "plus", size: "sm" }) });
  return emptyState({ icon: "search", title: "No scenario matches", text: "Nothing passes every filter. Remove one, or clear them all.", actions: `${button("Clear filters", { action: "clear-filters", size: "sm" })}${ids.length ? button("Show every scenario", { href: "#/scenarios", kind: "ghost", size: "sm" }) : ""}`, compact: true });
}

function tableDefaults() {
  return tableState(TABLE, { sort: "id", dir: "asc", pageSize: store.prefs.pageSize });
}

function table(picked = selected): string {
  const state = tableDefaults();
  return dataTable({ id: TABLE, columns: columns(state), rows: filterScenarios(all, current()), state, rowKey: (s) => s.id, rowHref: (s) => href("scenario", s.id), rowCls: (s) => (health.get(s.id)?.attention.length ? "scn-attn-row" : ""), selected: picked, empty: emptyTable(), cards: true, groupBy: grouped ? folder : undefined, flush: true, caption: "Scenarios" });
}

/** The library table for `rows`, as drawn with the text query `q` applied and `picked` checked. */
export function scenarioList(rows: ScenarioSummary[], picked: Set<string>, healthMap = new Map<string, Health>(), q = ""): string {
  all = rows;
  health = healthMap;
  filter.q = q;
  const html = table(picked);
  filter.q = "";
  return html;
}

/** Redraws everything the filters change, leaving the search box alone and keeping the focus on the control that changed. */
function refresh(): void {
  const active = document.activeElement as HTMLElement | null;
  const selector = active?.dataset.action ? `[data-action="${CSS.escape(active.dataset.action)}"]${active.dataset.value !== undefined ? `[data-value="${CSS.escape(active.dataset.value)}"]` : ""}` : active?.dataset.input ? `[data-input="${CSS.escape(active.dataset.input)}"]` : "";
  tableDefaults().page = 1;
  patch("scn-worlds", worldsControl());
  patch("scn-filters", filtersControl());
  patch("scn-tags", tagsControl());
  patch("scn-status", statusLine(filterScenarios(all, current()).length));
  redrawTable(TABLE);
  syncSelection();
  if (selector && active && !active.isConnected) document.querySelector<HTMLElement>(`.scn-page ${selector}`)?.focus();
}

function menuFor(s: ScenarioSummary): Array<MenuItem | "-" | { heading: string }> {
  return [
    { heading: s.id },
    { label: "Open", icon: "arrowRight", href: href("scenario", s.id) },
    { label: "Run", icon: "play", href: runHref([s.id]) },
    { label: "Sweep", icon: "grid", href: sweepHref(s.id) },
    "-",
    { label: "Edit in editor", icon: "edit", href: href("editor", s.id) },
    { label: "Duplicate in editor", icon: "copy", run: () => void duplicateInEditor(s.id) },
    "-",
    { label: "Copy id", icon: "hash", run: () => void copy(s.id) },
    { label: "Copy run command", icon: "terminal", run: () => void copy(scenarioCommand(s)) },
  ];
}

const page: Page = {
  nav: "scenarios",
  title: () => "Scenarios",
  skeleton: "table",
  watches: ["scenarios", "runs", "reports"],
  async render(ctx) {
    await Promise.all([load.scenarios(), load.runs(), load.reports()]);
    all = store.scenarios ?? [];
    health = healthByScenario(observations(store.runs, store.saved));
    const linked = (ctx.query.get("ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean);
    if (linked.join(",") !== ids.join(",")) {
      ids = linked;
      if (ids.length) resetFilters();
    }
    for (const id of selected) if (!all.some((s) => s.id === id)) selected.delete(id);
    tableDefaults();
    registerTable(TABLE, table, { selected, onSelect: syncSelection });

    const worlds = new Set(all.flatMap((s) => s.worlds));
    const bundled = all.filter((s) => s.bundled).length;
    const kinds = new Set(all.flatMap(kindsOf));
    const attention = attentionIds().size;
    const lastAt = [...health.values()].reduce<string | undefined>((max, h) => (h.lastAt && (!max || h.lastAt > max) ? h.lastAt : max), undefined);
    const shown = filterScenarios(all, current()).length;
    const head = pageHead({
      title: "Scenarios",
      desc: all.length
        ? `${plural(all.length, "scenario")} across ${plural(worlds.size, "world")}: ${bundled} bundled with AgentCrucible and ${all.length - bundled} written for this project. Each one breaks tool calls on a fixed schedule and states what a correct run commits.`
        : "A scenario names a world, a task, the tool calls to break, and what a correct run commits.",
      meta: [
        metaItem("zap", `<b class="fg">${kinds.size}</b> fault kinds injected`),
        metaItem("alert", `<b class="fg">${attention}</b> need${attention === 1 ? "s" : ""} attention`, "Latest result differs from expected_verdicts, or is critical with no expected verdict"),
        metaItem("clock", lastAt ? `Last run <b class="fg">${esc(relTime(lastAt))}</b>` : "Never run", absTime(lastAt)),
        metaItem("folder", store.meta.scenarioDir ? `Editor saves to <code>${esc(store.meta.scenarioDir)}</code>` : "No scenario directory configured", store.meta.scenarioRoots.join("\n")),
      ],
      actions: `${button("New scenario", { href: "#/editor", icon: "plus" })}<span id="scn-run" class="contents">${runButton()}</span>`,
    });

    return `<div class="page scn-page">
  ${head}
  ${store.scenarioError ? callout("bad", esc(store.scenarioError), { title: "A scenario file does not load", actions: button("Open the editor", { href: "#/editor", size: "sm" }) }) : ""}
  <div class="scn-bar">
    <div class="scn-bar-row">${searchInput({ id: "scn-q", value: filter.q, placeholder: "Search ids, tasks, tags, faults", label: "Search scenarios", kbd: "/" })}<span id="scn-worlds" class="contents">${worldsControl()}</span></div>
    <div class="scn-bar-row" id="scn-filters">${filtersControl()}</div>
    <div class="scn-tags" id="scn-tags" role="group" aria-label="Filter by tag">${tagsControl()}</div>
  </div>
  ${panel({ title: "Library", icon: "layers", meta: `<span id="scn-status" class="scn-status">${statusLine(shown)}</span>`, flush: true, cls: "scn-panel", actions: button("Export CSV", { action: "export-all", icon: "download", size: "sm", kind: "ghost", title: "Download the scenarios the filters show" }) }, `<div class="scn-table" data-context="scenarios">${table()}</div>`)}
  <div id="scn-bulk" class="scn-bulk">${bulkBar()}</div>
</div>`;
  },
  actions: {
    world: (el) => {
      filter.world = el.dataset.value ?? "";
      refresh();
    },
    source: (el) => {
      filter.source = (el.dataset.value ?? "") as typeof filter.source;
      refresh();
    },
    tag: (el) => {
      filter.tag = filter.tag === el.dataset.value ? "" : (el.dataset.value ?? "");
      refresh();
    },
    group: (el) => {
      grouped = el.dataset.value === "folder";
      refresh();
    },
    kinds: (el) => {
      const kinds = [...new Set(all.flatMap(kindsOf))].sort();
      const pool = filterScenarios(all, current({ kinds: [] }));
      openChecklist(el, {
        title: "Fault kinds",
        search: true,
        options: kinds.map((k) => ({ value: k, label: k, checked: filter.kinds.includes(k), extra: `<span class="menu-hint">${count(pool, (s) => kindsOf(s).includes(k))}</span>` })),
        onChange: (values) => {
          filter.kinds = values.length === kinds.length ? [] : values;
          refresh();
        },
      });
    },
    "clear-filters": () => {
      resetFilters();
      const input = document.getElementById("scn-q") as HTMLInputElement | null;
      if (input) input.value = "";
      refresh();
    },
    "row-menu": (el) => {
      const s = all.find((x) => x.id === el.dataset.id);
      if (s) openMenu(menuFor(s), el, { align: "end" });
    },
    "context-menu": (_el, ev) => {
      const id = (ev.target as HTMLElement).closest("tr")?.querySelector<HTMLElement>("[data-id]")?.dataset.id;
      const s = all.find((x) => x.id === id);
      if (s) openMenu(menuFor(s), { x: (ev as MouseEvent).clientX, y: (ev as MouseEvent).clientY });
    },
    "bulk-copy": (el) => copy(all.filter((s) => selected.has(s.id)).map(scenarioCommand).join("\n"), el),
    "bulk-csv": () => download(`scenarios-${new Date().toISOString().slice(0, 10)}.csv`, scenariosCsv(all.filter((s) => selected.has(s.id)), health), "text/csv"),
    "export-all": () => download(`scenarios-${new Date().toISOString().slice(0, 10)}.csv`, scenariosCsv(filterScenarios(all, current()), health), "text/csv"),
    "bulk-sweep": (el) => {
      const picked = all.filter((s) => selected.has(s.id));
      if (picked.length === 1) return runtime.navigate(sweepHref(picked[0].id));
      openMenu([{ heading: "Sweep which scenario?" }, ...picked.map((s): MenuItem => ({ label: s.id, icon: "grid", href: sweepHref(s.id) }))], el);
    },
    "bulk-delete": async (el) => {
      const own = ownFiles();
      el.classList.add("is-busy");
      try {
        const gone = await deleteScenarios(own.map((s) => s.id));
        for (const id of gone) selected.delete(id);
        if (gone.length) await runtime.rerender();
      } finally {
        el.classList.remove("is-busy");
      }
    },
    "bulk-clear": () => {
      selected.clear();
      redrawTable(TABLE);
      syncSelection();
    },
  },
  inputs: {
    "scn-q": (el) => {
      filter.q = el.value;
      refresh();
    },
    attention: (el) => {
      filter.attention = el.checked;
      refresh();
    },
  },
};

export default page;
