/**
 * The saved baseline and how a run compares with it: regressions and new failures at the
 * fail-on threshold decide the CI gate, so the page shows that gate next to the numbers.
 */
import type { BaselineEntry } from "../../../baseline.js";
import { VERDICT_SEVERITY, type Verdict } from "../../../types.js";
import type { Comparison, RunRecord } from "../../api.js";
import { latest, observations, type Observation } from "../lib/analytics.js";
import { absTime, esc, href, num, plural, relTime, withQuery } from "../lib/format.js";
import { runtime } from "../lib/runtime.js";
import { load, store } from "../lib/state.js";
import { icon } from "../icons.js";
import type { Page } from "../routes.js";
import { callout, emptyState, kpi, kpis, metaItem, pageHead, panel } from "../ui/layout.js";
import { toast } from "../ui/overlays.js";
import { button, codeChip, copyButton, field, pill, searchInput, select, tip } from "../ui/primitives.js";
import { compareWithBaseline, gateOf, lastComparison, newFailures, saveAsBaseline, type Gate } from "../ui/results.js";
import { by, dataTable, registerTable, tableState, type Column } from "../ui/table.js";
import { tally, verdictBar, verdictText } from "../ui/verdicts.js";

const ENTRIES = "baseline-entries";
const CHANGES = "baseline-changes";

let chosenRun = "";
let entryQuery = "";
let autoHash = "";
let failure = "";

type Change = Comparison["regressions"][number];

/** One line of a comparison: what kind of change, and the verdicts or rules involved. */
export interface ChangeRow {
  kind: string;
  tone: "bad" | "ok" | "warn" | "";
  scenario: string;
  agent: string;
  /** Escaped HTML. */
  detail: string;
}

const arrow = (c: Change): string => `<span class="bl-arrow">${verdictText(c.before)}${icon("arrowRight", 12)}${verdictText(c.after)}</span>`;

/** The comparison as table rows, worst first: what fails the gate, then everything else. */
export function changeRows(c: Comparison, failOn: Verdict): ChangeRow[] {
  const fresh = newFailures(c, failOn);
  return [
    ...c.regressions.map((x): ChangeRow => ({ kind: "regression", tone: "bad", scenario: x.scenario, agent: x.agent, detail: arrow(x) })),
    ...fresh.map((x): ChangeRow => ({ kind: "new failure", tone: "bad", scenario: x.scenario, agent: x.agent, detail: verdictText(x.verdict) })),
    ...c.incomparable.map((x): ChangeRow => ({ kind: "not comparable", tone: "warn", scenario: x.scenario, agent: x.agent, detail: esc(x.detail) })),
    ...c.improvements.map((x): ChangeRow => ({ kind: "improved", tone: "ok", scenario: x.scenario, agent: x.agent, detail: arrow(x) })),
    ...c.changed.map((x): ChangeRow => ({
      kind: "rules changed",
      tone: "",
      scenario: x.scenario,
      agent: x.agent,
      detail: `<span class="bl-change">${verdictText(x.after)}<span class="bl-rules">${[...x.rulesAdded.map((r) => `<code class="bl-rule add">+${esc(r)}</code>`), ...x.rulesRemoved.map((r) => `<code class="bl-rule del">−${esc(r)}</code>`)].join("")}</span></span>`,
    })),
    ...c.added.filter((x) => !fresh.includes(x)).map((x): ChangeRow => ({ kind: "new", tone: "", scenario: x.scenario, agent: x.agent, detail: verdictText(x.verdict) })),
    ...c.notRun.map((x): ChangeRow => ({ kind: "not run", tone: "", scenario: x.scenario, agent: x.agent, detail: `${verdictText(x.verdict)} <span class="muted small">in the baseline</span>` })),
  ];
}

const changeColumns: Column<ChangeRow>[] = [
  { id: "kind", label: "Change", render: (r) => pill(r.kind, r.tone) },
  { id: "scenario", label: "Scenario", sort: by.text((r) => r.scenario), render: (r) => `<a class="row-link" href="${esc(withQuery("#/reports", { scenario: r.scenario, agent: r.agent }))}">${esc(r.scenario)}</a>` },
  { id: "agent", label: "Agent", sort: by.text((r) => r.agent), render: (r) => `<a class="link-mono" href="${esc(href("agent", r.agent))}">${esc(r.agent)}</a>` },
  { id: "detail", label: "Verdict", render: (r) => r.detail },
];

/** The CI gate for a comparison: what `run --baseline` would exit with, and why. */
export function gateBanner(gate: Gate, failOn: Verdict): string {
  const exit = gate.state === "failing" ? 2 : gate.state === "incomparable" ? 1 : 0;
  const text =
    gate.state === "failing"
      ? `A regression is a verdict more severe than the baseline's. A new failure is a result absent from the baseline at <code>${esc(failOn)}</code> or worse. Either one fails the build; known failures stay green until they get worse.`
      : gate.state === "incomparable"
        ? "Some results ran with another seed or trial count than the baseline, so their verdicts say nothing about it. CI stops with a usage error until you run with the baseline's seed and trials or write a new baseline."
        : `No verdict got more severe, and no new scenario failed at <code>${esc(failOn)}</code> or worse.`;
  const ic = gate.state === "passing" ? "checkCircle" : gate.state === "failing" ? "xCircle" : "alert";
  return `<section class="bl-gate ${gate.state}" aria-label="CI gate">${icon(ic, 22, "lead")}<div class="bl-gate-main"><h2 class="bl-gate-title">${esc(gate.title)}</h2><p class="bl-gate-text">${text}</p></div><span class="bl-gate-exit">CI exits <code>${exit}</code></span></section>`;
}

/** The whole comparison: the gate, the counts, and the changes. */
export function comparisonPanel(c: Comparison, failOn: Verdict, o: { subtitle?: string } = {}): string {
  const gate = gateOf(c, failOn);
  const rows = changeRows(c, failOn);
  const draw = () => dataTable({ id: CHANGES, columns: changeColumns, rows, state: tableState(CHANGES, { dir: "asc" }), plain: rows.length <= 25, cards: true, empty: "" });
  registerTable(CHANGES, draw);
  const fresh = gate.newFailures;
  const strip = kpis(
    [
      kpi({ label: "Regressions", value: c.regressions.length, tone: c.regressions.length ? "bad" : "", sub: "more severe than the baseline" }),
      kpi({ label: "New failures", value: fresh, tone: fresh ? "bad" : "", sub: `new, at ${failOn} or worse` }),
      kpi({ label: "Improved", value: c.improvements.length, tone: c.improvements.length ? "ok" : "", sub: "less severe than the baseline" }),
      kpi({ label: "Unchanged", value: c.unchanged, sub: "same verdict" }),
      kpi({ label: "Rules changed", value: c.changed.length, sub: "same verdict, other rules" }),
      kpi({ label: "New or not run", value: `${c.added.length - fresh + c.notRun.length}`, sub: `${c.added.length - fresh} new · ${c.notRun.length} not run` }),
    ],
    "Comparison with the baseline"
  );
  return `${gateBanner(gate, failOn)}
  <div class="mt-16">${strip}</div>
  ${panel({ title: "Changes", icon: "compare", meta: o.subtitle ?? plural(rows.length, "result"), flush: true }, rows.length ? draw() : emptyState({ icon: "checkCircle", title: "Nothing to list", text: "No result changed, and nothing is new or missing.", compact: true }))}`;
}

function runOptions(runs: RunRecord[]): Array<{ value: string; label: string }> {
  return runs.slice(0, 40).map((r) => ({ value: r.runId, label: `${r.runId} · ${r.label ?? (r.scenarios.length === 1 ? r.scenarios[0] : plural(r.scenarios.length, "scenario"))} · ${relTime(r.startedAt)}` }));
}

const runKeys = (run: RunRecord | undefined): string[] => (run?.results ?? []).filter((r) => !r.error && r.verdict).map((r) => r.key);

function entryTable(entries: BaselineEntry[], now: Map<string, Observation>): string {
  const q = entryQuery.trim().toLowerCase();
  const rows = q ? entries.filter((e) => `${e.scenario} ${e.agent} ${e.verdict} ${e.rules.join(" ")}`.toLowerCase().includes(q)) : entries;
  const columns: Column<BaselineEntry>[] = [
    { id: "scenario", label: "Scenario", sort: by.text((e) => e.scenario), render: (e) => `<a class="row-link" href="${esc(href("scenario", e.scenario))}">${esc(e.scenario)}</a>` },
    { id: "agent", label: "Agent", sort: by.text((e) => e.agent), render: (e) => `<a class="link-mono" href="${esc(href("agent", e.agent))}">${esc(e.agent)}</a>` },
    { id: "verdict", label: "Baseline", sort: (a, b) => VERDICT_SEVERITY[a.verdict] - VERDICT_SEVERITY[b.verdict], render: (e) => verdictText(e.verdict) },
    {
      id: "now",
      label: "Latest result",
      title: "The newest result of this scenario and agent in the history",
      render: (e) => {
        const o = now.get(`${e.scenario}\n${e.agent}`);
        if (!o) return '<span class="muted small">no result</span>';
        const worse = VERDICT_SEVERITY[o.verdict] > VERDICT_SEVERITY[e.verdict];
        const better = VERDICT_SEVERITY[o.verdict] < VERDICT_SEVERITY[e.verdict];
        return `<a class="bl-now" href="${esc(href("report", o.key))}">${verdictText(o.verdict)}</a>${worse ? ` <span class="bad-text small">${icon("arrowUp", 11)}worse</span>` : better ? ` <span class="ok-text small">${icon("arrowDown", 11)}better</span>` : ""}`;
      },
    },
    { id: "trials", label: "Trials", num: true, sort: by.num((e) => e.trials), render: (e) => num(e.trials) },
    { id: "seed", label: "Seed", render: (e) => `<code class="bl-seed"${tip(e.seed)}>${esc(e.seed)}</code>` },
    { id: "rules", label: "Deciding rules", render: (e) => (e.rules.length ? `<span class="bl-rules">${e.rules.map((r) => codeChip(r)).join("")}</span>` : '<span class="faint">—</span>') },
  ];
  const empty = emptyState({ icon: "search", title: "No entry matches", text: "Clear the search to see every entry.", actions: button("Clear the search", { action: "clear-entries", size: "sm" }), compact: true });
  const draw = () => dataTable({ id: ENTRIES, columns, rows, state: tableState(ENTRIES, { sort: "scenario", dir: "asc" }), cards: true, flush: true, empty });
  registerTable(ENTRIES, draw);
  return draw();
}

function ciPanel(path: string): string {
  const file = path.split(/[\\/]/).pop() ?? path;
  const command = `npx agentcrucible run --tag smoke --agent ./agents/my-agent.mjs --baseline ${file} --out reports`;
  return panel(
    { title: "In CI", icon: "terminal", meta: "fails on regressions and new failures only" },
    `<div class="rd-cmd"><code${tip(command)}>${esc(command)}</code>${copyButton(command, "Copy the command", { iconOnly: true })}</div><p class="muted small rd-note">Exit 0 means no verdict got worse, exit 2 means a regression or a new failure, and exit 1 means the run could not be compared. <a class="link" href="#/settings/integrations">Set up the GitHub Action</a>.</p>`
  );
}

async function compareRun(run: RunRecord, el?: HTMLElement | null): Promise<void> {
  failure = "";
  try {
    await compareWithBaseline(runKeys(run), { label: `${run.runId}${run.label ? ` · ${run.label}` : ""}`, runId: run.runId, el });
  } catch (err) {
    failure = (err as Error).message;
    toast(failure, "bad", { title: "The comparison failed" });
  }
}

const page: Page = {
  nav: "baseline",
  title: () => "Baseline",
  skeleton: "dashboard",
  watches: ["baseline", "runs"],
  async render(ctx) {
    const [info] = await Promise.all([load.baseline(true).catch((err: Error) => ({ path: store.meta.baselinePath, baseline: null, error: err.message })), load.runs(), load.reports().catch(() => undefined)]);
    const baseline = info?.baseline ?? null;
    const failOn = store.meta.failOn;
    const runs = store.runs.filter((r) => !r.draft && runKeys(r).length);
    const want = ctx.query.get("compare");
    if (want && location.hash !== autoHash) {
      autoHash = location.hash;
      const target = want === "latest" ? runs[0] : runs.find((r) => r.runId === want);
      if (target) {
        chosenRun = target.runId;
        if (baseline && lastComparison()?.runId !== target.runId) await compareRun(target);
      }
    }
    if (!runs.some((r) => r.runId === chosenRun)) chosenRun = runs[0]?.runId ?? "";
    const run = runs.find((r) => r.runId === chosenRun);
    const last = lastComparison();
    const file = (info?.path ?? "").split(/[\\/]/).pop();
    const head = pageHead({
      eyebrow: `${icon("compare", 11)}CI gate`,
      title: "Baseline",
      desc: `The verdicts CI holds every run against. A build fails only when a verdict gets worse or a scenario that is not in the baseline fails at <code>${esc(failOn)}</code> or above; failures already recorded stay known failures.`,
      meta: [
        metaItem("file", `<code>${esc(info?.path ?? "")}</code>`, info?.path),
        baseline ? metaItem("list", `<b class="fg">${plural(baseline.entries.length, "entry", "entries")}</b>`) : "No baseline saved",
        baseline ? metaItem("cube", `Written by AgentCrucible ${esc(baseline.toolVersion)}`) : "",
        metaItem("shield", `Fail on <code>${esc(failOn)}</code>`, "The fail-on threshold new results are held to"),
      ].filter(Boolean),
      actions: `${button("Reports", { href: "#/reports", icon: "file" })}${button("Compare with the latest run", { action: "compare-latest", icon: "compare", kind: "primary", disabled: !baseline || !runs.length, title: baseline ? "Check the newest run against the baseline" : "Save a baseline first" })}`,
    });

    if (!baseline) {
      return `<div class="page">${head}${info?.error ? callout("bad", esc(info.error), { title: "The baseline file cannot be read" }) : ""}${panel(
        {},
        emptyState({
          icon: "compare",
          title: "No baseline yet",
          text: `A baseline records the verdict of each scenario and agent you choose. CI then fails only when a verdict gets worse, or when a new scenario fails at <code>${esc(failOn)}</code> or above. Save the results of a run as the baseline, or select results on the Reports page.`,
          actions: `${runs.length ? button("Use the latest run", { action: "baseline-run", icon: "save", kind: "primary", data: { run: runs[0].runId } }) : ""}${button("Choose on the Reports page", { href: "#/reports", icon: "file" })}`,
        })
      )}<div class="mt-16">${ciPanel(info?.path ?? "agentcrucible-baseline.json")}</div></div>`;
    }

    const now = new Map(latest(observations(store.runs, store.saved)).map((o) => [`${o.scenarioId}\n${o.agentId}`, o]));
    const picker = runs.length
      ? `<div class="bl-pick">${field("Run to compare", select({ input: "bl-run", value: chosenRun, label: "Run to compare", options: runOptions(runs), width: "min(480px, 100%)" }))}${button("Compare", { action: "compare-chosen", icon: "compare", kind: "primary", title: "Check this run's results against the baseline" })}${button("Make it the baseline", { action: "baseline-chosen", icon: "save", title: `Replace ${file} with this run's results` })}</div>`
      : emptyState({ icon: "runs", title: "No run to compare", text: "Start a run, then compare it with the baseline here.", actions: button("Start a run", { href: "#/launch", kind: "primary", icon: "play", size: "sm" }), compact: true });
    const comparison = last
      ? `<div class="mt-16"><p class="muted small bl-when">Compared ${esc(last.label)} <span${tip(absTime(last.at))}>${esc(relTime(last.at))}</span></p>${comparisonPanel(last.comparison, failOn, { subtitle: last.label })}</div>`
      : "";
    return `<div class="page">
  ${head}
  ${info?.error ? callout("bad", esc(info.error), { title: "The baseline file cannot be read" }) : ""}
  ${failure ? callout("bad", esc(failure), { title: "The comparison failed" }) : ""}
  ${panel({ title: "Compare a run", icon: "compare", meta: run ? `${plural(runKeys(run).length, "result")} in ${esc(run.runId)}` : "" }, picker)}
  ${comparison}
  <div class="mt-16">${panel(
    { title: "Entries", icon: "list", meta: plural(baseline.entries.length, "entry", "entries"), flush: true, actions: `<div style="width:170px">${verdictBar(tally(baseline.entries), { size: "sm" })}</div>${searchInput({ id: "entry-q", value: entryQuery, placeholder: "Search entries", width: "200px" })}` },
    `<div id="bl-entries">${entryTable(baseline.entries, now)}</div>`
  )}</div>
  <div class="mt-16">${ciPanel(info?.path ?? "")}</div>
</div>`;
  },
  actions: {
    "compare-latest": async (el) => {
      const run = store.runs.find((r) => !r.draft && runKeys(r).length);
      if (!run) return;
      chosenRun = run.runId;
      await compareRun(run, el);
      await runtime.rerender();
    },
    "compare-chosen": async (el) => {
      const run = store.runs.find((r) => r.runId === chosenRun);
      if (!run) return;
      await compareRun(run, el);
      await runtime.rerender();
    },
    "baseline-chosen": async (el) => {
      if (await saveAsBaseline(runKeys(store.runs.find((r) => r.runId === chosenRun)), { el })) await runtime.rerender();
    },
    "baseline-run": async (el) => {
      if (await saveAsBaseline(runKeys(store.runs.find((r) => r.runId === el.dataset.run)), { el })) await runtime.rerender();
    },
    "clear-entries": () => {
      entryQuery = "";
      return runtime.rerender();
    },
  },
  inputs: {
    "bl-run": (el) => {
      chosenRun = el.value;
    },
    "entry-q": (el) => {
      entryQuery = el.value;
      const baseline = store.baseline?.baseline;
      const target = document.getElementById("bl-entries");
      if (!baseline || !target) return;
      const now = new Map(latest(observations(store.runs, store.saved)).map((o) => [`${o.scenarioId}\n${o.agentId}`, o]));
      target.innerHTML = entryTable(baseline.entries, now);
    },
  },
};

export default page;
