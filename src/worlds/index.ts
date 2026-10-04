import type { Effect, TrialTrace } from "../types.js";
import { createDatabaseWorld } from "./database.js";
import { createEmailWorld } from "./email.js";
import { createFilesystemWorld } from "./filesystem.js";
import { createPaymentsWorld } from "./payments.js";
import { createTicketsWorld } from "./tickets.js";
import type { World, WorldRecord } from "./types.js";

export type { FieldType, World, WorldRecord, WorldTool } from "./types.js";

const factories: Record<string, () => World> = {
  payments: createPaymentsWorld,
  database: createDatabaseWorld,
  email: createEmailWorld,
  tickets: createTicketsWorld,
  filesystem: createFilesystemWorld,
};

export function listWorlds(): string[] {
  return Object.keys(factories);
}

export function createWorld(name: string): World {
  const factory = factories[name];
  if (!factory) {
    throw new Error(`Unknown world "${name}". Available: ${listWorlds().join(", ")}`);
  }
  const world = factory();
  world.reset();
  return world;
}

/** Records added or changed between two snapshots. Idempotency keys alone do not count as a change. */
export function effectsBetween(
  world: World,
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Effect[] {
  const previous = new Map(world.records(before).map((r) => [`${r.kind}:${r.id}`, r]));
  const effects: Effect[] = [];
  for (const record of world.records(after)) {
    const prior = previous.get(`${record.kind}:${record.id}`);
    if (prior && sameData(prior, record)) continue;
    effects.push({ ...record, summary: summarize(record, prior !== undefined), callIds: [] });
  }
  return effects;
}

/** Changes made during a trial, each attributed to the calls after which it changed. */
export function traceEffects(world: World, trace: TrialTrace): Effect[] {
  const effects = effectsBetween(world, trace.worldBefore, trace.worldAfter);
  const byKey = new Map(effects.map((e) => [`${e.kind}:${e.id}`, e]));
  let previous = trace.worldBefore;
  for (const call of trace.calls) {
    for (const change of effectsBetween(world, previous, call.worldSnapshotAfter)) {
      byKey.get(`${change.kind}:${change.id}`)?.callIds.push(call.id);
    }
    previous = call.worldSnapshotAfter;
  }
  return effects;
}

function sameData(a: WorldRecord, b: WorldRecord): boolean {
  const strip = ({ idempotency_key: _key, ...rest }: Record<string, unknown>) => rest;
  return JSON.stringify(strip(a.fields)) === JSON.stringify(strip(b.fields));
}

function summarize(record: WorldRecord, changed: boolean): string {
  const fields = Object.entries(record.fields)
    .filter(([key, value]) => key !== "idempotency_key" && value !== record.id)
    .map(([key, value]) => `${key}=${truncate(JSON.stringify(value))}`)
    .join(" ");
  const key = record.fields.idempotency_key;
  const keyNote = key === undefined ? "no idempotency key" : `idempotency_key=${JSON.stringify(key)}`;
  return `${changed ? "~" : "+"} ${record.kind} ${record.id} ${fields} (${keyNote})`;
}

function truncate(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
