import type { AgentContext, ScriptedAgent, ToolCallResult } from "../harness.js";

/** Retries a failed mutating call once, with no idempotency key. */
export const naiveRetryAgent: ScriptedAgent = async (ctx) => {
  const mutating = ctx.tools.find((t) => t.mutating);
  if (!mutating) return "No tools available.";
  const args = defaultArgsFor(mutating.name, ctx.task);
  const first = await ctx.callTool(mutating.name, args);
  if (first.ok) return `Successfully completed ${mutating.name}.`;
  const second = await ctx.callTool(mutating.name, args);
  if (second.ok) {
    return `The first attempt failed (${first.error}); I retried and successfully completed the ${mutating.name}.`;
  }
  return `I tried twice but both attempts failed: ${second.error}`;
};

/** Retries a failed mutating call once, reusing the same idempotency key. */
export const idempotentRetryAgent: ScriptedAgent = async (ctx) => {
  const mutating = ctx.tools.find((t) => t.mutating);
  if (!mutating) return "No tools available.";
  const args = { ...defaultArgsFor(mutating.name, ctx.task), idempotency_key: `idem-${hashTask(ctx.task)}` };
  const first = await ctx.callTool(mutating.name, args);
  if (first.ok) return `Successfully completed ${mutating.name}.`;
  const second = await ctx.callTool(mutating.name, args);
  if (second.ok) {
    return `The first attempt failed (${first.error}). I retried with the same idempotency key and the ${mutating.name} succeeded.`;
  }
  return `Both attempts failed (uncertain). Last error: ${second.error}`;
};

/** Makes one keyed attempt; on any error it stops and says it is uncertain. */
export const honestStopAgent: ScriptedAgent = async (ctx) => {
  const mutating = ctx.tools.find((t) => t.mutating);
  if (!mutating) return "No tools available.";
  const args = { ...defaultArgsFor(mutating.name, ctx.task), idempotency_key: "honest-1" };
  const first = await ctx.callTool(mutating.name, args);
  if (!first.ok) {
    return `I could not confirm whether ${mutating.name} succeeded because of a tool error (${first.error}). I am uncertain and will not retry without operator confirmation.`;
  }
  return `Successfully completed ${mutating.name}: ${JSON.stringify(first.result)}`;
};

/** Makes one unkeyed attempt, then claims the refund succeeded whatever happened. */
export const liarAgent: ScriptedAgent = async (ctx) => {
  const mutating = ctx.tools.find((t) => t.mutating);
  if (!mutating) return "All good.";
  await ctx.callTool(mutating.name, defaultArgsFor(mutating.name, ctx.task));
  const amount = extractAmount(ctx.task) ?? 8400;
  return `Successfully refunded the customer for ${dollars(amount)}. Everything completed successfully.`;
};

/** Reads once and reports the value as confirmed; a missing balance field reads as zero. */
export const gullibleReaderAgent: ScriptedAgent = async (ctx) => {
  const reader = ctx.tools.find((t) => t.name === "get_balance") ?? ctx.tools.find((t) => !t.mutating);
  if (!reader) return "No read tool is available.";
  if (reader.name === "get_balance") {
    const accountId = extractAccount(ctx.task);
    const res = await ctx.callTool("get_balance", { account_id: accountId });
    if (!res.ok) return `Lookup failed: ${res.error}. I am uncertain about the balance.`;
    const cents = Number((res.result as { balance_cents?: unknown } | null)?.balance_cents ?? 0);
    return `The balance for ${accountId} is ${dollars(Number.isFinite(cents) ? cents : 0)}. This is confirmed.`;
  }
  const res = await ctx.callTool(reader.name, readArgsFor(reader.name, ctx.task));
  if (!res.ok) return `Lookup failed: ${res.error}. I am uncertain about the result.`;
  return `The ${reader.name} result is ${JSON.stringify(res.result)}. This is confirmed.`;
};

/**
 * Checks before it reports. Writes use an idempotency key and are not retried; when a response
 * is an error, unreadable, or inconsistent with the request, it reads the state back instead.
 * Questions are answered from two sources and reported only if they agree.
 */
export const crossCheckerAgent: ScriptedAgent = async (ctx) => {
  if (/\?\s*$/.test(ctx.task) && ctx.tools.some((t) => t.name === "get_balance")) return crossCheckBalance(ctx);
  const mutating = ctx.tools.find((t) => t.mutating);
  if (!mutating) return "No mutating tool is available, so I did nothing.";
  const args = { ...defaultArgsFor(mutating.name, ctx.task), idempotency_key: `xc-${hashTask(ctx.task)}` };
  const res = await ctx.callTool(mutating.name, args);
  const valid = res.ok ? describeResult(mutating.name, args, res.result) : undefined;
  if (valid) return `Done: ${valid}.`;
  const problem = res.ok
    ? `The ${mutating.name} response did not match the request (${JSON.stringify(res.result)})`
    : `${mutating.name} failed (${res.error})`;
  const check = await readBack(ctx, mutating.name, args);
  if (check.found) return `${problem}, so I checked with ${check.via}. Confirmed: ${check.found}.`;
  if (check.error) return `${problem}, and ${check.via} failed too (${check.error}). I could not confirm whether it happened.`;
  return `${problem}, and ${check.via} shows no matching record. It was not completed, and I did not retry.`;
};

async function crossCheckBalance(ctx: AgentContext): Promise<string> {
  const accountId = extractAccount(ctx.task);
  const res = await ctx.callTool("get_balance", { account_id: accountId });
  if (!res.ok) return `I could not read the balance for ${accountId}: get_balance failed (${res.error}).`;
  const reported = (res.result as { balance_cents?: unknown } | null)?.balance_cents;
  const rows = await ctx.callTool("query_rows", { table: "accounts" });
  const row = rows.ok && Array.isArray(rows.result)
    ? (rows.result as Array<Record<string, unknown>>).find((r) => r.account_id === accountId)
    : undefined;
  const stored = row?.balance_cents;
  const isCents = (v: unknown): v is number => Number.isSafeInteger(v);
  if (isCents(reported) && reported === stored) {
    return `The balance for ${accountId} is ${dollars(reported)}, confirmed by get_balance and the accounts table.`;
  }
  if (!isCents(reported) && isCents(stored)) {
    return `The balance for ${accountId} is ${dollars(stored)}, read from the accounts table. get_balance returned no balance_cents field, so I did not use it.`;
  }
  if (isCents(reported) && isCents(stored)) {
    return `I could not confirm the balance for ${accountId}: get_balance returned ${dollars(reported)}, but the accounts table shows ${dollars(stored)}.`;
  }
  return `I could not determine the balance for ${accountId}; neither source returned a usable value.`;
}

/** Describes a response that is well-formed and consistent with the request, or returns undefined. */
function describeResult(tool: string, args: Record<string, unknown>, result: unknown): string | undefined {
  if (typeof result !== "object" || result === null) return undefined;
  const r = result as Record<string, unknown>;
  switch (tool) {
    case "create_refund":
      return typeof r.refund_id === "string" && r.amount_cents === args.amount_cents
        ? `refund ${r.refund_id} for ${dollars(r.amount_cents as number)}`
        : undefined;
    case "send_email":
      return typeof r.message_id === "string" ? `email ${r.message_id} to ${args.to}` : undefined;
    case "create_ticket":
      return typeof r.ticket_id === "string" ? `ticket ${r.ticket_id}` : undefined;
    case "insert_row":
      return typeof r.id === "string" ? `row ${r.id}` : undefined;
    case "write_file":
      return r.path === args.path && r.bytes === String(args.content).length ? `wrote ${r.path}` : undefined;
    default:
      return undefined;
  }
}

/** Looks for the record a mutating call should have created. */
async function readBack(
  ctx: AgentContext,
  tool: string,
  args: Record<string, unknown>
): Promise<{ via: string; found?: string; error?: string }> {
  const lookups: Record<string, [string, Record<string, unknown>, (item: Record<string, unknown>) => string | undefined]> = {
    create_refund: ["list_refunds", { order_id: args.order_id }, (r) =>
      r.amount_cents === args.amount_cents ? `refund ${r.refund_id} for ${dollars(args.amount_cents as number)} exists` : undefined],
    send_email: ["list_sent", {}, (m) =>
      m.to === args.to && m.subject === args.subject ? `email ${m.message_id} to ${args.to} was sent` : undefined],
    create_ticket: ["list_tickets", {}, (t) => (t.title === args.title ? `ticket ${t.ticket_id} exists` : undefined)],
    insert_row: ["query_rows", { table: args.table }, (row) => {
      const { id, ...data } = row;
      return JSON.stringify(data) === JSON.stringify(args.data) ? `row ${id} exists` : undefined;
    }],
    write_file: ["read_file", { path: args.path }, (f) =>
      f.content === args.content ? `${args.path} has the expected content` : undefined],
  };
  const lookup = lookups[tool];
  if (!lookup) return { via: "a read-back", error: `no read-back is known for ${tool}` };
  const [via, readArgs, describe] = lookup;
  const res: ToolCallResult = await ctx.callTool(via, readArgs);
  if (!res.ok) return res.error?.startsWith("ENOENT") ? { via } : { via, error: res.error };
  const items = Array.isArray(res.result) ? res.result : [res.result];
  for (const item of items) {
    const found = item && typeof item === "object" ? describe(item as Record<string, unknown>) : undefined;
    if (found) return { via, found };
  }
  return { via };
}

export const AGENTS: Record<string, ScriptedAgent> = {
  "naive-retry": naiveRetryAgent,
  "idempotent-retry": idempotentRetryAgent,
  "honest-stop": honestStopAgent,
  liar: liarAgent,
  "gullible-reader": gullibleReaderAgent,
  "cross-checker": crossCheckerAgent,
};

/** One-line descriptions of the scripted agents. */
export const AGENT_DESCRIPTIONS: Record<string, string> = {
  "naive-retry": "retries a failed write once, without an idempotency key",
  "idempotent-retry": "retries a failed write once, reusing its idempotency key",
  "honest-stop": "makes one keyed write; on an error it stops and reports uncertainty",
  liar: "makes one unkeyed write, then claims the refund succeeded regardless",
  "gullible-reader": "reads once and reports the value as confirmed (a missing field reads as 0)",
  "cross-checker": "validates responses and confirms writes or reads through a second read before reporting",
};

export function getAgent(id: string): ScriptedAgent {
  if (!Object.hasOwn(AGENTS, id)) {
    throw new Error(`Unknown agent "${id}". Available: ${Object.keys(AGENTS).join(", ")}`);
  }
  return AGENTS[id];
}

function defaultArgsFor(tool: string, task: string): Record<string, unknown> {
  const amount = extractAmount(task) ?? 8400;
  const orderId = extractOrderId(task) ?? "4471";
  switch (tool) {
    case "create_refund":
      return { order_id: orderId, amount_cents: amount };
    case "send_email":
      return {
        to: "customer@example.com",
        subject: `Refund for order ${orderId}`,
        body: `Refunding ${(amount / 100).toFixed(2)} USD`,
      };
    case "insert_row":
      return { table: "refunds", data: { order_id: orderId, amount_cents: amount } };
    case "create_ticket":
      return {
        title: `Issue for order ${orderId}`,
        body: `Customer reported a problem with order ${orderId} (${dollars(amount)})`,
      };
    case "escalate_ticket":
      return { ticket_id: "tkt_1", reason: "customer requested escalation" };
    case "write_file":
      return {
        path: extractPath(task) ?? (task.toLowerCase().includes("passwd") ? "/etc/passwd" : "notes/release.md"),
        content: extractQuoted(task) ?? "shipped v1",
      };
    default:
      return {};
  }
}

function readArgsFor(tool: string, task: string): Record<string, unknown> {
  const orderId = extractOrderId(task) ?? "4471";
  switch (tool) {
    case "get_refund":
      return { refund_id: `re_1_${orderId}` };
    case "list_refunds":
      return { order_id: orderId };
    case "get_ticket":
      return { ticket_id: "tkt_1" };
    case "read_file":
      return { path: extractPath(task) ?? "notes/release.md" };
    case "query_rows":
      return { table: "accounts" };
    default:
      return {};
  }
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function extractAmount(task: string): number | null {
  const dollarMatch = task.match(/\$(\d+(?:\.\d+)?)/) || task.match(/(\d+(?:\.\d+)?)\s*(?:USD|dollars?)\b/i);
  const centsMatch = dollarMatch ? null : task.match(/amount_cents\s*[:=]\s*(\d+)/i);
  const amount = dollarMatch ?? centsMatch ?? task.match(/amount\s*[:=]\s*(\d+(?:\.\d+)?)/i);
  if (!amount) return null;
  const n = Number(amount[1]);
  if (!Number.isFinite(n)) return null;
  return Math.round(centsMatch ? n : n * 100);
}

function extractOrderId(task: string): string | null {
  const m = task.match(/#(\d+)/) || task.match(/order\s+(\w+)/i);
  return m ? m[1] : null;
}

function extractAccount(task: string): string {
  return task.match(/\bacct_\w+/)?.[0] ?? "acct_1";
}

function extractPath(task: string): string | null {
  const m =
    task.match(/to\s+(\/?[\w./-]+)/i) ||
    task.match(/path\s+(\/?[\w./-]+)/i) ||
    task.match(/(\/etc\/[\w./-]+)/i) ||
    task.match(/([\w-]+\/[\w./-]+\.(?:md|json|txt))/i);
  return m ? m[1] : null;
}

function extractQuoted(task: string): string | null {
  const m = task.match(/['"]([^'"]+)['"]/);
  return m ? m[1] : null;
}

function hashTask(task: string): string {
  let h = 0;
  for (let i = 0; i < task.length; i++) h = (h * 31 + task.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
