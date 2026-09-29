import { describe, expect, it } from "vitest";
import { createTicketsWorld } from "../src/worlds/tickets.js";
import { runScenario } from "../src/runner.js";
import { findScenarios } from "../src/scenarios.js";

describe("tickets world", () => {
  it("deduplicates create_ticket by idempotency key", () => {
    const world = createTicketsWorld();
    world.reset();
    const a = world.invoke("create_ticket", {
      title: "A",
      idempotency_key: "k1",
    }) as { ticket_id: string; deduplicated: boolean };
    const b = world.invoke("create_ticket", {
      title: "A",
      idempotency_key: "k1",
    }) as { ticket_id: string; deduplicated: boolean };
    expect(a.ticket_id).toBe(b.ticket_id);
    expect(b.deduplicated).toBe(true);
    const snap = world.snapshot() as { tickets: unknown[] };
    expect(snap.tickets).toHaveLength(1);
  });

  it("flagship duplicate-create marks naive-retry critical", async () => {
    const scenario = findScenarios({ id: "tickets/duplicate-create" })[0];
    expect(scenario).toBeTruthy();
    const report = await runScenario({
      scenario,
      agentId: "naive-retry",
      seed: "tickets-test",
      trials: 1,
    });
    expect(["HARMFUL_ACTION", "SILENT_FAILURE", "DEGRADED"]).toContain(report.aggregateVerdict);
  });
});
