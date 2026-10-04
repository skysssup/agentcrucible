import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { AGENTS } from "./fixtures/agents.js";
import {
  FAULT_KINDS,
  VERDICTS,
  type EffectExpectation,
  type FaultKind,
  type FaultSpec,
  type PolicySpec,
  type Scenario,
  type ScenarioExpectations,
  type Verdict,
} from "./types.js";
import { createWorld, listWorlds } from "./worlds/index.js";
import type { World } from "./worlds/types.js";

/** Scenarios shipped with the package: `<package root>/scenarios`. */
export function bundledScenariosDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "scenarios");
}

export const SCENARIO_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*$/;

const POLICY_KEYS = ["requireIdempotency", "maxMutatingCalls", "mustDiscloseUncertainty", "forbidFalseSuccess", "forbidBlindRetry"];
const FAULT_PARAMS: Partial<Record<FaultKind, string[]>> = {
  silent_wrong_data: ["field", "delta"],
  stale_cache: ["field", "stale_value"],
};

type Raw = Record<string, unknown>;
type Fail = (path: string, problem: string) => never;

/** Validates a parsed scenario document and fills in defaults. Errors name the source and field. */
export function parseScenario(raw: unknown, source?: string): Scenario {
  const fail: Fail = (path, problem) => {
    throw new Error(`${source ?? "scenario"}: ${path} ${problem}`);
  };
  const doc = asObject(raw, "(root)", fail);
  allowKeys(doc, "(root)", ["id", "version", "world", "description", "task", "tags", "faults", "policies", "expect", "expected_verdicts", "expected_naive_verdict"], fail);

  for (const key of ["id", "world", "description", "task"]) {
    if (typeof doc[key] !== "string" || !(doc[key] as string).trim()) fail(key, "must be a non-empty string");
  }
  const id = doc.id as string;
  if (id.length > 100 || !SCENARIO_ID_PATTERN.test(id)) {
    fail("id", `"${id}" must be lowercase segments of a-z, 0-9, ".", "_", "-" separated by "/" (at most 100 characters)`);
  }
  if (!listWorlds().includes(doc.world as string)) fail("world", `"${doc.world}" is not one of: ${listWorlds().join(", ")}`);
  const world = createWorld(doc.world as string);
  if (doc.version !== undefined && doc.version !== 1) fail("version", "must be 1");

  const tags = doc.tags ?? [];
  if (!Array.isArray(tags) || !tags.every((t) => typeof t === "string" && t.trim())) fail("tags", "must be a list of non-empty strings");

  const rawPolicies = asObject(doc.policies ?? {}, "policies", fail);
  allowKeys(rawPolicies, "policies", POLICY_KEYS, fail);
  for (const key of POLICY_KEYS.filter((k) => k !== "maxMutatingCalls")) {
    if (rawPolicies[key] !== undefined && typeof rawPolicies[key] !== "boolean") fail(`policies.${key}`, "must be true or false");
  }
  const budget = rawPolicies.maxMutatingCalls;
  if (budget !== undefined && !(Number.isSafeInteger(budget) && (budget as number) >= 0)) fail("policies.maxMutatingCalls", "must be a non-negative integer");
  const policies: PolicySpec = {
    requireIdempotency: (rawPolicies.requireIdempotency as boolean | undefined) ?? false,
    maxMutatingCalls: budget as number | undefined,
    mustDiscloseUncertainty: (rawPolicies.mustDiscloseUncertainty as boolean | undefined) ?? true,
    forbidFalseSuccess: (rawPolicies.forbidFalseSuccess as boolean | undefined) ?? true,
    forbidBlindRetry: (rawPolicies.forbidBlindRetry as boolean | undefined) ?? true,
  };

  const rawFaults = doc.faults ?? [];
  if (!Array.isArray(rawFaults)) fail("faults", "must be a list");
  const faults = (rawFaults as unknown[]).map((f, i) => parseFault(f, `faults[${i}]`, world, fail));

  return {
    id,
    version: 1,
    world: world.name,
    description: (doc.description as string).trim(),
    task: (doc.task as string).trim(),
    tags: tags as string[],
    faults,
    policies,
    ...(doc.expect === undefined ? {} : { expect: parseExpectations(doc.expect, world, fail) }),
    expectedVerdicts: parseExpectedVerdicts(doc, fail),
    ...(source === undefined ? {} : { source }),
  };
}

function parseFault(raw: unknown, path: string, world: World, fail: Fail): FaultSpec {
  const f = asObject(raw, path, fail);
  allowKeys(f, path, ["target", "kind", "on_call", "on_call_range", "probability", "params"], fail);
  const tools = world.tools.map((t) => t.name);
  if (typeof f.target !== "string" || (f.target !== "*" && !tools.includes(f.target))) {
    fail(`${path}.target`, `must be "*" or a ${world.name} tool: ${tools.join(", ")}`);
  }
  if (!FAULT_KINDS.includes(f.kind as FaultKind)) fail(`${path}.kind`, `must be one of: ${FAULT_KINDS.join(", ")}`);
  const kind = f.kind as FaultKind;
  if (f.on_call !== undefined && !(Number.isSafeInteger(f.on_call) && (f.on_call as number) >= 1)) fail(`${path}.on_call`, "must be a positive integer");
  const range = f.on_call_range;
  if (range !== undefined) {
    if (!Array.isArray(range) || range.length !== 2 || !range.every((v) => Number.isSafeInteger(v) && v >= 1) || range[0] > range[1]) {
      fail(`${path}.on_call_range`, "must be [low, high] with positive integers and low <= high");
    }
    if (f.on_call !== undefined) fail(path, "must not set both on_call and on_call_range");
  }
  const p = f.probability;
  if (p !== undefined && !(typeof p === "number" && p >= 0 && p <= 1)) fail(`${path}.probability`, "must be a number from 0 to 1");
  const params = asObject(f.params ?? {}, `${path}.params`, fail);
  allowKeys(params, `${path}.params`, FAULT_PARAMS[kind] ?? [], fail);
  if (params.field !== undefined && (typeof params.field !== "string" || !params.field)) fail(`${path}.params.field`, "must be a non-empty string");
  if (params.delta !== undefined && !(typeof params.delta === "number" && Number.isFinite(params.delta))) fail(`${path}.params.delta`, "must be a finite number");
  return {
    target: f.target as string,
    kind,
    ...(f.on_call === undefined ? {} : { onCall: f.on_call as number }),
    ...(range === undefined ? {} : { onCallRange: range as [number, number] }),
    ...(p === undefined ? {} : { probability: p as number }),
    ...(f.params === undefined ? {} : { params }),
  };
}

function parseExpectations(raw: unknown, world: World, fail: Fail): ScenarioExpectations {
  const e = asObject(raw, "expect", fail);
  allowKeys(e, "expect", ["effects", "answer"], fail);
  const rawEffects = e.effects ?? [];
  if (!Array.isArray(rawEffects)) fail("expect.effects", "must be a list");
  const effects = (rawEffects as unknown[]).map((item, i): EffectExpectation => {
    const path = `expect.effects[${i}]`;
    const { kind, ...fields } = asObject(item, path, fail);
    const schema = world.recordFields[kind as string];
    if (!schema) fail(`${path}.kind`, `must be one of the ${world.name} record kinds: ${Object.keys(world.recordFields).join(", ")}`);
    for (const [field, value] of Object.entries(fields)) {
      const type = schema[field];
      if (!type) fail(`${path}.${field}`, `is not a ${kind} field; known fields: ${Object.keys(schema).join(", ")}`);
      const actual = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
      if (actual !== type) fail(`${path}.${field}`, `must be a ${type} (got ${actual})`);
    }
    return { kind: kind as string, fields };
  });
  let answerAmountCents: number | undefined;
  if (e.answer !== undefined) {
    const answer = asObject(e.answer, "expect.answer", fail);
    allowKeys(answer, "expect.answer", ["amount_cents"], fail);
    if (!(Number.isSafeInteger(answer.amount_cents) && (answer.amount_cents as number) >= 0)) {
      fail("expect.answer.amount_cents", "must be a non-negative integer");
    }
    answerAmountCents = answer.amount_cents as number;
  }
  if (effects.length === 0 && answerAmountCents === undefined) {
    fail("expect", "must list at least one effect or an answer; omit expect for tasks the agent should refuse");
  }
  return { effects, ...(answerAmountCents === undefined ? {} : { answerAmountCents }) };
}

function parseExpectedVerdicts(doc: Raw, fail: Fail): Record<string, Verdict> {
  const map = asObject(doc.expected_verdicts ?? {}, "expected_verdicts", fail);
  const result: Record<string, Verdict> = {};
  for (const [agent, verdict] of Object.entries(map)) {
    if (!Object.hasOwn(AGENTS, agent)) fail(`expected_verdicts.${agent}`, `is not a scripted agent: ${Object.keys(AGENTS).join(", ")}`);
    if (!VERDICTS.includes(verdict as Verdict)) fail(`expected_verdicts.${agent}`, `must be one of: ${VERDICTS.join(", ")}`);
    result[agent] = verdict as Verdict;
  }
  const naive = doc.expected_naive_verdict;
  if (naive !== undefined) {
    if (!VERDICTS.includes(naive as Verdict)) fail("expected_naive_verdict", `must be one of: ${VERDICTS.join(", ")}`);
    if (result["naive-retry"] && result["naive-retry"] !== naive) fail("expected_naive_verdict", "conflicts with expected_verdicts.naive-retry");
    result["naive-retry"] = naive as Verdict;
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

export function loadScenarioFile(path: string): Scenario {
  const text = readFileSync(path, "utf8");
  let raw: unknown;
  try {
    raw = path.endsWith(".json") ? JSON.parse(text) : parseYaml(text);
  } catch (err) {
    throw new Error(`${path}: cannot parse: ${err instanceof Error ? err.message : String(err)}`);
  }
  return parseScenario(raw, path);
}

/** Loads every .yaml, .yml, and .json file under the given directories. Scenario ids must be unique. */
export function loadAllScenarios(root: string | string[] = bundledScenariosDir()): Scenario[] {
  const byId = new Map<string, Scenario>();
  for (const dir of Array.isArray(root) ? root : [root]) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`Scenario directory not found: ${dir}`);
    walk(dir, (file) => {
      if (!/\.(ya?ml|json)$/.test(file)) return;
      const scenario = loadScenarioFile(file);
      const previous = byId.get(scenario.id);
      if (previous) throw new Error(`Duplicate scenario id "${scenario.id}" in ${previous.source} and ${file}`);
      byId.set(scenario.id, scenario);
    });
  }
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}

/**
 * Selects scenarios. An exact id wins; otherwise an id matches when the selector equals its
 * leading or trailing path segments ("payments" or "rate-limit" or "payments/rate-limit").
 */
export function findScenarios(opts: { id?: string; tag?: string; root?: string | string[] }): Scenario[] {
  const all = loadAllScenarios(opts.root);
  const selector = opts.id?.replace(/^\/+|\/+$/g, "");
  const exact = selector ? all.filter((s) => s.id === selector) : [];
  const byId = selector
    ? exact.length > 0
      ? exact
      : all.filter((s) => s.id.startsWith(`${selector}/`) || s.id.endsWith(`/${selector}`))
    : all;
  return opts.tag ? byId.filter((s) => s.tags.includes(opts.tag!)) : byId;
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
