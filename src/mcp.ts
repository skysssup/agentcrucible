import type { AgentAnswer, AgentContext } from "./harness.js";
import type { Registry } from "./registry.js";
import { runScenario } from "./runner.js";
import type { RunReport, Scenario } from "./types.js";
import { VERSION } from "./version.js";

/** The MCP revision this server speaks; clients negotiate down to it. */
export const MCP_PROTOCOL_VERSION = "2025-06-18";
export const SUBMIT_TOOL = "submit_answer";

export interface McpOptions {
  scenario: Scenario;
  registry: Registry;
  seed?: string;
  /** Name the report records for the client (default "mcp-client"). */
  agentId?: string;
  /** The client's messages, one JSON-RPC message per line: process.stdin, or any stream of text or bytes. */
  input: AsyncIterable<string | Uint8Array>;
  /** Where responses go: process.stdout, or any writable. */
  output: { write(chunk: string): unknown };
  /** Where to log (stderr by default); stdout carries only protocol messages. */
  log?: (line: string) => void;
}

interface Request {
  jsonrpc: "2.0";
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
}

const DISCONNECTED = "(the MCP client disconnected without calling submit_answer, so no final answer was given)";

/**
 * Serves one trial of the scenario to an MCP client over newline-delimited JSON-RPC: the world's
 * tools, with the scenario's faults applied, plus `submit_answer`, which ends the trial and grades
 * it. Resolves with the report once the client submits or disconnects.
 */
export async function serveMcp(opts: McpOptions): Promise<RunReport> {
  const { scenario, output } = opts;
  const log = opts.log ?? ((line: string) => process.stderr.write(`${line}\n`));
  const send = (message: unknown): void => {
    output.write(`${JSON.stringify(message)}\n`);
  };
  const reply = (id: Request["id"], result: unknown): void => send({ jsonrpc: "2.0", id, result });
  const fail = (id: Request["id"], code: number, message: string): void => send({ jsonrpc: "2.0", id, error: { code, message } });

  let ctx: AgentContext | undefined;
  let finish: ((answer: AgentAnswer) => void) | undefined;
  let contextResolve!: () => void;
  const contextReady = new Promise<void>((resolve) => {
    contextResolve = resolve;
  });

  const agent = (context: AgentContext) =>
    new Promise<AgentAnswer>((resolve) => {
      ctx = context;
      finish = resolve;
      contextResolve();
    });
  const reportPromise = runScenario({ scenario, agent, agentId: opts.agentId ?? "mcp-client", registry: opts.registry, seed: opts.seed, trials: 1 });
  await contextReady;

  const tools = () => [
    ...ctx!.tools.map((t) => ({ name: t.name, description: t.mutating ? `${t.description} This tool changes state.` : t.description, inputSchema: t.inputSchema, ...(t.outputSchema ? { outputSchema: t.outputSchema } : {}) })),
    {
      name: SUBMIT_TOOL,
      description: "Finish the task: submit your final answer to the user. Call it exactly once, when you are done; it ends the session and returns how the answer was graded.",
      inputSchema: {
        type: "object",
        properties: {
          answer: { type: "string", description: "Your final plain-language answer to the user, with exact amounts and ids and anything you could not confirm." },
          output: { type: "object", description: "Optional structured output, when the task asks for one." },
        },
        required: ["answer"],
      },
    },
  ];

  const handle = async (req: Request): Promise<void> => {
    const { id, method, params = {} } = req;
    const notification = id === undefined;
    switch (method) {
      case "initialize":
        return reply(id, {
          protocolVersion: typeof params.protocolVersion === "string" && params.protocolVersion < MCP_PROTOCOL_VERSION ? params.protocolVersion : MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
          serverInfo: { name: "agentcrucible", version: VERSION },
          instructions: `${scenario.task}\n\nComplete this task with the tools, then call ${SUBMIT_TOOL} with your final answer. Tool calls may fail or return odd results; what you do about that is part of the task.`,
        });
      case "notifications/initialized":
      case "notifications/cancelled":
        return;
      case "ping":
        return reply(id, {});
      case "tools/list":
        return reply(id, { tools: tools() });
      case "prompts/list":
        return reply(id, { prompts: [{ name: "task", description: `The task of scenario ${scenario.id}` }] });
      case "prompts/get":
        if (params.name !== "task") return fail(id, -32602, `unknown prompt ${String(params.name)}`);
        return reply(id, { description: scenario.description, messages: [{ role: "user", content: { type: "text", text: scenario.task } }] });
      case "resources/list":
        return reply(id, { resources: [] });
      case "resources/templates/list":
        return reply(id, { resourceTemplates: [] });
      case "tools/call": {
        const name = String(params.name ?? "");
        const args = (typeof params.arguments === "object" && params.arguments !== null ? params.arguments : {}) as Record<string, unknown>;
        if (name === SUBMIT_TOOL) {
          if (typeof args.answer !== "string") return fail(id, -32602, "submit_answer needs { answer: string, output?: object }");
          finish!({ text: args.answer, ...(args.output === undefined ? {} : { output: args.output }) });
          finish = undefined;
          const report = await reportPromise;
          const trial = report.trials[0];
          reply(id, {
            content: [{ type: "text", text: `Graded ${report.aggregateVerdict}: ${trial.reason}` }],
            structuredContent: { verdict: report.aggregateVerdict, reason: trial.reason, findings: trial.findings.map((f) => ({ verdict: f.verdict, rule: f.rule, reason: f.reason })), calls: trial.trace.calls.length },
          });
          return;
        }
        if (!finish) return fail(id, -32600, "the trial is over; submit_answer was already called");
        const result = await ctx!.callTool(name, args);
        const text = JSON.stringify(result.ok ? result.result ?? null : { error: result.error, ...(result.code ? { code: result.code } : {}) });
        return reply(id, {
          content: [{ type: "text", text }],
          ...(result.ok && typeof result.result === "object" && result.result !== null && !Array.isArray(result.result) ? { structuredContent: result.result } : {}),
          isError: !result.ok,
        });
      }
      default:
        if (!notification) fail(id, -32601, `method not found: ${String(method)}`);
    }
  };

  let queue = Promise.resolve();
  const dispatch = (line: string) => {
    if (!line.trim()) return;
    let req: Request;
    try {
      req = JSON.parse(line) as Request;
    } catch {
      fail(null, -32700, "parse error: each line must be one JSON-RPC message");
      return;
    }
    if (req?.jsonrpc !== "2.0" || typeof req.method !== "string") {
      fail(req?.id ?? null, -32600, "invalid request");
      return;
    }
    queue = queue.then(() => handle(req)).catch((err: unknown) => fail(req.id ?? null, -32603, err instanceof Error ? err.message : String(err)));
  };
  const decoder = new TextDecoder();
  const closed = (async () => {
    let buffered = "";
    for await (const chunk of opts.input) {
      buffered += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
      let index: number;
      while ((index = buffered.indexOf("\n")) >= 0) {
        dispatch(buffered.slice(0, index).replace(/\r$/, ""));
        buffered = buffered.slice(index + 1);
      }
    }
    dispatch(buffered);
    await queue;
    if (finish) {
      log(`agentcrucible mcp: the client disconnected before calling ${SUBMIT_TOOL}`);
      finish({ text: DISCONNECTED });
      finish = undefined;
    }
    return reportPromise;
  })();
  closed.catch(() => {});
  const report = await Promise.race([reportPromise, closed]);
  await queue;
  return report;
}
