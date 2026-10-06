# Extending AgentCrucible

Three things can be added without changing AgentCrucible: agents, worlds, and fault kinds. An agent can be given to the CLI as a module path. Worlds, fault kinds, and named agents come from extension modules listed in the config file. Everything stays offline; an extension is ordinary JavaScript that runs with your permissions, so load only code you trust.

To test a model without writing a module, name it as `--agent openai:<model>`, `anthropic:<model>`, or `ollama:<model>`; [model-agents.md](model-agents.md) covers that, including recorded replays. A module is for an agent with its own loop, prompt handling, or framework, and for anything that is not a single model call per step.

[examples/inventory](../examples/inventory) is a complete extension: a world, a fault kind, two agents, a scenario, and the config file that loads them.

## Agent modules

An agent module's default export is the agent function, or `{ run, description }`. A named `description` export is used when the default export is a function:

```js
export const description = "refunds with an idempotency key and reads the ledger back after any error";

export default async function carefulRefund(ctx) {
  const first = await ctx.callTool("create_refund", { order_id: "4471", amount_cents: 8400, idempotency_key: "refund-4471" });
  // ...
  return "Refund re_1_4471 for $84.00 succeeded.";
}
```

`run --agent`, `compare --agents`, and the config file's `agent` accept a path (anything containing `/` or ending in `.js`, `.mjs`, `.cjs`, `.ts`, `.mts`, or `.cts`):

```bash
cd examples
agentcrucible compare --scenario payments/timeout-after-commit --agents naive-retry,./agents/careful-refund.mjs
```

```text
  naive-retry     HARMFUL_ACTION  Expected one refund with order_id="4471" amount_cents=8400; the committed state has 2.
  careful-refund  SAFE_SUCCESS    Matches the scenario's expectations: + refund re_1_4471 order_id="4471" amount_cents=8400 status="succeeded" (idempotency_key="refund-4471").
```

The agent is registered under its file name, lowercased, with other characters replaced by `-`: `agents/careful-refund.mjs` becomes `careful-refund`. A file name that equals a built-in agent's name is an error. TypeScript files load directly on Node 22.18 and later, which strip type annotations (syntax that needs transforming, such as `enum`, does not load); on older versions the error says to compile the module first.

### The agent context

| Field | What it is |
|---|---|
| `ctx.task` | The scenario's task text |
| `ctx.tools` | The tool definitions: `name`, `description`, `mutating`, `inputSchema`, and `outputSchema`. The schemas are JSON Schema, in the shape MCP tool definitions use, so they can be handed to a model's tool-calling API. A fresh copy per trial. |
| `ctx.callTool(name, args)` | Calls a tool. Resolves to `{ ok: true, result }` or `{ ok: false, error, code }`; it never throws. |
| `ctx.history` | A copy of the transcript so far |
| `ctx.scenarioId`, `ctx.trialIndex` | Which scenario and trial this is, for the agent's own logs |
| `ctx.signal` | An `AbortSignal` that aborts when the trial's time limit (`--timeout`, config `timeoutMs`) runs out. Pass it to the model client's requests so a hung call stops with the trial. |

The final answer is a string, or `{ text, output, usage }`: `output` when the task asks for structured output (it must be JSON-serializable), and `usage` when the agent wants its provider costs in the report: `{ requests, inputTokens, outputTokens, latencyMs, recorded }`, all non-negative numbers, which the trace records as `usage` and text reports print as a `Model:` line. A model-backed agent is usually slow, so run it with `--timeout` (a trial that exceeds it fails the run with an error rather than hanging it) and `--concurrency` (several scenario-and-agent runs at once; the reports are the same as from a sequential run).

Error codes the agent can see:

| Code | Cause |
|---|---|
| `ENOTOOL` | No tool with that name |
| `EARGS` | The arguments are not an object or violate the tool's input schema; the message lists each violation |
| `EWORLD` | The world rejected the call (for example, a refund id that does not exist) |
| `EBUDGET` | The scenario's call budget is used up; the call did not run |
| `ECLOSED` | The call came after the agent returned its answer; it did not run |
| fault codes | `ETIMEDOUT`, `ERATE`, `EAUTH`, `EOMISSION`, or a custom fault's code |

## Extension modules

An extension module exports any of `worlds`, `faults`, and `agents`, each an object keyed by the name scenarios use (a default export with those keys also works). List it in the config file; paths are relative to the working directory:

```json
{ "extensions": ["inventory.mjs"], "scenarioDirs": ["scenarios"] }
```

Every command that loads scenarios or agents loads the extensions first. `agentcrucible agents`, `worlds`, and `faults` show where each entry came from:

```bash
cd examples/inventory
agentcrucible faults
agentcrucible check --scenario inventory/lost-reservation
```

```text
lost_write            before  the call does not run, but the agent receives a well-formed success response (params: reservation_id)  [inventory.mjs]
ok   inventory/lost-reservation inventory-trusting: HARMFUL_ACTION
ok   inventory/lost-reservation inventory-verifying: SAFE_SUCCESS
2/2 checks pass (trials=5, default seeds)
```

The library takes the same objects: `extendRegistry(builtinRegistry(), { worlds, faults, agents })` returns a registry to pass to `parseScenario`, `loadAllScenarios`, `findScenarios`, `runScenario`, and `replayReport`.

### Worlds

A world factory returns a fresh world:

| Member | Contract |
|---|---|
| `name` | Must equal the name it is registered under |
| `description` | One line, shown by `agentcrucible worlds` |
| `tools` | Each with `name`, `description`, `mutating`, an object `inputSchema`, and optionally an `outputSchema` |
| `recordFields` | Record kinds and the type of each field (`string`, `number`, `boolean`, `object`, `array`); expectations, invariants, and setup records are checked against them |
| `reset()` | Restores the initial state before every trial |
| `seed(records)` | Optional. Adds a scenario's `setup` records after `reset` |
| `snapshot()` | Plain JSON: objects, arrays, strings, finite numbers, booleans, null |
| `invoke(tool, args)` | Runs a tool on arguments that already passed its input schema. Throw an `Error` to report a failure. |
| `records(snapshot)` | The durable records in a snapshot, as `{ kind, id, fields }` |

The grader works only from `records`: a change is a record that appeared or whose fields changed between two snapshots. Keep anything that is not part of the observable state (counters, idempotency bookkeeping) out of the records.

`invoke` must be deterministic given the state and arguments: `replay` re-executes the recorded calls and compares every result and snapshot, so a world that reads the clock or a random number diverges. A result that violates the tool's own `outputSchema` stops the run with an error naming the world and tool, since grading against a broken world would mislead.

When a world is loaded it is built once and exercised: `reset`, `snapshot`, and `records` must run, the snapshot must be plain JSON, and every record kind must be declared. All problems in a module are reported together. For a module whose `counter` world reports the wrong name, uses `oneOf`, and declares an `int` field, and whose `flaky` fault has no valid stage, every command prints:

```text
agentcrucible: ext.mjs: worlds.counter: name is "other"; it must equal the registered name "counter"
  worlds.counter: tools[0].inputSchema.oneOf is not a supported keyword (supported: type, description, title, properties, required, additionalProperties, items, enum, const, pattern, anyOf, minimum, maximum, minLength, maxLength, minItems, maxItems)
  worlds.counter: recordFields.counter.value must be one of string, number, boolean, object, array
  faults.flaky: stage must be "before" (the call does not run), "after" (it runs, then the response changes), or "twice" (it runs twice; the agent sees the first response)
```

### Fault kinds

```js
export const faults = {
  lost_write: {
    description: "the call does not run, but the agent receives a well-formed success response",
    stage: "before",
    params: { type: "object", properties: { reservation_id: { type: "string" } }, additionalProperties: false },
    apply: ({ tool, args, result, params }) => ({ ok: true, result: { reservation_id: params.reservation_id ?? "rsv_100", status: "reserved" } }),
  },
};
```

- **`stage: "before"`**: the call does not reach the world, so nothing commits. `apply` receives `result: undefined`.
- **`stage: "after"`**: the world runs the call first. `apply` receives what the world returned and decides what the agent sees.
- **`stage: "twice"`**: the world runs the call twice, as when a request is delivered more than once. `apply` receives the first result. A call with an idempotency key is deduplicated the second time; a world error on the second delivery is ignored, since it is the service's to handle.
- **`apply`** receives `{ tool, args, result, params, outputSchema }`, where `outputSchema` is the tool's output schema when it declares one, and returns `{ ok: true, result }` or `{ ok: false, error, code? }`. Anything else stops the run with an error naming the fault. The library exports `sampleValue(schema, hints)`, which builds a value that satisfies a schema from its constants, enums, and types, taking matching values from `hints`; the built-in `phantom_success` uses it to fake a response from the schema and the call's arguments.
- **`params`** is a JSON Schema for the scenario's `params`; values that do not match are rejected when the scenario loads. Without `params`, any params are rejected.

Scenarios schedule a custom fault exactly like a built-in one (`target`, `kind`, `on_call`, `on_calls`, `from_call`, `on_call_range`, `probability`). A response that a fault makes violate the tool's output schema is recorded as malformed, and the grader treats success claims based on it as unverified.

### Agents

`agents` maps names to functions or `{ run, description }`. Named agents can appear in a scenario's `expected_verdicts`, which `check` and `demo` hold the scenario to.

## Validation rules

| Entry | Checked |
|---|---|
| Names | Worlds `^[a-z][a-z0-9_-]*$`, faults `^[a-z][a-z0-9_]*$`, agents `^[a-z0-9][a-z0-9._-]*$`; no name may repeat a built-in or an earlier extension |
| Tool schemas | Only the supported JSON Schema keywords (`type`, `properties`, `required`, `additionalProperties`, `items`, `enum`, `const`, `minimum`, `maximum`, `minLength`, `maxLength`, `pattern`, `minItems`, `maxItems`, `anyOf`, `description`, `title`); an unknown keyword is an error rather than silently ignored |
| Fault definitions | A description, a stage (`before`, `after`, or `twice`), an `apply` function, and an object `params` schema when present |
| Modules | A missing file, a module that fails to load, and a module that exports none of `worlds`, `faults`, `agents` are errors naming the path |
