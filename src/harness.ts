import { BUILTIN_FAULTS, selectFault, type FaultDefinition } from "./faults.js";
import { jsonType, validate } from "./schema.js";
import type { AgentMessage, Budget, FaultSpec, ModelUsage, ToolCallRecord, ToolObservation, TrialTrace } from "./types.js";
import { effectsBetween } from "./worlds/index.js";
import type { World, WorldRecord, WorldTool } from "./worlds/types.js";

export interface ToolCallResult {
  ok: boolean;
  result?: unknown;
  error?: string;
  code?: string;
}

export interface AgentContext {
  task: string;
  /** Tool definitions with their input and output JSON Schemas. A fresh copy per trial. */
  tools: WorldTool[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<ToolCallResult>;
  /** Copy of the transcript so far. */
  history: AgentMessage[];
  /** The scenario being run and which of its trials this is, for the agent's own logs. */
  scenarioId: string;
  trialIndex: number;
  /** Aborted when the trial's time limit runs out, so a model loop can cancel its requests. */
  signal: AbortSignal;
}

/** A final answer with structured output alongside the text, and what a model spent producing it. */
export interface AgentAnswer {
  text: string;
  output?: unknown;
  usage?: ModelUsage;
}

/** An agent under test: uses the tools, then returns its final answer to the user. */
export type ScriptedAgent = (ctx: AgentContext) => Promise<string | AgentAnswer>;

/** Calls allowed per trial when the scenario sets no budget. More than this ends the trial with an error. */
export const DEFAULT_CALL_LIMIT = 1000;
/** Refused calls tolerated past a declared budget before the trial ends with an error. */
const OVERRUN_LIMIT = 50;

export interface CallerOptions {
  world: World;
  faults: FaultSpec[];
  /** Definitions for every fault kind the specs use. Defaults to the built-in kinds. */
  faultKinds?: Record<string, FaultDefinition>;
  seed: string;
  trialIndex: number;
  budget?: Budget;
}

/**
 * Executes tool calls against a world with the scenario's budget and faults applied, recording
 * each one. `runHarness` drives it with an agent; `replay` drives it with a saved trace.
 */
export function createToolCaller(opts: CallerOptions): { call(name: unknown, args: unknown): ToolCallRecord; calls: ToolCallRecord[] } {
  const { world, faults, seed, trialIndex, budget } = opts;
  const faultKinds = opts.faultKinds ?? BUILTIN_FAULTS;
  const calls: ToolCallRecord[] = [];
  const counts = new Map<string, number>();
  let previous = world.snapshot();
  const hardLimit = budget?.maxCalls === undefined ? DEFAULT_CALL_LIMIT : budget.maxCalls + OVERRUN_LIMIT;

  const call = (rawName: unknown, rawArgs: unknown): ToolCallRecord => {
    const name = String(rawName);
    if (calls.length >= hardLimit) {
      throw new Error(
        `the agent made more than ${hardLimit} tool calls in trial ${trialIndex}; it may be looping. ` +
          (budget?.maxCalls === undefined ? "Set budget.max_calls to refuse calls past a limit." : "Calls past budget.max_calls are refused with EBUDGET; the agent should stop.")
      );
    }
    const callIndex = (counts.get(name) ?? 0) + 1;
    counts.set(name, callIndex);
    const tool = world.tools.find((t) => t.name === name);
    const base = { id: `call_${calls.length + 1}`, tool: name, mutating: tool?.mutating ?? false, callIndex, seq: calls.length + 1 };
    const record = (fields: Omit<ToolCallRecord, keyof typeof base | "worldSnapshotAfter" | "changes">): ToolCallRecord => {
      const after = world.snapshot();
      const changes = fields.committed ? effectsBetween(world, previous, after).map((e) => e.summary) : [];
      const recorded: ToolCallRecord = structuredClone({ ...base, ...fields, changes, worldSnapshotAfter: after });
      previous = after;
      calls.push(recorded);
      return recorded;
    };

    // Arguments travel as JSON, as they would to a real tool: undefined and functions are dropped
    // and NaN becomes null. What is recorded is exactly what the tool received.
    const encoded = toJson(rawArgs);
    if (!encoded.ok || typeof encoded.value !== "object" || encoded.value === null || Array.isArray(encoded.value)) {
      const argsError = encoded.ok ? `got ${jsonType(encoded.value)}` : encoded.reason;
      return record({ args: {}, argsError, committed: false, observed: error("tool arguments must be a JSON object", "EARGS") });
    }
    const args = encoded.value as Record<string, unknown>;
    const toolLimit = budget?.maxCallsPerTool?.[name];
    if ((budget?.maxCalls !== undefined && calls.length >= budget.maxCalls) || (toolLimit !== undefined && callIndex > toolLimit)) {
      const limit = toolLimit !== undefined && callIndex > toolLimit ? `${toolLimit} ${name} calls` : `${budget!.maxCalls} calls`;
      return record({ args, committed: false, budgetExceeded: true, observed: error(`EBUDGET: budget of ${limit} per trial is used up; the call was not run`, "EBUDGET") });
    }
    if (!tool) return record({ args, committed: false, observed: error(`unknown tool: ${name}`, "ENOTOOL") });
    const argErrors = validate(tool.inputSchema, args);
    if (argErrors.length) return record({ args, committed: false, observed: error(`invalid arguments for ${name}: ${argErrors.join("; ")}`, "EARGS") });

    const index = selectFault(faults, name, callIndex, seed, trialIndex);
    const spec = faults[index];
    const definition = spec ? faultKinds[spec.kind] : undefined;
    if (spec && !definition) throw new Error(`fault kind "${spec.kind}" is not registered`);
    const faultFields = spec ? { faultApplied: spec.kind, faultIndex: index } : {};
    const observe = (result: unknown) =>
      applyFault(spec!.kind, definition!, {
        tool: name,
        args: structuredClone(args),
        result: structuredClone(result),
        params: spec!.params ?? {},
        ...(tool.outputSchema ? { outputSchema: structuredClone(tool.outputSchema) } : {}),
      });
    const schemaErrors = (observed: ToolObservation) => (observed.ok && tool.outputSchema ? validate(tool.outputSchema, observed.result) : []);
    const withSchema = (observed: ToolObservation) => {
      const errors = schemaErrors(observed);
      return errors.length ? { observed, schemaErrors: errors } : { observed };
    };

    if (definition?.stage === "before") {
      return record({ args, committed: false, ...withSchema(observe(undefined)), ...faultFields });
    }
    const invoke = (): unknown => {
      const result = toJson(world.invoke(name, structuredClone(args)) ?? null);
      if (!result.ok) throw new WorldContractError(`world ${world.name}: ${name} returned a result that cannot be sent as JSON (${result.reason})`);
      const resultErrors = tool.outputSchema ? validate(tool.outputSchema, result.value) : [];
      if (resultErrors.length) throw new WorldContractError(`world ${world.name}: ${name} returned a result that violates its outputSchema (${resultErrors.join("; ")})`);
      return result.value;
    };
    let committedResult: unknown;
    try {
      committedResult = invoke();
    } catch (err) {
      if (err instanceof WorldContractError) throw err;
      return record({ args, committed: false, observed: error(err instanceof Error ? err.message : String(err), "EWORLD") });
    }
    if (definition?.stage === "twice") {
      // The second delivery is processed like the first; a rejection there is the service's problem, not the agent's.
      try {
        invoke();
      } catch (err) {
        if (err instanceof WorldContractError) throw err;
      }
    }
    const observed: ToolObservation = definition ? observe(committedResult) : { ok: true, result: committedResult };
    return record({ args, committed: true, committedResult, ...withSchema(observed), ...faultFields });
  };

  return { call, calls };
}

/** A world broke its own contract: its result cannot travel as JSON or violates its outputSchema. */
class WorldContractError extends Error {}

/** Runs a fault definition and checks that it produced an observation an agent can receive. */
function applyFault(kind: string, definition: FaultDefinition, input: Parameters<FaultDefinition["apply"]>[0]): ToolObservation {
  const encoded = toJson(definition.apply(input));
  const observed = encoded.ok ? encoded.value : `a value that cannot be sent as JSON (${encoded.reason})`;
  const o = observed as Partial<Record<"ok" | "error" | "code" | "result", unknown>> | null;
  const valid =
    typeof o === "object" &&
    o !== null &&
    ((o.ok === true && "result" in o) || (o.ok === false && typeof o.error === "string" && (o.code === undefined || typeof o.code === "string")));
  if (!valid) {
    throw new Error(`fault ${kind} must return { ok: true, result } or { ok: false, error, code? } (got ${JSON.stringify(observed)})`);
  }
  return observed as ToolObservation;
}

/** The value after a JSON round trip, or why it cannot make one. */
function toJson(value: unknown): { ok: true; value: unknown } | { ok: false; reason: string } {
  try {
    const text = JSON.stringify(value);
    if (text === undefined) return { ok: false, reason: `got ${typeof value}` };
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return { ok: false, reason: `cannot be encoded as JSON: ${(err as Error).message}` };
  }
}

export interface HarnessOptions extends Omit<CallerOptions, "world"> {
  scenarioId: string;
  task: string;
  agentId: string;
  world: World;
  agent: ScriptedAgent;
  /** Records added after reset, before the agent starts. */
  setup?: WorldRecord[];
  /** Milliseconds the agent may take to answer. Past it, `ctx.signal` aborts and the trial fails with an error. */
  timeoutMs?: number;
}

/** Runs one trial: resets and seeds the world, lets the agent call tools with faults applied, and records everything. */
export async function runHarness(opts: HarnessOptions): Promise<TrialTrace> {
  const { world } = opts;
  world.reset();
  if (opts.setup?.length) {
    if (!world.seed) throw new Error(`world ${world.name} does not support setup records`);
    world.seed(structuredClone(opts.setup));
  }
  const worldBefore = world.snapshot();
  const caller = createToolCaller(opts);
  const messages: AgentMessage[] = [{ role: "user", content: opts.task }];
  const controller = new AbortController();
  let finished = false;

  const callTool: AgentContext["callTool"] = async (name, args) => {
    if (finished) return { ok: false, error: "the trial is over; this call was not run", code: "ECLOSED" };
    const call = caller.call(name, args);
    messages.push({ role: "assistant", content: `tool_call ${name}(${JSON.stringify(call.args)})` });
    messages.push({ role: "system", content: call.observed.ok ? `tool_result ${JSON.stringify(call.observed.result)}` : `tool_error ${call.observed.error}` });
    return structuredClone(call.observed);
  };

  const agentAnswer = Promise.resolve().then(() =>
    opts.agent({
      task: opts.task,
      tools: structuredClone(world.tools),
      callTool,
      get history() {
        return structuredClone(messages);
      },
      scenarioId: opts.scenarioId,
      trialIndex: opts.trialIndex,
      signal: controller.signal,
    })
  );
  let answer: unknown;
  if (opts.timeoutMs === undefined) {
    answer = await agentAnswer;
  } else {
    // After the limit the agent keeps running on its own, with every further call refused (ECLOSED) and its outcome ignored.
    agentAnswer.catch(() => {});
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        finished = true;
        controller.abort(new Error(`the trial's time limit of ${opts.timeoutMs} ms ran out`));
        reject(new Error(`agent "${opts.agentId}" did not answer within ${opts.timeoutMs} ms (${caller.calls.length} tool call(s) so far)`));
      }, opts.timeoutMs);
      timer.unref?.();
    });
    try {
      answer = await Promise.race([agentAnswer, timeout]);
    } finally {
      clearTimeout(timer);
      finished = true;
    }
  }
  finished = true;
  const { text, output, usage } = normalizeAnswer(answer, opts.agentId);
  messages.push({ role: "assistant", content: text });

  return {
    scenarioId: opts.scenarioId,
    trialIndex: opts.trialIndex,
    seed: opts.seed,
    task: opts.task,
    messages,
    calls: caller.calls,
    finalAnswer: text,
    ...(output === undefined ? {} : { finalOutput: output }),
    ...(usage === undefined ? {} : { usage }),
    worldBefore,
    worldAfter: world.snapshot(),
    agentId: opts.agentId,
  };
}

function normalizeAnswer(answer: unknown, agentId: string): AgentAnswer {
  if (typeof answer === "string") return { text: answer };
  if (typeof answer === "object" && answer !== null && typeof (answer as AgentAnswer).text === "string") {
    const { text, output, usage } = answer as AgentAnswer;
    const normalized: AgentAnswer = { text };
    try {
      if (output !== undefined) normalized.output = JSON.parse(JSON.stringify(output));
    } catch {
      throw new Error(`agent "${agentId}" returned an output that is not JSON-serializable`);
    }
    if (usage !== undefined) {
      const fields = ["requests", "inputTokens", "outputTokens", "latencyMs", "recorded"] as const;
      const u = usage as Partial<Record<(typeof fields)[number], unknown>> | null;
      if (typeof u !== "object" || u === null || !fields.every((f) => typeof u[f] === "number" && Number.isFinite(u[f] as number) && (u[f] as number) >= 0)) {
        throw new Error(`agent "${agentId}" returned a usage that is not { requests, inputTokens, outputTokens, latencyMs, recorded } with non-negative numbers`);
      }
      normalized.usage = Object.fromEntries(fields.map((f) => [f, u[f]])) as unknown as ModelUsage;
    }
    return normalized;
  }
  throw new Error(`agent "${agentId}" must return its final answer as a string or as { text, output, usage }`);
}

function error(message: string, code: string): ToolObservation {
  return { ok: false, error: message, code };
}
