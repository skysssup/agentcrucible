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

The sidebar lists the pages. ⌘K (Ctrl+K elsewhere) opens a command palette that jumps to any page, scenario, or recent run and runs the guided demo; `/` focuses the search box of the current page. The switch at the bottom of the sidebar follows the system's light or dark setting or forces one.

- **Overview:** the guided demo, counts of scenarios, agents, worlds, and saved reports, the latest results, and the mix of verdicts across them.
- **Guided demo:** runs the five agents that `payments/timeout-after-commit` lists in `expected_verdicts`, the same refund whose first `create_refund` commits and then times out, and shows each agent's calls, final answer, and verdict side by side, with what each verdict means. It is the `agentcrucible demo` command as a page.
- **Scenarios:** every scenario, grouped by folder, with its faults, checks, and expected verdicts. Search with `/`, filter by world or tag, and select scenarios to run from the panel beside the list. Without agents chosen, each scenario runs the agents in its `expected_verdicts`.
- **Scenario:** one scenario in full: task, faults, every expectation, budget, setup, policies, the expected verdicts, and the source file with line numbers. Run it from here, or open it in the editor.
- **Runs:** the runs of this server session, newest first, each with its mix of verdicts and whether every result matched `expected_verdicts`. A run opens as a scenario-by-agent matrix: a check mark means the verdict matches the scenario's `expected_verdicts`, and a cross names the expected verdict. Each column and row says how many of its results matched. With several trials, a cell shows how its trials' verdicts split and marks the result flaky when they disagree, and the matrix can show only the unexpected or the flaky results. Click a cell for its report. From a run you can save its reports, compare it with the baseline, or save it as the new baseline.
- **Reports:** the saved reports under the report directory, newest first, after this session's unsaved runs. Filter by text or verdict, and select reports (or all of them) to compare with the baseline or to make the baseline.
- **Report:** the timeline of one report, the same one the HTML report shows: why it got its verdict, the task, faults, and expectations, the commands that reproduce it, every trial, and every call with its arguments, what the agent saw, what the world returned, and the state after it. Call ids in findings jump to the call. Replay re-executes the recorded calls and confirms every state and verdict; JSON downloads the report; HTML opens the standalone HTML report; an unsaved run has Save as report.
- **Baseline:** the entries of the baseline file and the result of the last comparison: regressions, new failures, improvements, rule changes, and entries that could not be compared because the seed or trial count differs.
- **Editor:** YAML with line numbers and highlighting, checked as you type with the same rules as files on disk; a parse error marks its line. Tab and Shift+Tab indent, and Enter keeps the indentation. Run the draft against any agents, then save it to the first `scenarioDirs` directory or download it. Two templates, a single-step scenario and a two-world workflow, are a starting point.
- **Catalog:** every agent, world (with each tool's arguments and whether it changes state), record field, and fault kind, built-in or from an extension.

![Three scenarios run against five agents](images/ui-run.png)

![The timeline of a workflow report, at the call that voided a duplicate refund](images/ui-report.png)

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

Restarting `agentcrucible ui` creates a new token; a tab left open from the previous session says so and offers to reload.
