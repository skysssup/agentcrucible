import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
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

function walk(dir: string, visit: (file: string) => void): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, visit);
    else visit(p);
  }
}
