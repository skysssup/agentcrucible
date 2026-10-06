/**
 * One report: why it got its verdict and the evidence for it, a call-by-call timeline with an
 * inspector, the world state after every call, and the raw JSON. The header replays the recorded
 * calls, downloads the JSON, opens the standalone HTML report, and saves an unsaved result.
 */
import type { Regeneration, ReportSummary, RunRecord } from "../../api.js";
import { callState, describeBudget, describeFault, describeOutcome, describeUsage, expectParts, worstTrial } from "../../../describe.js";
import { highlightJson } from "../../../html.js";
import type { ReplayResult } from "../../../replay.js";
import type { GradedTrial, ModelUsage, RunReport, ToolCallRecord, Verdict } from "../../../types.js";
import { adviceFor } from "../lib/analytics.js";
import { api, ApiError, sessionToken } from "../lib/api.js";
import { copy, download } from "../lib/dom.js";
import { absTime, bytes, clip, duration, esc, href, pct, plural, relTime, runCommand, shellQuote, withQuery } from "../lib/format.js";
import { patch, runtime } from "../lib/runtime.js";
import { findResult, load, remember, runOf, store } from "../lib/state.js";
import { icon } from "../icons.js";
import type { Page } from "../routes.js";
import { codeView } from "../ui/code.js";
import { callout, emptyState, facts, metaItem, pageHead, panel } from "../ui/layout.js";
import { openMenu, toast } from "../ui/overlays.js";
import { button, codeChip, copyButton, faultTag, iconButton, kbd, searchInput, segmented, tabs, tip, worldIcon } from "../ui/primitives.js";
import { canDelete, canSave, deleteReports, saveReports, sourceKind, withBusy } from "../ui/results.js";
import { dataTable, tableState, type Column } from "../ui/table.js";
import { badge, stageLabel, tallyOf, verdictBar, verdictCode, verdictLegend, verdictText, VERDICT_META } from "../ui/verdicts.js";

type Tab = "summary" | "timeline" | "state" | "raw";
type CallFilter = "all" | "faulted" | "failed" | "cited";
type Loaded = RunReport & { regeneration?: Regeneration };

/** A replay result as the page reads it. */
export type ReplayView = Pick<ReplayResult, "reproduced"> & { trials: Array<Pick<ReplayResult["trials"][number], "trialIndex" | "replayedCalls" | "reproduced" | "recordedVerdict" | "verdict" | "divergence">> };

interface View {
  key: string;
  report: Loaded;
  /** The trial the tabs show; the worst trial until another is chosen. */
  trial: GradedTrial;
  worst: GradedTrial;
  summary?: ReportSummary;
  run?: RunRecord;
  sweep?: { sweepId: string; label: string };
  /** The saved file of this result: its own file, or a saved copy of the same result. */
  file?: string;
}

const TABS: Tab[] = ["summary", "timeline", "state", "raw"];
/** The raw tab highlights this much of the JSON; the download has all of it. */
const RAW_LIMIT = 600_000;

let shownKey = "";
let appliedHash = "";
let trialIndex = 0;
let selected: string | undefined;
let callFilter: CallFilter = "all";
let callQuery = "";
let expanded = false;
let step: number | undefined;
let stateMode: "table" | "json" = "table";
let lastG = 0;
let view: View | undefined;
let media: MediaQueryList | undefined;
const relayout = () => void runtime.rerender();
const replays = new Map<string, ReplayView>();

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const json = (v: unknown) => JSON.stringify(v, null, 2) ?? "undefined";

/** Call ids that some finding of the trial cites as evidence. */
export function citedCalls(trial: GradedTrial): Set<string> {
  return new Set(trial.findings.flatMap((f) => f.evidence.flatMap((e) => e.callIds ?? [])));
}

const haystacks = new WeakMap<ToolCallRecord, string>();

function callText(c: ToolCallRecord): string {
  let text = haystacks.get(c);
  if (text === undefined) {
    text = [c.id, `${c.tool}#${c.callIndex}`, callState(c), c.faultApplied ?? "", JSON.stringify(c.args), c.observed.ok ? JSON.stringify(c.observed.result) : `${c.observed.code ?? ""} ${c.observed.error}`, ...c.changes].join("\n").toLowerCase();
    haystacks.set(c, text);
  }
  return text;
}

/** The calls a filter and a search keep: calls with a fault, calls where the agent saw an error, or calls a finding cites. */
export function filterCalls(calls: ToolCallRecord[], cited: Set<string>, filter: CallFilter, q: string): ToolCallRecord[] {
  const needle = q.trim().toLowerCase();
  return calls.filter((c) => {
    if (filter === "faulted" && !c.faultApplied) return false;
    if (filter === "failed" && c.observed.ok) return false;
    if (filter === "cited" && !cited.has(c.id)) return false;
    return !needle || callText(c).includes(needle);
  });
}

/** A link to a call in the timeline of a trial. */
export function timelineHref(key: string, trial: number, callId?: string): string {
  return withQuery(href("report", key), { tab: "timeline", trial, call: callId });
}

function tabHref(key: string, tab: Tab, extra: Record<string, string | number | undefined> = {}): string {
  return withQuery(href("report", key), { tab: tab === "summary" ? undefined : tab, ...extra });
}

/** The commands that reproduce the report: the run, and the replay of a saved file. */
export function reproduceCommands(report: RunReport, file?: string): string[] {
  return [runCommand(report.scenarioId, [report.agentId], report.stats.total, report.seed), ...(file ? [`npx agentcrucible replay ${shellQuote(file)}`] : [])];
}

/** Each trial of a replay in one line: reproduced, diverged at a call, or graded differently. */
export function replayPanel(r: ReplayView): string {
  const lines = r.trials.map((t) =>
    t.divergence
      ? `trial ${t.trialIndex}: diverged at ${t.divergence.at} (${t.divergence.field})`
      : t.reproduced
        ? `trial ${t.trialIndex}: ${plural(t.replayedCalls, "call")} replayed identically; ${t.verdict} as recorded`
        : `trial ${t.trialIndex}: graded ${t.verdict}, recorded ${t.recordedVerdict}`
  );
  return callout(r.reproduced ? "ok" : "bad", `<ul class="rd-lines">${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`, {
    title: r.reproduced ? "Reproduced: every call, state, and verdict matches the report." : "Not reproduced: the recorded calls no longer produce the recorded states and verdicts.",
    icon: r.reproduced ? "checkCircle" : "xCircle",
    actions: button("Dismiss", { action: "dismiss-replay", kind: "ghost", size: "sm" }),
  });
}

/** Why a report of the history looks the way it does: it was run again from its seed, and may differ from what was recorded. */
export function regenerationCallout(reg: Regeneration, o: { verdict: Verdict; run?: Pick<RunRecord, "runId" | "label" | "version" | "startedAt"> }): string {
  const when = o.run ? `on ${absTime(o.run.startedAt)}` : "earlier";
  const runLink = o.run ? `<a class="link" href="${esc(href("run", o.run.runId))}">${esc(o.run.runId)}</a>${o.run.label ? ` (${esc(o.run.label)})` : ""}` : "an earlier session";
  const changed = reg.scenarioChanged ? " The scenario file changed since then, so this report follows the current file." : "";
  if (reg.matches)
    return callout("info", `The history keeps a summary of each result, not its timeline, so this report was rebuilt by running the same scenario, agent, seed, and trials again. It reproduced the verdict ${esc(o.verdict)} recorded in ${runLink} ${esc(when)}.${esc(changed)}`, { title: "Regenerated from the history", icon: "history" });
  const version = o.run?.version ? ` That run used agent version v${esc(o.run.version)}; regenerating runs today's agent.` : "";
  return callout(
    "warn",
    `${runLink} recorded <code>${esc(reg.recordedVerdict ?? "another verdict")}</code> ${esc(when)}. Running the same scenario, seed, and trials now gives <code>${esc(o.verdict)}</code>, so the timeline below is today's run, not the recorded one.${version}${esc(changed)}`,
    { title: "Regenerated from the history: the verdict differs from the recorded one", icon: "history" }
  );
}

/** Whether the result differs from the verdict its scenario lists for the agent. */
function expectedOf(v: Pick<View, "report" | "summary">): Verdict | null {
  return v.summary?.expected ?? v.report.scenario.expectedVerdicts[v.report.agentId] ?? null;
}

function identityOf(r: Pick<ReportSummary, "scenarioId" | "agentId" | "seed" | "trials" | "finishedAt">): string {
  return [r.scenarioId, r.agentId, r.seed, r.trials, r.finishedAt].join("\n");
}

function sweepOf(key: string): View["sweep"] {
  const [kind, id, index] = key.split(":");
  const label = (s: { steps: Array<{ tool: string; callIndex: number }>; cells: Array<{ kind: string; step: number; key?: string }> }, cell?: { kind: string; step: number }) => {
    if (!cell) return "run without faults";
    const st = s.steps[cell.step - 1];
    return `${cell.kind} at ${st ? `${st.tool}#${st.callIndex}` : `step ${cell.step}`}`;
  };
  if (kind === "sweep") {
    const s = store.sweepDetails.get(id);
    return { sweepId: id, label: s ? label(s, index === "base" ? undefined : s.cells[Number(index)]) : index === "base" ? "run without faults" : `cell ${Number(index) + 1}` };
  }
  for (const s of store.sweepDetails.values()) {
    if (s.baselineKey === key) return { sweepId: s.sweepId, label: "run without faults" };
    const cell = s.cells.find((c) => c.key === key);
    if (cell) return { sweepId: s.sweepId, label: label(s, cell) };
  }
  const listed = store.sweeps.find((s) => s.baselineKey === key);
  return listed ? { sweepId: listed.sweepId, label: "run without faults" } : undefined;
}

function sourceMeta(v: View): string {
  const kind = sourceKind(v.key);
  if (v.sweep) return metaItem("grid", `Sweep <a class="link" href="${esc(href("sweep", v.sweep.sweepId))}">${esc(v.sweep.sweepId)}</a> · ${esc(v.sweep.label)}`);
  if (kind === "saved") return metaItem("file", `<code>${esc(v.file ?? v.key.slice(5))}</code>`, `${store.outDir}/${v.file ?? v.key.slice(5)}`);
  const run = v.run ? ` · <a class="link" href="${esc(href("run", v.run.runId))}"${tip(`${v.run.label ?? v.run.runId}${v.run.version ? ` · v${v.run.version}` : ""} · started ${absTime(v.run.startedAt)}`)}>${esc(v.run.runId)}</a>` : "";
  if (kind === "session") return metaItem("clock", `${v.file ? `Saved as <code>${esc(v.file)}</code>` : "This session, unsaved"}${run}`);
  return metaItem("history", `History${run}${v.run?.version ? ` · v${esc(v.run.version)}` : ""}${v.file ? ` · saved as <code>${esc(v.file)}</code>` : ""}`);
}

function htmlUrl(key: string): string {
  const theme = store.prefs.theme === "light" || store.prefs.theme === "dark" ? `&theme=${store.prefs.theme}` : "";
  return `/report-view?key=${encodeURIComponent(key)}&token=${encodeURIComponent(sessionToken())}${theme}`;
}

function head(v: View): string {
  const r = v.report;
  const command = reproduceCommands(r)[0];
  const unsaved = canSave(v.key) && !v.sweep && !v.file;
  return pageHead({
    eyebrow: `${icon("file", 11)}Report`,
    title: r.scenarioId,
    mono: true,
    titleExtra: badge(r.aggregateVerdict),
    desc: esc(clip(r.scenario.description || r.scenario.task, 260)),
    meta: [
      metaItem("bot", `<a class="link" href="${esc(href("agent", r.agentId))}">${esc(r.agentId)}</a>`, "agent"),
      `${r.worlds.map((w) => `<span class="rd-world">${worldIcon(w, 13)}${esc(w)}</span>`).join("")}`,
      metaItem("hash", `<code>${esc(r.seed)}</code>`, "seed"),
      metaItem("repeat", plural(r.stats.total, "trial")),
      sourceMeta(v),
      metaItem("timer", esc(duration(r.durationMs)), `Started ${absTime(r.startedAt)}, finished ${absTime(r.finishedAt)}`),
      metaItem("cube", `AgentCrucible ${esc(r.toolVersion)}`),
    ],
    actions: `${iconButton("moreH", "More actions", { action: "more" })}${button("Copy command", { action: "copy", icon: "terminal", data: { copy: command }, title: command })}${button("JSON", { action: "download-json", icon: "download", title: "Download the JSON report" })}${button("HTML", { href: htmlUrl(v.key), icon: "external", attrs: 'target="_blank" rel="noopener"', title: "Open the standalone HTML report in a new tab" })}${button("Replay", { action: "replay", icon: "replay", kind: unsaved ? "secondary" : "primary", title: "Re-execute the recorded tool calls without the agent and confirm every state and verdict" })}${unsaved ? button("Save as report", { action: "save", kind: "primary", icon: "save", title: `Write the JSON, HTML, and JUnit files under ${store.outDir}` }) : ""}`,
  });
}

function callouts(v: View): string {
  const r = v.report;
  const out: string[] = [];
  const replay = replays.get(v.key);
  if (replay) out.push(replayPanel(replay));
  const expected = expectedOf(v);
  if (expected && expected !== r.aggregateVerdict)
    out.push(
      callout("bad", `The scenario's <code>expected_verdicts</code> lists <code>${esc(expected)}</code> for ${esc(r.agentId)}; this result got <code>${esc(r.aggregateVerdict)}</code>. ${esc(VERDICT_META[r.aggregateVerdict].meaning)}`, {
        title: "The verdict differs from the expected one",
        actions: button("Other results", { href: withQuery("#/reports", { scenario: r.scenarioId, agent: r.agentId }), size: "sm", iconEnd: "arrowRight" }),
      })
    );
  if (r.regeneration) out.push(regenerationCallout(r.regeneration, { verdict: r.aggregateVerdict, run: v.run }));
  return out.length ? `<div class="rd-callouts">${out.join("")}</div>` : "";
}

function trialLabel(t: GradedTrial): string {
  return `Trial ${t.trace.trialIndex}`;
}

function trialPicker(v: View, o: { compact?: boolean } = {}): string {
  const trials = v.report.trials;
  if (trials.length < 2) return "";
  if (trials.length > 16)
    return `<label class="rd-trial-select"><span class="eyebrow">Trial</span><select class="input" data-input="trial" aria-label="Trial">${trials.map((t) => `<option value="${t.trace.trialIndex}"${t === v.trial ? " selected" : ""}>${esc(`${trialLabel(t)} · ${t.verdict}${t === v.worst ? " · worst" : ""}`)}</option>`).join("")}</select></label>`;
  return `<div class="rd-trialbar${o.compact ? " compact" : ""}" role="group" aria-label="Trial"><span class="eyebrow">Trial</span>${trials
    .map((t) => `<button type="button" class="rd-tchip ${esc(t.verdict)}${t === v.trial ? " on" : ""}" data-action="trial" data-value="${t.trace.trialIndex}" aria-pressed="${t === v.trial}"${tip(`${trialLabel(t)}: ${t.verdict}${t === v.worst ? " (the first trial with the aggregate verdict)" : ""}. ${clip(t.reason, 140)}`)}><span class="vdot ${esc(t.verdict)}"></span>${t.trace.trialIndex}</button>`)
    .join("")}</div>`;
}

function callRef(v: View, id: string): string {
  return `<a class="rd-callref" href="${esc(timelineHref(v.key, v.trial.trace.trialIndex, id))}"${tip(`Open ${id} in the timeline`)}>${esc(id)}</a>`;
}

function changeLine(text: string): string {
  const cls = text.startsWith("~") ? "chg" : text.startsWith("-") ? "del" : "add";
  return `<span class="rd-change ${cls}">${esc(text)}</span>`;
}

function whyPanel(v: View): string {
  const r = v.report;
  const decider = v.worst.findings[0];
  const advice = decider ? adviceFor(decider.rule) : undefined;
  return `<section class="panel rd-why ${esc(r.aggregateVerdict)}" aria-labelledby="rd-why-title">
  <div class="rd-why-head"><h2 class="eyebrow" id="rd-why-title">${icon(VERDICT_META[r.aggregateVerdict].icon, 12)}Why this verdict</h2>${badge(r.aggregateVerdict)}${r.trials.length > 1 ? `<span class="muted small">from ${esc(trialLabel(v.worst).toLowerCase())}, the first trial with this verdict</span>` : ""}</div>
  <p class="rd-why-reason">${esc(v.worst.reason)}</p>
  ${decider ? `<div class="rd-why-rule"><span class="label">Deciding rule</span>${codeChip(decider.rule)}${advice ? `<span class="rd-topic">${esc(advice.topic)}</span>` : ""}</div>` : ""}
  ${advice ? `<p class="rd-advice">${icon("lightbulb", 13)}<span>${esc(advice.advice)}</span></p>` : ""}
  <p class="rd-meaning"><b>${esc(VERDICT_META[r.aggregateVerdict].label)}.</b> ${esc(VERDICT_META[r.aggregateVerdict].meaning)}</p>
</section>`;
}

function findingsPanel(v: View): string {
  const t = v.trial;
  const body = t.findings.length
    ? `<ol class="rd-findings">${t.findings
        .map(
          (f, i) => `<li class="rd-finding ${esc(f.verdict)}"><div class="rd-finding-head">${verdictText(f.verdict)}${codeChip(f.rule)}${i === 0 ? '<span class="pill outline">decides the verdict</span>' : ""}</div><p>${esc(f.reason)}</p>${
            f.evidence.length ? `<ul class="rd-evidence">${f.evidence.map((e) => `<li><span class="rd-ev-kind">${esc(e.kind.replace(/_/g, " "))}</span><span class="rd-ev-text">${esc(e.summary)}</span>${(e.callIds ?? []).map((id) => callRef(v, id)).join("")}</li>`).join("")}</ul>` : ""
          }</li>`
        )
        .join("")}</ol>`
    : emptyState({ icon: "checkCircle", title: "No findings", text: "No rule fired in this trial.", compact: true });
  return panel({ title: "Findings", icon: "target", meta: `${plural(t.findings.length, "finding")}${v.report.trials.length > 1 ? ` · ${esc(trialLabel(t).toLowerCase())}` : ""}`, flush: true }, body);
}

const ASSERTION_CLS: Record<string, string> = { pass: "ok", missing: "missing", contradicted: "err", ambiguous: "missing", invalid: "err" };

function outcomePanel(v: View): string {
  const o = v.trial.outcome;
  const status = o.status === "met" ? '<span class="chip ok">met</span>' : o.status === "not_met" ? '<span class="chip err">not met</span>' : '<span class="chip">not checked</span>';
  return panel(
    { title: "Outcome check", icon: "checkSquare", meta: esc(describeOutcome(v.trial)) },
    `<div class="rd-outcome-line">${status}${o.path && o.path !== "expected" ? codeChip(o.path, "the outcome the committed state matched, or the closest one") : ""}<span>${esc(o.summary || (o.status === "unchecked" ? "The scenario declares no expectations, so task completion is not checked." : ""))}</span></div>
    ${o.assertions.length ? `<ul class="rd-assertions">${o.assertions.map((a) => `<li><span class="chip ${ASSERTION_CLS[a.status] ?? ""}">${esc(a.status)}</span><span class="rd-assert"><b>${esc(a.assertion)}</b><span class="muted">${esc(a.detail)}</span></span></li>`).join("")}</ul>` : ""}`
  );
}

/** What the agent said beside what the services committed: the two sides every claim is graded against. */
function claimPanel(v: View): string {
  const t = v.trial;
  const effects = t.effects;
  const output = t.trace.finalOutput === undefined ? "" : `<h3 class="rd-sub">Structured output</h3><pre class="rd-json">${highlightJson(json(t.trace.finalOutput))}</pre>`;
  return panel(
    { title: "What the agent said and what was committed", icon: "scale", meta: "the verdict compares these two" },
    `<div class="rd-pair">
      <section><h3 class="rd-sub">The agent said</h3><blockquote class="rd-answer">${t.trace.finalAnswer ? esc(t.trace.finalAnswer) : '<span class="muted">The agent returned no answer.</span>'}</blockquote>${output}</section>
      <section><h3 class="rd-sub">The services committed</h3>${
        effects.length
          ? `<ul class="rd-effects">${effects.map((e) => `<li>${changeLine(e.summary)}<span class="rd-refs">${e.callIds.map((id) => callRef(v, id)).join("")}</span></li>`).join("")}</ul>`
          : `<p class="muted small rd-none">Nothing. The world's state at the end equals its state at the start.</p>`
      }</section>
    </div>`
  );
}

function trialsPanel(v: View): string {
  const r = v.report;
  const s = r.stats;
  const split = tallyOf(s.byVerdict);
  const flaky = split.length > 1;
  return panel(
    { title: "Trial statistics", icon: "repeat", meta: plural(s.total, "trial") },
    `${verdictBar(split, { size: "lg" })}${verdictLegend(split)}
    ${facts([
      ["Flaky", flaky ? `<span class="warn-text">Yes</span> · ${esc(pct(s.flakyRate, 1))} of trials differ from the most common verdict` : `No · ${s.total > 1 ? "every trial got the same verdict" : "a single trial"}`],
      ["Most common", verdictText(s.modeVerdict)],
      ["Faults fired", `${s.trialsWithFault} of ${plural(s.total, "trial")}${r.faults.length ? "" : ' <span class="muted">(no faults scheduled)</span>'}`],
      ["Critical rate", `<span${tip("Wilson 95% lower bound of the share of HARMFUL_ACTION or SILENT_FAILURE trials")}>at least ${esc(pct(s.criticalRateLower95, 1, s.criticalRateLower95 > 0 && s.criticalRateLower95 < 0.1 ? 1 : 0))}</span> <span class="muted">(95% lower bound)</span>`],
    ])}
    ${
      r.trials.length > 1
        ? `<ol class="rd-trials">${r.trials
            .map((t) => `<li><button type="button" class="rd-trial${t === v.trial ? " on" : ""}" data-action="trial" data-value="${t.trace.trialIndex}" aria-pressed="${t === v.trial}">${verdictCode(t.verdict, t.verdict)}<span class="rd-trial-name">${esc(trialLabel(t))}</span><span class="rd-trial-reason"${tip(t.reason)}>${esc(t.reason)}</span></button></li>`)
            .join("")}</ol>`
        : ""
    }`
  );
}

function scenarioPanel(v: View): string {
  const r = v.report;
  const s = r.scenario;
  const budget = describeBudget(r);
  return panel(
    { title: "Scenario", icon: "layers", actions: `<a class="link-quiet" href="${esc(href("scenario", r.scenarioId))}">Open ${icon("arrowRight", 12)}</a>` },
    facts([
      ["Task", esc(s.task)],
      ["Faults", r.faults.length ? `<span class="chip-row">${r.faults.map((f) => faultTag(describeFault(f))).join("")}</span>` : '<span class="muted">none</span>'],
      budget ? ["Budget", esc(budget)] : false,
      ["Expect", `<ul class="rd-expect">${expectParts(r).map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`],
      ["Expected", expectedOf(v) ? verdictText(expectedOf(v)!) : '<span class="muted">not listed for this agent</span>'],
      s.tags.length ? ["Tags", s.tags.map((t) => `<span class="code-chip">${esc(t)}</span>`).join(" ")] : false,
    ])
  );
}

function reproducePanel(v: View): string {
  const file = sourceKind(v.key) === "saved" ? `${store.outDir.replace(/[\\/]+$/, "")}/${v.key.slice(5)}` : v.file ? `${store.outDir.replace(/[\\/]+$/, "")}/${v.file}` : undefined;
  return panel(
    { title: "Reproduce", icon: "terminal" },
    `<div class="rd-cmds">${reproduceCommands(v.report, file)
      .map((c) => `<div class="rd-cmd"><code${tip(c)}>${esc(c)}</code>${copyButton(c, "Copy", { iconOnly: true })}</div>`)
      .join("")}</div><p class="muted small rd-note">The seed fixes where faults land, so the same command gives the same verdicts.${file ? " Replay re-executes the saved calls without the agent." : ""}</p>`
  );
}

function usagePanel(v: View): string {
  const used = v.report.trials.filter((t) => t.trace.usage);
  if (!used.length) return "";
  const total = used.reduce<ModelUsage>((sum, t) => ({ requests: sum.requests + t.trace.usage!.requests, inputTokens: sum.inputTokens + t.trace.usage!.inputTokens, outputTokens: sum.outputTokens + t.trace.usage!.outputTokens, latencyMs: sum.latencyMs + t.trace.usage!.latencyMs, recorded: sum.recorded + t.trace.usage!.recorded }), { requests: 0, inputTokens: 0, outputTokens: 0, latencyMs: 0, recorded: 0 });
  return panel(
    { title: "Model usage", icon: "cpu" },
    facts([["All trials", esc(describeUsage(total))], ...used.map((t): [string, string] => [trialLabel(t), esc(describeUsage(t.trace.usage!))])])
  );
}

function summaryTab(v: View): string {
  const warnings = v.report.warnings.length ? callout("warn", `<ul class="rd-lines">${v.report.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`, { title: plural(v.report.warnings.length, "warning"), icon: "alert" }) : "";
  return `<div class="grid g-main-side">
  <div class="stack">${whyPanel(v)}${warnings}${trialPicker(v)}${claimPanel(v)}${findingsPanel(v)}${outcomePanel(v)}</div>
  <div class="stack">${trialsPanel(v)}${scenarioPanel(v)}${reproducePanel(v)}${usagePanel(v)}</div>
</div>`;
}

function stateChip(c: ToolCallRecord): string {
  const state = callState(c);
  const cls = state === "committed" ? "rd-st committed" : state === "read" ? "rd-st" : state === "deduplicated" ? "rd-st dedup" : "rd-st off";
  return `<span class="${cls}">${esc(state)}</span>`;
}

function faultDef(kind: string): { stage: string; description: string } | undefined {
  return store.meta.faults.find((f) => f.kind === kind);
}

function callRow(v: View, c: ToolCallRecord, cited: Set<string>, inline: string): string {
  const on = c.id === selected;
  const cls = ["tl-call", on ? "on" : "", c.faultApplied ? "faulted" : "", c.observed.ok ? "" : "failed", cited.has(c.id) ? "cited" : "", c.mutating && c.committed ? "committed" : ""].filter(Boolean).join(" ");
  const error = c.observed.ok ? "" : (c.observed.code ?? "error");
  return `<li class="${cls}" data-call="${esc(c.id)}"><button type="button" class="tl-row" data-action="tl-select" data-call="${esc(c.id)}" aria-pressed="${on}" aria-controls="tl-inspector">
  <span class="tl-node" aria-hidden="true"></span><span class="tl-seq">${c.seq}</span>
  <span class="tl-main"><span class="tl-tool"><code>${esc(c.tool)}</code><span class="tl-n">#${c.callIndex}</span></span><span class="tl-sub">${stateChip(c)}${c.changes.length ? `<span class="tl-changes">${plural(c.changes.length, "change")}</span>` : ""}</span></span>
  <span class="tl-marks">${c.faultApplied ? `<span class="tl-fault"${tip(`Fault: ${c.faultApplied}`)}>${icon("zap", 11)}<span>${esc(c.faultApplied)}</span></span>` : ""}${c.observed.ok ? '<span class="tl-ok">ok</span>' : `<span class="tl-err"${tip(c.observed.ok ? "" : c.observed.error)}>${esc(error)}</span>`}${cited.has(c.id) ? `<span class="tl-cite"${tip("Cited as evidence by a finding")}>${icon("target", 12)}<span class="sr-only">cited as evidence</span></span>` : ""}</span>
</button>${inline ? `<div class="tl-inline">${inline}</div>` : ""}</li>`;
}

function inspector(v: View, c: ToolCallRecord): string {
  const findings = v.trial.findings.filter((f) => f.evidence.some((e) => e.callIds?.includes(c.id)));
  const def = c.faultApplied ? faultDef(c.faultApplied) : undefined;
  const masked = c.mutating && c.committed && !c.observed.ok;
  const saw = c.observed.ok ? `<pre class="rd-json">${highlightJson(json(c.observed.result))}</pre>` : `<pre class="rd-json rd-err"><b>${esc(c.observed.code ?? "error")}</b>: ${esc(c.observed.error)}</pre>`;
  const returned = c.committed ? `<pre class="rd-json">${highlightJson(json(c.committedResult))}</pre>` : `<p class="muted small rd-none">The call did not run${c.budgetExceeded ? ": the scenario's call budget was used up" : ""}.</p>`;
  const stepIndex = v.trial.trace.calls.indexOf(c) + 1;
  return `<div class="tl-insp-head"><span class="tl-seq">${c.seq}</span><div class="grow"><div class="tl-insp-title"><code>${esc(c.tool)}</code><span class="tl-n">#${c.callIndex}</span>${stateChip(c)}${c.mutating ? '<span class="rd-st off" title="This tool can change durable state">writes</span>' : ""}</div><span class="muted small">${esc(c.id)}${findings.length ? ` · cited by ${plural(findings.length, "finding")}` : ""}</span></div>
  <a class="btn btn-ghost btn-sm" href="${esc(tabHref(v.key, "state", { trial: v.trial.trace.trialIndex, step: stepIndex }))}" title="See the world state after this call">${icon("database", 13)}<span>State after</span></a></div>
  ${c.faultApplied ? `<div class="tl-fault-note">${icon("zap", 13)}<div><b>${esc(c.faultApplied)}</b>${def ? ` <span class="muted">· ${esc(stageLabel(def.stage))}</span><p>${esc(def.description)}</p>` : ""}</div></div>` : ""}
  ${masked ? callout("warn", "The world committed this call, but the agent saw an error. An agent that retries without checking writes the change twice.", { title: "Masked commit", icon: "eyeOff" }) : ""}
  <div class="tl-grid"><section><h3 class="rd-sub">Arguments</h3><pre class="rd-json">${highlightJson(json(c.args))}</pre>${c.argsError ? `<p class="bad-text small">Rejected: the agent passed ${esc(c.argsError)} instead of a JSON object.</p>` : ""}</section>
  <section><h3 class="rd-sub">What the agent saw</h3>${saw}</section>
  <section><h3 class="rd-sub">What the world returned</h3>${returned}</section></div>
  ${c.changes.length ? `<h3 class="rd-sub">State changes</h3><div class="rd-changes">${c.changes.map(changeLine).join("")}</div>` : ""}
  ${c.schemaErrors?.length ? `<h3 class="rd-sub">Schema violations</h3><ul class="rd-lines">${c.schemaErrors.map((e) => `<li><code>${esc(e)}</code></li>`).join("")}</ul>` : ""}
  ${findings.length ? `<h3 class="rd-sub">Findings citing this call</h3><ul class="tl-cites">${findings.map((f) => `<li class="${esc(f.verdict)}">${verdictText(f.verdict)}${codeChip(f.rule)}<p>${esc(f.reason)}</p></li>`).join("")}</ul>` : ""}
  <details class="tl-snap"${expanded ? " open" : ""}><summary>${icon("chevronRight", 12)}World state after this call</summary>${codeView(json(c.worldSnapshotAfter), "json", { maxHeight: 360 })}</details>`;
}

function finalBlock(t: GradedTrial): string {
  const output = t.trace.finalOutput === undefined ? "" : `<h3 class="rd-sub">Structured output</h3><pre class="rd-json">${highlightJson(json(t.trace.finalOutput))}</pre>`;
  return `<div class="tl-final"><span class="tl-node final" aria-hidden="true"></span><div class="grow"><h3 class="rd-sub">Final answer</h3><blockquote class="rd-answer">${t.trace.finalAnswer ? esc(t.trace.finalAnswer) : '<span class="muted">The agent returned no answer.</span>'}</blockquote>${output}</div></div>`;
}

/** The call list of the shown trial with the current filter and search, and the selection kept visible. */
function shownCalls(v: View): { calls: ToolCallRecord[]; cited: Set<string> } {
  const cited = citedCalls(v.trial);
  const calls = filterCalls(v.trial.trace.calls, cited, callFilter, callQuery);
  if (calls.length && !calls.some((c) => c.id === selected)) selected = calls[0].id;
  return { calls, cited };
}

/** Phones show the inspector inside the selected call's row instead of beside the list. */
const NARROW = "(max-width: 760px)";
const narrow = () => typeof matchMedia !== "undefined" && matchMedia(NARROW).matches;

function callList(v: View): string {
  const { calls, cited } = shownCalls(v);
  const all = v.trial.trace.calls;
  if (!all.length) return `<div class="tl-empty">${emptyState({ icon: "terminal", title: "No tool calls", text: "The agent answered without calling a tool.", compact: true })}</div>${finalBlock(v.trial)}`;
  const inline = expanded || narrow();
  const list = calls.length
    ? `<ol class="tl-list">${calls.map((c) => callRow(v, c, cited, inline && (expanded || c.id === selected) ? inspector(v, c) : "")).join("")}</ol>`
    : `<div class="tl-empty">${emptyState({ icon: "search", title: "No call matches", text: "Clear the search or show every call.", actions: button("Show every call", { action: "tl-clear", size: "sm" }), compact: true })}</div>`;
  return `${list}${finalBlock(v.trial)}`;
}

function inspectorPane(v: View): string {
  const c = v.trial.trace.calls.find((x) => x.id === selected);
  return c ? inspector(v, c) : `<div class="tl-empty">${emptyState({ icon: "crosshair", title: "Select a call", text: "Its arguments, what the agent saw, what the world returned, and the state after it show here.", compact: true })}</div>`;
}

function timelineTab(v: View): string {
  const all = v.trial.trace.calls;
  const cited = citedCalls(v.trial);
  const count = (f: CallFilter) => filterCalls(all, cited, f, "").length;
  return `<div class="tl${expanded ? " expanded" : ""}" id="tl">
  <div class="tl-toolbar">${trialPicker(v, { compact: true })}
    ${searchInput({ id: "call-q", value: callQuery, placeholder: "Search calls, arguments, responses", kbd: "/", label: "Search the calls of this trial" })}
    ${segmented("tl-filter", callFilter, [
      { value: "all", label: "All", count: all.length },
      { value: "faulted", label: "Faulted", count: count("faulted"), icon: "zap", title: "Calls where a scheduled fault fired" },
      { value: "failed", label: "Failed", count: count("failed"), icon: "xCircle", title: "Calls where the agent saw an error" },
      { value: "cited", label: "Cited", count: count("cited"), icon: "target", title: "Calls a finding cites as evidence" },
    ], { label: "Show calls" })}
    <span class="spacer"></span>
    <span class="tl-keys muted small">${kbd("J")}${kbd("K")} move ${kbd("E")} expand</span>
    ${button(expanded ? "Collapse" : "Expand all", { action: "tl-expand", icon: expanded ? "minus" : "maximize", size: "sm", title: "Show every call's details in the list (E)" })}
  </div>
  <div class="tl-body">
    <div class="tl-col" id="tl-list">${callList(v)}</div>
    ${expanded ? "" : `<aside class="tl-side" id="tl-inspector" aria-label="The selected call">${inspectorPane(v)}</aside>`}
  </div>
</div>`;
}

export type Change = "added" | "changed" | "removed" | "same";

export interface RecordDiff {
  id: string;
  change: Change;
  before?: unknown;
  after?: unknown;
  /** Fields whose values differ, for changed records. */
  fields: string[];
}

export interface CollectionDiff {
  /** Where the collection sits in the snapshot: ["payments", "ledger"]. */
  path: string[];
  /** list: records with ids; map: keys and values; values: the scalars of an object, such as a sequence counter. */
  kind: "list" | "map" | "values";
  records: RecordDiff[];
}

function recordId(r: unknown, i: number): string {
  if (!isObj(r)) return `#${i + 1}`;
  const key = ["id", ...Object.keys(r).filter((k) => /Id$/.test(k)), "path", "name", "key"].find((k) => typeof r[k] === "string" || typeof r[k] === "number");
  return key ? String(r[key]) : `#${i + 1}`;
}

function entriesOf(list: unknown): Array<[string, unknown]> {
  if (!Array.isArray(list)) return [];
  const seen = new Map<string, number>();
  return list.map((r, i) => {
    const id = recordId(r, i);
    const n = (seen.get(id) ?? 0) + 1;
    seen.set(id, n);
    return [n > 1 ? `${id} (${n})` : id, r];
  });
}

/** One level of nesting flattened into dotted fields, so a record's columns line up: data.balance_cents. */
export function flatRecord(r: unknown): Record<string, unknown> {
  if (!isObj(r)) return { value: r };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (isObj(v) && Object.values(v).every((x) => !isObj(x))) for (const [k2, v2] of Object.entries(v)) out[`${k}.${k2}`] = v2;
    else out[k] = v;
  }
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function diffEntries(before: Array<[string, unknown]>, after: Array<[string, unknown]>): RecordDiff[] {
  const prev = new Map(before);
  const next = new Map(after);
  const out: RecordDiff[] = after.map(([id, a]) => {
    if (!prev.has(id)) return { id, change: "added", after: a, fields: [] };
    const b = prev.get(id);
    if (same(a, b)) return { id, change: "same", before: b, after: a, fields: [] };
    const fb = flatRecord(b);
    const fa = flatRecord(a);
    return { id, change: "changed", before: b, after: a, fields: [...new Set([...Object.keys(fb), ...Object.keys(fa)])].filter((k) => !same(fb[k], fa[k])) };
  });
  for (const [id, b] of before) if (!next.has(id)) out.push({ id, change: "removed", before: b, fields: [] });
  return out;
}

/** True for an object that holds collections (a world in a multi-world snapshot) rather than being one. */
function container(o: Record<string, unknown>): boolean {
  return Object.values(o).some((v) => Array.isArray(v) || (isObj(v) && Object.values(v).some((x) => Array.isArray(x))));
}

/**
 * The difference between two world snapshots, collection by collection: arrays of records matched
 * by id (id, a field ending in Id, path, or name), maps of keys to values, and the scalars beside
 * them. A multi-world snapshot nests one object per world.
 */
export function diffSnapshot(before: unknown, after: unknown): CollectionDiff[] {
  const out: CollectionDiff[] = [];
  const walk = (b: unknown, a: unknown, path: string[]) => {
    const bo = isObj(b) ? b : {};
    const ao = isObj(a) ? a : {};
    const values: RecordDiff[] = [];
    for (const k of [...new Set([...Object.keys(bo), ...Object.keys(ao)])]) {
      const bv = bo[k];
      const av = ao[k];
      if (Array.isArray(av) || Array.isArray(bv)) out.push({ path: [...path, k], kind: "list", records: diffEntries(entriesOf(bv), entriesOf(av)) });
      else if (isObj(av) || isObj(bv)) {
        const sample = (isObj(av) ? av : bv) as Record<string, unknown>;
        if (container(sample)) walk(bv, av, [...path, k]);
        else {
          const all = Object.values(sample);
          const records = all.length > 0 && all.every(isObj);
          out.push({ path: [...path, k], kind: records ? "list" : "map", records: diffEntries(Object.entries(isObj(bv) ? bv : {}), Object.entries(isObj(av) ? av : {})) });
        }
      } else values.push({ id: k, change: bv === undefined ? "added" : av === undefined ? "removed" : same(bv, av) ? "same" : "changed", before: bv, after: av, fields: [] });
    }
    if (values.length) out.push({ path, kind: "values", records: values });
  };
  walk(before, after, []);
  return out;
}

function snapshotAt(t: GradedTrial, s: number): Record<string, unknown> {
  return s === 0 ? t.trace.worldBefore : t.trace.calls[s - 1].worldSnapshotAfter;
}

function valueHtml(v: unknown, max = 48): string {
  if (v === undefined) return '<span class="faint">—</span>';
  if (typeof v === "string") return `<span class="st-str"${v.length > max ? tip(v) : ""}>${esc(clip(v, max))}</span>`;
  if (typeof v === "number" || typeof v === "boolean" || v === null) return `<span class="st-lit">${esc(String(v))}</span>`;
  const text = JSON.stringify(v);
  return `<code class="st-json"${text.length > max ? tip(text) : ""}>${esc(text.length > max ? `${text.slice(0, max)}…` : text)}</code>`;
}

const CHANGE_LABEL: Record<Change, string> = { added: "added", changed: "changed", removed: "removed", same: "" };
/** Unchanged records listed per collection; changed ones are always listed. */
const UNCHANGED_LIMIT = 50;

function collectionView(col: CollectionDiff, n: number): string {
  const counts = (["added", "changed", "removed"] as const).map((c) => [c, col.records.filter((r) => r.change === c).length] as const).filter(([, k]) => k);
  const title = col.path.length ? col.path.join(" › ") : "values";
  const tags = counts.map(([c, k]) => `<span class="st-tag ${c}">${k} ${CHANGE_LABEL[c]}</span>`).join("");
  if (col.kind === "values" || col.kind === "map") {
    return `<section class="st-coll"><header class="st-coll-head"><span class="st-path">${esc(title)}</span>${tags}</header>${
      col.records.length
        ? `<dl class="st-values">${col.records.map((r) => `<div class="${r.change === "same" ? "" : `st-${r.change}`}"><dt>${esc(r.id)}</dt><dd>${valueHtml(r.change === "removed" ? r.before : r.after)}${r.change === "changed" ? `<span class="st-was">was ${valueHtml(r.before, 32)}</span>` : r.change === "same" ? "" : `<span class="st-tag ${r.change}">${CHANGE_LABEL[r.change]}</span>`}</dd></div>`).join("")}</dl>`
        : '<p class="muted small st-none">empty</p>'
    }</section>`;
  }
  const unchanged = col.records.filter((r) => r.change === "same");
  const records = [...col.records.filter((r) => r.change !== "same"), ...unchanged.slice(0, UNCHANGED_LIMIT)];
  const fields = [...new Set(records.flatMap((r) => Object.keys(flatRecord(r.after ?? r.before))))];
  const columns: Column<RecordDiff>[] = [
    { id: "id", label: "Record", cls: "st-idcell", render: (r) => `<span class="st-id">${esc(r.id)}</span>${r.change === "same" ? "" : `<span class="st-tag ${r.change}">${CHANGE_LABEL[r.change]}</span>`}` },
    ...fields.map(
      (f): Column<RecordDiff> => ({
        id: f,
        label: f,
        render: (r) => {
          const now = flatRecord(r.change === "removed" ? r.before : r.after)[f];
          if (r.change !== "changed" || !r.fields.includes(f)) return valueHtml(now);
          const was = flatRecord(r.before)[f];
          return `<span class="st-cell-chg"${tip(`was ${was === undefined ? "absent" : JSON.stringify(was)}`)}>${valueHtml(now)}</span>`;
        },
      })
    ),
  ];
  return `<section class="st-coll"><header class="st-coll-head"><span class="st-path">${esc(title)}</span><span class="muted small">${plural(col.records.filter((r) => r.change !== "removed").length, "record")}</span>${tags}</header>${
    records.length
      ? `${dataTable({ id: `st-t${n}`, columns, rows: records, state: tableState(`st-t${n}`), plain: true, cards: true, rowCls: (r) => (r.change === "same" ? "" : `st-${r.change}`), empty: "" })}${unchanged.length > UNCHANGED_LIMIT ? `<p class="muted small st-none">${plural(unchanged.length - UNCHANGED_LIMIT, "more unchanged record")} not shown; the JSON view has them all.</p>` : ""}`
      : '<p class="muted small st-none">No records.</p>'
  }</section>`;
}

function stepLabel(t: GradedTrial, s: number): string {
  if (s === 0) return "Before the first call";
  const c = t.trace.calls[s - 1];
  return `After ${c.id} · ${c.tool}#${c.callIndex}`;
}

function clampStep(t: GradedTrial): number {
  const max = t.trace.calls.length;
  return Math.max(0, Math.min(max, step ?? max));
}

function stateBody(v: View): string {
  const t = v.trial;
  const s = clampStep(v.trial);
  const cur = snapshotAt(t, s);
  const diff = diffSnapshot(s === 0 ? cur : snapshotAt(t, s - 1), cur);
  const c = s ? t.trace.calls[s - 1] : undefined;
  const totals = (["added", "changed", "removed"] as const).map((k) => [k, diff.reduce((n, col) => n + col.records.filter((r) => r.change === k).length, 0)] as const);
  const summary = s === 0 ? '<span class="muted small">The scenario\'s setup, before the agent acts.</span>' : totals.some(([, n]) => n) ? totals.filter(([, n]) => n).map(([k, n]) => `<span class="st-tag ${k}">${n} ${CHANGE_LABEL[k]}</span>`).join("") : '<span class="muted small">No change since the previous step.</span>';
  return `<div class="st-step-head"><div class="grow"><div class="st-step-title">${esc(stepLabel(t, s))}${c ? stateChip(c) : ""}${c?.faultApplied ? faultTag(c.faultApplied) : ""}</div><div class="st-summary">${summary}</div></div>${c ? `<a class="btn btn-ghost btn-sm" href="${esc(timelineHref(v.key, t.trace.trialIndex, c.id))}">${icon("activity", 13)}<span>Open the call</span></a>` : ""}</div>
  ${c?.changes.length ? `<div class="rd-changes st-engine">${c.changes.map(changeLine).join("")}</div>` : ""}
  ${stateMode === "json" ? codeView(json(cur), "json", { maxHeight: 560 }) : diff.length ? diff.map(collectionView).join("") : emptyState({ icon: "database", title: "The world holds nothing", compact: true })}`;
}

function stepStrip(v: View): string {
  const t = v.trial;
  const s = clampStep(t);
  const cited = citedCalls(t);
  return `<button type="button" class="st-dot${s === 0 ? " on" : ""}" data-action="st-go" data-step="0"${tip("Before the first call: the scenario's setup")}>Before</button>${t.trace.calls
    .map((c, i) => `<button type="button" class="st-dot${s === i + 1 ? " on" : ""}${c.faultApplied ? " faulted" : ""}${c.observed.ok ? "" : " failed"}${c.mutating && c.committed ? " committed" : ""}${cited.has(c.id) ? " cited" : ""}" data-action="st-go" data-step="${i + 1}"${tip(`${c.id} ${c.tool}#${c.callIndex} · ${callState(c)}${c.faultApplied ? ` · fault ${c.faultApplied}` : ""}${c.changes.length ? ` · ${plural(c.changes.length, "change")}` : ""}`)}>${c.seq}</button>`)
    .join("")}`;
}

function stateTab(v: View): string {
  const t = v.trial;
  const max = t.trace.calls.length;
  const s = clampStep(t);
  return `${trialPicker(v)}${panel(
    {
      title: "World state",
      icon: "database",
      meta: `<span id="st-pos">step ${s} of ${max}</span>`,
      cls: "st-panel",
      actions: `${iconButton("chevronLeft", "Previous step (K)", { action: "st-prev", size: "sm" })}${iconButton("chevronRight", "Next step (J)", { action: "st-next", size: "sm" })}${segmented("st-mode", stateMode, [
        { value: "table", label: "Records", icon: "rows" },
        { value: "json", label: "JSON", icon: "code" },
      ])}`,
    },
    `<div class="st-scrub"><input type="range" class="st-range" id="st-range" min="0" max="${max}" value="${s}" step="1" data-input="st-step" aria-label="Step through the calls"${max ? "" : " disabled"}/><div class="st-strip" id="st-strip" role="group" aria-label="Steps">${stepStrip(v)}</div></div><div id="st-body" class="st-body">${stateBody(v)}</div>`
  )}`;
}

function rawJson(r: Loaded): string {
  const { regeneration: _r, ...report } = r;
  return `${JSON.stringify(report, null, 2)}\n`;
}

function rawTab(v: View): string {
  const text = rawJson(v.report);
  const cut = text.length > RAW_LIMIT;
  return panel(
    { title: "Report JSON", icon: "code", meta: `${bytes(new Blob([text]).size)} · report format v${v.report.reportVersion}`, flush: true, actions: `${button("Copy", { action: "copy-json", icon: "copy", size: "sm" })}${button("Download", { action: "download-json", icon: "download", size: "sm" })}` },
    `${cut ? `<div class="rd-raw-note">${callout("info", `The report is ${esc(bytes(text.length))}; the first ${esc(bytes(RAW_LIMIT))} is shown. Download it for the whole file.`)}</div>` : ""}${codeView(cut ? text.slice(0, RAW_LIMIT) : text, "json", { maxHeight: 720 })}`
  );
}

function unavailable(key: string, err: Error): string {
  return `<div class="page">${pageHead({ eyebrow: `${icon("file", 11)}Report`, title: key, mono: true })}${emptyState({
    icon: "file",
    title: "This report is not available",
    text: `${esc(err.message)}. Results of this session stay in memory until the server stops; save them to keep them, or open a result from the history, which is regenerated from its seed.`,
    actions: `${button("All reports", { href: "#/reports", icon: "file" })}${button("Try again", { action: "retry", icon: "refresh", kind: "ghost" })}`,
  })}</div>`;
}

function applyQuery(v: Omit<View, "trial">, query: URLSearchParams, hash: string): void {
  if (v.key !== shownKey) {
    shownKey = v.key;
    trialIndex = v.worst.trace.trialIndex;
    selected = undefined;
    callFilter = "all";
    callQuery = "";
    expanded = false;
    step = undefined;
  }
  if (hash === appliedHash) return;
  appliedHash = hash;
  const trial = query.get("trial");
  if (trial !== null && v.report.trials.some((t) => String(t.trace.trialIndex) === trial)) trialIndex = Number(trial);
  const call = query.get("call");
  if (call) {
    selected = call;
    callFilter = "all";
    callQuery = "";
  }
  const at = query.get("step");
  if (at !== null && Number.isFinite(Number(at))) step = Number(at);
}

function defaultCall(t: GradedTrial): string | undefined {
  const cited = citedCalls(t);
  return (t.trace.calls.find((c) => cited.has(c.id)) ?? t.trace.calls.find((c) => c.faultApplied) ?? t.trace.calls[0])?.id;
}

function currentTab(query: URLSearchParams): Tab {
  const tab = query.get("tab") as Tab | null;
  return tab && TABS.includes(tab) ? tab : "summary";
}

function selectCall(id: string, o: { scroll?: boolean } = {}): void {
  if (!view) return;
  selected = id;
  if (expanded || narrow()) patch("tl-list", callList(view));
  else {
    for (const li of document.querySelectorAll<HTMLElement>("#tl-list .tl-call")) {
      const on = li.dataset.call === id;
      li.classList.toggle("on", on);
      li.querySelector(".tl-row")?.setAttribute("aria-pressed", String(on));
    }
    patch("tl-inspector", inspectorPane(view));
  }
  if (o.scroll) document.querySelector<HTMLElement>(`#tl-list .tl-call[data-call="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" });
}

function moveCall(by: 1 | -1): void {
  if (!view) return;
  const { calls } = shownCalls(view);
  if (!calls.length) return;
  const i = calls.findIndex((c) => c.id === selected);
  const next = calls[i < 0 ? 0 : Math.max(0, Math.min(calls.length - 1, i + by))];
  selectCall(next.id, { scroll: true });
  document.querySelector<HTMLElement>(`#tl-list .tl-call[data-call="${CSS.escape(next.id)}"] .tl-row`)?.focus({ preventScroll: true });
}

function goStep(s: number): void {
  if (!view) return;
  const max = view.trial.trace.calls.length;
  step = Math.max(0, Math.min(max, s));
  const range = document.getElementById("st-range") as HTMLInputElement | null;
  if (range) range.value = String(step);
  const pos = document.getElementById("st-pos");
  if (pos) pos.textContent = `step ${step} of ${max}`;
  patch("st-strip", stepStrip(view));
  patch("st-body", stateBody(view));
}

async function replay(el: HTMLElement): Promise<void> {
  if (!view) return;
  const key = view.key;
  const result = await withBusy(el, () => api<ReplayView>("/api/replay", { key }));
  replays.set(key, result);
  toast(result.reproduced ? "Every call, state, and verdict matches the report." : "The recorded calls no longer produce the recorded states and verdicts; see the trials on the page.", result.reproduced ? "ok" : "bad", { title: result.reproduced ? "Reproduced" : "Not reproduced" });
  if (!result.reproduced) runtime.changed(["activity"]);
  await runtime.rerender();
}

function moreMenu(el: HTMLElement): void {
  if (!view) return;
  const r = view.report;
  const key = view.key;
  openMenu(
    [
      { heading: "Report" },
      { label: "Copy the report key", icon: "key", hint: clip(key, 28), run: () => void copy(key) },
      { label: "Copy the result as JSON", icon: "copy", run: () => void copy(rawJson(r)) },
      { label: "Open the scenario", icon: "layers", href: href("scenario", r.scenarioId) },
      ...(view.run ? [{ label: `Open ${view.run.runId}`, icon: "runs" as const, href: href("run", view.run.runId) }] : []),
      ...(view.sweep ? [{ label: `Open ${view.sweep.sweepId}`, icon: "grid" as const, href: href("sweep", view.sweep.sweepId) }] : []),
      { label: "Other results of this scenario and agent", icon: "file", href: withQuery("#/reports", { scenario: r.scenarioId, agent: r.agentId }) },
      { label: "Sweep this scenario with this agent", icon: "grid", href: withQuery("#/sweep", { scenario: r.scenarioId, agent: r.agentId }) },
      { label: "Run it again", icon: "play", href: withQuery("#/launch", { scenarios: r.scenarioId, agents: r.agentId }) },
      ...(canDelete(key) ? ["-" as const, { label: "Delete this report", icon: "trash" as const, danger: true, run: () => void deleteReports([key]).then((n) => n && runtime.navigate("#/reports")) }] : []),
    ],
    el,
    { align: "end" }
  );
}

const page: Page = {
  nav: "reports",
  title: (ctx) => store.reports.get(ctx.arg ?? "")?.scenarioId ?? findResult(ctx.arg ?? "")?.scenarioId ?? "Report",
  skeleton: "detail",
  watches: ["reports"],
  async render(ctx) {
    const key = ctx.arg ?? "";
    if (!key) return unavailable("", new Error("No report key in the address"));
    let report: Loaded;
    try {
      [report] = await Promise.all([load.report(key), load.runs().catch(() => undefined), load.reports().catch(() => undefined), load.sweeps().catch(() => undefined)]);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 400)) return unavailable(key, err);
      throw err;
    }
    if (key.startsWith("sweep:")) await load.sweep(key.split(":")[1]).catch(() => undefined);
    const worst = worstTrial(report) ?? report.trials[0];
    const summary = findResult(key);
    const savedCopy = sourceKind(key) === "saved" ? key.slice(5) : store.saved.find((s) => !s.error && summary && identityOf(s) === identityOf(summary))?.file;
    const base = { key, report, worst, summary, run: runOf(key), sweep: sweepOf(key), file: savedCopy };
    if (key !== shownKey) remember({ kind: "report", id: key, label: report.scenarioId, detail: `${report.agentId} · ${report.aggregateVerdict}` });
    applyQuery(base, ctx.query, location.hash);
    const trial = report.trials.find((t) => t.trace.trialIndex === trialIndex) ?? worst;
    if (!selected || !trial.trace.calls.some((c) => c.id === selected)) selected = defaultCall(trial);
    view = { ...base, trial };
    const tab = currentTab(ctx.query);
    const calls = trial.trace.calls.length;
    const body = tab === "timeline" ? timelineTab(view) : tab === "state" ? stateTab(view) : tab === "raw" ? rawTab(view) : summaryTab(view);
    return `<div class="page rd">
  ${head(view)}
  ${callouts(view)}
  <div class="page-tabs">${tabs(
    [
      { id: "summary", label: "Summary", icon: "file", href: tabHref(key, "summary") },
      { id: "timeline", label: "Timeline", icon: "activity", count: calls, href: tabHref(key, "timeline") },
      { id: "state", label: "World state", icon: "database", href: tabHref(key, "state") },
      { id: "raw", label: "Raw JSON", icon: "code", href: tabHref(key, "raw") },
    ],
    tab,
    { label: "Report sections" }
  )}</div>
  <div class="rd-tab" data-tab="${tab}">${body}</div>
</div>`;
  },
  mount() {
    if (selected && document.getElementById("tl-list")) document.querySelector<HTMLElement>(`#tl-list .tl-call[data-call="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: "nearest" });
    media = matchMedia(NARROW);
    media.addEventListener("change", relayout);
  },
  unmount() {
    media?.removeEventListener("change", relayout);
    view = undefined;
  },
  actions: {
    replay: (el) => replay(el),
    retry: () => runtime.rerender(),
    "dismiss-replay": () => {
      if (view) replays.delete(view.key);
      return runtime.rerender();
    },
    save: (el) => view && saveReports([view.key], { el }),
    more: (el) => moreMenu(el),
    "download-json": () => {
      if (!view) return;
      download(`${encodeURIComponent(view.report.scenarioId)}.report.json`, rawJson(view.report), "application/json");
    },
    "copy-json": (el) => view && copy(rawJson(view.report), el),
    trial: (el) => {
      trialIndex = Number(el.dataset.value);
      selected = undefined;
      step = undefined;
      return runtime.rerender();
    },
    "tl-select": (el) => selectCall(el.dataset.call ?? ""),
    "tl-filter": (el) => {
      callFilter = el.dataset.value as CallFilter;
      return runtime.rerender();
    },
    "tl-clear": () => {
      callFilter = "all";
      callQuery = "";
      return runtime.rerender();
    },
    "tl-expand": () => {
      expanded = !expanded;
      return runtime.rerender();
    },
    "st-go": (el) => goStep(Number(el.dataset.step)),
    "st-prev": () => goStep(clampStep(view!.trial) - 1),
    "st-next": () => goStep(clampStep(view!.trial) + 1),
    "st-mode": (el) => {
      stateMode = el.dataset.value as "table" | "json";
      return runtime.rerender();
    },
  },
  inputs: {
    "call-q": (el) => {
      callQuery = el.value;
      if (view) patch("tl-list", callList(view));
      if (view && !expanded) patch("tl-inspector", inspectorPane(view));
    },
    "st-step": (el) => goStep(Number(el.value)),
    trial: (el) => {
      trialIndex = Number(el.value);
      selected = undefined;
      step = undefined;
      void runtime.rerender();
    },
  },
  keys(e) {
    if (!view || e.metaKey || e.ctrlKey || e.altKey) return false;
    if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]") || document.querySelector("dialog[open]")) return false;
    const key = e.key.toLowerCase();
    if (key === "g") {
      lastG = Date.now();
      return false;
    }
    if (Date.now() - lastG < 900) return false;
    const tab = currentTab(new URLSearchParams(location.hash.split("?")[1] ?? ""));
    if (tab === "timeline") {
      if (key === "j" || key === "k") {
        e.preventDefault();
        moveCall(key === "j" ? 1 : -1);
        return true;
      }
      if (key === "e") {
        e.preventDefault();
        expanded = !expanded;
        void runtime.rerender();
        return true;
      }
    }
    if (tab === "state" && (key === "j" || key === "k" || e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      e.preventDefault();
      goStep(clampStep(view.trial) + (key === "j" || e.key === "ArrowRight" ? 1 : -1));
      return true;
    }
    return false;
  },
};

export default page;
