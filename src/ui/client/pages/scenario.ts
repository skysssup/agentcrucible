/**
 * One scenario: what it asks of the agent, which calls its faults break and what that does to the
 * world, what a correct run commits, how every agent's results stand over the history, its source
 * file, and what happened to it.
 */
import { describeInvariant, describeRef, isValueRef } from "../../../expect.js";
import { describeSchedule } from "../../../faults.js";
import type { FieldMatcher, RecordPattern, Verdict } from "../../../types.js";
import type { ActivityEvent, ReportSummary, RunRecord, SweepListItem } from "../../api.js";
import { dailySeries, groupBy, isCritical, isFlaky, isSafe, isUnexpected, observations, summarize, type Observation } from "../lib/analytics.js";
import { ApiError } from "../lib/api.js";
import { copy, download } from "../lib/dom.js";
import { absTime, bytes, csv, dayKey, dayLabel, esc, href, pct, plural, relTime, shortDay } from "../lib/format.js";
import { runtime } from "../lib/runtime.js";
import { findResult, load, remember, store, type ScenarioDetail } from "../lib/state.js";
import { icon } from "../icons.js";
import { startRunJob } from "../jobs.js";
import { eventIcon } from "../notifications.js";
import type { Page } from "../routes.js";
import { chart, donut, sparkline } from "../ui/charts.js";
import { codeView } from "../ui/code.js";
import { callout, emptyState, facts, kpi, kpis, metaItem, pageHead, panel } from "../ui/layout.js";
import { openMenu, toast } from "../ui/overlays.js";
import { button, checkbox, codeChip, copyButton, faultTag, field, segmented, select, tabs, tip, worldChip, worldIcon } from "../ui/primitives.js";
import { agentSees, checksLabel, deleteScenario, duplicateInEditor, healthOf, needsAttention, POLICIES, policyState, runHref, scenarioCommand, scheduleLabel, stageDiagram, sweepHref, worldCommits, type Health } from "../ui/scenario-kit.js";
import { by, dataTable, registerTable, tableState } from "../ui/table.js";
import { badge, expectedMark, mixCounts, stageLabel, tally, tallyOf, verdictCode, verdictLegend, verdictText, VERDICT_VAR, VERDICTS } from "../ui/verdicts.js";

type Tab = "overview" | "results" | "source" | "activity";
const TABS: Tab[] = ["overview", "results", "source", "activity"];
type EventKind = "all" | "changes" | "runs" | "sweeps" | "reports";

let detail: ScenarioDetail | undefined;
let loadedAt = 0;
let resultsAgent = "";
let resultRows: Observation[] = [];
let sourceMode: "file" | "parsed" = "file";
let eventKind: EventKind = "all";
let eventLimit = 30;

/**
 * Events about one scenario: its own changes, the runs and sweeps that used it, and events that
 * link to reports of its results.
 */
export function scenarioEvents(id: string, events: ActivityEvent[], ctx: { runs: RunRecord[]; sweeps: SweepListItem[]; resultOf: (key: string) => ReportSummary | undefined }): ActivityEvent[] {
  return events.filter((e) => {
    if (e.data?.id === id || e.link === href("scenario", id)) return true;
    if (e.type.startsWith("run.") && typeof e.data?.runId === "string") return ctx.runs.some((r) => r.runId === e.data?.runId && r.scenarios.includes(id));
    if (e.type.startsWith("sweep.") && typeof e.data?.sweepId === "string") return ctx.sweeps.some((s) => s.sweepId === e.data?.sweepId && s.scenarioId === id);
    if (e.link?.startsWith("#/report/")) return ctx.resultOf(decodeURIComponent(e.link.slice("#/report/".length)))?.scenarioId === id;
    return false;
  });
}

function eventKindOf(e: ActivityEvent): Exclude<EventKind, "all"> {
  if (e.type.startsWith("run.")) return "runs";
  if (e.type.startsWith("sweep.")) return "sweeps";
  return e.category === "scenarios" ? "changes" : "reports";
}

/** A field condition as text: `= "5120"`, `contains "email"`, `one of 1, 2`. */
export function matcherText(m: FieldMatcher): string {
  if ("equals" in m) return `= ${JSON.stringify(m.equals)}`;
  if ("one_of" in m) return `one of ${m.one_of.map((v) => JSON.stringify(v)).join(", ")}`;
  if ("subset" in m) return `includes ${JSON.stringify(m.subset)}`;
  if ("matches" in m) return `matches /${m.matches}/`;
  return `contains ${typeof m.contains === "string" ? JSON.stringify(m.contains) : isValueRef(m.contains) ? describeRef(m.contains) : JSON.stringify(m.contains)}`;
}

/** A record pattern as its kind and one chip per condition. */
export function patternHtml(p: RecordPattern): string {
  const world = store.meta?.worlds.find((w) => p.kind in w.records)?.name ?? "";
  const conditions = [...(p.id ? [["id", p.id] as const] : []), ...Object.entries(p.fields)];
  return `<span class="sd-rec">${worldIcon(world, 13)}<code>${esc(p.kind)}</code></span><span class="sd-conds">${conditions.length ? conditions.map(([k, m]) => `<code class="sd-cond">${esc(k)} <i>${esc(matcherText(m))}</i></code>`).join("") : '<span class="muted small">any</span>'}</span>`;
}

function toolsOf(worlds: string[]): Map<string, { name: string; mutating: boolean; world: string }> {
  return new Map(store.meta.worlds.filter((w) => worlds.includes(w.name)).flatMap((w) => w.tools.map((t) => [t.name, { name: t.name, mutating: t.mutating, world: w.name }] as const)));
}

/** The calls each fault strikes, in order, with what the agent sees and what the world keeps. */
export function faultSchedule(d: ScenarioDetail): string {
  const faults = d.scenario.faults;
  if (!faults.length) return emptyState({ icon: "zap", title: "No faults", text: "Every tool works as it should. The scenario checks how the agent handles the task itself, such as a request it has to refuse.", compact: true });
  const tools = toolsOf(d.scenario.worlds);
  const target = (t: string) => (t === "*" ? "any tool" : t);
  const sequence = `<ol class="sd-seq" aria-label="The calls the faults strike">${faults
    .map((f, i) => `<li><span class="sd-seq-n">${i + 1}</span><code>${esc(target(f.target))}</code><b>${esc(scheduleLabel(f))}</b>${f.probability !== undefined ? `<em${tip(`Each selected call is faulted with probability ${f.probability}, drawn from the seed`)}>${Math.round(f.probability * 100)}%</em>` : ""}</li>`)
    .join(`<li class="sd-seq-arrow" aria-hidden="true">${icon("arrowRight", 12)}</li>`)}</ol>`;
  const strikes = faults
    .map((f, i) => {
      const def = store.meta.faults.find((k) => k.kind === f.kind);
      const stage = def?.stage ?? "before";
      const tool = f.target === "*" ? undefined : tools.get(f.target);
      const params = Object.entries(f.params ?? {});
      return `<li class="sd-strike">
        <span class="sd-strike-n">${i + 1}</span>
        <div class="sd-strike-body">
          <div class="sd-strike-head"><code class="sd-call">${esc(target(f.target))}<b>${esc(scheduleLabel(f))}</b></code>${faultTag(f.kind, def?.description ?? f.kind)}<span class="sd-stage">${esc(stageLabel(stage))}</span>${tool?.mutating ? `<span class="sd-writes"${tip(`${tool.name} changes state in ${tool.world}`)}>writes</span>` : ""}</div>
          <p class="sd-strike-when">Strikes ${esc(describeSchedule(f))} of <code>${esc(target(f.target))}</code>${tool ? ` in ${esc(tool.world)}` : ""}.</p>
          ${stageDiagram(stage, { service: tool?.world ?? d.scenario.worlds[0], mutating: tool?.mutating })}
          <dl class="sd-strike-facts"><div><dt>Agent sees</dt><dd>${esc(agentSees(f.kind, def?.description ?? f.kind))}</dd></div><div><dt>World commits</dt><dd>${esc(worldCommits(stage, tool, tool?.world))}</dd></div>${params.length ? `<div><dt>Params</dt><dd class="chip-row">${params.map(([k, v]) => codeChip(`${k}: ${JSON.stringify(v)}`)).join("")}</dd></div>` : ""}</dl>
        </div>
      </li>`;
    })
    .join("");
  return `${faults.length > 1 ? sequence : ""}<ol class="sd-strikes">${strikes}</ol>`;
}

function section(title: string, note: string, body: string): string {
  return `<section class="sd-sec"><h3 class="sd-sec-title">${esc(title)}<span>${esc(note)}</span></h3>${body}</section>`;
}

/** Outcomes with their effects, allowed changes, invariants, and answer checks. */
export function expectations(d: ScenarioDetail): string {
  const e = d.scenario.expect;
  if (!e) return callout("warn", "Without an <code>expect</code> block the grader cannot check completion, so no run of this scenario can be graded SAFE_SUCCESS. It assumes the task needs at most one change.", { title: "No expectations" });
  const outcomes = e.outcomes
    .map(
      (o) => `<div class="sd-outcome">
      <div class="sd-outcome-head">${badge(o.verdict)}<b>${esc(o.name)}</b><span class="muted">${o.verdict === "SAFE_FAILURE" ? "declared recovery path: ends safe only if the answer reports the failure" : e.outcomes.length > 1 ? "intended outcome" : "the expected outcome"}</span></div>
      ${o.effects.length ? `<ul class="sd-effects">${o.effects.map((p) => `<li>${patternHtml(p)}</li>`).join("")}</ul>` : '<p class="sd-none">No state changes: a correct run commits nothing.</p>'}
    </div>`
    )
    .join("");
  const answers = d.expect.slice(d.expect.length - e.answer.length);
  return [
    section("Outcomes", "every listed change exactly once; any other change must be allowed", `<div class="sd-outcomes">${outcomes}</div>`),
    e.allow.length ? section("Allowed changes", "may appear on any path without being required", `<ul class="sd-effects">${e.allow.map((p) => `<li>${patternHtml(p)}</li>`).join("")}</ul>`) : "",
    e.invariants.length ? section("Invariants", "checked after every call", `<ul class="sd-list">${e.invariants.map((inv) => `<li>${icon("lock", 13)}<span><code class="sd-name">${esc(inv.name)}</code> ${esc(describeInvariant(inv))}</span></li>`).join("")}</ul>`) : "",
    e.answer.length ? section("Answer checks", "read from the final answer", `<ul class="sd-list">${answers.map((a) => `<li>${icon("message", 13)}<span>${esc(a)}</span></li>`).join("")}</ul>`) : "",
  ].join("");
}

function policiesPanel(d: ScenarioDetail): string {
  const s = d.summary;
  const active = POLICIES.filter((p) => policyState(d.scenario.policies, p.key).on).length;
  const budget = [...(s.budget.maxCalls === undefined ? [] : [`${s.budget.maxCalls} calls in total`]), ...Object.entries(s.budget.maxCallsPerTool ?? {}).map(([t, n]) => `${n} ${t} calls`)];
  return panel(
    { title: "Policies and budget", icon: "shieldCheck", meta: `${active} of ${POLICIES.length} policies on`, actions: `<a class="link-quiet" href="#/catalog/policies">About policies ${icon("arrowRight", 12)}</a>` },
    `<ul class="sd-policies">${POLICIES.map((p) => {
      const st = policyState(d.scenario.policies, p.key);
      return `<li class="${st.on ? "on" : "off"}"><span class="sd-pol-chip">${icon(st.on ? "shieldCheck" : "minus", 12)}<code>${esc(p.key)}</code><b>${esc(st.text)}</b></span><span class="sd-pol-text">${esc(p.checks)}</span>${st.on ? verdictCode(p.verdict, `A violation is graded ${p.verdict}`) : '<span class="sd-pol-off">not checked</span>'}</li>`;
    }).join("")}</ul>${facts([["Budget", budget.length ? esc(budget.join(", ")) + '<span class="muted"> · calls past it are refused with EBUDGET and graded DEGRADED</span>' : '<span class="muted">None: the agent may call tools as often as it likes.</span>']])}`
  );
}

function taskPanel(d: ScenarioDetail): string {
  const setup = d.scenario.setup;
  return panel(
    { title: "Task", icon: "message", meta: "what the agent is asked to do" },
    `<blockquote class="sd-task">${esc(d.scenario.task)}</blockquote>${
      setup.length
        ? `<div class="sd-setup"><span class="sd-setup-label">Before every trial the world holds</span><ul>${setup
            .map((r) => `<li><code class="sd-setup-id">${esc(r.kind)} ${esc(r.id)}</code><span class="sd-conds">${Object.entries(r.fields).map(([k, v]) => `<code class="sd-cond">${esc(k)} <i>${esc(JSON.stringify(v))}</i></code>`).join("")}</span></li>`)
            .join("")}</ul></div>`
        : ""
    }`
  );
}

function expectedPanel(d: ScenarioDetail, h: Health): string {
  const expected = Object.entries(d.summary.expectedVerdicts);
  const latestOf = new Map(h.latest.map((o) => [o.agentId, o]));
  const others = h.latest.filter((o) => !(o.agentId in d.summary.expectedVerdicts));
  const row = (agent: string, want: Verdict | undefined) => {
    const now = latestOf.get(agent);
    const mark = !now ? '<span class="faint small">not run</span>' : !want ? "" : now.verdict === want ? `<span class="mark-ok"${tip("The latest result matches expected_verdicts")}>✓</span>` : `<span class="mark-bad"${tip(`Expected ${want}, got ${now.verdict}`)}>✗</span>`;
    return `<tr${now ? ` data-href="${esc(href("report", now.key))}"` : ""} class="${now && needsAttention(now) ? "sd-ev-bad" : ""}"><td><a class="link-mono" href="${esc(href("agent", agent))}">${esc(agent)}</a></td><td>${want ? verdictCode(want, `Expected ${want}`) : '<span class="faint">—</span>'}</td><td>${now ? `<span${tip(`${now.verdict} · ${relTime(now.at)}${now.label ? ` · ${now.label}` : ""}`)}>${verdictCode(now.verdict, now.verdict)}</span>` : '<span class="faint">—</span>'}</td><td class="sd-ev-mark">${mark}</td></tr>`;
  };
  const body = expected.length
    ? `<table class="dt sd-ev"><thead><tr><th>Agent</th><th>Expected</th><th>Latest</th><th><span class="sr-only">Match</span></th></tr></thead><tbody>${expected.map(([a, v]) => row(a, v)).join("")}${others.length ? `<tr class="group-row"><td colspan="4">No expected verdict</td></tr>${others.map((o) => row(o.agentId, undefined)).join("")}` : ""}</tbody></table>`
    : emptyState({ icon: "target", title: "No expected verdicts", text: "<code>agentcrucible check</code> skips this scenario until expected_verdicts names an agent.", compact: true, actions: button("Add them in the editor", { href: href("editor", d.summary.id), size: "sm" }) });
  const graded = h.latest.filter((o) => o.expected);
  const off = graded.filter(isUnexpected).length;
  return panel({ title: "Expected verdicts", icon: "target", meta: graded.length ? (off ? `<span class="bad-text">${off} of ${graded.length} differ</span>` : `${graded.length} of ${graded.length} as expected`) : "", flush: true }, body);
}

function stepper(name: string, value: number, o: { min: number; max: number; label: string }): string {
  return `<span class="stepper"><button type="button" data-action="step" data-step="-1" aria-label="Fewer ${esc(o.label)}">${icon("minus", 12)}</button><input type="number" name="${esc(name)}" min="${o.min}" max="${o.max}" value="${value}" aria-label="${esc(o.label)}" inputmode="numeric"/><button type="button" data-action="step" data-step="1" aria-label="More ${esc(o.label)}">${icon("plus", 12)}</button></span>`;
}

function runPanel(d: ScenarioDetail): string {
  const expected = d.summary.expectedVerdicts;
  const agents = [...store.meta.agents].sort((a, b) => Number(b.id in expected) - Number(a.id in expected) || a.id.localeCompare(b.id));
  return panel(
    { title: "Run this scenario", icon: "play", actions: `<span class="sd-pick"><button type="button" class="btn btn-link btn-sm" data-action="pick-agents" data-pick="expected">Expected</button><button type="button" class="btn btn-link btn-sm" data-action="pick-agents" data-pick="all">All</button><button type="button" class="btn btn-link btn-sm" data-action="pick-agents" data-pick="none">None</button></span>` },
    `<form class="sd-run" data-submit="run">
      <fieldset class="sd-agents"><legend class="sr-only">Agents</legend>${agents
        .map((a) => `<span class="sd-agent"${tip(a.description || a.source)}>${checkbox({ name: "agent", value: a.id, checked: a.id in expected, label: a.id })}${expected[a.id] ? verdictCode(expected[a.id], `Expected ${expected[a.id]}`) : ""}</span>`)
        .join("")}</fieldset>
      <div class="sd-run-opts">${field("Trials", stepper("trials", store.prefs.trials, { min: 1, max: 1000, label: "trials" }))}${field("Seed", `<input class="input mono" name="seed" placeholder="seed-${esc(d.summary.id)}" autocomplete="off" spellcheck="false"/>`, { optional: true })}</div>
      ${button("Start run", { type: "submit", kind: "primary", icon: "play", attrs: 'data-run-submit=""' })}
      <p class="field-hint">Runs in the background; the launcher follows it live. With no agent checked, the agents in expected_verdicts run.</p>
    </form>`
  );
}

function healthPanel(id: string, obs: Observation[], h: Health): string {
  if (!obs.length) return panel({ title: "Health", icon: "activity" }, emptyState({ icon: "activity", title: "Never run", text: "Start a run to see how each agent handles this scenario.", compact: true }));
  const safe = h.latest.filter((o) => isSafe(o.verdict)).length;
  const runs = new Set(obs.map((o) => o.runId).filter(Boolean)).size;
  const flaky = obs.filter((o) => o.trials > 1 && isFlaky(o)).length;
  const days = Math.min(60, Math.max(14, Math.ceil((Date.now() - Date.parse(obs[obs.length - 1].at)) / 86_400_000) + 1));
  const trend = dailySeries(obs, days).map((p) => p.safeRate);
  return panel(
    { title: "Health", icon: "activity", meta: "latest result of each agent", actions: `<a class="link-quiet" href="${esc(`${href("scenario", id)}?tab=results`)}">Results ${icon("arrowRight", 12)}</a>` },
    `<div class="sd-health">${donut(tally(h.latest), { size: 104, thickness: 10, value: pct(safe, h.latest.length), label: "safe now" })}${verdictLegend(tally(h.latest))}</div>${facts([
      ["Results", `${plural(obs.length, "result")}${runs ? ` in ${plural(runs, "run")}` : ""}`],
      ["Agents", `${plural(h.latest.length, "agent")}${h.attention.length ? ` · <span class="bad-text">${h.attention.length} need${h.attention.length === 1 ? "s" : ""} attention</span>` : ""}`],
      ["Flaky", flaky ? `<span class="warn-text">${plural(flaky, "result")} with disagreeing trials</span>` : '<span class="muted">none</span>'],
      ["Safe share", `<span class="sd-trend">${sparkline(trend, { width: 120, height: 22, color: "var(--ssucc)", min: 0, max: 1, label: `safe share by day, last ${days} days` })}<span class="muted small">${days} days</span></span>`],
      ["Last run", `<span${tip(absTime(h.lastAt))}>${esc(relTime(h.lastAt))}</span>`],
    ])}`
  );
}

function overviewTab(d: ScenarioDetail, obs: Observation[], h: Health): string {
  const s = d.summary;
  return `<div class="grid g-main-side">
    <div class="stack">
      ${taskPanel(d)}
      ${panel({ title: "Fault schedule", icon: "zap", meta: d.scenario.faults.length ? `${plural(d.scenario.faults.length, "fault")} on a fixed schedule` : "", actions: `<a class="link-quiet" href="#/catalog/faults">Fault kinds ${icon("arrowRight", 12)}</a>` }, faultSchedule(d))}
      ${panel({ title: "What a correct run commits", icon: "checkCircle", meta: esc(checksLabel(s)) }, expectations(d))}
      ${policiesPanel(d)}
    </div>
    <div class="stack">
      ${expectedPanel(d, h)}
      ${runPanel(d)}
      ${healthPanel(s.id, obs, h)}
    </div>
  </div>`;
}

function resultsTable(): string {
  const state = tableState("scenario-results", { sort: "when", dir: "desc", pageSize: store.prefs.pageSize });
  return dataTable({
    id: "scenario-results",
    rows: resultRows,
    state,
    rowKey: (o) => o.key,
    rowHref: (o) => href("report", o.key),
    rowCls: (o) => (needsAttention(o) ? "sd-row-attn" : ""),
    cards: true,
    flush: true,
    caption: "Results of this scenario",
    empty: emptyState({ icon: "search", title: "No results for this agent", compact: true }),
    columns: [
      { id: "agent", label: "Agent", sort: by.text((o) => o.agentId), render: (o) => `<a class="row-link mono" href="${esc(href("agent", o.agentId))}">${esc(o.agentId)}</a>` },
      { id: "verdict", label: "Verdict", sort: (a, b) => VERDICTS.indexOf(b.verdict) - VERDICTS.indexOf(a.verdict), render: (o) => verdictText(o.verdict) },
      { id: "expected", label: "Expected", render: (o) => expectedMark(o) || '<span class="faint">—</span>' },
      { id: "trials", label: "Trials", title: "How the trials split", render: (o) => (o.trials > 1 ? `<span class="sd-trials">${mixCounts(tallyOf(o.byVerdict))}${isFlaky(o) ? `<span class="pill warn"${tip("The trials disagree: the verdict depends on where the seeded fault lands")}>flaky</span>` : ""}</span>` : '<span class="muted">1</span>') },
      { id: "run", label: "Run", render: (o) => (o.runId ? `<div class="cell-2"><a class="row-link" href="${esc(href("run", o.runId))}">${esc(o.label ?? o.runId)}</a><span class="sub">${esc(o.runId)}${o.version ? ` · v${esc(o.version)}` : ""}</span></div>` : `<span class="muted">${o.saved ? "saved report" : "—"}</span>`) },
      { id: "when", label: "When", sort: by.time((o) => o.at), thCls: "when", cls: "when", render: (o) => `<span${tip(absTime(o.at))}>${esc(relTime(o.at))}</span>` },
    ],
  });
}

function resultsTab(d: ScenarioDetail, obs: Observation[]): string {
  if (!obs.length) return emptyState({ icon: "runs", title: "No results yet", text: "Every run in the workspace history that includes this scenario shows up here, agent by agent.", actions: `${button("Run it", { href: runHref([d.summary.id]), kind: "primary", icon: "play", size: "sm" })}${button("Sweep it", { href: sweepHref(d.summary.id), icon: "grid", size: "sm" })}` });
  const agents = [...groupBy(obs, (o) => o.agentId)].sort((a, b) => a[0].localeCompare(b[0]));
  if (resultsAgent && !agents.some(([a]) => a === resultsAgent)) resultsAgent = "";
  resultRows = resultsAgent ? obs.filter((o) => o.agentId === resultsAgent) : obs;
  registerTable("scenario-results", resultsTable);
  const sum = summarize(resultRows);
  const days = Math.min(120, Math.max(14, Math.ceil((Date.now() - Date.parse(resultRows[resultRows.length - 1].at)) / 86_400_000) + 1));
  const series = dailySeries(resultRows, days);
  const last = resultRows[0];
  const who = resultsAgent || "every agent";
  return `<div class="dt-toolbar sd-results-bar">${select({ input: "results-agent", value: resultsAgent, label: "Agent", options: [{ value: "", label: `All agents (${obs.length})` }, ...agents.map(([a, list]) => ({ value: a, label: `${a} (${list.length})` }))] })}<span class="count">${plural(resultRows.length, "result")} from ${esc(who)}</span><span class="spacer"></span>${button("Download CSV", { action: "results-csv", icon: "download", size: "sm", kind: "ghost" })}</div>
  ${kpis([
    kpi({ label: "Results", icon: "target", value: sum.total.toLocaleString("en-US"), sub: `${plural(new Set(resultRows.map((o) => o.runId).filter(Boolean)).size, "run")}` }),
    kpi({ label: "Safe share", icon: "shieldCheck", value: pct(sum.safe, sum.total), sub: `${sum.safe} of ${sum.total} ended safe`, spark: sparkline(series.map((p) => p.safeRate), { width: 110, color: "var(--ssucc)", min: 0, max: 1, label: "safe share by day" }) }),
    kpi({ label: "Critical", icon: "octagon", value: sum.critical, tone: sum.critical ? "bad" : "", sub: `${sum.byVerdict.HARMFUL_ACTION} harmful · ${sum.byVerdict.SILENT_FAILURE} silent` }),
    kpi({ label: "Unexpected", icon: "xCircle", value: sum.unexpected, tone: sum.unexpected ? "warn" : sum.graded ? "ok" : "", sub: sum.graded ? `${sum.graded - sum.unexpected} of ${sum.graded} match expected` : "no expected verdicts" }),
    kpi({ label: "Flaky", icon: "split", value: sum.flaky, tone: sum.flaky ? "warn" : "", sub: sum.multiTrial ? `${pct(sum.flaky, sum.multiTrial)} of multi-trial results` : "no multi-trial results" }),
    kpi({ label: "Last result", icon: "clock", value: relTime(last.at), sub: `${last.agentId} · ${last.verdict}`, title: absTime(last.at) }),
  ], "Results summary")}
  ${panel(
    { title: "Verdicts per day", icon: "barChart", meta: `${esc(shortDay(series[0].day))} – ${esc(shortDay(series[series.length - 1].day))} · ${esc(who)}` },
    `<ul class="chart-legend">${VERDICTS.map((v) => `<li><span class="sw sq" style="--sw:${VERDICT_VAR[v]}"></span>${v}</li>`).join("")}<li><span class="sw" style="--sw:var(--ink)"></span>safe share</li></ul>${chart({
      kind: "bars",
      labels: series.map((p) => shortDay(p.day)),
      tipLabels: series.map((p) => dayLabel(p.day)),
      stacks: series.map((p) => p.byVerdict),
      line: { label: "safe share", color: "var(--ink)", values: series.map((p) => p.safeRate) },
      hrefs: series.map((p) => (p.total ? `#/runs?day=${p.day}` : undefined)),
      height: 200,
      ariaLabel: `Verdicts per day for ${d.summary.id}`,
    })}`
  )}
  <div class="mt-16">${panel({ title: "Every result", icon: "list", meta: "newest first; open one for its call-by-call timeline", flush: true, cls: "sd-results" }, resultsTable())}</div>`;
}

function sourceTab(d: ScenarioDetail): string {
  const s = d.summary;
  if (!d.text) return emptyState({ icon: "code", title: "No source file", text: "This scenario was defined inline, not loaded from a file." });
  const { source: _source, ...parsed } = d.scenario;
  const lines = d.text.replace(/\n$/, "").split("\n").length;
  const name = `${s.id.replace(/\//g, "-")}.yaml`;
  return panel(
    {
      title: sourceMode === "file" ? "Scenario file" : "Parsed scenario",
      icon: "code",
      meta: sourceMode === "file" ? `<code>${esc(s.source ?? "inline")}</code>` : "as the engine reads it, with every default filled in",
      actions: `${segmented("source-mode", sourceMode, [{ value: "file", label: "YAML" }, { value: "parsed", label: "Parsed" }], { label: "View" })}${copyButton(sourceMode === "file" ? d.text : JSON.stringify(parsed, null, 2), "Copy")}${button("Download", { action: "download", icon: "download", size: "sm", kind: "ghost", data: { name, content: d.text, type: "text/yaml" } })}${button("Open in editor", { href: href("editor", s.id), icon: "edit", size: "sm" })}`,
      flush: true,
      foot: `<span>${plural(lines, "line")} · ${bytes(new TextEncoder().encode(d.text).length)}</span><span class="sep-dot"></span><span>${s.bundled ? "Bundled with AgentCrucible: copy it to change it" : `In this project${store.meta.scenarioDir ? `, under <code>${esc(store.meta.scenarioDir)}</code>` : ""}`}</span>`,
    },
    sourceMode === "file" ? codeView(d.text, "yaml", { maxHeight: 640 }) : codeView(JSON.stringify(parsed, null, 2), "json", { maxHeight: 640 })
  );
}

function eventItem(e: ActivityEvent, id: string): string {
  const run = e.type.startsWith("run.") ? store.runs.find((r) => r.runId === e.data?.runId) : undefined;
  const mine = run?.results.filter((r) => r.scenarioId === id && r.verdict) ?? [];
  const results = mine.length ? `<div class="sd-feed-results">${mine.map((r) => `<a class="sd-feed-result${r.expected && r.expected !== r.verdict ? " bad" : ""}" href="${esc(href("report", r.key))}">${verdictCode(r.verdict, r.verdict)}<code>${esc(r.agentId)}</code>${r.expected ? (r.expected === r.verdict ? '<span class="mark-ok">✓</span>' : `<span class="mark-bad">✗ expected ${esc(r.expected)}</span>`) : ""}</a>`).join("")}</div>` : "";
  return `<li class="feed-item">${eventIcon(e, 13)}<div class="feed-body">${e.link ? `<a class="feed-title" href="${esc(e.link)}">${esc(e.title)}</a>` : `<span class="feed-title">${esc(e.title)}</span>`}<span class="feed-detail">${esc(e.actor)}${e.detail ? ` · ${esc(e.detail)}` : ""}</span>${results}</div><span class="feed-meta"${tip(absTime(e.at))}>${esc(relTime(e.at))}</span></li>`;
}

function activityTab(id: string, events: ActivityEvent[]): string {
  if (!events.length) return emptyState({ icon: "activity", title: "No activity yet", text: "Edits to this scenario, the runs and sweeps that use it, and replays of its results show up here." });
  const counts = groupBy(events, eventKindOf);
  const shown = eventKind === "all" ? events : (counts.get(eventKind) ?? []);
  const kinds: Array<{ value: EventKind; label: string }> = [
    { value: "all", label: "All" },
    { value: "changes", label: "Changes" },
    { value: "runs", label: "Runs" },
    { value: "sweeps", label: "Sweeps" },
    { value: "reports", label: "Reports" },
  ];
  const days = groupBy(shown.slice(0, eventLimit), (e) => dayKey(e.at));
  return panel(
    { title: "Activity", icon: "activity", meta: `${plural(shown.length, "event")}, newest first`, flush: true, actions: segmented("event-kind", eventKind, kinds.filter((k) => k.value === "all" || counts.has(k.value)).map((k) => ({ ...k, count: k.value === "all" ? events.length : (counts.get(k.value)?.length ?? 0) })), { label: "Kind of event" }) },
    `<ul class="feed sd-feed">${[...days].map(([day, list]) => `<li class="feed-day">${esc(dayLabel(day))}</li>${list.map((e) => eventItem(e, id)).join("")}`).join("")}</ul>${shown.length > eventLimit ? `<div class="sd-more">${button(`Show ${Math.min(30, shown.length - eventLimit)} more`, { action: "event-more", size: "sm", kind: "ghost", icon: "chevronDown" })}<span class="muted small">${shown.length - eventLimit} older</span></div>` : ""}`
  );
}

function statusPill(h: Health): string {
  if (!h.latest.length) return `<span class="pill outline">never run</span>`;
  if (h.attention.length) return `<span class="pill ${h.attention.some((o) => isCritical(o.verdict)) ? "bad" : "warn"}"${tip(h.attention.map((o) => `${o.agentId}: ${o.verdict}${o.expected ? `, expected ${o.expected}` : ""}`).join("\n"))}>${plural(h.attention.length, "result")} need${h.attention.length === 1 ? "s" : ""} attention</span>`;
  const graded = h.latest.filter((o) => o.expected).length;
  return graded ? `<span class="pill ok">as expected</span>` : `<span class="pill">no expected verdicts</span>`;
}

function notFound(id: string): string {
  return `<div class="page">${pageHead({ eyebrow: `${icon("layers", 11)}Scenario`, title: id || "Scenario", mono: Boolean(id) })}${emptyState({ icon: "search", title: id ? "There is no such scenario" : "No scenario chosen", text: id ? `No scenario has the id <code>${esc(id)}</code>. It may have been renamed or deleted.` : "Pick a scenario from the library to see its faults, checks, and results.", actions: `${button("All scenarios", { href: "#/scenarios", kind: "primary", icon: "layers" })}${button("Search", { action: "search", kind: "ghost", icon: "search" })}` })}</div>`;
}

const page: Page = {
  nav: "scenarios",
  title: (ctx) => ctx.arg ?? "Scenario",
  skeleton: "detail",
  watches: ["runs", "reports", "activity", "scenarios", "sweeps"],
  async render(ctx) {
    const id = ctx.arg;
    if (!id) return notFound("");
    const fresh = id !== detail?.summary.id || Date.now() - loadedAt > 30_000;
    if (id !== detail?.summary.id) {
      resultsAgent = "";
      sourceMode = "file";
      eventKind = "all";
      eventLimit = 30;
    }
    let d: ScenarioDetail;
    try {
      [d] = await Promise.all([load.scenario(id, fresh), load.runs(), load.reports(), load.activity(), load.sweeps()]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return notFound(id);
      throw err;
    }
    if (fresh) loadedAt = Date.now();
    detail = d;
    const s = d.summary;
    const tab: Tab = TABS.find((t) => t === ctx.query.get("tab")) ?? "overview";
    const obs = observations(store.runs, store.saved)
      .filter((o) => o.scenarioId === id)
      .sort((a, b) => b.at.localeCompare(a.at));
    const h = healthOf(obs);
    const events = scenarioEvents(id, store.activity, { runs: store.runs, sweeps: store.sweeps, resultOf: findResult });
    remember({ kind: "scenario", id, label: id, detail: s.worlds.join(" · ") });

    const base = href("scenario", id);
    const head = pageHead({
      eyebrow: `${icon("layers", 11)}Scenario · ${s.bundled ? "bundled" : "project"}`,
      title: id,
      mono: true,
      titleExtra: statusPill(h),
      desc: esc(s.description),
      meta: [
        `<span class="chip-row">${s.worlds.map(worldChip).join("")}</span>`,
        metaItem("hash", s.tags.length ? s.tags.map(esc).join(", ") : '<span class="faint">no tags</span>'),
        metaItem("file", `<code>${esc(s.source ?? "inline")}</code>`, s.bundled ? "Bundled with AgentCrucible" : "Written for this project"),
        metaItem("clock", h.lastAt ? `Last run <b class="fg">${esc(relTime(h.lastAt))}</b>` : "Never run", absTime(h.lastAt)),
      ],
      actions: `${button("Sweep", { href: sweepHref(id), icon: "grid", title: "Inject every fault kind at every step of an agent's clean path" })}${button("Edit", { href: href("editor", id), icon: "edit" })}${button("More", { action: "more", icon: "moreH", iconEnd: "chevronDown", attrs: 'aria-haspopup="menu"' })}${button("Run", { href: runHref([id]), kind: "primary", icon: "play", title: "Open the launcher with this scenario" })}`,
    });
    const nav = tabs(
      [
        { id: "overview", label: "Overview", href: base, icon: "layers" },
        { id: "results", label: "Results", count: obs.length, href: `${base}?tab=results`, icon: "barChart" },
        { id: "source", label: "Source", href: `${base}?tab=source`, icon: "code" },
        { id: "activity", label: "Activity", count: events.length, href: `${base}?tab=activity`, icon: "activity" },
      ],
      tab,
      { label: "Scenario sections" }
    );
    const body = tab === "results" ? resultsTab(d, obs) : tab === "source" ? sourceTab(d) : tab === "activity" ? activityTab(id, events) : overviewTab(d, obs, h);
    return `<div class="page sd-page">${head}<div class="page-tabs">${nav}</div>${body}</div>`;
  },
  actions: {
    more: (el) => {
      if (!detail) return;
      const s = detail.summary;
      const deletable = !s.bundled && Boolean(s.source) && Boolean(store.meta.scenarioDir);
      openMenu(
        [
          { label: "Duplicate in editor", icon: "copy", run: () => void duplicateInEditor(s.id).catch((err: Error) => toast(err.message, "bad")) },
          { label: "Copy run command", icon: "terminal", hint: "CLI", run: () => void copy(scenarioCommand(s)) },
          { label: "Copy id", icon: "hash", run: () => void copy(s.id) },
          ...(deletable
            ? [
                "-" as const,
                {
                  label: "Delete scenario",
                  icon: "trash" as const,
                  danger: true,
                  run: () =>
                    void deleteScenario(s.id, s.source)
                      .then((gone) => gone && runtime.navigate("#/scenarios"))
                      .catch((err: Error) => toast(err.message, "bad", { title: "The scenario was not deleted" })),
                },
              ]
            : []),
        ],
        el,
        { align: "end" }
      );
    },
    step: (el) => {
      const input = el.parentElement?.querySelector<HTMLInputElement>("input");
      if (!input) return;
      input.value = String(Math.min(Number(input.max), Math.max(Number(input.min), (Number(input.value) || 1) + Number(el.dataset.step))));
    },
    "pick-agents": (el) => {
      const expected = detail?.summary.expectedVerdicts ?? {};
      for (const box of document.querySelectorAll<HTMLInputElement>('form.sd-run input[name="agent"]')) box.checked = el.dataset.pick === "all" || (el.dataset.pick === "expected" && box.value in expected);
    },
    "source-mode": (el) => {
      sourceMode = el.dataset.value === "parsed" ? "parsed" : "file";
      return runtime.rerender();
    },
    "event-kind": (el) => {
      eventKind = (el.dataset.value ?? "all") as EventKind;
      eventLimit = 30;
      return runtime.rerender();
    },
    "event-more": () => {
      eventLimit += 30;
      return runtime.rerender();
    },
    "results-csv": () => {
      if (!detail) return;
      const rows = resultRows.map((o) => [o.agentId, o.verdict, o.expected ?? "", o.expected ? String(o.expected === o.verdict) : "", o.trials, VERDICTS.filter((v) => o.byVerdict[v]).map((v) => `${v}=${o.byVerdict[v]}`).join(" "), o.runId ?? "", o.label ?? "", o.version ?? "", o.at, o.rule, o.reason]);
      download(`${detail.summary.id.replace(/\//g, "-")}-results.csv`, csv([["agent", "verdict", "expected", "as_expected", "trials", "split", "run", "label", "version", "at", "rule", "reason"], ...rows]), "text/csv");
    },
  },
  inputs: {
    "results-agent": (el) => {
      resultsAgent = el.value;
      return runtime.rerender();
    },
  },
  submit: {
    run: async (form) => {
      if (!detail) return;
      const s = detail.summary;
      const data = new FormData(form);
      const agents = data.getAll("agent").map(String);
      const trials = Math.max(1, Math.floor(Number(data.get("trials")) || 1));
      const seed = String(data.get("seed") ?? "").trim();
      if (!agents.length && !Object.keys(s.expectedVerdicts).length) return void toast("This scenario lists no expected verdicts, so choose at least one agent.", "bad");
      const submit = form.querySelector<HTMLButtonElement>("[data-run-submit]");
      submit?.classList.add("is-busy");
      if (submit) submit.disabled = true;
      try {
        const job = await startRunJob({ scenarioIds: [s.id], agents, trials, ...(seed ? { seed } : {}) });
        runtime.navigate(`#/launch?job=${job.jobId}`);
      } catch (err) {
        toast((err as Error).message, "bad", { title: "The run did not start" });
      } finally {
        submit?.classList.remove("is-busy");
        if (submit) submit.disabled = false;
      }
    },
  },
};

export default page;
