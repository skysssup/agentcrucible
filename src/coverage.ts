import type { FaultStage } from "./faults.js";
import { painter, shouldColor } from "./report.js";
import type { Registry } from "./registry.js";
import { VERDICTS, type Scenario, type Verdict } from "./types.js";

export interface ToolCoverage {
  name: string;
  mutating: boolean;
  /** Fault kinds some scenario injects into this tool, directly or through target "*". */
  faultKinds: string[];
  /** Scenarios that fault this tool. */
  scenarios: string[];
}

export interface WorldCoverage {
  name: string;
  description: string;
  /** Scenarios that run in this world, alone or combined. */
  scenarios: string[];
  tools: ToolCoverage[];
}

export interface FaultKindCoverage {
  kind: string;
  stage: FaultStage;
  description: string;
  scenarios: string[];
  /** `world/tool` pairs the kind is injected into. */
  targets: string[];
}

export interface AgentCoverage {
  id: string;
  /** Scenarios whose expected_verdicts name the agent. */
  scenarios: string[];
  /** How often each verdict is expected of the agent. */
  expected: Partial<Record<Verdict, number>>;
}

/** One non-empty cell of the fault-kind-by-tool matrix. */
export interface CoverageCell {
  kind: string;
  world: string;
  tool: string;
  scenarios: string[];
}

export interface Coverage {
  scenarios: string[];
  worlds: WorldCoverage[];
  faultKinds: FaultKindCoverage[];
  agents: AgentCoverage[];
  matrix: CoverageCell[];
  gaps: {
    /** Registered fault kinds no scenario injects. */
    faultKinds: string[];
    /** `world/tool` pairs no scenario faults. */
    tools: string[];
    /** Registered worlds no scenario runs in. */
    worlds: string[];
    /** Registered agents no scenario's expected_verdicts name. */
    agents: string[];
    withoutExpect: string[];
    withoutExpectedVerdicts: string[];
    withoutFaults: string[];
    withoutTags: string[];
  };
}

/** What the scenario set exercises: which tools each fault kind hits, which agents are held to a verdict, and what nothing covers. */
export function computeCoverage(scenarios: Scenario[], registry: Registry): Coverage {
  const sorted = [...scenarios].sort((a, b) => a.id.localeCompare(b.id));
  const worldTools = new Map([...registry.worlds].map(([name, e]) => [name, e.value()]));
  const hits = new Map<string, Set<string>>();
  const hit = (key: string, scenario: string) => {
    if (!hits.has(key)) hits.set(key, new Set());
    hits.get(key)!.add(scenario);
  };
  for (const s of sorted) {
    for (const fault of s.faults) {
      const targets = fault.target === "*" ? s.worlds.flatMap((w) => (worldTools.get(w)?.tools ?? []).map((t) => `${w}/${t.name}`)) : s.worlds.filter((w) => worldTools.get(w)?.tools.some((t) => t.name === fault.target)).map((w) => `${w}/${fault.target}`);
      for (const target of targets) hit(`${fault.kind} ${target}`, s.id);
    }
  }
  const matrix: CoverageCell[] = [...hits].map(([key, ids]) => {
    const [kind, target] = key.split(" ");
    const [world, tool] = target.split("/");
    return { kind, world, tool, scenarios: [...ids] };
  });
  const kindsOf = (world: string, tool: string) => [...new Set(matrix.filter((c) => c.world === world && c.tool === tool).map((c) => c.kind))].sort();
  const scenariosFaulting = (world: string, tool: string) => [...new Set(matrix.filter((c) => c.world === world && c.tool === tool).flatMap((c) => c.scenarios))].sort();

  const worlds: WorldCoverage[] = [...worldTools].map(([name, world]) => ({
    name,
    description: world.description,
    scenarios: sorted.filter((s) => s.worlds.includes(name)).map((s) => s.id),
    tools: world.tools.map((t) => ({ name: t.name, mutating: t.mutating, faultKinds: kindsOf(name, t.name), scenarios: scenariosFaulting(name, t.name) })),
  }));
  const faultKinds: FaultKindCoverage[] = [...registry.faults].map(([kind, e]) => ({
    kind,
    stage: e.value.stage,
    description: e.value.description,
    scenarios: sorted.filter((s) => s.faults.some((f) => f.kind === kind)).map((s) => s.id),
    targets: [...new Set(matrix.filter((c) => c.kind === kind).map((c) => `${c.world}/${c.tool}`))].sort(),
  }));
  const agents: AgentCoverage[] = [...registry.agents.keys()].map((id) => {
    const named = sorted.filter((s) => id in s.expectedVerdicts);
    const expected: Partial<Record<Verdict, number>> = {};
    for (const s of named) expected[s.expectedVerdicts[id]] = (expected[s.expectedVerdicts[id]] ?? 0) + 1;
    return { id, scenarios: named.map((s) => s.id), expected };
  });

  return {
    scenarios: sorted.map((s) => s.id),
    worlds,
    faultKinds,
    agents,
    matrix: matrix.sort((a, b) => a.kind.localeCompare(b.kind) || a.world.localeCompare(b.world) || a.tool.localeCompare(b.tool)),
    gaps: {
      faultKinds: faultKinds.filter((k) => k.scenarios.length === 0).map((k) => k.kind),
      tools: worlds.flatMap((w) => w.tools.filter((t) => t.faultKinds.length === 0).map((t) => `${w.name}/${t.name}`)),
      worlds: worlds.filter((w) => w.scenarios.length === 0).map((w) => w.name),
      agents: agents.filter((a) => a.scenarios.length === 0).map((a) => a.id),
      withoutExpect: sorted.filter((s) => !s.expect).map((s) => s.id),
      withoutExpectedVerdicts: sorted.filter((s) => Object.keys(s.expectedVerdicts).length === 0).map((s) => s.id),
      withoutFaults: sorted.filter((s) => s.faults.length === 0).map((s) => s.id),
      withoutTags: sorted.filter((s) => s.tags.length === 0).map((s) => s.id),
    },
  };
}

/** The coverage as tables for a terminal. */
export function formatCoverage(c: Coverage, color = shouldColor(process.stdout)): string {
  const paint = painter(color);
  const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const faultedTools = c.worlds.reduce((n, w) => n + w.tools.filter((t) => t.faultKinds.length).length, 0);
  const tools = c.worlds.reduce((n, w) => n + w.tools.length, 0);
  const lines = [
    `${paint("bold", "coverage")}  ${count(c.scenarios.length, "scenario")} · ${count(c.worlds.length, "world")} · ${faultedTools}/${tools} tools faulted · ${c.faultKinds.length - c.gaps.faultKinds.length}/${c.faultKinds.length} fault kinds used · ${c.agents.length - c.gaps.agents.length}/${c.agents.length} agents held to a verdict`,
    "",
    paint("bold", "worlds"),
  ];
  const nameWidth = Math.max(...c.worlds.map((w) => w.name.length), ...c.faultKinds.map((k) => k.kind.length), ...c.agents.map((a) => a.id.length));
  for (const w of c.worlds) {
    const faulted = w.tools.filter((t) => t.faultKinds.length);
    lines.push(`  ${w.name.padEnd(nameWidth)}  ${count(w.scenarios.length, "scenario").padEnd(13)} ${faulted.length}/${w.tools.length} tools faulted${faulted.length ? `: ${faulted.map((t) => `${t.name} (${t.faultKinds.length})`).join(", ")}` : ""}`);
    const untouched = w.tools.filter((t) => !t.faultKinds.length);
    if (untouched.length) lines.push(`  ${"".padEnd(nameWidth)}  ${paint("dim", `never faulted: ${untouched.map((t) => t.name).join(", ")}`)}`);
  }
  lines.push("", paint("bold", "fault kinds"));
  for (const k of c.faultKinds) {
    const used = k.scenarios.length > 0;
    const text = `  ${k.kind.padEnd(nameWidth)}  ${k.stage.padEnd(6)} ${count(k.scenarios.length, "scenario").padEnd(13)} ${k.targets.length ? k.targets.join(", ") : "no scenario injects it"}`;
    lines.push(used ? text : paint("dim", text));
  }
  lines.push("", paint("bold", "agents"));
  for (const a of c.agents) {
    const expected = VERDICTS.filter((v) => a.expected[v]).map((v) => `${a.expected[v]} ${paint(v, v)}`);
    const text = `  ${a.id.padEnd(nameWidth)}  ${count(a.scenarios.length, "scenario").padEnd(13)} ${expected.length ? `expected ${expected.join(", ")}` : "no scenario expects a verdict of it"}`;
    lines.push(a.scenarios.length ? text : paint("dim", text));
  }
  const gaps = [
    ...(c.gaps.worlds.length ? [`worlds without a scenario: ${c.gaps.worlds.join(", ")}`] : []),
    ...(c.gaps.faultKinds.length ? [`fault kinds no scenario injects: ${c.gaps.faultKinds.join(", ")}`] : []),
    ...(c.gaps.tools.length ? [`tools no scenario faults: ${c.gaps.tools.join(", ")}`] : []),
    ...(c.gaps.agents.length ? [`agents no scenario holds to a verdict: ${c.gaps.agents.join(", ")}`] : []),
    ...(c.gaps.withoutExpect.length ? [`scenarios without expect (never SAFE_SUCCESS): ${c.gaps.withoutExpect.join(", ")}`] : []),
    ...(c.gaps.withoutExpectedVerdicts.length ? [`scenarios without expected_verdicts (check skips them): ${c.gaps.withoutExpectedVerdicts.join(", ")}`] : []),
    ...(c.gaps.withoutFaults.length ? [`scenarios without faults: ${c.gaps.withoutFaults.join(", ")}`] : []),
    ...(c.gaps.withoutTags.length ? [`scenarios without tags: ${c.gaps.withoutTags.join(", ")}`] : []),
  ];
  lines.push("", paint("bold", gaps.length ? `gaps (${gaps.length})` : "gaps"));
  lines.push(...(gaps.length ? gaps.map((g) => `  ${g}`) : ["  none: every world, tool, fault kind, and agent is covered, and every scenario has expectations, expected verdicts, faults, and tags"]));
  return lines.join("\n");
}
