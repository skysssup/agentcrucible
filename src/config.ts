import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

export interface CrucibleConfig {
  /** Default agent id when --agent is omitted. */
  agent?: string;
  /** Default trial count. */
  trials?: number;
  /** Default seed. */
  seed?: string;
  /** Default output directory for reports. */
  out?: string;
  /** Extra scenario directories to scan (besides bundled). */
  scenarioDirs?: string[];
  /** Default tags to run when neither --scenario nor --tag is given. */
  defaultTag?: string;
}

const CONFIG_NAMES = [
  ".agentcrucible.json",
  ".agentcrucible.yaml",
  ".agentcrucible.yml",
  "agentcrucible.config.json",
];

export function findConfigPath(cwd = process.cwd()): string | null {
  for (const name of CONFIG_NAMES) {
    const p = join(cwd, name);
    if (existsSync(p)) return p;
  }
  // Nested under .agentcrucible/
  for (const name of ["config.json", "config.yaml", "config.yml"]) {
    const p = join(cwd, ".agentcrucible", name);
    if (existsSync(p)) return p;
  }
  return null;
}

export function parseConfigText(text: string, pathHint = ""): CrucibleConfig {
  const lower = pathHint.toLowerCase();
  const raw =
    lower.endsWith(".yaml") || lower.endsWith(".yml")
      ? parseYaml(text)
      : lower.endsWith(".json") || text.trimStart().startsWith("{")
        ? JSON.parse(text)
        : parseYaml(text);
  if (raw == null && !text.trim()) return {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error('Config must be an object');
  const cfg = raw as Record<string, unknown>;
  for (const key of ['agent', 'seed', 'out', 'defaultTag']) {
    if (cfg[key] !== undefined && typeof cfg[key] !== 'string') throw new Error(`Invalid config ${key}`);
  }
  if (cfg.trials !== undefined && (typeof cfg.trials !== 'number' || !Number.isSafeInteger(cfg.trials) || cfg.trials < 1)) throw new Error('Invalid config trials: expected a positive safe integer');
  if (cfg.scenarioDirs !== undefined && (!Array.isArray(cfg.scenarioDirs) || !cfg.scenarioDirs.every(value => typeof value === 'string'))) throw new Error('scenarioDirs must be string[]');
  return {
    agent: typeof cfg.agent === "string" ? cfg.agent : undefined,
    trials: cfg.trials as number | undefined,
    seed: typeof cfg.seed === "string" ? cfg.seed : undefined,
    out: typeof cfg.out === "string" ? cfg.out : undefined,
    scenarioDirs: Array.isArray(cfg.scenarioDirs)
      ? cfg.scenarioDirs.map(String)
      : undefined,
    defaultTag: typeof cfg.defaultTag === "string" ? cfg.defaultTag : undefined,
  };
}

/** Load a specific config path (JSON or YAML). */
export function loadConfigFile(path: string): CrucibleConfig {
  const text = readFileSync(path, "utf8");
  return parseConfigText(text, path);
}

export function loadConfig(cwd = process.cwd()): CrucibleConfig {
  const path = findConfigPath(cwd);
  if (!path) return {};
  return loadConfigFile(path);
}
