# Model-backed agents

An `--agent` of the form `provider:model` runs a language model as the agent, with no code on your side. AgentCrucible gives the model the task and the trial's tool definitions, sends each tool call it makes through the harness (where the scenario's faults apply), feeds the results back, and takes the model's first reply without a tool call as its final answer. The run is graded like any other: against what the worlds committed and what the answer says.

```bash
export OPENAI_API_KEY=sk-...
npx agentcrucible run --scenario payments/timeout-after-commit --agent openai:gpt-4o-mini --record cassettes --out reports
npx agentcrucible run --tag smoke --agents openai:gpt-4o-mini,anthropic:claude-sonnet-4-5,cross-checker --record cassettes --concurrency 4 --out reports
npx agentcrucible sweep --scenario workflows/refund-notify-resolve --agent openai:gpt-4o-mini --record cassettes
```

The second command runs two models and a scripted agent on the same scenarios with the same seeds, so the matrix compares them call for call.

## Providers

| Prefix | API | Endpoint | Key |
|---|---|---|---|
| `openai:<model>` | Chat completions with tools | `OPENAI_BASE_URL`, default `https://api.openai.com/v1` | `OPENAI_API_KEY` |
| `anthropic:<model>` | Messages with tools | `ANTHROPIC_BASE_URL`, default `https://api.anthropic.com` | `ANTHROPIC_API_KEY` |
| `ollama:<model>` | Chat completions (OpenAI-compatible) | `OLLAMA_BASE_URL`, default `http://127.0.0.1:11434/v1` | none |

Any service that speaks the OpenAI chat completions API with tool calling works through `openai:` with `OPENAI_BASE_URL` pointed at it: OpenRouter, vLLM, LM Studio, Azure OpenAI's compatible endpoint, and so on. Requests are sent with `temperature: 0`.

The model receives every tool of the scenario's worlds with its description and input schema, and the note "This tool changes state." on mutating tools. Tool results go back as JSON: the result on success, `{ "error": "...", "code": "ETIMEDOUT" }` on an error. Arguments the model sends that are not valid JSON are passed on as text, which the harness rejects with `EARGS`; that call is in the trace like any other, so the report shows what the model did.

## Recording and replaying

`--record <dir>` (config `record`) makes model runs repeatable and free. Every provider response is stored under `<dir>/<scenario id>/<provider:model>.json`, keyed by a hash of the request (model, messages, tools). A request that is already recorded is answered from the file without touching the network; one that is not is sent to the provider and then recorded. Because the harness is deterministic for a seed, a recorded scenario replays exactly: the same tool results produce the same requests, which find the same responses.

Record once with a key, commit the cassette directory, and CI replays without a key or network:

```yaml
- run: npx agentcrucible run --tag smoke --agent openai:gpt-4o-mini --record cassettes --baseline agentcrucible-baseline.json --out reports
```

A request with no recording and no key fails with a clear message naming the cassette and asking for one run with the key. Change the scenario, the seed, or the system prompt and the affected requests record again on the next run with a key; stale entries are harmless and can be deleted by removing the file. A cassette records which model wrote it and refuses to serve another.

Cassettes hold the provider's complete responses, including the model's text. They hold no keys.

## Prompt and limits

| Option | Config key | Default | |
|---|---|---|---|
| `--system <file>` | `systemPrompt` | the built-in prompt | Replaces the system prompt with the file's text |
| `--max-steps <n>` | `maxSteps` | 12 | Tool-calling rounds per trial. A model still calling tools after that many rounds is stopped, and its answer records that it did not finish, which grades as not confirmed. |

The built-in prompt says what the job is and how to answer: report exactly what the tools confirmed, with amounts and ids, and what failed or could not be confirmed. It says nothing about retries, idempotency keys, or reading state back, because how the model handles a failed call is what the run measures. To test a prompt that does give such instructions, put it in a file and pass `--system`; the matrix then compares prompts the way it compares agents.

## What the report shows

Each trial's trace records the model's `usage`: requests, input and output tokens, provider latency, and how many requests were replayed from a cassette. Text reports print it as a `Model:` line, and the JSON report carries it as `trials[].trace.usage`:

```text
    Model: 3 requests · 1,842 in / 96 out tokens · 2.4 s
```

Everything else is the same as for a scripted agent: the calls with what the model sent and saw, the committed state, the findings with their evidence, replay, baselines, and the UI. `replay` re-executes the recorded tool calls without the model, so it works on a model-backed report without a key.

## In expected_verdicts

A scenario's `expected_verdicts` may name a model agent:

```yaml
expected_verdicts:
  cross-checker: SAFE_SUCCESS
  openai:gpt-4o-mini: SAFE_SUCCESS
```

`check` then runs the model like any other listed agent, with `--record` (or `record` in the config file) making it offline after the first run. This turns a model's behaviour on a scenario into a regression test: when a prompt or model change makes it worse, `check` fails and says which scenario.

## From code

```js
import { createModelAgent, runScenario } from "agentcrucible";

const agent = createModelAgent({ provider: "openai", model: "gpt-4o-mini" }, { cassetteDir: "cassettes", maxSteps: 8 });
const report = await runScenario({ scenario, agent: agent.run, agentId: "openai:gpt-4o-mini" });
```

`createModelAgent` also takes `baseUrl`, `apiKey`, `systemPrompt`, `temperature`, and a `fetch` to substitute for the global one, which is how the test suite runs the loop against a fake provider. `registerModelAgent(registry, "openai:gpt-4o-mini", options)` adds one to a registry under its id, so `runMatrix` and the UI can name it.
