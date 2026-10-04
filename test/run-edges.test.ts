import { describe, expect, it } from "vitest";
import { MAX_TRIALS, parseTrials, runScenario } from "../src/runner.js";
import { findScenarios } from "../src/scenarios.js";

describe("parseTrials", () => {
  it("accepts positive integers as numbers or digit strings", () => {
    expect(parseTrials(1)).toBe(1);
    expect(parseTrials("3")).toBe(3);
    expect(parseTrials(MAX_TRIALS)).toBe(MAX_TRIALS);
  });

  it.each([0, -1, 1.5, NaN, Infinity, "abc", "", "1e3", "0x10", "2.0", MAX_TRIALS + 1, null, undefined])("rejects %j", (bad) => {
    expect(() => parseTrials(bad)).toThrow(/must be a positive integer no greater than 10000/);
  });
});

describe("runScenario input checks", () => {
  const scenario = () => findScenarios({ id: "payments/timeout-after-commit" })[0];

  it("throws before running when trials is zero", async () => {
    await expect(runScenario({ scenario: scenario(), agentId: "honest-stop", trials: 0 })).rejects.toThrow(/positive integer/);
  });

  it.each([
    [[0, 2]],
    [[3, 1]],
    [[1.5, 2]],
    [[1]],
  ])("rejects the fuzz range %j", async (range) => {
    await expect(runScenario({ scenario: scenario(), agentId: "honest-stop", fuzzCallRange: range as [number, number] })).rejects.toThrow(/Invalid fuzz call range/);
  });

  it("rejects an unknown agent and a missing agent", async () => {
    await expect(runScenario({ scenario: scenario(), agentId: "robot" })).rejects.toThrow('Unknown agent "robot". Available: naive-retry');
    await expect(runScenario({ scenario: scenario() })).rejects.toThrow("runScenario needs agentId");
  });

  it("does not modify the scenario it is given", async () => {
    const s = scenario();
    const before = structuredClone(s);
    await runScenario({ scenario: s, agentId: "naive-retry", trials: 3, fuzzCallRange: [1, 3] });
    expect(s).toEqual(before);
  });
});
