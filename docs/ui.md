# The local UI

`agentcrucible ui` serves a web app for the project in the current directory. It does what the CLI does, on one page per task: browse scenarios, run them against several agents at once, sweep one agent with every fault kind at every step, see what the scenarios cover, read each report's timeline, replay and save reports, compare a run with the baseline, and write new scenarios with live validation. It runs offline, loads nothing from the network, and stops with Ctrl+C.

```bash
npx agentcrucible ui
```

```text
AgentCrucible 2.0.0 UI: http://127.0.0.1:7357/
  scenarios: bundled, scenarios (the editor saves to scenarios)
  reports:   .agentcrucible/out
  baseline:  agentcrucible-baseline.json
Press Ctrl+C to stop.
```

Open the printed address in a browser. The UI reads the same config file as the CLI: the scenario directories, extensions, the agent module in `agent`, the report directory in `out`, `failOn`, and the `timeoutMs` and `concurrency` limits for its runs.

![The overview: project counts, the results that need attention, the verdict distribution, recent runs, agents, and coverage](images/ui-overview.png)

## Pages

The sidebar lists the pages, and the bar above each page shows where you are, opens search, and starts a new run. ⌘K (Ctrl+K elsewhere) opens a command palette that jumps to any page, scenario, agent, or recent run, re-runs the latest run, and runs the guided demo. The switch at the bottom of the sidebar follows the system's light or dark setting or forces one; [Keyboard shortcuts](#keyboard-shortcuts) lists the rest.

- **Overview:** the project's name, directory, and version, then six counts: scenarios, agents, worlds, fault kinds, saved reports, and whether a baseline exists with how many entries. Below them, **Needs attention** lists the results from this session and the saved reports whose verdict differs from the scenario's `expected_verdicts` or is `HARMFUL_ACTION` or `SILENT_FAILURE`, differences first; **Recent runs** lists this session's runs with their mix of verdicts; **Verdict distribution** counts every result by verdict and gives the share that ended safe; **Agents** gives each agent's results, safe share, most severe verdict, and mix; **Coverage** summarizes the Coverage page. The buttons above run the guided demo, start a new run, and open the editor.
- **Guided demo:** runs the five agents that `payments/timeout-after-commit` lists in `expected_verdicts`, the same refund whose first `create_refund` commits and then times out, and shows each agent's calls, final answer, and verdict in one table, with what each verdict means. It is the `agentcrucible demo` command as a page.
- **Scenarios:** a table of every scenario, grouped by folder, with its first fault, checks, and expected verdicts. Search with `/`, filter by world or tag, and select scenarios to run from the panel beside the list. A link from the Coverage page narrows the list to the scenarios it names, and the chip above the table clears that. Without agents chosen, each scenario runs the agents in its `expected_verdicts`.
- **Scenario:** one scenario in full: task, faults, every expectation, budget, setup, policies, the expected verdicts, the results it has in this session and the saved reports, and the source file with line numbers. Run it from here, copy the command that runs it, sweep it, or open it in the editor.
- **Runs:** the runs of this server session, newest first, each with its mix of verdicts and whether every result matched `expected_verdicts`. A run opens as a scenario-by-agent matrix: a check mark means the verdict matches the scenario's `expected_verdicts`, and a cross names the expected verdict. Each column and row says how many of its results matched. With several trials, a cell shows how its trials' verdicts split and marks the result flaky when they disagree, and the matrix can show only the unexpected or the flaky results, with each reason on one line or on up to three. Click a cell for its report. From a run you can run it again with the same scenarios, agents, trials, and seed, save its reports, compare it with the baseline, or save it as the new baseline. The matrix copies as a Markdown table, downloads as CSV, and copies as the `agentcrucible run` commands that repeat it from the command line, one per scenario.
- **Reports:** the saved reports under the report directory, newest first, after this session's unsaved runs. Filter by text or verdict, and select reports (or all of them) to compare with the baseline or to make the baseline.
- **Report:** the timeline of one report, the same one the HTML report shows (a cell of a sweep opens here too, and says which sweep it belongs to): why it got its verdict, the task, faults, and expectations, the commands that reproduce it, every trial, and every call with its arguments, what the agent saw, what the world returned, and the state after it. Call ids in findings jump to the call, and Expand calls opens every call of the trial. Replay re-executes the recorded calls and confirms every state and verdict; JSON downloads the report; HTML opens the standalone HTML report; an unsaved run has Save as report.
- **Sweep:** runs `runSweep` from the library, as `agentcrucible sweep` does. Choose a scenario, an agent, the fault kinds (every kind that needs no params is selected), the number of steps (12 by default, at most 64), trials, and a seed, and the server runs the agent once without faults and then once for every fault kind at every step of that path, each time grading with the scenario's own expectations. The result opens as its scenario, agent, seed, and baseline verdict, four counts (runs, ended safe, critical, resilience), and a heat map: one row per fault kind, one column per step labeled `tool#call` with a mark for calls that change state, and in each cell the verdict as a two-letter code (`HA` `SL` `DE` `IN` `SF` `SS`) with the verdict, rule, and reason in its tooltip. A dashed, dimmed cell in parentheses means the agent never reached that call under that fault, so the cell tested nothing. The dot at the end of each row and column is its most severe verdict. Click a cell for its report. Copy as Markdown, Download CSV, and Copy CLI command export the sweep; the last prints the `agentcrucible sweep` command that repeats it. The page keeps the last 20 sweeps.
- **Coverage:** what the scenarios exercise, as `computeCoverage` reports it: counts of scenarios, worlds with a scenario, tools that some scenario faults, fault kinds some scenario injects, agents named in `expected_verdicts`, and gaps; a matrix of fault kinds by tool, with the tools grouped by world and each cell counting the scenarios that inject that kind into that tool (click a count to list those scenarios on the Scenarios page); the gaps, each group listing its items as links; and each agent's scenarios with its expected verdicts as a bar.
- **Agents:** every agent with its results from this session's runs and the saved reports: how many, how they split by verdict, the share that ended `SAFE_SUCCESS` or `SAFE_FAILURE`, and the most severe verdict. A saved report and the session run it came from count once. Click an agent for its reports.
- **Baseline:** the entries of the baseline file and the result of the last comparison: regressions, new failures, improvements, rule changes, and entries that could not be compared because the seed or trial count differs.
- **Editor:** YAML with line numbers and highlighting, checked as you type with the same rules as files on disk; a parse error marks its line. Tab and Shift+Tab indent, and Enter keeps the indentation. Run the draft against any agents (⌘Enter), then save it to the first `scenarioDirs` directory (⌘S) or download it. Two templates, a single-step scenario and a two-world workflow, are a starting point, and a click on a fault kind beside the editor copies its name.
- **Catalog:** every agent, world (with each tool's arguments and whether it changes state), record field, and fault kind, built-in or from an extension.

![The guided demo: five agents handle the same lost response](images/ui-demo.png)

![Three scenarios run against three agents, three trials each](images/ui-run.png)

![A sweep of verify-after-write on a lost refund response: fault kinds by step](images/ui-sweep.png)

![Coverage: fault kinds by tool, gaps, and expected verdicts by agent](images/ui-coverage.png)

![The timeline of a workflow report, at the call that voided a duplicate refund](images/ui-report.png)

![The Agents page: each agent's results by verdict and the share that ended safe](images/ui-agents.png)

## Keyboard shortcuts

`?` shows this list in the UI. Shortcuts other than ⌘K and the editor's do nothing while a text field has the focus.

| Keys | Action |
|---|---|
| ⌘K or Ctrl+K | Search and jump |
| `/` | Focus the page's search box |
| `G`, then `O` `D` `S` `E` `V` `R` `W` `P` `A` `B` `C` | Go to Overview, Guided demo, Scenarios, Editor, Coverage, Runs, Sweep, Reports, Agents, Baseline, or Catalog |
| `N` | Start a new run: the run panel of the page, or the Scenarios page |
| `T` | Switch between light and dark |
| `J`, `K` | Next or previous call of a report |
| `E` | Expand or collapse every call of a report |
| ⌘S, ⌘Enter | In the editor: save the scenario, run the draft |

## Where things are written

| Action | Writes |
|---|---|
| Save as reports | `<out>/<agent>/<scenario>.report.json`, `.report.html`, and `.junit.xml` for each report |
| Save as baseline | The baseline file (default `agentcrucible-baseline.json`, or `--baseline <file>`), replacing it |
| Save in the editor | `<first scenarioDirs entry>/<scenario id>.yaml`; it asks before replacing a file, and refuses an id that another file already uses |

Runs stay in memory until you save them; the server keeps the last 50 runs, the last 20 sweeps, and 200 reports. A sweep's reports (its run without faults and one per cell) stay in memory with the sweep, so a sweep of more than 200 runs keeps all of them until a newer report pushes the oldest out; they are not listed on the Reports page and cannot be saved, because each would overwrite the report of the same scenario and agent. Without `scenarioDirs` in the config file, the editor can run and download drafts but not save them; `agentcrucible init` writes a config file that sets it.

![The scenario editor with a valid draft and its results](images/ui-editor.png)

## API

The page talks to a JSON API under `/api/`. Every request carries the session token in the `x-agentcrucible-token` header; a bad request is a 400 with `{ "error": "..." }`, and an unknown scenario, sweep, or report is a 404. The routes behind the Sweep and Coverage pages:

| Route | |
|---|---|
| `POST /api/sweep` | Body `{ "scenarioId": string, "agentId": string, "kinds"?: string[], "steps"?: number, "trials"?: number, "seed"?: string }`. `kinds` defaults to every fault kind that needs no params; `steps` is 1 to 64 (12 by default), `trials` as for `/api/run`, and `seed` a non-empty string. It runs the sweep and answers with the sweep summary (`scenarioId`, `agentId`, `seed`, `trials`, `baseline`, `steps`, `kinds`, `score`, `startedAt`, `finishedAt`, and `durationMs`: the fields of `SweepSummary`), `sweepId` (`sweep-N`), `baselineKey`, and `cells`: each cell of the summary with `key`, the report key to open at `#/report/<key>` or `GET /api/report?key=`. An unknown agent, an unknown fault kind, a kind that needs params, or a value out of range is a 400; an unknown scenario is a 404. |
| `GET /api/sweeps` | The kept sweeps, newest first, as summaries with `sweepId`, `baselineKey`, and `cellCount` but without `cells`. |
| `GET /api/sweep?id=sweep-N` | One sweep as `POST /api/sweep` answered it. |
| `GET /api/sweep/markdown?id=sweep-N` | `{ "markdown": string }`, the table `sweepMarkdown` builds, as the Copy as Markdown button copies it. |
| `GET /api/coverage` | What `computeCoverage` returns for the loaded scenarios and registry: `scenarios`, `worlds`, `faultKinds`, `agents`, `matrix`, and `gaps`. |

`GET /api/meta` also gives each fault kind's `required` params, which is how the Sweep page knows which kinds it cannot inject.

## Options

| Option | Default | |
|---|---|---|
| `--port <n>` | 7357, or the next free port up to 7366, then any free port | A port that is taken is an error when given explicitly. `--port 0` picks any free port. |
| `--host <addr>` | `127.0.0.1` | Anything other than a loopback address exposes the UI to the network; the command warns. |
| `--out <dir>` | config `out`, or `.agentcrucible/out` | Where reports are listed from and saved to |
| `--baseline <file>` | `agentcrucible-baseline.json` | The baseline file the Baseline page reads and writes |
| `--agents <a,b>` | | Agent modules to add, as in `compare --agents ./my-agent.mjs` |
| `--fail-on <verdict>` | config `failOn`, or `SILENT_FAILURE` | The threshold for "new failure" in baseline comparisons |
| `--config <path>` | the config file in the current directory | |

## Security

The UI can run agents (including agent modules, which are code) and write reports, scenarios, and the baseline, so the server only answers its own page:

- It listens on 127.0.0.1 unless `--host` says otherwise.
- Every API request must carry the session token that the server puts in its page. Another site open in the same browser cannot read the page, so it cannot get the token.
- Requests whose `Host` header names another site are refused, which stops DNS-rebinding attacks. `localhost` and IP addresses are accepted.
- Every value from scenarios, agents, and reports is escaped before it is shown, and the page's content security policy allows no inline scripts, no frames, and no external resources. The standalone HTML report that the HTML button opens has a policy that allows nothing but its own inline style and script.
- The typefaces, Geist and Geist Mono (SIL Open Font License 1.1), are part of the package and served by the UI server, like the page's script and styles. The HTML report and run index use them when they are installed and fall back to the system fonts otherwise.

Restarting `agentcrucible ui` creates a new token; a tab left open from the previous session says so and offers to reload.
