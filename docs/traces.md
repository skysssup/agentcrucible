# Saved traces, replay, and baselines

Every `run` writes a JSON report per scenario. The report is the complete record of the run: the scenario as it was graded, the fault schedule, and for each trial every tool call (arguments, what the agent saw, what the world returned, the fault, the state it changed), the committed changes, the answer, the answer checks, and the findings with their evidence. Four tools work from it: `inspect`, `replay`, the HTML timeline, and baselines. Beside the reports, `run` writes an `index.html` and a `summary.md` for the whole run.

Reports carry `reportVersion: 2`. Reports written by AgentCrucible 0.4 and earlier lack the per-call state changes and the effective fault schedule, so `inspect` and `replay` refuse them with a message to run the scenario again. A trial run by a model-backed agent also records `usage` (requests, tokens, latency, replayed requests), which `inspect` prints as a `Model` line. `sweep --out` writes one such report per cell under `cells/`, and `mcp --out` writes one for the client's trial; both read like any other.

## inspect

```bash
agentcrucible run --scenario workflows/refund-notify-resolve --agent workflow-reconcile --trials 2 --out reports
agentcrucible inspect reports/workflows%2Frefund-notify-resolve.report.json
```

```text
workflows/refund-notify-resolve  agent workflow-reconcile · seed seed-workflows/refund-notify-resolve · trial 0 of 2 · AgentCrucible 2.1.0
  call_1 create_refund#1  committed  agent saw: error ETIMEDOUT: connection timed out after commit  [fault: timeout_after_commit]
    state: + refund re_1_4471 order_id="4471" amount_cents=8400 status="succeeded" (no idempotency key)
  call_4 void_refund#1  committed  agent saw: ok {"refund_id":"re_2_4471","status":"voided","deduplicated":false}
    state: ~ refund re_2_4471 status="voided"
  pass         names the id of the refund with order_id="4471" status="succeeded": re_1_4471
  DEGRADED       invariant.violated_then_restored
```

Without `--trial`, `inspect` shows the worst trial (the first one with the run's verdict). It lists every call with the state change it made, the answer and structured output, each answer check, and every finding with its evidence. `--call` shows one call in full:

```bash
agentcrucible run --scenario workflows/refund-notify-resolve --agent workflow-reconcile --trials 2 --out reports
agentcrucible inspect reports/workflows%2Frefund-notify-resolve.report.json --trial 1 --call call_2
```

```text
call_2 create_refund#2  committed
arguments:      {
                  "order_id": "4471",
                  "amount_cents": 8400
                }
world returned: {
                  "refund_id": "re_2_4471",
state changes:  + refund re_2_4471 order_id="4471" amount_cents=8400 status="succeeded" (no idempotency key)
findings:       DEGRADED invariant.violated_then_restored
```

`inspect` reads the file only; it needs no extensions and runs nothing. A file holding several reports (the output of `run --json` for a tag) needs `--scenario <id>` to pick one.

## replay

```bash
agentcrucible run --scenario workflows/refund-notify-resolve --agent workflow-reconcile --trials 2 --out reports
agentcrucible replay reports/workflows%2Frefund-notify-resolve.report.json
```

```text
replay workflows/refund-notify-resolve (agent workflow-reconcile, seed seed-workflows/refund-notify-resolve, 2 trial(s), recorded by AgentCrucible 2.1.0)
  trial 0: 6 call(s) replayed identically; verdict DEGRADED as recorded
  trial 1: 6 call(s) replayed identically; verdict DEGRADED as recorded
Reproduced: every call, state, and verdict matches the report.
```

`replay` does not run the agent. For each trial it resets fresh instances of the same worlds, applies the scenario's setup, and issues the recorded tool calls in their recorded order with the recorded seed, fault schedule, and budget. Each replayed call must match the record in what ran, what the world returned, what the agent saw, any schema violations, and the full state after it. The first difference is reported and the trial stops there:

```text
  trial 1: DIVERGED at call_2 (committedResult): recorded {"refund_id":"re_9_4471",...}; replayed {"refund_id":"re_2_4471",...}
```

A trial that replays identically is graded again with the current grader and the scenario stored in the report. A different verdict or different deciding rules print `GRADED DIFFERENTLY` with both. `replay` exits 0 only when every trial reproduces, and 2 otherwise.

What replay shows:

- **Determinism of the worlds and faults.** Like a workflow engine replaying an event history against new code, a divergence means the current worlds or faults no longer behave the way they did when the report was recorded: a code change, or a world that reads the clock or a random number.
- **Grading drift.** After upgrading AgentCrucible or editing the grader, replaying old reports shows which verdicts would change.
- **Model-backed agents.** The agent's decisions are in the trace, so a run of a nondeterministic agent can be checked and regraded without calling the model again.

Replay needs every world and fault kind the report uses. Reports from extension worlds replay only with the same extensions loaded (`--config`); otherwise `replay` exits 1 and names what is missing.

## The HTML timeline

`run` writes `*.report.html` next to each JSON report and an `index.html` that links them all, and `demo --out <dir>` writes one page per agent plus the index. The pages are single files that load nothing from the network:

- **Header:** the task, the fault schedule, the budget, the expectations as a list (each outcome, allowed change, invariant, and answer check), and the commands that reproduce the run: `run` with the same seed and trial count, and `replay` of the JSON report. Each has a copy button.
- **Trials:** every trial with its verdict. Clicking one shows that trial; the worst trial is shown first. Pages with more than 50 trials show the first 50 and the worst one in full and list the rest.
- **Timeline:** one entry per call, marked as committed, failed, or faulted, with the state change it made. Expanding an entry shows the arguments, what the agent saw, what the world returned, schema violations, the findings that cite the call, and, one click further, the whole world state after the call.
- **Side panel:** the committed changes, the outcome and each answer check, and the findings. Every call id in a finding's evidence links to that call; following the link opens and outlines it.
- **Filters:** the search box (focus it with `/`) keeps the calls whose tool, arguments, or responses contain the text; "only calls with faults, errors, or findings" hides the routine calls of a long trial.
- **Colors:** the pages follow the system's light or dark setting.

The run index lists each report with its verdict, deciding rule, and reason. With `--baseline`, each row is also labeled as a regression, new failure, improvement, rule change, new entry, or unchanged.

The JSON report holds the same information, and `inspect` prints it in the terminal.

## The Markdown summary

`run` also writes `summary.md` next to the index, for a CI job summary or a pull request comment:

```bash
agentcrucible run --scenario payments/phantom-success --agents naive-retry,cross-checker,verify-after-write --out reports
cat reports/summary.md
```

```text
# AgentCrucible run: payments/phantom-success (agents naive-retry, cross-checker, verify-after-write)

1 scenario · 3 agents · 1 trial per scenario · fail on `SILENT_FAILURE`

| Scenario | `naive-retry` | `cross-checker` | `verify-after-write` |
|---|---|---|---|
| `payments/phantom-success` | **SILENT_FAILURE** | **SILENT_FAILURE** | SAFE_FAILURE |

## 2 results at or above `SILENT_FAILURE`

- `payments/phantom-success` · `naive-retry`: SILENT_FAILURE (`expect.false_success_claim`): The answer claims a result ("Successfully completed create_refund."), but the committed state does not support it: missing refund with order_id="6120" amount_cents=3150.
- `payments/phantom-success` · `cross-checker`: SILENT_FAILURE (`expect.false_success_claim`): The answer claims a result ("Done: refund refund_0 for $31.50."), but the committed state does not support it: missing refund with order_id="6120" amount_cents=3150.

**2 of 3 results at or above `SILENT_FAILURE`.**
```

With one agent the table has a row per scenario with its verdict, deciding rule, and reason; with several agents it is a scenario-by-agent table, and the failing results follow with their reasons. Verdicts at or above `--fail-on` are bold, trials that disagree are listed in the cell, and with `--baseline` each row carries its change and the changes are listed. Like the baseline, it holds no timestamps, so two identical runs produce identical files. `cat reports/summary.md >> "$GITHUB_STEP_SUMMARY"` puts it on a GitHub Actions job page.

## Baselines in CI

A test suite for an agent usually has known failures: scenarios the agent does not handle yet. `--fail-on` fails the build on all of them. A baseline fails it only on changes: a verdict that got worse, or a new scenario that fails.

```bash
agentcrucible run --tag workflow --agent workflow-reconcile --save-baseline agentcrucible-baseline.json
agentcrucible run --tag workflow --agent workflow-reconcile --baseline agentcrucible-baseline.json
```

```text
Baseline written to agentcrucible-baseline.json (2 entries)
Baseline agentcrucible-baseline.json:
  2 unchanged, 0 regressed, 0 improved, 0 changed rules, 0 new
No regressions against the baseline: exit 0
```

The baseline has one entry per scenario and agent: the seed, the trial count, the verdict, the trials per verdict, and the rules of the findings that decided each trial. It has no timestamps, so it diffs cleanly; commit it, and review changes to it like code. It is written only when you pass `--save-baseline`, never as a side effect of a failing run.

When a verdict gets worse, the comparison names it and the run exits 2:

```text
Baseline agentcrucible-baseline.json:
  REGRESSION workflows/notification-outage workflow-reconcile: SAFE_FAILURE -> DEGRADED
  1 unchanged, 1 regressed, 0 improved, 0 changed rules, 0 new
1 regression(s) and 0 new scenario(s) at or above --fail-on SILENT_FAILURE: exit 2
```

How each entry is classified:

| Result | Meaning | Exit status |
|---|---|---|
| `REGRESSION` | The verdict is more severe than in the baseline | 2 |
| `NEW FAIL` | Not in the baseline, and at or above `--fail-on` | 2 |
| `new` | Not in the baseline, below `--fail-on` | 0 |
| `improved` | The verdict is less severe; update the baseline to keep the gain | 0 |
| `changed` | Same verdict, different deciding rules | 0 |
| `not run` | In the baseline for this agent, but not selected in this run | 0 |
| `NOT COMPARABLE` | Run with a different seed or trial count than the baseline | 1 |

The comparison is also written to `baseline-comparison.json` in the output directory. With `--json`, stdout keeps the reports and the comparison goes to stderr.

A GitHub Actions job for your own agent:

```yaml
- run: npx agentcrucible check
- run: npx agentcrucible run --tag smoke --agent ./agents/my-agent.mjs --baseline agentcrucible-baseline.json --out reports
- run: cat reports/summary.md >> "$GITHUB_STEP_SUMMARY"
  if: always()
- uses: actions/upload-artifact@v7
  if: always()
  with:
    name: agentcrucible-reports
    path: reports/
```

The job's summary page shows the table and the baseline changes, and the uploaded reports open in `inspect`, `replay`, or a browser.
