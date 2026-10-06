/**
 * One run in full: its numbers, the scenario-by-agent matrix with trials, how to export it and run
 * it again, and, for runs from the history, how well today's code reproduces them. With
 * `?compare=<run>` the page shows which verdicts changed between two runs instead.
 */
import type { Comparison, RunRecord } from "../../api.js";
import { VERDICT_SEVERITY, type Verdict } from "../../../types.js";
import { isFlaky, isUnexpected } from "../lib/analytics.js";
import { busy } from "../lib/busy.js";
import { copy, download } from "../lib/dom.js";
import { absTime, duration, esc, href, num, pct, plural, withQuery } from "../lib/format.js";
import { startPlannedRun } from "../lib/job-plans.js";
import { diffCounts, diffCsv, matrixAxes, previousRun, resultCounts, runAgents, runCommands, runCsv, runDiff, runJson, runMarkdown, runScope, runTitle, type DiffChange, type DiffRow } from "../lib/runs.js";
import { runtime } from "../lib/runtime.js";
import { api } from "../lib/api.js";
import { load, remember, store } from "../lib/state.js";
import { icon } from "../icons.js";
import type { Page } from "../routes.js";
import { callout, emptyState, facts, kpi, kpis, metaItem, pageHead, panel } from "../ui/layout.js";
import { confirmDialog, openMenu, toast } from "../ui/overlays.js";
import { button, copyButton, pill, segmented, tip } from "../ui/primitives.js";
import { commandBlock, expectSummary, originChip, runMatrix, statusPill, when, type MatrixDensity, type MatrixFilter } from "../ui/run-view.js";
import { by, dataTable, registerTable, tableState, type Column } from "../ui/table.js";
import { badge, tally, verdictBar, verdictLegend } from "../ui/verdicts.js";

let matrixFilter: MatrixFilter = "all";
let density: MatrixDensity = "compact";
let shownRun = "";
let diffFilter: DiffChange | "all" = "all";
const baselineChecks = new Map<string, Comparison>();

interface Regeneration {
  checked: number;
  total: number;
  running: boolean;
  differing: Array<{ key: string; scenarioId: string; agentId: string; recorded: Verdict | undefined; now: Verdict | undefined }>;
  scenarioChanged: number;
}

const regenerations = new Map<string, Regeneration>();

function runHref(id: string, compare?: string): string {
  return withQuery(href("run", id), { compare });
}

function runLink(r: RunRecord): string {
  return `<a class="link-mono" href="${href("run", r.runId)}">${esc(r.runId)}</a>`;
}

/** The scope of a run as a sentence: what it asked for, for a header or a card. */
function scopeSentence(run: RunRecord): string {
  const s = runScope(run);
  return `${plural(s.scenarios, "scenario")} × ${plural(s.agents, "agent")} × ${plural(s.trials, "trial")}`;
}

function runFacts(run: RunRecord): string {
  const agents = runAgents(run);
  return facts([
    ["Scenarios", run.scenarios.slice(0, 6).map((s) => `<a class="link-mono" href="${href("scenario", s)}">${esc(s)}</a>`).join("<br>") + (run.scenarios.length > 6 ? `<br><span class="muted">and ${run.scenarios.length - 6} more</span>` : "")],
    ["Agents", `${agents.map((a) => `<a class="link-mono" href="${href("agent", a)}">${esc(a)}</a>`).join(", ")}${run.agents ? "" : `<br><span class="muted small">the expected agents of each scenario</span>`}`],
    ["Trials", `${run.trials} per result`],
    ["Seed", run.seed ? `<code>${esc(run.seed)}</code> ${copyButton(run.seed, "Copy the seed", { iconOnly: true })}` : '<span class="muted">each scenario\'s default seed</span>'],
    run.version ? ["Version", `<code>v${esc(run.version)}</code>`] : undefined,
    run.actor ? ["Started by", esc(run.actor)] : undefined,
    ["Started", when(run.startedAt, store.prefs.time === "absolute")],
    run.finishedAt ? ["Finished", when(run.finishedAt, store.prefs.time === "absolute")] : undefined,
  ]);
}

function regenerationPanel(run: RunRecord): string {
  const state = regenerations.get(run.runId);
  const checkable = run.results.filter((r) => r.verdict).length;
  const check = button(state?.running ? "Checking…" : state ? "Check again" : `Check ${plural(checkable, "result")}`, { action: "run-regen", icon: "replay", size: "sm", disabled: state?.running || !checkable });
  const text = `The history keeps each result's verdict, not its trace. Opening a report replays the scenario from its seed${run.seed ? ` <code>${esc(run.seed)}</code>` : ""} with the agents registered now, so a report of an older version can differ from what was recorded${run.version ? ` for v${esc(run.version)}` : ""}. That is the point: it shows what the current code does with the same inputs.`;
  if (!state) return callout("info", `<p>${text}</p>`, { title: "This run comes from the workspace history", icon: "history", actions: check });
  const progress = state.running ? ` Checked ${state.checked} of ${state.total}…` : "";
  const same = state.checked - state.differing.length;
  const summary = state.running ? "" : state.differing.length ? `${same} of ${state.checked} regenerate to the recorded verdict. ${plural(state.differing.length, "result")} now differ${state.differing.length === 1 ? "s" : ""}.` : `All ${plural(state.checked, "result")} regenerate to the recorded verdict.`;
  const rows = state.differing
    .map((d) => `<li><a class="list-row" href="${href("report", d.key)}"><span class="grow"><span class="title mono">${esc(d.scenarioId)} · ${esc(d.agentId)}</span><span class="detail">recorded ${esc(d.recorded ?? "unknown")}, regenerated ${esc(d.now ?? "unknown")}</span></span><span class="regen-pair">${badge(d.recorded)}${icon("arrowRight", 12, "faint")}${badge(d.now)}</span></a></li>`)
    .join("");
  const body = `<p>${text}</p><p class="regen-sum"><b>${esc(summary)}</b>${esc(progress)}${state.scenarioChanged ? ` ${plural(state.scenarioChanged, "scenario")} changed since the run, so its report reflects today's file.` : ""}</p>${rows ? `<ul class="list regen-list">${rows}</ul>` : ""}`;
  return callout(state.differing.length ? "warn" : state.running ? "info" : "ok", body, { title: "This run comes from the workspace history", icon: "history", actions: check });
}

function matrixPanel(run: RunRecord): string {
  const counts = resultCounts(run.results);
  const filters = [{ value: "all", label: "All", count: run.results.length }, ...(counts.unexpected ? [{ value: "unexpected", label: "Unexpected", count: counts.unexpected }] : []), ...(counts.flaky ? [{ value: "flaky", label: "Flaky", count: counts.flaky }] : [])];
  const { scenarios, agents } = matrixAxes(run);
  const tools = `${filters.length > 1 ? segmented("matrix-filter", matrixFilter, filters, { label: "Show results" }) : ""}${segmented(
    "matrix-density",
    density,
    [
      { value: "compact", label: "Compact", icon: "list" },
      { value: "detailed", label: "Detailed", icon: "grid" },
    ],
    { label: "Density" }
  )}`;
  return panel({ title: "Results", icon: "grid", meta: `${plural(scenarios.length, "scenario")} × ${plural(agents.length, "agent")}`, actions: tools, flush: true }, `<div id="matrix-host">${runMatrix(run, { filter: matrixFilter, density })}</div>`);
}

function exportsPanel(run: RunRecord): string {
  const commands = run.draft ? [] : runCommands(run);
  const exportButtons = `${button("Markdown", { action: "run-md", icon: "copy", size: "sm", title: "Copy the matrix as a Markdown table" })}${button("CSV", { action: "run-csv", icon: "download", size: "sm", title: "Download every result as CSV" })}${button("JSON", { action: "run-json", icon: "download", size: "sm", title: "Download the run and its results as JSON" })}`;
  return panel(
    { title: "Export and repeat", icon: "terminal", actions: exportButtons },
    commands.length
      ? `<p class="muted small mb-8">The same matrix from the command line. The seed makes the verdicts repeat exactly${run.agents ? "" : "; each scenario runs the agents its expected_verdicts name"}.</p>${commandBlock(commands)}`
      : `<p class="muted small">This run used the editor's unsaved text, so the command line cannot repeat it. Save the scenario in the editor first.</p>`
  );
}

function baselinePanel(run: RunRecord): string {
  const c = baselineChecks.get(run.runId);
  if (!c) return "";
  const failing = c.regressions.length;
  const lines = [
    [c.regressions.length, "regressed", "bad"],
    [c.improvements.length, "improved", "ok"],
    [c.changed.length, "changed rules", ""],
    [c.unchanged, "unchanged", ""],
    [c.added.length, "not in the baseline", ""],
    [c.incomparable.length, "not comparable", ""],
  ] as const;
  return panel(
    { title: "Against the baseline", icon: "compare", meta: failing ? `${plural(failing, "regression")}` : "no regressions", actions: `<a class="link-quiet" href="#/baseline?compare=latest">Baseline ${icon("arrowRight", 12)}</a>` },
    `<div class="row row-wrap gap-16">${lines.map(([n, label, kind]) => `<span class="base-stat ${kind && n ? kind : ""}"><b>${n}</b>${esc(label)}</span>`).join("")}</div>${c.regressions.length ? `<ul class="list mt-12">${c.regressions.slice(0, 5).map((r) => `<li class="list-row"><span class="grow"><span class="title mono">${esc(r.scenario)} · ${esc(r.agent)}</span><span class="detail">${esc(r.before)} to ${esc(r.after)}</span></span></li>`).join("")}</ul>` : ""}`
  );
}

function detail(run: RunRecord): string {
  const c = resultCounts(run.results);
  const s = runScope(run);
  const prev = previousRun(run, store.runs);
  const verdicts = tally(run.results);
  const critical = (verdicts.find(([v]) => v === "HARMFUL_ACTION")?.[1] ?? 0) + (verdicts.find(([v]) => v === "SILENT_FAILURE")?.[1] ?? 0);
  const head = pageHead({
    eyebrow: `${icon("runs", 11)}Run`,
    title: run.runId,
    mono: true,
    titleExtra: ` ${statusPill(run)} ${originChip(run)}`,
    desc: `${esc(run.label ?? "")}${run.label ? " · " : ""}${esc(scopeSentence(run))}. Every verdict comes from what the mock services committed, never from the agent's own report.`,
    meta: [
      metaItem("clock", when(run.startedAt, store.prefs.time === "absolute")),
      metaItem("timer", `<b class="fg">${esc(duration(run.durationMs))}</b>`, "How long the run took"),
      ...(run.actor ? [metaItem("user", esc(run.actor), "Who started the run")] : []),
      ...(run.version ? [metaItem("flag", `v${esc(run.version)}`, "The version of the agent under test")] : []),
      metaItem("hash", run.seed ? `seed <code>${esc(run.seed)}</code>` : "default seeds"),
    ],
    actions: `${button("Compare", { action: "run-compare-menu", icon: "compare", iconEnd: "chevronDown", title: "Compare with another run" })}${button("More", { action: "run-more", icon: "moreH", iconEnd: "chevronDown", title: "Save, compare with the baseline, open in the launcher" })}${button("Re-run", { action: "run-rerun", kind: "primary", icon: "repeat", disabled: run.draft, title: run.draft ? "A draft run used unsaved editor text" : "Run the same scenarios, agents, trials, and seed again" })}`,
  });
  const kpiRow = kpis([
    kpi({ label: "Results", icon: "target", value: num(c.total), sub: `${s.scenarios} × ${s.agents} × ${s.trials}` }),
    kpi({ label: "Safe", icon: "shieldCheck", value: pct(c.safe, c.total), sub: `${num(c.safe)} of ${num(c.total)} ended safe` }),
    kpi({ label: "Critical", icon: "octagon", value: critical, tone: critical ? "bad" : "ok", sub: critical ? "harmful or silent failures" : "none harmful or silent" }),
    kpi({ label: "As expected", icon: "checkCircle", value: c.graded ? `${c.graded - c.unexpected}` : "—", unit: c.graded ? `/${c.graded}` : "", tone: c.graded ? (c.unexpected ? "warn" : "ok") : "", sub: c.graded ? (c.unexpected ? `${plural(c.unexpected, "result differs", "results differ")} from expected_verdicts` : "every graded result matches") : "no expected verdicts" }),
    kpi({ label: "Flaky", icon: "split", value: c.flaky, tone: c.flaky ? "warn" : "", sub: c.multiTrial ? `${c.flaky} of ${plural(c.multiTrial, "multi-trial result")} disagree` : "single trial per result" }),
    kpi({ label: "Duration", icon: "timer", value: duration(run.durationMs), sub: run.durationMs && c.total ? `${duration(run.durationMs / c.total)} per result` : "" }),
  ]);
  const mix = panel(
    { title: "Verdict mix", icon: "barChart", meta: plural(c.total, "result") },
    c.total ? `${verdictBar(verdicts, { size: "xl" })}${verdictLegend(verdicts, { all: true })}` : emptyState({ icon: "inbox", title: "No results", compact: true })
  );
  const note = prev ? `<a class="link-quiet" href="${runHref(run.runId, prev.runId)}">${icon("compare", 12)}Compare with ${esc(runTitle(prev))} (${esc(prev.runId)}) ${icon("arrowRight", 12)}</a>` : "";
  return `<div class="page run-page">
  ${head}
  ${run.archived ? regenerationPanel(run) : ""}
  ${kpiRow}
  <div class="grid g-8-4">${mix}${panel({ title: "What ran", icon: "layers", actions: note }, runFacts(run))}</div>
  <div class="mt-16">${matrixPanel(run)}</div>
  ${baselinePanel(run)}
  <div class="mt-16">${exportsPanel(run)}</div>
</div>`;
}

const CHANGE_LABEL: Record<DiffChange, string> = { regression: "Regressed", improvement: "Improved", split: "Trials split differently", added: "Only in the later run", removed: "Only in the earlier run", same: "Unchanged" };
const CHANGE_PILL: Record<DiffChange, "bad" | "ok" | "warn" | "info" | "outline" | ""> = { regression: "bad", improvement: "ok", split: "warn", added: "info", removed: "outline", same: "" };

const diffColumns: Column<DiffRow>[] = [
  { id: "change", label: "Change", sort: by.num((r) => ["regression", "improvement", "split", "added", "removed", "same"].indexOf(r.change)), render: (r) => pill(CHANGE_LABEL[r.change], CHANGE_PILL[r.change]) },
  { id: "scenario", label: "Scenario", sort: by.text((r) => r.scenarioId), render: (r) => `<a class="row-link mono" href="${href("scenario", r.scenarioId)}">${esc(r.scenarioId)}</a>` },
  { id: "agent", label: "Agent", sort: by.text((r) => r.agentId), render: (r) => `<a class="link-mono" href="${href("agent", r.agentId)}">${esc(r.agentId)}</a>` },
  { id: "before", label: "Earlier", sort: by.num((r) => (r.before?.verdict ? VERDICT_SEVERITY[r.before.verdict] : null)), render: (r) => (r.before ? `<a class="diff-cell" href="${href("report", r.before.key)}">${badge(r.before.verdict)}${trialNote(r.before.trials, r.before.byVerdict)}</a>` : '<span class="faint">not run</span>') },
  { id: "after", label: "Later", sort: by.num((r) => (r.after?.verdict ? VERDICT_SEVERITY[r.after.verdict] : null)), render: (r) => (r.after ? `<a class="diff-cell" href="${href("report", r.after.key)}">${badge(r.after.verdict)}${trialNote(r.after.trials, r.after.byVerdict)}</a>` : '<span class="faint">not run</span>') },
  { id: "expected", label: "Expected", render: (r) => (r.after?.expected ?? r.before?.expected ? `<span class="mono small">${esc(r.after?.expected ?? r.before?.expected ?? "")}</span>${r.after && isUnexpected(r.after) ? ' <span class="mark-bad">differs</span>' : ""}` : '<span class="faint">—</span>') },
];

function trialNote(trials: number | undefined, byVerdict: Partial<Record<Verdict, number>> | undefined): string {
  if ((trials ?? 1) < 2) return "";
  return `<span class="muted small mono"${tip(Object.entries(byVerdict ?? {}).map(([v, n]) => `${n} ${v}`).join(", "))}>${isFlaky({ byVerdict }) ? "flaky, " : ""}${trials} trials</span>`;
}

function compareCard(label: string, run: RunRecord): string {
  const c = resultCounts(run.results);
  return `<div class="cmp-card"><span class="eyebrow">${esc(label)}</span><a class="cmp-title" href="${href("run", run.runId)}">${esc(runTitle(run))}</a><span class="cmp-sub">${runLink(run)}${run.version ? ` · v${esc(run.version)}` : ""} · ${when(run.startedAt, store.prefs.time === "absolute")}</span>${verdictBar(tally(run.results), { size: "md" })}<span class="cmp-sub">${plural(c.total, "result")} · ${pct(c.safe, c.total)} safe${c.graded ? ` · ${expectSummary(run.results)}` : ""}</span></div>`;
}

const DIFF_TABLE = "run-diff";
let diffRows: DiffRow[] = [];

function diffTable(): string {
  const rows = diffFilter === "all" ? diffRows : diffRows.filter((r) => r.change === diffFilter);
  return dataTable({
    id: DIFF_TABLE,
    columns: diffColumns,
    rows,
    state: tableState(DIFF_TABLE, { pageSize: store.prefs.pageSize }),
    rowKey: (r) => `${r.scenarioId}\n${r.agentId}`,
    cards: true,
    caption: "Verdicts of the two runs",
    empty: emptyState({ icon: "search", title: "Nothing in this group", text: "Choose another change above.", compact: true }),
  });
}

function compare(after: RunRecord, before: RunRecord): string {
  diffRows = runDiff(after, before);
  const counts = diffCounts(diffRows);
  const changed = counts.regression + counts.improvement + counts.split;
  const sameSeed = after.seed === before.seed && after.trials === before.trials;
  const head = pageHead({
    eyebrow: `${icon("compare", 11)}Compare runs`,
    title: "Run against run",
    desc: `Each scenario and agent pair matched across the two runs: a regression when the later verdict is more severe, an improvement when it is less severe, a split when the verdict held but the trials divided differently.`,
    meta: [metaItem("hash", `<b class="fg">${plural(diffRows.length, "pair")}</b> compared`), metaItem("compare", changed ? `<b class="fg">${plural(changed, "pair")}</b> changed` : "No verdict changed")],
    actions: `${button("Swap", { action: "diff-swap", icon: "repeat", attrs: `data-after="${esc(before.runId)}" data-before="${esc(after.runId)}"`, title: "Treat the earlier run as the later one" })}${button("Export CSV", { action: "diff-csv", icon: "download", title: "Download the pairs as CSV" })}${button("Close", { href: href("run", after.runId), kind: "primary", icon: "x" })}`,
  });
  const kpiRow = kpis([
    kpi({ label: "Regressed", icon: "trendDown", value: counts.regression, tone: counts.regression ? "bad" : "ok", sub: counts.regression ? "the later verdict is more severe" : "nothing got worse" }),
    kpi({ label: "Improved", icon: "trendUp", value: counts.improvement, tone: counts.improvement ? "ok" : "", sub: "the later verdict is less severe" }),
    kpi({ label: "Trials split", icon: "split", value: counts.split, tone: counts.split ? "warn" : "", sub: "same verdict, different trials" }),
    kpi({ label: "Unchanged", icon: "check", value: counts.same, sub: "same verdict and trials" }),
    kpi({ label: "Only in one run", icon: "minus", value: counts.added + counts.removed, sub: `${counts.added} later, ${counts.removed} earlier` }),
  ]);
  const filters = (["all", "regression", "improvement", "split", "added", "removed", "same"] as const)
    .filter((f) => f === "all" || counts[f])
    .map((f) => ({ value: f, label: f === "all" ? "All" : CHANGE_LABEL[f].replace("Trials split differently", "Split").replace("Only in the later run", "Later only").replace("Only in the earlier run", "Earlier only"), count: f === "all" ? diffRows.length : counts[f] }));
  registerTable(DIFF_TABLE, diffTable);
  return `<div class="page run-page">
  ${head}
  <div class="cmp-runs">${compareCard("Earlier", before)}<span class="cmp-arrow">${icon("arrowRight", 18)}</span>${compareCard("Later", after)}</div>
  ${sameSeed ? "" : callout("warn", `<p>The runs used a different ${after.seed !== before.seed ? "seed" : "trial count"}${after.seed !== before.seed ? ` (<code>${esc(before.seed ?? "default")}</code> and <code>${esc(after.seed ?? "default")}</code>)` : ` (${before.trials} and ${after.trials})`}, so a changed verdict may come from different fault timing rather than the agent.</p>`, { title: "The runs are not directly comparable" })}
  ${kpiRow}
  <div class="dt-toolbar">${segmented("diff-filter", diffFilter, filters, { label: "Show pairs", wrap: true })}<span class="spacer"></span><span class="count">${plural(diffRows.length, "pair")}</span></div>
  <div id="diff-host">${diffTable()}</div>
</div>`;
}

function findRun(id: string | undefined): RunRecord | undefined {
  return store.runs.find((r) => r.runId === id);
}

function current(): RunRecord | undefined {
  return findRun(shownRun);
}

async function regenerate(run: RunRecord): Promise<void> {
  const keys = run.results.filter((r) => r.verdict);
  const state: Regeneration = { checked: 0, total: keys.length, running: true, differing: [], scenarioChanged: 0 };
  regenerations.set(run.runId, state);
  await runtime.rerender();
  const queue = [...keys];
  const worker = async () => {
    for (let r = queue.shift(); r; r = queue.shift()) {
      const report = (await load.report(r.key)) as { regeneration?: { matches: boolean; scenarioChanged: boolean; recordedVerdict?: Verdict }; aggregateVerdict: Verdict };
      state.checked++;
      if (report.regeneration?.scenarioChanged) state.scenarioChanged++;
      if (report.regeneration && !report.regeneration.matches) state.differing.push({ key: r.key, scenarioId: r.scenarioId ?? "", agentId: r.agentId ?? "", recorded: report.regeneration.recordedVerdict ?? r.verdict, now: report.aggregateVerdict });
    }
  };
  try {
    await Promise.all([worker(), worker(), worker(), worker()]);
  } finally {
    state.running = false;
    regenerations.set(run.runId, state);
    await runtime.rerender();
  }
}

const page: Page = {
  nav: "runs",
  title: (ctx) => (ctx.query.get("compare") ? `${ctx.arg} against ${ctx.query.get("compare")}` : (ctx.arg ?? "Run")),
  skeleton: "detail",
  watches: ["runs"],
  async render(ctx) {
    await load.runs(!findRun(ctx.arg));
    const run = findRun(ctx.arg);
    if (!run) {
      return `<div class="page">${pageHead({ title: ctx.arg ?? "Run", mono: true, eyebrow: `${icon("runs", 11)}Run` })}${emptyState({ icon: "search", title: "No such run", text: `The workspace has no run <code>${esc(ctx.arg ?? "")}</code>. The history keeps the most recent runs only.`, actions: button("All runs", { href: "#/runs", kind: "primary", icon: "runs" }) })}</div>`;
    }
    if (shownRun !== run.runId) {
      shownRun = run.runId;
      matrixFilter = "all";
      diffFilter = "all";
    }
    remember({ kind: "run", id: run.runId, label: run.label ?? run.runId, detail: scopeSentence(run) });
    const other = findRun(ctx.query.get("compare") ?? undefined);
    if (ctx.query.get("compare") && !other) return `<div class="page">${pageHead({ title: run.runId, mono: true, eyebrow: `${icon("runs", 11)}Run` })}${emptyState({ icon: "search", title: "The run to compare with is gone", text: `There is no run <code>${esc(ctx.query.get("compare") ?? "")}</code> in the history.`, actions: button("Back to the run", { href: href("run", run.runId), kind: "primary" }) })}</div>`;
    if (!other) return detail(run);
    const [after, before] = run.startedAt >= other.startedAt ? [run, other] : [other, run];
    return compare(after, before);
  },
  actions: {
    "matrix-filter": (el) => {
      matrixFilter = el.dataset.value as MatrixFilter;
      return runtime.rerender();
    },
    "matrix-density": (el) => {
      density = el.dataset.value as MatrixDensity;
      return runtime.rerender();
    },
    "diff-filter": (el) => {
      diffFilter = el.dataset.value as DiffChange | "all";
      tableState(DIFF_TABLE).page = 1;
      return runtime.rerender();
    },
    "diff-swap": (el) => runtime.navigate(runHref(el.dataset.after ?? "", el.dataset.before)),
    "diff-csv": () => {
      const run = current();
      download(`agentcrucible-${run?.runId ?? "runs"}-diff.csv`, diffCsv(diffRows), "text/csv");
      toast(`Exported ${plural(diffRows.length, "pair")} as CSV.`, "ok", { ms: 2500 });
    },
    "run-compare-menu": (el) => {
      const run = current();
      if (!run) return;
      const others = store.runs.filter((r) => r.runId !== run.runId).slice(0, 14);
      if (!others.length) return void toast("There is no other run to compare with yet.", "info");
      openMenu([{ heading: "Compare with" }, ...others.map((r) => ({ label: `${runTitle(r)} · ${r.runId}`, hint: absTime(r.startedAt), href: runHref(run.runId, r.runId) }))], el);
    },
    "run-more": (el) => {
      const run = current();
      if (!run) return;
      openMenu(
        [
          { label: "Save results as reports", icon: "save", hint: "files under the reports folder", run: () => void saveReports(run) },
          { label: "Compare with the baseline", icon: "compare", run: () => void compareBaseline(run) },
          { label: "Replace the baseline with this run", icon: "flag", danger: true, run: () => void replaceBaseline(run) },
          "-",
          { label: "Open in the launcher", icon: "play", href: withQuery("#/launch", { scenarios: run.scenarios.join(","), agents: run.agents?.join(",") }), hint: run.draft ? "draft text is not kept" : undefined },
        ],
        el,
        { align: "end" }
      );
    },
    "run-rerun": async (el) => {
      const run = current();
      if (!run || run.draft) return;
      await load.scenarios();
      const job = await busy(el, () => startPlannedRun({ scenarioIds: run.scenarios, agents: run.agents ?? [], trials: run.trials, seed: run.seed ?? undefined, label: run.label, version: run.version }, store.scenarios ?? []));
      if (job) runtime.navigate(`#/launch?job=${encodeURIComponent(job.jobId)}`);
    },
    "run-regen": async () => {
      const run = current();
      if (run) await regenerate(run).catch((err: Error) => toast(err.message, "bad"));
    },
    "run-md": (el) => {
      const run = current();
      return run ? copy(runMarkdown(run), el).then(() => toast("The matrix is on the clipboard as Markdown.", "ok", { ms: 2200 })) : undefined;
    },
    "run-csv": () => {
      const run = current();
      if (!run) return;
      download(`agentcrucible-${run.runId}.csv`, runCsv(run), "text/csv");
      toast(`Exported ${plural(run.results.length, "result")} as CSV.`, "ok", { ms: 2500 });
    },
    "run-json": () => {
      const run = current();
      if (!run) return;
      download(`agentcrucible-${run.runId}.json`, runJson(run), "application/json");
      toast(`Exported ${run.runId} as JSON.`, "ok", { ms: 2500 });
    },
  },
};

async function saveReports(run: RunRecord): Promise<void> {
  const saved = await api<{ outDir: string; files: string[] }>("/api/save", { keys: run.results.filter((r) => r.verdict).map((r) => r.key) });
  toast(`Saved ${plural(saved.files.length, "report")} under ${saved.outDir}`, "ok", { action: { label: "View", href: "#/reports" } });
}

async function compareBaseline(run: RunRecord): Promise<void> {
  const comparison = await api<Comparison>("/api/baseline/compare", { keys: run.results.filter((r) => r.verdict).map((r) => r.key) });
  baselineChecks.set(run.runId, comparison);
  toast(comparison.regressions.length ? `${plural(comparison.regressions.length, "regression")} against the baseline.` : "No regressions against the baseline.", comparison.regressions.length ? "bad" : "ok");
  await runtime.rerender();
}

async function replaceBaseline(run: RunRecord): Promise<void> {
  const keys = run.results.filter((r) => r.verdict).map((r) => r.key);
  const ok = !store.prefs.confirm || (await confirmDialog({ title: "Replace the baseline?", body: `${esc(plural(keys.length, "result"))} from ${esc(run.runId)} will be written to <code>${esc(store.meta.baselinePath)}</code> as the new baseline. This replaces the file, and CI compares against it from then on.`, confirm: "Replace baseline", danger: true }));
  if (!ok) return;
  const saved = await api<{ path: string; entries: number }>("/api/baseline/save", { keys });
  baselineChecks.delete(run.runId);
  toast(`Baseline ${saved.path} now has ${plural(saved.entries, "entry", "entries")}.`, "ok", { action: { label: "Open", href: "#/baseline" } });
  await runtime.rerender();
}

export default page;
