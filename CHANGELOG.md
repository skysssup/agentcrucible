# Changelog

## 2.1.0

2.1 turns `agentcrucible ui` into a console with memory. Every run and sweep goes into a history file, so the console can chart reliability over weeks, compare any two runs, say what needs attention, and reopen any old result by regenerating it from its seed. Every page is rebuilt on one design, and `ui --demo` opens a workspace with eight weeks of history to explore before you have your own. Scenario files, reports, baselines, and the library API are unchanged; the CLI gains three `ui` flags.

### The console

- **A command center** with the safe share, results, critical, unexpected, and flaky results, and fault coverage over a chosen period against the period before; verdicts per day with each agent version marked; what needs attention; an agent leaderboard; recommendations drawn from the evidence; recent activity and runs; coverage at a glance; and a setup checklist for a new workspace.
- **Analytics** (filters for agents, worlds, tags, and fault kinds; trends by verdict or agent; fault impact; deciding rules with advice; agent-by-world and agent-by-fault matrices; tables by scenario and version), an **Activity** log of every event grouped by day, **Agent profiles** with the safe share over time and each release marked, the weakest scenarios and fault kinds, and advice, and a head-to-head **Compare** of two agents.
- **Runs** from the whole history with filters and a scenario-by-agent matrix per run; **Compare runs** for regressions, improvements, and split trials between two runs; a **New run** launcher whose run continues on the server as a background job and fills in cell by cell; **Sweeps** with a live heat map; a **Guided demo** that plays the five-agent refund one agent at a time.
- **Reports** with every filter in the address, and a **Report** explorer with a summary of why, what the agent said beside what committed, a call-by-call timeline (`J`, `K`), per-call world state, and the raw JSON.
- **Scenarios** with filters, grouping, and bulk actions; a **Scenario** page with the fault schedule step by step and its result history; an **Editor** that validates as you type, with an outline, snippets, seven templates, drafts started from a coverage gap, and runs and replays of the draft; **Coverage** whose empty cells start a scenario; a **Catalog** of agents, worlds, fault kinds with when they fire, verdicts, and policies.
- **The baseline** beside each entry's latest result, with the CI gate's outcome and exit status for any run.
- **Settings**: a profile that labels your runs and events; preferences for theme, density, sidebar, motion, time format, rows per page, default trials, start page, confirmations, and finish toasts; the workspace's paths, config, and limits; integrations for the GitHub Action, MCP clients, and model providers; session token rotation; and the history's export, import, and clearing.
- **Search** across scenarios, agents, runs, reports, findings, the catalog, and actions (Ctrl+K), with scopes and a preview; a **notification center** for finished jobs, unexpected verdicts, regressions, and failures; keyboard shortcuts for every page (`?` lists them).
- **One design**, ink on warm paper: monochrome chrome, color only for verdicts, faults, and changes, one orange action per region, tabular numerals, light and dark themes, and layouts for desktop, tablet (an icon rail), and phone (a drawer, a tab bar, and tables as cards).

### History and the demo workspace

- **`ui` keeps a history** in `.agentcrucible/ui/workspace.json`: the profile, up to 250 runs, 100 sweeps, and 2000 activity events. **`--state <dir>`** moves it and **`--no-history`** keeps everything in memory. A result from an earlier session opens by running it again from its seed; the report says whether it reproduced the recorded verdict. An unreadable history file is renamed to `workspace.json.bad` and the activity log says so.
- **`ui --demo`** generates `northwind-support` in a temporary directory, with 10 project scenarios, saved reports, a baseline, and eight weeks of history from the real engine: 58 runs, 5 sweeps, and an agent that improves over five releases until a new scenario catches it in a `SILENT_FAILURE`.
- **The UI's API** adds background jobs (`/api/jobs/run`, `/api/jobs/sweep`, `/api/job`), the run history (`/api/runs`, `/api/run`), activity, notifications, the profile, system information, session rotation, history export, import, and clear, and deleting saved reports and the project's own scenario files. The UI and its API may change in a minor release ([stability.md](docs/stability.md)); the new `ui` flags are additive.

### Also

- **The run index** (`index.html` of a run) has a title, a line with the scenarios, agents, reports, trials, and fail threshold, and KPI cells for reports, safe and critical results, and the gate's outcome.
- **`run --json` and `sweep --json` keep stdout parseable under GitHub Actions.** The workflow annotations went to stdout after the JSON, so `agentcrucible run --json > results.json` wrote an invalid file in a workflow; in JSON mode they now go to stderr, where the runner still reads them.
- **The build emits type declarations with `tsc`** (`tsconfig.build.json`), because `tsup --dts` does not work with TypeScript 7.
- The package description and `docs/cli.md` describe the console; `.gitignore` ignores `.agentcrucible/ui/`.

## 2.0.0

2.0 turns AgentCrucible from a harness for scripted agents into a tool that tests the agents people actually ship: a model named on the command line, with its responses recorded for offline replay; any MCP client; and any module as before. It adds fault sweeps and scenario coverage, a published JSON Schema, GitHub Actions output and a reusable action, shell completions, and a redesign of the UI, the HTML report, and the run index. No verdict changed: every bundled scenario gives the same verdicts for the agents that existed in 1.1, and reports, baselines, scenario files, agent modules, and extensions written for 1.x load unchanged. The major version marks the new surface and the new look, not a migration; [docs/stability.md](docs/stability.md) says what 2.x keeps compatible.

### Model-backed agents

- **`--agent openai:<model>`, `anthropic:<model>`, `ollama:<model>`** run a model's tool-calling loop against the trial's tools over the OpenAI chat completions or Anthropic Messages API, with the endpoint from `OPENAI_BASE_URL`, `ANTHROPIC_BASE_URL`, or `OLLAMA_BASE_URL` and the key from `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`. Any OpenAI-compatible service works through `openai:`. `--agents` mixes models and scripted agents in one matrix.
- **`--record <dir>`** (config `record`) stores every provider response by request hash and answers later identical requests from the file, so a recorded scenario replays offline without a key, in CI too. A missing recording without a key is a clear error naming the cassette.
- **`--system <file>`** (config `systemPrompt`) and **`--max-steps <n>`** (config `maxSteps`, default 12) set the prompt and the tool-calling rounds. The built-in prompt says nothing about retries or keys; how the model handles a failed call is what the run measures.
- **Usage in reports.** A trial run by a model records `usage` (requests, input and output tokens, provider latency, replayed requests); text reports and `inspect` print a `Model:` line.
- **`expected_verdicts` may name a model**, which `check` runs like any other agent, so a model's behaviour on a scenario is a regression test.

### Fault sweeps and coverage

- **`agentcrucible sweep --scenario <id> --agent <agent>`** runs the agent once without faults to learn its path, then injects every fault kind at every call of that path, one fault per run, and prints a kind-by-step table with a resilience score (the share of runs that ended `SAFE_SUCCESS` or `SAFE_FAILURE`) and the critical runs with their reasons. `--kinds`, `--steps`, `--trials`, `--seed`, `--concurrency`, `--fail-on`, `--json`, and `--out` (`sweep.json`, `sweep.md`, `sweep.html`, and a report per cell under `cells/`) are supported. A cell whose fault the agent never reached is marked and does not count as safe.
- **`agentcrucible coverage`** maps the scenario set onto worlds, tools, fault kinds, and agents, and lists the gaps: what no scenario covers, and scenarios without expectations, expected verdicts, faults, or tags. Running it on the bundled set found that no scenario injected `retry_storm`; **`payments/service-down`** now does (every `create_refund` fails before it runs; the only safe answer reports the failure).
- The library exports `runSweep`, `summarizeSweep`, `scoreCells`, `formatSweep`, `sweepMarkdown`, `computeCoverage`, and `formatCoverage`.

### MCP server mode

- **`agentcrucible mcp --scenario <id>`** serves one trial to any MCP client over stdio (newline-delimited JSON-RPC): the world's tools with the scenario's faults applied, the task as `instructions` and as a prompt, and `submit_answer`, which ends the trial, grades the answer, and returns the verdict and findings to the client. A disconnect without an answer is graded as such. `--out` writes the report like `run`'s, `--seed` and `--agent-id` name the run, and the exit status follows `--fail-on`.

### Scenario schema, completions, CI

- **`agentcrucible schema`** prints a JSON Schema (draft 2020-12) for scenario files with the registry's worlds, fault kinds, record kinds, tools, and agents as enums; `--config` includes extension worlds and faults. The built-in schema ships as `schema/scenario.schema.json` and is published at `https://raw.githubusercontent.com/skysssup/agentcrucible/main/schema/scenario.schema.json`; `init`'s starter scenario points editors at it, and scenario files may carry a `$schema` key.
- **`agentcrucible completion bash|zsh|fish`** prints a completion script generated from the command table. **`list --ids`**, **`list --tags`**, **`agents --ids`**, and **`faults --ids`** print one name per line for the scripts and for shell pipelines.
- **GitHub Actions output.** Under `GITHUB_ACTIONS`, or with `--github`, `run`, `check`, and `sweep` print workflow annotations (attached to the scenario file when it is in the workspace; regressions as errors and improvements as notices against a baseline) and append their Markdown summary to the job summary.
- **A reusable action.** `uses: skysssup/agentcrucible@v2` runs `run`, `check`, or `sweep` with inputs for the scenario, tag, agents, trials, baseline, threshold, cassette directory, and report directory, and outputs the exit code and report directory.
- **Release workflow.** A `v*` tag builds, verifies, attaches the tarball to a GitHub release with the changelog section as its notes, and publishes to npm when a token is configured. CI also exercises the action and checks that the committed schema is current.

### UI, HTML report, run index

A redesign to a flat, dense design system: neutral surfaces, one accent used for actions and focus, verdict colors that carry meaning and nothing else, Geist and Geist Mono served by the UI server, 11 to 20px type with tabular numerals, no gradients, glows, or animations beyond a spinner. The overview is an operational dashboard (KPI strip, results that need attention, verdict distribution, coverage, recent runs, agent scores) instead of a landing page. New **Sweep** (heat map with a report behind every cell, exports as Markdown, CSV, and the CLI command) and **Coverage** (fault kind by tool, gaps, agents) pages, with `G W` and `G V` shortcuts and palette entries. Scenarios, runs, reports, agents, and the catalog are tables; the run matrix has a compact and a detailed layout. The standalone HTML report and run index share the tokens, and `renderSweepHtml` renders a standalone sweep page. The UI's API adds `POST /api/sweep`, `GET /api/sweeps`, `GET /api/sweep`, `GET /api/sweep/markdown`, and `GET /api/coverage`; `GET /api/meta` lists each fault kind's required params.

### Repository

`CONTRIBUTING.md`, `SECURITY.md`, issue and pull request templates, Dependabot, and an `.editorconfig`.

### Library

New exports: `createModelAgent`, `registerModelAgent`, `parseModelAgentId`, `parseMaxSteps`, `requestKey`, `cassettePath`, `MODEL_PROVIDERS`, `DEFAULT_SYSTEM_PROMPT`, `DEFAULT_MAX_STEPS`, `MAX_MODEL_STEPS`, `describeUsage`, `serveMcp`, `MCP_PROTOCOL_VERSION`, `SUBMIT_TOOL`, `scenarioJsonSchema`, `SCENARIO_SCHEMA_URL`, `githubAnnotations`, `githubStepSummary`, `completionScript`, `COMPLETION_SHELLS`, and the sweep and coverage functions above, with their types. `AgentAnswer` and `TrialTrace` gain the optional `usage`; `CrucibleConfig` gains `record`, `systemPrompt`, and `maxSteps`.

## 1.1.0

1.1 adds four fault kinds that attack the strategies 1.0's agents relied on, an agent that survives one of them, per-trial time limits and parallel runs for model-backed agents, scenario-by-agent runs from the CLI, a Markdown run summary for CI, machine-readable listings, and a redesign of `agentcrucible ui` and the HTML report. No verdict changed: every bundled scenario gives the same verdicts for the agents that existed in 1.0.0, and reports and baselines written by 1.0.0 load, replay, and compare unchanged.

### Fault kinds

- **`phantom_success`** (before the call runs): the agent receives a well-formed success response and nothing happens, as when a request is acknowledged and then lost. The response is built from the tool's output schema and the call's arguments, so it passes any check an agent can make on it; `params.result` gives an exact response instead. Only reading the state back tells it from a real success.
- **`replica_lag`** (after): a list response comes back empty, as from a replica that has not caught up. It is the fault that defeats a read-back: an agent that trusts the empty read reports a committed write as not done.
- **`partial_response`** (after): the response loses `id` and every `*_id` field, or `params.fields`, from the object or from each item of a list. It parses, so only an agent that checks the fields it relies on notices.
- **`duplicate_delivery`**, with the new stage **`twice`**: the call reaches the service twice, as when a proxy retries on its own, and the agent sees the first response. A call with an idempotency key is deduplicated the second time; one without a key commits twice, and `expect.duplicate_effect` fires although `policy.forbidBlindRetry`, which counts calls, does not.

Extensions can use the `twice` stage, and every fault's `apply` now receives the tool's `outputSchema`. The library exports `sampleValue(schema, hints)`, which builds a value that satisfies a schema from its constants, enums, and types.

### Agents and scenarios

- **`verify-after-write`** makes one keyed write, reads the state back whatever the response said, and reports what the read shows. It is the one scripted agent that catches `phantom_success`; `replica_lag` still fools it, which grades `DEGRADED` because it says so.
- **Five bundled scenarios:** `payments/phantom-success`, `payments/replica-lag`, `payments/partial-response`, `payments/duplicate-delivery`, and `email/phantom-send`, with `expected_verdicts` that `check` verifies (95 checks over 23 scenarios and 10 agents). [docs/examples.md](docs/examples.md) walks through the phantom success and the duplicate delivery.

### Running

- **`--timeout <ms>`** (config `timeoutMs`) on `run`, `compare`, and `check`: a trial that takes longer fails the run with an error naming the agent, trial, and scenario, instead of hanging it. At the limit the agent's new `ctx.signal` aborts, so a model loop can cancel its requests, and any further tool call is refused with `ECLOSED`.
- **`--concurrency <n>`** (config `concurrency`) on `run`, `compare`, and `check`: that many scenario-and-agent runs in flight at once, up to 64. Each run has its own worlds and seed, so the reports, their order, and the exit status do not change; a slow agent finishes sooner. The UI applies both settings from the config file to its runs.
- **`run --agents a,b,./x.mjs`** runs every selected scenario against every listed agent, writes each agent's reports to `<out>/<agent>/`, and prints a scenario-by-agent table. One agent keeps the 1.0 layout. Baselines already keyed entries by scenario and agent, so `--save-baseline` and `--baseline` cover the whole matrix.
- **`summary.md`** is written next to `index.html` on every `run`: the run's table in Markdown, the failing results with their reasons, and the baseline changes, with no timestamps. `cat reports/summary.md >> "$GITHUB_STEP_SUMMARY"` puts it on a GitHub Actions job page.
- **`--json`** on `list`, `agents`, `worlds`, and `faults` prints the same information as data, including each tool's JSON Schemas and each fault kind's params schema.
- `ctx.scenarioId` and `ctx.trialIndex` tell an agent which scenario and trial it is in.

### Library

New exports: `runMatrix` (scenarios × agents, or a function giving each scenario its agents, with `concurrency`, `timeoutMs`, and an `onReport` callback, in a fixed order), `renderRunSummary` and `writeRunSummary`, `sampleValue`, `parseTimeout`, `parseConcurrency`, `MAX_CONCURRENCY`, `FAULT_STAGES`, and the types `MatrixOptions`, `SummaryOptions`, and `FaultStage`. `runScenario` accepts `timeoutMs`. `AgentContext` gains `scenarioId`, `trialIndex`, and `signal` (the harness always provides them, so a context stubbed by hand in a TypeScript test needs the three new fields); `FaultInput` gains `outputSchema`; `FaultDefinition.stage` accepts `"twice"`. An extension that switches on a fault's stage should treat `twice` like `after` for the first delivery.

### UI

- **Layout.** A sidebar replaces the top bar, with the project directory and a light, dark, or system theme switch; a forced theme is applied before the page paints. ⌘K (Ctrl+K) opens a command palette over pages, scenarios, recent runs, and actions. Saving, comparing, and replacing files report in toasts and ask in dialogs instead of browser alerts. The layout works down to phone widths.
- **Guided demo.** A new page runs the five agents of `payments/timeout-after-commit` with the seed `demo`, as `agentcrucible demo` does, and shows each agent's calls, final answer, and verdict side by side, then what each verdict means. The overview links to it.
- **Report timelines render in the page** instead of a frame, with the same markup as the HTML report, so call ids in findings jump to the call and open it. The HTML button opens the standalone report. The page's content security policy now also forbids frames.
- **Run matrix.** Each agent column and scenario row shows its mix of verdicts and how many results matched `expected_verdicts`. With several trials, a cell shows how its trials' verdicts split and marks the result flaky when they disagree, and the matrix can show only the unexpected or the flaky results. A run that takes more than a moment shows a toast with a running clock, and toasts after saving link to what was saved.
- **Runs survive a reload.** The server keeps the last 50 runs, and `GET /api/runs` lists them; each run on the Runs page shows its mix of verdicts and whether every result matched `expected_verdicts`.
- **Editor:** line numbers, YAML highlighting, the line of a parse error marked, Tab and Shift+Tab indentation, Enter that keeps the indentation, and the cursor position.
- Scenarios are grouped by folder, with world and tag filters and a run panel beside the list; the scenario page shows the source with line numbers. The Reports page can select every report shown. The catalog labels each fault kind's stage, including a call that runs twice.

### HTML report and run index

- The report opens with why it got its verdict and the deciding rule, next to the task, faults, budget, and expectations, then the commands that reproduce it. Trials list their statistics, calls are cards on a timeline marked by whether they committed, failed, or had a fault, calls a finding cites are labeled `evidence`, and JSON is highlighted. The run index shows the mix of verdicts as a bar.

### Compatibility

Everything in [docs/stability.md](docs/stability.md) holds. Scenario files, reports, baselines, verdicts, rule ids, and the CLI's existing commands, options, and exit statuses are unchanged; the additions are new fault kinds, a new agent, new scenario ids, new options, new config keys, new fields on the agent context and fault input, and new library exports. `run` now also writes `summary.md` into the output directory.

## 1.0.0

1.0 adds a local web UI, a project starter, and scenario validation, makes every saved trace replay, and removes the two 0.x scenario forms that had newer replacements. From this release on, AgentCrucible follows semantic versioning; [docs/stability.md](docs/stability.md) lists what 1.x keeps compatible. Every bundled scenario gives the same verdicts for the bundled agents as in 0.5.0, and reports and baselines written by 0.5.0 load, replay, and compare unchanged.

### New

- **`agentcrucible ui`** serves a local web app on 127.0.0.1 for the project in the current directory: an overview; a searchable scenario list with tag and world filters; scenario details; runs of any scenarios against any agents, shown as a matrix that marks each result that differs from `expected_verdicts`; a library of saved and unsaved reports; each report's timeline with replay, download, and save; baseline comparison and saving; a scenario editor that validates as you type, runs drafts, and saves them to the first `scenarioDirs` entry; and a catalog of agents, worlds, tools, record fields, and fault kinds. It loads nothing from the network. API requests need the session token from the page, Host headers that name another site are refused, and report pages render in a sandboxed frame. See [docs/ui.md](docs/ui.md).
- **`agentcrucible init`** writes a config file, a starter scenario, and a starter agent module that pass `validate`, `run`, and `check` as written. It leaves existing files alone.
- **`agentcrucible validate [path]`** checks scenario files without running them and reports every file with an error and every duplicate id, with `--json` for editors and CI. Without a path it checks the bundled and configured scenario directories.
- **Run index.** `run` writes an `index.html` that links every report page of the run with its verdict, deciding rule, and reason; with `--baseline`, each row is labeled as a regression, new failure, improvement, rule change, new entry, or unchanged. `demo --out` writes one too. The library exports `writeRunIndex`.
- **HTML timeline.** The header gives the commands that reproduce the run (`run` with the same seed and trial count, and `replay` of the JSON report) with copy buttons. A search box (focus it with `/`) filters calls by tool, arguments, or responses, each call can show the whole world state after it, and the page follows the system's light or dark setting.
- **Documentation:** [docs/cli.md](docs/cli.md) (every command, option, exit status, and config key), [docs/ui.md](docs/ui.md), and [docs/stability.md](docs/stability.md). The README is shorter and links to them.

### Fixed

- **Every saved trace replays.** Tool arguments and results now make a JSON round trip, as they would over a real tool protocol, so the recorded call is exactly what the world received. Before, a trace whose arguments held `undefined`, `NaN`, or similar values could fail to replay. Arguments that are not a JSON object are recorded with `argsError` and replay the same way. A new seeded fuzz test, which runs random agents against every bundled scenario and checks evidence, verdicts, reports, replay, and baselines, found this.
- A yes/no answer check no longer reads an email address or URL that contains the keyword as a statement: "Refund sent to email@example.com." says nothing about "email".
- An answer that only starts with `{` or `[` is no longer read as broken structured output; only an answer that is entirely one JSON object or array counts.
- Loading the same agent module twice, for example from the config file and from `--agents`, reuses it instead of failing.

### Compatibility

| 0.5.0 | 1.0.0 |
|---|---|
| `expected_naive_verdict: X` | `expected_verdicts: { naive-retry: X }`. The old key is an error that gives the new form. |
| `expect.answer: { amount_cents: N }` | `expect.answer: [{ type: amount, cents: N }]`. The old form is an error that gives the new form. |
| Tool arguments were copied as they were | They pass through JSON: `undefined` and functions are dropped, `NaN` and `Infinity` become `null`, and a `Date` becomes its ISO string |
| A world result or fault observation that JSON cannot carry was copied | It is converted as `JSON.stringify` would; one that cannot be converted at all stops the run with an error naming the tool or fault |

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
