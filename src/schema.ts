import { truncate } from "./format.js";

/**
 * A subset of JSON Schema for tool inputs, tool outputs, and structured answers. Schemas use
 * the same keywords as MCP tool definitions (`inputSchema`, `outputSchema`), so a tool can be
 * described once for an agent and checked here. Keywords outside the subset are rejected rather
 * than ignored, so a schema never looks stricter than the check that runs.
 */

export type JsonType = "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";

export interface JsonSchema {
  type?: JsonType | JsonType[];
  description?: string;
  title?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  enum?: unknown[];
  const?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  anyOf?: JsonSchema[];
}

const JSON_TYPES: readonly JsonType[] = ["string", "number", "integer", "boolean", "object", "array", "null"];
const NUMBER_KEYWORDS = ["minimum", "maximum"] as const;
const COUNT_KEYWORDS = ["minLength", "maxLength", "minItems", "maxItems"] as const;
const KEYWORDS = new Set([
  "type", "description", "title", "properties", "required", "additionalProperties", "items",
  "enum", "const", "pattern", "anyOf", ...NUMBER_KEYWORDS, ...COUNT_KEYWORDS,
]);

/** Problems with a schema itself, each prefixed with its location. Empty when the schema is usable. */
export function schemaProblems(schema: unknown, path = "schema"): string[] {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) return [`${path} must be an object`];
  const s = schema as Record<string, unknown>;
  const problems: string[] = [];
  for (const key of Object.keys(s)) {
    if (!KEYWORDS.has(key)) problems.push(`${path}.${key} is not a supported keyword (supported: ${[...KEYWORDS].join(", ")})`);
  }
  const types = s.type === undefined ? [] : Array.isArray(s.type) ? s.type : [s.type];
  if (s.type !== undefined && (types.length === 0 || !types.every((t) => JSON_TYPES.includes(t as JsonType)))) {
    problems.push(`${path}.type must be one of ${JSON_TYPES.join(", ")} (or a list of them)`);
  }
  if (s.properties !== undefined) {
    if (typeof s.properties !== "object" || s.properties === null || Array.isArray(s.properties)) problems.push(`${path}.properties must be an object`);
    else for (const [name, child] of Object.entries(s.properties)) problems.push(...schemaProblems(child, `${path}.properties.${name}`));
  }
  if (s.required !== undefined && !(Array.isArray(s.required) && s.required.every((r) => typeof r === "string"))) {
    problems.push(`${path}.required must be a list of property names`);
  }
  if (s.additionalProperties !== undefined && typeof s.additionalProperties !== "boolean") {
    problems.push(...schemaProblems(s.additionalProperties, `${path}.additionalProperties`));
  }
  if (s.items !== undefined) problems.push(...schemaProblems(s.items, `${path}.items`));
  if (s.anyOf !== undefined) {
    if (!Array.isArray(s.anyOf) || s.anyOf.length === 0) problems.push(`${path}.anyOf must be a non-empty list of schemas`);
    else s.anyOf.forEach((child, i) => problems.push(...schemaProblems(child, `${path}.anyOf[${i}]`)));
  }
  if (s.enum !== undefined && !(Array.isArray(s.enum) && s.enum.length > 0)) problems.push(`${path}.enum must be a non-empty list`);
  for (const key of NUMBER_KEYWORDS) {
    if (s[key] !== undefined && !(typeof s[key] === "number" && Number.isFinite(s[key]))) problems.push(`${path}.${key} must be a number`);
  }
  for (const key of COUNT_KEYWORDS) {
    if (s[key] !== undefined && !(Number.isSafeInteger(s[key]) && (s[key] as number) >= 0)) problems.push(`${path}.${key} must be a non-negative integer`);
  }
  if (s.pattern !== undefined && !(typeof s.pattern === "string" && isRegExp(s.pattern))) {
    problems.push(`${path}.pattern must be a valid regular expression`);
  }
  return problems;
}

export function isRegExp(source: string): boolean {
  try {
    new RegExp(source, "u");
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks a value against a schema and returns every violation as "<JSON path>: <problem>".
 * Validation stops descending after 20 violations.
 */
export function validate(schema: JsonSchema, value: unknown, path = "$", out: string[] = []): string[] {
  if (out.length >= 20) return out;
  if (schema.anyOf) {
    const failures = schema.anyOf.map((option) => validate(option, value, path));
    if (failures.every((f) => f.length > 0)) {
      const first = failures.map((f) => (f[0].startsWith(`${path}: `) ? f[0].slice(path.length + 2) : f[0]));
      out.push(`${path}: matches none of the allowed shapes (${first.join("; or ")})`);
      return out;
    }
  }
  if (schema.type !== undefined) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!allowed.some((t) => hasType(value, t))) {
      out.push(`${path}: expected ${allowed.join(" or ")}, got ${describeType(value)}`);
      return out;
    }
  }
  if (schema.const !== undefined && !sameJson(schema.const, value)) out.push(`${path}: must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some((option) => sameJson(option, value))) {
    out.push(`${path}: must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(", ")} (got ${truncateJson(value)})`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) out.push(`${path}: must be at least ${schema.minimum} (got ${value})`);
    if (schema.maximum !== undefined && value > schema.maximum) out.push(`${path}: must be at most ${schema.maximum} (got ${value})`);
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) out.push(`${path}: must have at least ${schema.minLength} characters`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) out.push(`${path}: must have at most ${schema.maxLength} characters`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, "u").test(value)) out.push(`${path}: must match /${schema.pattern}/`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) out.push(`${path}: must have at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) out.push(`${path}: must have at most ${schema.maxItems} items`);
    if (schema.items) value.forEach((item, i) => validate(schema.items!, item, `${path}[${i}]`, out));
  }
  if (isObject(value)) {
    for (const name of schema.required ?? []) {
      if (!Object.hasOwn(value, name)) out.push(`${path}: missing required property "${name}"`);
    }
    for (const [name, child] of Object.entries(value)) {
      const property = schema.properties?.[name];
      if (property) validate(property, child, `${path}.${name}`, out);
      else if (schema.additionalProperties === false) out.push(`${path}.${name}: is not an allowed property`);
      else if (typeof schema.additionalProperties === "object") validate(schema.additionalProperties, child, `${path}.${name}`, out);
    }
  }
  return out;
}

/**
 * A value that satisfies the schema, built from its constants, enums, and types. Object properties
 * take their value from `hints` (for example, the call's arguments) when the hint satisfies the
 * property's schema; otherwise ids become `<stem>_0`, numbers their minimum or 0, strings empty,
 * booleans false, and lists empty, so the result is well-formed but visibly synthetic.
 */
export function sampleValue(schema: JsonSchema, hints: Record<string, unknown> = {}, name?: string): unknown {
  if (schema.const !== undefined) return schema.const;
  if (schema.enum?.length) return schema.enum[0];
  if (schema.anyOf?.length) return sampleValue({ ...schema, anyOf: undefined, ...schema.anyOf[0] }, hints, name);
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  const hint = name === undefined ? undefined : hints[name];
  if (hint !== undefined && validate(schema, hint).length === 0) return structuredClone(hint);
  switch (type) {
    case "object":
      return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([key, child]) => [key, sampleValue(child, hints, key)]));
    case "array":
      return Array.from({ length: schema.minItems ?? 0 }, () => sampleValue(schema.items ?? {}, hints));
    case "string":
      if (name !== undefined && (name === "id" || name.endsWith("_id"))) return `${name === "id" ? "id" : name.slice(0, -"_id".length)}_0`;
      return "x".repeat(schema.minLength ?? 0);
    case "integer":
    case "number":
      return schema.minimum !== undefined && schema.minimum > 0 ? schema.minimum : 0;
    case "boolean":
      return false;
    default:
      return null;
  }
}

function hasType(value: unknown, type: JsonType): boolean {
  switch (type) {
    case "null":
      return value === null;
    case "array":
      return Array.isArray(value);
    case "object":
      return isObject(value);
    case "integer":
      return Number.isSafeInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    default:
      return typeof value === type;
  }
}

/** "array", "null", or the typeof name: the JSON type of a value as a person would name it. */
export function jsonType(value: unknown): string {
  return Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
}

/** Equality of the JSON encodings, so key order matters as it does in a saved trace. */
export function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function describeType(value: unknown): string {
  return typeof value === "string" ? `string ${truncateJson(value)}` : jsonType(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function truncateJson(value: unknown): string {
  return truncate(JSON.stringify(value) ?? String(value), 40);
}
