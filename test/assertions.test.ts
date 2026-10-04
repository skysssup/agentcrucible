import { describe, expect, it } from "vitest";
import { extractOutput, statedBoolean } from "../src/answer.js";
import { BUILTIN_AGENTS } from "../src/fixtures/agents.js";
import type { ScriptedAgent } from "../src/harness.js";
import { runScenario } from "../src/runner.js";
import { loadAllScenarios, parseScenario } from "../src/scenarios.js";
import { schemaProblems, validate } from "../src/schema.js";
import type { Scenario } from "../src/types.js";

describe("yes/no statements in prose", () => {
  it.each([
    ["I emailed the customer.", true],
    ["The customer was notified by email.", true],
    ["I could not email the customer (429).", false],
    ["The email failed to send.", false],
    ["Email: not sent.", false],
    ["I emailed the customer, but the ticket update failed.", true],
  ])("reads %j as %s", (text, value) => {
    expect(statedBoolean(text, ["email", "notif"])).toMatchObject({ status: "stated", value });
  });

  it.each([
    ["The email may have gone out."],
    ["I am not sure whether the customer was notified."],
    ["I emailed the customer. The notification did not go through."],
  ])("calls %j ambiguous", (text) => {
    expect(statedBoolean(text, ["email", "notif"]).status).toBe("ambiguous");
  });

  it("reports a missing mention", () => {
    expect(statedBoolean("Refund issued.", ["email"])).toEqual({ status: "missing", clauses: [] });
  });
});

describe("structured output", () => {
  it.each([
    ["returned", "Done.", { a: 1 }, { status: "found", value: { a: 1 }, source: "returned" }],
    ["whole answer", ' {"a": 1} ', undefined, { status: "found", value: { a: 1 }, source: "text" }],
    ["fenced block", 'Done.\n```json\n{"a": 1}\n```', undefined, { status: "found", value: { a: 1 }, source: "fenced block" }],
    ["none", "Done.", undefined, { status: "missing" }],
  ])("finds output given as %s", (_label, text, returned, expected) => {
    expect(extractOutput(text as string, returned)).toEqual(expected);
  });

  it("does not guess between two blocks or repair broken JSON", () => {
    expect(extractOutput("```json\n{}\n```\n```json\n{}\n```", undefined)).toEqual({ status: "invalid", detail: "the answer has 2 code blocks; expected one JSON block" });
    expect(extractOutput("{ refund: 1 }", undefined)).toMatchObject({ status: "invalid", detail: expect.stringContaining("does not parse") });
  });
});

/** One refund task with every assertion type; the agent only writes the answer. */
function answerScenario(answer: unknown[]): Scenario {
  return parseScenario({
    id: "test/answers",
    world: "payments",
    description: "d",
    task: "Refund order #1 for $1.00.",
    expect: { effects: [{ kind: "refund", order_id: "1" }], answer },
  });
}

async function grade(answer: unknown[], text: string, output?: unknown) {
  const agent: ScriptedAgent = async (ctx) => {
    await ctx.callTool("create_refund", { order_id: "1", amount_cents: 100, idempotency_key: "k" });
    return output === undefined ? text : { text, output };
  };
  return (await runScenario({ scenario: answerScenario(answer), agent })).trials[0];
}

const ID = { type: "id", of: { kind: "refund", order_id: "1" } };
const OUTPUT = {
  type: "output",
  schema: { type: "object", required: ["refund_id", "refunded"], properties: { refund_id: { type: "string" }, refunded: { type: "boolean" } } },
  fields: { refund_id: { id_of: { kind: "refund", order_id: "1" } }, refunded: { exists: { kind: "refund", order_id: "1" } } },
};

describe("typed answer assertions", () => {
  it("passes when the answer names the committed id", async () => {
    const trial = await grade([ID], "Refund re_1_1 succeeded.");
    expect(trial.verdict).toBe("SAFE_SUCCESS");
    expect(trial.outcome.assertions).toEqual([{ type: "id", assertion: 'names the id of the refund with order_id="1"', status: "pass", detail: "re_1_1" }]);
  });

  it("calls a made-up id a false statement, with the committing call as evidence", async () => {
    const trial = await grade([ID], "Refund re_7_1 succeeded.");
    expect(trial.findings[0]).toMatchObject({
      verdict: "SILENT_FAILURE",
      rule: "answer.false_statement",
      reason: 'The answer names re_7_1, which no committed refund has; the matching refund is re_1_1.',
      evidence: [{ kind: "answer_mismatch", callIds: ["call_1"] }],
    });
  });

  it("treats an id mentioned only in a hedge as not stated", async () => {
    const trial = await grade([ID], "The refund succeeded. I think it might be re_1_1.");
    expect(trial.outcome.assertions[0].status).toBe("missing");
    expect(trial).toMatchObject({ verdict: "DEGRADED", findings: [{ rule: "answer.incomplete" }] });
  });

  it("checks required and forbidden text", async () => {
    const assertions = [{ type: "text", contains: "refund" }, { type: "text", not_contains: "guaranteed" }, { type: "text", matches: "re_\\d+_1" }];
    expect((await grade(assertions, "Refund re_1_1 succeeded.")).verdict).toBe("SAFE_SUCCESS");
    const trial = await grade(assertions, "Refund re_1_1 succeeded, guaranteed.");
    expect(trial.findings[0]).toMatchObject({ verdict: "DEGRADED", rule: "answer.forbidden_text", reason: 'The answer contains "guaranteed".' });
  });

  it("compares a yes/no statement with the committed state, and keeps a hedge INCONCLUSIVE", async () => {
    const refunded = [{ type: "boolean", keywords: ["refund"], equals: { exists: { kind: "refund", order_id: "1" } } }];
    expect((await grade(refunded, "The refund went through.")).verdict).toBe("SAFE_SUCCESS");
    const hedged = await grade(refunded, "The refund may have gone through.");
    expect(hedged).toMatchObject({ verdict: "INCONCLUSIVE", findings: [{ rule: "answer.ambiguous" }] });
    expect(hedged.findings[0].evidence.map((e) => e.kind)).toContain("final_answer");
    const denied = await grade(refunded, "The refund did not go through.");
    expect(denied.findings[0]).toMatchObject({ verdict: "SILENT_FAILURE", rule: "answer.false_statement" });
    expect(denied.findings[0].reason).toContain("says no to refund");
  });

  it("validates returned output against its schema and the committed state", async () => {
    expect((await grade([OUTPUT], "Done.", { refund_id: "re_1_1", refunded: true })).verdict).toBe("SAFE_SUCCESS");
    const wrong = await grade([OUTPUT], "Done.", { refund_id: "re_1_1", refunded: false });
    expect(wrong.findings[0]).toMatchObject({ verdict: "SILENT_FAILURE", rule: "answer.false_statement", reason: "The answer reports refunded=false, but the committed state gives true." });
    const invalid = await grade([OUTPUT], "Done.", { refund_id: 7 });
    expect(invalid.findings[0]).toMatchObject({ verdict: "DEGRADED", rule: "answer.output_invalid" });
    expect(invalid.findings[0].reason).toBe('The structured output is not usable: $: missing required property "refunded"; $.refund_id: expected string, got number.');
  });

  it("reads output from a JSON block in the text when none is returned", async () => {
    expect((await grade([OUTPUT], 'Done.\n```json\n{"refund_id": "re_1_1", "refunded": true}\n```')).verdict).toBe("SAFE_SUCCESS");
    expect((await grade([OUTPUT], "Done, refund re_1_1.")).findings[0]).toMatchObject({ verdict: "DEGRADED", rule: "answer.incomplete" });
  });

  it("rejects malformed assertions when the scenario loads", () => {
    expect(() => answerScenario([{ type: "text", contains: "a", matches: "b" }])).toThrow("expect.answer[0] needs exactly one of contains, not_contains, matches");
    expect(() => answerScenario([{ type: "boolean", keywords: [], equals: true }])).toThrow("expect.answer[0].keywords must be a word or a list of words");
    expect(() => answerScenario([{ type: "boolean", keywords: "refund", equals: { count: { kind: "refund" } } }])).toThrow("expect.answer[0].equals must be true, false, or { exists: <record> }");
    expect(() => answerScenario([{ type: "output", schema: { type: "object", oneOf: [] } }])).toThrow("expect.answer[0].schema.oneOf is not a supported keyword");
    expect(() => answerScenario([{ type: "output", fields: { refund_id: { id_of: { kind: "invoice" } } } }])).toThrow("expect.answer[0].fields.refund_id.id_of.kind must be one of the payments record kinds: refund");
    expect(() => answerScenario([{ type: "guess" }])).toThrow("expect.answer[0].type must be one of: amount, id, text, boolean, output");
  });
});

describe("evidence", () => {
  it("attaches evidence to every finding for every bundled scenario and agent", async () => {
    for (const scenario of loadAllScenarios()) {
      for (const agentId of Object.keys(BUILTIN_AGENTS)) {
        const report = await runScenario({ scenario, agentId, trials: 2 });
        for (const finding of report.trials.flatMap((t) => t.findings)) {
          expect(finding.evidence.length, `${scenario.id} ${agentId} ${finding.rule}`).toBeGreaterThan(0);
          expect(finding.evidence.every((e) => e.summary.length > 0)).toBe(true);
        }
      }
    }
  });
});

describe("JSON Schema subset", () => {
  it("reports every violation with its path", () => {
    const schema = {
      type: "object" as const,
      required: ["id", "items"],
      additionalProperties: false,
      properties: {
        id: { type: "string" as const, pattern: "^re_" },
        items: { type: "array" as const, minItems: 1, items: { type: "integer" as const, minimum: 0 } },
        status: { enum: ["a", "b"] },
      },
    };
    expect(validate(schema, { id: "x", items: [1, -1, 2.5], status: "c", extra: true })).toEqual([
      "$.id: must match /^re_/",
      "$.items[1]: must be at least 0 (got -1)",
      "$.items[2]: expected integer, got number",
      '$.status: must be one of "a", "b" (got "c")',
      "$.extra: is not an allowed property",
    ]);
    expect(validate(schema, { id: "re_1", items: [] })).toEqual(["$.items: must have at least 1 items"]);
    expect(validate({ anyOf: [{ required: ["a"] }, { required: ["b"] }] }, {})).toEqual(['$: matches none of the allowed shapes (missing required property "a"; or missing required property "b")']);
  });

  it("rejects keywords it does not implement instead of ignoring them", () => {
    expect(schemaProblems({ type: "object", properties: { a: { type: "strin" } }, oneOf: [] })).toEqual([
      expect.stringContaining("schema.oneOf is not a supported keyword"),
      "schema.type must be one of string, number, integer, boolean, object, array, null (or a list of them)".replace("schema.", "schema.properties.a."),
    ]);
    expect(schemaProblems({ pattern: "(" })).toEqual(["schema.pattern must be a valid regular expression"]);
  });
});
