import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { cassettePath, createModelAgent, DEFAULT_SYSTEM_PROMPT, parseMaxSteps, parseModelAgentId, registerModelAgent, requestKey } from "../src/models.js";
import { builtinRegistry } from "../src/registry.js";
import { runScenario } from "../src/runner.js";
import { bundledScenariosDir, findScenarios } from "../src/scenarios.js";

/**
 * A scripted "model" behind an OpenAI-compatible and an Anthropic-compatible endpoint. It refunds
 * the order from the task, retries once on an error without a key (like naive-retry), and reports.
 */
let server: Server;
let base: string;
let requests: Array<{ path: string; body: Record<string, unknown>; headers: Record<string, string | string[] | undefined> }> = [];
let mode: "naive" | "loop" | "bad-json" | "http-500" = "naive";

beforeAll(async () => {
  server = createServer((req, res) => {
    let text = "";
    req.on("data", (chunk) => (text += chunk));
    req.on("end", () => {
      const body = JSON.parse(text) as Record<string, unknown>;
      requests.push({ path: req.url ?? "", body, headers: req.headers });
      if (mode === "http-500") {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "server exploded" } }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(req.url === "/v1/messages" ? anthropicTurn(body) : openAiTurn(body)));
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((done) => server.close(() => done())));
afterEach(() => {
  requests = [];
  mode = "naive";
});

function refundArgs(task: string) {
  const order = /#(\d+)/.exec(task)?.[1] ?? "0";
  const dollars = /\$(\d+(?:\.\d+)?)/.exec(task)?.[1] ?? "0";
  return { order_id: order, amount_cents: Math.round(Number(dollars) * 100) };
}

function openAiTurn(body: Record<string, unknown>) {
  const messages = body.messages as Array<{ role: string; content: unknown; tool_calls?: unknown[] }>;
  const task = String(messages.find((m) => m.role === "user")?.content ?? "");
  const toolResults = messages.filter((m) => m.role === "tool");
  const usage = { prompt_tokens: 100 + messages.length, completion_tokens: 20 };
  const call = (args: unknown, id: string) => ({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id, type: "function", function: { name: "create_refund", arguments: typeof args === "string" ? args : JSON.stringify(args) } }] } }], usage });
  if (mode === "loop") return call(refundArgs(task), `call_${toolResults.length + 1}`);
  if (mode === "bad-json" && toolResults.length === 0) return call("{not json", "call_1");
  if (toolResults.length === 0) return call(refundArgs(task), "call_1");
  const last = JSON.parse(String(toolResults[toolResults.length - 1].content)) as Record<string, unknown>;
  if ("error" in last && toolResults.length === 1) return call(refundArgs(task), "call_2");
  const text = "error" in last ? `The refund failed twice (${last.error}); nothing was confirmed.` : `Refund ${last.refund_id} for order ${last.order_id} succeeded: $${(Number(last.amount_cents) / 100).toFixed(2)}.`;
  return { choices: [{ message: { role: "assistant", content: text } }], usage };
}

function anthropicTurn(body: Record<string, unknown>) {
  const messages = body.messages as Array<{ role: string; content: unknown }>;
  const task = String(messages[0].content);
  const results = messages.filter((m) => m.role === "user" && Array.isArray(m.content)).flatMap((m) => m.content as Array<{ content: string }>);
  const usage = { input_tokens: 200, output_tokens: 30 };
  if (results.length === 0) return { content: [{ type: "text", text: "Refunding now." }, { type: "tool_use", id: "toolu_1", name: "create_refund", input: { ...refundArgs(task), idempotency_key: "k-1" } }], stop_reason: "tool_use", usage };
  const last = JSON.parse(results[results.length - 1].content) as Record<string, unknown>;
  if ("error" in last && results.length === 1) return { content: [{ type: "tool_use", id: "toolu_2", name: "create_refund", input: { ...refundArgs(task), idempotency_key: "k-1" } }], stop_reason: "tool_use", usage };
  const text = "error" in last ? `Both attempts failed (${last.error}). I could not confirm the refund.` : `The first attempt failed; I retried with the same idempotency key and refund ${last.refund_id} succeeded for $${(Number(last.amount_cents) / 100).toFixed(2)}.`;
  return { content: [{ type: "text", text }], stop_reason: "end_turn", usage };
}

const scenario = () => findScenarios({ id: "payments/timeout-after-commit", root: [bundledScenariosDir()], registry: builtinRegistry() })[0];

describe("parseModelAgentId", () => {
  it("accepts provider:model and rejects the rest", () => {
    expect(parseModelAgentId("openai:gpt-4o-mini")).toEqual({ provider: "openai", model: "gpt-4o-mini" });
    expect(parseModelAgentId("anthropic:claude-sonnet-4-5")).toEqual({ provider: "anthropic", model: "claude-sonnet-4-5" });
    expect(parseModelAgentId("ollama:llama3.2:3b")).toEqual({ provider: "ollama", model: "llama3.2:3b" });
    expect(parseModelAgentId("naive-retry")).toBeUndefined();
    expect(parseModelAgentId("./agents/x.mjs")).toBeUndefined();
    expect(parseModelAgentId("groq:llama")).toBeUndefined();
    expect(() => parseModelAgentId("openai: ")).toThrow(/must not be empty/);
    expect(() => parseModelAgentId("openai:a,b")).toThrow(/commas/);
    expect(parseMaxSteps("3")).toBe(3);
    expect(() => parseMaxSteps(0)).toThrow(/1 to 200/);
  });

  it("registers a model agent once under its id with a description", () => {
    const registry = registerModelAgent(builtinRegistry(), "openai:gpt-4o-mini", { cassetteDir: "cassettes" });
    const entry = registry.agents.get("openai:gpt-4o-mini")!;
    expect(entry.source).toBe("model");
    expect(entry.value.description).toBe("gpt-4o-mini via the OpenAI chat completions API, up to 12 tool-calling steps, recorded in cassettes");
    expect(registerModelAgent(registry, "openai:gpt-4o-mini")).toBe(registry);
    expect(() => registerModelAgent(registry, "nope")).toThrow(/not a model agent id/);
  });
});

describe("OpenAI-compatible model agent", () => {
  it("runs the tool-calling loop, records every call in the trace, and reports usage", async () => {
    const agent = createModelAgent({ provider: "openai", model: "fake-1" }, { baseUrl: base, apiKey: "sk-test" });
    const report = await runScenario({ scenario: scenario(), agent: agent.run, agentId: "openai:fake-1", seed: "t" });
    const trial = report.trials[0];
    expect(trial.trace.calls.map((c) => [c.tool, c.committed, c.observed.ok])).toEqual([
      ["create_refund", true, false],
      ["create_refund", true, true],
    ]);
    expect(report.aggregateVerdict).toBe("HARMFUL_ACTION");
    expect(trial.trace.finalAnswer).toMatch(/^Refund re_2_4471 for order 4471 succeeded: \$84\.00\./);
    expect(trial.trace.usage).toEqual({ requests: 3, inputTokens: 100 + 2 + 100 + 4 + 100 + 6, outputTokens: 60, latencyMs: expect.any(Number), recorded: 0 });
    expect(requests.map((r) => r.path)).toEqual(["/chat/completions", "/chat/completions", "/chat/completions"]);
    expect(requests[0].headers.authorization).toBe("Bearer sk-test");
    const first = requests[0].body;
    expect(first.model).toBe("fake-1");
    expect(first.temperature).toBe(0);
    expect((first.messages as Array<{ role: string; content: string }>)[0]).toEqual({ role: "system", content: DEFAULT_SYSTEM_PROMPT });
    const tools = first.tools as Array<{ type: string; function: { name: string; description: string; parameters: unknown } }>;
    expect(tools.map((t) => t.function.name)).toEqual(["create_refund", "void_refund", "get_refund", "list_refunds"]);
    expect(tools[0].function.description).toMatch(/This tool changes state\.$/);
    expect(tools[0].function.parameters).toMatchObject({ type: "object" });
    const toolMessage = (requests[1].body.messages as Array<{ role: string; content: string; tool_call_id?: string }>).find((m) => m.role === "tool")!;
    expect(toolMessage.tool_call_id).toBe("call_1");
    expect(JSON.parse(toolMessage.content)).toEqual({ error: "ETIMEDOUT: connection timed out after commit", code: "ETIMEDOUT" });
  });

  it("uses the base URL and key from the environment, with Ollama needing no key", async () => {
    const env = { OPENAI_BASE_URL: base, OPENAI_API_KEY: "sk-env" };
    const agent = createModelAgent({ provider: "openai", model: "fake-1" }, { env });
    await runScenario({ scenario: scenario(), agent: agent.run, agentId: "openai:fake-1" });
    expect(requests[0].headers.authorization).toBe("Bearer sk-env");
    requests = [];
    const ollama = createModelAgent({ provider: "ollama", model: "llama" }, { env: { OLLAMA_BASE_URL: `${base}/` } });
    await runScenario({ scenario: scenario(), agent: ollama.run, agentId: "ollama:llama" });
    expect(requests[0].path).toBe("/chat/completions");
    expect(requests[0].headers.authorization).toBeUndefined();
  });

  it("fails clearly without a key, on an HTTP error, and when the model loops past max steps", async () => {
    const noKey = createModelAgent({ provider: "openai", model: "fake-1" }, { baseUrl: base, env: {} });
    await expect(runScenario({ scenario: scenario(), agent: noKey.run, agentId: "m" })).rejects.toThrow(/openai:fake-1 needs OPENAI_API_KEY/);
    mode = "http-500";
    const failing = createModelAgent({ provider: "openai", model: "fake-1" }, { baseUrl: base, apiKey: "k" });
    await expect(runScenario({ scenario: scenario(), agent: failing.run, agentId: "m" })).rejects.toThrow(/answered 500: .*server exploded/);
    mode = "loop";
    const looping = createModelAgent({ provider: "openai", model: "fake-1" }, { baseUrl: base, apiKey: "k", maxSteps: 3 });
    const report = await runScenario({ scenario: scenario(), agent: looping.run, agentId: "m" });
    expect(report.trials[0].trace.calls).toHaveLength(3);
    expect(report.trials[0].trace.finalAnswer).toBe("I stopped after 3 tool-calling steps (3 tool calls) without reaching a final answer, so I cannot confirm whether the task was completed.");
    expect(report.trials[0].trace.usage?.requests).toBe(3);
  });

  it("passes unparseable tool arguments to the harness, which records EARGS", async () => {
    mode = "bad-json";
    const agent = createModelAgent({ provider: "openai", model: "fake-1" }, { baseUrl: base, apiKey: "k" });
    const report = await runScenario({ scenario: scenario(), agent: agent.run, agentId: "m" });
    const [first, second] = report.trials[0].trace.calls;
    expect(first.argsError).toBe("got string");
    expect(first.observed).toEqual({ ok: false, error: "tool arguments must be a JSON object", code: "EARGS" });
    expect(first.committed).toBe(false);
    expect(second.committed).toBe(true);
  });
});

describe("Anthropic model agent", () => {
  it("speaks the Messages API: tool_use blocks in, tool_result blocks back, text out", async () => {
    const agent = createModelAgent({ provider: "anthropic", model: "fake-sonnet" }, { baseUrl: base, apiKey: "sk-ant", systemPrompt: "Be brief." });
    const report = await runScenario({ scenario: scenario(), agent: agent.run, agentId: "anthropic:fake-sonnet" });
    expect(report.aggregateVerdict).toBe("SAFE_SUCCESS");
    expect(report.trials[0].trace.calls.map((c) => [c.tool, c.args.idempotency_key, c.observed.ok])).toEqual([
      ["create_refund", "k-1", false],
      ["create_refund", "k-1", true],
    ]);
    expect(report.trials[0].trace.usage).toMatchObject({ requests: 3, inputTokens: 600, outputTokens: 90, recorded: 0 });
    expect(requests.every((r) => r.path === "/v1/messages")).toBe(true);
    expect(requests[0].headers["x-api-key"]).toBe("sk-ant");
    expect(requests[0].headers["anthropic-version"]).toBe("2023-06-01");
    expect(requests[0].body.system).toBe("Be brief.");
    expect(requests[0].body.max_tokens).toBe(1024);
    expect((requests[0].body.tools as Array<{ name: string; input_schema: unknown }>)[0]).toMatchObject({ name: "create_refund", input_schema: { type: "object" } });
    const results = (requests[1].body.messages as Array<{ role: string; content: unknown }>)[2].content as Array<Record<string, unknown>>;
    expect(results[0]).toMatchObject({ type: "tool_result", tool_use_id: "toolu_1", is_error: true });
  });
});

describe("cassettes", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("records live responses, then replays them without a provider or a key", async () => {
    dir = mkdtempSync(join(tmpdir(), "agentcrucible-cassettes-"));
    const live = createModelAgent({ provider: "openai", model: "fake-1" }, { baseUrl: base, apiKey: "k", cassetteDir: dir });
    const first = await runScenario({ scenario: scenario(), agent: live.run, agentId: "openai:fake-1", seed: "c" });
    expect(requests).toHaveLength(3);
    const path = cassettePath(dir, "payments/timeout-after-commit", "openai:fake-1");
    expect(path).toBe(join(dir, "payments%2Ftimeout-after-commit", "openai%3Afake-1.json"));
    expect(existsSync(path)).toBe(true);
    const file = JSON.parse(readFileSync(path, "utf8")) as { version: number; provider: string; model: string; entries: Record<string, { response: unknown; latencyMs: number }> };
    expect(file).toMatchObject({ version: 1, provider: "openai", model: "fake-1" });
    expect(Object.keys(file.entries)).toHaveLength(3);

    requests = [];
    const offline = createModelAgent({ provider: "openai", model: "fake-1" }, { baseUrl: "http://127.0.0.1:9", env: {}, cassetteDir: dir });
    const second = await runScenario({ scenario: scenario(), agent: offline.run, agentId: "openai:fake-1", seed: "c" });
    expect(requests).toHaveLength(0);
    expect(second.trials[0].trace.finalAnswer).toBe(first.trials[0].trace.finalAnswer);
    expect(second.trials[0].trace.calls.map((c) => c.observed)).toEqual(first.trials[0].trace.calls.map((c) => c.observed));
    expect(second.trials[0].trace.usage).toEqual({ ...first.trials[0].trace.usage!, recorded: 3 });
    expect(second.aggregateVerdict).toBe(first.aggregateVerdict);

    const unrecorded = findScenarios({ id: "payments/rate-limit", root: [bundledScenariosDir()], registry: builtinRegistry() })[0];
    const other = await runScenario({ scenario: unrecorded, agent: offline.run, agentId: "openai:fake-1" }).catch((e: Error) => e);
    expect(other).toBeInstanceOf(Error);
    expect((other as Error).message).toMatch(/needs OPENAI_API_KEY \(no recorded response for this request in .*run once with the key to record it\)/);
  });

  it("refuses a cassette that is not one it wrote", async () => {
    dir = mkdtempSync(join(tmpdir(), "agentcrucible-cassettes-"));
    const path = cassettePath(dir, "payments/timeout-after-commit", "openai:fake-1");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ version: 1, provider: "openai", model: "fake-2", entries: {} }));
    const agent = createModelAgent({ provider: "openai", model: "fake-1" }, { baseUrl: base, apiKey: "k", cassetteDir: dir });
    await expect(runScenario({ scenario: scenario(), agent: agent.run, agentId: "openai:fake-1" })).rejects.toThrow(/recorded with openai:fake-2, not openai:fake-1; delete it to record again/);
    writeFileSync(path, "{ not json");
    await expect(runScenario({ scenario: scenario(), agent: agent.run, agentId: "openai:fake-1" })).rejects.toThrow(/cannot parse/);
    writeFileSync(path, JSON.stringify({ version: 2 }));
    await expect(runScenario({ scenario: scenario(), agent: agent.run, agentId: "openai:fake-1" })).rejects.toThrow(/not a version 1 cassette/);
  });

  it("keys requests by their content regardless of key order", () => {
    expect(requestKey({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(requestKey({ b: [1, { d: 3, c: 2 }], a: 1 }));
    expect(requestKey({ a: 1 })).not.toBe(requestKey({ a: 2 }));
  });
});
