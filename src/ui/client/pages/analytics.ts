/**
 * Analytics: how results end over a chosen period, for the agents, worlds, tags, and fault kinds
 * you filter to. Trends, which fault kinds do the damage, which rules decide failures, how each
 * version and scenario fares, and what the evidence suggests doing next.
 */
import { adviceFor, type Insight, type Observation, agentRows, agentTrends, dailySeries, faultImpact, inRange, insights, matrix, observations, RANGES, summarize, scenarioRows, topRules, type Range, type ScenarioRow } from "../lib/analytics.js";
import { filterObs, NO_FAULT, resultsCsv, versionHistory, versionMarks, type ObsFilter, type VersionStep } from "../lib/agents.js";
import { download } from "../lib/dom.js";
import { absTime, clip, esc, href, num, pct, plural, relTime, shortDay, withQuery } from "../lib/format.js";
import { patch } from "../lib/runtime.js";
import { load, store } from "../lib/state.js";
import { icon, type IconName } from "../icons.js";
import type { Page } from "../routes.js";
import { versionTag } from "../ui/agent-kit.js";
import { barList, chart, fitCharts, heatmap, rateColors, SERIES_COLORS, sparkline } from "../ui/charts.js";
import { callout, emptyState, kpi, kpis, metaItem, pageHead, panel } from "../ui/layout.js";
import { openChecklist, toast } from "../ui/overlays.js";
import { button, delta, filterButton, segmented, tip } from "../ui/primitives.js";
import { by, dataTable, registerTable, tableState, type Column } from "../ui/table.js";
import { badge, rateMeter, tally, tallyOf, VERDICT_VAR, verdictBar, verdictLegend } from "../ui/verdicts.js";
import { VERDICTS } from "../../../types.js";

type TrendMode = "verdicts" | "agents";
type Axis = "worlds" | "faults";

let range: Range = "30d";
let trendMode: TrendMode = "verdicts";
let axis: Axis = "worlds";
const filter: ObsFilter = { agents: [], worlds: [], tags: [], kinds: [] };

const FILTERS: Array<{ key: keyof ObsFilter; label: string; title: string; icon: IconName }> = [
  { key: "agents", label: "Agents", title: "Filter by agent", icon: "bot" },
  { key: "worlds", label: "Worlds", title: "Filter by world", icon: "cube" },
  { key: "tags", label: "Tags", title: "Filter by scenario tag", icon: "hash" },
  { key: "kinds", label: "Fault kinds", title: "Filter by fault kind", icon: "zap" },
];

const SCENARIOS = "an-scenarios";
const VERSIONS = "an-versions";

/** The values each filter can choose from, with how many results carry each. */
export function filterOptions(obs: Observation[]): Record<keyof ObsFilter, Array<{ value: string; count: number }>> {
  const count = (pick: (o: Observation) => string[]) => {
    const counts = new Map<string, number>();
    for (const o of obs) for (const v of new Set(pick(o))) counts.set(v, (counts.get(v) ?? 0) + 1);
    return [...counts].map(([value, n]) => ({ value, count: n })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  };
  return { agents: count((o) => [o.agentId]), worlds: count((o) => o.worlds), tags: count((o) => o.tags), kinds: count((o) => (o.faultKinds.length ? o.faultKinds : [NO_FAULT])) };
}

const chosen = (): number => FILTERS.reduce((n, f) => n + filter[f.key].length, 0);

function insightRow(i: Insight): string {
  const ic: IconName = i.severity === "critical" ? "octagon" : i.severity === "warning" ? "lightbulb" : i.severity === "success" ? "trendUp" : "info";
  return `<li class="insight ${i.severity}"><span class="insight-icon">${icon(ic, 14)}</span><div class="grow"><span class="insight-title">${esc(i.title)}</span><span class="insight-detail">${esc(clip(i.detail, 200))}</span>${i.link ? `<a class="link-quiet" href="${esc(i.link)}">${esc(i.action ?? "Open")} ${icon("arrowRight", 12)}</a>` : ""}</div></li>`;
}

const scenarioColumns: Column<ScenarioRow>[] = [
  { id: "scenario", label: "Scenario", sort: by.text((r) => r.scenarioId), render: (r) => `<a class="row-link" href="${esc(href("scenario", r.scenarioId))}">${esc(r.scenarioId)}</a>` },
  { id: "results", label: "Results", num: true, sort: by.num((r) => r.summary.total), render: (r) => num(r.summary.total) },
  { id: "agents", label: "Agents", num: true, sort: by.num((r) => r.agents), render: (r) => num(r.agents) },
  { id: "safe", label: "Safe share", sort: by.num((r) => r.summary.safeRate), render: (r) => rateMeter(r.summary.safeRate, { title: `${r.summary.safe} of ${r.summary.total} results ended safe` }) },
  { id: "verdicts", label: "Verdicts", width: "18%", render: (r) => verdictBar(tallyOf(r.summary.byVerdict), { size: "sm" }) },
  { id: "unexpected", label: "Unexpected", num: true, sort: by.num((r) => r.summary.unexpected), render: (r) => (r.summary.unexpected ? `<a class="bad-text" href="${esc(withQuery("#/reports", { scenario: r.scenarioId, unexpected: 1 }))}">${r.summary.unexpected}</a>` : '<span class="faint">0</span>') },
  { id: "worst", label: "Worst", sort: by.num((r) => (r.worst ? VERDICTS.length - VERDICTS.indexOf(r.worst) : 0)), render: (r) => badge(r.worst) },
  { id: "last", label: "Latest", thCls: "when", cls: "when", sort: by.time((r) => r.last?.at), render: (r) => (r.last ? `<span${tip(absTime(r.last.at))}>${esc(relTime(r.last.at))}</span>` : "") },
];

const versionColumns: Column<VersionStep>[] = [
  { id: "agent", label: "Agent", sort: by.text((r) => r.agent), render: (r) => `<a class="link-mono" href="${esc(href("agent", r.agent))}">${esc(r.agent)}</a>` },
  { id: "version", label: "Version", render: (r) => versionTag(r.version, `The version its runs were started with, ${plural(r.runs, "run")}`) },
  { id: "runs", label: "Runs", num: true, sort: by.num((r) => r.runs), render: (r) => num(r.runs) },
  { id: "results", label: "Results", num: true, sort: by.num((r) => r.summary.total), render: (r) => num(r.summary.total) },
  { id: "safe", label: "Safe share", sort: by.num((r) => r.summary.safeRate), render: (r) => `${rateMeter(r.summary.safeRate)}${r.change === null ? "" : ` ${delta(r.change * 100, { unit: "pts", title: "Change from this agent's previous version" })}`}` },
  { id: "critical", label: "Critical", num: true, sort: by.num((r) => r.summary.critical), render: (r) => (r.summary.critical ? `<span class="bad-text">${r.summary.critical}</span>` : '<span class="faint">0</span>') },
  { id: "first", label: "First result", thCls: "when", cls: "when", sort: by.time((r) => r.firstAt), render: (r) => `<span${tip(absTime(r.firstAt))}>${esc(shortDay(r.firstAt.slice(0, 10)))}</span>` },
];

function table<T>(id: string, columns: Column<T>[], rows: T[], defaults: { sort: string; dir: "asc" | "desc" }, empty: string): string {
  const draw = () => dataTable({ id, columns, rows, state: tableState(id, { ...defaults, pageSize: 10 }), cards: true, flush: true, empty });
  registerTable(id, draw);
  return draw();
}

function trendPanel(current: Observation[], days: number, labels: string[], series: ReturnType<typeof dailySeries>): string {
  const marks = versionMarks(current, series.map((p) => p.day));
  const actions = segmented("trend-mode", trendMode, [
    { value: "verdicts", label: "Verdicts" },
    { value: "agents", label: "By agent" },
  ]);
  if (trendMode === "agents") {
    const top = agentRows(current).slice(0, 8).map((r) => r.agent);
    const trends = agentTrends(current, top, days);
    return panel(
      { title: "Safe share by agent", icon: "trendUp", meta: `${esc(labels[0] ?? "")} – ${esc(labels.at(-1) ?? "")}`, actions },
      `<ul class="chart-legend">${top.map((a, i) => `<li><span class="sw" style="--sw:${SERIES_COLORS[i % SERIES_COLORS.length]}"></span>${esc(a)}</li>`).join("")}</ul>${chart({
        kind: "line",
        labels,
        tipLabels: series.map((p) => p.day),
        series: top.map((a, i) => ({ id: a, label: a, color: SERIES_COLORS[i % SERIES_COLORS.length], values: trends.get(a) ?? [] })),
        min: 0,
        max: 1,
        format: (v) => `${Math.round(v * 100)}%`,
        height: 260,
        marks,
        ariaLabel: "Safe share per day for each agent",
      })}`
    );
  }
  return panel(
    { title: "Results over time", icon: "barChart", meta: `${esc(labels[0] ?? "")} – ${esc(labels.at(-1) ?? "")}`, actions },
    `<ul class="chart-legend">${VERDICTS.map((v) => `<li><span class="sw sq" style="--sw:${VERDICT_VAR[v]}"></span>${v}</li>`).join("")}<li><span class="sw" style="--sw:var(--ink)"></span>safe share</li></ul>${chart({
      kind: "bars",
      labels,
      tipLabels: series.map((p) => p.day),
      stacks: series.map((p) => p.byVerdict),
      line: { label: "safe share", color: "var(--ink)", values: series.map((p) => p.safeRate) },
      height: 260,
      hrefs: series.map((p) => (p.total ? `#/runs?day=${p.day}` : undefined)),
      marks,
      ariaLabel: "Verdicts per day with the safe share",
    })}`
  );
}

function impactPanel(current: Observation[]): string {
  const rows = faultImpact(current);
  const body = rows.length
    ? barList(
        rows.slice(0, 10).map((k) => ({
          label: k.kind === NO_FAULT ? '<span class="muted">no fault scheduled</span>' : `<code>${esc(k.kind)}</code>`,
          value: k.criticalRate,
          display: `${k.critical} of ${k.total} critical · ${pct(k.safe, k.total)} safe`,
          color: "var(--harm)",
          href: k.kind === NO_FAULT ? undefined : `#/catalog/faults?kind=${encodeURIComponent(k.kind)}`,
          tip: `${k.kind}: ${k.critical} of ${k.total} results ended HARMFUL_ACTION or SILENT_FAILURE`,
        })),
        { max: 1 }
      )
    : emptyState({ icon: "zap", title: "No results", compact: true });
  return panel({ title: "Fault impact", icon: "zap", meta: "share of results that ended critical, by fault kind" }, body);
}

function rulesPanel(current: Observation[]): string {
  const rules = topRules(current).slice(0, 8);
  const body = rules.length
    ? `<ul class="list">${rules
        .map((r) => {
          const advice = adviceFor(r.rule);
          return `<li><a class="list-row" href="${esc(withQuery("#/reports", { rule: r.rule }))}"><span class="grow"><span class="title"><code>${esc(r.rule)}</code></span><span class="detail">${esc(advice ? advice.topic : plural(r.agents.length, "agent"))}${advice ? ` · ${esc(plural(r.agents.length, "agent"))}` : ""}</span></span>${badge(r.verdict)}<span class="num mono">${r.count}</span>${icon("chevronRight", 14, "faint")}</a></li>`;
        })
        .join("")}</ul>`
    : emptyState({ icon: "checkCircle", title: "No failing rules", text: "Every result in this view ended safe.", compact: true });
  return panel({ title: "Top rules", icon: "target", meta: "what decided the failures", flush: true }, body);
}

function matrixPanel(current: Observation[]): string {
  const colsOf = axis === "worlds" ? (o: Observation) => o.worlds : (o: Observation) => (o.faultKinds.length ? o.faultKinds : [NO_FAULT]);
  const cells = matrix(current, (o) => [o.agentId], colsOf);
  const rows = agentRows(current).map((r) => r.agent);
  const cols = [...new Set(cells.map((c) => c.col))].sort();
  const actions = segmented("axis", axis, [
    { value: "worlds", label: "Worlds" },
    { value: "faults", label: "Fault kinds" },
  ]);
  const body = cells.length
    ? heatmap(
        rows,
        cols,
        (row, col) => {
          const c = cells.find((x) => x.row === row && x.col === col);
          if (!c) return { text: "", tip: `${row} has no results with ${col}`, empty: true };
          const { bg, fg } = rateColors(c.rate);
          return { text: pct(c.safe, c.total), tip: `${row} · ${col}: ${c.safe} of ${c.total} ended safe${c.critical ? `, ${c.critical} critical` : ""}`, href: withQuery("#/reports", { agent: row }), bg, fg };
        },
        { rowHref: (r) => href("agent", r), corner: "Agent", ariaLabel: `Safe share of each agent by ${axis === "worlds" ? "world" : "fault kind"}` }
      )
    : emptyState({ icon: "grid", title: "No results", compact: true });
  return panel({ title: "Agents by " + (axis === "worlds" ? "world" : "fault kind"), icon: "grid", meta: "safe share per cell; empty where the agent never ran", actions, flush: true }, body);
}

function toolbar(all: Observation[]): string {
  const opts = filterOptions(all);
  return `<div class="an-bar">
    ${segmented("range", range, RANGES.map(([value, label]) => ({ value, label: value === "all" ? "All time" : label })), { label: "Period" })}
    <span class="an-filters">${FILTERS.map((f) => filterButton(f.label, `filter-${f.key}`, filter[f.key].length, opts[f.key].length, { icon: f.icon })).join("")}${chosen() ? button("Clear filters", { action: "clear-filters", kind: "ghost", size: "sm", icon: "x" }) : ""}</span>
  </div>`;
}

/** The page's content for the current period and filters. */
function view(): string {
  const all = observations(store.runs, store.saved);
  const filtered = filterObs(all, filter);
  const { current, previous, days } = inRange(filtered, range);
  const now = summarize(current);
  const before = summarize(previous);
  const hasPrev = previous.length > 0;
  const d = (a: number, b: number) => (hasPrev ? (a - b) * 100 : null);
  const spanDays = range === "all" ? Math.min(days, 120) : range === "24h" ? 2 : days;
  const series = dailySeries(current, spanDays);
  const labels = series.map((p) => shortDay(p.day));
  const rangeLabel = (RANGES.find(([r]) => r === range)?.[1] ?? "").toLowerCase();
  const head = pageHead({
    eyebrow: `${icon("barChart", 11)}Workspace`,
    title: "Analytics",
    desc: `How results end ${range === "all" ? "across the whole history" : `over the last ${esc(rangeLabel)}`}${hasPrev ? `, against the ${esc(rangeLabel)} before` : ""}. Filter to the agents, worlds, tags, or fault kinds you care about; every number links back to the results behind it.`,
    meta: [
      metaItem("target", `<b class="fg">${plural(now.total, "result")}</b> of ${num(all.length)}`),
      metaItem("bot", plural(new Set(current.map((o) => o.agentId)).size, "agent")),
      metaItem("layers", plural(new Set(current.map((o) => o.scenarioId)).size, "scenario")),
      chosen() ? metaItem("filter", `${plural(chosen(), "filter value")} applied`) : "",
    ].filter(Boolean),
    actions: `${button("Export CSV", { action: "export", icon: "download", title: "Download the results in view as CSV", disabled: !current.length })}${button("Reports", { href: "#/reports", icon: "file" })}${button("New run", { href: "#/launch", kind: "primary", icon: "play", kbd: "N" })}`,
  });
  if (!all.length)
    return `${head}${panel({}, emptyState({ icon: "barChart", title: "Nothing to analyze yet", text: "Analytics reads the results of your runs. Start a run, or play the guided demo, and the trends fill in here.", actions: `${button("Guided demo", { href: "#/demo?play=1", icon: "spark" })}${button("Start a run", { href: "#/launch", kind: "primary", icon: "play" })}` }))}`;
  const bar = toolbar(all);
  if (!current.length)
    return `${head}${bar}${panel({}, emptyState({ icon: "search", title: "No results in this view", text: `${plural(all.length, "result")} exist, but none falls in the last ${esc(rangeLabel)}${chosen() ? " with these filters" : ""}. Widen the period${chosen() ? " or clear the filters" : ""}.`, actions: `${range === "all" ? "" : button("All time", { action: "range", data: { value: "all" }, size: "sm" })}${chosen() ? button("Clear filters", { action: "clear-filters", size: "sm", kind: "ghost" }) : ""}` }))}`;
  const recs = insights(current, { coverage: store.coverage }).filter((i) => !i.id.startsWith("open:")).slice(0, 5);
  const versions = versionHistory(current);
  const scenarios = scenarioRows(current);
  const kpiRow = kpis([
    kpi({ label: "Safe share", icon: "shieldCheck", value: pct(now.safe, now.total), delta: delta(d(now.safeRate, before.safeRate), { unit: "pts", title: `vs ${pct(before.safe, before.total)} the period before` }), spark: sparkline(series.map((p) => p.safeRate), { width: 120, color: "var(--ssucc)", min: 0, max: 1, label: "safe share by day" }), sub: `${num(now.safe)} of ${num(now.total)} ended safe` }),
    kpi({ label: "Results", icon: "target", value: num(now.total), delta: hasPrev ? delta(before.total ? ((now.total - before.total) / before.total) * 100 : null, { unit: "%" }) : "", spark: sparkline(series.map((p) => p.total), { width: 120, min: 0, label: "results by day" }), sub: `${plural(new Set(current.map((o) => o.runId).filter(Boolean)).size, "run")}` }),
    kpi({ label: "Critical", icon: "octagon", value: now.critical, tone: now.critical ? "bad" : "", delta: delta(d(now.criticalRate, before.criticalRate), { unit: "pts", inverse: true }), spark: sparkline(series.map((p) => p.critical), { width: 120, color: "var(--harm)", min: 0, label: "critical by day" }), sub: `${now.byVerdict.HARMFUL_ACTION} harmful · ${now.byVerdict.SILENT_FAILURE} silent`, href: "#/reports?verdict=critical" }),
    kpi({ label: "Unexpected", icon: "xCircle", value: now.unexpected, tone: now.unexpected ? "warn" : "ok", delta: delta(d(now.unexpectedRate, before.unexpectedRate), { unit: "pts", inverse: true }), sub: now.graded ? `${pct(now.graded - now.unexpected, now.graded)} of ${num(now.graded)} match expected` : "no expected verdicts in view", href: "#/reports?unexpected=1" }),
    kpi({ label: "Flaky", icon: "split", value: now.flaky, tone: now.flaky ? "warn" : "", delta: delta(d(now.flakyRate, before.flakyRate), { unit: "pts", inverse: true }), sub: now.multiTrial ? `${pct(now.flaky, now.multiTrial)} of multi-trial results disagree` : "no multi-trial results", href: "#/reports?flaky=1" }),
  ]);
  const mix = panel({ title: "Verdict mix", icon: "pieChart", meta: `${num(now.total)} results` }, `${verdictBar(tally(current.map((o) => ({ verdict: o.verdict }))), { size: "lg" })}${verdictLegend(tally(current.map((o) => ({ verdict: o.verdict }))))}`);
  return `${head}
${bar}
${kpiRow}
<div class="grid g-8-4">${trendPanel(current, spanDays, labels, series)}${mix}</div>
<div class="grid g-7-5 mt-16">${impactPanel(current)}${rulesPanel(current)}</div>
<div class="mt-16">${matrixPanel(current)}</div>
<div class="grid g-7-5 mt-16">${panel({ title: "Scenarios", icon: "layers", meta: plural(scenarios.length, "scenario"), flush: true }, table(SCENARIOS, scenarioColumns, scenarios, { sort: "safe", dir: "asc" }, emptyState({ icon: "layers", title: "No scenarios", compact: true })))}${panel(
    { title: "Versions", icon: "flag", meta: "agent versions by the runs that carried them", flush: true },
    versions.length ? table(VERSIONS, versionColumns, versions, { sort: "first", dir: "desc" }, "") : emptyState({ icon: "flag", title: "No versions recorded", text: "Start a run with an agent version, and each release shows up here with its safe share.", compact: true })
  )}</div>
<div class="mt-16">${panel({ title: "Insights", icon: "lightbulb", meta: "from the evidence in view", flush: true }, recs.length ? `<ul class="insights">${recs.map(insightRow).join("")}</ul>` : emptyState({ icon: "lightbulb", title: "Nothing to recommend", text: "No pattern stands out in this view.", compact: true }))}</div>
${callout("info", "Results the history keeps are counted once, and a saved copy of a result is not a second result. Version labels come from the runs; the built-in reference agents carry none.", { title: "How the numbers are counted" })}`;
}

/** Draws the content again, keeping an open filter list in place. */
function redraw(): void {
  patch("an-root", view());
  fitCharts(document.getElementById("an-root") ?? document);
}

const page: Page = {
  nav: "analytics",
  title: () => "Analytics",
  skeleton: "dashboard",
  watches: ["runs", "reports"],
  async render() {
    await Promise.all([load.runs(), load.reports(), load.coverage().catch(() => undefined)]);
    return `<div class="page" id="an-root">${view()}</div>`;
  },
  actions: {
    range: (el) => {
      range = el.dataset.value as Range;
      redraw();
    },
    "trend-mode": (el) => {
      trendMode = el.dataset.value as TrendMode;
      redraw();
    },
    axis: (el) => {
      axis = el.dataset.value as Axis;
      redraw();
    },
    "clear-filters": () => {
      for (const f of FILTERS) filter[f.key] = [];
      redraw();
    },
    export: () => {
      const rows = inRange(filterObs(observations(store.runs, store.saved), filter), range).current;
      download("analytics-results.csv", resultsCsv(rows), "text/csv");
      toast(`${plural(rows.length, "result")} exported.`, "ok");
    },
    ...Object.fromEntries(
      FILTERS.map((f) => [
        `filter-${f.key}`,
        (el: HTMLElement) => {
          const options = filterOptions(observations(store.runs, store.saved))[f.key];
          openChecklist(el, {
            title: f.title,
            search: options.length > 8,
            options: options.map((o) => ({ value: o.value, label: o.value, extra: `<span class="muted">${o.count}</span>`, checked: filter[f.key].includes(o.value) })),
            onChange: (values) => {
              filter[f.key] = values;
              redraw();
            },
          });
        },
      ])
    ),
  },
};

export default page;
