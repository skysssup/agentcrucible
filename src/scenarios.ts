import { readFileSync, readdirSync, statSync, existsSync, realpathSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import type { FaultSpec, PolicySpec, Scenario, Verdict } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function bundledScenariosDir(): string {
  const candidates = [
    join(__dirname, "..", "scenarios"),
    join(__dirname, "..", "..", "scenarios"),
    join(process.cwd(), "scenarios"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0];
}

interface RawScenario {
  id: string;
  version?: number;
  world: string;
  description: string;
  task: string;
  tags?: string[];
  faults: Array<{
    target: string;
    kind: string;
    on_call?: number;
    on_call_range?: [number, number];
    probability?: number;
    params?: Record<string, unknown>;
  }>;
  policies?: Partial<PolicySpec> & Record<string, unknown>;
  expected_naive_verdict?: Verdict;
}

function normalize(raw: RawScenario): Scenario {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Scenario must be an object');
  for (const key of ['id', 'world', 'description', 'task'] as const) {
    if (typeof raw[key] !== 'string' || !raw[key].trim()) throw new Error(`Invalid scenario ${key}`);
  }
  if (!['payments', 'email', 'database', 'filesystem', 'tickets'].includes(raw.world)) throw new Error('Unknown scenario world');
  if (raw.version !== undefined && raw.version !== 1) throw new Error('Unsupported scenario version');
  if (raw.tags !== undefined && (!Array.isArray(raw.tags) || !raw.tags.every(value => typeof value === 'string'))) throw new Error('Scenario tags must be string[]');
  if (raw.policies !== undefined && (!raw.policies || typeof raw.policies !== 'object' || Array.isArray(raw.policies))) throw new Error('Scenario policies must be an object');
  for (const key of ['requireIdempotency', 'mustDiscloseUncertainty', 'forbidFalseSuccess', 'forbidBlindRetry'] as const) {
    if (raw.policies?.[key] !== undefined && typeof raw.policies[key] !== 'boolean') throw new Error(`Policy ${key} must be boolean`);
  }
  const budget = raw.policies?.maxMutatingCalls;
  if (budget !== undefined && (!Number.isSafeInteger(budget) || budget < 0)) throw new Error('Invalid mutation budget');
  if (raw.faults !== undefined && !Array.isArray(raw.faults)) throw new Error('Scenario faults must be an array');
  const kinds = ['timeout_after_commit', 'timeout', 'omission', 'silent_wrong_data', 'rate_limit_429', 'malformed_response', 'retry_storm', 'auth_expiry', 'stale_cache', 'schema_drift'];
  for (const fault of raw.faults ?? []) {
    if (!fault || typeof fault !== 'object' || !kinds.includes(fault.kind) || typeof fault.target !== 'string' || !fault.target) throw new Error('Invalid fault specification');
    if (fault.on_call !== undefined && (!Number.isSafeInteger(fault.on_call) || fault.on_call < 1)) throw new Error('Invalid fault on_call');
    const range = fault.on_call_range;
    if (range !== undefined && (!Array.isArray(range) || range.length !== 2 || !range.every(value => Number.isSafeInteger(value) && value > 0) || range[0] > range[1])) throw new Error('Invalid fault on_call_range');
    if (range && fault.on_call !== undefined) throw new Error('Specify on_call or on_call_range, not both');
    if (fault.probability !== undefined && (typeof fault.probability !== 'number' || !Number.isFinite(fault.probability) || fault.probability < 0 || fault.probability > 1)) throw new Error('Invalid fault probability');
    if (fault.params !== undefined && (!fault.params || typeof fault.params !== 'object' || Array.isArray(fault.params))) throw new Error('Fault params must be an object');
    if (fault.kind === 'silent_wrong_data' && fault.params?.delta !== undefined && (typeof fault.params.delta !== 'number' || !Number.isFinite(fault.params.delta))) throw new Error('Fault delta must be finite');
  }
  const policies: PolicySpec = {
    requireIdempotency: Boolean(raw.policies?.requireIdempotency),
    maxMutatingCalls:
      raw.policies?.maxMutatingCalls !== undefined
        ? Number(raw.policies.maxMutatingCalls)
        : undefined,
    mustDiscloseUncertainty: Boolean(raw.policies?.mustDiscloseUncertainty ?? true),
    forbidFalseSuccess: Boolean(raw.policies?.forbidFalseSuccess ?? true),
    forbidBlindRetry: Boolean(raw.policies?.forbidBlindRetry ?? true),
  };

  const faults: FaultSpec[] = (raw.faults ?? []).map((f) => ({
    target: f.target,
    kind: f.kind as FaultSpec["kind"],
    onCall: f.on_call,
    onCallRange: f.on_call_range,
    probability: f.probability,
    params: f.params,
  }));

  return {
    id: raw.id,
    version: raw.version ?? 1,
    world: raw.world,
    description: raw.description,
    task: raw.task,
    tags: raw.tags ?? [],
    faults,
    policies,
    expectedNaiveVerdict: raw.expected_naive_verdict,
  };
}

export function loadScenarioFile(path: string): Scenario {
  const text = readFileSync(path, "utf8");
  const raw = (path.endsWith(".json") ? JSON.parse(text) : parseYaml(text)) as RawScenario;
  return normalize(raw);
}

export function loadAllScenarios(
  root: string | string[] = bundledScenariosDir()
): Scenario[] {
  const roots = Array.isArray(root) ? root : [root];
  const byId = new Map<string, Scenario>();
  for (const r of roots) {
    walk(r, (file) => {
      if (file.endsWith(".yaml") || file.endsWith(".yml") || file.endsWith(".json")) {
        const s = loadScenarioFile(file);
        byId.set(s.id, s);
      }
    });
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function findScenarios(opts: {
  id?: string;
  tag?: string;
  root?: string | string[];
}): Scenario[] {
  const all = loadAllScenarios(opts.root);
  return all.filter((s) => {
    if (opts.id) {
      if (s.id !== opts.id && !s.id.endsWith("/" + opts.id) && !s.id.includes(opts.id)) {
        return false;
      }
    }
    if (opts.tag && !s.tags.includes(opts.tag)) return false;
    return true;
  });
}

function walk(dir: string, visit: (file: string) => void, visited = new Set<string>()): void {
  if (!existsSync(dir)) return;
  const real = realpathSync(dir);
  if (visited.has(real)) return;
  visited.add(real);
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, visit, visited);
    else visit(p);
  }
}
