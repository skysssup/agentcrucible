import { describe, expect, it } from "vitest";
import { DEMO_SCENARIO, DEMO_SEED } from "../src/demo.js";
import { runScenario } from "../src/runner.js";
import { findScenarios } from "../src/scenarios.js";
import { evidenceCard, evidenceMarkdown } from "../src/ui/client/pages/lab.js";

describe("failure lab evidence", () => {
  it("shows the real committed timeout and exports reproducible identifiers", async () => {
    const scenario = findScenarios({ id: DEMO_SCENARIO })[0];
    const report = await runScenario({ scenario, agentId: "naive-retry", seed: DEMO_SEED });
    expect(report.aggregateVerdict).toBe("HARMFUL_ACTION");
    const html = evidenceCard(report, "mem-1");
    expect(html).toContain("Service executed the call");
    expect(html).toContain("agent received an error");
    expect(html).toContain("timeout_after_commit");
    expect(html).toContain('href="#/report/mem-1"');
    const md = evidenceMarkdown([report]);
    expect(md).toContain(`Seed: ${DEMO_SEED}`);
    expect(md).toContain("expect.duplicate_effect");
    expect(md).toContain("not production reliability measurements");
  });
  it("escapes agent names and answers in the result cards", async () => {
    const report = await runScenario({ scenario: findScenarios({ id: DEMO_SCENARIO })[0], agentId: "cross-checker", seed: DEMO_SEED });
    report.agentId = '<img src=x onerror="alert(1)">';
    report.trials[0].trace.finalAnswer = "<script>bad()</script>";
    const html = evidenceCard(report);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
