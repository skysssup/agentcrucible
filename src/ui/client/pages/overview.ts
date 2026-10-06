/**
 * The command center: how reliable the agents are over a chosen period, what needs attention now,
 * which agents lead, what to fix next, and what happened lately.
 */
import type { ActivityEvent, RunRecord } from "../../api.js";
import { agentRows, dailySeries, inRange, insights, isCritical, isFlaky, isUnexpected, latest, observations, summarize, type Insight, type Observation, type Range, RANGES } from "../lib/analytics.js";
import { clip, esc, href, pct, plural, relTime, shortDay } from "../lib/format.js";
import { runtime } from "../lib/runtime.js";
import { load, projectName, store } from "../lib/state.js";
import { icon, type IconName } from "../icons.js";
import { eventIcon } from "../notifications.js";
import type { Page } from "../routes.js";
import { chart, sparkline } from "../ui/charts.js";
import { callout, emptyState, kpi, kpis, metaItem, pageHead, panel, progressBar } from "../ui/layout.js";
import { button, delta, segmented, tip } from "../ui/primitives.js";
import { rateMeter, tally, verdictBar, VERDICT_VAR } from "../ui/verdicts.js";

let range: Range = "30d";
let trendMode: "counts" | "shares" = "counts";

/** Where each agent version first appears in the history, as marks on the trend chart. */
function releaseMarks(runs: RunRecord[], days: string[]): Array<{ index: number; label: string }> {
  const seen = new Set<string>();
  const marks: Array<{ index: number; label: string }> = [];
  for (const run of [...runs].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    if (!run.version || seen.has(run.version)) continue;
    seen.add(run.version);
    const day = new Date(run.startedAt);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    const index = days.indexOf(key);
    if (index >= 0) marks.push({ index, label: `v${run.version}` });
  }
  return marks;
}

interface Alert {
  severity: "critical" | "warning" | "info";
  icon: IconName;
  title: string;
  detail: string;
  link?: string;
  at?: string;
}

function alerts(obs: Observation[], events: ActivityEvent[]): Alert[] {
  const out: Alert[] = [];
  const now = latest(obs);
  for (const o of now.filter(isUnexpected).sort((a, b) => Number(isCritical(b.verdict)) - Number(isCritical(a.verdict)) || b.at.localeCompare(a.at)).slice(0, 4)) {
    out.push({ severity: isCritical(o.verdict) ? "critical" : "warning", icon: isCritical(o.verdict) ? "octagon" : "alert", title: `${o.agentId} · ${o.scenarioId}`, detail: `${o.verdict}, expected ${o.expected}`, link: href("report", o.key), at: o.at });
  }
  const compared = events.find((e) => e.type === "baseline.compared");
  if (compared && compared.severity === "critical") out.push({ severity: "critical", icon: "trendDown", title: compared.title, detail: compared.detail ?? "", link: "#/baseline", at: compared.at });
  const failed = events.find((e) => e.type.endsWith(".failed") && Date.now() - Date.parse(e.at) < 7 * 86_400_000);
  if (failed) out.push({ severity: "critical", icon: "xCircle", title: failed.title, detail: failed.detail ?? "", link: failed.link, at: failed.at });
  const flaky = now.filter((o) => o.trials > 1 && isFlaky(o));
  if (flaky.length) out.push({ severity: "warning", icon: "split", title: `${plural(flaky.length, "result")} with disagreeing trials`, detail: flaky.slice(0, 2).map((o) => `${o.scenarioId} (${o.agentId})`).join(", ") + (flaky.length > 2 ? ", …" : ""), link: "#/reports?flaky=1" });
  const cov = store.coverage;
  if (cov) {
    const gaps = Object.values(cov.gaps).reduce((n, g) => n + g.length, 0);
    if (gaps) out.push({ severity: "info", icon: "shieldCheck", title: `${plural(gaps, "coverage gap")}`, detail: `${cov.gaps.tools.length} tools never faulted · ${cov.gaps.withoutExpectedVerdicts.length} scenarios without expected verdicts`, link: "#/coverage" });
  }
  if (store.scenarioError) out.unshift({ severity: "critical", icon: "alert", title: "A scenario file does not load", detail: store.scenarioError, link: "#/scenarios" });
  return out;
}

function alertRow(a: Alert): string {
  const inner = `<span class="feed-icon ${a.severity === "info" ? "" : a.severity}">${icon(a.icon, 14)}</span><span class="grow"><span class="title wrap">${esc(a.title)}</span><span class="detail">${esc(a.detail)}</span></span>${a.at ? `<span class="feed-meta">${esc(relTime(a.at))}</span>` : ""}${icon("chevronRight", 14, "faint")}`;
  return `<li>${a.link ? `<a class="list-row" href="${esc(a.link)}">${inner}</a>` : `<div class="list-row">${inner}</div>`}</li>`;
}

const INSIGHT_ICON: Record<Insight["severity"], IconName> = { critical: "octagon", warning: "lightbulb", info: "info", success: "trendUp" };

function insightRow(i: Insight): string {
  return `<li class="insight ${i.severity}"><span class="insight-icon">${icon(INSIGHT_ICON[i.severity], 14)}</span><div class="grow"><span class="insight-title">${esc(i.title)}</span><span class="insight-detail">${esc(clip(i.detail, 180))}</span>${i.link ? `<a class="link-quiet" href="${esc(i.link)}">${esc(i.action ?? "Open")} ${icon("arrowRight", 12)}</a>` : ""}</div></li>`;
}

function setupSteps(): Array<{ done: boolean; title: string; text: string; href: string; action: string }> {
  const runs = store.runs;
  const builtIn = new Set(store.meta.agents.filter((a) => a.source === "built-in").map((a) => a.id));
  return [
    { done: runs.some((r) => r.seed === store.meta.demo.seed && r.scenarios[0] === store.meta.demo.scenario), title: "Watch the guided demo", text: "Five agents, one refund whose response is lost.", href: "#/demo", action: "Open the demo" },
    { done: (store.scenarios ?? []).some((s) => !s.bundled), title: "Write a scenario for your domain", text: "Break the tool your agent depends on most.", href: "#/editor", action: "Open the editor" },
    { done: runs.some((r) => r.results.some((x) => x.agentId && !builtIn.has(x.agentId))), title: "Run your own agent", text: "A module, a provider:model id, or an MCP client.", href: "#/launch", action: "Start a run" },
    { done: store.sweeps.length > 0, title: "Sweep a scenario", text: "Every fault kind at every step of the agent's path.", href: "#/sweep", action: "Run a sweep" },
    { done: Boolean(store.baseline?.baseline), title: "Save a baseline", text: "CI then fails only on regressions and new failures.", href: "#/baseline", action: "Open the baseline" },
    { done: Boolean(store.system?.ci.workflows.length), title: "Gate pull requests in CI", text: "The GitHub Action annotates failing scenarios.", href: "#/settings/integrations", action: "Set up CI" },
  ];
}

function recentRuns(runs: RunRecord[]): string {
  if (!runs.length) return emptyState({ icon: "runs", title: "No runs yet", text: "Start a run to grade agents against the scenarios; it shows up here with its verdicts.", actions: button("Start a run", { href: "#/launch", kind: "primary", icon: "play", size: "sm" }), compact: true });
  return `<div class="table-wrap flush"><table class="dt"><thead><tr><th>Run</th><th>Verdicts</th><th class="num">Safe</th><th>Status</th><th class="when">Started</th></tr></thead><tbody>${runs
    .slice(0, 7)
    .map((r) => {
      const off = r.results.filter(isUnexpected).length;
      const graded = r.results.filter((x) => x.expected).length;
      const safe = r.results.filter((x) => x.verdict === "SAFE_SUCCESS" || x.verdict === "SAFE_FAILURE").length;
      return `<tr data-href="${href("run", r.runId)}"><td><div class="cell-2"><a class="row-link" href="${href("run", r.runId)}">${esc(r.label ?? (r.scenarios.length === 1 ? r.scenarios[0] : `${r.scenarios.length} scenarios`))}</a><span class="sub">${esc(r.runId)}${r.version ? ` · v${esc(r.version)}` : ""} · ${plural(r.results.length, "result")}</span></div></td><td style="width:22%">${verdictBar(tally(r.results), { size: "sm" })}</td><td class="num">${pct(safe, r.results.length)}</td><td>${graded ? (off ? `<span class="exp-sum bad">${icon("xCircle", 12)}${off} unexpected</span>` : `<span class="exp-sum ok">${icon("checkCircle", 12)}as expected</span>`) : '<span class="muted small">no expectations</span>'}</td><td class="when">${esc(relTime(r.startedAt))}</td></tr>`;
    })
    .join("")}</tbody></table></div>`;
}

function coverageGlance(): string {
  const cov = store.coverage;
  if (!cov) return '<p class="muted small">Coverage is not available.</p>';
  const worlds = cov.worlds.map((w) => w.name);
  const cell = (kind: string, world: string) => cov.matrix.filter((m) => m.kind === kind && m.world === world).reduce((n, m) => n + m.scenarios.length, 0);
  const max = Math.max(1, ...cov.faultKinds.flatMap((k) => worlds.map((w) => cell(k.kind, w))));
  const used = cov.faultKinds.length - cov.gaps.faultKinds.length;
  const tools = cov.worlds.reduce((n, w) => n + w.tools.length, 0);
  const faulted = cov.worlds.reduce((n, w) => n + w.tools.filter((t) => t.faultKinds.length).length, 0);
  return `<div class="cov-glance">
    <div class="cov-mini" style="grid-template-columns:minmax(0,1fr) repeat(${worlds.length}, 22px)">
      <span></span>${worlds.map((w) => `<span class="cov-mini-h" title="${esc(w)}">${esc(w.slice(0, 3))}</span>`).join("")}
      ${cov.faultKinds
        .map((k) => `<span class="cov-mini-k">${esc(k.kind)}</span>${worlds.map((w) => { const n = cell(k.kind, w); return `<a class="cov-mini-c" href="${n ? "#/coverage" : "#/coverage"}" style="--a:${n ? 18 + Math.round((n / max) * 62) : 0}%"${tip(`${k.kind} in ${w}: ${plural(n, "scenario")}`)}>${n || ""}</a>`; }).join("")}`)
        .join("")}
    </div>
    <div class="cov-glance-facts">
      <div><b>${used}<small>/${cov.faultKinds.length}</small></b><span>fault kinds injected</span></div>
      <div><b>${faulted}<small>/${tools}</small></b><span>tools faulted</span></div>
      <div><b>${cov.agents.length - cov.gaps.agents.length}<small>/${cov.agents.length}</small></b><span>agents held to verdicts</span></div>
    </div>
  </div>`;
}

const page: Page = {
  nav: "",
  title: () => "Command center",
  skeleton: "dashboard",
  watches: ["runs", "reports", "notifications", "activity", "sweeps", "baseline"],
  async render() {
    await Promise.all([load.scenarios(), load.runs(), load.reports(), load.sweeps(), load.coverage(), load.baseline().catch(() => undefined), load.activity(), load.system().catch(() => undefined)]);
    const meta = store.meta;
    const all = observations(store.runs, store.saved);
    const { current, previous, days } = inRange(all, range);
    const now = summarize(current);
    const before = summarize(previous);
    const spanDays = range === "all" ? Math.min(days, 120) : range === "24h" ? 2 : days;
    const series = dailySeries(current, spanDays);
    const hasPrev = previous.length > 0;
    const d = (a: number, b: number) => (hasPrev ? (a - b) * 100 : null);
    const cov = store.coverage;
    const lastRun = store.runs[0];
    const baseline = store.baseline?.baseline;
    const events = store.activity;
    const alertList = alerts(all, events);
    const recs = insights(current.length ? current : all, { coverage: cov }).filter((i) => !i.id.startsWith("open:")).slice(0, 4);
    const leaders = agentRows(current).slice(0, 6);
    const prevRows = new Map(agentRows(previous).map((r) => [r.agent, r]));
    const steps = setupSteps();
    const done = steps.filter((s) => s.done).length;
    const labels = series.map((p) => shortDay(p.day));
    const rangeLabel = RANGES.find(([r]) => r === range)![1].toLowerCase();

    const head = pageHead({
      eyebrow: `${icon("dashboard", 11)}Command center`,
      title: projectName(meta),
      desc: all.length
        ? `${plural(now.total, "result")} graded in the last ${esc(rangeLabel === "all time" ? `${days} days` : rangeLabel)}, across ${plural(new Set(current.map((o) => o.agentId)).size, "agent")} and ${plural(new Set(current.map((o) => o.scenarioId)).size, "scenario")}. Every verdict comes from what the mock services committed, never from the agent's own report.`
        : "AgentCrucible runs your agents against mock services, breaks tool calls on a fixed schedule, and grades what they did and said against what the services committed.",
      meta: [
        metaItem("clock", lastRun ? `Last run <b class="fg">${esc(relTime(lastRun.finishedAt ?? lastRun.startedAt))}</b>` : "No runs yet"),
        metaItem("compare", baseline ? `Baseline <b class="fg">${plural(baseline.entries.length, "entry", "entries")}</b>` : "No baseline"),
        metaItem("layers", `${plural(store.scenarios?.length ?? 0, "scenario")}`),
        metaItem("folder", `<code>${esc(meta.cwd)}</code>`, meta.cwd),
      ],
      actions: `${button("Guided demo", { href: "#/demo", icon: "spark" })}${button("Sweep", { href: "#/sweep", icon: "grid" })}${button("New run", { href: "#/launch", kind: "primary", icon: "play", kbd: "N" })}`,
    });

    if (!all.length) {
      return `<div class="page">${head}${callout("accent", `Start with the guided demo: five scripted agents handle the same refund whose first call commits and then times out. It takes a second, and every result opens as a call-by-call timeline.`, { title: "No results in this workspace yet", icon: "spark", actions: button("Run the guided demo", { href: "#/demo?play=1", kind: "primary", icon: "play", size: "sm" }) })}
      <div class="grid g-3 mt-16">${steps.slice(0, 3).map((s, i) => panel({}, `<div class="setup-card"><span class="setup-num">${i + 1}</span><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>${button(s.action, { href: s.href, size: "sm", iconEnd: "arrowRight" })}</div>`)).join("")}</div></div>`;
    }

    const kpiRow = kpis([
      kpi({ label: "Safe share", icon: "shieldCheck", value: pct(now.safe, now.total), delta: delta(d(now.safeRate, before.safeRate), { unit: "pts", title: `vs ${pct(before.safe, before.total)} the period before` }), spark: sparkline(series.map((p) => p.safeRate), { width: 120, color: "var(--ssucc)", min: 0, max: 1, label: "safe share by day" }), sub: `${now.safe.toLocaleString("en-US")} of ${now.total.toLocaleString("en-US")} ended safe`, href: "#/analytics" }),
      kpi({ label: "Results graded", icon: "target", value: now.total.toLocaleString("en-US"), delta: hasPrev ? delta(before.total ? ((now.total - before.total) / before.total) * 100 : null, { unit: "%" }) : "", spark: sparkline(series.map((p) => p.total), { width: 120, min: 0, label: "results by day" }), sub: `${plural(new Set(current.map((o) => o.runId).filter(Boolean)).size, "run")} in the period`, href: "#/runs" }),
      kpi({ label: "Critical", icon: "octagon", value: now.critical, tone: now.critical ? "bad" : "", delta: delta(d(now.criticalRate, before.criticalRate), { unit: "pts", inverse: true }), spark: sparkline(series.map((p) => p.critical), { width: 120, color: "var(--harm)", min: 0, label: "critical results by day" }), sub: `${now.byVerdict.HARMFUL_ACTION} harmful · ${now.byVerdict.SILENT_FAILURE} silent`, href: "#/reports?verdict=critical" }),
      kpi({ label: "Unexpected", icon: "xCircle", value: now.unexpected, tone: now.unexpected ? "warn" : "ok", delta: delta(d(now.unexpectedRate, before.unexpectedRate), { unit: "pts", inverse: true }), spark: sparkline(series.map((p) => p.unexpected), { width: 120, color: "var(--degr)", min: 0, label: "unexpected verdicts by day" }), sub: now.graded ? `${pct(now.graded - now.unexpected, now.graded)} of ${now.graded.toLocaleString("en-US")} match expected_verdicts` : "no expected verdicts in range", href: "#/reports?unexpected=1" }),
      kpi({ label: "Flaky", icon: "split", value: now.flaky, tone: now.flaky ? "warn" : "", delta: delta(d(now.flakyRate, before.flakyRate), { unit: "pts", inverse: true }), sub: now.multiTrial ? `${pct(now.flaky, now.multiTrial)} of multi-trial results disagree` : "no multi-trial results", href: "#/reports?flaky=1" }),
      kpi({ label: "Fault coverage", icon: "zap", value: cov ? `${cov.faultKinds.length - cov.gaps.faultKinds.length}` : "—", unit: cov ? `/${cov.faultKinds.length}` : "", sub: cov ? `${cov.gaps.tools.length} tools never faulted` : "", href: "#/coverage" }),
    ]);

    const trend = panel(
      {
        title: "Reliability over time",
        icon: "barChart",
        meta: `${esc(labels[0] ?? "")} – ${esc(labels.at(-1) ?? "")}`,
        actions: segmented("trend-mode", trendMode, [
          { value: "counts", label: "Counts" },
          { value: "shares", label: "Shares" },
        ]),
      },
      `<ul class="chart-legend">${(["HARMFUL_ACTION", "SILENT_FAILURE", "DEGRADED", "INCONCLUSIVE", "SAFE_FAILURE", "SAFE_SUCCESS"] as const).map((v) => `<li><span class="sw sq" style="--sw:${VERDICT_VAR[v]}"></span>${v}</li>`).join("")}<li><span class="sw" style="--sw:var(--ink)"></span>safe share</li></ul>${chart({
        kind: "bars",
        labels,
        tipLabels: series.map((p) => p.day),
        stacks: series.map((p) => p.byVerdict),
        normalized: trendMode === "shares",
        line: { label: "safe share", color: "var(--ink)", values: series.map((p) => p.safeRate) },
        height: 240,
        hrefs: series.map((p) => (p.total ? `#/runs?day=${p.day}` : undefined)),
        marks: releaseMarks(store.runs, series.map((p) => p.day)),
        ariaLabel: "Verdicts per day with the safe share",
      })}${(() => {
        const marks = releaseMarks(store.runs, series.map((p) => p.day));
        return marks.length ? `<div class="release-marks">${icon("flag", 12)}<span class="muted">Agent versions</span>${marks.map((m) => `<span${tip(`First run of ${m.label} on ${labels[m.index]}`)}><b>${esc(m.label)}</b> ${esc(labels[m.index])}</span>`).join("")}</div>` : "";
      })()}`
    );

    const attention = panel(
      { title: "Needs attention", icon: "alert", meta: alertList.length ? plural(alertList.length, "item") : "", flush: true, actions: `<a class="link-quiet" href="#/reports?unexpected=1">All findings ${icon("arrowRight", 12)}</a>` },
      alertList.length ? `<ul class="list">${alertList.slice(0, 7).map(alertRow).join("")}</ul>` : emptyState({ icon: "checkCircle", title: "All clear", text: "Every latest result matches its expected verdict, and nothing regressed against the baseline.", compact: true })
    );

    const leaderboard = panel(
      { title: "Agent leaderboard", icon: "bot", meta: "by safe share", flush: true, actions: `<a class="link-quiet" href="#/agents">All agents ${icon("arrowRight", 12)}</a>` },
      leaders.length
        ? `<ol class="leaders">${leaders
            .map((r, i) => {
              const prev = prevRows.get(r.agent);
              return `<li><a href="${href("agent", r.agent)}"><span class="rank">${i + 1}</span><span class="grow"><span class="title mono">${esc(r.agent)}</span><span class="detail">${plural(r.summary.total, "result")} · ${plural(r.scenarios, "scenario")}</span></span>${prev ? delta((r.summary.safeRate - prev.summary.safeRate) * 100, { unit: "pts", title: "change from the period before" }) : ""}${rateMeter(r.summary.safeRate)}</a></li>`;
            })
            .join("")}</ol>`
        : emptyState({ icon: "bot", title: "No results in this period", compact: true })
    );

    const recommendations = panel(
      { title: "Recommendations", icon: "lightbulb", meta: "from the evidence", flush: true },
      recs.length ? `<ul class="insights">${recs.map(insightRow).join("")}</ul>` : emptyState({ icon: "lightbulb", title: "Nothing to recommend", text: "No pattern stands out in this period.", compact: true })
    );

    const activity = panel(
      { title: "Recent activity", icon: "activity", flush: true, actions: `<a class="link-quiet" href="#/activity">Activity log ${icon("arrowRight", 12)}</a>` },
      events.length
        ? `<ul class="feed compact">${events
            .slice(0, 7)
            .map((e) => `<li class="feed-item">${eventIcon(e, 12)}<div class="feed-body">${e.link ? `<a class="feed-title" href="${esc(e.link)}">${esc(e.title)}</a>` : `<span class="feed-title">${esc(e.title)}</span>`}<span class="feed-detail">${esc(e.actor)}${e.detail ? ` · ${esc(e.detail)}` : ""}</span></div><span class="feed-meta">${esc(relTime(e.at))}</span></li>`)
            .join("")}</ul>`
        : emptyState({ icon: "activity", title: "Nothing yet", compact: true })
    );

    const setup =
      done < steps.length
        ? panel(
            { title: "Workspace setup", icon: "checkSquare", meta: `${done} of ${steps.length} done`, actions: `<span style="width:120px">${progressBar(done / steps.length, { label: "Setup progress" })}</span>` },
            `<ol class="setup">${steps.map((s) => `<li class="${s.done ? "done" : ""}"><span class="setup-check">${icon(s.done ? "check" : "circle", 12)}</span><span class="grow"><span class="title">${esc(s.title)}</span><span class="detail">${esc(s.text)}</span></span>${s.done ? '<span class="pill ok">Done</span>' : button(s.action, { href: s.href, size: "sm", iconEnd: "arrowRight" })}</li>`).join("")}</ol>`
          )
        : "";

    const recent = store.recent.length
      ? panel(
          { title: "Recently viewed", icon: "history", flush: true },
          `<ul class="list">${store.recent
            .slice(0, 6)
            .map((r) => {
              const link = r.kind === "scenario" ? href("scenario", r.id) : r.kind === "run" ? href("run", r.id) : r.kind === "report" ? href("report", r.id) : r.kind === "agent" ? href("agent", r.id) : href("sweep", r.id);
              const ic: IconName = r.kind === "scenario" ? "layers" : r.kind === "run" ? "runs" : r.kind === "report" ? "file" : r.kind === "agent" ? "bot" : "grid";
              return `<li><a class="list-row" href="${esc(link)}"><span class="glyph">${icon(ic, 13)}</span><span class="grow"><span class="title">${esc(r.label)}</span><span class="detail">${esc(r.kind)}${r.detail ? ` · ${esc(r.detail)}` : ""}</span></span><span class="feed-meta">${esc(relTime(new Date(r.at).toISOString()))}</span></a></li>`;
            })
            .join("")}</ul>`
        )
      : "";

    return `<div class="page overview">
  ${head}
  <div class="ov-toolbar"><span class="muted small">${range === "all" ? "Everything in the workspace history" : `The last ${esc(rangeLabel)}${hasPrev ? `, compared with the ${esc(rangeLabel)} before` : ""}`}</span>${segmented(
    "range",
    range,
    RANGES.filter(([r]) => r !== "24h").map(([value, label]) => ({ value, label: value === "all" ? "All" : label.replace(" days", "d") })),
    { label: "Period" }
  )}</div>
  ${kpiRow}
  <div class="grid g-8-4">${trend}${attention}</div>
  <div class="grid g-3 mt-16">${leaderboard}${recommendations}${activity}</div>
  <div class="grid g-7-5 mt-16">${panel({ title: "Recent runs", icon: "runs", flush: true, actions: `<a class="link-quiet" href="#/runs">All runs ${icon("arrowRight", 12)}</a>` }, recentRuns(store.runs))}${panel({ title: "Coverage at a glance", icon: "shieldCheck", meta: "scenarios per fault kind and world", actions: `<a class="link-quiet" href="#/coverage">Coverage ${icon("arrowRight", 12)}</a>` }, coverageGlance())}</div>
  ${setup || recent ? `<div class="grid ${setup && recent ? "g-7-5" : ""} mt-16">${setup}${recent}</div>` : ""}
</div>`;
  },
  actions: {
    range: (el) => {
      range = el.dataset.value as Range;
      return runtime.rerender();
    },
    "trend-mode": (el) => {
      trendMode = el.dataset.value as "counts" | "shares";
      return runtime.rerender();
    },
  },
};

export default page;
