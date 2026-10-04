# The local UI

`agentcrucible ui` serves a web app for the project in the current directory. It does what the CLI does, on one page per task: browse scenarios, run them against several agents at once, read each report's timeline, replay and save reports, compare a run with the baseline, and write new scenarios with live validation. It runs offline, loads nothing from the network, and stops with Ctrl+C.

```bash
npx agentcrucible ui
```

```text
AgentCrucible 1.1.0 UI: http://127.0.0.1:7357/
  scenarios: bundled, scenarios (the editor saves to scenarios)
  reports:   .agentcrucible/out
  baseline:  agentcrucible-baseline.json
Press Ctrl+C to stop.
```

Open the printed address in a browser. The UI reads the same config file as the CLI: the scenario directories, extensions, the agent module in `agent`, the report directory in `out`, `failOn`, and the `timeoutMs` and `concurrency` limits for its runs.

![The guided demo: five agents handle the same lost response](images/ui-demo.png)

## Pages

The sidebar lists the pages, and the bar above each page shows where you are and starts a new run. ⌘K (Ctrl+K elsewhere) opens a command palette that jumps to any page, scenario, agent, or recent run, re-runs the latest run, and runs the guided demo. The switch at the bottom of the sidebar follows the system's light or dark setting or forces one; [Keyboard shortcuts](#keyboard-shortcuts) lists the rest.

- **Overview:** the guided demo, counts of scenarios, agents, worlds, fault kinds, and saved reports, the latest results, the mix of verdicts across them with the share that ended safe, the agents whose results ended safe most often, and where the project's scenarios, reports, and baseline live.
- **Guided demo:** runs the five agents that `payments/timeout-after-commit` lists in `expected_verdicts`, the same refund whose first `create_refund` commits and then times out, and shows each agent's calls, final answer, and verdict side by side, with what each verdict means. It is the `agentcrucible demo` command as a page.
- **Scenarios:** every scenario, grouped by folder, with its faults, checks, and expected verdicts. Search with `/`, filter by world or tag, and select scenarios to run from the panel beside the list. Without agents chosen, each scenario runs the agents in its `expected_verdicts`.
- **Scenario:** one scenario in full: task, faults, every expectation, budget, setup, policies, the expected verdicts, the results it has in this session and the saved reports, and the source file with line numbers. Run it from here, copy the command that runs it, or open it in the editor.
- **Runs:** the runs of this server session, newest first, each with its mix of verdicts and whether every result matched `expected_verdicts`. A run opens as a scenario-by-agent matrix: a check mark means the verdict matches the scenario's `expected_verdicts`, and a cross names the expected verdict. Each column and row says how many of its results matched. With several trials, a cell shows how its trials' verdicts split and marks the result flaky when they disagree, and the matrix can show only the unexpected or the flaky results, in a detailed or a compact layout. Click a cell for its report. From a run you can run it again with the same scenarios, agents, trials, and seed, save its reports, compare it with the baseline, or save it as the new baseline. The matrix copies as a Markdown table, downloads as CSV, and copies as the `agentcrucible run` commands that repeat it from the command line, one per scenario.
- **Reports:** the saved reports under the report directory, newest first, after this session's unsaved runs. Filter by text or verdict, and select reports (or all of them) to compare with the baseline or to make the baseline.
- **Report:** the timeline of one report, the same one the HTML report shows: why it got its verdict, the task, faults, and expectations, the commands that reproduce it, every trial, and every call with its arguments, what the agent saw, what the world returned, and the state after it. Call ids in findings jump to the call, and Expand calls opens every call of the trial. Replay re-executes the recorded calls and confirms every state and verdict; JSON downloads the report; HTML opens the standalone HTML report; an unsaved run has Save as report.
- **Agents:** every agent with its results from this session's runs and the saved reports: how many, how they split by verdict, the share that ended `SAFE_SUCCESS` or `SAFE_FAILURE`, and the most severe verdict. A saved report and the session run it came from count once. Click an agent for its reports.
- **Baseline:** the entries of the baseline file and the result of the last comparison: regressions, new failures, improvements, rule changes, and entries that could not be compared because the seed or trial count differs.
- **Editor:** YAML with line numbers and highlighting, checked as you type with the same rules as files on disk; a parse error marks its line. Tab and Shift+Tab indent, and Enter keeps the indentation. Run the draft against any agents (⌘Enter), then save it to the first `scenarioDirs` directory (⌘S) or download it. Two templates, a single-step scenario and a two-world workflow, are a starting point, and a click on a fault kind beside the editor copies its name.
- **Catalog:** every agent, world (with each tool's arguments and whether it changes state), record field, and fault kind, built-in or from an extension.

![Three scenarios run against five agents](images/ui-run.png)

![The timeline of a workflow report, at the call that voided a duplicate refund](images/ui-report.png)

![The Agents page: each agent's results by verdict and the share that ended safe](images/ui-agents.png)

## Keyboard shortcuts

`?` shows this list in the UI. Shortcuts other than ⌘K and the editor's do nothing while a text field has the focus.

| Keys | Action |
|---|---|
| ⌘K or Ctrl+K | Search and jump |
| `/` | Focus the page's search box |
| `G`, then `O` `D` `S` `E` `R` `P` `A` `B` `C` | Go to Overview, Guided demo, Scenarios, Editor, Runs, Reports, Agents, Baseline, or Catalog |
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

Runs stay in memory until you save them; the server keeps the last 50 runs and 200 reports. Without `scenarioDirs` in the config file, the editor can run and download drafts but not save them; `agentcrucible init` writes a config file that sets it.

![The scenario editor with a valid draft and its results](images/ui-editor.png)

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
