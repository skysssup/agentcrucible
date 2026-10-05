import { describe, expect, it } from "vitest";
import { computeCoverage, formatCoverage } from "../src/coverage.js";
import { builtinRegistry } from "../src/registry.js";
import { bundledScenariosDir, loadAllScenarios, parseScenario } from "../src/scenarios.js";

const registry = builtinRegistry();

describe("computeCoverage", () => {
  it("maps every bundled scenario's faults onto tools and fault kinds", () => {
    const scenarios = loadAllScenarios([bundledScenariosDir()], registry);
    const c = computeCoverage(scenarios, registry);
    expect(c.scenarios).toHaveLength(scenarios.length);
    expect(c.scenarios).toEqual([...c.scenarios].sort());
    const payments = c.worlds.find((w) => w.name === "payments")!;
    expect(payments.scenarios.length).toBeGreaterThan(5);
    const createRefund = payments.tools.find((t) => t.name === "create_refund")!;
    expect(createRefund.mutating).toBe(true);
    expect(createRefund.faultKinds).toContain("timeout_after_commit");
    expect(createRefund.scenarios).toContain("payments/timeout-after-commit");
    const timeoutAfterCommit = c.faultKinds.find((k) => k.kind === "timeout_after_commit")!;
    expect(timeoutAfterCommit.stage).toBe("after");
    expect(timeoutAfterCommit.targets).toContain("payments/create_refund");
    expect(timeoutAfterCommit.scenarios).toContain("payments/timeout-after-commit");
    expect(c.matrix.find((cell) => cell.kind === "timeout_after_commit" && cell.tool === "create_refund")?.scenarios).toContain("payments/timeout-after-commit");
    expect(c.gaps.faultKinds).toEqual([]);
    expect(c.gaps.tools).not.toContain("payments/create_refund");
    expect(c.gaps.worlds).toEqual([]);
    expect(c.gaps.withoutExpectedVerdicts).toEqual([]);
    const naive = c.agents.find((a) => a.id === "naive-retry")!;
    expect(naive.scenarios.length).toBeGreaterThan(3);
    expect(naive.expected.HARMFUL_ACTION).toBeGreaterThan(0);
  });

  it("expands target * to every tool of the scenario's worlds and lists the gaps", () => {
    const star = parseScenario({ id: "t/star", world: "email", description: "d", task: "t", faults: [{ target: "*", kind: "timeout" }] }, undefined, registry);
    const bare = parseScenario({ id: "t/bare", world: "tickets", description: "d", task: "t" }, undefined, registry);
    const c = computeCoverage([star, bare], registry);
    const email = c.worlds.find((w) => w.name === "email")!;
    expect(email.tools.every((t) => t.faultKinds.includes("timeout"))).toBe(true);
    expect(c.faultKinds.find((k) => k.kind === "timeout")!.targets).toEqual(email.tools.map((t) => `email/${t.name}`).sort());
    expect(c.gaps.worlds).toEqual(["payments", "database", "filesystem"]);
    expect(c.gaps.faultKinds).not.toContain("timeout");
    expect(c.gaps.faultKinds).toContain("omission");
    expect(c.gaps.tools).toContain("payments/create_refund");
    expect(c.gaps.tools).not.toContain("email/send_email");
    expect(c.gaps.withoutExpect).toEqual(["t/bare", "t/star"]);
    expect(c.gaps.withoutExpectedVerdicts).toEqual(["t/bare", "t/star"]);
    expect(c.gaps.withoutFaults).toEqual(["t/bare"]);
    expect(c.gaps.withoutTags).toEqual(["t/bare", "t/star"]);
    expect(c.gaps.agents).toEqual([...registry.agents.keys()]);
  });

  it("formats tables with the gaps spelled out", () => {
    const scenarios = loadAllScenarios([bundledScenariosDir()], registry);
    const text = formatCoverage(computeCoverage(scenarios, registry), false);
    expect(text).toContain(`coverage  ${scenarios.length} scenarios · 5 worlds`);
    expect(text).toMatch(/payments\s+\d+ scenarios\s+\d\/4 tools faulted: create_refund \(\d+\)/);
    expect(text).toMatch(/timeout_after_commit\s+after\s+\d+ scenarios\s+.*payments\/create_refund/);
    expect(text).toMatch(/naive-retry\s+\d+ scenarios\s+expected \d+ HARMFUL_ACTION/);
    expect(text).toContain("gaps");
    const empty = formatCoverage(computeCoverage([], registry), false);
    expect(empty).toContain("0 scenarios");
    expect(empty).toContain("worlds without a scenario: payments, database, email, tickets, filesystem");
    expect(empty).toContain("fault kinds no scenario injects:");
  });
});
