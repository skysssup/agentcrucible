import type { Effect, TrialTrace } from "../types.js";
import { truncate } from "../format.js";
import type { World, WorldRecord } from "./types.js";

export type { FieldType, World, WorldFactory, WorldRecord, WorldTool } from "./types.js";

/**
 * Combines worlds into one. Tools and record kinds must not overlap; a call goes to the world
 * that owns the tool, and snapshots are keyed by world name. A single world is returned as is.
 */
export function composeWorlds(worlds: World[]): World {
  if (worlds.length === 1) return worlds[0];
  if (worlds.length === 0) throw new Error("composeWorlds needs at least one world");
  const toolOwner = new Map<string, World>();
  const kindOwner = new Map<string, World>();
  for (const world of worlds) {
    for (const tool of world.tools) {
      const other = toolOwner.get(tool.name);
      if (other) throw new Error(`worlds ${other.name} and ${world.name} both define tool ${tool.name}`);
      toolOwner.set(tool.name, world);
    }
    for (const kind of Object.keys(world.recordFields)) {
      const other = kindOwner.get(kind);
      if (other) throw new Error(`worlds ${other.name} and ${world.name} both store records of kind ${kind}`);
      kindOwner.set(kind, world);
    }
  }
  return {
    name: worlds.map((w) => w.name).join("+"),
    description: worlds.map((w) => `${w.name}: ${w.description}`).join(" "),
    tools: worlds.flatMap((w) => w.tools),
    recordFields: Object.assign({}, ...worlds.map((w) => w.recordFields)),
    reset() {
      for (const w of worlds) w.reset();
    },
    seed(records) {
      for (const w of worlds) {
        const own = records.filter((r) => kindOwner.get(r.kind) === w);
        if (own.length === 0) continue;
        if (!w.seed) throw new Error(`world ${w.name} does not support setup records`);
        w.seed(own);
      }
    },
    snapshot() {
      return Object.fromEntries(worlds.map((w) => [w.name, w.snapshot()]));
    },
    invoke(tool, args) {
      const owner = toolOwner.get(tool);
      if (!owner) throw new Error(`unknown tool: ${tool}`);
      return owner.invoke(tool, args);
    },
    records(snapshot) {
      return worlds.flatMap((w) => w.records((snapshot[w.name] ?? {}) as Record<string, unknown>));
    },
  };
}

/** Records added or changed between two snapshots. Idempotency keys alone do not count as a change. */
export function effectsBetween(world: World, before: Record<string, unknown>, after: Record<string, unknown>): Effect[] {
  const previous = new Map(world.records(before).map((r) => [`${r.kind}:${r.id}`, r]));
  const effects: Effect[] = [];
  for (const record of world.records(after)) {
    const prior = previous.get(`${record.kind}:${record.id}`);
    if (prior && sameData(prior, record)) continue;
    effects.push({ ...record, summary: summarize(record, prior), callIds: [] });
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

/** "+ refund re_1 ..." for a new record (with its idempotency key), "~ ticket tkt_7 ..." listing the fields that changed. */
function summarize(record: WorldRecord, prior: WorldRecord | undefined): string {
  const fields = Object.entries(record.fields)
    .filter(([key, value]) => key !== "idempotency_key" && value !== record.id)
    .filter(([key, value]) => !prior || JSON.stringify(prior.fields[key]) !== JSON.stringify(value))
    .map(([key, value]) => `${key}=${truncate(JSON.stringify(value), 60)}`)
    .join(" ");
  if (prior) return `~ ${record.kind} ${record.id} ${fields}`;
  const key = record.fields.idempotency_key;
  return `+ ${record.kind} ${record.id} ${fields} (${key === undefined ? "no idempotency key" : `idempotency_key=${JSON.stringify(key)}`})`;
}
