/**
 * An agent's profile: its record over the last 30 and 90 days, its verdict mix, its releases when
 * its runs carry versions, how it fares by world and by fault kind, the scenarios it handles worst,
 * the rules that decide against it, and its newest results.
 */
import { VERDICT_SEVERITY } from "../../../types.js";
import { adviceFor, dailySeries, faultImpact, inRange, isCritical, isFlaky, isUnexpected, latest, matrix, observations, summarize, topRules, versionRows, type Observation, type VersionRow } from "../lib/analytics.js";
import { headToHead, latestVersion, NO_FAULT, ownsVersions, standings, versionMarks, type Standing } from "../lib/agents.js";
import { absTime, clip, dayLabel, esc, href, pct, plural, relTime, shortDay, withQuery } from "../lib/format.js";
import { load, remember, store } from "../lib/state.js";
import { icon } from "../icons.js";
import type { Page } from "../routes.js";
import { sourceChip, verdictTint, verdictTrail, versionTag } from "../ui/agent-kit.js";
import { barList, chart, donut, rateColors, sparkline } from "../ui/charts.js";
import { callout, emptyState, kpi, kpis, metaItem, pageHead, panel } from "../ui/layout.js";
import { openMenu } from "../ui/overlays.js";
import { button, delta, tip, worldIcon } from "../ui/primitives.js";
import { by, dataTable, registerTable, tableState, type Column } from "../ui/table.js";
import { expectedMark, rateMeter, tallyOf, VERDICT_META, verdictCode, verdictLegend, verdictText } from "../ui/verdicts.js";

const pcts = (v: number) => `${Math.round(v * 100)}%`;

function head(id: string, info: { description: string; source: string } | undefined, mine: Observation[], version: string | undefined): string {
  const first = mine.reduce<string | undefined>((min, o) => (!min || o.at < min ? o.at : min), undefined);
  const last = mine.reduce<string | undefined>((max, o) => (!max || o.at > max ? o.at : max), undefined);
  const registered = Boolean(info);
  return `<div class="agent-head"><span class="glyph lg" aria-hidden="true">${icon("bot", 18)}</span>${pageHead({
    eyebrow: `Agent${info ? "" : " · not registered"}`,
    title: id,
    mono: true,
    titleExtra: versionTag(version),
    desc: esc(info?.description || "No description."),
    meta: [
      `<span class="meta-chip">${sourceChip(info?.source ?? "")}</span>`,
      metaItem("target", mine.length ? `<b class="fg">${mine.length.toLocaleString("en-US")}</b> results on ${plural(new Set(mine.map((o) => o.scenarioId)).size, "scenario")}` : "No results yet"),
      ...(first ? [metaItem("calendar", `Since <b class="fg">${esc(shortDay(first.slice(0, 10)))}</b>`, absTime(first))] : []),
      ...(last ? [metaItem("clock", `Latest result <b class="fg">${esc(relTime(last))}</b>`, absTime(last))] : []),
    ],
    actions: `${mine.length ? button("Reports", { href: withQuery("#/reports", { agent: id }), icon: "file", kind: "ghost" }) : ""}${button("Compare with…", { action: "compare-menu", icon: "split", iconEnd: "chevronDown", data: { agent: id } })}${button("Sweep", { href: withQuery("#/sweep", { agent: id }), icon: "grid", disabled: !registered, title: registered ? "Inject every fault kind at every step of a scenario" : "Register the agent to sweep it" })}${button("Run this agent", { href: withQuery("#/launch", { agents: id }), kind: "primary", icon: "play", disabled: !registered })}`,
  })}</div>`;
}

function kpiStrip(id: string, mine: Observation[]): string {
  const range = inRange(mine, "30d");
  const recent = range.current.length > 0;
  const current = recent ? range.current : mine;
  const now = summarize(current);
  const before = summarize(range.previous);
  const hasPrev = recent && range.previous.length > 0;
  const d = (a: number, b: number) => (hasPrev ? (a - b) * 100 : null);
  const series = dailySeries(current, recent ? 30 : 90);
  const scenarios = new Set(current.map((o) => o.scenarioId)).size;
  const scenariosBefore = new Set(range.previous.map((o) => o.scenarioId)).size;
  const allScenarios = new Set(mine.map((o) => o.scenarioId)).size;
  const reports = (q: Record<string, string | number>) => withQuery("#/reports", { agent: id, ...q });
  const caption = recent
    ? `The last 30 days${hasPrev ? ", compared with the 30 days before" : "; nothing ran in the 30 days before"}`
    : `All ${plural(mine.length, "result")}; none in the last 30 days`;
  return `<div class="ag-period"><span class="muted small">${esc(caption)}</span></div>${kpis([
    kpi({ label: "Safe share", icon: "shieldCheck", value: pct(now.safe, now.total), delta: delta(d(now.safeRate, before.safeRate), { unit: "pts", title: `vs ${pct(before.safe, before.total)} the 30 days before` }), spark: recent ? sparkline(series.map((p) => p.safeRate), { width: 120, color: "var(--ssucc)", min: 0, max: 1, label: "safe share by day" }) : "", sub: `${now.safe.toLocaleString("en-US")} of ${now.total.toLocaleString("en-US")} ended safe` }),
    kpi({ label: "Results", icon: "target", value: now.total.toLocaleString("en-US"), delta: hasPrev ? delta(before.total ? ((now.total - before.total) / before.total) * 100 : null, { unit: "%", title: `vs ${before.total} the 30 days before` }) : "", spark: recent ? sparkline(series.map((p) => p.total), { width: 120, min: 0, label: "results by day" }) : "", sub: `${plural(new Set(current.map((o) => o.runId).filter(Boolean)).size, "run")}`, href: reports({}) }),
    kpi({ label: "Critical", icon: "octagon", value: now.critical, tone: now.critical ? "bad" : "", delta: delta(d(now.criticalRate, before.criticalRate), { unit: "pts", inverse: true, title: "change in the share of critical results" }), spark: recent ? sparkline(series.map((p) => p.critical), { width: 120, color: "var(--harm)", min: 0, label: "critical results by day" }) : "", sub: `${now.byVerdict.HARMFUL_ACTION} harmful · ${now.byVerdict.SILENT_FAILURE} silent`, href: reports({ verdict: "critical" }) }),
    kpi({ label: "Unexpected", icon: "xCircle", value: now.unexpected, tone: now.unexpected ? "warn" : now.graded ? "ok" : "", delta: delta(d(now.unexpectedRate, before.unexpectedRate), { unit: "pts", inverse: true, title: "change in the share of graded results that miss their expected verdict" }), sub: now.graded ? `${pct(now.graded - now.unexpected, now.graded)} of ${now.graded.toLocaleString("en-US")} match expected` : "no expected verdicts", href: reports({ unexpected: 1 }) }),
    kpi({ label: "Flaky", icon: "split", value: now.flaky, tone: now.flaky ? "warn" : "", delta: delta(d(now.flakyRate, before.flakyRate), { unit: "pts", inverse: true, title: "change in the share of multi-trial results whose trials disagree" }), sub: now.multiTrial ? `${pct(now.flaky, now.multiTrial)} of multi-trial results disagree` : "no multi-trial results", href: reports({ flaky: 1 }) }),
    kpi({ label: "Scenarios", icon: "layers", value: scenarios, delta: hasPrev ? delta(scenarios - scenariosBefore, { title: `vs ${scenariosBefore} the 30 days before` }) : "", sub: `of ${plural(allScenarios, "scenario")} in its history` }),
  ])}`;
}

function trendPanel(mine: Observation[], owns: boolean): string {
  const first = mine.reduce((min, o) => (o.at < min ? o.at : min), mine[0].at);
  const span = Math.min(90, Math.max(14, Math.ceil((Date.now() - Date.parse(first)) / 86_400_000) + 1));
  const days = dailySeries(mine, span);
  const labels = days.map((p) => shortDay(p.day));
  const marks = owns ? versionMarks(mine, days.map((p) => p.day)) : [];
  const active = days.filter((p) => p.total).length;
  return panel(
    { title: "Safe share over time", icon: "trendUp", meta: `${esc(labels[0])} – ${esc(labels.at(-1) ?? "")} · each day's share of results that ended safe${span < 90 ? " · since its first result" : " · last 90 days"}` },
    active
      ? `${chart({ kind: "line", series: [{ id: "safe", label: "safe share", color: "var(--ssucc)", values: days.map((p) => p.safeRate) }], labels, tipLabels: days.map((p) => `${dayLabel(p.day)} · ${plural(p.total, "result")}`), min: 0, max: 1, format: pcts, marks, height: 236, ariaLabel: "Daily safe share" })}<div class="release-marks ag-marks">${icon("calendar", 12)}<span class="muted">Results on ${plural(active, "day")} of ${span}</span>${marks.map((m) => `<span${tip(`First run of ${m.label} on ${labels[m.index]}`)}><b>${esc(m.label)}</b> ${esc(labels[m.index])}</span>`).join("")}</div>`
      : emptyState({ icon: "trendUp", title: "No results in the last 90 days", text: "Its older results still count in the verdict mix and the tables below.", compact: true })
  );
}

function mixPanel(mine: Observation[]): string {
  const s = summarize(mine);
  const parts = tallyOf(s.byVerdict);
  return panel({ title: "Verdict mix", icon: "pieChart", meta: `all ${plural(s.total, "result")}` }, `<div class="ag-mix">${donut(parts, { size: 136, thickness: 13, value: pct(s.safe, s.total), label: "safe" })}${verdictLegend(parts, { all: true })}</div>`);
}

function releasePanel(rows: VersionRow[]): string {
  const first = rows[0];
  const last = rows.at(-1)!;
  const change = (last.summary.safeRate - first.summary.safeRate) * 100;
  const columns: Array<Column<VersionRow>> = [
    { id: "version", label: "Version", render: (v) => versionTag(v.version, `Results from runs started with v${v.version}`) },
    { id: "period", label: "Runs", render: (v) => `<div class="cell-2"><span${tip(`${absTime(v.firstAt)} – ${absTime(v.lastAt)}`)}>${esc(shortDay(v.firstAt.slice(0, 10)))} – ${esc(shortDay(v.lastAt.slice(0, 10)))}</span><span class="sub">${plural(v.runs, "run")}</span></div>` },
    { id: "results", label: "Results", num: true, render: (v) => v.summary.total.toLocaleString("en-US") },
    { id: "safe", label: "Safe share", render: (v) => rateMeter(v.summary.safeRate, { title: `${v.summary.safe} of ${v.summary.total} results ended safe` }) },
    { id: "critical", label: "Critical", num: true, render: (v) => (v.summary.critical ? `<span class="bad-text">${v.summary.critical}</span>` : "0") },
    { id: "change", label: "Change", num: true, render: (v) => { const i = rows.indexOf(v); return i ? delta((v.summary.safeRate - rows[i - 1].summary.safeRate) * 100, { unit: "pts", title: `safe share vs v${rows[i - 1].version}` }) : '<span class="muted small">first</span>'; } },
  ];
  const story = rows.length > 1 ? `From <b>v${esc(first.version)}</b> to <b>v${esc(last.version)}</b> the safe share went from <b>${pct(first.summary.safe, first.summary.total)}</b> to <b>${pct(last.summary.safe, last.summary.total)}</b> ${delta(change, { unit: "pts" })} over ${plural(rows.length, "version")}.` : `Every versioned result so far comes from <b>v${esc(first.version)}</b>.`;
  return panel(
    { title: "Release history", icon: "flag", meta: "results by the version their run was started with" },
    `<p class="ag-story">${story}</p><div class="ag-release">${chart({ kind: "bars", labels: rows.map((v) => `v${v.version}`), tipLabels: rows.map((v) => `v${v.version} · ${shortDay(v.firstAt.slice(0, 10))} – ${shortDay(v.lastAt.slice(0, 10))}`), stacks: rows.map((v) => v.summary.byVerdict), normalized: true, line: { label: "safe share", color: "var(--ink)", values: rows.map((v) => v.summary.safeRate) }, height: 210, ariaLabel: "Verdict shares and the safe share of each version" })}${dataTable({ id: "agent-versions", columns, rows: [...rows].reverse(), state: tableState("agent-versions"), plain: true, flush: true, cards: true, empty: "", caption: "Versions" })}</div>`
  );
}

function worldPanel(mine: Observation[]): string {
  const cells = matrix(mine, () => ["all"], (o) => o.worlds).sort((a, b) => b.total - a.total || a.col.localeCompare(b.col));
  return panel(
    { title: "Safe share by world", icon: "globe", meta: "share of its results in each world that ended safe" },
    `<div class="ag-worlds">${cells
      .map((c) => {
        const color = rateColors(c.rate);
        return `<div class="ag-world" style="--hm-bg:${color.bg};--hm-fg:${color.fg}"${tip(`${c.safe} of ${plural(c.total, "result")} in ${c.col} ended safe; ${c.critical} ended critical`)}><span class="ag-world-name">${worldIcon(c.col, 12)}${esc(c.col)}</span><b>${pct(c.safe, c.total)}</b><span class="ag-world-sub">${c.safe}/${c.total} safe</span></div>`;
      })
      .join("")}</div>`
  );
}

function faultPanel(id: string, mine: Observation[]): string {
  const kinds = faultImpact(mine);
  const shown = kinds.slice(0, 8);
  const rest = kinds.slice(8);
  return panel(
    { title: "Fault-kind impact", icon: "zap", meta: "share of results that ended critical with each fault kind in the schedule", foot: rest.length ? `${plural(rest.length, "more fault kind")}${rest.every((k) => !k.critical) ? ", none with a critical result" : ""}: ${esc(rest.map((k) => k.kind).join(", "))}` : "" },
    shown.length
      ? barList(
          shown.map((k) => ({ label: `<code>${esc(k.kind)}</code>`, value: k.criticalRate, display: `${pct(k.critical, k.total)} · ${k.critical}/${k.total}`, color: verdictTint("HARMFUL_ACTION", 26), href: k.kind === NO_FAULT ? undefined : withQuery("#/catalog/faults", { kind: k.kind }), tip: `With ${k.kind} in the schedule, ${k.critical} of ${id}'s ${plural(k.total, "result")} ended HARMFUL_ACTION or SILENT_FAILURE (${pct(k.safe, k.total)} ended safe)` })),
          { max: Math.max(0.25, ...shown.map((k) => k.criticalRate)) }
        )
      : emptyState({ icon: "zap", title: "No results", compact: true })
  );
}

const WEAK_COLUMNS: Array<Column<Standing>> = [
  { id: "scenario", label: "Scenario", sort: by.text((s) => s.scenarioId), render: (s) => `<div class="cell-2"><a class="row-link mono" href="${esc(href("scenario", s.scenarioId))}">${esc(s.scenarioId)}</a><span class="sub">${esc(s.worlds.join(" · "))} · ${plural(s.summary.total, "result")}</span></div>` },
  { id: "latest", label: "Latest", sort: by.num((s) => VERDICT_SEVERITY[s.last.verdict]), render: (s) => `<div class="cell-2"><a class="ag-verdict-link" href="${esc(href("report", s.last.key))}">${verdictText(s.last.verdict)}</a><span class="sub"${tip(absTime(s.last.at))}>${esc(relTime(s.last.at))}${s.last.version ? ` · v${esc(s.last.version)}` : ""}</span></div>` },
  { id: "expected", label: "Expected", render: (s) => (s.last.expected ? `<div class="cell-2">${verdictText(s.last.expected)}<span class="sub">${expectedMark(s.last)}</span></div>` : '<span class="muted small">not listed</span>') },
  { id: "safe", label: "Safe share", sort: by.num((s) => s.summary.safeRate), render: (s) => rateMeter(s.summary.safeRate, { title: `${s.summary.safe} of ${s.summary.total} results ended safe` }) },
  { id: "trend", label: "Trend", sort: by.num((s) => s.trend), render: (s) => `<span class="ag-trend-cell">${verdictTrail(s.recent)}${s.trend === null ? "" : delta(s.trend * 100, { unit: "pts", title: "safe share of the newer half of its results vs the older half" })}</span>` },
];

function weakPanel(mine: Observation[]): string {
  const rows = standings(mine);
  const render = () => dataTable({ id: "agent-weak", columns: WEAK_COLUMNS, rows, state: tableState("agent-weak", { pageSize: 10 }), rowKey: (s) => s.scenarioId, rowHref: (s) => href("report", s.last.key), rowCls: (s) => (isUnexpected(s.last) ? "ag-row-open" : ""), flush: true, cards: true, empty: emptyState({ icon: "layers", title: "No scenarios yet", compact: true }), caption: "Scenarios, weakest first" });
  const html = render();
  registerTable("agent-weak", render);
  const open = rows.filter((s) => isUnexpected(s.last)).length;
  return panel({ title: "Weakest scenarios", icon: "target", meta: `${plural(rows.length, "scenario")}, the most severe latest verdict first${open ? ` · ${open} unexpected` : ""}`, flush: true }, html);
}

function rulesPanel(id: string, mine: Observation[]): string {
  const rules = topRules(mine).slice(0, 7);
  return panel(
    { title: "Top finding rules", icon: "flag", meta: "rules that decided its unsafe results", flush: true, actions: `<a class="link-quiet" href="${esc(withQuery("#/reports", { agent: id, verdict: "critical" }))}">Critical results ${icon("arrowRight", 12)}</a>` },
    rules.length
      ? `<ul class="list ag-rules">${rules
          .map((r) => {
            const advice = adviceFor(r.rule);
            return `<li><a class="list-row" href="${esc(withQuery("#/reports", { rule: r.rule, agent: id }))}">${verdictCode(r.verdict, `Most severe verdict it decided: ${r.verdict}`)}<span class="grow"><span class="title mono">${esc(r.rule)}</span><span class="detail"${advice ? tip(advice.advice) : ""}>${advice ? `<b>${esc(advice.topic[0].toUpperCase() + advice.topic.slice(1))}.</b> ${esc(advice.advice)}` : esc(VERDICT_META[r.verdict].meaning)}</span></span><span class="ag-count">${r.count}</span>${icon("chevronRight", 14, "faint")}</a></li>`;
          })
          .join("")}</ul>`
      : emptyState({ icon: "checkCircle", title: "No findings against it", text: "Every result ended SAFE_SUCCESS or SAFE_FAILURE, so no rule decided against this agent.", compact: true })
  );
}

const RECENT_COLUMNS: Array<Column<Observation>> = [
  { id: "verdict", label: "Verdict", render: (o) => `<div class="cell-2">${verdictText(o.verdict)}${o.trials > 1 ? `<span class="sub">${o.trials} trials${isFlaky(o) ? " · flaky" : ""}</span>` : ""}</div>` },
  { id: "scenario", label: "Scenario", render: (o) => `<a class="row-link mono" href="${esc(href("report", o.key))}">${esc(o.scenarioId)}</a>` },
  { id: "expected", label: "Expected", render: (o) => expectedMark(o) || '<span class="muted small">not listed</span>' },
  { id: "run", label: "Run", render: (o) => (o.runId ? `<div class="cell-2"><a class="link" href="${esc(href("run", o.runId))}">${esc(o.label ?? o.runId)}</a><span class="sub">${esc(o.runId)}${o.version ? ` · v${esc(o.version)}` : ""}</span></div>` : '<span class="muted small">saved report</span>') },
  { id: "when", label: "When", cls: "when", thCls: "when", render: (o) => `<span${tip(absTime(o.at))}>${esc(relTime(o.at))}</span>` },
];

function recentPanel(id: string, mine: Observation[]): string {
  const rows = [...mine].sort((a, b) => b.at.localeCompare(a.at) || a.scenarioId.localeCompare(b.scenarioId)).slice(0, 10);
  return panel(
    { title: "Recent results", icon: "history", meta: "its 10 newest results", flush: true, actions: `<a class="link-quiet" href="${esc(withQuery("#/reports", { agent: id }))}">All its reports ${icon("arrowRight", 12)}</a>` },
    dataTable({ id: "agent-recent", columns: RECENT_COLUMNS, rows, state: tableState("agent-recent"), rowHref: (o) => href("report", o.key), plain: true, flush: true, cards: true, empty: "", caption: "Newest results" })
  );
}

function openCallout(mine: Observation[]): string {
  const open = latest(mine)
    .filter(isUnexpected)
    .sort((a, b) => VERDICT_SEVERITY[b.verdict] - VERDICT_SEVERITY[a.verdict] || b.at.localeCompare(a.at));
  if (!open.length) return "";
  const critical = open.some((o) => isCritical(o.verdict));
  return callout(
    critical ? "bad" : "warn",
    `<ul class="ag-open">${open
      .slice(0, 4)
      .map((o) => `<li><a class="link" href="${esc(href("report", o.key))}">${esc(o.scenarioId)}</a> ends ${verdictText(o.verdict)}, expected ${verdictText(o.expected ?? undefined)}${o.reason ? `<span class="muted"> · ${esc(clip(o.reason, 120))}</span>` : ""}</li>`)
      .join("")}</ul>${open.length > 4 ? `<span class="muted small">and ${open.length - 4} more</span>` : ""}`,
    { title: `${plural(open.length, "latest result")} ${open.length === 1 ? "misses its" : "miss their"} expected verdict`, actions: button("Open the findings", { href: withQuery("#/reports", { agent: open[0].agentId, unexpected: 1 }), size: "sm", iconEnd: "arrowRight" }) }
  );
}

const page: Page = {
  nav: "agents",
  title: (ctx) => ctx.arg ?? "Agent",
  skeleton: "detail",
  watches: ["runs", "reports"],
  async render(ctx) {
    const id = ctx.arg ?? "";
    await Promise.all([load.runs(), load.reports()]);
    const info = store.meta.agents.find((a) => a.id === id);
    const mine = observations(store.runs, store.saved).filter((o) => o.agentId === id);
    if (!info && !mine.length) {
      return `<div class="page">${emptyState({ icon: "bot", title: `No agent named ${id || "(none)"}`, text: "It is not registered in this session, and the workspace history has no results for it.", actions: button("All agents", { href: "#/agents", icon: "bot" }) })}</div>`;
    }
    const owns = ownsVersions(info?.source ?? "");
    const version = owns ? latestVersion(mine) : undefined;
    remember({ kind: "agent", id, label: id, detail: version ? `v${version}` : clip(info?.description ?? "", 60) });
    const top = head(id, info, mine, version);
    const unregistered = info ? "" : callout("info", `<code>${esc(id)}</code> is not registered in this session, so it cannot run and its results cannot be regenerated. Register it again with <code>--agent</code> or in the project config to run it.`, { title: "Known from the history only" });
    if (!mine.length) {
      return `<div class="page agent-page">${top}${emptyState({ icon: "bot", title: "No results yet", text: `Run <code>${esc(id)}</code> against the scenarios to see its safe share, its verdict mix, and the scenarios it handles worst.`, actions: `${button("Run this agent", { href: withQuery("#/launch", { agents: id }), kind: "primary", icon: "play" })}${button("Sweep a scenario", { href: withQuery("#/sweep", { agent: id }), icon: "grid" })}` })}</div>`;
    }
    const versions = owns ? versionRows(mine, id) : [];
    const open = openCallout(mine);
    return `<div class="page agent-page">
  ${top}
  ${unregistered ? `<div class="mb-16">${unregistered}</div>` : ""}
  ${open ? `<div class="mb-16">${open}</div>` : ""}
  ${kpiStrip(id, mine)}
  <div class="grid g-8-4">${trendPanel(mine, owns)}${mixPanel(mine)}</div>
  ${versions.length ? `<div class="mt-16">${releasePanel(versions)}</div>` : ""}
  <div class="mt-16">${weakPanel(mine)}</div>
  <div class="grid g-2 mt-16"><div class="stack">${worldPanel(mine)}${faultPanel(id, mine)}</div>${rulesPanel(id, mine)}</div>
  <div class="mt-16">${recentPanel(id, mine)}</div>
</div>`;
  },
  actions: {
    "compare-menu": (el) => {
      const id = el.dataset.agent ?? "";
      const obs = observations(store.runs, store.saved);
      const ids = [...new Set([...store.meta.agents.map((a) => a.id), ...obs.map((o) => o.agentId)])].filter((x) => x !== id);
      const shared = new Map(ids.map((other) => [other, headToHead(obs, id, other).length]));
      const sorted = ids.sort((a, b) => (shared.get(b) ?? 0) - (shared.get(a) ?? 0) || a.localeCompare(b));
      openMenu(
        [{ heading: `Compare ${id} with` }, ...sorted.map((other) => ({ label: other, icon: "bot" as const, hint: shared.get(other) ? `${shared.get(other)} shared` : "none shared", href: withQuery("#/compare", { a: id, b: other }) }))],
        el
      );
    },
  },
};

export default page;
