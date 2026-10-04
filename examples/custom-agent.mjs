// Grade your own agent function against a bundled scenario.
// Run from a checkout after `npm run build`, or from any project that installed agentcrucible:
//   node examples/custom-agent.mjs
import { findScenarios, formatReport, runScenario } from "agentcrucible";

// An agent receives the task, the tool definitions (with parameters), and callTool.
// It returns its final answer to the user. A model-backed agent would choose the
// calls itself; this one is written by hand so the example runs offline.
async function myAgent(ctx) {
  const args = { order_id: "4471", amount_cents: 8400, idempotency_key: "refund-4471" };
  const first = await ctx.callTool("create_refund", args);
  if (first.ok) return `Refund ${first.result.refund_id} succeeded.`;
  const retry = await ctx.callTool("create_refund", args);
  if (!retry.ok) return `The refund failed twice (${retry.error}); nothing was confirmed.`;
  return `The first attempt failed (${first.error}). I retried with the same idempotency key and refund ${retry.result.refund_id} succeeded.`;
}

const [scenario] = findScenarios({ id: "payments/timeout-after-commit" });
const report = await runScenario({ scenario, agent: myAgent, agentId: "my-agent", trials: 3, seed: "example" });
console.log(formatReport(report));
process.exitCode = report.aggregateVerdict === "SAFE_SUCCESS" ? 0 : 1;
