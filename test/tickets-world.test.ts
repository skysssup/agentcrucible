import { describe, expect, it } from "vitest";
import { runScenario } from "../src/runner.js";
import { findScenarios } from "../src/scenarios.js";
import { createTicketsWorld } from "../src/worlds/tickets.js";

describe("tickets world", () => {
  it("deduplicates create_ticket by idempotency key", () => {
    const world = createTicketsWorld();
    world.reset();
    const a = world.invoke("create_ticket", { title: "A", idempotency_key: "k1" }) as { ticket_id: string };
    const b = world.invoke("create_ticket", { title: "A", idempotency_key: "k1" }) as { ticket_id: string; deduplicated: boolean };
    expect(b).toEqual({ ticket_id: a.ticket_id, status: "open", deduplicated: true });
    expect((world.snapshot() as { tickets: unknown[] }).tickets).toHaveLength(1);
  });

  it("escalates once per key and appends a comment per unkeyed escalation", () => {
    const world = createTicketsWorld();
    world.reset();
    world.invoke("create_ticket", { title: "A" });
    world.invoke("escalate_ticket", { ticket_id: "tkt_1", reason: "vip", idempotency_key: "e1" });
    expect(world.invoke("escalate_ticket", { ticket_id: "tkt_1", reason: "vip", idempotency_key: "e1" })).toMatchObject({ deduplicated: true });
    world.invoke("escalate_ticket", { ticket_id: "tkt_1", reason: "again" });
    expect(world.invoke("get_ticket", { ticket_id: "tkt_1" })).toEqual({
      id: "tkt_1", title: "A", status: "escalated", comments: ["vip [idem:e1]", "again"],
    });
    expect(() => world.invoke("escalate_ticket", { ticket_id: "tkt_9" })).toThrow("ticket not found: tkt_9");
  });

  it("naive-retry opens two tickets for one issue", async () => {
    const report = await runScenario({ scenario: findScenarios({ id: "tickets/duplicate-create" })[0], agentId: "naive-retry", seed: "tickets-test" });
    expect(report.aggregateVerdict).toBe("HARMFUL_ACTION");
    expect(report.trials[0].effects.map((e) => e.id)).toEqual(["tkt_1", "tkt_2"]);
    expect(report.trials[0].findings[0].rule).toBe("expect.duplicate_effect");
  });
});
