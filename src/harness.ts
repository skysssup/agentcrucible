import { decideFault, isPreCommitFault } from "./faults.js";
import type { AgentMessage, FaultSpec, ToolCallRecord, ToolObservation, TrialTrace } from "./types.js";
import type { World, WorldTool } from "./worlds/types.js";

export interface ToolCallResult {
  ok: boolean;
  result?: unknown;
  error?: string;
  code?: string;
}

export interface AgentContext {
  task: string;
  /** Tool definitions, including parameter descriptions. A fresh copy per trial. */
  tools: WorldTool[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<ToolCallResult>;
  /** Copy of the transcript so far. */
  history: AgentMessage[];
}

/** An agent under test: uses the tools, then returns its final answer to the user. */
export type ScriptedAgent = (ctx: AgentContext) => Promise<string>;

export interface HarnessOptions {
  scenarioId: string;
  task: string;
  seed: string;
  trialIndex: number;
  agentId: string;
  faults: FaultSpec[];
  world: World;
  agent: ScriptedAgent;
}

/** Runs one trial: resets the world, lets the agent call tools with faults applied, and records everything. */
export async function runHarness(opts: HarnessOptions): Promise<TrialTrace> {
  const { world, faults, seed, trialIndex } = opts;
  world.reset();
  const worldBefore = world.snapshot();
  const calls: ToolCallRecord[] = [];
  const messages: AgentMessage[] = [{ role: "user", content: opts.task }];
  const callCounts = new Map<string, number>();

  const callTool: AgentContext["callTool"] = async (name, rawArgs) => {
    const callIndex = (callCounts.get(name) ?? 0) + 1;
    callCounts.set(name, callIndex);
    const tool = world.tools.find((t) => t.name === name);
    const base = { id: `call_${calls.length + 1}`, tool: name, mutating: tool?.mutating ?? false, callIndex, seq: calls.length + 1 };

    const record = (fields: Omit<ToolCallRecord, keyof typeof base | "worldSnapshotAfter">): ToolCallResult => {
      const call: ToolCallRecord = { ...base, ...fields, worldSnapshotAfter: world.snapshot() };
      calls.push(structuredClone(call));
      messages.push({ role: "assistant", content: `tool_call ${name}(${JSON.stringify(call.args)})` });
      messages.push({
        role: "system",
        content: call.observed.ok
          ? `tool_result ${JSON.stringify(call.observed.result)}`
          : `tool_error ${call.observed.error}`,
      });
      return structuredClone(call.observed);
    };

    let args: Record<string, unknown>;
    try {
      if (typeof rawArgs !== "object" || rawArgs === null || Array.isArray(rawArgs)) throw new Error();
      args = structuredClone(rawArgs);
    } catch {
      return record({ args: {}, committed: false, observed: error("tool arguments must be a JSON object", "EARGS") });
    }
    if (!tool) {
      return record({ args, committed: false, observed: error(`unknown tool: ${name}`, "ENOTOOL") });
    }

    const fault = decideFault(faults, name, callIndex, seed, trialIndex);
    const faultFields = fault.apply ? { faultApplied: fault.kind, faultIndex: fault.index } : {};
    if (fault.kind && isPreCommitFault(fault.kind)) {
      return record({ args, committed: false, observed: error(fault.maskAsError!.error, fault.maskAsError!.code), ...faultFields });
    }

    let committedResult: unknown;
    try {
      committedResult = structuredClone(world.invoke(name, structuredClone(args)));
    } catch (err) {
      return record({ args, committed: false, observed: error(err instanceof Error ? err.message : String(err), "EWORLD") });
    }

    const observed: ToolObservation = fault.maskAsError
      ? error(fault.maskAsError.error, fault.maskAsError.code)
      : { ok: true, result: fault.mutateResult ? fault.mutateResult(structuredClone(committedResult)) : committedResult };
    return record({ args, committed: true, committedResult, observed, ...faultFields });
  };

  const tools = structuredClone(world.tools);
  const finalAnswer = await opts.agent({
    task: opts.task,
    tools,
    callTool,
    get history() {
      return structuredClone(messages);
    },
  });
  if (typeof finalAnswer !== "string") {
    throw new Error(`agent "${opts.agentId}" must return its final answer as a string`);
  }
  messages.push({ role: "assistant", content: finalAnswer });

  return {
    scenarioId: opts.scenarioId,
    trialIndex,
    seed,
    task: opts.task,
    messages,
    calls,
    finalAnswer,
    worldBefore,
    worldAfter: world.snapshot(),
    agentId: opts.agentId,
  };
}

function error(message: string, code: string): ToolObservation {
  return { ok: false, error: message, code };
}
