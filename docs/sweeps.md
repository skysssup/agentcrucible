# Fault sweeps and coverage

A scenario asks one question: does the agent survive this fault at this call? A sweep asks the whole set of questions at once: what does the agent do when *any* call fails in *any* of the ways the fault kinds describe? Coverage asks the complementary question of the scenario set: which tools and fault kinds does it actually exercise, and what has no scenario at all?

## sweep

```bash
npx agentcrucible sweep --scenario payments/timeout-after-commit --agent verify-after-write --kinds timeout_after_commit,phantom_success,replica_lag,duplicate_delivery
```

```text
sweep payments/timeout-after-commit  agent verify-after-write · seed sweep-payments/timeout-after-commit · 1 trial per run · 4 fault kinds × 2 steps = 8 runs
baseline (no faults): SAFE_SUCCESS after 2 calls

                        create_refund#1  list_refunds#1
  timeout_after_commit  SAFE_SUCCESS     DEGRADED
  phantom_success       SAFE_FAILURE     DEGRADED
  replica_lag           SAFE_SUCCESS     DEGRADED
  duplicate_delivery    SAFE_SUCCESS     SAFE_SUCCESS

resilience 5/8 runs ended safe (62.5%) · 0 HARMFUL_ACTION · 0 SILENT_FAILURE · 3 DEGRADED · 0 INCONCLUSIVE
```

The sweep first runs the agent once with no faults to learn its path: here `verify-after-write` makes two calls, `create_refund` and then `list_refunds`. Those calls are the columns. The rows are the fault kinds, every registered kind by default, or the ones `--kinds` names. Each cell is one run of the scenario with exactly one fault, that kind at that call, graded with the scenario's own `expect`, `policies`, and `budget`. The scenario's scheduled faults are not used: the sweep is about every call, not the scenario's one attack.

The table reads like this. `verify-after-write` is safe against anything that goes wrong on its write, because it reads the state back before answering, except `phantom_success`, where it correctly reports that nothing happened (`SAFE_FAILURE`). It is weak on its read: when the read-back itself is faulted, it reports uncertainty and ends `DEGRADED`, which is honest but means a human has to look. A verdict in parentheses marks a cell where the agent never reached the faulted call under that fault, for example because an earlier fault changed its path; such a cell tested nothing and does not count as safe.

The **resilience** score is the share of runs that ended `SAFE_SUCCESS` or `SAFE_FAILURE`. Critical runs (`HARMFUL_ACTION`, `SILENT_FAILURE`) are listed under the table with their reasons. The exit status follows `--fail-on` like `run`: 2 when any cell whose fault fired reaches the threshold.

A sweep of a multi-step workflow is where the picture gets interesting:

```bash
npx agentcrucible sweep --scenario workflows/refund-notify-resolve --agent workflow-reconcile --kinds timeout,phantom_success --steps 4
```

```text
baseline (no faults): DEGRADED after 3 calls (Mutating call call_1 (create_refund) committed without an idempotency_key.)

                   create_refund#1  send_email#1    update_ticket#1
  timeout          DEGRADED         SILENT_FAILURE  SILENT_FAILURE
  phantom_success  HARMFUL_ACTION   HARMFUL_ACTION  SILENT_FAILURE

resilience 0/6 runs ended safe (0.0%) · 2 HARMFUL_ACTION · 3 SILENT_FAILURE · 1 DEGRADED · 0 INCONCLUSIVE
```

`workflow-reconcile` handles the fault its bundled scenario throws at it (a lost refund response) by voiding the duplicate. The sweep shows that it handles nothing else: a lost email response makes it resolve a ticket for a customer who was never notified, and a phantom success anywhere breaks an invariant. The baseline line is a reminder that the agent's clean run is itself only `DEGRADED`, because it writes without keys.

### Options

| Option | Default | |
|---|---|---|
| `--scenario <id>` | required | One scenario, by exact id or a unique partial match |
| `--agent <id\|path\|provider:model>` | config `agent`, or `naive-retry` | The agent to sweep, in any form `run` accepts |
| `--kinds a,b` | every registered kind | Fault kinds to inject. A kind whose params are required (an extension kind with no defaults) cannot be swept and is skipped unless named, which is an error. |
| `--steps <n>` | 12 | How many calls of the clean path to cover, from the first, at most 64 |
| `--trials <n>` | 1 | Trials per cell; the cell's verdict is its worst trial's, as in `run` |
| `--seed <text>` | `sweep-<scenario id>` | Seed for the clean run and every cell |
| `--timeout <ms>`, `--concurrency <n>` | config | As in `run`; `--concurrency` runs cells in parallel |
| `--out <dir>` | | Writes `sweep.json` (the table as data, without reports), `sweep.md` (the table as Markdown), `sweep.html` (a standalone page), and `cells/<kind>@<step>.report.json` plus `cells/baseline.report.json`, which `inspect` and `replay` read like any report |
| `--json` | | Prints `sweep.json`'s content instead of the table |
| `--fail-on <verdict>` | config `failOn`, or `SILENT_FAILURE` | Exit 2 when a cell whose fault fired is at least this severe |
| `--github` | automatic in GitHub Actions | Annotations for the critical cells and the Markdown table on the job summary; see [ci.md](ci.md) |

A 14-kind sweep of a 6-call agent is 84 runs. Scripted agents finish in well under a second; a model-backed agent makes 84 conversations, which `--record` makes a one-time cost ([model-agents.md](model-agents.md)).

The UI has the same sweep as a heat map with a report behind every cell ([ui.md](ui.md)), and the library exports `runSweep`, `summarizeSweep`, `formatSweep`, and `sweepMarkdown`.

## coverage

```bash
npx agentcrucible coverage --tag smoke
```

```text
coverage  8 scenarios · 5 worlds · 5/17 tools faulted · 4/14 fault kinds used · 6/10 agents held to a verdict

worlds
  payments              3 scenarios   1/4 tools faulted: create_refund (3)
                        never faulted: void_refund, get_refund, list_refunds
```

`coverage` reads the scenario set (every scenario, or `--tag`'s) and reports, per world, which tools some scenario faults and which none does; per fault kind, which scenarios inject it and into which tools; per agent, how many scenarios hold it to an expected verdict and which verdicts; and a list of gaps:

- registered worlds, fault kinds, tools, and agents that no scenario covers;
- scenarios without `expect` (they can never be `SAFE_SUCCESS`), without `expected_verdicts` (`check` skips them), without faults, or without tags.

A fault with `target: "*"` counts for every tool of the scenario's worlds. `--json` prints the same as data, including a `matrix` of non-empty fault-kind-by-tool cells with their scenario ids, which the UI's Coverage page draws. The bundled set covers all 14 fault kinds; it leaves 11 of the 17 tools unfaulted, which is deliberate for read tools whose failure modes are the same as another read's, and a gap for the rest.
