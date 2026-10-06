/**
 * Pieces of the run pages: the status mark of a run, the scenario-by-agent matrix with its trial
 * strips and expectation summaries, and the live grid a run in progress fills in.
 */
import type { ReportSummary, RunRecord } from "../../api.js";
import { isFlaky, isUnexpected } from "../lib/analytics.js";
import { absTime, clip, esc, href, plural, relTime } from "../lib/format.js";
import { matrixAxes, runAgents, runScope, runStatus, type RunStatusKind } from "../lib/runs.js";
import { icon, type IconName } from "../icons.js";
import { tip } from "./primitives.js";
import { badge, expectedMark, tally, tallyOf, verdictBar, VERDICT_CODE } from "./verdicts.js";

const STATUS: Record<RunStatusKind, { icon: IconName; cls: string }> = {
  unexpected: { icon: "xCircle", cls: "bad" },
  draft: { icon: "edit", cls: "draft" },
  expected: { icon: "checkCircle", cls: "ok" },
  ungraded: { icon: "circle", cls: "none" },
};

/** A time as "3 h ago" with the date in its tooltip, or the other way round when absolute times are preferred. */
export function when(iso: string | undefined, absolute = false): string {
  const rel = relTime(iso);
  const abs = absTime(iso);
  return absolute ? `<span${tip(rel)}>${esc(abs)}</span>` : `<span${tip(abs)}>${esc(rel)}</span>`;
}

const ORIGIN: Record<string, [string, string]> = {
  draft: ["draft", "A run of the editor's unsaved text"],
  demo: ["demo", "Generated with the demo workspace"],
  import: ["import", "Imported from a workspace file"],
  session: ["session", "Started in this server session; its reports are kept in memory"],
};

/** The chip that says where a run came from: a draft, the demo history, an import, or this session. */
export function originChip(run: Pick<RunRecord, "draft" | "origin" | "archived">): string {
  const key = run.draft ? "draft" : run.origin === "demo" || run.origin === "import" ? run.origin : run.archived ? "" : "session";
  if (!key) return "";
  const [label, text] = ORIGIN[key];
  return `<span class="src-tag ${key}"${tip(text)}>${label}</span>`;
}

/** The scenarios, agents, and trials of a run, for the tooltip of its scope. */
export function scopeTip(run: Pick<RunRecord, "agents" | "results" | "scenarios" | "trials">): string {
  const s = runScope(run);
  const list = run.scenarios.slice(0, 12).join("\n") + (run.scenarios.length > 12 ? `\n… ${run.scenarios.length - 12} more` : "");
  return `${plural(s.scenarios, "scenario")} × ${plural(s.agents, "agent")} × ${plural(s.trials, "trial")}\n${list}\nAgents: ${run.agents ? runAgents(run).join(", ") : `the expected agents of each scenario (${runAgents(run).join(", ")})`}`;
}

/** What a run's status means, in a sentence for its tooltip. */
export function statusText(run: Pick<RunRecord, "results" | "draft">): string {
  const s = runStatus(run);
  if (s.kind === "unexpected") return `${s.unexpected} of ${s.graded} graded ${s.graded === 1 ? "result differs" : "results differ"} from expected_verdicts`;
  if (s.kind === "draft") return `A run of the editor's unsaved text${s.graded ? `; all ${s.graded} graded results match expected_verdicts` : ""}`;
  if (s.kind === "expected") return `All ${plural(s.graded, "graded result")} match expected_verdicts`;
  return "No scenario in this run lists an expected verdict for these agents";
}

/** The run's status as an icon, for table rows. */
export function statusMark(run: Pick<RunRecord, "results" | "draft">): string {
  const s = STATUS[runStatus(run).kind];
  const text = statusText(run);
  return `<span class="run-status ${s.cls}" role="img" aria-label="${esc(text)}"${tip(text)}>${icon(s.icon, 15)}</span>`;
}

/** The run's status as a pill with its label, for headers. */
export function statusPill(run: Pick<RunRecord, "results" | "draft">): string {
  const st = runStatus(run);
  const kind = st.kind === "unexpected" ? "bad" : st.kind === "expected" ? "ok" : st.kind === "draft" ? "accent" : "";
  return `<span class="pill ${kind}"${tip(statusText(run))}>${icon(STATUS[st.kind].icon, 12)}${esc(st.label)}</span>`;
}

/** The verdicts of a result's trials as a small bar, when it has more than one trial. */
export function trialStrip(r: ReportSummary): string {
  if ((r.trials ?? 1) < 2) return "";
  const parts = tallyOf(r.byVerdict ?? {});
  const flaky = isFlaky(r);
  return `<span class="trials${flaky ? " flaky" : ""}"${tip(`${r.trials} trials: ${parts.map(([v, n]) => `${n} ${v}`).join(", ")}`)}><span class="trial-bar">${parts.map(([v, n]) => `<i class="${v}" style="flex:${n}"></i>`).join("")}</span><span>${flaky ? "flaky, " : ""}${r.trials} trials</span></span>`;
}

/** "3/3 as expected" when every graded result matched expected_verdicts, otherwise how many did not. */
export function expectSummary(results: ReportSummary[]): string {
  const graded = results.filter((r) => r.expected).length;
  if (!graded) return "";
  const off = results.filter(isUnexpected).length;
  return off ? `<span class="exp-sum bad">${icon("xCircle", 12)}${off} of ${graded} unexpected</span>` : `<span class="exp-sum ok">${icon("checkCircle", 12)}${graded}/${graded} as expected</span>`;
}

export type MatrixFilter = "all" | "unexpected" | "flaky";
export type MatrixDensity = "compact" | "detailed";

function matrixCell(r: ReportSummary | undefined): string {
  if (!r) return `<td><span class="cell cell-empty">not run</span></td>`;
  const meta = [r.rule ? `<code>${esc(r.rule)}</code>` : "", r.calls !== undefined ? `<span>${plural(r.calls, "call")}${r.mutations ? ` · ${plural(r.mutations, "write")}` : ""}</span>` : ""].filter(Boolean).join("");
  return `<td><a class="cell ${esc(r.verdict)}${isUnexpected(r) ? " mismatch" : ""}${isFlaky(r) ? " is-flaky" : ""}" href="${href("report", r.key)}"${tip(r.reason ?? "")}><span class="cell-top">${badge(r.verdict)}${expectedMark(r)}</span><span class="why">${esc(clip(r.reason ?? "", 110))}</span>${meta ? `<span class="cell-meta">${meta}</span>` : ""}${trialStrip(r)}</a></td>`;
}

/**
 * The results of one run as a scenario-by-agent matrix. Each cell opens its report; rows and
 * columns summarize how many results match expected_verdicts. The filter hides rows without an
 * unexpected or flaky result and dims the other cells; detailed density shows more of each reason.
 */
export function runMatrix(run: Pick<RunRecord, "results">, o: { filter: MatrixFilter; density: MatrixDensity }): string {
  const { scenarios, agents, at } = matrixAxes(run);
  const head = agents
    .map((a) => {
      const col = run.results.filter((r) => r.agentId === a);
      return `<th scope="col"><div class="col-head"><a class="link-mono" href="${href("agent", a)}"${tip(a)}>${esc(a)}</a>${verdictBar(tally(col), { size: "sm" })}${expectSummary(col)}</div></th>`;
    })
    .join("");
  const body = scenarios
    .map((s) => {
      const row = run.results.filter((r) => r.scenarioId === s);
      return `<tr data-unexpected="${row.some(isUnexpected) ? 1 : 0}" data-flaky="${row.some(isFlaky) ? 1 : 0}"><th scope="row"><a href="${href("scenario", s)}">${esc(s).replace(/\//g, "/<wbr>")}</a>${expectSummary(row)}</th>${agents.map((a) => matrixCell(at(s, a))).join("")}</tr>`;
    })
    .join("");
  return `<div class="matrix-wrap" id="matrix" data-filter="${o.filter}" data-density="${o.density}"><table class="matrix" style="min-width:${220 + agents.length * 200}px" aria-label="Results by scenario and agent"><thead><tr><th class="matrix-corner" scope="col">Scenario</th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/**
 * The grid a run in progress fills in: scenarios down, agents across, each finished result as its
 * verdict code linking to the report. Planned pairs without a result yet are pending; the first of
 * them is running, since the server reports results in the order of the plan.
 */
export function liveMatrix(pairs: Array<{ scenarioId: string; agentId: string }>, results: ReportSummary[], running: boolean): string {
  const all = [...pairs, ...results.filter((r) => !pairs.some((p) => p.scenarioId === r.scenarioId && p.agentId === r.agentId)).map((r) => ({ scenarioId: r.scenarioId ?? "", agentId: r.agentId ?? "" }))];
  const scenarios = [...new Set(all.map((p) => p.scenarioId))];
  const agents = [...new Set(all.map((p) => p.agentId))];
  const next = pairs.find((p) => !results.some((r) => r.scenarioId === p.scenarioId && r.agentId === p.agentId));
  const cell = (s: string, a: string) => {
    const r = results.find((x) => x.scenarioId === s && x.agentId === a);
    if (r?.verdict) {
      const text = `${r.verdict}${r.expected ? (isUnexpected(r) ? `, expected ${r.expected}` : ", as expected") : ""}\n${r.reason ?? ""}`;
      return `<a class="lm-cell ${esc(r.verdict)}${isUnexpected(r) ? " mismatch" : ""}" href="${href("report", r.key)}" aria-label="${esc(`${s} with ${a}: ${r.verdict}`)}"${tip(text)}>${VERDICT_CODE[r.verdict]}</a>`;
    }
    if (r?.error) return `<span class="lm-cell failed"${tip(r.error)}>${icon("x", 12)}</span>`;
    if (!all.some((p) => p.scenarioId === s && p.agentId === a)) return `<span class="lm-cell none"${tip(`${a} is not part of this run for ${s}`)}></span>`;
    if (running && next?.scenarioId === s && next.agentId === a) return `<span class="lm-cell running" aria-label="running"${tip(`${s} with ${a}: running`)}><span class="spinner"></span></span>`;
    return `<span class="lm-cell pending" aria-label="waiting"${tip(`${s} with ${a}: waiting`)}></span>`;
  };
  return `<div class="lm-wrap"><table class="lm" aria-label="Results so far by scenario and agent"><thead><tr><th class="lm-corner" scope="col">Scenario</th>${agents.map((a) => `<th scope="col"><span class="lm-agent"${tip(a)}>${esc(a)}</span></th>`).join("")}</tr></thead><tbody>${scenarios
    .map((s) => `<tr><th scope="row"><span class="lm-scenario"${tip(s)}>${esc(s)}</span></th>${agents.map((a) => `<td>${cell(s, a)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></div>`;
}
