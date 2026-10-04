import { describeInvariant, describePattern, describeRef, isValueRef } from "./expect.js";
import { describeSchedule } from "./faults.js";
import { formatCents } from "./format.js";
import type { AnswerAssertion, FaultSpec, GradedTrial, RunReport, ToolCallRecord } from "./types.js";

/** The worst trial: the first one whose verdict equals the aggregate verdict. */
export function worstTrial(report: RunReport): GradedTrial | undefined {
  return report.trials.find((t) => t.verdict === report.aggregateVerdict) ?? report.trials[0];
}

export function describeOutcome(trial: GradedTrial): string {
  const o = trial.outcome;
  const path = o.path && o.path !== "expected" ? ` [${o.path}]` : "";
  return `${o.status.replace("_", " ")}${path}${o.summary ? ` (${o.summary})` : ""}`;
}

export function describeFault(f: FaultSpec): string {
  return `${f.kind} on ${f.target} ${describeSchedule(f)}`;
}

export function describeBudget(report: RunReport): string {
  const b = report.scenario.budget;
  return [
    ...(b.maxCalls === undefined ? [] : [`${b.maxCalls} calls`]),
    ...Object.entries(b.maxCallsPerTool ?? {}).map(([tool, n]) => `${n} ${tool} calls`),
  ].join(", ");
}

export function describeExpect(report: RunReport): string {
  return expectParts(report).join("; ");
}

/** The scenario's expectations, one item per outcome, allowance, invariant, and answer check. */
export function expectParts(report: RunReport): string[] {
  const e = report.scenario.expect;
  if (!e) return ["none (task completion is not checked)"];
  const effects = (patterns: typeof e.outcomes[number]["effects"]) => (patterns.length ? patterns.map(describePattern).join("; ") : "no state changes");
  const parts =
    e.outcomes.length === 1
      ? [effects(e.outcomes[0].effects)]
      : e.outcomes.map((o) => `${o.name}${o.verdict === "SAFE_FAILURE" ? " (recovery)" : ""}: ${effects(o.effects)}`);
  if (e.allow.length) parts.push(`allowed: ${e.allow.map(describePattern).join("; ")}`);
  for (const inv of e.invariants) parts.push(`invariant ${inv.name}: ${describeInvariant(inv)}`);
  for (const a of e.answer) parts.push(describeAssertion(a));
  return parts;
}

function describeAssertion(a: AnswerAssertion): string {
  switch (a.type) {
    case "amount":
      return `answer states ${formatCents(a.cents)}`;
    case "id":
      return `answer names the id of the ${describePattern(a.of)}`;
    case "text":
      return a.contains !== undefined ? `answer contains ${JSON.stringify(a.contains)}` : a.notContains !== undefined ? `answer does not contain ${JSON.stringify(a.notContains)}` : `answer matches /${a.matches}/`;
    case "boolean":
      return typeof a.equals === "boolean"
        ? `answer says ${a.equals ? "yes" : "no"} to ${a.keywords.join("/")}`
        : `answer's yes or no on ${a.keywords.join("/")} matches ${describeRef(a.equals)}`;
    case "output":
      return `output ${[...(a.schema ? ["matches its schema"] : []), ...Object.entries(a.fields).map(([k, v]) => `${k} = ${isValueRef(v) ? describeRef(v) : JSON.stringify(v)}`)].join(", ")}`;
  }
}

export function callState(c: ToolCallRecord): string {
  if (c.budgetExceeded) return "refused (budget)";
  if (!c.mutating) return c.committed ? "read" : "not executed";
  if (!c.committed) return "not committed";
  return (c.committedResult as { deduplicated?: unknown } | undefined)?.deduplicated === true ? "deduplicated" : "committed";
}
