# Command reference

```text
agentcrucible init
agentcrucible demo       [--scenario <id>] [--out <dir>]
agentcrucible list       [--tag <tag>] [--json | --ids | --tags]
agentcrucible validate   [<file or directory>] [--json]
agentcrucible run        [--scenario <id> | --tag <tag>] [--agent <id|path|provider:model> | --agents a,b,./agent.mjs] [--trials <n>] [--seed <text>]
                         [--fuzz-call <a-b>] [--timeout <ms>] [--concurrency <n>] [--out <dir>] [--json] [--fail-on <verdict>]
                         [--save-baseline <file>] [--baseline <file>] [--github] [model options]
agentcrucible compare    --scenario <id> [--agents a,b,./agent.mjs] [--trials <n>] [--seed <text>] [--timeout <ms>] [--concurrency <n>]
                         [--json] [--fail-on <verdict>] [model options]
agentcrucible check      [--scenario <id> | --tag <tag>] [--trials <n>] [--timeout <ms>] [--concurrency <n>] [--json] [--github] [model options]
agentcrucible sweep      --scenario <id> [--agent <id|path|provider:model>] [--kinds a,b] [--steps <n>] [--trials <n>] [--seed <text>]
                         [--timeout <ms>] [--concurrency <n>] [--out <dir>] [--json] [--fail-on <verdict>] [--github] [model options]
agentcrucible coverage   [--tag <tag>] [--json]
agentcrucible inspect    <report.json> [--trial <n>] [--call <id>] [--scenario <id>]
agentcrucible replay     <report.json> [--scenario <id>] [--json]
agentcrucible mcp        --scenario <id> [--seed <text>] [--out <dir>] [--agent-id <name>]
agentcrucible ui         [--port <n>] [--host <addr>] [--out <dir>] [--baseline <file>] [--agents a,b] [--fail-on <verdict>] [model options]
agentcrucible agents | faults  [--json | --ids]
agentcrucible worlds     [--json]
agentcrucible schema
agentcrucible completion bash | zsh | fish
agentcrucible config | examples | version | help
```

Model options are `--record <dir>`, `--system <file>`, and `--max-steps <n>`; they apply to agents named `provider:model` ([model-agents.md](model-agents.md)). Every command except `init`, `inspect`, `completion`, `examples`, `version`, and `help` also accepts `--config <path>`. Unknown options, missing values, and invalid numbers are errors, not silent defaults.

## Commands

| Command | What it does |
|---|---|
| `init` | Writes `agentcrucible.config.json`, `scenarios/refund-lost-response.yaml`, and `agents/my-agent.mjs` into the current directory. Existing files are left alone, and no config file is written when one exists. |
| `demo` | Runs the scenario's expected agents side by side (default `payments/timeout-after-commit`) and explains each verdict. Exits 2 if a verdict differs from `expected_verdicts`. Writes nothing unless `--out` is given. |
| `list` | Lists scenario ids, worlds, tags, and the first sentence of each description. `--json` prints each scenario's id, worlds, tags, description, task, faults, expected verdicts, and source file. |
| `validate` | Parses scenario files without running them and reports every file with an error and every duplicate id. Without a path, it checks the bundled and configured scenario directories. |
| `run` | Runs one agent, or every agent of `--agents`, against the selected scenarios and writes reports. |
| `compare` | Runs several agents on one scenario with the same seed, so the same faults fire at the same calls. |
| `check` | Runs each scenario's `expected_verdicts` agents, 5 trials by default, and fails if a verdict differs or a declared fault never fired. Run it after editing scenarios. |
| `sweep` | Runs the agent once without faults to learn its path, then injects every fault kind at every call of that path, one fault per run, and prints the kind-by-step table with a resilience score; see [sweeps.md](sweeps.md). |
| `coverage` | Shows which tools, fault kinds, and agents the scenario set covers, and what nothing covers; see [sweeps.md](sweeps.md). |
| `inspect` | Prints a saved trial call by call, or one call in full with `--call`. |
| `replay` | Re-executes a saved report's tool calls against fresh worlds, without the agent, and confirms every call, state, and verdict. |
| `mcp` | Serves one trial of a scenario to an MCP client over stdio and grades the answer it submits; see [mcp.md](mcp.md). |
| `ui` | Serves the local web UI; see [ui.md](ui.md). |
| `agents`, `worlds`, `faults` | List what scenarios can name, including extensions. `--json` prints the same as data: each agent's description and source, each world's tools with their JSON Schemas and record fields, and each fault kind's stage, description, and params schema. `--ids` prints one name per line, for scripts and shell completion. |
| `schema` | Prints the JSON Schema for scenario files, with the registry's worlds, fault kinds, record kinds, tools, and agents as enums; with `--config`, extension worlds and faults are included. The schema for the built-in registry ships as `schema/scenario.schema.json` and at `https://raw.githubusercontent.com/skysssup/agentcrucible/main/schema/scenario.schema.json`. |
| `completion` | Prints a completion script for bash, zsh, or fish, generated from the command table. The scripts complete commands, options, scenario ids (`list --ids`), tags, agent ids, fault kinds, verdicts, and files. |
| `config` | Prints the config file in use. |

## Selecting scenarios

`--scenario` takes an exact id. Otherwise it matches whole leading or trailing path segments: `payments` matches every `payments/*` scenario, and `rate-limit` matches every `*/rate-limit`. It never matches a substring of a segment. `--tag` selects every scenario with that tag. `run` needs one of them, or `defaultTag` in the config file; `list` and `check` without them cover every scenario.

## run options

| Option | Default | |
|---|---|---|
| `--agent <id\|path\|provider:model>` | config `agent`, or `naive-retry` | A registered agent, a module whose default export is your agent, or a model: `openai:gpt-4o-mini`, `anthropic:claude-sonnet-4-5`, `ollama:llama3.2` ([model-agents.md](model-agents.md)) |
| `--agents a,b,./x.mjs` | | Several agents. Every selected scenario runs against each; reports go to `<out>/<agent>/`, and the terminal shows a scenario-by-agent table. Not combined with `--agent`. |
| `--trials <n>` | config `trials`, or 1 | 1 to 10000. The aggregate verdict is the worst trial's. |
| `--seed <text>` | config `seed`, or `seed-<scenario id>` | Every fault decision is a function of the seed, the trial index, the tool, and the call number |
| `--fuzz-call <a-b>` | | Replaces every fault's schedule with one seeded call index in a..b per trial |
| `--timeout <ms>` | config `timeoutMs`, or none | A trial that takes longer fails the run with an error (exit 1) naming the agent, trial, and scenario. At the limit the agent's `ctx.signal` aborts and any further tool call is refused with `ECLOSED`. |
| `--concurrency <n>` | config `concurrency`, or 1 | Scenario-and-agent runs in flight at once, 1 to 64. Each run has its own worlds and seed, so the reports, their order, and the exit status are the same at any setting; only a slow agent, such as one that calls a model, finishes sooner. |
| `--out <dir>` | config `out`, or `.agentcrucible/out` | Report directory |
| `--json` | | Print the report as JSON: one object for one scenario and one agent, an array for several |
| `--fail-on <verdict>` | config `failOn`, or `SILENT_FAILURE` | Exit 2 when a verdict is at least this severe |
| `--save-baseline <file>` | | Write the results as a baseline |
| `--baseline <file>` | | Compare with a baseline; exit 2 only for regressions and new failing scenarios |
| `--github` | on under `GITHUB_ACTIONS` | Also print GitHub Actions annotations and append `summary.md` to the job summary ([ci.md](ci.md)) |
| `--record <dir>` | config `record` | Record provider responses of model-backed agents here and replay them on later runs |
| `--system <file>` | config `systemPrompt` | Replace the model agents' system prompt with this file's text |
| `--max-steps <n>` | config `maxSteps`, or 12 | Tool-calling rounds a model agent may take per trial, 1 to 200 |

`run` writes `<id>.report.json`, `<id>.report.html`, and `<id>.junit.xml` per scenario, where `<id>` is the percent-encoded scenario id, plus an `index.html` that links them and a `summary.md` with the same table in Markdown. With `--agents`, each agent's files go into `<out>/<agent>/`. [traces.md](traces.md) describes the files and what reads them.

## In CI

```yaml
- run: npx agentcrucible check
- run: npx agentcrucible run --tag smoke --agents ./agents/my-agent.mjs,cross-checker --concurrency 4 --timeout 60000 --baseline agentcrucible-baseline.json --out reports
- uses: actions/upload-artifact@v7
  if: always()
  with:
    name: agentcrucible-reports
    path: reports/
```

`check` holds the scenarios to their `expected_verdicts`; `run --baseline` exits 2 only for a regression or a new failing scenario. Under GitHub Actions, failing results become annotations on the scenario files and `summary.md` lands on the job summary without any extra step; the JUnit files in `reports/` work with any test reporter. The repository is also a reusable action. [ci.md](ci.md) covers all of it.

## Reproducing runs

```bash
npx agentcrucible compare --scenario payments/retry-storm --trials 6 --seed ci
```

```text
compare payments/retry-storm (seed=ci, trials=6; every agent sees the same fault schedule)
  naive-retry       DEGRADED        Mutating call call_2 (create_refund) committed without an idempotency_key.
  honest-stop       SAFE_FAILURE    Nothing was committed and the answer reports the failure ("I could not confirm whether create_refund succeeded because of a tool error (ETIMEDOUT: request timed out).").
  idempotent-retry  SAFE_SUCCESS    Matches the scenario's expectations: + refund re_1_55 order_id="55" amount_cents=1000 status="succeeded" (idempotency_key="idem-54b34b5").
  cross-checker     SAFE_FAILURE    Nothing was committed and the answer reports the failure ("create_refund failed (ETIMEDOUT: request timed out), and list_refunds shows no matching record.").
  warning: faults[0] (timeout on create_refund) fired in 3 of 6 trials; the others ran without it.
```

Fault schedules are `on_call`, `on_calls`, and `from_call` (exact calls), `on_call_range` (one seeded call per trial), and `probability` (a seeded decision per selected call). The same seed reproduces every trial exactly. Runs share no state, so concurrent runs give the same results as sequential ones.

## Exit status

| Status | When |
|---|---|
| `0` | Every verdict is below the `--fail-on` threshold, or (with `--baseline`) nothing got worse. `check` and `demo`: every expectation held. `replay`: the record reproduced. `validate`: every file is valid. |
| `1` | Usage, config, scenario, extension, report, or agent error, including a trial that exceeds `--timeout`; the message is on stderr. `validate`: a file has an error, or there are no scenario files. |
| `2` | `run`/`compare`/`mcp`: a verdict at or above `--fail-on`. `sweep`: a cell whose fault fired at or above `--fail-on`. `run --baseline`: a regression or a new failing scenario. `check`/`demo`: an expected verdict did not hold or a fault never fired. `replay`: a call or verdict differs from the record. |

With `--json`, stdout holds only JSON.

## Configuration

Settings come from command-line flags first, then a config file, then built-in defaults. The config file is `.agentcrucible.json`, `.agentcrucible.yaml`, `.agentcrucible.yml`, `agentcrucible.config.json`, or `.agentcrucible/config.{json,yaml,yml}` in the current directory. More than one of these is an error; `--config <path>` picks a file explicitly.

```json
{
  "agent": "./agents/my-agent.mjs",
  "trials": 5,
  "seed": "ci",
  "out": "reports",
  "scenarioDirs": ["scenarios"],
  "extensions": ["my-extension.mjs"],
  "defaultTag": "smoke",
  "failOn": "DEGRADED",
  "timeoutMs": 60000,
  "concurrency": 4,
  "record": "cassettes",
  "systemPrompt": "prompts/operator.txt",
  "maxSteps": 12
}
```

| Key | Meaning |
|---|---|
| `agent` | Default agent for `run` and `sweep`: a registered id, a module path, or `provider:model` |
| `trials`, `seed`, `out`, `failOn` | Defaults for the flags of the same name |
| `timeoutMs`, `concurrency` | Defaults for `--timeout` and `--concurrency`; the UI applies them to its runs too |
| `scenarioDirs` | Directories of scenario files, loaded after the bundled ones. The UI editor saves to the first. |
| `extensions` | Modules that export worlds, fault kinds, and agents; see [extending.md](extending.md) |
| `defaultTag` | Tag `run` uses when neither `--scenario` nor `--tag` is given |
| `record`, `systemPrompt`, `maxSteps` | Defaults for `--record`, `--system`, and `--max-steps` of model-backed agents |

Paths are relative to the directory you run the command from. Unknown keys and invalid values are errors that name the file. Extensions and agent modules are ordinary JavaScript that runs with your permissions; load only code you trust.

## Scripted agents

The built-in agents are fixtures: each follows one fixed policy, so they demonstrate and regression-test the grading. Their verdicts describe the policy, not any model.

| Agent | Policy | Built for |
|---|---|---|
| `naive-retry` | Retries a failed write once, without an idempotency key | Write tasks |
| `idempotent-retry` | Retries a failed write once, reusing its key | Write tasks |
| `honest-stop` | One keyed write; on an error it stops and reports uncertainty | Write tasks |
| `liar` | One unkeyed write, then "Successfully refunded the customer…" whatever happened | Write tasks |
| `gullible-reader` | Reads once and reports the value as confirmed; a missing field reads as 0 | Balance questions |
| `cross-checker` | Writes with a key and never retries. When a response is an error, unreadable, or inconsistent with the request, it reads the state back. It answers questions from two sources and only when they agree. | Both |
| `verify-after-write` | Writes with a key, then reads the state back whatever the response said, and reports what the read shows. It never retries. The one agent that catches a success response for a write that never happened; replica lag still fools it. | Write tasks |
| `workflow-naive` | Refund, email, resolve: retries each step without keys, resolves the ticket, and reports success regardless | Workflows |
| `workflow-reconcile` | Retries without keys, then voids duplicate refunds; escalates the ticket when email keeps failing | Workflows |
| `workflow-careful` | Keys every step, reads back unclear results, and escalates instead of resolving when email fails | Workflows |

The single-step write agents use the first mutating tool of the world and take order ids, amounts, and paths from the task text. Order `#4471` and `$84.00` are their defaults. On a balance question they write anyway, and the grader reports `HARMFUL_ACTION`.
