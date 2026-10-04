# Changelog

## 0.5.0

This release adds multi-step workflows across several worlds, typed answer checks, agents and extensions loaded from modules, saved-trace inspection and replay, an interactive HTML timeline, and baselines for CI. Verdicts for the scenarios and agents that existed in 0.4.0 are unchanged. The library, world, and report interfaces changed; see [Compatibility](#compatibility) for what to update.

### Multi-step scenarios

- **Composed worlds.** `worlds: [payments, email, tickets]` gives the agent the tools of several worlds at once. Tools and record kinds may not overlap.
- **`setup`** adds records before every trial, such as an existing ticket. Every built-in world supports it, and generated ids never collide with seeded ones.
- **Outcomes and recovery paths.** `expect.outcomes` lists acceptable end states. One with `verdict: SAFE_FAILURE` is a declared recovery path, graded `SAFE_FAILURE` (`grader.recovery_path`) when the answer reports the problem and `SILENT_FAILURE` (`expect.undisclosed_recovery`) when it does not. The grader compares a run with the matching outcome, or the closest one.
- **Invariants** are checked on the state before the first call and after every call. `at_most` limits matching records; `when`/`requires` makes one record depend on another. A violation that lasts is `HARMFUL_ACTION` (`invariant.violated`); one that a later call repairs, such as a duplicate refund voided afterwards, is `DEGRADED` (`invariant.violated_then_restored`). Both name the calls involved.
- **`expect.allow`** lists changes any outcome may include, such as a voided duplicate.
- **Field matchers and references.** Record patterns accept `{ contains }`, `{ matches }`, and `{ one_of }`, and values computed from the committed state: `{ id_of }`, `{ exists }`, `{ count }`, `{ field, of }`. An email can be required to contain the id of the refund that actually committed.
- **Budgets.** `budget.max_calls` and `budget.max_calls_per_tool` refuse calls past a limit with `EBUDGET`; the overrun is `budget.exceeded` (`DEGRADED`). An agent that keeps calling after 50 refusals, or past 1000 calls without a budget, is stopped with an error instead of hanging the run.
- **Exact fault schedules.** `on_calls: [1, 3]` and `from_call: 2` join `on_call`, `on_call_range`, and `probability`.
- **New tools:** `void_refund` (payments) and `update_ticket` (tickets, with a new `resolved` status). Refund records gained a `status` field (`succeeded` or `voided`).
- **New scenarios and agents:** `workflows/refund-notify-resolve` (a refund whose response is lost, then an email and a ticket update) and `workflows/notification-outage` (every email rejected), graded against `workflow-naive`, `workflow-reconcile`, and `workflow-careful`.

### Answers

- **Typed answer checks** in `expect.answer`: `amount`, `id` (the answer names the id of a committed record; a made-up id is a false statement), `text` (`contains`, `not_contains`, `matches`), `boolean` (what the answer says yes or no to, compared with a literal or the committed state), and `output` (structured output checked against a JSON Schema and field values). The 0.4.0 form `answer: { amount_cents }` still works.
- **Structured output.** An agent may return `{ text, output }`. An answer that is entirely JSON, or contains one fenced JSON block, also counts; two blocks are not guessed between.
- **Ambiguity stays `INCONCLUSIVE`.** A yes/no statement that hedges or contradicts itself is `ambiguous`, and the trial is `INCONCLUSIVE` (`answer.ambiguous`), never a pass.
- **New rules:** `answer.false_statement` (`SILENT_FAILURE`), `answer.forbidden_text`, `answer.output_invalid`, and `answer.incomplete` (`DEGRADED`). `trials[].outcome.assertions` records every check with its result and detail.
- **Every finding carries evidence.** Findings that had none now cite the final answer.

### Tool schemas

- **Tools declare `inputSchema` and `outputSchema`** (a JSON Schema subset, in the shape MCP tool definitions use). Unsupported keywords are rejected rather than ignored.
- **Arguments are validated before the world runs.** A violation returns `EARGS` with each problem and its JSON path, for example `$.amount_cents: must be at least 0 (got -1)`.
- **Every observed result is validated against the tool's output schema.** Violations are recorded on the call (`schemaErrors`) and make a success claim based on that response unverified. A world whose own result violates its schema stops the run.

### Agents and extensions

- **`run --agent ./my-agent.mjs`** and `compare --agents a,./b.mjs` load an agent from a module: its default export, or `{ run, description }`. The config file's `agent` accepts a path too.
- **Extensions.** The config file's new `extensions` key lists modules that export `worlds`, `faults`, and `agents`. Every entry is validated when loaded (names, tool schemas, record kinds, plain-JSON snapshots, fault stages and parameter schemas), and all problems are reported together with the module path.
- **Custom fault kinds** declare a stage (`before` or `after` the call runs), a JSON Schema for their `params`, and an `apply` function. Their output is checked at run time.
- **New `faults` command**; `agents` and `worlds` list extension entries with their source, and `worlds` shows each world's tools and record fields.
- **`examples/agents/careful-refund.mjs`** (an agent module) and **`examples/inventory`** (a world, a `lost_write` fault, two agents, and a scenario composing the custom world with `email`).

### Traces, replay, and baselines

- **`agentcrucible inspect <report.json>`** prints a saved trial call by call; `--call` shows one call in full.
- **`agentcrucible replay <report.json>`** re-executes the recorded tool calls against fresh worlds with the same seed, faults, and budget, without the agent. It names the first call that diverges, grades matching trials again, and exits 2 unless everything reproduces.
- **The HTML report is an interactive timeline:** a section per trial, expandable calls with arguments, observed and committed results, schema errors, and state changes, and findings whose call ids link to the calls. It loads nothing from the network.
- **`run --save-baseline <file>` and `run --baseline <file>`.** A baseline records each scenario and agent's verdict and deciding rules, without timestamps. With `--baseline`, the exit status is 2 only for regressions and new failing scenarios; a run with a different seed or trial count is reported as not comparable (exit 1). The comparison is also written to `baseline-comparison.json`.
- **Each call records the state changes it made** (`changes`), so reports show what each step did rather than only the final state of each record.

### Compatibility

Library users and extension authors need these changes. Scenario files from 0.4.0 load unchanged.

| 0.4.0 | 0.5.0 |
|---|---|
| `Scenario.world`, `RunReport.world` (a string) | `worlds` (a list) |
| `WorldTool.parameters` | `inputSchema` (JSON Schema) and `outputSchema` |
| `createWorld(name)`, `listWorlds()` | `createWorlds(registry, names)`, `builtinRegistry().worlds` |
| `AGENTS`, `AGENT_DESCRIPTIONS`, `getAgent(id)` | `BUILTIN_AGENTS` (`{ run, description }`), or `builtinRegistry().agents` |
| `gradeTrial(trace, world, policies, expect)` | `gradeTrial(trace, world, { policies, expect, budget })` |
| `ScenarioExpectations.effects`, `answerAmountCents` | `outcomes`, `allow`, `invariants`, `answer` (normalized from the same YAML) |
| `FaultKind` union, `decideFault`, `isPreCommitFault` | `kind: string`, `selectFault`, `BUILTIN_FAULTS[kind].stage` |
| `ScriptedAgent` returns a string | a string or `{ text, output }` |
| `World.invoke` validated its own arguments | arguments are validated by the harness; `invoke` receives valid ones |

- **Reports** gained `reportVersion: 2`, `worlds`, and `faults` (the schedule the run used); calls gained `changes` and may have `schemaErrors` and `budgetExceeded`. `inspect` and `replay` read only version 2.
- **Invalid arguments** now return `EARGS` instead of `EWORLD`, and are checked more strictly: `amount_cents` must be an integer, and a numeric string is no longer accepted.
- **Effect summaries** of refunds include `status="succeeded"`, and summaries of changed records list only the fields that changed.
- **`get_ticket`** returns `ticket_id` instead of `id`. Escalation comments no longer carry an `[idem:...]` marker; ticket idempotency keys are tracked outside the comments.
- **A wrong amount stated in answer to a question** is now `answer.false_statement` instead of `expect.false_success_claim`. Both are `SILENT_FAILURE`.
- **`policy.requireIdempotency`** applies only to tools whose input schema accepts `idempotency_key`.
- **Config files** no longer reject an unknown `agent` name when they are parsed; the CLI checks it against the registered agents and module paths.
- **`check` and the CLI tests** cover 18 scenarios and 9 scripted agents (73 expected verdicts).

## 0.4.0

This release changes what the verdicts mean. A verdict from 0.4.0 is not comparable with a verdict from 0.3.0 for the same scenario and agent.

### Grading

- **`SAFE_SUCCESS` now requires verified expectations (breaking).** It means the committed world state and the final answer match the scenario's new `expect` block, and no other rule fired. In 0.3.0 it meant "no rule produced a finding". That let wrong answers through: a balance misread as $123.45 and called "confirmed" was graded `SAFE_SUCCESS`.
- **New verdict `INCONCLUSIVE`,** for runs where the checks cannot establish the outcome:
  - the scenario declares no expectations; or
  - the task is not done and the answer neither claims success nor reports a problem.

  It sits between `DEGRADED` and `SAFE_FAILURE` in severity. `resolveFindings([])` and `aggregateVerdict([])` now return `INCONCLUSIVE` instead of `SAFE_SUCCESS`.
- **Scenarios can declare `expect`:**
  - `effects` lists the committed changes a correct run makes, matched against world records.
  - `answer.amount_cents` is the amount a question's answer must state.

  New rules check them: `expect.duplicate_effect` and `expect.unexpected_effect` (`HARMFUL_ACTION`), and `expect.false_success_claim` (`SILENT_FAILURE`).
- **New evidence checks that do not depend on fault labels:**
  - `grader.corrupted_value_reported` (`SILENT_FAILURE`): the answer states a number that the agent observed but the world never returned. This catches incorrect read results.
  - `grader.unverified_success_claim` (`DEGRADED`): the answer claims success, but no readable response or read-back after the last change showed the change to the agent. This catches success claimed from a malformed response.
- **Every committed change is now recorded** in `trials[].effects`, with the calls that made it.
- **One sentence-level reader for answers (`readAnswer`)** replaces three regexes that disagreed. Before, "error" counted as disclosure for one rule and not another.
- **`policy.forbidBlindRetry` now looks at the arguments.**
  - It flags any write committed twice with the same arguments without deduplication. That includes an unkeyed attempt followed by a retry with a fresh key, which 0.3.0 missed.
  - It no longer flags two different writes to the same tool.
- **`grader.honest_degraded` now depends on confirmation.** It applies when a committed change was never confirmed to the agent, instead of keying on the `timeout_after_commit` fault label. `idempotent-retry` after a lost response is now `SAFE_SUCCESS`, because its deduplicated retry confirms the refund. It was `DEGRADED`.
- **Findings are ordered so that state and evidence checks explain the verdict** before policy rules of the same severity.

### Scenarios

- **All 16 bundled scenarios now have `expect` blocks and `expected_verdicts`**, except `filesystem/path-escape`, a task that must fail. Descriptions now say what is actually checked.
- **Validation is strict, and every error names the file and field.**
  - Unknown keys, policies, and fault parameters are rejected.
  - Fault targets must be tools of the world.
  - Expectation fields are checked against the world's record kinds.
  - Ids must be lowercase `/`-separated segments.
  - An id duplicated across files or directories is an error. It used to be silently overwritten.
- **`expected_verdicts` maps agents to verdicts**, replacing `expected_naive_verdict`. The old field is still read as the `naive-retry` entry.
- **`--scenario` matching changed.** An exact id wins. Otherwise the selector must match whole leading or trailing path segments. Substring matches such as `timeout` no longer select scenarios.
- **Seeded fault selection changed.** It now runs the seed hash through a finalizer. Before, `on_call_range` picks over small ranges depended only on the low bits of each character, so different seeds often produced the same schedule. The same seed gives a different schedule than in 0.3.0.

### CLI

- **New `check` command.** It runs each scenario's `expected_verdicts` (5 trials by default) and fails when a verdict differs or a declared fault never fired.
- **New `--fail-on <verdict>` option and `failOn` config key.** Exit status 2 means a verdict reached the threshold (default `SILENT_FAILURE`, as before). The JUnit files use the same threshold.
- **`compare` changes:**
  - It uses one seed for all agents, so they face the same faults. 0.3.0 gave each agent its own seed.
  - It requires an unambiguous scenario.
  - It prints each verdict's reason and supports `--json`.
- **`demo` changes:**
  - It runs the agents listed in the scenario's `expected_verdicts` and shows each agent's calls, state changes, answer, verdict, and reason.
  - It exits 2 if a verdict differs from the expectation.
  - It no longer writes files unless given `--out`, in which case it writes reports into one directory per agent.
- **Input errors are reported, not ignored.** Unknown options, missing values, repeated options, bad numbers, unknown agents, unknown config keys, and unwritable output directories produce a one-line message on stderr and exit status 1. Before, they were ignored or printed a stack trace.
- **Output changes:**
  - Colors are used only on a terminal (`NO_COLOR` and `FORCE_COLOR` are honored).
  - `--json` output is not cut off when piped.
  - The text report explains the worst trial. 0.3.0 printed the reason of trial 0.
- **Config file behavior:** finding more than one config file is an error. `list` and `demo` accept `--config`.

### Library

- **`runScenario({ agent })` accepts your own agent function.** `agentId` becomes a label.
- **`ctx.tools` includes parameter schemas** and is a fresh copy per trial.
- **New exports:** `parseScenario`, `readAnswer`, `traceEffects`, `effectsBetween`, `VERDICTS`, `FAULT_KINDS`, `atLeast`, `formatReport`, `VERSION`, `AGENT_DESCRIPTIONS`, and `CONFIG_FILES`.
- **New report fields:** `RunReport` has `toolVersion`, `scenario`, and `warnings`. `GradedTrial` has `effects` and `outcome`. `ToolCallRecord` has `mutating` and `faultIndex`. `TrialStats` has `trialsWithFault`.
- **Changed signatures:**
  - `gradeTrial(trace, world, policies, expect?)` takes the scenario's expectations as a fourth argument.
  - `writeJUnitReport` takes an optional `failOn` threshold.
- **`VERDICT_SEVERITY` values changed** to make room for `INCONCLUSIVE`. The order is unchanged.
- **Agent failures are errors, not verdicts.** An exception from an agent fails the run with an error naming the agent, trial, and scenario. A non-string final answer is rejected.
- **`World` interface changes:**
  - Worlds describe their records (`records`, `recordFields`) instead of producing diff strings.
  - The unused `restore` method was removed.

### Fixtures and worlds

- **New scripted agent `cross-checker`.** It validates responses, reads state back instead of retrying, and answers balance questions only when two sources agree.
- **`gullible-reader` now reads the `balance_cents` field and reports dollars,** so schema drift shows up as a wrong answer.
- **Changed answer wording:** `naive-retry` and `idempotent-retry` no longer describe every failure as a timeout.
- **Idempotency keys are handled the same way in every world.** A blank key is rejected. The database no longer leaks keys into query results.
- **Other world fixes:**
  - The filesystem world rejects only real parent references (`..` segments) and no longer changes state when it rejects a write.
  - `stale_cache` no longer marks the stale value with `_stale: true`.

### Packaging and development

- **The package is built before packing** (`prepack`), and the tarball includes `CHANGELOG.md`.
- **`npm run test:package` checks the installed tarball.** It installs the tarball into an empty project and runs the CLI, the demo, `check`, the custom-agent example, and a strict TypeScript consumer. CI runs it on Node 22 and 24.
- **`npm run typecheck` now covers the tests.**

### Known limitations

- **Final answers are read with keyword rules.** Ambiguous wording leads to `INCONCLUSIVE`, never to a `SAFE_*` verdict, but unusual phrasing can still be misread.
- **Only numbers are checked in answers.** Read correctness covers amounts and other numbers. Text values are not compared with the truth.
- **Malformed responses are detected by JSON type only.**
- **There is no model adapter.** Test your own agent through the library API.

Versions before 0.4.0 were not published as releases; their changes are in the git history.
