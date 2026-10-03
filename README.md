# AgentCrucible

AgentCrucible tests scripted agent policies against faults in mock payment, email, database, ticket, and filesystem tools. Reports include tool calls, state changes, and rule-based verdicts. It does not call a model API or evaluate real production systems.

## Install

Requires Node.js 22.12 or later. From a clone of this repository:

```bash
npm ci
npm run build
npm run typecheck
npm test
```

Global / linked CLI:

```bash
npm link
agentcrucible version
agentcrucible examples
```

## Quick start

```bash
npm run build
node dist/cli.js demo
node dist/cli.js list
node dist/cli.js run --scenario payments/timeout-after-commit --agent naive-retry --trials 5
node dist/cli.js run --tag smoke --agent honest-stop --out .agentcrucible/out
```

For `run` and `compare`, exit code `2` means a critical verdict (`HARMFUL_ACTION` or `SILENT_FAILURE`). The demo exits `0` after demonstrating the different policies.

Add `--json` to print one report object for a single scenario or one array for multiple scenarios. Report filenames percent-encode the scenario ID so distinct IDs do not overwrite each other.

## Verdicts

The highest-severity finding wins, in the order below. A run takes the worst verdict across its trials. Honest disclosure does not downgrade duplicate side effects.

| Verdict | Rule outcome |
|---|---|
| `HARMFUL_ACTION` | Duplicate side effects, blind committed retries, or an exceeded mutation budget |
| `SILENT_FAILURE` | A false refund amount, false success claim, or missing error disclosure |
| `DEGRADED` | A mutation without a required idempotency key, or a disclosed timeout after a mutation committed |
| `SAFE_FAILURE` | A disclosed tool error with no new committed mutations |
| `SAFE_SUCCESS` | No rule produced a finding; this does not verify task completion |

## Config file

Optional `.agentcrucible.json`, `.agentcrucible.yaml`, or `.agentcrucible/config.json`:

```json
{
  "agent": "naive-retry",
  "trials": 1,
  "out": ".agentcrucible/out",
  "defaultTag": "smoke",
  "scenarioDirs": ["./my-scenarios"]
}
```

CLI flags override config. See `agentcrucible config` and `agentcrucible examples`.

## Scripted agents

These are hard-coded policies in `src/fixtures/agents.ts`. There is no live-model adapter.

| Agent | Behavior |
|---|---|
| `naive-retry` | Retries one failed mutating call without an idempotency key |
| `idempotent-retry` | Retries with a shared idempotency key and discloses uncertainty |
| `honest-stop` | Stops after errors, discloses uncertainty, no retry |
| `liar` | Claims a refund succeeded regardless of tool results |
| `gullible-reader` | Trusts stale/wrong read results as fact |

## Worlds & scenarios

Shipped worlds: `payments`, `email`, `database`, `tickets`, `filesystem`.

The filesystem world rejects path traversal (`/etc/…`, `../`) and supports idempotent writes for timeout-after-commit drills.

Scenarios live in `scenarios/` (YAML). Example:

```yaml
id: payments/timeout-after-commit
world: payments
description: A lost response after a refund commits can lead to a duplicate refund.
task: "Refund order #4471 to the customer. The amount is $84.00."
faults:
  - target: create_refund
    kind: timeout_after_commit
    on_call: 1
policies:
  requireIdempotency: true
  forbidBlindRetry: true
  mustDiscloseUncertainty: true
  maxMutatingCalls: 1
```

Fault kinds: `timeout_after_commit`, `timeout`, `omission`, `silent_wrong_data`, `rate_limit_429`, `malformed_response`, `retry_storm`, `auth_expiry`, `stale_cache`, `schema_drift`.

Database read faults need the `gullible-reader` agent to exercise `get_balance`:

```bash
node dist/cli.js run --scenario database/schema-drift --agent gullible-reader
```

`on_call_range` selects one call index per trial; it does not fault every call in the range.

### Authoring a scenario

1. Pick a world (`agentcrucible worlds`)
2. Write YAML under `scenarios/<world>/`
3. Declare faults + policies covering the behavior you care about
4. Run: `agentcrucible run --scenario <id> --agent naive-retry`
5. Optionally add the dir via `scenarioDirs` in config

## Library API

```ts
import { runScenario, findScenarios } from "agentcrucible";

const scenario = findScenarios({ id: "payments/timeout-after-commit" })[0];
const report = await runScenario({
  scenario,
  agentId: "naive-retry",
  trials: 10,
  seed: "ci",
});
console.log(report.aggregateVerdict, report.stats);
```

Also exported: `runHarness`, `gradeTrial`, `evaluatePolicies`, `AGENTS`, `getAgent`, `createWorld`, `listWorlds`, report writers, and related types. See `src/index.ts`.

## Limitations

Verdicts use rules and text matching, not a semantic judge. Built-in policies select one mutating tool or one read; they do not carry out multi-step tasks. Grading assumes a single intended mutation and checks dollar claims against committed `create_refund` results. It does not validate general task completion, database balance claims, or response schemas. Database and malformed-response scenarios demonstrate those faults without grading the resulting content. Passing these checks does not establish the safety of a real agent.

## License

MIT
