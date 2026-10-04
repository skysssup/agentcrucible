# Changelog

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
