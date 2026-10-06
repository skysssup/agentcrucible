# Continuous integration

Three pieces make AgentCrucible fit a pipeline: exit statuses that mean something, a baseline that fails the build only when a verdict gets worse, and output that lands where CI shows it, as workflow annotations and job summaries on GitHub, as JUnit files anywhere.

## The GitHub Action

The repository is a composite action. It installs nothing into your project: it builds its own checkout and runs the CLI in your working directory.

```yaml
name: Agent resilience
on: [push, pull_request]
jobs:
  agentcrucible:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Hold the scenarios to their expected verdicts
        uses: skysssup/agentcrucible@v2
        with:
          command: check
      - name: Run the smoke scenarios against the agent
        id: smoke
        uses: skysssup/agentcrucible@v2
        with:
          tag: smoke
          agent: ./agents/my-agent.mjs
          trials: 3
          baseline: agentcrucible-baseline.json
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: agentcrucible-reports
          path: ${{ steps.smoke.outputs.reports }}
```

| Input | Default | |
|---|---|---|
| `command` | `run` | `run`, `check`, or `sweep` |
| `scenario`, `tag` | | What to select; `check` without either covers every scenario |
| `agent`, `agents` | | A registered id, a module path, or `provider:model`; `agents` is comma-separated |
| `trials` | | Trials per scenario |
| `baseline` | | Baseline file for `run` |
| `fail-on` | `SILENT_FAILURE` | The verdict that fails the step |
| `record` | | Cassette directory for model-backed agents ([model-agents.md](model-agents.md)) |
| `out` | `agentcrucible-reports` | Report directory, also the `reports` output |
| `args` | | Anything else, appended verbatim |
| `working-directory` | `.` | Where the config file and scenarios are |
| `node-version` | `22` | Node.js for the action |

Outputs: `exit-code` (0, 1, or 2, as below) and `reports` (the directory, for `upload-artifact`). A model-backed agent reads its key from the environment, so pass `env: { OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }} }` on the step, or rely on recorded cassettes and pass nothing.

## Without the action

Any CI runs the CLI directly; the same output appears:

```yaml
- run: npm install https://github.com/skysssup/agentcrucible/releases/download/v2.1.0/agentcrucible-2.1.0.tgz
- run: npx agentcrucible check
- run: npx agentcrucible run --tag smoke --agent ./agents/my-agent.mjs --baseline agentcrucible-baseline.json --out reports
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: agentcrucible-reports
    path: reports/
```

## Annotations and summaries

When `GITHUB_ACTIONS` is set, or with `--github`, `run`, `check`, and `sweep` print [workflow commands](https://docs.github.com/en/actions/reference/workflow-commands-for-github-actions) and append to `GITHUB_STEP_SUMMARY`:

- `run`: an `::error` per result at or above `--fail-on`, attached to the scenario file when it is inside the workspace, so it shows on the file in the pull request; with `--baseline`, regressions are errors and improvements are `::notice`s. The job summary gets `summary.md`: the scenario-by-agent table, the failing results with their reasons, and the baseline changes.
- `check`: an error per expected verdict that did not hold or fault that never fired, on the scenario file, and a short summary.
- `sweep`: an error per critical cell, and the kind-by-step table as Markdown.

Without GitHub, the same information is in the exit status, `summary.md`, and the JUnit files, which any test reporter (GitLab, Jenkins, Buildkite, Azure Pipelines) picks up from `reports/**/*.junit.xml`.

## Baselines

A baseline records the verdict and rule ids of every scenario-and-agent pair. `run --baseline <file>` then exits 2 only for a regression (a more severe verdict than recorded) or a new scenario that fails; a scenario that was already failing stays a known failure, so the build stays green while you work through the backlog, and goes red the moment something gets worse.

```bash
npx agentcrucible run --tag smoke --agent cross-checker --save-baseline agentcrucible-baseline.json
```

Commit the file and review changes to it like code; `run --baseline` prints every difference, and `baseline-comparison.json` in the report directory holds them as data. A baseline is comparable only with runs of the same seed and trial count; a run that differs is reported as not comparable rather than passed. [traces.md](traces.md) describes the file.

## Exit statuses

| Status | Meaning |
|---|---|
| `0` | Nothing at or above `--fail-on`; with a baseline, no regression and no new failing scenario; `check`: every expectation held |
| `1` | A usage, config, scenario, extension, or agent error, including a trial past `--timeout` and a model request that failed |
| `2` | A verdict at or above `--fail-on`, a regression, an expected verdict that did not hold, or a sweep cell at or above the threshold |

Treat 1 as broken plumbing and 2 as a finding: a step that exits 2 has reports that say exactly which agent did what on which scenario.
