# Contributing

Thanks for taking the time. This page covers the setup, the checks a change has to pass, and how the pieces fit together, so a pull request can be small and reviewable.

## Setup

Node.js 22.12 or later. There is one runtime dependency (`yaml`); everything else is development tooling.

```bash
git clone https://github.com/skysssup/agentcrucible.git && cd agentcrucible
npm ci
npm run build          # dist/ (CLI, library, UI bundle) and schema/scenario.schema.json
npm run dev -- demo    # run the CLI from source: npm run dev -- <command>
```

## Checks

Every pull request runs these on Node 22 and 24; run them before you push:

| Command | What it checks |
|---|---|
| `npm run typecheck` | `src/` and `test/` with strict TypeScript |
| `npm test` | the Vitest suite (`npm run test:watch` while you work) |
| `npm run test:docs` | runs every command shown in the README and docs and compares the output shown after it |
| `npm run test:package` | packs the tarball and installs it into an empty project |
| `git diff --exit-code schema/` | the committed JSON Schema matches `agentcrucible schema` (run `npm run build`) |

A change to grading, a world, or a fault kind usually changes verdicts. `test/scenarios.test.ts` holds the verdict of every scripted agent on every bundled scenario; update that table deliberately and say why in the pull request. `agentcrucible check` must keep passing for every bundled scenario.

## Layout

| Path | Role |
|---|---|
| `src/harness.ts` | runs one trial: tool calls through the fault schedule, recorded as a trace |
| `src/faults.ts` | the built-in fault kinds and when they fire |
| `src/worlds/` | the mock worlds: tools, records, snapshots |
| `src/grader.ts`, `src/expect.ts`, `src/policy.ts`, `src/answer.ts`, `src/assertions.ts` | findings from committed state, invariants, policies, and the final answer |
| `src/scenarios.ts`, `src/scenario-schema.ts` | the scenario file format, its parser, and its JSON Schema |
| `src/runner.ts`, `src/sweep.ts`, `src/coverage.ts` | runs, matrices, fault sweeps, scenario coverage |
| `src/models.ts` | model-backed agents (`openai:`, `anthropic:`, `ollama:`) and recorded replays |
| `src/mcp.ts` | the MCP server mode |
| `src/report.ts`, `src/html.ts`, `src/summary.ts`, `src/baseline.ts`, `src/replay.ts` | reports in every format, baselines, replay |
| `src/cli.ts`, `src/completion.ts`, `src/github.ts` | the command line, shell completions, GitHub Actions output |
| `src/ui/server.ts`, `src/ui/api.ts`, `src/ui/workspace.ts` | the local console's server: the JSON API and its types, background jobs, and the history file (runs, sweeps, activity, notifications, profile) |
| `src/ui/demo-workspace.ts` | `ui --demo`: a generated project with eight weeks of history from the real engine |
| `src/ui/client/` | the dependency-free browser bundle: `app.ts` (boot and dispatch), `shell.ts`, `routes.ts`, `pages/` (one module per page), `ui/` (components), `lib/` (state, API, analytics, formatting) |
| `src/ui/styles/` | the console's CSS in layers (base, controls, layout, data, overlays) and one file per page group in `pages/`; the tokens live in `BASE_CSS` in `src/html.ts` |
| `scenarios/` | the bundled scenarios; `docs/` the reference; `examples/` a complete extension project |

## Conventions

- Errors name the file, field, and problem, and say what to do instead. Look at how `parseScenario` reports before adding a check.
- A finding carries evidence: the calls, records, or sentences it rests on. A verdict never comes from a missing check.
- Nothing in `src/` calls the network except `src/models.ts`, and only for an agent the user named. The UI loads nothing from the network.
- Keep the browser bundle free of Node imports: `src/ui/client/` and `src/html.ts` must not import `src/version.ts` or modules that pull in `node:*`.
- Prose in docs and messages is plain and exact: no marketing, no exclamation marks.

## Compatibility

[docs/stability.md](docs/stability.md) lists what a 2.x release keeps compatible: the scenario format, the report format, baselines, the library's exported names, and exit statuses. A change that breaks one of them needs a major version and a CHANGELOG entry that says how to migrate.

## Releasing

1. Update `CHANGELOG.md` and `src/version.ts`, and `package.json`'s version to match.
2. Merge, then tag: `git tag v2.1.0 && git push origin v2.1.0`.
3. The release workflow builds, runs every check, attaches the tarball to a GitHub release with the changelog section as its notes, and publishes to npm when an `NPM_TOKEN` secret is configured.
