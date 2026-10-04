import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runMatrix } from "../src/runner.js";
import { findScenarios } from "../src/scenarios.js";
import { renderRunSummary, writeRunSummary } from "../src/summary.js";
import type { RunReport } from "../src/types.js";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const scenarios = ["payments/timeout-after-commit", "payments/retry-storm"].map((id) => findScenarios({ id })[0]);

describe("renderRunSummary", () => {
  it("writes one row per scenario for one agent, with the deciding rule and reason", async () => {
    const reports = await runMatrix({ scenarios, agents: ["cross-checker"], trials: 4, seed: "ci" });
    const text = renderRunSummary(reports.map((report) => ({ report })), { title: "AgentCrucible run: 2 scenarios (agent cross-checker)", failOn: "SILENT_FAILURE" });
    expect(text).toContain("# AgentCrucible run: 2 scenarios (agent cross-checker)\n\n2 scenarios · agent `cross-checker` · 4 trials per scenario · fail on `SILENT_FAILURE`\n");
    expect(text).toContain("| Scenario | Verdict | Rule | Reason |\n|---|---|---|---|\n");
    expect(text).toContain("| `payments/timeout-after-commit` | SAFE_SUCCESS | `grader.verified_success` | Matches the scenario's expectations");
    // Trials that disagree are listed; trials that agree are not repeated.
    expect(text).toMatch(/\| `payments\/retry-storm` \| SAFE_FAILURE \(\d SAFE_FAILURE, \d SAFE_SUCCESS\) \|/);
    expect(text).not.toContain("(4 SAFE_SUCCESS)");
    expect(text.trimEnd().endsWith("**No result at or above `SILENT_FAILURE`.**")).toBe(true);
    expect(text).not.toContain("## ");
  });

  it("writes a scenario-by-agent table for several agents, bolds failing verdicts, and lists them", async () => {
    const reports = await runMatrix({ scenarios, agents: ["naive-retry", "cross-checker"], seed: "ci" });
    const text = renderRunSummary(reports.map((report) => ({ report })), { title: "T", failOn: "DEGRADED" });
    expect(text).toContain("2 scenarios · 2 agents · 1 trial per scenario · fail on `DEGRADED`");
    expect(text).toContain("| Scenario | `naive-retry` | `cross-checker` |\n|---|---|---|\n");
    expect(text).toContain("| `payments/timeout-after-commit` | **HARMFUL_ACTION** | SAFE_SUCCESS |");
    expect(text).toContain("## 2 results at or above `DEGRADED`\n\n- `payments/timeout-after-commit` · `naive-retry`: HARMFUL_ACTION (`expect.duplicate_effect`): Expected one refund");
    expect(text.trimEnd().endsWith("**2 of 4 results at or above `DEGRADED`.**")).toBe(true);
  });

  it("adds the baseline change to each row and lists the changes", async () => {
    const reports = await runMatrix({ scenarios, agents: ["naive-retry"] });
    const entries = [
      { report: reports[0], change: "regression" as const },
      { report: reports[1], change: "unchanged" as const },
    ];
    const text = renderRunSummary(entries, { title: "T", failOn: "SILENT_FAILURE", baselinePath: "base.json" });
    expect(text).toContain("fail on `SILENT_FAILURE` · baseline `base.json`");
    expect(text).toContain("| Scenario | Verdict | Change | Rule | Reason |");
    expect(text).toContain("| `payments/timeout-after-commit` | **HARMFUL_ACTION** | regression | `expect.duplicate_effect` |");
    expect(text).toContain("| `payments/retry-storm` | DEGRADED | unchanged |");
    expect(text).toContain("## 1 change against the baseline\n\n- regression: `payments/timeout-after-commit` · `naive-retry`: HARMFUL_ACTION");
    const same = renderRunSummary(entries.map((e) => ({ ...e, change: "unchanged" as const })), { title: "T", failOn: "SILENT_FAILURE", baselinePath: "base.json" });
    expect(same).toContain("No changes against the baseline.");
    const multi = renderRunSummary(
      [...entries, { report: { ...reports[0], agentId: "other" } as RunReport, change: "new" as const }],
      { title: "T", failOn: "SILENT_FAILURE", baselinePath: "base.json" }
    );
    expect(multi).toContain("| `payments/timeout-after-commit` | **HARMFUL_ACTION** (regression) | **HARMFUL_ACTION** (new) |");
    expect(multi).toContain("| `payments/retry-storm` | DEGRADED |  |");
  });

  it("keeps pipes and line breaks out of table cells", async () => {
    const [report] = await runMatrix({ scenarios: scenarios.slice(0, 1), agents: ["naive-retry"] });
    const tricky = { ...report, scenarioId: "a|b", trials: report.trials.map((t) => ({ ...t, reason: "line one\n  line | two" })) } as RunReport;
    const text = renderRunSummary([{ report: tricky }], { title: "T", failOn: "SILENT_FAILURE" });
    expect(text).toContain("| `a\\|b` | **HARMFUL_ACTION** | `expect.duplicate_effect` | line one line \\| two |");
  });

  it("writes summary.md into the output directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ac-summary-"));
    dirs.push(dir);
    const reports = await runMatrix({ scenarios: scenarios.slice(0, 1), agents: ["cross-checker"] });
    const path = writeRunSummary(reports.map((report) => ({ report })), join(dir, "nested", "out"), { title: "T", failOn: "SILENT_FAILURE" });
    expect(path).toBe(join(dir, "nested", "out", "summary.md"));
    expect(readFileSync(path, "utf8")).toContain("# T\n");
  });
});
