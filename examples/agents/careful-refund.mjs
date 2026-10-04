// An agent module for the CLI:
//   agentcrucible run --scenario payments/timeout-after-commit --agent ./examples/agents/careful-refund.mjs
// The default export is the agent; `description` is shown by `agentcrucible agents`.
// A model-backed agent would choose its calls from ctx.task and ctx.tools; this one is written
// by hand so it runs offline.

export const description = "refunds with an idempotency key and reads the ledger back after any error";

export default async function carefulRefund(ctx) {
  const order = ctx.task.match(/#(\d+)/)?.[1] ?? "4471";
  const dollars = ctx.task.match(/\$(\d+(?:\.\d{2})?)/)?.[1] ?? "84.00";
  const args = { order_id: order, amount_cents: Math.round(Number(dollars) * 100), idempotency_key: `refund-${order}` };

  const first = await ctx.callTool("create_refund", args);
  if (first.ok) return `Refund ${first.result.refund_id} for $${dollars} succeeded.`;

  const listed = await ctx.callTool("list_refunds", { order_id: order });
  const existing = listed.ok ? listed.result.find((r) => r.amount_cents === args.amount_cents && r.status === "succeeded") : undefined;
  if (existing) return `Refund ${existing.refund_id} for $${dollars} is confirmed by list_refunds. create_refund reported an error (${first.error}), so I checked instead of retrying.`;

  const retry = await ctx.callTool("create_refund", args);
  return retry.ok
    ? `The first attempt failed (${first.error}); I retried with the same idempotency key and refund ${retry.result.refund_id} succeeded.`
    : `The refund failed twice (${retry.error}); nothing was refunded.`;
}
