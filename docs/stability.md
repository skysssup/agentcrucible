# Stability

AgentCrucible follows [semantic versioning](https://semver.org/). A breaking change to anything listed under "Stable" needs a new major version, and the changelog says what to update. 2.0.0 broke nothing listed here for 1.x users: scenario files, reports, baselines, agent modules, and extensions written for 1.1 load and mean the same thing; the major version marks the redesign of the UI and the new surface (model-backed agents, sweeps, coverage, MCP mode, the schema), not a migration.

## Stable

- **The CLI:** command names, options, their defaults, `--json` output shapes, and exit statuses ([cli.md](cli.md)).
- **Scenario files** (`version: 1`): every key in [scenarios.md](scenarios.md). A 2.x release may add optional keys; a file that loads in 2.0 keeps loading and means the same thing. The published JSON Schema follows the same rule.
- **The config file:** its names, keys, and precedence.
- **JSON reports** (`reportVersion: 2`) and **baselines** (`format: agentcrucible-baseline`, `version: 1`). 2.x releases may add fields (2.0 added the optional `trace.usage`); they do not remove or rename fields or change their meaning. Every 2.x release reads reports and baselines written by any 1.x or earlier 2.x release.
- **Verdicts:** the six names and their order of severity.
- **Rule ids** such as `expect.duplicate_effect`. New rules may be added; an existing id keeps its meaning, so baselines that record rule ids stay comparable.
- **Agents and extensions:** the agent context (`task`, `tools`, `callTool`, `history`, `scenarioId`, `trialIndex`, `signal`), the answer forms (a string, or `{ text, output, usage }`), the tool error codes, and the world, fault, and agent interfaces in [extending.md](extending.md).
- **Model agent ids** (`openai:`, `anthropic:`, `ollama:`), the environment variables they read, and the cassette file format (`version: 1`), so recorded runs keep replaying.
- **The MCP server's tools:** the world's tools under their own names and `submit_answer` with `answer` and `output`.
- **The library:** everything exported from `agentcrucible` and its type declarations. New exports and optional parameters may be added.
- **Built-in worlds, fault kinds, agents, and scenario ids.** Tools, record fields, and scenarios may be added. A bundled scenario's id and intent do not change; if one needs a different meaning, it gets a new id.

## Not covered

These may change in any minor release:

- Terminal output that is not `--json`: wording, layout, and colors, including the sweep and coverage tables.
- The HTML report, the run index, the sweep page, the Markdown summary, the GitHub annotations' wording, and the JUnit test-case text.
- The completion scripts and the built-in system prompt of model agents (its text may improve; a run that must not change pins a prompt with `--system`).
- The local UI and the HTTP API behind it, which only its own page uses.
- The wording of verdict reasons and evidence summaries.
- Anything not exported from the package entry point (`dist/` internals).

## Grading changes

A minor release may fix a grading bug: an answer that was misread, or a rule that fired on the wrong evidence. Such a fix can change a verdict on an unusual trace. The changelog lists every grading change. The verdicts of the bundled scenarios for the bundled agents, which `agentcrucible check` verifies, change only in a major release; 2.0.0 changed none. Before upgrading, `agentcrucible replay` on saved reports shows which verdicts the new version grades differently, and a baseline comparison shows the same for a whole suite.
