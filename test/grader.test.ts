import { describe, expect, it } from "vitest";
import { getAgent } from "../src/fixtures/agents.js";

describe("refund amount parsing", () => {
  it("prefers dollar amounts over order numbers", async () => {
    // Exercise defaultArgs via agent that refunds
    const agent = getAgent("naive-retry");
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const tools = [
      {
        name: "create_refund",
        description: "refund",
        mutating: true,
        parameters: {},
      },
    ];
    await agent({
      task: "Refund $12.50 for order #4471",
      tools,
      callTool: async (tool, args) => {
        calls.push({ tool, args });
        return { ok: true, result: { refund_id: "re_1", amount_cents: 1250 } };
      },
    });
    expect(calls[0]?.args.amount_cents).toBe(1250);
    expect(calls[0]?.args.order_id).toBe("4471");
  });
});
