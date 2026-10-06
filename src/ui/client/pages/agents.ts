/**
 * Agents: every agent this workspace can run, with its record from the history, as cards or a
 * table. Sort, filter, and search them; pick two to compare head to head.
 */
import { VERDICT_SEVERITY } from "../../../types.js";
import { observations } from "../lib/analytics.js";
import { AGENT_SORTS, agentRecords, filterAgents, sortAgents, type AgentFilter, type AgentRecord, type AgentSort, type SourceKind } from "../lib/agents.js";
import { copy } from "../lib/dom.js";
import { absTime, esc, href, pct, plural, relTime, withQuery } from "../lib/format.js";
import { patch, runtime } from "../lib/runtime.js";
import { load, store } from "../lib/state.js";
import { icon } from "../icons.js";
import type { Page } from "../routes.js";
import { shareMeter, sourceChip, versionTag } from "../ui/agent-kit.js";
import { sparkline } from "../ui/charts.js";
import { callout, emptyState, metaItem, pageHead } from "../ui/layout.js";
import { openMenu } from "../ui/overlays.js";
import { button, checkbox, iconButton, searchInput, segmented, select, tip, toggle } from "../ui/primitives.js";
import { by, dataTable, redrawTable, registerTable, tableState, type Column } from "../ui/table.js";
import { rateMeter, tallyOf, VERDICT_META, verdictBar, verdictCode, verdictText } from "../ui/verdicts.js";

let layout: "grid" | "table" = "grid";
let sort: AgentSort = "safe";
const filter: AgentFilter = { q: "", kind: "all", withResults: false };
/** Agents picked for a comparison, oldest pick first; at most two. */
const picked = new Set<string>();
let records: AgentRecord[] = [];

const TABLE_ID = "agents-table";

function trend(r: AgentRecord, width: number): string {
  return sparkline(r.trend, { width, height: 26, color: "var(--ssucc)", min: 0, max: 1, label: `${r.id}: daily safe share over the last 30 days` });
}

function latestAt(r: AgentRecord): string {
  const at = r.row?.last?.at;
  return at ? `<span${tip(absTime(at))}>${esc(relTime(at))}</span>` : '<span class="muted">—</span>';
}

/** One agent as a card: its record, its 30-day trend, and a box to pick it for a comparison. */
export function agentCard(r: AgentRecord, on = false): string {
  const link = href("agent", r.id);
  const head = `<div class="ac-head"><span class="glyph" aria-hidden="true">${icon("bot", 15)}</span><div class="ac-name"><a class="ac-id" href="${esc(link)}">${esc(r.id)}</a><span class="ac-tags">${sourceChip(r.source)}${versionTag(r.version)}</span></div>${checkbox({ checked: on, action: "pick", attrs: `data-id="${esc(r.id)}"`, ariaLabel: `Pick ${r.id} to compare` })}</div><p class="ac-desc"${r.description ? tip(r.description) : ""}>${esc(r.description || "No description")}</p>`;
  const attrs = `data-href="${esc(link)}" data-context="agent" data-id="${esc(r.id)}"`;
  if (!r.row) return `<article class="agent-card is-empty${on ? " is-picked" : ""}" ${attrs}>${head}<div class="ac-none"><span>${icon("inbox", 13)}No results yet</span>${button("Run it", { href: withQuery("#/launch", { agents: r.id }), size: "sm", icon: "play", kind: "ghost" })}</div></article>`;
  const s = r.row.summary;
  const worst = r.row.worst;
  return `<article class="agent-card${on ? " is-picked" : ""}" ${attrs}>${head}
  <div class="ac-stats">
    <div class="ac-stat"><span class="label">Safe share</span><b${tip(`${s.safe.toLocaleString("en-US")} of ${s.total.toLocaleString("en-US")} results ended SAFE_SUCCESS or SAFE_FAILURE`)}>${pct(s.safe, s.total)}</b>${shareMeter(s.safeRate)}</div>
    <div class="ac-stat"><span class="label">Results</span><b>${s.total.toLocaleString("en-US")}</b><small>${plural(r.row.scenarios, "scenario")}</small></div>
    <div class="ac-stat"><span class="label">Worst</span><span class="ac-worst">${verdictCode(worst, worst ? `${worst}: ${VERDICT_META[worst].meaning}` : undefined)}<small>${esc(worst ? VERDICT_META[worst].short : "")}</small></span></div>
  </div>
  ${verdictBar(tallyOf(s.byVerdict), { size: "md" })}
  <div class="ac-trend"><span class="label">30 days</span>${trend(r, 128)}<b${tip(r.month.total ? `${r.month.safe} of ${r.month.total} results in the last 30 days ended safe` : "No results in the last 30 days")}>${pct(r.month.safe, r.month.total)}</b></div>
  <div class="ac-foot"><span class="ac-when">${icon("clock", 12)}Latest result ${latestAt(r)}</span>${r.open ? `<a class="ac-open" href="${esc(withQuery("#/reports", { agent: r.id, unexpected: 1 }))}"${tip("Latest results whose verdict differs from the scenario's expected_verdicts")}>${icon("xCircle", 12)}${r.open} unexpected</a>` : ""}${icon("chevronRight", 14, "faint")}</div>
</article>`;
}

const COLUMNS: Array<Column<AgentRecord>> = [
  { id: "agent", label: "Agent", sort: by.text((r) => r.id), render: (r) => `<div class="cell-2"><a class="row-link mono" href="${esc(href("agent", r.id))}">${esc(r.id)}</a><span class="sub"${r.description ? tip(r.description) : ""}>${esc(r.description || "No description")}</span></div>`, width: "30%" },
  { id: "source", label: "Source", render: (r) => `<span class="row gap-4">${sourceChip(r.source)}${versionTag(r.version)}</span>` },
  { id: "results", label: "Results", num: true, sort: by.num((r) => r.row?.summary.total), render: (r) => (r.row ? r.row.summary.total.toLocaleString("en-US") : '<span class="muted">—</span>') },
  { id: "safe", label: "Safe share", sort: by.num((r) => r.row?.summary.safeRate), render: (r) => (r.row ? rateMeter(r.row.summary.safeRate, { title: `${r.row.summary.safe} of ${r.row.summary.total} results ended safe` }) : rateMeter(null)) },
  { id: "verdicts", label: "Verdicts", width: "16%", render: (r) => (r.row ? verdictBar(tallyOf(r.row.summary.byVerdict), { size: "sm" }) : '<span class="muted small">no results yet</span>') },
  { id: "trend", label: "30 days", render: (r) => trend(r, 96) },
  { id: "worst", label: "Worst", sort: by.num((r) => (r.row?.worst ? VERDICT_SEVERITY[r.row.worst] : null)), render: (r) => verdictText(r.row?.worst) || '<span class="muted">—</span>' },
  { id: "latest", label: "Latest result", thCls: "when", cls: "when", sort: by.time((r) => r.row?.last?.at), render: latestAt },
];

/** The agents as a sortable table with a box per row to pick it for a comparison. */
export function agentsTable(list: AgentRecord[]): string {
  return dataTable({
    id: TABLE_ID,
    columns: COLUMNS,
    rows: list,
    state: tableState(TABLE_ID, { pageSize: 25 }),
    rowKey: (r) => r.id,
    rowHref: (r) => href("agent", r.id),
    rowCls: (r) => (r.row ? "" : "is-muted"),
    selected: picked,
    empty: "",
    cards: true,
    caption: "Agents and their records",
  });
}

function noMatch(): string {
  return emptyState({ icon: "search", title: "No agent matches", text: "Nothing matches the search and filters. Clear them to see every agent.", actions: button("Clear filters", { action: "clear-filters", size: "sm", icon: "x" }) });
}

function list(): string {
  const shown = sortAgents(filterAgents(records, filter), sort);
  if (!shown.length) return noMatch();
  if (layout === "table") {
    const html = agentsTable(shown);
    registerTable(TABLE_ID, () => agentsTable(sortAgents(filterAgents(records, filter), sort)), { selected: picked, onSelect: picksChanged });
    return html;
  }
  const ran = shown.filter((r) => r.row);
  const idle = shown.filter((r) => !r.row);
  return `${ran.length ? `<div class="agent-grid">${ran.map((r) => agentCard(r, picked.has(r.id))).join("")}</div>` : ""}${idle.length ? `<div class="ag-sub"><span>No results yet</span><b>${idle.length}</b><span class="muted">Run them to see how they handle the same faults.</span></div><div class="agent-grid">${idle.map((r) => agentCard(r, picked.has(r.id))).join("")}</div>` : ""}`;
}

function pickBar(): string {
  const [a, b] = [...picked];
  if (!a) return "";
  return `<div class="bulkbar" role="region" aria-label="Agents picked to compare">${icon("split", 14)}<span>${b ? `<b>${esc(a)}</b> vs <b>${esc(b)}</b>` : `<b>${esc(a)}</b> · pick one more to compare`}</span>${b ? button("Compare", { href: withQuery("#/compare", { a, b }), kind: "primary", size: "sm", icon: "split" }) : ""}${button(b ? "Run both" : "Run", { href: withQuery("#/launch", { agents: b ? `${a},${b}` : a }), size: "sm", icon: "play" })}${iconButton("x", "Clear the picks", { action: "clear-picks", size: "sm" })}</div>`;
}

/** Keeps the two newest picks and brings the cards, the table, and the bar in line with them. */
function picksChanged(): void {
  const before = picked.size;
  for (const id of [...picked].slice(0, Math.max(0, picked.size - 2))) picked.delete(id);
  if (layout === "table" && before !== picked.size) redrawTable(TABLE_ID);
  for (const box of document.querySelectorAll<HTMLInputElement>('input[data-action="pick"]')) {
    const on = picked.has(box.dataset.id ?? "");
    box.checked = on;
    box.closest(".agent-card")?.classList.toggle("is-picked", on);
  }
  patch("ag-pickbar", pickBar());
}

function togglePick(id: string, on = !picked.has(id)): void {
  if (on) picked.add(id);
  else picked.delete(id);
  if (layout === "table") redrawTable(TABLE_ID);
  picksChanged();
}

function countText(): string {
  const shown = filterAgents(records, filter).length;
  return shown === records.length ? plural(records.length, "agent") : `${shown} of ${records.length} agents`;
}

function redrawList(): void {
  patch("ag-list", list());
  patch("ag-count", countText());
}

const KIND_LABEL: Record<"all" | SourceKind, string> = { all: "All", "built-in": "Built-in", project: "Project", history: "History only" };

const page: Page = {
  nav: "agents",
  title: () => "Agents",
  skeleton: "table",
  watches: ["runs", "reports"],
  async render() {
    await Promise.all([load.runs(), load.reports()]);
    const obs = observations(store.runs, store.saved);
    records = agentRecords(store.meta.agents, obs);
    for (const id of picked) if (!records.some((r) => r.id === id)) picked.delete(id);
    const ran = records.filter((r) => r.row).length;
    const builtIn = records.filter((r) => r.kind === "built-in").length;
    const newest = obs.reduce<string | undefined>((max, o) => (!max || o.at > max ? o.at : max), undefined);
    const kinds = (["all", "built-in", "project", "history"] as const).filter((k) => k === "all" || records.some((r) => r.kind === k));
    const head = pageHead({
      eyebrow: `${icon("bot", 11)}Results`,
      title: "Agents",
      desc: "Every agent this workspace can run, with its record from the history. The safe share counts results that ended SAFE_SUCCESS or SAFE_FAILURE; pick two agents to compare them on the scenarios both ran.",
      meta: [
        metaItem("bot", `<b class="fg">${ran}</b> of ${records.length} agents have results`),
        metaItem("cube", `${builtIn} built-in${records.length - builtIn ? ` · ${records.length - builtIn} from this project` : ""}`),
        metaItem("target", `${plural(obs.length, "result")} in the history`),
        metaItem("clock", newest ? `Latest result <b class="fg">${esc(relTime(newest))}</b>` : "No results yet", newest ? absTime(newest) : ""),
      ],
      actions: `${button("Analytics", { href: "#/analytics", icon: "barChart" })}${button("Compare", { href: "#/compare", icon: "split" })}${button("New run", { href: "#/launch", kind: "primary", icon: "play", kbd: "N" })}`,
    });
    const toolbar = `<div class="dt-toolbar ag-toolbar">
      ${searchInput({ id: "agent-q", value: filter.q, placeholder: "Filter by id, description, source", label: "Filter agents", kbd: "/" })}
      ${segmented("kind", filter.kind, kinds.map((k) => ({ value: k, label: KIND_LABEL[k], count: k === "all" ? records.length : records.filter((r) => r.kind === k).length })), { label: "Source" })}
      ${toggle({ checked: filter.withResults, label: "With results only", attrs: 'data-input="with-results"' })}
      <span class="spacer"></span>
      <span class="count" id="ag-count">${countText()}</span>
      <label class="ag-sort"><span class="muted small">Sort</span>${select({ input: "agent-sort", value: sort, options: AGENT_SORTS.map(([value, label]) => ({ value, label })), label: "Sort agents" })}</label>
      ${segmented("layout", layout, [{ value: "grid", label: "Cards", icon: "grid" }, { value: "table", label: "Table", icon: "rows" }], { label: "Layout" })}
    </div>`;
    return `<div class="page agents-page">
  ${head}
  ${ran ? "" : callout("accent", "No agent has results yet. Run the guided demo, or start a run with the agents you want to grade; each card then shows its safe share, verdicts, and trend.", { title: "Nothing graded yet", icon: "spark", actions: button("Run the guided demo", { href: "#/demo?play=1", kind: "primary", size: "sm", icon: "play" }) })}
  ${toolbar}
  <div id="ag-list">${list()}</div>
  <div id="ag-pickbar">${pickBar()}</div>
</div>`;
  },
  actions: {
    kind: (el) => {
      filter.kind = el.dataset.value as AgentFilter["kind"];
      return runtime.rerender();
    },
    layout: (el) => {
      layout = el.dataset.value as typeof layout;
      return runtime.rerender();
    },
    pick: (el) => togglePick(el.dataset.id ?? "", (el as HTMLInputElement).checked),
    "clear-picks": () => {
      picked.clear();
      if (layout === "table") redrawTable(TABLE_ID);
      picksChanged();
    },
    "clear-filters": () => {
      Object.assign(filter, { q: "", kind: "all", withResults: false });
      return runtime.rerender();
    },
    "context-menu": (el, ev) => {
      const id = el.dataset.id ?? "";
      const r = records.find((x) => x.id === id);
      if (!r) return;
      const e = ev as MouseEvent;
      const others = records.filter((x) => x.id !== id && x.row).slice(0, 6);
      openMenu(
        [
          { heading: id },
          { label: "Open the profile", icon: "bot", href: href("agent", id) },
          { label: picked.has(id) ? "Unpick" : "Pick to compare", icon: "split", run: () => togglePick(id) },
          { label: "Run this agent", icon: "play", href: withQuery("#/launch", { agents: id }) },
          { label: "Sweep this agent", icon: "grid", href: withQuery("#/sweep", { agent: id }) },
          ...(r.row ? [{ label: "Its reports", icon: "file" as const, href: withQuery("#/reports", { agent: id }) }] : []),
          ...(others.length ? ["-" as const, { heading: "Compare with" }, ...others.map((o) => ({ label: o.id, icon: "compare" as const, href: withQuery("#/compare", { a: id, b: o.id }) }))] : []),
          "-",
          { label: "Copy the agent id", icon: "copy", run: () => void copy(id) },
        ],
        { x: e.clientX, y: e.clientY }
      );
    },
  },
  inputs: {
    "agent-q": (el) => {
      filter.q = el.value;
      redrawList();
    },
    "agent-sort": (el) => {
      sort = el.value as AgentSort;
      const state = tableState(TABLE_ID);
      state.sort = undefined;
      redrawList();
    },
    "with-results": (el) => {
      filter.withResults = el.checked;
      redrawList();
    },
  },
};

export default page;
