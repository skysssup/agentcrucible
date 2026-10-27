/** A small, live experiment before the larger workspace dashboard. */
import type { RunReport } from "../../../types.js";
import type { RunRecord } from "../../api.js";
import { jobDone } from "../jobs.js";
import { download } from "../lib/dom.js";
import { esc, href } from "../lib/format.js";
import { startPlannedRun } from "../lib/job-plans.js";
import { runtime } from "../lib/runtime.js";
import { load, store } from "../lib/state.js";
import type { Page } from "../routes.js";
import { callout, pageHead } from "../ui/layout.js";
import { button } from "../ui/primitives.js";
import { badge } from "../ui/verdicts.js";

let running = false;
let failure = "";
let run: RunRecord | undefined;
let reports: RunReport[] = [];

export function evidenceMarkdown(items: RunReport[]): string {
  return ["# AgentCrucible: lost refund response", "", "Scripted agents and offline mock services. These results are not production reliability measurements.", "",
    ...items.flatMap((r) => {
      const t = r.trials.find((t) => t.verdict === r.aggregateVerdict) ?? r.trials[0];
      return [`## ${r.agentId}`, `Scenario: ${r.scenarioId}`, `Seed: ${r.seed}`, `Verdict: ${r.aggregateVerdict}`, `Engine: ${r.toolVersion}`, "", "### Calls", ...t.trace.calls.map((c) => `- ${c.id}: ${c.tool} — ${c.observed.ok ? "success observed" : "error observed"}; ${c.committed ? "executed" : "not executed"}${c.faultApplied ? `; fault=${c.faultApplied}` : ""}`), "", "### Committed effects", ...t.effects.map((e) => `- ${e.summary}`), "", "### Final answer", t.trace.finalAnswer, "", "### Findings", ...t.findings.map((f) => `- ${f.rule}: ${f.reason}`), ""];
    })].join("\n");
}

export function evidenceCard(report: RunReport, key?: string): string {
  const trial = report.trials.find((t) => t.verdict === report.aggregateVerdict) ?? report.trials[0];
  return `<article class="lab-result"><header><h2>${esc(report.agentId)}</h2>${badge(report.aggregateVerdict)}</header>
    <ol class="lab-calls" aria-label="Tool calls">${trial.trace.calls.map((c) => `<li><span class="lab-call-index">${c.seq}</span><div><code>${esc(c.tool)}</code><p>${c.committed ? "Service executed the call" : "Service did not execute the call"} · ${c.observed.ok ? "agent received success" : "agent received an error"}</p>${c.faultApplied ? `<span class="lab-fault">${esc(c.faultApplied)}</span>` : ""}</div></li>`).join("")}</ol>
    <div class="lab-answer"><span class="eyebrow">What changed</span><ul class="lab-effects">${trial.effects.map((e) => `<li>${esc(e.summary)}</li>`).join("") || "<li>No changes committed.</li>"}</ul><span class="eyebrow">The agent said</span><blockquote>${esc(trial.trace.finalAnswer)}</blockquote></div>
    <p class="lab-reason">${esc(trial.reason)}</p>
    ${key ? button("Inspect the full trace", { href: href("report", key), icon: "arrowRight", kind: "ghost" }) : ""}</article>`;
}

async function execute(): Promise<void> {
  if (running) return;
  running = true; failure = "";
  await runtime.rerender();
  try {
    const scenarios = await load.scenarios();
    const job = await startPlannedRun({ scenarioIds: [store.meta.demo.scenario], agents: [], trials: 1, seed: store.meta.demo.seed, label: "Failure lab: lost refund response" }, scenarios);
    const done = await jobDone(job.jobId);
    if (done.status === "failed") throw new Error(done.error ?? "The run failed.");
    const recorded = (await load.runs(true)).find((r) => r.runId === done.runId);
    if (!recorded) throw new Error("The run was not recorded. Open Runs to check its status.");
    const fetched = await Promise.all(recorded.results.map((r) => load.report(r.key)));
    run = recorded; reports = fetched;
  } catch (err) { failure = (err as Error).message; }
  finally { running = false; await runtime.rerender(); }
}

const page: Page = {
  nav: "lab", title: () => "Failure lab", skeleton: "detail",
  async render() {
    await load.scenarios();
    const available = store.scenarios?.some((s) => s.id === store.meta.demo.scenario);
    return `<div class="page lab-page">${pageHead({ eyebrow: "A reproducible agent failure", title: "The refund went through. The response didn’t.", desc: "An agent asks for a refund. The payment service commits it, then the response times out. Is retrying safe? Run five recovery strategies against the same fault and inspect what actually happened.", actions: button(running ? "Running experiment…" : run ? "Run again" : "Run the experiment", { action: "lab-run", kind: "primary", icon: "play", disabled: running || !available }) })}
      <div class="lab-contract"><div><span class="eyebrow">01 · The task</span><p>Refund the customer exactly once.</p></div><div><span class="eyebrow">02 · The fault</span><p><code>timeout_after_commit</code></p></div><div><span class="eyebrow">03 · The evidence</span><p>Calls, committed state, and final answer.</p></div></div>
      <p class="lab-disclosure">Live execution · Scripted agents · Offline mock payments · Seed <code>${esc(store.meta.demo.seed)}</code>. No API key needed.</p>
      ${!available ? callout("warn", "<p>The bundled refund scenario is unavailable in this workspace. Open Scenarios to inspect loading errors.</p>") : ""}
      ${failure ? callout("bad", `<p>${esc(failure)}</p>`, { title: "The experiment did not finish" }) : ""}
      <section aria-label="Experiment results" aria-busy="${running}" aria-live="polite">${reports.length ? `<div class="lab-results">${reports.map((r) => evidenceCard(r, run?.results.find((x) => x.agentId === r.agentId)?.key)).join("")}</div><div class="lab-footer">${button("Download the evidence", { action: "lab-export", icon: "download" })}${button("Open the recorded run", { href: href("run", run!.runId), icon: "runs" })}</div>` : `<div class="lab-empty"><span class="eyebrow">Before you run</span><h2>A successful response and a successful task are different facts.</h2><p>Blind retry can create a second refund. Reusing an idempotency key or checking the ledger can recover safely. The engine decides the verdict from the resulting records and the agent’s answer.</p><p>The results will appear here after the experiment runs.</p></div>`}</section>
      <footer class="lab-limit"><p>This experiment tests a narrow recovery contract in deterministic mock services. It does not certify an agent for production.</p><a href="#/demo">Watch the guided walkthrough</a><a href="#/">Explore the workspace</a><a href="#/launch">Test your own agent</a></footer></div>`;
  },
  actions: { "lab-run": execute, "lab-export": () => download("agentcrucible-evidence.md", evidenceMarkdown(reports), "text/markdown") },
};
export default page;
