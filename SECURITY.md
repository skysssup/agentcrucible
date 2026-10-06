# Security

## Reporting

Email hello@aakashdahal.fun with a description and steps to reproduce. You will get an acknowledgement within three days and a fix or a decision within thirty. Please do not open a public issue for a vulnerability before it is fixed.

## What runs where

- **Offline by default.** Scenarios, worlds, grading, reports, and the UI make no network requests. The only outbound requests are made by `src/models.ts`, for an agent you name as `openai:`, `anthropic:`, or `ollama:`, to the endpoint in `OPENAI_BASE_URL`, `ANTHROPIC_BASE_URL`, or `OLLAMA_BASE_URL` (or the provider's default). Keys are read from the environment and never written to reports, cassettes, or logs.
- **Recorded responses** (`--record <dir>`) contain the provider's full responses, which include the model's text. Treat the directory like any test fixture that holds model output; it holds no keys.
- **Agent modules and extensions** (`--agent ./x.mjs`, `extensions` in the config file) are JavaScript you choose to run; they run with your privileges, like any test code.
- **The UI** listens on 127.0.0.1 unless `--host` says otherwise. Every API request must carry the per-session token the page receives, and the `Host` header must name the server, so another web page cannot drive it (DNS rebinding included). The page's content security policy forbids inline scripts, frames, and remote resources. Binding to another interface exposes a server that can run agents and write reports, scenarios, and the baseline; the CLI warns when you do. Settings, Security rotates the session token; other open tabs must reload.
- **The UI history file** (`.agentcrucible/ui/workspace.json`, or `<dir>/workspace.json` with `--state <dir>`) holds your runs with their verdicts, sweeps, the activity log, notifications, and the profile you entered (name, role, email, avatar color). It holds no keys or tokens. `--no-history` keeps everything in memory for the session; Settings, Data exports, imports, and clears the history. Keep `.agentcrucible/ui/` out of version control (the repository's `.gitignore` does).
- **The MCP server** (`agentcrucible mcp`) speaks only on stdin and stdout to the client that started it.

## Supported versions

The latest 2.x release receives fixes.
