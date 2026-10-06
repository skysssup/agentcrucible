# MCP server mode

`agentcrucible mcp` serves one trial of a scenario to any [Model Context Protocol](https://modelcontextprotocol.io) client over stdio. The client sees the scenario's tools, with the scenario's faults applied to its calls, plus one extra tool, `submit_answer`. When the client submits its answer, the trial is graded and the client is told the verdict. Nothing about the agent needs to be written: an assistant that speaks MCP, or an agent framework with an MCP client, can be tested as it is.

```bash
npx agentcrucible mcp --scenario payments/timeout-after-commit --out reports
```

The server speaks newline-delimited JSON-RPC on stdin and stdout and logs to stderr. It answers `initialize` (with the task in `instructions`), `tools/list`, `tools/call`, `prompts/list` and `prompts/get` (the task as a prompt named `task`), `ping`, and the `resources` listings with empty lists.

## With Claude Desktop, Cursor, or another client

Add a server entry that runs the CLI with the scenario you want; the shape is the same in every client that takes a stdio server configuration:

```json
{
  "mcpServers": {
    "agentcrucible": {
      "command": "npx",
      "args": ["-y", "agentcrucible", "mcp", "--scenario", "payments/timeout-after-commit", "--out", "/tmp/agentcrucible-reports"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

Then ask the assistant to do its job: "Complete the task described in the agentcrucible server's instructions, and call submit_answer when you are done." It will see `create_refund`, `void_refund`, `get_refund`, and `list_refunds`, and the first `create_refund` will commit and then time out, exactly as the scenario says. What it does next is the test.

The `instructions` field of the `initialize` response holds the task text and the request to finish with `submit_answer`. Clients that show server instructions put the task in front of the model automatically; for the others, `prompts/get` with `task` returns it as a user message.

## submit_answer

```json
{ "name": "submit_answer", "arguments": { "answer": "create_refund failed with ETIMEDOUT, so I checked list_refunds. Confirmed: refund re_1_4471 for $84.00 succeeded. I did not retry.", "output": { "refund_id": "re_1_4471" } } }
```

`answer` is the final plain-language answer and is graded like any agent's; `output` is optional structured output for scenarios with `output` checks. The tool returns the verdict as text and as `structuredContent` (`verdict`, `reason`, `findings`, `calls`), so the model sees how it was graded. Any tool call after it is refused.

When the client disconnects without calling `submit_answer`, the trial is graded with an answer that says so, which cannot be `SAFE_*`.

## The report and exit status

The run is a one-trial report with `agentId` `mcp-client` (or `--agent-id <name>`) and the seed `--seed` or the scenario's default. With `--out`, the JSON report, HTML timeline, and JUnit file are written there like `run`'s, and `inspect` and `replay` read them. The verdict and the report's text form go to stderr, and the exit status is 2 when the verdict reaches `--fail-on` (config `failOn`, default `SILENT_FAILURE`), 0 otherwise, 1 for an error.

## Options

| Option | Default | |
|---|---|---|
| `--scenario <id>` | required | One scenario, by exact id or a unique partial match |
| `--seed <text>` | `seed-<scenario id>` | Seed for the fault schedule |
| `--out <dir>` | | Write the report files here |
| `--agent-id <name>` | `mcp-client` | The agent name the report records |
| `--config <path>` | | Config file, for extension worlds and faults |

## Limits

One process serves one trial, because the trial *is* the session: the world is reset when the server starts and graded when the answer arrives. Several trials are several processes; the seed and the scenario's schedule make the faults hit the same calls every time, so the comparison is fair. The server has no authentication beyond the stdio pipe, which is the MCP stdio model: only the client that started it can talk to it.
