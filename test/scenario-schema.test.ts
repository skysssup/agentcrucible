import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { builtinRegistry, loadExtension } from "../src/registry.js";
import { scenarioJsonSchema, SCENARIO_SCHEMA_URL } from "../src/scenario-schema.js";
import { bundledScenariosDir, scenarioFiles } from "../src/scenarios.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const schema = scenarioJsonSchema(builtinRegistry());
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
const check = ajv.compile(schema);
const errors = () => ajv.errorsText(check.errors, { separator: "\n" });

describe("scenario JSON Schema", () => {
  it("is a valid draft 2020-12 schema with the registry's worlds and fault kinds", () => {
    expect(schema.$id).toBe(SCENARIO_SCHEMA_URL);
    expect((schema.properties as Record<string, { enum?: string[] }>).world.enum).toEqual(["payments", "database", "email", "tickets", "filesystem"]);
    expect(((schema.$defs as Record<string, { properties: Record<string, { enum?: string[] }> }>).fault.properties.kind.enum ?? []).length).toBe(14);
  });

  it("accepts every bundled scenario", () => {
    const files = scenarioFiles(bundledScenariosDir());
    expect(files.length).toBeGreaterThan(20);
    for (const file of files) {
      const doc = parseYaml(readFileSync(file, "utf8")) as unknown;
      expect(check(doc), `${file}\n${errors()}`).toBe(true);
    }
  });

  it("generated for an extended registry, accepts that project's scenarios and names its world and record kinds", async () => {
    const extension = join(root, "examples", "inventory", "inventory.mjs");
    const registry = await loadExtension(builtinRegistry(), extension);
    const extended = scenarioJsonSchema(registry);
    expect((extended.properties as Record<string, { enum?: string[] }>).world.enum).toContain("inventory");
    const kinds = ((extended.$defs as Record<string, { properties: Record<string, { enum?: string[] }> }>).pattern.properties.kind.enum ?? []);
    expect(kinds).toContain("reservation");
    const validate = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true }).compile(extended);
    for (const file of scenarioFiles(join(root, "examples", "inventory", "scenarios"))) {
      expect(validate(parseYaml(readFileSync(file, "utf8"))), `${file}\n${ajv.errorsText(validate.errors)}`).toBe(true);
    }
    const doc = parseYaml(readFileSync(scenarioFiles(join(root, "examples", "inventory", "scenarios"))[0], "utf8")) as unknown;
    expect(check(doc), "the built-in schema does not know the inventory world").toBe(false);
  });

  it("rejects what the parser rejects: unknown keys, both world and worlds, bad verdicts, bad faults", () => {
    const base = { id: "t/x", world: "payments", description: "d", task: "t" };
    expect(check(base)).toBe(true);
    expect(check({ ...base, worlds: ["email"] })).toBe(false);
    expect(check({ id: "t/x", description: "d", task: "t" })).toBe(false);
    expect(check({ ...base, nonsense: 1 })).toBe(false);
    expect(check({ ...base, id: "Bad Id" })).toBe(false);
    expect(check({ ...base, version: 2 })).toBe(false);
    expect(check({ ...base, faults: [{ target: "create_refund" }] })).toBe(false);
    expect(check({ ...base, faults: [{ target: "create_refund", kind: "not_a_kind" }] })).toBe(false);
    expect(check({ ...base, faults: [{ target: "create_refund", kind: "timeout", on_call: 0 }] })).toBe(false);
    expect(check({ ...base, faults: [{ target: "*", kind: "timeout", on_call_range: [1, 3], probability: 0.5 }] })).toBe(true);
    expect(check({ ...base, expected_verdicts: { "naive-retry": "MAYBE" } })).toBe(false);
    expect(check({ ...base, expected_verdicts: { "naive-retry": "HARMFUL_ACTION", "openai:gpt-4o-mini": "SAFE_SUCCESS" } })).toBe(true);
    expect(check({ ...base, expect: { effects: [], outcomes: [{ name: "a" }] } })).toBe(false);
    expect(check({ ...base, expect: { effects: [{ kind: "refund", order_id: "1", amount_cents: { contains: { id_of: { kind: "refund" } } } }] } })).toBe(true);
    expect(check({ ...base, expect: { answer: [{ type: "text", contains: "a", matches: "b" }] } })).toBe(false);
    expect(check({ ...base, expect: { answer: [{ type: "boolean", keywords: "sent", equals: { exists: { kind: "email" } } }] } })).toBe(true);
    expect(check({ ...base, expect: { invariants: [{ name: "n", at_most: 1, of: { kind: "refund" }, when: { kind: "refund" } }] } })).toBe(false);
    expect(check({ ...base, budget: { max_calls: 0 } })).toBe(false);
    expect(check({ ...base, policies: { requireIdempotency: "yes" } })).toBe(false);
    expect(check({ ...base, $schema: SCENARIO_SCHEMA_URL })).toBe(true);
  });

  it("is committed at schema/scenario.schema.json in sync with the generator", () => {
    const path = join(root, "schema", "scenario.schema.json");
    expect(existsSync(path), "run npm run build to regenerate schema/scenario.schema.json").toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(schema);
  });
});
