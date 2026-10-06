import { builtinRegistry, type Registry } from "./registry.js";
import { SCENARIO_ID_PATTERN } from "./scenarios.js";
import { VERDICTS } from "./types.js";

/** Where the committed copy of the schema for the built-in registry lives, for editors. */
export const SCENARIO_SCHEMA_URL = "https://raw.githubusercontent.com/skysssup/agentcrucible/main/schema/scenario.schema.json";

type Json = Record<string, unknown>;

const positiveInt: Json = { type: "integer", minimum: 1 };

/**
 * JSON Schema (draft 2020-12) for scenario files, with the registry's worlds and fault kinds as
 * enums so editors complete them. `parseScenario` remains the authority: it also checks what a
 * schema cannot, such as fields against each world's record kinds and invariants against the
 * initial state.
 */
export function scenarioJsonSchema(registry: Registry = builtinRegistry()): Json {
  const worlds = [...registry.worlds.keys()];
  const kinds = [...registry.faults.keys()];
  const recordKinds = [...new Set(worlds.flatMap((w) => Object.keys(registry.worlds.get(w)!.value().recordFields)))];
  const tools = [...new Set(worlds.flatMap((w) => registry.worlds.get(w)!.value().tools.map((t) => t.name)))];
  const agents = [...registry.agents.keys()];
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: SCENARIO_SCHEMA_URL,
    title: "AgentCrucible scenario",
    description: "A fault-injection scenario: a task, the mock worlds it runs in, the faults to inject, and what a correct run commits and says.",
    type: "object",
    additionalProperties: false,
    required: ["id", "description", "task"],
    oneOf: [{ required: ["world"] }, { required: ["worlds"] }],
    properties: {
      $schema: { type: "string", description: "Editor hint; ignored." },
      id: { type: "string", pattern: SCENARIO_ID_PATTERN.source, maxLength: 100, description: 'Lowercase segments separated by "/", such as payments/timeout-after-commit.' },
      version: { const: 1 },
      world: { type: "string", enum: worlds, description: "The one world the agent works in." },
      worlds: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", enum: worlds }, description: "Several worlds; their tools are combined." },
      description: { type: "string", minLength: 1 },
      task: { type: "string", minLength: 1, description: "What the agent is asked to do." },
      tags: { type: "array", items: { type: "string", minLength: 1 }, description: "Selectors for --tag." },
      setup: {
        type: "array",
        description: "Records added to the worlds before every trial.",
        items: {
          type: "object",
          required: ["kind", "id"],
          properties: { kind: { type: "string", enum: recordKinds }, id: { type: "string", minLength: 1 } },
          additionalProperties: true,
        },
      },
      faults: { type: "array", items: { $ref: "#/$defs/fault" } },
      budget: {
        type: "object",
        additionalProperties: false,
        properties: {
          max_calls: { ...positiveInt, description: "Calls per trial; further calls are refused with EBUDGET." },
          max_calls_per_tool: { type: "object", additionalProperties: positiveInt, propertyNames: { enum: tools } },
        },
      },
      policies: {
        type: "object",
        additionalProperties: false,
        properties: {
          requireIdempotency: { type: "boolean", description: "Committed mutating calls must carry an idempotency key (default false)." },
          maxMutatingCalls: { type: "integer", minimum: 0, description: "Maximum committed, non-deduplicated mutating calls." },
          mustDiscloseUncertainty: { type: "boolean", description: "The answer must disclose uncertainty after any tool error (default true)." },
          forbidFalseSuccess: { type: "boolean", description: "The answer must not claim success after tool errors without acknowledging them (default true)." },
          forbidBlindRetry: { type: "boolean", description: "Repeating a mutating call so that it commits again is forbidden (default true)." },
        },
      },
      expect: {
        type: "object",
        additionalProperties: false,
        description: "What a correct run commits and says. Without it no trial can be SAFE_SUCCESS.",
        not: { required: ["effects", "outcomes"] },
        properties: {
          effects: { type: "array", items: { $ref: "#/$defs/pattern" }, description: "Every change a correct run commits, each exactly once." },
          outcomes: {
            type: "array",
            minItems: 1,
            description: "Several acceptable end states, in order of preference.",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name"],
              properties: {
                name: { type: "string", minLength: 1 },
                verdict: { enum: ["SAFE_SUCCESS", "SAFE_FAILURE"], description: "SAFE_SUCCESS for the intended result, SAFE_FAILURE for a recovery path." },
                effects: { type: "array", items: { $ref: "#/$defs/pattern" } },
              },
            },
          },
          allow: { type: "array", items: { $ref: "#/$defs/pattern" }, description: "Changes any outcome may include without requiring them." },
          invariants: {
            type: "array",
            items: {
              oneOf: [
                { type: "object", additionalProperties: false, required: ["name", "at_most", "of"], properties: { name: { type: "string", minLength: 1 }, at_most: { type: "integer", minimum: 0 }, of: { $ref: "#/$defs/pattern" } } },
                { type: "object", additionalProperties: false, required: ["name", "when", "requires"], properties: { name: { type: "string", minLength: 1 }, when: { $ref: "#/$defs/pattern" }, requires: { $ref: "#/$defs/pattern" } } },
              ],
            },
          },
          answer: { type: "array", items: { $ref: "#/$defs/assertion" } },
        },
      },
      expected_verdicts: {
        type: "object",
        description: "Aggregate verdict each agent should receive with the default seed; `check` verifies them. Keys are agent ids or provider:model.",
        additionalProperties: { enum: [...VERDICTS] },
        propertyNames: { anyOf: [{ enum: agents }, { pattern: "^(openai|anthropic|ollama):\\S+$" }, { type: "string" }] },
      },
    },
    $defs: {
      fault: {
        type: "object",
        additionalProperties: false,
        required: ["target", "kind"],
        properties: {
          target: { type: "string", description: 'A tool of the scenario\'s worlds, or "*" for any.', anyOf: [{ const: "*" }, { enum: tools }, { type: "string" }] },
          kind: { type: "string", enum: kinds },
          on_call: { ...positiveInt, description: "Fault only this call of the tool (1-indexed)." },
          on_call_range: { type: "array", items: positiveInt, minItems: 2, maxItems: 2, description: "Fault one call in this range, chosen per trial from the seed." },
          on_calls: { type: "array", items: positiveInt, minItems: 1, uniqueItems: true },
          from_call: { ...positiveInt, description: "Fault this call and every later one." },
          probability: { type: "number", minimum: 0, maximum: 1 },
          params: { type: "object" },
        },
      },
      pattern: {
        type: "object",
        description: "Selects records of one kind whose id and fields match. A field is a plain value (equals) or a matcher.",
        required: ["kind"],
        properties: { kind: { type: "string", enum: recordKinds }, id: { $ref: "#/$defs/matcher" } },
        additionalProperties: { $ref: "#/$defs/matcher" },
      },
      matcher: {
        anyOf: [
          { type: ["string", "number", "boolean", "null"] },
          { type: "array" },
          { type: "object", additionalProperties: false, required: ["contains"], properties: { contains: { anyOf: [{ type: "string", minLength: 1 }, { $ref: "#/$defs/ref" }] } } },
          { type: "object", additionalProperties: false, required: ["matches"], properties: { matches: { type: "string" } } },
          { type: "object", additionalProperties: false, required: ["one_of"], properties: { one_of: { type: "array", minItems: 1 } } },
          { type: "object", description: "For object fields: every listed key must match." },
        ],
      },
      ref: {
        description: "A value computed from the committed records at the end of the trial.",
        oneOf: [
          { type: "object", additionalProperties: false, required: ["exists"], properties: { exists: { $ref: "#/$defs/pattern" } } },
          { type: "object", additionalProperties: false, required: ["count"], properties: { count: { $ref: "#/$defs/pattern" } } },
          { type: "object", additionalProperties: false, required: ["id_of"], properties: { id_of: { $ref: "#/$defs/pattern" } } },
          { type: "object", additionalProperties: false, required: ["field", "of"], properties: { field: { type: "string", minLength: 1 }, of: { $ref: "#/$defs/pattern" } } },
        ],
      },
      assertion: {
        oneOf: [
          { type: "object", additionalProperties: false, required: ["type", "cents"], properties: { type: { const: "amount" }, cents: { type: "integer", minimum: 0 } } },
          { type: "object", additionalProperties: false, required: ["type", "of"], properties: { type: { const: "id" }, of: { $ref: "#/$defs/pattern" } } },
          {
            type: "object",
            additionalProperties: false,
            required: ["type"],
            properties: { type: { const: "text" }, contains: { type: "string", minLength: 1 }, not_contains: { type: "string", minLength: 1 }, matches: { type: "string", minLength: 1 } },
            oneOf: [{ required: ["contains"] }, { required: ["not_contains"] }, { required: ["matches"] }],
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "keywords", "equals"],
            properties: {
              type: { const: "boolean" },
              keywords: { anyOf: [{ type: "string", minLength: 1 }, { type: "array", minItems: 1, items: { type: "string", minLength: 1 } }] },
              equals: { anyOf: [{ type: "boolean" }, { type: "object", additionalProperties: false, required: ["exists"], properties: { exists: { $ref: "#/$defs/pattern" } } }] },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type"],
            anyOf: [{ required: ["schema"] }, { required: ["fields"] }],
            properties: { type: { const: "output" }, schema: { type: "object" }, fields: { type: "object" } },
          },
        ],
      },
    },
  };
}
