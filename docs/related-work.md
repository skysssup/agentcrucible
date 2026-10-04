# Related work

The five projects below were reviewed while reworking grading in 0.4.0. They are different kinds of tools: two agent benchmarks, an evaluation framework, a network fault injector, and a distributed-systems tester. The comparison is about design choices that carry over to AgentCrucible, not about which tool is better. AgentCrucible is much smaller than any of them. It is an offline harness with mock worlds and scripted fixtures, and it calls no model.

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
- **The direction of a fault matters.** In AgentCrucible the equivalent is whether a fault fires before the call runs (nothing commits) or after (the change commits and the response is lost or altered). [scenarios.md](scenarios.md) states this for every fault kind, and `test/faults.test.ts` asserts it against world state.
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
