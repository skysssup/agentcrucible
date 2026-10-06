/**
 * Compare: two agents head to head on the scenarios both ran. Each side counts its latest result
 * per scenario and the less severe verdict wins; the page shows the score, the safe shares, the
 * same split per world and per fault kind, and every shared scenario's verdicts side by side.
 */
import { VERDICT_SEVERITY } from "../../../types.js";
import { observations, type Observation } from "../lib/analytics.js";
import { agentRecords, duelGroups, duelTally, headToHead, NO_FAULT, sharedPairs, type AgentRecord, type Duel, type DuelTally } from "../lib/agents.js";
import { absTime, esc, href, pct, plural, relTime, withQuery } from "../lib/format.js";
import { patch, runtime } from "../lib/runtime.js";
import { load, store } from "../lib/state.js";
import { icon } from "../icons.js";
import type { Page } from "../routes.js";
import { pairBars, sideMark, sourceChip, versionTag } from "../ui/agent-kit.js";
import { callout, emptyState, kpi, kpis, metaItem, pageHead, panel } from "../ui/layout.js";
import { button, delta, iconButton, pill, searchInput, select, tip, toggle, worldIcon } from "../ui/primitives.js";
import { by, dataTable, registerTable, tableState, type Column } from "../ui/table.js";
import { expectedMark, mixCounts, tally, verdictBar, verdictText } from "../ui/verdicts.js";

let diffOnly = false;
let query = "";
let current: { a: string; b: string; duels: Duel[] } = { a: "", b: "", duels: [] };

const TABLE_ID = "cmp-scenarios";

function sideCard(side: "a" | "b", id: string, records: AgentRecord[]): string {
  const r = records.find((x) => x.id === id);
  const options = [{ value: "", label: "Choose an agent…" }, ...records.map((x) => ({ value: x.id, label: x.row ? `${x.id} · ${pct(x.row.summary.safe, x.row.summary.total)} safe of ${x.row.summary.total}` : `${x.id} · no results yet` }))];
  const body = r
    ? `<div class="cmp-side-tags">${sourceChip(r.source)}${versionTag(r.version)}<a class="link-quiet" href="${esc(href("agent", r.id))}">Profile ${icon("arrowRight", 12)}</a></div><p class="cmp-desc"${r.description ? tip(r.description) : ""}>${esc(r.description || "No description")}</p><div class="cmp-side-facts">${r.row ? `<span><b>${pct(r.row.summary.safe, r.row.summary.total)}</b> safe overall</span><span><b>${r.row.summary.total.toLocaleString("en-US")}</b> results</span><span><b>${r.row.scenarios}</b> scenarios</span>` : '<span class="muted">No results yet</span>'}</div>`
    : `<p class="cmp-desc muted">${id ? `No agent named <code>${esc(id)}</code> is registered or in the history.` : "Choose the agent for this side."}</p>`;
  return `<div class="cmp-side ${side}${r ? "" : " empty"}"><div class="cmp-side-head">${sideMark(side)}${select({ input: `pick-${side}`, value: r ? id : "", options, label: `Agent ${side.toUpperCase()}` })}</div>${body}</div>`;
}

function pickers(a: string, b: string, records: AgentRecord[]): string {
  return `<section class="cmp-pickers" aria-label="Agents to compare">${sideCard("a", a, records)}<div class="cmp-vs"><span>vs</span>${iconButton("repeat", "Swap A and B", { action: "swap", size: "sm" })}</div>${sideCard("b", b, records)}</section>`;
}

function scoreboard(t: DuelTally, duels: Duel[], a: string, b: string): string {
  const seg = (n: number, cls: string, title: string) => (n ? `<span class="${cls}" style="flex:${n}"${tip(title)}>${n}</span>` : "");
  const row = (side: "a" | "b", id: string, list: Observation[]) => `<div class="cmp-mix-row">${sideMark(side)}<span class="cmp-mix-id mono">${esc(id)}</span>${verdictBar(tally(list), { size: "lg" })}${mixCounts(tally(list))}</div>`;
  return panel(
    { title: "Head to head", icon: "split", meta: `latest result of each agent on ${plural(t.shared, "shared scenario")}` },
    `<p class="cmp-sentence">${t.wins || t.losses ? `<b class="mono">${esc(a)}</b> has the less severe verdict on <b>${t.wins}</b>, <b class="mono">${esc(b)}</b> on <b>${t.losses}</b>, and ${t.ties === 1 ? "<b>1</b> ends" : `<b>${t.ties}</b> end`} with equally severe verdicts.` : `Both agents end with equally severe verdicts on all <b>${t.shared}</b> shared scenarios.`}</p>
    <div class="cmp-score" role="img" aria-label="${esc(`${a} better on ${t.wins}, same on ${t.ties}, ${b} better on ${t.losses}`)}">${seg(t.wins, "a", `${a} has the less severe verdict on ${plural(t.wins, "scenario")}`)}${seg(t.ties, "tie", `Equally severe on ${plural(t.ties, "scenario")}`)}${seg(t.losses, "b", `${b} has the less severe verdict on ${plural(t.losses, "scenario")}`)}</div>
    <div class="cmp-score-legend"><span>${sideMark("a")}better</span><span><i class="tie"></i>same severity</span><span>${sideMark("b")}better</span></div>
    <div class="cmp-mix"><span class="label">Verdicts on the shared scenarios</span>${row("a", a, duels.map((d) => d.a))}${row("b", b, duels.map((d) => d.b))}</div>`
  );
}

function versusPanel(title: string, iconName: "globe" | "zap", meta: string, groups: DuelTally[], label: (key: string) => string, a: string, b: string, wide = false): string {
  return panel(
    { title, icon: iconName, meta },
    `<ul class="vs-list${wide ? " two-col" : ""}">${groups
      .map(
        (g) =>
          `<li><span class="vs-key">${label(g.key)}<small>${plural(g.shared, "scenario")}</small></span>${pairBars(g.safeA / g.shared, g.safeB / g.shared, { titleA: `${a}: ${g.safeA} of ${g.shared} safe`, titleB: `${b}: ${g.safeB} of ${g.shared} safe` })}<span class="vs-score"${tip(`${a} better on ${g.wins}, ${b} better on ${g.losses}, same on ${g.ties}`)}><b class="a">${g.wins}</b><span class="faint">–</span><b class="b">${g.losses}</b>${g.ties ? `<em>${g.ties} same</em>` : ""}</span></li>`
      )
      .join("")}</ul>`
  );
}

function verdictCell(o: Observation, better: boolean): string {
  return `<div class="cmp-cell${better ? " better" : ""}"><a class="ag-verdict-link" href="${esc(href("report", o.key))}"${tip("Open the report")}>${verdictText(o.verdict)}</a><span class="sub"><span${tip(absTime(o.at))}>${esc(relTime(o.at))}</span>${o.expected ? `<span class="sep-dot"></span>${expectedMark(o)}` : ""}</span></div>`;
}

const COLUMNS: Array<Column<Duel>> = [
  { id: "scenario", label: "Scenario", sort: by.text((d) => d.scenarioId), render: (d) => `<div class="cell-2"><a class="row-link mono" href="${esc(href("scenario", d.scenarioId))}">${esc(d.scenarioId)}</a><span class="sub">${esc([d.worlds.join(" · "), d.faultKinds.join(", ")].filter(Boolean).join(" · "))}</span></div>`, width: "38%" },
  { id: "a", label: "Agent A", sort: by.num((d) => VERDICT_SEVERITY[d.a.verdict]), render: (d) => verdictCell(d.a, d.edge > 0) },
  { id: "b", label: "Agent B", sort: by.num((d) => VERDICT_SEVERITY[d.b.verdict]), render: (d) => verdictCell(d.b, d.edge < 0) },
  { id: "edge", label: "Outcome", sort: by.num((d) => d.edge), render: (d) => (d.edge > 0 ? `<span class="cmp-edge a">${sideMark("a")}better</span>` : d.edge < 0 ? `<span class="cmp-edge b">${sideMark("b")}better</span>` : pill("same severity", "outline")) },
];

function shownDuels(): Duel[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return current.duels.filter((d) => (!diffOnly || d.a.verdict !== d.b.verdict) && words.every((w) => `${d.scenarioId} ${d.worlds.join(" ")} ${d.faultKinds.join(" ")}`.toLowerCase().includes(w)));
}

function table(): string {
  const rows = shownDuels();
  return dataTable({
    id: TABLE_ID,
    columns: COLUMNS.map((c) => (c.id === "a" ? { ...c, label: current.a } : c.id === "b" ? { ...c, label: current.b } : c)),
    rows,
    state: tableState(TABLE_ID, { pageSize: 25 }),
    rowKey: (d) => d.scenarioId,
    rowCls: (d) => (d.edge ? "" : "cmp-row-tie"),
    flush: true,
    cards: true,
    empty: emptyState({ icon: "search", title: diffOnly && !query ? "Every shared scenario ends with the same verdict" : "No scenario matches", text: diffOnly ? "Turn off Differences only to see every shared scenario." : "Clear the filter to see every shared scenario.", compact: true }),
    caption: "Shared scenarios with both verdicts",
  });
}

function scenariosPanel(): string {
  const differ = current.duels.filter((d) => d.a.verdict !== d.b.verdict).length;
  const html = table();
  registerTable(TABLE_ID, table);
  return panel(
    { title: "Scenario by scenario", icon: "layers", meta: `${plural(current.duels.length, "shared scenario")} · ${differ} with different verdicts`, flush: true },
    `<div class="dt-toolbar cmp-toolbar">${searchInput({ id: "cmp-q", value: query, placeholder: "Filter scenarios, worlds, fault kinds", label: "Filter shared scenarios", kbd: "/" })}${toggle({ checked: diffOnly, label: "Differences only", attrs: 'data-input="diff-only"' })}<span class="spacer"></span><span class="count" id="cmp-count">${shownDuels().length} of ${current.duels.length}</span></div><div id="cmp-table">${html}</div>`
  );
}

function suggestions(obs: Observation[]): string {
  const pairs = sharedPairs(obs, 5);
  return panel(
    { title: "Suggested pairs", icon: "lightbulb", meta: "agents with the most scenarios in common", flush: true },
    pairs.length
      ? `<ul class="list">${pairs.map((p) => `<li><a class="list-row" href="${esc(withQuery("#/compare", { a: p.a, b: p.b }))}"><span class="glyph">${icon("split", 13)}</span><span class="grow"><span class="title mono">${esc(p.a)} <span class="faint">vs</span> ${esc(p.b)}</span><span class="detail">${plural(p.shared, "shared scenario")}</span></span>${icon("chevronRight", 14, "faint")}</a></li>`).join("")}</ul>`
      : emptyState({ icon: "split", title: "No two agents share a scenario yet", text: "Run two or more agents on the same scenarios, then compare them here.", actions: button("Start a run", { href: "#/launch", kind: "primary", size: "sm", icon: "play" }), compact: true })
  );
}

function body(a: string, b: string, records: AgentRecord[], obs: Observation[]): string {
  const ra = records.find((r) => r.id === a);
  const rb = records.find((r) => r.id === b);
  if (!ra || !rb) return `<div class="grid g-7-5 mt-16">${panel({ title: "How the comparison works", icon: "info" }, `<ol class="cmp-how"><li>Choose an agent for each side, or open a suggested pair.</li><li>Each scenario both agents ran counts once, with the latest result of each agent.</li><li>The less severe verdict wins: HARMFUL_ACTION is worst, then SILENT_FAILURE, DEGRADED, INCONCLUSIVE, SAFE_FAILURE, and SAFE_SUCCESS.</li></ol>`)}${suggestions(obs)}</div>`;
  if (a === b) return `<div class="mt-16">${callout("warn", "Both sides show the same agent. Choose a different agent for one side.", { title: "Pick two different agents" })}</div>`;
  const { duels } = current;
  if (!duels.length) {
    const union = [...new Set(obs.filter((o) => o.agentId === a || o.agentId === b).map((o) => o.scenarioId))].sort();
    const missing = [ra, rb].filter((r) => !r.row).map((r) => r.id);
    return `<div class="panel mt-16">${emptyState({
      icon: "split",
      title: "These agents share no scenarios",
      text: missing.length ? `${esc(missing.join(" and "))} ${missing.length === 1 ? "has" : "have"} no results yet. Run both agents on the same scenarios to compare them.` : `${esc(a)} ran ${plural(ra.row!.scenarios, "scenario")} and ${esc(b)} ran ${plural(rb.row!.scenarios, "scenario")}, and none of them overlap. Run both on the same scenarios to compare them.`,
      actions: `${button(union.length ? `Run both on ${plural(union.length, "scenario")}` : "Run both", { href: withQuery("#/launch", { agents: `${a},${b}`, scenarios: union.join(",") }), kind: "primary", icon: "play", size: "sm" })}${button("Pick other agents", { action: "focus-picker", size: "sm" })}`,
    })}</div>`;
  }
  const t = duelTally(duels);
  const rateA = t.safeA / t.shared;
  const rateB = t.safeB / t.shared;
  const worlds = duelGroups(duels, (d) => d.worlds);
  const kinds = duelGroups(duels, (d) => (d.faultKinds.length ? d.faultKinds : [NO_FAULT]));
  return `${kpis([
    kpi({ label: "Shared scenarios", icon: "layers", value: t.shared, sub: `A ran ${ra.row?.scenarios ?? 0} · B ran ${rb.row?.scenarios ?? 0}`, title: `${a} ran ${plural(ra.row?.scenarios ?? 0, "scenario")}, ${b} ran ${plural(rb.row?.scenarios ?? 0, "scenario")}` }),
    kpi({ label: "A better", icon: "arrowUp", value: t.wins, sub: `${a} less severe`, title: `${a} has the less severe latest verdict` }),
    kpi({ label: "B better", icon: "arrowDown", value: t.losses, sub: `${b} less severe`, title: `${b} has the less severe latest verdict` }),
    kpi({ label: "Same severity", icon: "minus", value: t.ties, sub: `${plural(duels.filter((d) => d.a.verdict === d.b.verdict).length, "identical verdict")}` }),
    kpi({ label: "Safe share A", icon: "shieldCheck", value: pct(t.safeA, t.shared), sub: `${t.safeA} of ${t.shared} · ${t.criticalA} critical` }),
    kpi({ label: "Safe share B", icon: "shieldCheck", value: pct(t.safeB, t.shared), delta: delta((rateB - rateA) * 100, { unit: "pts", title: `B minus A on the shared scenarios` }), sub: `${t.safeB} of ${t.shared} · ${t.criticalB} critical` }),
  ], "Head to head")}
  <div class="grid g-7-5">${scoreboard(t, duels, a, b)}${versusPanel("By world", "globe", "safe share of each side on the shared scenarios in each world", worlds, (w) => `<span class="world-chip">${worldIcon(w, 12)}${esc(w)}</span>`, a, b)}</div>
  <div class="mt-16">${versusPanel("By fault kind", "zap", "safe share of each side with each fault kind in the schedule", kinds, (k) => `<code class="code-chip">${esc(k)}</code>`, a, b, true)}</div>
  <div class="mt-16">${scenariosPanel()}</div>`;
}

const page: Page = {
  nav: "agents",
  title: (ctx) => (ctx.query.get("a") && ctx.query.get("b") ? `${ctx.query.get("a")} vs ${ctx.query.get("b")}` : "Compare agents"),
  skeleton: "detail",
  watches: ["runs", "reports"],
  async render(ctx) {
    await Promise.all([load.runs(), load.reports()]);
    const obs = observations(store.runs, store.saved);
    const records = agentRecords(store.meta.agents, obs);
    const a = ctx.query.get("a") ?? "";
    const b = ctx.query.get("b") ?? "";
    if (a !== current.a || b !== current.b) {
      diffOnly = false;
      query = "";
      tableState(TABLE_ID).page = 1;
    }
    current = { a, b, duels: a && b && a !== b ? headToHead(obs, a, b) : [] };
    const newest = current.duels.flatMap((d) => [d.a.at, d.b.at]).sort().at(-1);
    const ready = current.duels.length > 0;
    const head = pageHead({
      eyebrow: `${icon("split", 11)}Agents`,
      title: "Compare agents",
      desc: "Two agents head to head on the scenarios both ran. Each side counts its latest result per scenario, and the less severe verdict wins.",
      meta: ready
        ? [metaItem("layers", `<b class="fg">${current.duels.length}</b> shared scenarios`), metaItem("clock", `Newest result <b class="fg">${esc(relTime(newest))}</b>`, absTime(newest)), metaItem("info", "Severity: HARMFUL_ACTION › SILENT_FAILURE › DEGRADED › INCONCLUSIVE › SAFE_FAILURE › SAFE_SUCCESS")]
        : [metaItem("bot", `${plural(records.filter((r) => r.row).length, "agent")} with results`)],
      actions: `${button("Swap sides", { action: "swap", icon: "repeat", disabled: !a && !b })}${button("Run both", { href: withQuery("#/launch", { agents: [a, b].filter(Boolean).join(","), scenarios: current.duels.map((d) => d.scenarioId).join(",") }), kind: "primary", icon: "play", disabled: !(a && b && a !== b), title: ready ? "Run both agents again on the shared scenarios" : "Run both agents" })}`,
    });
    return `<div class="page compare-page">${head}${pickers(a, b, records)}${body(a, b, records, obs)}</div>`;
  },
  actions: {
    swap: () => runtime.navigate(withQuery("#/compare", { a: current.b, b: current.a })),
    "focus-picker": () => document.querySelector<HTMLSelectElement>('select[data-input="pick-a"]')?.focus(),
  },
  inputs: {
    "pick-a": (el) => runtime.navigate(withQuery("#/compare", { a: el.value, b: current.b })),
    "pick-b": (el) => runtime.navigate(withQuery("#/compare", { a: current.a, b: el.value })),
    "cmp-q": (el) => {
      query = el.value;
      tableState(TABLE_ID).page = 1;
      patch("cmp-table", table());
      patch("cmp-count", `${shownDuels().length} of ${current.duels.length}`);
    },
    "diff-only": (el) => {
      diffOnly = el.checked;
      tableState(TABLE_ID).page = 1;
      patch("cmp-table", table());
      patch("cmp-count", `${shownDuels().length} of ${current.duels.length}`);
    },
  },
};

export default page;
