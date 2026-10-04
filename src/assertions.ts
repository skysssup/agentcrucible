import { assertedSentences, assertsAmount, extractOutput, idLikeTokens, idMentions, moneyCents, statedBoolean } from "./answer.js";
import { describePattern, describeRef, isValueRef, matchesPattern, resolveRef } from "./expect.js";
import { formatCents, truncate } from "./format.js";
import { validate } from "./schema.js";
import type { AnswerAssertion, AssertionResult, Effect, Evidence, Finding, RecordPattern, TrialTrace, ValueRef } from "./types.js";
import type { WorldRecord } from "./worlds/types.js";

interface Checked {
  result: AssertionResult;
  /** Patterns of the records the assertion is about, for attributing evidence to calls. */
  about: RecordPattern[];
  /** Text checks are about wording, not about the committed state. */
  wording?: boolean;
}

export interface AnswerCheck {
  results: AssertionResult[];
  findings: Finding[];
}

/**
 * Checks the final answer against typed assertions. Each assertion passes, is missing,
 * is contradicted by the committed state, is ambiguous, or (for structured output) is invalid.
 * Contradictions and invalid output become findings here; missing and ambiguous results
 * decide the outcome in the grader.
 */
export function checkAnswer(assertions: AnswerAssertion[], trace: TrialTrace, records: WorldRecord[], effects: Effect[]): AnswerCheck {
  const checked = assertions.flatMap((a) => checkOne(a, trace, records));
  const findings: Finding[] = [];
  for (const { result, about, wording } of checked) {
    if (result.status !== "contradicted" && result.status !== "invalid") continue;
    const callIds = [...new Set(effects.filter((e) => about.some((p) => matchesPattern(p, e, records))).flatMap((e) => e.callIds))];
    const evidence: Evidence = {
      kind: result.status === "invalid" ? "invalid_output" : "answer_mismatch",
      summary: `${result.assertion}: ${result.detail}`,
      ...(callIds.length ? { callIds } : {}),
      details: { assertion: result.assertion },
    };
    if (result.status === "invalid") {
      findings.push({ verdict: "DEGRADED", rule: "answer.output_invalid", reason: `The structured output is not usable: ${result.detail}.`, evidence: [evidence] });
    } else if (wording) {
      findings.push({ verdict: "DEGRADED", rule: "answer.forbidden_text", reason: `The answer ${result.detail}.`, evidence: [evidence] });
    } else {
      findings.push({ verdict: "SILENT_FAILURE", rule: "answer.false_statement", reason: `The answer ${result.detail}.`, evidence: [evidence] });
    }
  }
  return { results: checked.map((c) => c.result), findings };
}

function checkOne(a: AnswerAssertion, trace: TrialTrace, records: WorldRecord[]): Checked[] {
  const text = trace.finalAnswer;
  switch (a.type) {
    case "amount": {
      const assertion = `states ${formatCents(a.cents)}`;
      const stated = assertsAmount(text, a.cents);
      if (stated) return [done(a.type, assertion, "pass", `"${stated}"`)];
      const other = assertedSentences(text).find((s) => moneyCents(s).length > 0);
      return other
        ? [done(a.type, assertion, "contradicted", `states ${moneyCents(other).map(formatCents).join(", ")} as fact ("${other}"), but the expected amount is ${formatCents(a.cents)}`)]
        : [done(a.type, assertion, "missing", `does not state ${formatCents(a.cents)} as fact`)];
    }
    case "id": {
      const assertion = `names the id of the ${describePattern(a.of)}`;
      const ids = resolveRef({ id_of: a.of }, records) as string[];
      const about = [a.of];
      if (ids.length === 0) return [{ result: { type: a.type, assertion, status: "missing", detail: `cannot name it: no ${describePattern(a.of)} was committed` }, about }];
      const statedId = ids.find((id) => idMentions(text, id).stated.length > 0);
      if (statedId) return [{ result: { type: a.type, assertion, status: "pass", detail: statedId }, about }];
      const sameKind = records.filter((r) => r.kind === a.of.kind).map((r) => r.id);
      const unknown = idLikeTokens(text, ids[0]).filter((t) => !sameKind.includes(t));
      const others = sameKind.filter((id) => !ids.includes(id) && idMentions(text, id).stated.length > 0);
      if (unknown.length > 0) {
        return [{ result: { type: a.type, assertion, status: "contradicted", detail: `names ${unknown.join(", ")}, which no committed ${a.of.kind} has; the matching ${a.of.kind} is ${ids.join(" or ")}` }, about }];
      }
      if (others.length > 0) {
        return [{ result: { type: a.type, assertion, status: "contradicted", detail: `names ${others.join(", ")}, but the ${describePattern(a.of)} is ${ids.join(" or ")}` }, about }];
      }
      return [{ result: { type: a.type, assertion, status: "missing", detail: `does not name ${ids.join(" or ")}` }, about }];
    }
    case "text": {
      const lower = text.toLowerCase();
      if (a.contains !== undefined) {
        const assertion = `contains ${JSON.stringify(a.contains)}`;
        const found = lower.includes(a.contains.toLowerCase());
        return [done(a.type, assertion, found ? "pass" : "missing", found ? "found" : `does not contain ${JSON.stringify(a.contains)}`)];
      }
      if (a.notContains !== undefined) {
        const assertion = `does not contain ${JSON.stringify(a.notContains)}`;
        const found = lower.includes(a.notContains.toLowerCase());
        return [{ ...done(a.type, assertion, found ? "contradicted" : "pass", found ? `contains ${JSON.stringify(a.notContains)}` : "not found"), wording: true }];
      }
      const assertion = `matches /${a.matches}/`;
      const ok = new RegExp(a.matches!, "iu").test(text);
      return [done(a.type, assertion, ok ? "pass" : "missing", ok ? "matched" : `does not match /${a.matches}/`)];
    }
    case "boolean": {
      const expected = typeof a.equals === "boolean" ? a.equals : resolveRef(a.equals, records)[0] === true;
      const subject = a.keywords.join("/");
      const assertion = `says ${expected ? "yes" : "no"} to ${subject}${typeof a.equals === "boolean" ? "" : ` (${describeRef(a.equals)})`}`;
      const about = typeof a.equals === "boolean" ? [] : refPatterns(a.equals);
      const stated = statedBoolean(text, a.keywords);
      const quote = stated.clauses.map((c) => `"${truncate(c, 80)}"`).join(", ");
      if (stated.status === "missing") return [{ result: { type: a.type, assertion, status: "missing", detail: `does not say whether ${subject}` }, about }];
      if (stated.status === "ambiguous") return [{ result: { type: a.type, assertion, status: "ambiguous", detail: `mentions ${subject} without a clear yes or no: ${quote}` }, about }];
      return stated.value === expected
        ? [{ result: { type: a.type, assertion, status: "pass", detail: quote }, about }]
        : [{ result: { type: a.type, assertion, status: "contradicted", detail: `says ${stated.value ? "yes" : "no"} to ${subject} (${quote}), but the committed state says ${expected ? "yes" : "no"}` }, about }];
    }
    case "output": {
      const extracted = extractOutput(text, trace.finalOutput);
      if (extracted.status === "missing") return [done("output", "has structured output", "missing", "has no structured output (return { text, output } or one JSON block)")];
      if (extracted.status === "invalid") return [done("output", "has structured output", "invalid", extracted.detail)];
      const checks: Checked[] = [];
      if (a.schema) {
        const errors = validate(a.schema, extracted.value);
        if (errors.length) return [done("output", "output matches its schema", "invalid", errors.join("; "))];
        checks.push(done("output", "output matches its schema", "pass", extracted.source));
      }
      for (const [path, spec] of Object.entries(a.fields)) {
        const assertion = `output.${path} = ${isValueRef(spec) ? describeRef(spec) : JSON.stringify(spec)}`;
        const about = isValueRef(spec) ? refPatterns(spec) : [];
        const resolved = isValueRef(spec) ? resolveRef(spec, records) : [spec];
        const expected = resolved.length > 0 ? resolved : [null];
        const actual = readPath(extracted.value, path);
        if (actual === undefined) {
          checks.push({ result: { type: a.type, assertion, status: "missing", detail: `has no output.${path}` }, about });
        } else if (expected.some((v) => JSON.stringify(v) === JSON.stringify(actual))) {
          checks.push({ result: { type: a.type, assertion, status: "pass", detail: JSON.stringify(actual) }, about });
        } else {
          const want = expected.map((v) => JSON.stringify(v)).join(" or ");
          checks.push({ result: { type: a.type, assertion, status: "contradicted", detail: `reports ${path}=${JSON.stringify(actual)}, but the committed state gives ${want}` }, about });
        }
      }
      return checks;
    }
  }
}

function done(type: AnswerAssertion["type"], assertion: string, status: AssertionResult["status"], detail: string): Checked {
  return { result: { type, assertion, status, detail }, about: [] };
}

function refPatterns(ref: ValueRef): RecordPattern[] {
  if ("exists" in ref) return [ref.exists];
  if ("count" in ref) return [ref.count];
  if ("id_of" in ref) return [ref.id_of];
  return [ref.of];
}

function readPath(value: unknown, path: string): unknown {
  let current = value;
  for (const key of path.split(".")) {
    if (typeof current !== "object" || current === null || !Object.hasOwn(current, key)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
