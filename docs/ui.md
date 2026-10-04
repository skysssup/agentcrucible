# The local UI

`agentcrucible ui` serves a web app for the project in the current directory. It does what the CLI does, on one page per task: browse scenarios, run them against several agents at once, read each report's timeline, replay and save reports, compare a run with the baseline, and write new scenarios with live validation. It runs offline, loads nothing from the network, and stops with Ctrl+C.

```bash
npx agentcrucible ui
```

```text
AgentCrucible 1.0.0 UI: http://127.0.0.1:7357/
  scenarios: bundled, scenarios (the editor saves to scenarios)
  reports:   .agentcrucible/out
  baseline:  agentcrucible-baseline.json
Press Ctrl+C to stop.
```

Open the printed address in a browser. The UI reads the same config file as the CLI: the scenario directories, extensions, the agent module in `agent`, the report directory in `out`, and `failOn`.

![Three scenarios run against five agents](images/ui-run.png)

## Pages

- **Overview:** counts of scenarios, agents, worlds, and saved reports, the latest results, and a button that runs the demo scenario.
- **Scenarios:** every scenario with its worlds, faults, checks, and expected verdicts. Search with `/`, filter by tag or world, and select scenarios to run. Without agents chosen, each scenario runs the agents in its `expected_verdicts`.
- **Scenario:** one scenario in full: task, faults, budget, setup, policies, every expectation, the expected verdicts, and the source file. Run it from here, or open it in the editor.
- **Runs:** each run as a scenario-by-agent matrix. A check mark means the verdict matches the scenario's `expected_verdicts`; a cross names the expected verdict. Click a cell for its report. From a run you can save its reports, compare it with the baseline, or save it as the new baseline.
- **Reports:** the saved reports under the report directory, newest first, after this session's unsaved runs. Filter by text or verdict, and select reports to compare with the baseline or to make the baseline.
- **Report:** the HTML timeline of one report, with Replay (re-execute the recorded calls and confirm every state and verdict), Download JSON, and, for an unsaved run, Save as report.
- **Baseline:** the entries of the baseline file and the result of the last comparison: regressions, new failures, improvements, rule changes, and entries that could not be compared because the seed or trial count differs.
- **Editor:** YAML on the left, checked as you type with the same rules as files on disk. Run the draft against any agents, then save it to the first `scenarioDirs` directory or download it. Two templates, a single-step scenario and a two-world workflow, are a starting point.
- **Catalog:** every agent, world (with each tool's arguments and whether it changes state), record field, and fault kind, built-in or from an extension.

![The timeline of a workflow report, at the call that voided a duplicate refund](images/ui-report.png)

## Where things are written

| Action | Writes |
|---|---|
| Save as reports | `<out>/<agent>/<scenario>.report.json`, `.report.html`, and `.junit.xml` for each report |
| Save as baseline | The baseline file (default `agentcrucible-baseline.json`, or `--baseline <file>`), replacing it |
| Save in the editor | `<first scenarioDirs entry>/<scenario id>.yaml`; it asks before replacing a file, and refuses an id that another file already uses |

Runs stay in memory until you save them; the server keeps the last 200 reports. Without `scenarioDirs` in the config file, the editor can run and download drafts but not save them; `agentcrucible init` writes a config file that sets it.

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
- Report pages are shown in a sandboxed frame, and the pages have a content security policy that allows no external resources.

Restarting `agentcrucible ui` creates a new token; a tab left open from the previous session says so and offers to reload.
