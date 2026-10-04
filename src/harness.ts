import { BUILTIN_FAULTS, selectFault, type FaultDefinition } from "./faults.js";
import { validate } from "./schema.js";
import type { AgentMessage, Budget, FaultSpec, ToolCallRecord, ToolObservation, TrialTrace } from "./types.js";
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
}

/** A final answer with structured output alongside the text. */
export interface AgentAnswer {
  text: string;
  output?: unknown;
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
export function createToolCaller(opts: CallerOptions): { call(name: string, args: unknown): ToolCallRecord; calls: ToolCallRecord[] } {
  const { world, faults, seed, trialIndex, budget } = opts;
  const faultKinds = opts.faultKinds ?? BUILTIN_FAULTS;
  const calls: ToolCallRecord[] = [];
  const counts = new Map<string, number>();
  let previous = world.snapshot();
  const hardLimit = budget?.maxCalls === undefined ? DEFAULT_CALL_LIMIT : budget.maxCalls + OVERRUN_LIMIT;

  const call = (name: string, rawArgs: unknown): ToolCallRecord => {
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

    let args: Record<string, unknown>;
    try {
      if (typeof rawArgs !== "object" || rawArgs === null || Array.isArray(rawArgs)) throw new Error();
      args = structuredClone(rawArgs) as Record<string, unknown>;
    } catch {
      return record({ args: {}, committed: false, observed: error("tool arguments must be a JSON object", "EARGS") });
    }
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
    const observe = (result: unknown) => applyFault(spec!.kind, definition!, { tool: name, args: structuredClone(args), result: structuredClone(result), params: spec!.params ?? {} });
    const schemaErrors = (observed: ToolObservation) => (observed.ok && tool.outputSchema ? validate(tool.outputSchema, observed.result) : []);
    const withSchema = (observed: ToolObservation) => {
      const errors = schemaErrors(observed);
      return errors.length ? { observed, schemaErrors: errors } : { observed };
    };

    if (definition?.stage === "before") {
      return record({ args, committed: false, ...withSchema(observe(undefined)), ...faultFields });
    }
    let committedResult: unknown;
    try {
      committedResult = structuredClone(world.invoke(name, structuredClone(args)));
    } catch (err) {
      return record({ args, committed: false, observed: error(err instanceof Error ? err.message : String(err), "EWORLD") });
    }
    const resultErrors = tool.outputSchema ? validate(tool.outputSchema, committedResult) : [];
    if (resultErrors.length) {
      throw new Error(`world ${world.name}: ${name} returned a result that violates its outputSchema (${resultErrors.join("; ")})`);
    }
    const observed: ToolObservation = definition ? observe(committedResult) : { ok: true, result: committedResult };
    return record({ args, committed: true, committedResult, ...withSchema(observed), ...faultFields });
  };

  return { call, calls };
}

/** Runs a fault definition and checks that it produced an observation an agent can receive. */
function applyFault(kind: string, definition: FaultDefinition, input: Parameters<FaultDefinition["apply"]>[0]): ToolObservation {
  const observed = definition.apply(input) as unknown;
  const o = observed as Partial<Record<"ok" | "error" | "code" | "result", unknown>> | null;
  const valid =
    typeof o === "object" &&
    o !== null &&
    ((o.ok === true && "result" in o) || (o.ok === false && typeof o.error === "string" && (o.code === undefined || typeof o.code === "string")));
  if (!valid) {
    throw new Error(`fault ${kind} must return { ok: true, result } or { ok: false, error, code? } (got ${JSON.stringify(observed)})`);
  }
  return structuredClone(observed as ToolObservation);
}

export interface HarnessOptions extends Omit<CallerOptions, "world"> {
  scenarioId: string;
  task: string;
  agentId: string;
  world: World;
  agent: ScriptedAgent;
  /** Records added after reset, before the agent starts. */
  setup?: WorldRecord[];
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
  let finished = false;

  const callTool: AgentContext["callTool"] = async (name, args) => {
    if (finished) return { ok: false, error: "the trial is over; this call was not run", code: "ECLOSED" };
    const call = caller.call(name, args);
    messages.push({ role: "assistant", content: `tool_call ${name}(${JSON.stringify(call.args)})` });
    messages.push({ role: "system", content: call.observed.ok ? `tool_result ${JSON.stringify(call.observed.result)}` : `tool_error ${call.observed.error}` });
    return structuredClone(call.observed);
  };

  const answer = await opts.agent({
    task: opts.task,
    tools: structuredClone(world.tools),
    callTool,
    get history() {
      return structuredClone(messages);
    },
  });
  finished = true;
  const { text, output } = normalizeAnswer(answer, opts.agentId);
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
    worldBefore,
    worldAfter: world.snapshot(),
    agentId: opts.agentId,
  };
}

function normalizeAnswer(answer: unknown, agentId: string): AgentAnswer {
  if (typeof answer === "string") return { text: answer };
  if (typeof answer === "object" && answer !== null && typeof (answer as AgentAnswer).text === "string") {
    const { text, output } = answer as AgentAnswer;
    try {
      return output === undefined ? { text } : { text, output: JSON.parse(JSON.stringify(output)) };
    } catch {
      throw new Error(`agent "${agentId}" returned an output that is not JSON-serializable`);
    }
  }
  throw new Error(`agent "${agentId}" must return its final answer as a string or as { text, output }`);
}

function error(message: string, code: string): ToolObservation {
  return { ok: false, error: message, code };
}
