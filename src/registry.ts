import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { BUILTIN_FAULTS, FAULT_STAGES, type FaultDefinition, type FaultStage } from "./faults.js";
import { BUILTIN_AGENTS, type AgentDefinition } from "./fixtures/agents.js";
import type { ScriptedAgent } from "./harness.js";
import { schemaProblems } from "./schema.js";
import { createDatabaseWorld } from "./worlds/database.js";
import { createEmailWorld } from "./worlds/email.js";
import { createFilesystemWorld } from "./worlds/filesystem.js";
import { composeWorlds } from "./worlds/index.js";
import { createPaymentsWorld } from "./worlds/payments.js";
import { createTicketsWorld } from "./worlds/tickets.js";
import type { FieldType, World, WorldFactory } from "./worlds/types.js";

export type { AgentDefinition } from "./fixtures/agents.js";

interface Entry<T> {
  value: T;
  /** "built-in", or the path of the module that registered it. */
  source: string;
}

/** The worlds, fault kinds, and agents that scenarios and runs can name. */
export interface Registry {
  worlds: ReadonlyMap<string, Entry<WorldFactory>>;
  faults: ReadonlyMap<string, Entry<FaultDefinition>>;
  agents: ReadonlyMap<string, Entry<AgentDefinition>>;
}

/** What an extension module exports: any of these maps, keyed by the name scenarios use. */
export interface Extension {
  worlds?: Record<string, WorldFactory>;
  faults?: Record<string, FaultDefinition>;
  agents?: Record<string, ScriptedAgent | AgentDefinition>;
}

const BUILTIN_WORLDS: Record<string, WorldFactory> = {
  payments: createPaymentsWorld,
  database: createDatabaseWorld,
  email: createEmailWorld,
  tickets: createTicketsWorld,
  filesystem: createFilesystemWorld,
};

const NAME_PATTERNS = {
  worlds: /^[a-z][a-z0-9_-]*$/,
  faults: /^[a-z][a-z0-9_]*$/,
  agents: /^[a-z0-9][a-z0-9._-]*$/,
} as const;

export function builtinRegistry(): Registry {
  const entries = <T>(map: Record<string, T>) => new Map(Object.entries(map).map(([name, value]) => [name, { value, source: "built-in" }]));
  return { worlds: entries(BUILTIN_WORLDS), faults: entries(BUILTIN_FAULTS), agents: entries(BUILTIN_AGENTS) };
}

/**
 * Returns a registry with the extension's worlds, faults, and agents added. Every entry is checked
 * first, and names may not shadow existing ones; all problems are reported together.
 */
export function extendRegistry(base: Registry, extension: Extension, source = "extension"): Registry {
  if (typeof extension !== "object" || extension === null) throw new Error(`${source}: an extension must be an object with worlds, faults, or agents`);
  const problems: string[] = [];
  const worlds = new Map(base.worlds);
  const faults = new Map(base.faults);
  const agents = new Map(base.agents);
  const add = <T>(group: "worlds" | "faults" | "agents", target: Map<string, Entry<T>>, raw: unknown, check: (name: string, value: unknown) => [T | undefined, string[]]) => {
    if (raw === undefined) return;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      problems.push(`${group} must be an object keyed by name`);
      return;
    }
    for (const [name, value] of Object.entries(raw)) {
      if (!NAME_PATTERNS[group].test(name)) {
        problems.push(`${group}.${name}: name must match ${NAME_PATTERNS[group]}`);
        continue;
      }
      const existing = target.get(name);
      if (existing) {
        problems.push(`${group}.${name}: already defined by ${existing.source}`);
        continue;
      }
      const [checked, issues] = check(name, value);
      problems.push(...issues.map((i) => `${group}.${name}: ${i}`));
      if (checked !== undefined && issues.length === 0) target.set(name, { value: checked, source });
    }
  };
  add("worlds", worlds, extension.worlds, (name, value) => {
    const issues = worldProblems(name, value);
    return [issues.length ? undefined : (value as WorldFactory), issues];
  });
  add("faults", faults, extension.faults, (_name, value) => {
    const issues = faultProblems(value);
    return [issues.length ? undefined : (value as FaultDefinition), issues];
  });
  add("agents", agents, extension.agents, (_name, value) => toAgentDefinition(value));
  if (extension.worlds === undefined && extension.faults === undefined && extension.agents === undefined) {
    problems.push("exports none of worlds, faults, or agents");
  }
  if (problems.length) throw new Error(`${source}: ${problems.join("\n  ")}`);
  return { worlds, faults, agents };
}

/** Creates fresh instances of the named worlds, combines them, and resets the result. */
export function createWorlds(registry: Registry, names: string[]): World {
  const world = composeWorlds(
    names.map((name) => {
      const entry = registry.worlds.get(name);
      if (!entry) throw new Error(`world "${name}" is not registered (available: ${[...registry.worlds.keys()].join(", ")})`);
      return entry.value();
    })
  );
  world.reset();
  return world;
}

export function getAgent(registry: Registry, id: string): AgentDefinition {
  const entry = registry.agents.get(id);
  if (!entry) throw new Error(`Unknown agent "${id}". Available: ${[...registry.agents.keys()].join(", ")}`);
  return entry.value;
}

export function faultDefinitions(registry: Registry): Record<string, FaultDefinition> {
  return Object.fromEntries([...registry.faults].map(([name, entry]) => [name, entry.value]));
}

const FIELD_TYPES: readonly FieldType[] = ["string", "number", "boolean", "object", "array"];

/** Checks a world factory by building one world and exercising reset, snapshot, and records. */
export function worldProblems(name: string, factory: unknown): string[] {
  if (typeof factory !== "function") return ["must be a function that returns a world"];
  let world: World;
  try {
    world = (factory as WorldFactory)();
  } catch (err) {
    return [`the factory threw: ${(err as Error).message}`];
  }
  if (typeof world !== "object" || world === null) return ["the factory must return an object"];
  const problems: string[] = [];
  if (world.name !== name) problems.push(`name is ${JSON.stringify(world.name)}; it must equal the registered name "${name}"`);
  if (typeof world.description !== "string") problems.push("description must be a string");
  for (const method of ["reset", "snapshot", "invoke", "records"] as const) {
    if (typeof world[method] !== "function") problems.push(`${method} must be a function`);
  }
  if (world.seed !== undefined && typeof world.seed !== "function") problems.push("seed must be a function when present");
  if (!Array.isArray(world.tools) || world.tools.length === 0) {
    problems.push("tools must be a non-empty list");
  } else {
    const seen = new Set<string>();
    world.tools.forEach((tool, i) => {
      const at = `tools[${i}]`;
      if (typeof tool?.name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(tool.name)) problems.push(`${at}.name must be an identifier`);
      else if (seen.has(tool.name)) problems.push(`${at}.name "${tool.name}" is used twice`);
      else seen.add(tool.name);
      if (typeof tool?.description !== "string") problems.push(`${at}.description must be a string`);
      if (typeof tool?.mutating !== "boolean") problems.push(`${at}.mutating must be true or false`);
      problems.push(...schemaProblems(tool?.inputSchema, `${at}.inputSchema`));
      if (tool?.inputSchema && tool.inputSchema.type !== "object") problems.push(`${at}.inputSchema.type must be "object"`);
      if (tool?.outputSchema !== undefined) problems.push(...schemaProblems(tool.outputSchema, `${at}.outputSchema`));
    });
  }
  if (typeof world.recordFields !== "object" || world.recordFields === null) {
    problems.push("recordFields must map record kinds to { field: type }");
  } else {
    for (const [kind, fields] of Object.entries(world.recordFields)) {
      for (const [field, type] of Object.entries(fields ?? {})) {
        if (!FIELD_TYPES.includes(type)) problems.push(`recordFields.${kind}.${field} must be one of ${FIELD_TYPES.join(", ")}`);
      }
    }
  }
  if (problems.length) return problems;
  try {
    world.reset();
    const snapshot = world.snapshot();
    if (!isPlainJson(snapshot)) problems.push("snapshot() must return plain JSON data (objects, arrays, strings, finite numbers, booleans, null)");
    const records = world.records(snapshot);
    if (!Array.isArray(records)) problems.push("records() must return a list");
    else {
      for (const r of records) {
        if (!Object.hasOwn(world.recordFields, r?.kind)) problems.push(`records() returned kind ${JSON.stringify(r?.kind)}, which recordFields does not declare`);
        if (typeof r?.id !== "string") problems.push("records() must return string ids");
      }
    }
  } catch (err) {
    problems.push(`reset, snapshot, or records threw: ${(err as Error).message}`);
  }
  return problems;
}

export function faultProblems(definition: unknown): string[] {
  if (typeof definition !== "object" || definition === null) return ["must be an object with description, stage, and apply"];
  const d = definition as Partial<FaultDefinition>;
  const problems: string[] = [];
  if (typeof d.description !== "string" || !d.description.trim()) problems.push("description must be a non-empty string");
  if (!FAULT_STAGES.includes(d.stage as FaultStage)) {
    problems.push('stage must be "before" (the call does not run), "after" (it runs, then the response changes), or "twice" (it runs twice; the agent sees the first response)');
  }
  if (typeof d.apply !== "function") problems.push("apply must be a function ({ tool, args, result, params }) => observation");
  if (d.params !== undefined) {
    problems.push(...schemaProblems(d.params, "params"));
    if ((d.params as { type?: unknown }).type !== "object") problems.push('params.type must be "object"');
  }
  return problems;
}

function isPlainJson(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isPlainJson);
  if (typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return (proto === Object.prototype || proto === null) && Object.values(value).every(isPlainJson);
}

function toAgentDefinition(value: unknown): [AgentDefinition | undefined, string[]] {
  if (typeof value === "function") return [{ run: value as ScriptedAgent, description: "" }, []];
  const v = value as Partial<AgentDefinition> | null;
  if (typeof v !== "object" || v === null || typeof v.run !== "function") return [undefined, ["must be a function (ctx) => answer, or { run, description }"]];
  if (v.description !== undefined && typeof v.description !== "string") return [undefined, ["description must be a string"]];
  return [{ run: v.run, description: v.description ?? "" }, []];
}

async function importModule(path: string): Promise<Record<string, unknown>> {
  const absolute = resolve(path);
  if (!existsSync(absolute)) throw new Error(`${path}: file not found`);
  try {
    return (await import(pathToFileURL(absolute).href)) as Record<string, unknown>;
  } catch (err) {
    const message = (err as Error).message;
    const hint = /\.[cm]?ts$/.test(path) && /Unknown file extension/.test(message)
      ? " (this Node version cannot load TypeScript directly; Node 22.18+ can, or compile the module to JavaScript)"
      : "";
    throw new Error(`${path}: cannot load module: ${message}${hint}`, { cause: err });
  }
}

/** Loads an extension module: named exports `worlds`, `faults`, `agents`, or a default export with those keys. */
export async function loadExtension(base: Registry, path: string): Promise<Registry> {
  const mod = await importModule(path);
  const candidate = (mod.worlds ?? mod.faults ?? mod.agents) !== undefined ? mod : mod.default;
  return extendRegistry(base, (candidate ?? {}) as Extension, path);
}

/** True when an --agent value names a module file rather than a registered agent. */
export function isModulePath(value: string): boolean {
  return /[\\/]/.test(value) || /\.[cm]?[jt]s$/.test(value);
}

/**
 * Loads an agent module: a default export that is the agent function or { run, description }.
 * The agent is registered under the file name ("agents/my-agent.mjs" becomes "my-agent").
 */
export async function loadAgentModule(base: Registry, path: string): Promise<{ registry: Registry; id: string }> {
  const id = basename(path).replace(/\.[cm]?[jt]s$/, "").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[^a-z0-9]+/, "") || "agent";
  if (base.agents.get(id)?.source === path) return { registry: base, id };
  const mod = await importModule(path);
  const exported = mod.default ?? mod.agent;
  if (exported === undefined) throw new Error(`${path}: export the agent as the default export (a function, or { run, description })`);
  const definition = typeof exported === "function" && typeof mod.description === "string" ? { run: exported, description: mod.description } : exported;
  return { registry: extendRegistry(base, { agents: { [id]: definition as AgentDefinition } }, path), id };
}
