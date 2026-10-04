import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { AGENTS } from "./fixtures/agents.js";
import { parseTrials } from "./runner.js";
import { VERDICTS, type Verdict } from "./types.js";

export interface CrucibleConfig {
  /** Default agent when --agent is omitted. */
  agent?: string;
  /** Default trial count. */
  trials?: number;
  /** Default seed. */
  seed?: string;
  /** Default output directory for reports, relative to the working directory. */
  out?: string;
  /** Extra scenario directories, relative to the working directory. */
  scenarioDirs?: string[];
  /** Tag to run when neither --scenario nor --tag is given. */
  defaultTag?: string;
  /** Exit with status 2 when a verdict is at least this severe. */
  failOn?: Verdict;
}

export const CONFIG_FILES = [
  ".agentcrucible.json",
  ".agentcrucible.yaml",
  ".agentcrucible.yml",
  "agentcrucible.config.json",
  ".agentcrucible/config.json",
  ".agentcrucible/config.yaml",
  ".agentcrucible/config.yml",
];

const KEYS = ["agent", "trials", "seed", "out", "scenarioDirs", "defaultTag", "failOn"];

/** The config file in `cwd`, or null. More than one candidate is an error. */
export function findConfigPath(cwd = process.cwd()): string | null {
  const found = CONFIG_FILES.map((name) => join(cwd, name)).filter((p) => existsSync(p));
  if (found.length > 1) {
    throw new Error(`Found several config files (${found.join(", ")}). Keep one, or choose with --config.`);
  }
  return found[0] ?? null;
}

export function parseConfigText(text: string, pathHint = "config"): CrucibleConfig {
  const fail = (problem: string): never => {
    throw new Error(`${pathHint}: ${problem}`);
  };
  let raw: unknown;
  try {
    raw = /\.json$/i.test(pathHint) ? JSON.parse(text) : parseYaml(text);
  } catch (err) {
    return fail(`cannot parse: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (raw == null && !text.trim()) return {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return fail("must be a mapping of settings");
  const cfg = raw as Record<string, unknown>;
  for (const key of Object.keys(cfg)) {
    if (!KEYS.includes(key)) fail(`unknown key "${key}" (expected one of: ${KEYS.join(", ")})`);
  }
  for (const key of ["agent", "seed", "out", "defaultTag"]) {
    if (cfg[key] !== undefined && (typeof cfg[key] !== "string" || !(cfg[key] as string).trim())) {
      fail(`${key} must be a non-empty string`);
    }
  }
  if (cfg.agent !== undefined && !Object.hasOwn(AGENTS, cfg.agent as string)) {
    fail(`agent "${cfg.agent}" is not a scripted agent (available: ${Object.keys(AGENTS).join(", ")})`);
  }
  if (cfg.trials !== undefined) {
    if (typeof cfg.trials !== "number") fail("trials must be a number");
    try {
      parseTrials(cfg.trials);
    } catch (err) {
      fail((err as Error).message);
    }
  }
  if (cfg.scenarioDirs !== undefined && !(Array.isArray(cfg.scenarioDirs) && cfg.scenarioDirs.every((d) => typeof d === "string" && d.trim()))) {
    fail("scenarioDirs must be a list of directory paths");
  }
  if (cfg.failOn !== undefined && !VERDICTS.includes(cfg.failOn as Verdict)) {
    fail(`failOn must be one of: ${VERDICTS.join(", ")}`);
  }
  return Object.fromEntries(Object.entries(cfg).filter(([, v]) => v !== undefined)) as CrucibleConfig;
}

export function loadConfigFile(path: string): CrucibleConfig {
  if (!existsSync(path)) throw new Error(`Config file not found: ${path}`);
  return parseConfigText(readFileSync(path, "utf8"), path);
}

export function loadConfig(cwd = process.cwd()): CrucibleConfig {
  const path = findConfigPath(cwd);
  return path ? loadConfigFile(path) : {};
}
