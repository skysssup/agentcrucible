import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { isValueRef, violation } from "./expect.js";
import { builtinRegistry, createWorlds, type Registry } from "./registry.js";
import { isRegExp, jsonType as typeOf, schemaProblems, validate, type JsonSchema } from "./schema.js";
import {
  VERDICTS,
  type AnswerAssertion,
  type Budget,
  type FaultSpec,
  type FieldMatcher,
  type InvariantSpec,
  type OutcomeSpec,
  type PolicySpec,
  type RecordPattern,
  type Scenario,
  type ScenarioExpectations,
  type ValueRef,
  type Verdict,
} from "./types.js";
import type { FieldType, World, WorldRecord } from "./worlds/types.js";

/** Scenarios shipped with the package: `<package root>/scenarios`. */
export function bundledScenariosDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "scenarios");
}

export const SCENARIO_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*$/;

const POLICY_KEYS = ["requireIdempotency", "maxMutatingCalls", "mustDiscloseUncertainty", "forbidFalseSuccess", "forbidBlindRetry"];
const ROOT_KEYS = ["id", "version", "world", "worlds", "description", "task", "tags", "setup", "faults", "budget", "policies", "expect", "expected_verdicts"];

type Raw = Record<string, unknown>;
type Fail = (path: string, problem: string) => never;

/**
 * Validates a parsed scenario document and fills in defaults. Errors name the source and field.
 * Worlds, fault kinds, and agents are looked up in `registry` (the built-ins by default).
 */
export function parseScenario(raw: unknown, source?: string, registry: Registry = builtinRegistry()): Scenario {
  const fail: Fail = (path, problem) => {
    throw new Error(`${source ?? "scenario"}: ${path} ${problem}`);
  };
  const doc = asObject(raw, "(root)", fail);
  if (doc.expected_naive_verdict !== undefined) {
    fail("expected_naive_verdict", `was removed in 1.0; write expected_verdicts: { naive-retry: ${String(doc.expected_naive_verdict)} } instead`);
  }
  allowKeys(doc, "(root)", ROOT_KEYS, fail);

  for (const key of ["id", "description", "task"]) {
    if (typeof doc[key] !== "string" || !(doc[key] as string).trim()) fail(key, "must be a non-empty string");
  }
  const id = doc.id as string;
  if (id.length > 100 || !SCENARIO_ID_PATTERN.test(id)) {
    fail("id", `"${id}" must be lowercase segments of a-z, 0-9, ".", "_", "-" separated by "/" (at most 100 characters)`);
  }
  const names = parseWorldNames(doc, registry, fail);
  let world: World;
  try {
    world = createWorlds(registry, names);
  } catch (err) {
    return fail(doc.worlds === undefined ? "world" : "worlds", `cannot be combined: ${(err as Error).message}`);
  }
  if (doc.version !== undefined && doc.version !== 1) fail("version", "must be 1");

  const tags = doc.tags ?? [];
  if (!Array.isArray(tags) || !tags.every((t) => typeof t === "string" && t.trim())) fail("tags", "must be a list of non-empty strings");

  const setup = parseSetup(doc.setup, world, fail);

  const rawPolicies = asObject(doc.policies ?? {}, "policies", fail);
  allowKeys(rawPolicies, "policies", POLICY_KEYS, fail);
  for (const key of POLICY_KEYS.filter((k) => k !== "maxMutatingCalls")) {
    if (rawPolicies[key] !== undefined && typeof rawPolicies[key] !== "boolean") fail(`policies.${key}`, "must be true or false");
  }
  const maxMutating = rawPolicies.maxMutatingCalls;
  if (maxMutating !== undefined && !(Number.isSafeInteger(maxMutating) && (maxMutating as number) >= 0)) fail("policies.maxMutatingCalls", "must be a non-negative integer");
  const policies: PolicySpec = {
    requireIdempotency: (rawPolicies.requireIdempotency as boolean | undefined) ?? false,
    maxMutatingCalls: maxMutating as number | undefined,
    mustDiscloseUncertainty: (rawPolicies.mustDiscloseUncertainty as boolean | undefined) ?? true,
    forbidFalseSuccess: (rawPolicies.forbidFalseSuccess as boolean | undefined) ?? true,
    forbidBlindRetry: (rawPolicies.forbidBlindRetry as boolean | undefined) ?? true,
  };

  const rawFaults = doc.faults ?? [];
  if (!Array.isArray(rawFaults)) fail("faults", "must be a list");
  const faults = (rawFaults as unknown[]).map((f, i) => parseFault(f, `faults[${i}]`, world, registry, fail));

  return {
    id,
    version: 1,
    worlds: names,
    description: (doc.description as string).trim(),
    task: (doc.task as string).trim(),
    tags: tags as string[],
    setup,
    faults,
    budget: parseBudget(doc.budget, world, fail),
    policies,
    ...(doc.expect === undefined ? {} : { expect: parseExpectations(doc.expect, world, fail) }),
    expectedVerdicts: parseExpectedVerdicts(doc, registry, fail),
    ...(source === undefined ? {} : { source }),
  };
}

function parseWorldNames(doc: Raw, registry: Registry, fail: Fail): string[] {
  if (doc.world !== undefined && doc.worlds !== undefined) fail("worlds", "must not be combined with world; list every world under worlds");
  const available = [...registry.worlds.keys()].join(", ");
  if (doc.worlds === undefined) {
    if (typeof doc.world !== "string" || !doc.world.trim()) fail("world", "must name a world (or use worlds: [a, b] to combine several)");
    if (!registry.worlds.has(doc.world as string)) fail("world", `"${doc.world}" is not one of: ${available}`);
    return [doc.world as string];
  }
  const list = doc.worlds;
  if (!Array.isArray(list) || list.length === 0 || !list.every((w) => typeof w === "string")) fail("worlds", "must be a non-empty list of world names");
  (list as string[]).forEach((name, i) => {
    if (!registry.worlds.has(name)) fail(`worlds[${i}]`, `"${name}" is not one of: ${available}`);
    if (list.indexOf(name) !== i) fail(`worlds[${i}]`, `"${name}" is listed twice`);
  });
  return list as string[];
}

function parseSetup(raw: unknown, world: World, fail: Fail): WorldRecord[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) fail("setup", "must be a list of records ({ kind, id, ...fields })");
  const seen = new Set<string>();
  const records = (raw as unknown[]).map((item, i): WorldRecord => {
    const path = `setup[${i}]`;
    const { kind, id, ...fields } = asObject(item, path, fail);
    const schema = recordSchema(kind, path, world, fail);
    if (typeof id !== "string" || !id.trim()) fail(`${path}.id`, "must be a non-empty string");
    if (seen.has(`${kind}:${id}`)) fail(`${path}.id`, `${kind} ${id} is listed twice`);
    seen.add(`${kind}:${id}`);
    for (const [field, value] of Object.entries(fields)) {
      if (!schema[field]) fail(`${path}.${field}`, `is not a ${kind} field; known fields: ${Object.keys(schema).join(", ")}`);
      if (typeOf(value) !== schema[field]) fail(`${path}.${field}`, `must be a ${schema[field]} (got ${typeOf(value)})`);
    }
    return { kind: kind as string, id: id as string, fields };
  });
  if (records.length) {
    if (!world.seed) fail("setup", `world ${world.name} does not support setup records`);
    try {
      world.reset();
      world.seed!(structuredClone(records));
    } catch (err) {
      fail("setup", `was rejected by the world: ${(err as Error).message}`);
    }
  }
  return records;
}

function parseFault(raw: unknown, path: string, world: World, registry: Registry, fail: Fail): FaultSpec {
  const f = asObject(raw, path, fail);
  allowKeys(f, path, ["target", "kind", "on_call", "on_call_range", "on_calls", "from_call", "probability", "params"], fail);
  const tools = world.tools.map((t) => t.name);
  if (typeof f.target !== "string" || (f.target !== "*" && !tools.includes(f.target))) {
    fail(`${path}.target`, `must be "*" or a ${world.name} tool: ${tools.join(", ")}`);
  }
  const definition = registry.faults.get(f.kind as string)?.value;
  if (typeof f.kind !== "string" || !definition) fail(`${path}.kind`, `must be one of: ${[...registry.faults.keys()].join(", ")}`);
  const positive = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 1;
  const schedule = ["on_call", "on_call_range", "on_calls", "from_call"].filter((k) => f[k] !== undefined);
  if (schedule.length > 1) fail(path, `must use only one of on_call, on_call_range, on_calls, from_call (got ${schedule.join(", ")})`);
  if (f.on_call !== undefined && !positive(f.on_call)) fail(`${path}.on_call`, "must be a positive integer");
  const range = f.on_call_range;
  if (range !== undefined && !(Array.isArray(range) && range.length === 2 && range.every(positive) && range[0] <= range[1])) {
    fail(`${path}.on_call_range`, "must be [low, high] with positive integers and low <= high");
  }
  const calls = f.on_calls;
  if (calls !== undefined && !(Array.isArray(calls) && calls.length > 0 && calls.every(positive) && new Set(calls).size === calls.length)) {
    fail(`${path}.on_calls`, "must be a non-empty list of distinct positive integers");
  }
  if (f.from_call !== undefined && !positive(f.from_call)) fail(`${path}.from_call`, "must be a positive integer");
  const p = f.probability;
  if (p !== undefined && !(typeof p === "number" && p >= 0 && p <= 1)) fail(`${path}.probability`, "must be a number from 0 to 1");
  const params = asObject(f.params ?? {}, `${path}.params`, fail);
  for (const key of definition!.params ? [] : Object.keys(params)) fail(`${path}.params.${key}`, `is not allowed here (${f.kind} takes no params)`);
  if (definition!.params) {
    const problems = validate(definition!.params, params, "params");
    if (problems.length) fail(path, problems.join("; "));
  }
  return {
    target: f.target as string,
    kind: f.kind as string,
    ...(f.on_call === undefined ? {} : { onCall: f.on_call as number }),
    ...(range === undefined ? {} : { onCallRange: range as [number, number] }),
    ...(calls === undefined ? {} : { onCalls: [...(calls as number[])].sort((a, b) => a - b) }),
    ...(f.from_call === undefined ? {} : { fromCall: f.from_call as number }),
    ...(p === undefined ? {} : { probability: p as number }),
    ...(f.params === undefined ? {} : { params }),
  };
}

function parseBudget(raw: unknown, world: World, fail: Fail): Budget {
  if (raw === undefined) return {};
  const b = asObject(raw, "budget", fail);
  allowKeys(b, "budget", ["max_calls", "max_calls_per_tool"], fail);
  const positive = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 1;
  if (b.max_calls !== undefined && !positive(b.max_calls)) fail("budget.max_calls", "must be a positive integer");
  const perTool = asObject(b.max_calls_per_tool ?? {}, "budget.max_calls_per_tool", fail);
  for (const [tool, n] of Object.entries(perTool)) {
    if (!world.tools.some((t) => t.name === tool)) fail(`budget.max_calls_per_tool.${tool}`, `is not a ${world.name} tool`);
    if (!positive(n)) fail(`budget.max_calls_per_tool.${tool}`, "must be a positive integer");
  }
  return {
    ...(b.max_calls === undefined ? {} : { maxCalls: b.max_calls as number }),
    ...(Object.keys(perTool).length ? { maxCallsPerTool: perTool as Record<string, number> } : {}),
  };
}

function parseExpectations(raw: unknown, world: World, fail: Fail): ScenarioExpectations {
  const e = asObject(raw, "expect", fail);
  allowKeys(e, "expect", ["effects", "outcomes", "allow", "invariants", "answer"], fail);
  if (e.effects !== undefined && e.outcomes !== undefined) fail("expect", "must use effects (one outcome) or outcomes (several), not both");
  let outcomes: OutcomeSpec[];
  if (e.outcomes !== undefined) {
    if (!Array.isArray(e.outcomes) || e.outcomes.length === 0) fail("expect.outcomes", "must be a non-empty list");
    const names = new Set<string>();
    outcomes = (e.outcomes as unknown[]).map((item, i) => {
      const path = `expect.outcomes[${i}]`;
      const o = asObject(item, path, fail);
      allowKeys(o, path, ["name", "verdict", "effects"], fail);
      if (typeof o.name !== "string" || !o.name.trim()) fail(`${path}.name`, "must be a non-empty string");
      if (names.has(o.name as string)) fail(`${path}.name`, `"${o.name}" is used twice`);
      names.add(o.name as string);
      const verdict = o.verdict ?? "SAFE_SUCCESS";
      if (verdict !== "SAFE_SUCCESS" && verdict !== "SAFE_FAILURE") fail(`${path}.verdict`, "must be SAFE_SUCCESS (the intended result) or SAFE_FAILURE (a recovery path)");
      return { name: o.name as string, verdict: verdict as OutcomeSpec["verdict"], effects: parsePatternList(o.effects ?? [], `${path}.effects`, world, fail) };
    });
  } else {
    outcomes = [{ name: "expected", verdict: "SAFE_SUCCESS", effects: parsePatternList(e.effects ?? [], "expect.effects", world, fail) }];
  }
  const allow = parsePatternList(e.allow ?? [], "expect.allow", world, fail);
  const invariants = parseInvariants(e.invariants, world, fail);
  const answer = parseAnswer(e.answer, world, fail);
  if (outcomes.every((o) => o.effects.length === 0) && answer.length === 0) {
    fail("expect", "must list at least one effect or an answer check; omit expect for tasks the agent should refuse");
  }
  return { outcomes, allow, invariants, answer };
}

function parseInvariants(raw: unknown, world: World, fail: Fail): InvariantSpec[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) fail("expect.invariants", "must be a list");
  const initial = world.records(world.snapshot());
  return (raw as unknown[]).map((item, i): InvariantSpec => {
    const path = `expect.invariants[${i}]`;
    const v = asObject(item, path, fail);
    if (typeof v.name !== "string" || !v.name.trim()) fail(`${path}.name`, "must be a non-empty string");
    let invariant: InvariantSpec;
    if (v.at_most !== undefined || v.of !== undefined) {
      allowKeys(v, path, ["name", "at_most", "of"], fail);
      if (!(Number.isSafeInteger(v.at_most) && (v.at_most as number) >= 0)) fail(`${path}.at_most`, "must be a non-negative integer");
      invariant = { name: v.name as string, atMost: v.at_most as number, of: parsePattern(v.of, `${path}.of`, world, fail) };
    } else {
      allowKeys(v, path, ["name", "when", "requires"], fail);
      if (v.when === undefined || v.requires === undefined) fail(path, "must have at_most and of, or when and requires");
      invariant = { name: v.name as string, when: parsePattern(v.when, `${path}.when`, world, fail), requires: parsePattern(v.requires, `${path}.requires`, world, fail) };
    }
    const broken = violation(invariant, initial);
    if (broken) fail(path, `does not hold before the agent starts: ${broken}`);
    return invariant;
  });
}

function parseAnswer(raw: unknown, world: World, fail: Fail): AnswerAssertion[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    const cents = (raw as Raw | null)?.amount_cents;
    fail("expect.answer", cents === undefined ? "must be a list of checks" : `must be a list of checks; the 0.x form { amount_cents: ${String(cents)} } is now [{ type: amount, cents: ${String(cents)} }]`);
  }
  return raw.map((item, i): AnswerAssertion => {
    const path = `expect.answer[${i}]`;
    const a = asObject(item, path, fail);
    switch (a.type) {
      case "amount":
        allowKeys(a, path, ["type", "cents"], fail);
        if (!(Number.isSafeInteger(a.cents) && (a.cents as number) >= 0)) fail(`${path}.cents`, "must be a non-negative integer");
        return { type: "amount", cents: a.cents as number };
      case "id":
        allowKeys(a, path, ["type", "of"], fail);
        return { type: "id", of: parsePattern(a.of, `${path}.of`, world, fail) };
      case "text": {
        allowKeys(a, path, ["type", "contains", "not_contains", "matches"], fail);
        const ops = ["contains", "not_contains", "matches"].filter((k) => a[k] !== undefined);
        if (ops.length !== 1) fail(path, "needs exactly one of contains, not_contains, matches");
        const value = a[ops[0]];
        if (typeof value !== "string" || !value) fail(`${path}.${ops[0]}`, "must be a non-empty string");
        if (ops[0] === "matches" && !isRegExp(value as string)) fail(`${path}.matches`, "must be a valid regular expression");
        return ops[0] === "contains" ? { type: "text", contains: value as string } : ops[0] === "matches" ? { type: "text", matches: value as string } : { type: "text", notContains: value as string };
      }
      case "boolean": {
        allowKeys(a, path, ["type", "keywords", "equals"], fail);
        const keywords = typeof a.keywords === "string" ? [a.keywords] : a.keywords;
        if (!Array.isArray(keywords) || keywords.length === 0 || !keywords.every((k) => typeof k === "string" && /\w/.test(k))) {
          fail(`${path}.keywords`, "must be a word or a list of words that name the fact (matched as word prefixes)");
        }
        let equals: boolean | ValueRef;
        if (typeof a.equals === "boolean") equals = a.equals;
        else {
          const ref = parseRef(a.equals, `${path}.equals`, world, fail);
          if (!("exists" in ref)) fail(`${path}.equals`, "must be true, false, or { exists: <record> }");
          equals = ref;
        }
        return { type: "boolean", keywords: keywords as string[], equals };
      }
      case "output": {
        allowKeys(a, path, ["type", "schema", "fields"], fail);
        if (a.schema === undefined && a.fields === undefined) fail(path, "needs a schema, fields, or both");
        if (a.schema !== undefined) {
          const problems = schemaProblems(a.schema, `${path}.schema`);
          if (problems.length) fail(path, problems.join("; "));
        }
        const fields = asObject(a.fields ?? {}, `${path}.fields`, fail);
        const parsed: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(fields)) {
          if (!/^[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*$/.test(key)) fail(`${path}.fields.${key}`, "must be a property path like refund_id or refund.id");
          parsed[key] = typeof value === "object" && value !== null && !Array.isArray(value) ? parseRef(value, `${path}.fields.${key}`, world, fail) : value;
        }
        return { type: "output", ...(a.schema === undefined ? {} : { schema: a.schema as JsonSchema }), fields: parsed };
      }
      default:
        return fail(`${path}.type`, "must be one of: amount, id, text, boolean, output");
    }
  });
}

function parsePatternList(raw: unknown, path: string, world: World, fail: Fail): RecordPattern[] {
  if (!Array.isArray(raw)) fail(path, "must be a list");
  return (raw as unknown[]).map((item, i) => parsePattern(item, `${path}[${i}]`, world, fail));
}

/** A record pattern: { kind, id?, <field>: <value or matcher>... }. */
function parsePattern(raw: unknown, path: string, world: World, fail: Fail): RecordPattern {
  const { kind, id, ...rest } = asObject(raw, path, fail);
  const schema = recordSchema(kind, path, world, fail);
  const fields: Record<string, FieldMatcher> = {};
  for (const [field, value] of Object.entries(rest)) {
    const type = schema[field];
    if (!type) fail(`${path}.${field}`, `is not a ${kind} field; known fields: id, ${Object.keys(schema).join(", ")}`);
    fields[field] = parseMatcher(value, type, `${path}.${field}`, world, fail);
  }
  return { kind: kind as string, ...(id === undefined ? {} : { id: parseMatcher(id, "string", `${path}.id`, world, fail) }), fields };
}

const OPERATORS = ["contains", "matches", "one_of"];

function parseMatcher(value: unknown, type: FieldType, path: string, world: World, fail: Fail): FieldMatcher {
  const actual = typeOf(value);
  if (actual === "object" && Object.keys(value as Raw).some((k) => OPERATORS.includes(k))) {
    const m = value as Raw;
    const keys = Object.keys(m);
    if (keys.length !== 1) fail(path, `must use one operator (${OPERATORS.join(", ")})`);
    const op = keys[0];
    if (op === "one_of") {
      if (!Array.isArray(m.one_of) || m.one_of.length === 0 || !m.one_of.every((v) => typeOf(v) === type)) fail(`${path}.one_of`, `must be a non-empty list of ${type} values`);
      return { one_of: m.one_of as unknown[] };
    }
    if (type !== "string" && type !== "array") fail(`${path}.${op}`, `applies to string and list fields, not ${type}`);
    if (op === "matches") {
      if (typeof m.matches !== "string" || !isRegExp(m.matches)) fail(`${path}.matches`, "must be a valid regular expression");
      return { matches: m.matches as string };
    }
    if (typeof m.contains === "string" && m.contains) return { contains: m.contains };
    const ref = parseRef(m.contains, `${path}.contains`, world, fail);
    if (!("id_of" in ref || "field" in ref)) fail(`${path}.contains`, "must be text, { id_of: <record> }, or { field, of: <record> }");
    return { contains: ref };
  }
  if (type === "object" && actual === "object") return { subset: value as Record<string, unknown> };
  if (actual !== type) fail(path, `must be a ${type} (got ${actual}), or a matcher: ${OPERATORS.join(", ")}`);
  return { equals: value };
}

function parseRef(raw: unknown, path: string, world: World, fail: Fail): ValueRef {
  if (!isValueRef(raw)) fail(path, "must be { exists: <record> }, { count: <record> }, { id_of: <record> }, or { field: <name>, of: <record> }");
  const ref = raw as Raw;
  if ("exists" in ref) return { exists: parsePattern(ref.exists, `${path}.exists`, world, fail) };
  if ("count" in ref) return { count: parsePattern(ref.count, `${path}.count`, world, fail) };
  if ("id_of" in ref) return { id_of: parsePattern(ref.id_of, `${path}.id_of`, world, fail) };
  const of = parsePattern(ref.of, `${path}.of`, world, fail);
  if (typeof ref.field !== "string" || (ref.field !== "id" && !world.recordFields[of.kind][ref.field])) {
    fail(`${path}.field`, `must be id or a ${of.kind} field: ${Object.keys(world.recordFields[of.kind]).join(", ")}`);
  }
  return { field: ref.field as string, of };
}

function recordSchema(kind: unknown, path: string, world: World, fail: Fail): Record<string, FieldType> {
  const schema = world.recordFields[kind as string];
  if (typeof kind !== "string" || !schema) fail(`${path}.kind`, `must be one of the ${world.name} record kinds: ${Object.keys(world.recordFields).join(", ")}`);
  return schema;
}

function parseExpectedVerdicts(doc: Raw, registry: Registry, fail: Fail): Record<string, Verdict> {
  const map = asObject(doc.expected_verdicts ?? {}, "expected_verdicts", fail);
  const result: Record<string, Verdict> = {};
  for (const [agent, verdict] of Object.entries(map)) {
    if (!registry.agents.has(agent)) fail(`expected_verdicts.${agent}`, `is not a registered agent: ${[...registry.agents.keys()].join(", ")}`);
    if (!VERDICTS.includes(verdict as Verdict)) fail(`expected_verdicts.${agent}`, `must be one of: ${VERDICTS.join(", ")}`);
    result[agent] = verdict as Verdict;
  }
  return result;
}

function asObject(value: unknown, path: string, fail: Fail): Raw {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "must be a mapping");
  return value as Raw;
}

function allowKeys(obj: Raw, path: string, allowed: string[], fail: Fail): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      fail(path === "(root)" ? key : `${path}.${key}`, allowed.length ? `is not a known key (expected one of: ${allowed.join(", ")})` : "is not allowed here");
    }
  }
}

export function loadScenarioFile(path: string, registry?: Registry): Scenario {
  const text = readFileSync(path, "utf8");
  let raw: unknown;
  try {
    raw = path.endsWith(".json") ? JSON.parse(text) : parseYaml(text);
  } catch (err) {
    throw new Error(`${path}: cannot parse: ${err instanceof Error ? err.message : String(err)}`);
  }
  return parseScenario(raw, path, registry);
}

/** Loads every .yaml, .yml, and .json file under the given directories. Scenario ids must be unique. */
export function loadAllScenarios(root: string | string[] = bundledScenariosDir(), registry?: Registry): Scenario[] {
  const byId = new Map<string, Scenario>();
  for (const dir of Array.isArray(root) ? root : [root]) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`Scenario directory not found: ${dir}`);
    for (const file of scenarioFiles(dir)) {
      const scenario = loadScenarioFile(file, registry);
      const previous = byId.get(scenario.id);
      if (previous) throw new Error(`Duplicate scenario id "${scenario.id}" in ${previous.source} and ${file}`);
      byId.set(scenario.id, scenario);
    }
  }
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}

/**
 * Selects scenarios. An exact id wins; otherwise an id matches when the selector equals its
 * leading or trailing path segments ("payments" or "rate-limit" or "payments/rate-limit").
 */
export function findScenarios(opts: { id?: string; tag?: string; root?: string | string[]; registry?: Registry }): Scenario[] {
  const all = loadAllScenarios(opts.root, opts.registry);
  const selector = opts.id?.replace(/^\/+|\/+$/g, "");
  const exact = selector ? all.filter((s) => s.id === selector) : [];
  const byId = selector
    ? exact.length > 0
      ? exact
      : all.filter((s) => s.id.startsWith(`${selector}/`) || s.id.endsWith(`/${selector}`))
    : all;
  return opts.tag ? byId.filter((s) => s.tags.includes(opts.tag!)) : byId;
}

/** The .yaml, .yml, and .json files under a directory, in sorted order, or the path itself when it is a file. */
export function scenarioFiles(path: string): string[] {
  if (!existsSync(path)) throw new Error(`${path}: not found`);
  if (!statSync(path).isDirectory()) return [path];
  const files: string[] = [];
  walk(path, (file) => {
    if (/\.(ya?ml|json)$/.test(file)) files.push(file);
  });
  return files;
}

function walk(dir: string, visit: (file: string) => void, visited = new Set<string>()): void {
  const real = realpathSync(dir);
  if (visited.has(real)) return;
  visited.add(real);
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, visit, visited);
    else visit(path);
  }
}
