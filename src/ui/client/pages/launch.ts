/**
 * The launcher: choose scenarios, agents, trials, and a seed, see the command line that does the
 * same, and start the matrix as a background job. `?job=` follows a job cell by cell and links to
 * the recorded run when it ends.
 */
import { VERDICT_SEVERITY, VERDICTS } from "../../../types.js";
import type { Job, ScenarioSummary } from "../../api.js";
import { onJob } from "../jobs.js";
import { api } from "../lib/api.js";
import { busy } from "../lib/busy.js";
import { clip, duration, esc, firstSentence, href, num, plural, relTime } from "../lib/format.js";
import { runPlans, startPlannedRun, type RunPlan } from "../lib/job-plans.js";
import { launchCommands, plannedPairs, resultCounts, runStatus } from "../lib/runs.js";
import { patch, runtime } from "../lib/runtime.js";
import { load, store } from "../lib/state.js";
import { icon } from "../icons.js";
import type { Page } from "../routes.js";
import { callout, emptyState, kpi, kpis, metaItem, pageHead, panel, progressBar } from "../ui/layout.js";
import { toast } from "../ui/overlays.js";
import { button, checkbox, field, pill, searchInput, segmented, select, tip, worldChip } from "../ui/primitives.js";
import { commandBlock, liveMatrix } from "../ui/run-view.js";
import { badge, tally, verdictBar } from "../ui/verdicts.js";

type Mode = "expected" | "chosen";

const selected = new Set<string>();
const agentSet = new Set<string>();
let mode: Mode = "expected";
let trials = 0;
let seed = "";
let label = "";
let version = "";
let failOn = "";
let q = "";
let tag = "";
let primed: string | undefined;
let stopJob: (() => void) | undefined;
let ticker: ReturnType<typeof setInterval> | undefined;

function scenarioList(): ScenarioSummary[] {
  return store.scenarios ?? [];
}

function chosenScenarios(): ScenarioSummary[] {
  return scenarioList().filter((s) => selected.has(s.id));
}

/** The plan the form describes. */
function plan() {
  return { scenarios: chosenScenarios(), agents: mode === "chosen" ? [...agentSet] : null, trials, seed: seed.trim() || undefined, failOn: failOn && failOn !== store.meta.failOn ? failOn : undefined };
}

function shownScenarios(): ScenarioSummary[] {
  const text = q.trim().toLowerCase();
  return scenarioList().filter((s) => (!tag || s.tags.includes(tag)) && (!text || [s.id, s.description, ...s.tags, ...s.worlds].some((t) => t.toLowerCase().includes(text))));
}

function scenarioRow(s: ScenarioSummary): string {
  const expected = Object.keys(s.expectedVerdicts).length;
  return `<li><label class="pick-row"><span class="pick-check">${checkbox({ value: s.id, checked: selected.has(s.id), action: "launch-scn", ariaLabel: `Run ${s.id}` })}</span><span class="pick-body"><span class="pick-title mono">${esc(s.id)}</span><span class="pick-sub">${esc(clip(firstSentence(s.description), 120))}</span></span><span class="pick-meta">${s.worlds.map(worldChip).join("")}<span class="muted small"${tip(expected ? `Expected verdicts for ${Object.keys(s.expectedVerdicts).join(", ")}` : "No expected agents: choose agents to run it")}>${expected ? plural(expected, "expected agent") : "no expected agents"}</span></span></label></li>`;
}

function chosenChips(): string {
  const ids = [...selected];
  if (!ids.length) return "";
  return `<div class="chosen-row"><span class="eyebrow">Chosen</span>${ids.slice(0, 6).map((id) => `<span class="tag on mono">${esc(id)}<button type="button" class="tag-x" data-action="launch-scn-remove" data-id="${esc(id)}" aria-label="Remove ${esc(id)}">${icon("x", 11)}</button></span>`).join("")}${ids.length > 6 ? `<span class="muted small">and ${ids.length - 6} more</span>` : ""}</div>`;
}

function scenarioPicker(): string {
  const shown = shownScenarios();
  if (!shown.length) return emptyState({ icon: "search", title: scenarioList().length ? "No scenario matches" : "No scenarios", text: scenarioList().length ? "Change the search or the tag." : "Write one in the editor first.", actions: scenarioList().length ? "" : button("Open the editor", { href: "#/editor", size: "sm", icon: "code" }), compact: true });
  return `<ul class="pick-list" role="group" aria-label="Scenarios">${shown.map(scenarioRow).join("")}</ul>`;
}

function agentPicker(): string {
  return `<ul class="agent-grid" role="group" aria-label="Agents">${store.meta.agents
    .map((a) => `<li><label class="pick-row agent-opt"><span class="pick-check">${checkbox({ value: a.id, checked: agentSet.has(a.id), action: "launch-agent", ariaLabel: `Use ${a.id}` })}</span><span class="pick-body"><span class="pick-title mono">${esc(a.id)}</span><span class="pick-sub">${esc(clip(a.description || a.source, 90))}</span></span>${a.source === "built-in" ? "" : '<span class="src-tag">project</span>'}</label></li>`)
    .join("")}</ul>`;
}

/** Why the run cannot start yet, or undefined when it can. */
function problem(): string | undefined {
  const p = plan();
  if (!p.scenarios.length) return "Choose at least one scenario.";
  if (p.agents && !p.agents.length) return "Choose at least one agent, or run each scenario's expected agents.";
  const bare = p.agents ? [] : p.scenarios.filter((s) => !Object.keys(s.expectedVerdicts).length);
  if (bare.length) return `${bare.map((s) => s.id).slice(0, 2).join(", ")}${bare.length > 2 ? ` and ${bare.length - 2} more` : ""} list no expected agents. Choose agents to run.`;
  return undefined;
}

function planPanel(): string {
  const p = plan();
  const pairs = plannedPairs(p);
  const why = problem();
  const commands = why ? [] : launchCommands(p, scenarioList());
  const agents = new Set(pairs.map((x) => x.agentId)).size;
  return `<div class="plan-numbers">${[
    [p.scenarios.length, "scenarios"],
    [agents, "agents"],
    [trials, "trials"],
  ]
    .map(([n, l]) => `<div><b>${num(Number(n))}</b><span>${l}</span></div>`)
    .join('<span class="plan-x">×</span>')}</div>
  <p class="plan-total">${why ? "" : `<b>${num(pairs.length)}</b> ${pairs.length === 1 ? "result" : "results"}, <b>${num(pairs.length * trials)}</b> ${pairs.length * trials === 1 ? "trial" : "trials"} in all`}</p>
  ${why ? `<p class="plan-why">${icon("alert", 13)}${esc(why)}</p>` : ""}
  <div class="plan-cmd"><span class="eyebrow">The same from the command line</span>${commands.length ? commandBlock(commands) : '<p class="muted small">Complete the form to see the command.</p>'}</div>
  <div class="plan-actions">${button("Start the run", { action: "launch-start", kind: "primary", icon: "play", disabled: Boolean(why), attrs: 'style="width:100%"' })}<p class="muted small">Runs in the background. You can leave this page; the top bar shows the progress.</p></div>`;
}

function tagOptions(): Array<{ value: string; label: string }> {
  const tags = [...new Set(scenarioList().flatMap((s) => s.tags))].sort();
  return [{ value: "", label: "All tags" }, ...tags.map((t) => ({ value: t, label: t }))];
}

function prime(query: URLSearchParams): void {
  const key = query.toString();
  if (key === primed) return;
  primed = key;
  const ids = (query.get("scenarios") ?? "").split(",").filter(Boolean);
  const agents = (query.get("agents") ?? "").split(",").filter(Boolean);
  if (ids.length || agents.length) {
    selected.clear();
    for (const id of ids) if (scenarioList().some((s) => s.id === id)) selected.add(id);
    agentSet.clear();
    for (const a of agents) if (store.meta.agents.some((x) => x.id === a)) agentSet.add(a);
    mode = agentSet.size ? "chosen" : "expected";
  }
  if (!trials) trials = store.prefs.trials;
  if (!failOn) failOn = store.meta.failOn;
}

export function launchForm(): string {
  const head = pageHead({
    eyebrow: `${icon("play", 11)}Execute`,
    title: "New run",
    desc: "Pick scenarios and agents; AgentCrucible breaks tool calls on a seeded schedule and grades what each agent did and said against what the mock services committed. The run is recorded in the history when it ends.",
    meta: [metaItem("layers", `${plural(scenarioList().length, "scenario")} available`), metaItem("bot", `${plural(store.meta.agents.length, "agent")} registered`), metaItem("flag", `Gate fails at <b class="fg">${esc(store.meta.failOn)}</b>`, "The server's --fail-on threshold")],
    actions: `${button("Sweep instead", { href: "#/sweep", icon: "grid" })}${button("Guided demo", { href: "#/demo", icon: "spark" })}`,
  });
  const scenarios = panel(
    {
      title: "Scenarios",
      icon: "layers",
      meta: `<span id="launch-scn-count">${esc(scnCount())}</span>`,
      actions: `${button("Select shown", { action: "launch-scn-all", kind: "ghost", size: "sm" })}${button("Clear", { action: "launch-scn-none", kind: "ghost", size: "sm" })}`,
      flush: true,
    },
    `<div class="pick-tools">${searchInput({ id: "launch-q", value: q, placeholder: "Search scenarios, tags, worlds", kbd: "/" })}${select({ input: "launch-tag", value: tag, options: tagOptions(), label: "Filter by tag", width: "150px" })}</div><div id="launch-chosen">${chosenChips()}</div><div id="launch-scns">${scenarioPicker()}</div>`
  );
  const agents = panel(
    { title: "Agents", icon: "bot", meta: mode === "expected" ? "the expected agents of each scenario" : `${agentSet.size} chosen`, actions: segmented("launch-mode", mode, [{ value: "expected", label: "Expected agents" }, { value: "chosen", label: "Choose agents" }], { label: "Which agents run" }) },
    `<div id="launch-agents" class="${mode === "expected" ? "is-off" : ""}">${agentPicker()}</div>${mode === "expected" ? `<p class="muted small mt-12">Each scenario runs the agents its <code>expected_verdicts</code> lists, so the grade can tell a surprise from a known weakness. Switch to choose agents to run something else.</p>` : ""}`
  );
  const options = panel(
    { title: "Options", icon: "sliders" },
    `<div class="opt-grid">${field("Trials", `<div class="stepper"><button type="button" data-action="launch-trials-step" data-step="-1" aria-label="Fewer trials">${icon("minus", 12)}</button><input type="number" id="launch-trials" data-input="launch-trials" min="1" max="10000" value="${trials}" aria-label="Trials per result"/><button type="button" data-action="launch-trials-step" data-step="1" aria-label="More trials">${icon("plus", 12)}</button></div>`, { hint: "Each trial runs the agent again. Several trials show whether a verdict is stable." })}
    ${field("Seed", `<input class="input mono" id="launch-seed" data-input="launch-seed" value="${esc(seed)}" placeholder="default per scenario" autocomplete="off" spellcheck="false"/>`, { optional: true, hint: "The same seed repeats the same fault timing." })}
    ${field("Fail threshold", select({ input: "launch-failon", value: failOn, options: VERDICTS.map((v) => ({ value: v, label: v })), label: "Fail threshold" }), { hint: "The CLI exits 2 when a result is at or above this verdict." })}
    ${field("Label", `<input class="input" id="launch-label" data-input="launch-label" value="${esc(label)}" maxlength="80" placeholder="Nightly regression" autocomplete="off"/>`, { optional: true, hint: "Names the run in the history." })}
    ${field("Agent version", `<input class="input mono" id="launch-version" data-input="launch-version" value="${esc(version)}" maxlength="40" placeholder="2.1" autocomplete="off"/>`, { optional: true, hint: "Groups runs by release on the trend chart." })}</div>`
  );
  return `<div class="page launch-page">${head}
  <div class="launch-grid"><div class="launch-main">${scenarios}${agents}${options}</div>
  <aside class="launch-side">${panel({ title: "This run", icon: "target", cls: "plan-panel" }, `<div id="launch-plan">${planPanel()}</div>`)}</aside></div></div>`;
}

function scnCount(): string {
  const n = shownScenarios().length;
  return `${selected.size} of ${n === scenarioList().length ? plural(n, "scenario") : `${n} shown`} chosen`;
}

function refreshForm(): void {
  patch("launch-scn-count", esc(scnCount()));
  patch("launch-chosen", chosenChips());
  patch("launch-plan", planPanel());
}

function refreshList(): void {
  patch("launch-scns", scenarioPicker());
  refreshForm();
}

function liveParts(job: Job, planned?: RunPlan): { head: string; grid: string; feed: string } {
  const results = job.results ?? [];
  const running = job.status === "running";
  const c = resultCounts(results);
  const fraction = job.total ? job.done / job.total : null;
  const head = `<div class="live-head"><div class="live-count"><b>${num(job.done)}</b><span>of ${num(job.total)} results</span></div><div class="grow">${progressBar(running ? fraction : job.status === "done" ? 1 : fraction, { label: `${job.label}: ${job.done} of ${job.total}` })}<div class="live-sub"><span id="job-elapsed">${esc(elapsed(job))}</span>${results.length ? `<span>${pct(c.safe, c.total)} safe so far</span>` : ""}${c.graded ? `<span class="${c.unexpected ? "bad-text" : ""}">${c.unexpected ? `${c.unexpected} unexpected` : "all as expected"}</span>` : ""}</div></div>${results.length ? `<div class="live-bar">${verdictBar(tally(results), { size: "lg" })}</div>` : ""}</div>`;
  const pairs = planned?.pairs ?? [];
  const grid = liveMatrix(pairs, results, running);
  const feed = results.length
    ? `<ul class="list live-feed">${[...results]
        .reverse()
        .slice(0, 12)
        .map((r) => `<li><a class="list-row" href="${href("report", r.key)}"><span class="grow"><span class="title mono">${esc(r.scenarioId ?? "")} · ${esc(r.agentId ?? "")}</span><span class="detail">${esc(clip(r.reason ?? r.error ?? "", 120))}</span></span>${badge(r.verdict)}</a></li>`)
        .join("")}</ul>`
    : emptyState({ icon: "timer", title: "Waiting for the first result", text: "Each result appears here as soon as its trials finish.", compact: true });
  return { head, grid, feed };
}

function pct(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 100)}%` : "0%";
}

function elapsed(job: Job): string {
  const end = job.finishedAt ? Date.parse(job.finishedAt) : Date.now();
  return `${job.status === "running" ? "running for" : "took"} ${duration(Math.max(0, end - Date.parse(job.startedAt)))}`;
}

function paintJob(job: Job): void {
  const parts = liveParts(job, runPlans.get(job.jobId));
  patch("job-head", parts.head);
  patch("job-grid", parts.grid);
  patch("job-feed", parts.feed);
}

export function launchJob(job: Job): string {
  const planned = runPlans.get(job.jobId);
  const run = job.runId ? store.runs.find((r) => r.runId === job.runId) : undefined;
  const running = job.status === "running";
  const parts = liveParts(job, planned);
  const state = running ? pill("Running", "accent") : job.status === "done" ? pill("Finished", "ok") : pill("Failed", "bad");
  const head = pageHead({
    eyebrow: `${icon("runs", 11)}Run in progress`,
    title: job.label,
    titleExtra: ` ${state}`,
    desc: `${esc(job.detail)}. Results appear cell by cell as each scenario and agent finishes its trials.`,
    meta: [metaItem("hash", `<code>${esc(job.jobId)}</code>`), metaItem("clock", `Started ${esc(relTime(job.startedAt))}`, job.startedAt)],
    actions: `${button("New run", { href: "#/launch", icon: "plus" })}${run ? button("Open the run", { href: href("run", run.runId), kind: "primary", icon: "arrowRight" }) : ""}`,
  });
  let outcome = "";
  if (job.status === "failed") outcome = callout("bad", `<p>${esc(job.error ?? "The run failed.")}</p>`, { title: "The run did not finish", actions: planned ? button("Run again", { action: "launch-retry", icon: "repeat", size: "sm", attrs: `data-job="${esc(job.jobId)}"` }) : button("Back to the form", { href: "#/launch", size: "sm" }) });
  if (job.status === "done" && run) {
    const s = runStatus(run);
    const threshold = store.meta.failOn;
    const atOrAbove = run.results.filter((r) => r.verdict && VERDICT_SEVERITY[r.verdict] >= VERDICT_SEVERITY[threshold]).length;
    outcome = callout(s.unexpected ? "warn" : "ok", `<p>${plural(run.results.length, "result")} recorded as <a class="link-mono" href="${href("run", run.runId)}">${esc(run.runId)}</a>. ${s.graded ? (s.unexpected ? `${plural(s.unexpected, "result")} differ${s.unexpected === 1 ? "s" : ""} from expected_verdicts.` : `All ${s.graded} graded results match expected_verdicts.`) : "No scenario lists an expected verdict for these agents."} ${atOrAbove ? `${plural(atOrAbove, "result")} ${atOrAbove === 1 ? "is" : "are"} at or above ${esc(threshold)}, so the CLI would exit 2 without a baseline.` : `Nothing is at or above ${esc(threshold)}, so the CLI would exit 0.`}</p>`, { title: s.unexpected ? "Finished with surprises" : "Finished", actions: button("Open the run", { href: href("run", run.runId), kind: "primary", size: "sm", iconEnd: "arrowRight" }) });
  }
  const kpiRow = kpis([
    kpi({ label: "Progress", icon: "timer", value: `${num(job.done)}`, unit: `/${num(job.total)}`, sub: running ? "results finished" : job.status === "done" ? "all results finished" : "stopped early" }),
    kpi({ label: "Started", icon: "clock", value: relTime(job.startedAt), sub: new Date(job.startedAt).toLocaleTimeString() }),
    kpi({ label: "Elapsed", icon: "timer", value: duration(Math.max(0, (job.finishedAt ? Date.parse(job.finishedAt) : Date.now()) - Date.parse(job.startedAt))), sub: running ? "so far" : "in all" }),
  ]);
  return `<div class="page launch-page">${head}${outcome}${kpiRow}
  ${panel({ title: "Progress", icon: "gauge", cls: "mt-16" }, `<div id="job-head">${parts.head}</div>`)}
  <div class="grid g-8-4 mt-16">${panel({ title: "Matrix", icon: "grid", meta: "scenarios down, agents across", flush: true }, `<div id="job-grid">${parts.grid}</div>`)}${panel({ title: "Latest results", icon: "activity", flush: true }, `<div id="job-feed">${parts.feed}</div>`)}</div>
  ${planned ? panel({ title: "Run it again from the command line", icon: "terminal", cls: "mt-16" }, commandBlock(launchCommands({ scenarios: scenarioList().filter((s) => planned.request.scenarioIds?.includes(s.id)), agents: planned.request.agents.length ? planned.request.agents : null, trials: planned.request.trials, seed: planned.request.seed }, scenarioList()))) : ""}
</div>`;
}

const page: Page = {
  nav: "runs",
  title: (ctx) => (ctx.query.get("job") ? "Run in progress" : "New run"),
  skeleton: "detail",
  async render(ctx) {
    await Promise.all([load.scenarios(), load.runs()]);
    const jobId = ctx.query.get("job");
    if (jobId) {
      const job = await api<Job>(`/api/job?id=${encodeURIComponent(jobId)}`).catch(() => undefined);
      if (!job) return `<div class="page">${pageHead({ title: jobId, mono: true, eyebrow: `${icon("runs", 11)}Run in progress` })}${emptyState({ icon: "search", title: "The server no longer knows this job", text: "It keeps the most recent finished jobs. Finished runs stay in the history.", actions: `${button("All runs", { href: "#/runs", kind: "primary", icon: "runs" })}${button("New run", { href: "#/launch" })}` })}</div>`;
      if (job.runId && !store.runs.some((r) => r.runId === job.runId)) await load.runs(true);
      return launchJob(job);
    }
    prime(ctx.query);
    return launchForm();
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
    "launch-q": (el) => {
      q = el.value;
      refreshList();
    },
    "launch-tag": (el) => {
      tag = el.value;
      refreshList();
    },
    "launch-trials": (el) => {
      trials = Math.max(1, Math.min(10_000, Math.floor(Number(el.value)) || 1));
      patch("launch-plan", planPanel());
    },
    "launch-seed": (el) => {
      seed = el.value;
      patch("launch-plan", planPanel());
    },
    "launch-failon": (el) => {
      failOn = el.value;
      patch("launch-plan", planPanel());
    },
    "launch-label": (el) => void (label = el.value),
    "launch-version": (el) => void (version = el.value),
  },
  actions: {
    "launch-scn": (el) => {
      const input = el as HTMLInputElement;
      if (input.checked) selected.add(input.value);
      else selected.delete(input.value);
      refreshForm();
    },
    "launch-scn-remove": (el) => {
      selected.delete(el.dataset.id ?? "");
      refreshList();
    },
    "launch-scn-all": () => {
      for (const s of shownScenarios()) selected.add(s.id);
      refreshList();
    },
    "launch-scn-none": () => {
      selected.clear();
      refreshList();
    },
    "launch-agent": (el) => {
      const input = el as HTMLInputElement;
      if (input.checked) agentSet.add(input.value);
      else agentSet.delete(input.value);
      refreshForm();
    },
    "launch-mode": (el) => {
      mode = el.dataset.value as Mode;
      if (mode === "chosen" && !agentSet.size) for (const a of chosenScenarios().flatMap((s) => Object.keys(s.expectedVerdicts))) agentSet.add(a);
      return runtime.rerender();
    },
    "launch-trials-step": (el) => {
      trials = Math.max(1, Math.min(10_000, trials + Number(el.dataset.step)));
      const input = document.getElementById("launch-trials") as HTMLInputElement | null;
      if (input) input.value = String(trials);
      patch("launch-plan", planPanel());
    },
    "launch-start": async (el) => {
      if (problem()) return;
      const p = plan();
      const job = await busy(el, () => startPlannedRun({ scenarioIds: p.scenarios.map((s) => s.id), agents: p.agents ?? [], trials: p.trials, seed: p.seed, label: label.trim() || undefined, version: version.trim() || undefined }, scenarioList()));
      if (!job) return;
      toast(`Started ${job.label}.`, "info", { ms: 2200 });
      runtime.navigate(`#/launch?job=${encodeURIComponent(job.jobId)}`);
    },
    "launch-retry": async (el) => {
      const planned = runPlans.get(el.dataset.job ?? "");
      if (!planned) return;
      const job = await busy(el, () => startPlannedRun(planned.request, scenarioList()));
      if (job) runtime.navigate(`#/launch?job=${encodeURIComponent(job.jobId)}`);
    },
  },
};

export default page;
