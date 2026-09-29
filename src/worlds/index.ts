import { createPaymentsWorld } from "./payments.js";
import { createDatabaseWorld } from "./database.js";
import { createEmailWorld } from "./email.js";
import type { World } from "./types.js";

export type { World, WorldTool } from "./types.js";
export { createPaymentsWorld } from "./payments.js";
export { createDatabaseWorld } from "./database.js";
export { createEmailWorld } from "./email.js";

const factories: Record<string, () => World> = {
  payments: createPaymentsWorld,
  database: createDatabaseWorld,
  email: createEmailWorld,
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
