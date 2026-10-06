/**
 * Sweeps: run an agent once without faults to learn its path, then inject every fault kind at every
 * step, one fault per run. The page holds the form, a sweep in progress cell by cell, the heat map
 * of a finished sweep with its cells opening reports, and the list of past sweeps.
 */
import { sweepHeatMap, sweepStepLabel } from "../../../html.js";
import type { SweepSummary } from "../../../sweep.js";
import type { Job, SweepListItem, SweepResponse } from "../../api.js";
import { onJob } from "../jobs.js";
import { api } from "../lib/api.js";
import { busy } from "../lib/busy.js";
import { copy, download } from "../lib/dom.js";
import { clip, duration, esc, firstSentence, href, num, plural, relTime, withQuery } from "../lib/format.js";
import { startPlannedSweep, sweepPlans, type SweepRequest } from "../lib/job-plans.js";
import { filterSweeps, sweepCommand, sweepCsv, sweepRequestCommand, type SweepFilter } from "../lib/runs.js";
import { patch, runtime } from "../lib/runtime.js";
import { load, remember, store } from "../lib/state.js";
import { icon } from "../icons.js";
import type { Page } from "../routes.js";
import { by, dataTable, redrawTable, registerTable, tableState, type Column } from "../ui/table.js";
import { callout, emptyState, kpi, kpis, metaItem, pageHead, panel, progressBar } from "../ui/layout.js";
import { openChecklist, openMenu, toast } from "../ui/overlays.js";
import { button, checkbox, field, filterButton, pill, searchInput, segmented, select, tip } from "../ui/primitives.js";
import { commandBlock, when } from "../ui/run-view.js";
import { badge, rateMeter, tally, verdictBar, verdictLegend } from "../ui/verdicts.js";

const DEFAULT_STEPS = 12;
const TABLE = "sweeps-table";
const filter: SweepFilter = { q: "", agents: [], outcome: "all" };
const form = { scenario: "", agent: "", steps: String(DEFAULT_STEPS), trials: "1", seed: "", kinds: undefined as Set<string> | undefined };
let primed: string | undefined;
let stopJob: (() => void) | undefined;
let ticker: ReturnType<typeof setInterval> | undefined;

function sweepable() {
  return store.meta.faults.filter((k) => !k.required?.length);
}

function chosenKinds(): string[] {
  const kinds = form.kinds ?? new Set(sweepable().map((k) => k.kind));
  return sweepable().filter((k) => kinds.has(k.kind)).map((k) => k.kind);
}

function formRequest(): SweepRequest | undefined {
  const steps = Number(form.steps);
  const trials = Number(form.trials);
  if (!store.scenarios?.some((s) => s.id === form.scenario) || !form.agent || !chosenKinds().length) return undefined;
  if (!Number.isInteger(steps) || steps < 1 || steps > 64 || !Number.isInteger(trials) || trials < 1) return undefined;
  return { scenarioId: form.scenario, agentId: form.agent, kinds: chosenKinds(), steps, trials, ...(form.seed.trim() ? { seed: form.seed.trim() } : {}) };
}

function formProblem(): string {
  const steps = Number(form.steps);
  const trials = Number(form.trials);
  if (!form.scenario.trim()) return "Choose the scenario to sweep.";
  if (!store.scenarios?.some((s) => s.id === form.scenario)) return `There is no scenario ${form.scenario}.`;
  if (!chosenKinds().length) return "Choose at least one fault kind.";
  if (!Number.isInteger(steps) || steps < 1 || steps > 64) return "Steps must be a whole number from 1 to 64.";
  if (!Number.isInteger(trials) || trials < 1) return "Trials must be a whole number of at least 1.";
  return "";
}

function planPanel(): string {
  const req = formRequest();
  const why = formProblem();
  const cells = req ? req.kinds.length * req.steps : 0;
  return `<p class="plan-total">${req ? `Up to <b>${num(cells)}</b> runs: ${plural(req.kinds.length, "fault kind")} × up to ${plural(req.steps, "step")}${req.trials > 1 ? `, ${plural(req.trials, "trial")} each` : ""}. A shorter agent path means fewer.` : ""}</p>
  ${why ? `<p class="plan-why">${icon("alert", 13)}${esc(why)}</p>` : ""}
  <div class="plan-cmd"><span class="eyebrow">The same from the command line</span>${req ? commandBlock([`npx ${sweepRequestCommand(req)}`]) : '<p class="muted small">Complete the form to see the command.</p>'}</div>
  <div class="plan-actions">${button("Run the sweep", { action: "sweep-start", kind: "primary", icon: "play", disabled: Boolean(why), attrs: 'style="width:100%"' })}</div>`;
}

function kindChips(): string {
  const chosen = new Set(chosenKinds());
  return `<ul class="kind-grid" role="group" aria-label="Fault kinds">${store.meta.faults
    .map((k) => {
      const needs = k.required?.length;
      return `<li><label class="kind-opt${needs ? " is-disabled" : ""}"${tip(needs ? `Needs params (${k.required.join(", ")}), so a sweep cannot inject it` : k.description)}>${checkbox({ value: k.kind, checked: !needs && chosen.has(k.kind), action: "sweep-kind", attrs: needs ? "disabled" : undefined, ariaLabel: k.kind })}<span class="kind-name mono">${esc(k.kind)}</span><span class="kind-stage">${esc(k.stage)}</span></label></li>`;
    })
    .join("")}</ul>`;
}

export function sweepForm(): string {
  const scenarios = store.scenarios ?? [];
  const sw = sweepable();
  return `<div class="sweep-grid"><div class="sweep-main">${panel(
    { title: "What to sweep", icon: "grid" },
    `<div class="opt-grid sweep-fields">${field("Scenario", `<input class="input mono" id="sweep-scenario" data-input="sweep-scenario" list="sweep-scenarios" value="${esc(form.scenario)}" placeholder="Search scenarios" autocomplete="off" spellcheck="false"/><datalist id="sweep-scenarios">${scenarios.map((s) => `<option value="${esc(s.id)}">${esc(firstSentence(s.description))}</option>`).join("")}</datalist>`)}
    ${field("Agent", select({ input: "sweep-agent", value: form.agent, options: store.meta.agents.map((a) => ({ value: a.id, label: a.id })), label: "Agent" }), { hint: store.meta.agents.find((a) => a.id === form.agent)?.description })}
    ${field("Steps", `<input class="input mono" type="number" id="sweep-steps" data-input="sweep-steps" min="1" max="64" value="${esc(form.steps)}"/>`, { hint: "How many calls of the clean path to break, from the first." })}
    ${field("Trials", `<input class="input mono" type="number" id="sweep-trials" data-input="sweep-trials" min="1" max="10000" value="${esc(form.trials)}"/>`, { hint: "Trials per run." })}
    ${field("Seed", `<input class="input mono" id="sweep-seed" data-input="sweep-seed" value="${esc(form.seed)}" placeholder="sweep-&lt;scenario id&gt;"/>`, { optional: true })}</div>`
  )}${panel(
    { title: "Fault kinds", icon: "zap", meta: `<span id="sweep-kind-count">${chosenKinds().length} of ${sw.length} chosen</span>`, actions: `${button("All", { action: "sweep-kinds-all", kind: "ghost", size: "sm" })}${button("None", { action: "sweep-kinds-none", kind: "ghost", size: "sm" })}` },
    `<div id="sweep-kinds">${kindChips()}</div>`
  )}</div><aside class="sweep-side">${panel({ title: "This sweep", icon: "target", cls: "plan-panel" }, `<div id="sweep-plan">${planPanel()}</div>`)}</aside></div>`;
}

function filtersHtml(): string {
  const agents = [...new Set(store.sweeps.map((s) => s.agentId))].sort();
  const base = filterSweeps(store.sweeps, { ...filter, outcome: "all" });
  const count = (o: SweepFilter["outcome"]) => filterSweeps(base, { q: "", agents: [], outcome: o }).length;
  const active = filter.q || filter.agents.length || filter.outcome !== "all";
  return `${segmented(
    "sweeps-outcome",
    filter.outcome,
    [
      { value: "all", label: "All", count: count("all") },
      { value: "critical", label: "With critical runs", count: count("critical") },
      { value: "clean", label: "Clean", count: count("clean") },
    ],
    { label: "Outcome" }
  )}${filterButton("Agent", "sweeps-agents", filter.agents.length, agents.length, { icon: "bot" })}${active ? button("Clear", { action: "sweeps-clear", kind: "ghost", size: "sm", icon: "x" }) : ""}`;
}

const columns: Column<SweepListItem>[] = [
  { id: "sweep", label: "Sweep", sort: by.num((s) => Number(s.sweepId.replace(/\D/g, ""))), render: (s) => `<div class="cell-2"><a class="row-link mono" href="${href("sweep", s.sweepId)}">${esc(s.sweepId)}</a><span class="sub">${esc(s.actor ?? "")}${s.archived ? "" : " · this session"}</span></div>` },
  { id: "scenario", label: "Scenario", sort: by.text((s) => s.scenarioId), render: (s) => `<a class="link-mono" href="${href("scenario", s.scenarioId)}">${esc(s.scenarioId)}</a>` },
  { id: "agent", label: "Agent", sort: by.text((s) => s.agentId), render: (s) => `<a class="link-mono" href="${href("agent", s.agentId)}">${esc(s.agentId)}</a>` },
  { id: "baseline", label: "Without faults", title: "The verdict of the run without faults", render: (s) => badge(s.baseline.verdict) },
  { id: "runs", label: "Runs", num: true, sort: by.num((s) => s.score.runs), render: (s) => num(s.score.runs) },
  { id: "critical", label: "Critical", num: true, sort: by.num((s) => s.score.critical), render: (s) => (s.score.critical ? `<span class="bad-text strong">${s.score.critical}</span>` : '<span class="muted">0</span>') },
  { id: "resilience", label: "Resilience", sort: by.num((s) => s.score.resilience), width: "14%", render: (s) => rateMeter(s.score.resilience, { title: `${s.score.safe} of ${s.score.runs} runs ended safe` }) },
  { id: "started", label: "Started", thCls: "when", cls: "when", sort: by.time((s) => s.startedAt), render: (s) => when(s.startedAt, store.prefs.time === "absolute") },
];

function listTable(): string {
  const rows = filterSweeps(store.sweeps, filter);
  const active = filter.q || filter.agents.length || filter.outcome !== "all";
  return dataTable({
    id: TABLE,
    columns,
    rows,
    state: tableState(TABLE, { sort: "started", dir: "desc", pageSize: store.prefs.pageSize }),
    rowKey: (s) => s.sweepId,
    rowHref: (s) => href("sweep", s.sweepId),
    cards: true,
    caption: "Sweeps",
    empty: active
      ? emptyState({ icon: "search", title: "No sweep matches these filters", text: "Change the search or the filters to see more sweeps.", actions: button("Clear filters", { action: "sweeps-clear", size: "sm" }), compact: true })
      : emptyState({ icon: "grid", title: "No sweeps yet", text: "Choose a scenario and an agent above, then run a sweep. The history keeps the most recent ones.", compact: true }),
  });
}

function countText(): string {
  const n = filterSweeps(store.sweeps, filter).length;
  return n === store.sweeps.length ? plural(n, "sweep") : `${n} of ${plural(store.sweeps.length, "sweep")}`;
}

function pastSweeps(): string {
  if (!store.sweeps.length) return panel({ title: "Past sweeps", icon: "history" }, emptyState({ icon: "grid", title: "No sweeps yet", text: "A sweep tells you which fault at which step breaks an agent. Run one above, or sweep the demo's refund scenario.", actions: button("Sweep the demo scenario", { href: withQuery("#/sweep", { scenario: store.meta.demo.scenario, agent: "naive-retry" }), size: "sm", icon: "play" }), compact: true }));
  registerTable(TABLE, listTable);
  return `<section class="past" aria-label="Past sweeps"><div class="section-head"><h2>Past sweeps</h2></div>
  <div class="dt-toolbar">${searchInput({ id: "sweeps-q", value: filter.q, placeholder: "Search sweeps, scenarios, agents", kbd: "/" })}<span class="row row-wrap" id="sweeps-filters">${filtersHtml()}</span><span class="spacer"></span><span class="count" id="sweeps-count">${esc(countText())}</span></div>
  ${listTable()}</section>`;
}

export function sweepList(): string {
  const last = store.sweeps[0];
  const head = pageHead({
    eyebrow: `${icon("grid", 11)}Execute`,
    title: "Sweeps",
    desc: "Run an agent once without faults, then inject every fault kind at every step of its path, one fault per run, and grade each run with the scenario's own expectations. The heat map shows which fault at which step breaks it.",
    meta: [metaItem("grid", `<b class="fg">${num(store.sweeps.length)}</b> sweeps kept`), ...(last ? [metaItem("clock", `Last sweep ${esc(relTime(last.finishedAt))}`, last.finishedAt)] : [])],
    actions: `${button("New run", { href: "#/launch", icon: "play" })}`,
  });
  return `<div class="page sweep-page">${head}${sweepForm()}<div class="mt-24">${pastSweeps()}</div></div>`;
}

function liveSummary(job: Job): SweepSummary {
  const req = sweepPlans.get(job.jobId);
  const cells = job.cells ?? [];
  const names = req?.kinds ?? [...new Set(cells.map((c) => c.kind))];
  const kinds = names.map((k) => {
    const f = store.meta.faults.find((x) => x.kind === k);
    return { kind: k, stage: (f?.stage ?? "before") as SweepSummary["kinds"][number]["stage"], description: f?.description ?? "" };
  });
  const count = kinds.length ? Math.max(1, Math.round(job.total / kinds.length)) : 0;
  const steps = Array.from({ length: Math.max(count, ...cells.map((c) => c.step), 0) }, (_, i) => ({ step: i + 1, tool: "", callIndex: 0, mutating: false }));
  return { scenarioId: req?.scenarioId ?? job.label, agentId: req?.agentId ?? "", seed: req?.seed ?? "", trials: req?.trials ?? 1, baseline: { verdict: "SAFE_SUCCESS", rule: "", reason: "", calls: 0 }, steps, kinds, cells, score: { runs: cells.length, safe: 0, critical: 0, notFired: 0, resilience: 0, byVerdict: {} as never }, startedAt: job.startedAt, finishedAt: job.startedAt, durationMs: 0 };
}

function liveParts(job: Job): { head: string; grid: string } {
  const cells = job.cells ?? [];
  const running = job.status === "running";
  const critical = cells.filter((c) => c.fired && (c.verdict === "HARMFUL_ACTION" || c.verdict === "SILENT_FAILURE")).length;
  const head = `<div class="live-head"><div class="live-count"><b>${num(job.done)}</b><span>of ${num(job.total)} runs</span></div><div class="grow">${progressBar(job.total ? job.done / job.total : null, { label: `${job.label}: ${job.done} of ${job.total}` })}<div class="live-sub"><span id="job-elapsed">${esc(elapsed(job))}</span>${cells.length ? `<span class="${critical ? "bad-text" : ""}">${plural(critical, "critical run")} so far</span>` : ""}</div></div>${cells.length ? `<div class="live-bar">${verdictBar(tally(cells), { size: "lg" })}</div>` : ""}</div>`;
  const grid = job.total && !cells.length && running ? `<div class="live-wait">${icon("timer", 14)}Running the agent once without faults to learn its path.</div>` : liveSummary(job).kinds.length ? sweepHeatMap(liveSummary(job), undefined, { tips: "data", live: running }) : "";
  return { head, grid };
}

function elapsed(job: Job): string {
  const end = job.finishedAt ? Date.parse(job.finishedAt) : Date.now();
  return `${job.status === "running" ? "running for" : "took"} ${duration(Math.max(0, end - Date.parse(job.startedAt)))}`;
}

export function sweepJob(job: Job): string {
  const parts = liveParts(job);
  const running = job.status === "running";
  const req = sweepPlans.get(job.jobId);
  const state = running ? pill("Running", "accent") : job.status === "done" ? pill("Finished", "ok") : pill("Failed", "bad");
  const head = pageHead({
    eyebrow: `${icon("grid", 11)}Sweep in progress`,
    title: job.label,
    titleExtra: ` ${state}`,
    desc: `${esc(job.detail)}. The heat map fills in as each run finishes; the cell being run now is marked.`,
    meta: [metaItem("hash", `<code>${esc(job.jobId)}</code>`), metaItem("clock", `Started ${esc(relTime(job.startedAt))}`, job.startedAt)],
    actions: `${button("All sweeps", { href: "#/sweep", icon: "grid" })}${job.sweepId ? button("Open the sweep", { href: href("sweep", job.sweepId), kind: "primary", icon: "arrowRight" }) : ""}`,
  });
  const outcome =
    job.status === "failed"
      ? callout("bad", `<p>${esc(job.error ?? "The sweep failed.")}</p>`, { title: "The sweep did not finish", actions: req ? button("Run again", { action: "sweep-retry", size: "sm", icon: "repeat", attrs: `data-job="${esc(job.jobId)}"` }) : button("Back to the form", { href: "#/sweep", size: "sm" }) })
      : job.status === "done" && job.sweepId
        ? callout("ok", `<p>${esc(job.detail)} finished as <a class="link-mono" href="${href("sweep", job.sweepId)}">${esc(job.sweepId)}</a>.</p>`, { title: "Finished", actions: button("Open the sweep", { href: href("sweep", job.sweepId), kind: "primary", size: "sm", iconEnd: "arrowRight" }) })
        : "";
  return `<div class="page sweep-page">${head}${outcome}${panel({ title: "Progress", icon: "gauge" }, `<div id="job-head">${parts.head}</div>`)}${panel({ title: "Heat map", icon: "grid", meta: "fault kind down, step across", cls: "mt-16" }, `<div id="job-grid">${parts.grid}</div>`)}</div>`;
}

function paintJob(job: Job): void {
  const parts = liveParts(job);
  patch("job-head", parts.head);
  patch("job-grid", parts.grid);
}

function criticalCells(s: SweepResponse) {
  return s.cells.filter((c) => c.fired && (c.verdict === "HARMFUL_ACTION" || c.verdict === "SILENT_FAILURE")).sort((a, b) => a.step - b.step || a.kind.localeCompare(b.kind));
}

function kindRows(s: SweepResponse): string {
  const rows = s.kinds
    .map((k) => {
      const own = s.cells.filter((c) => c.kind === k.kind);
      const critical = own.filter((c) => c.fired && (c.verdict === "HARMFUL_ACTION" || c.verdict === "SILENT_FAILURE")).length;
      return { k, own, critical, notFired: own.filter((c) => !c.fired).length };
    })
    .sort((a, b) => b.critical - a.critical || a.k.kind.localeCompare(b.k.kind));
  return `<ul class="kind-rows">${rows
    .map(({ k, own, critical, notFired }) => `<li><span class="kr-name mono"${tip(k.description)}>${esc(k.kind)}</span><span class="kr-bar">${verdictBar(tally(own), { size: "sm" })}</span><span class="kr-num ${critical ? "bad-text" : "muted"}">${critical} critical</span>${notFired ? `<span class="kr-num muted"${tip("Runs where the agent never made the faulted call")}>${notFired} not reached</span>` : ""}</li>`)
    .join("")}</ul>`;
}

export function sweepDetail(s: SweepResponse, id: string): string {
  const keys = new Map(s.cells.map((c) => [`${c.kind}\n${c.step}`, c.key]));
  const critical = criticalCells(s);
  const others = store.sweeps.filter((x) => x.sweepId !== s.sweepId && x.scenarioId === s.scenarioId && x.agentId === s.agentId).slice(0, 5);
  const head = pageHead({
    eyebrow: `${icon("grid", 11)}Sweep`,
    title: s.sweepId,
    mono: true,
    desc: `<a class="link-mono" href="${href("scenario", s.scenarioId)}">${esc(s.scenarioId)}</a> with <a class="link-mono" href="${href("agent", s.agentId)}">${esc(s.agentId)}</a>: every fault kind injected at every step of the agent's path, one fault per run.`,
    meta: [
      metaItem("clock", when(s.finishedAt, store.prefs.time === "absolute")),
      metaItem("timer", `<b class="fg">${esc(duration(s.durationMs))}</b>`, "How long the sweep took"),
      metaItem("hash", `seed <code>${esc(s.seed)}</code>`),
      metaItem("repeat", plural(s.trials, "trial") + " per run"),
      ...(s.actor ? [metaItem("user", esc(s.actor))] : []),
    ],
    actions: `${button("Export", { action: "sweep-export", icon: "download", iconEnd: "chevronDown", attrs: `data-sweep="${esc(id)}"` })}${button("Copy CLI command", { action: "sweep-cli", icon: "terminal", attrs: `data-sweep="${esc(id)}"`, title: "Copy the command that repeats this sweep" })}${button("Sweep again", { action: "sweep-again", kind: "primary", icon: "repeat", attrs: `data-sweep="${esc(id)}"` })}`,
  });
  const kpiRow = kpis([
    kpi({ label: "Runs", icon: "target", value: num(s.score.runs), sub: `${plural(s.kinds.length, "kind")} × ${plural(s.steps.length, "step")}` }),
    kpi({ label: "Ended safe", icon: "shieldCheck", value: num(s.score.safe), sub: "SAFE_SUCCESS or SAFE_FAILURE" }),
    kpi({ label: "Critical", icon: "octagon", value: s.score.critical, tone: s.score.critical ? "bad" : "ok", sub: "HARMFUL_ACTION or SILENT_FAILURE" }),
    kpi({ label: "Resilience", icon: "gauge", value: `${(s.score.resilience * 100).toFixed(1)}%`, tone: s.score.resilience >= 0.9 ? "ok" : s.score.resilience < 0.6 ? "bad" : "warn", sub: "runs that ended safe" }),
    kpi({ label: "Not reached", icon: "minus", value: s.score.notFired, sub: s.score.notFired ? "the agent never made that call" : "every fault was reached" }),
  ]);
  const map = panel({ title: "Heat map", icon: "grid", meta: "fault kind down, step across; a cell opens its report" }, sweepHeatMap(s, (c) => href("report", keys.get(`${c.kind}\n${c.step}`) ?? ""), { tips: "data" }));
  const baseline = panel(
    { title: "Without faults", icon: "check", actions: `<a class="link-quiet" href="${href("report", s.baselineKey)}">Report ${icon("arrowRight", 12)}</a>` },
    `<div class="base-row">${badge(s.baseline.verdict)}<code class="rule">${esc(s.baseline.rule)}</code></div><p class="muted small mt-8">${esc(clip(s.baseline.reason, 200))}</p><p class="muted small mt-8">${plural(s.baseline.calls, "tool call")} on the clean path.</p>`
  );
  const mix = panel({ title: "Verdict mix", icon: "barChart", meta: plural(s.score.runs, "run") }, `${verdictBar(tally(s.cells), { size: "xl" })}${verdictLegend(tally(s.cells), { all: true })}`);
  const crit = panel(
    { title: "Critical runs", icon: "octagon", meta: critical.length ? plural(critical.length, "run") : "", flush: true },
    critical.length
      ? `<div class="table-wrap flush"><table class="dt cards"><thead><tr><th>Verdict</th><th>Fault kind</th><th>Step</th><th>Deciding rule</th><th>Reason</th></tr></thead><tbody>${critical
          .map((c) => `<tr data-href="${esc(href("report", keys.get(`${c.kind}\n${c.step}`) ?? ""))}"><td data-label="Verdict">${badge(c.verdict)}</td><td data-label="Fault kind"><code>${esc(c.kind)}</code></td><td data-label="Step" class="mono">${esc(sweepStepLabel(s.steps[c.step - 1]))}</td><td data-label="Rule" class="mono">${esc(c.rule)}</td><td data-label="Reason" class="clip"${tip(c.reason)}>${esc(clip(c.reason, 120))}</td></tr>`)
          .join("")}</tbody></table></div>`
      : emptyState({ icon: "checkCircle", title: "No critical runs", text: "No run ended HARMFUL_ACTION or SILENT_FAILURE.", compact: true })
  );
  const history = others.length
    ? panel(
        { title: "Earlier sweeps of this pair", icon: "history", flush: true },
        `<ul class="list">${others
          .map((o) => {
            const change = (s.score.resilience - o.score.resilience) * 100;
            return `<li><a class="list-row" href="${href("sweep", o.sweepId)}"><span class="grow"><span class="title mono">${esc(o.sweepId)}</span><span class="detail">${esc(relTime(o.finishedAt))} · ${plural(o.score.critical, "critical run")}</span></span>${rateMeter(o.score.resilience)}<span class="mono small ${change > 0 ? "ok-text" : change < 0 ? "bad-text" : "muted"}"${tip("Resilience of this sweep minus that one")}>${change > 0 ? "+" : ""}${change.toFixed(1)} pts</span></a></li>`;
          })
          .join("")}</ul>`
      )
    : "";
  return `<div class="page sweep-page">${head}${kpiRow}
  ${map}
  <div class="grid g-3 mt-16">${baseline}${mix}${panel({ title: "By fault kind", icon: "zap" }, kindRows(s))}</div>
  <div class="grid ${history ? "g-8-4" : ""} mt-16">${crit}${history}</div>
  ${panel({ title: "Repeat this sweep", icon: "terminal", cls: "mt-16" }, commandBlock([`npx ${sweepCommand(s)}`]))}</div>`;
}

async function loadSweep(id: string): Promise<SweepResponse | undefined> {
  return load.sweep(id).catch(() => undefined);
}

function requestOf(s: SweepResponse): SweepRequest {
  return { scenarioId: s.scenarioId, agentId: s.agentId, kinds: s.kinds.map((k) => k.kind), steps: s.steps.length, trials: s.trials, seed: s.seed };
}

async function start(el: HTMLElement, req: SweepRequest): Promise<void> {
  const job = await busy(el, () => startPlannedSweep(req));
  if (!job) return;
  toast(`Started ${job.label}.`, "info", { ms: 2200 });
  runtime.navigate(`#/sweep?job=${encodeURIComponent(job.jobId)}`);
}

function prime(query: URLSearchParams): void {
  const key = query.toString();
  if (key === primed) return;
  primed = key;
  const scenario = query.get("scenario");
  const agent = query.get("agent");
  if (scenario) form.scenario = scenario;
  if (agent && store.meta.agents.some((a) => a.id === agent)) form.agent = agent;
  if (!form.agent) form.agent = store.meta.agents.find((a) => a.id === "cross-checker")?.id ?? store.meta.agents[0]?.id ?? "";
}

function refreshPlan(): void {
  patch("sweep-plan", planPanel());
  patch("sweep-kind-count", `${chosenKinds().length} of ${sweepable().length} chosen`);
}

function refreshList(): void {
  patch("sweeps-filters", filtersHtml());
  patch("sweeps-count", esc(countText()));
  redrawTable(TABLE);
}

const page: Page = {
  nav: "sweep",
  title: (ctx) => (ctx.query.get("job") ? "Sweep in progress" : (ctx.arg ?? "Sweeps")),
  skeleton: "detail",
  watches: ["sweeps"],
  async render(ctx) {
    await Promise.all([load.scenarios(), load.sweeps()]);
    const jobId = ctx.query.get("job");
    if (jobId) {
      const job = await api<Job>(`/api/job?id=${encodeURIComponent(jobId)}`).catch(() => undefined);
      if (!job) return `<div class="page">${pageHead({ title: jobId, mono: true, eyebrow: `${icon("grid", 11)}Sweep in progress` })}${emptyState({ icon: "search", title: "The server no longer knows this job", text: "It keeps the most recent finished jobs. Finished sweeps stay in the history.", actions: `${button("All sweeps", { href: "#/sweep", kind: "primary", icon: "grid" })}` })}</div>`;
      return sweepJob(job);
    }
    if (ctx.arg) {
      const sweep = await loadSweep(ctx.arg);
      if (!sweep) return `<div class="page">${pageHead({ title: ctx.arg, mono: true, eyebrow: `${icon("grid", 11)}Sweep` })}${emptyState({ icon: "search", title: "No such sweep", text: `The workspace has no sweep <code>${esc(ctx.arg)}</code>. The history keeps the most recent sweeps only.`, actions: button("All sweeps", { href: "#/sweep", kind: "primary", icon: "grid" }) })}</div>`;
      remember({ kind: "sweep", id: sweep.sweepId, label: `${sweep.scenarioId} with ${sweep.agentId}`, detail: `${(sweep.score.resilience * 100).toFixed(0)}% resilient` });
      return sweepDetail(sweep, sweep.sweepId);
    }
    prime(ctx.query);
    return sweepList();
  },
  mount(ctx) {
    const jobId = ctx.query.get("job");
    if (!jobId) return;
    stopJob = onJob(jobId, (job) => {
      if (job.status !== "running") return void runtime.rerender();
      void api<Job>(`/api/job?id=${encodeURIComponent(jobId)}`).then(paintJob);
    });
    ticker = setInterval(() => {
      const job = store.jobs.find((j) => j.jobId === jobId);
      if (job?.status === "running") patch("job-elapsed", esc(elapsed(job)));
    }, 1000);
  },
  unmount() {
    stopJob?.();
    stopJob = undefined;
    clearInterval(ticker);
  },
  inputs: {
    "sweep-scenario": (el) => {
      form.scenario = el.value;
      refreshPlan();
    },
    "sweep-agent": (el) => {
      form.agent = el.value;
      refreshPlan();
    },
    "sweep-steps": (el) => {
      form.steps = el.value;
      refreshPlan();
    },
    "sweep-trials": (el) => {
      form.trials = el.value;
      refreshPlan();
    },
    "sweep-seed": (el) => {
      form.seed = el.value;
      refreshPlan();
    },
    "sweeps-q": (el) => {
      filter.q = el.value;
      tableState(TABLE).page = 1;
      refreshList();
    },
  },
  actions: {
    "sweep-kind": (el) => {
      const input = el as HTMLInputElement;
      form.kinds = new Set(chosenKinds());
      if (input.checked) form.kinds.add(input.value);
      else form.kinds.delete(input.value);
      refreshPlan();
    },
    "sweep-kinds-all": () => {
      form.kinds = new Set(sweepable().map((k) => k.kind));
      patch("sweep-kinds", kindChips());
      refreshPlan();
    },
    "sweep-kinds-none": () => {
      form.kinds = new Set();
      patch("sweep-kinds", kindChips());
      refreshPlan();
    },
    "sweep-start": (el) => {
      const req = formRequest();
      return req ? start(el, req) : toast(formProblem(), "bad");
    },
    "sweep-retry": (el) => {
      const req = sweepPlans.get(el.dataset.job ?? "");
      return req ? start(el, req) : undefined;
    },
    "sweep-again": async (el) => {
      const s = await loadSweep(el.dataset.sweep ?? "");
      if (s) await start(el, requestOf(s));
    },
    "sweep-cli": async (el) => {
      const s = await loadSweep(el.dataset.sweep ?? "");
      if (s) await copy(`npx ${sweepCommand(s)}`, el);
    },
    "sweep-export": (el) => {
      const id = el.dataset.sweep ?? "";
      openMenu(
        [
          {
            label: "Copy as Markdown",
            icon: "copy",
            hint: "heat map as a table",
            run: () => void busy(el, async () => copy((await api<{ markdown: string }>(`/api/sweep/markdown?id=${encodeURIComponent(id)}`)).markdown, el).then(() => toast("The heat map is on the clipboard as Markdown.", "ok", { ms: 2200 }))),
          },
          {
            label: "Download CSV",
            icon: "download",
            hint: "one row per cell",
            run: () =>
              void loadSweep(id).then((s) => {
                if (!s) return;
                download(`agentcrucible-${id}.csv`, sweepCsv(s), "text/csv");
                toast(`Exported ${plural(s.cells.length, "cell")} as CSV.`, "ok", { ms: 2500 });
              }),
          },
        ],
        el,
        { align: "end" }
      );
    },
    "sweeps-outcome": (el) => {
      filter.outcome = el.dataset.value as SweepFilter["outcome"];
      tableState(TABLE).page = 1;
      refreshList();
    },
    "sweeps-agents": (el) => {
      const agents = [...new Set(store.sweeps.map((s) => s.agentId))].sort();
      openChecklist(el, {
        title: "Agents",
        options: agents.map((a) => ({ value: a, label: a, checked: filter.agents.includes(a), extra: `<span class="menu-hint">${store.sweeps.filter((s) => s.agentId === a).length}</span>` })),
        onChange: (values) => {
          filter.agents = values;
          tableState(TABLE).page = 1;
          refreshList();
        },
      });
    },
    "sweeps-clear": () => {
      Object.assign(filter, { q: "", agents: [], outcome: "all" });
      const input = document.getElementById("sweeps-q") as HTMLInputElement | null;
      if (input) input.value = "";
      refreshList();
    },
  },
};

export default page;
