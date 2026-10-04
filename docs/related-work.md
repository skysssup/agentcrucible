# Related work

The first five projects below were reviewed while reworking grading in 0.4.0: two agent benchmarks, an evaluation framework, a network fault injector, and a distributed-systems tester. The rest were reviewed for 0.5.0's multi-step scenarios, typed answer checks, extensions, replay, and baselines. The comparison is about design choices that carry over to AgentCrucible, not about which tool is better. AgentCrucible is much smaller than any of them. It is an offline harness with mock worlds and scripted fixtures, and it calls no model.

Sources were read in October 2026.

## τ-bench / τ²-bench (Sierra)

**What it is:** a benchmark for customer-service agents that talk to a simulated user (an LLM) and call domain tools: airline, retail, telecom, and banking.

**Sources:**
- [Repository](https://github.com/sierra-research/tau2-bench)
- [Evaluator](https://github.com/sierra-research/tau2-bench/blob/main/src/tau2/evaluator/evaluator.py)
- [Communicate check](https://github.com/sierra-research/tau2-bench/blob/main/src/tau2/evaluator/evaluator_communicate.py)
- [pass^k](https://github.com/sierra-research/tau2-bench/blob/main/src/tau2/metrics/agent_metrics.py)
- [v1.0.1 release notes](https://github.com/sierra-research/tau2-bench/releases)

**How it grades:**
- The final database state is compared with the expected state.
- Information the agent must communicate is checked by case-insensitive substring match over assistant messages (commas removed).
- Expected actions are compared with the actual calls.
- Each task chooses which of these count, through its `reward_basis`.
- Consistency is reported as pass^k: C(successes, k) / C(trials, k).

**Lessons:**
- **Grade the end state, not the transcript.** Adopted. `expect.effects` is compared with committed world records.
- **Check required facts in the answer.** Adopted in a narrower form. `expect.answer.amount_cents` normalizes money formats (`$100.00`, `100 USD`, `10000` cents) rather than matching a substring.
- **Handle missing criteria explicitly.** τ²'s communicate check returns reward 1.0 when a task lists no information to communicate. That is reasonable in a curated benchmark where every task is reviewed. AgentCrucible's scenarios are user-written, so it takes the opposite default: no expectations means `INCONCLUSIVE`, never success.
- **Report consistency across trials.** AgentCrucible's run verdict is the worst trial, the strict case of pass^k with k equal to the number of trials. It reports per-verdict counts and a lower bound on the critical rate rather than pass^k.
- **Say when scores stop being comparable.** τ-bench 1.0.1's release notes open by warning that one domain's scores are not comparable across the release. AgentCrucible's 0.4.0 changelog does the same for the `SAFE_SUCCESS` change.

**Not adopted:** the simulated user and model-graded checks, because AgentCrucible stays offline and deterministic.

## AgentDojo (ETH Zurich SPY Lab)

**What it is:** an environment for evaluating prompt-injection attacks and defenses for tool-using agents.

**Sources:**
- [Repository](https://github.com/ethz-spylab/agentdojo)
- [Task suites and tasks](https://agentdojo.spylab.ai/concepts/task_suite_and_tasks/)

**How it grades:** each user task implements `utility(model_output, pre_environment, post_environment)`. Tasks whose effects leave no trace in the environment implement `utility_from_traces(...)` over the function calls instead. Injection tasks have an equivalent `security` check. A `check_suites` script runs each task's ground-truth calls to confirm the checks can be satisfied.

**Lessons:**
- **Check before and after state together with the output.** Adopted as `expect.effects` (state) plus `expect.answer` (output).
- **Use the trace when state is not enough.** Adopted. Effects are attributed to calls through per-call snapshots, and policy rules read the call log, for example to spot a retry that was deduplicated.
- **Verify the benchmark itself.** Adopted as `agentcrucible check`. It runs each scenario's `expected_verdicts` and fails if a declared fault never fired, which catches scenarios that test nothing.
- **Code or declarations.** AgentDojo checks are Python code. AgentCrucible keeps scenario expectations declarative (YAML) so they can be validated. Arbitrary checks remain possible through `gradeTrial` in the library.

## Inspect (UK AI Security Institute)

**What it is:** a general framework for LLM evaluations: tasks, solvers, scorers, metrics, logs, and a log viewer.

**Sources:**
- [Scorers](https://inspect.aisi.org.uk/scorers.html)
- [Scoring policy](https://inspect.aisi.org.uk/scoring-policy.html)

**How it grades:** it keeps three outcomes apart:
- **Scored results** (`CORRECT`/`INCORRECT`).
- **Unscored results** (`Score.unscored()` when a scorer cannot reach a verdict). These are excluded from metrics but counted.
- **Errors** (`sample.error`) when the run machinery fails. Errors have their own retry and failure-threshold settings.

**Lessons:**
- **"Could not decide" is not "wrong" and not "right".** Adopted as `INCONCLUSIVE`, which also dominates `SAFE_*` when trials are aggregated.
- **Machinery failures are not verdicts.** Adopted. An exception from the agent stops the run with exit status 1 and names the agent, trial, and scenario. Bad input is a usage error, never a verdict.
- **Report coverage alongside scores.** Adopted as `trialsWithFault`, the run warnings, and the fault check in `check`.

**Not adopted:** a log viewer. AgentCrucible writes static JSON, HTML, and JUnit files.

## Toxiproxy (Shopify)

**What it is:** a TCP proxy that injects network conditions (latency, timeouts, connection resets, bandwidth limits) into tests and CI.

**Sources:**
- [Repository and README](https://github.com/Shopify/toxiproxy), including the Toxics and Toxic fields sections.

**How it injects faults:** each toxic has a `stream`. `upstream` affects client-to-server data, and `downstream` affects server-to-client data, so requests and responses can be broken separately. Each toxic also has a `toxicity`, the probability that it applies.

**Lessons:**
- **The direction of a fault matters.** In AgentCrucible the equivalent is whether a fault fires before the call runs (nothing commits, even when the agent sees a success response), after (the change commits and the response is lost or altered), or around a call delivered twice. [scenarios.md](scenarios.md) states this for every fault kind, and `test/faults.test.ts` asserts it against world state.
- **Probability is not reproducibility.** Toxiproxy's `toxicity` is a chance per connection. AgentCrucible's `probability` is a chance per call, resolved from the seed so a failure can be reproduced exactly. 0.4.0 also fixes a hashing flaw that made small `on_call_range` picks ignore most of the seed.
- **Release practice.** Toxiproxy publishes binaries for each platform as release assets, with a changelog. AgentCrucible attaches the tested npm tarball to its release.

**Not adopted:** real network proxying. AgentCrucible's tools are in-memory mocks.

## Jepsen

**What it is:** a framework for testing distributed databases under faults, by recording operation histories and checking them against consistency models.

**Sources:**
- [Client tutorial](https://github.com/jepsen-io/jepsen/blob/main/doc/tutorial/03-client.md)
- [Checker priorities](https://github.com/jepsen-io/jepsen/blob/main/jepsen/src/jepsen/checker.clj) (`valid-priorities`)

**How it records outcomes:** each operation completes as `:ok`, `:fail` ("didn't take place"), or `:info` ("we're not sure"). A crashed client produces `:info`. When several checkers are combined, `false` outranks `:unknown`, which outranks `true`.

**Lessons:**
- **A timeout is indeterminate.** The write may or may not have happened. That is exactly `timeout_after_commit`. AgentCrucible grades how the agent handles it:
  - Claiming success it could not see is a violation.
  - Reporting uncertainty while the change committed is `DEGRADED`.
  - Confirming the change through a deduplicated retry or a read-back is `SAFE_SUCCESS`.
- **Unknown sits between failure and success.** The verdict order follows the same priority. Violations outrank `INCONCLUSIVE`, which outranks `SAFE_*`, and a run takes its worst trial.

**Not adopted:** history checking against consistency models. AgentCrucible compares the end state with declared expectations and attributes each change to its calls, which is enough for single-agent tasks.

## Model Context Protocol tools (0.5.0)

**What it is:** the protocol many agents use to discover and call tools.

**Sources:** [Tools, specification 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)

**What it specifies:** a tool has an `inputSchema` and an optional `outputSchema`, both JSON Schema. When an output schema is present, "servers MUST provide structured results that conform to this schema" and "clients SHOULD validate structured results against this schema". Unknown tools and invalid arguments are protocol errors; failures inside a tool are reported in the result with `isError: true`. Servers must validate all tool inputs.

**Lessons:**
- **Describe tools with JSON Schema, in the same shape.** Adopted. Every built-in tool has `inputSchema` and `outputSchema`, and `ctx.tools` passes them to the agent unchanged, so a model-backed agent can hand them to a model's tool-calling API.
- **Validate inputs at the boundary.** Adopted. Arguments that violate the input schema are rejected with `EARGS` before the world runs, separately from failures inside the world (`EWORLD`), much as MCP separates protocol errors from tool errors.
- **Validate what the agent receives.** Adopted. Every observed result is checked against the tool's output schema. A violation is recorded with JSON paths, and a success claim based on a malformed response is unverified. A world whose own result violates its schema stops the run, since grading against it would mislead.

**Not adopted:** the full JSON Schema vocabulary. AgentCrucible implements a subset and rejects any other keyword, so a schema never looks stricter than the check that runs.

## Temporal: sagas and replay (0.5.0)

**What it is:** a durable workflow engine.

**Sources:**
- [Saga pattern](https://docs.temporal.io/design-patterns/saga-pattern)
- [Worker.runReplayHistory](https://typescript.temporal.io/api/classes/worker.Worker)
- [Replay testing](https://docs.temporal.io/develop/safe-deployments)

**What it does:** a saga registers a compensation for each step before running the step, and on failure runs the compensations in reverse order. Compensations "must be idempotent and able to handle cases where the forward Activity never executed", because a lost response leaves it unknown whether the step happened. Replay testing feeds recorded event histories to current workflow code; an incompatible change raises a `DeterminismViolationError`.

**Lessons:**
- **Grade the recovery, not only the end state.** Adopted. Invariants are checked after every call, so a duplicate refund that a later `void_refund` repairs is `DEGRADED`, distinct from a duplicate that remains (`HARMFUL_ACTION`) and from never creating one (`SAFE_SUCCESS`). `workflows/refund-notify-resolve` grades exactly this case.
- **A recovery path is an outcome.** Adopted. Scenarios declare alternative outcomes, and a declared recovery path is `SAFE_FAILURE` when the answer reports it.
- **Replay recorded histories to detect nondeterminism and drift.** Adopted. `replay` re-executes a report's tool calls against fresh worlds and reports the first call that diverges; a matching trial is graded again to show grading drift.

## Hypothesis stateful testing (0.5.0)

**What it is:** property-based testing for Python; its stateful mode generates sequences of operations.

**Sources:** [Stateful tests](https://hypothesis.readthedocs.io/en/latest/stateful.html)

**What it does:** "Often there are invariants that you want to ensure are met after every step in a process." An `@invariant()` runs after every rule, rather than as a rule that might run zero or several times. A failure prints the short sequence of steps that reproduces it.

**Lessons:**
- **Check invariants after every step.** Adopted. Scenario invariants run on the state before the first call and after every call.
- **Say which step broke it.** Adopted. An invariant finding names the call after which it failed and, if it was repaired, the call after which it held again.

**Not adopted:** generating call sequences and shrinking them. The agent chooses the calls; AgentCrucible schedules the faults.

## Playwright Trace Viewer (0.5.0)

**What it is:** the viewer for traces recorded by Playwright browser tests.

**Sources:** [Trace viewer](https://playwright.dev/docs/trace-viewer)

**What it does:** traces are saved after a run (for example on CI) and opened later. The viewer lists actions with before and after snapshots, highlights errors on the timeline, and "loads the trace entirely in your browser and does not transmit any data externally".

**Lessons:**
- **Save everything needed to inspect a failure after the fact.** Adopted. The JSON report holds every call with its arguments, observed and committed results, schema errors, and the state change it made; `inspect` prints any trial or call from it.
- **A self-contained, offline viewer.** Adopted. The HTML report is one file with no external resources; it shows each call's state change, and every finding links to the calls it cites.

## VCR.py (0.5.0)

**What it is:** a Python library that records HTTP interactions to cassettes and replays them in tests.

**Sources:** [Usage and record modes](https://vcrpy.readthedocs.io/en/latest/usage.html)

**What it does:** in the `none` record mode it replays recorded interactions and raises an error for any new request, which "guarantees that no new HTTP requests will be made".

**Lessons:**
- **Replay strictly.** Adopted. `replay` issues exactly the recorded calls in the recorded order and treats any difference as a divergence; it never falls back to running the agent.

## Jest snapshot testing (0.5.0)

**What it is:** Jest's comparison of rendered output with a committed reference.

**Sources:** [Snapshot testing](https://jestjs.io/docs/snapshot-testing)

**What it does:** snapshot files are committed and reviewed with the code. They are regenerated only on request (`--updateSnapshot`), and the guidance warns against regenerating to make failures pass instead of examining them. Snapshots must be deterministic.

**Lessons:**
- **Commit the baseline and update it deliberately.** Adopted. A baseline is written only with `--save-baseline`, never by a failing run.
- **Keep it reviewable.** Adopted. Baselines hold verdicts and deciding rules, sorted, with no timestamps, so changes diff cleanly in review.
- **Compare like with like.** Adopted. An entry recorded with a different seed or trial count is reported as not comparable instead of compared.

## promptfoo assertions (0.5.0)

**What it is:** an LLM evaluation tool with typed assertions on model output.

**Sources:** [Assertions and metrics](https://www.promptfoo.dev/docs/configuration/expected-outputs/)

**What it does:** deterministic assertion types such as `equals`, `contains`, `icontains`, `regex`, and `is-json` (with optional JSON Schema validation), each negatable with `not-`.

**Lessons:**
- **Typed, declarative checks on the answer.** Adopted. `expect.answer` has `amount`, `id`, `text` (`contains`, `not_contains`, `matches`), `boolean`, and `output` (with a JSON Schema).
- **Tie expected values to the run.** Adopted with a difference: expected values can come from the committed state (`id_of`, `exists`, `field`), so a check stays correct whichever outcome the run took and whatever ids the world generated.
- **Do not pass what cannot be read.** A deliberate difference from a plain substring check: wording that can be read either way is `ambiguous` and the trial is `INCONCLUSIVE`, never a pass.

## Toxiproxy custom toxics (0.5.0)

**Sources:** [Creating custom toxics](https://github.com/Shopify/toxiproxy/blob/main/CREATING_TOXICS.md)

**What it does:** custom toxics implement one interface and are registered by name; their configuration is JSON fields. Using them requires compiling a custom server binary.

**Lessons:**
- **Register faults by name, with typed configuration.** Adopted. An extension module's `faults` are registered by name, and each declares a JSON Schema for its `params`, which scenarios are checked against when they load.
- **Do not require a rebuild.** Extensions are loaded at run time from the config file.

