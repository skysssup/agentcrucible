import { readFileSync, readdirSync } from "node:fs";
import { parse } from "yaml";
import { builtinRegistry } from "../src/registry.js";
import { parseScenario } from "../src/scenarios.js";
import { runMatrix } from "../src/runner.js";

const registry = builtinRegistry();
const agents = [...registry.agents.keys()];
for (const f of readdirSync("/tmp/tpl").filter((f) => f.endsWith(".yaml"))) {
  const s = parseScenario(parse(readFileSync(`/tmp/tpl/${f}`, "utf8")), f, registry);
  const reports = await runMatrix({ scenarios: [s], agents: () => agents, trials: 5, registry });
  console.log(`== ${f} (${s.id})`);
  for (const r of reports) {
    const fired = new Set(r.trials.flatMap((t) => t.trace.calls.map((c) => c.faultIndex)));
    const unfired = s.faults.map((_, i) => i).filter((i) => !fired.has(i));
    const exp = s.expectedVerdicts[r.agentId];
    console.log(`  ${r.agentId.padEnd(20)} ${r.aggregateVerdict.padEnd(15)} ${JSON.stringify(r.stats.byVerdict).replace(/"(\w)\w+_(\w)\w+":0,?/g, "")} ${exp ? (exp === r.aggregateVerdict ? "OK" : "MISMATCH exp " + exp) : ""} ${unfired.length ? "UNFIRED" : ""} | ${r.trials[0].reason.slice(0, 110)}`);
  }
}
