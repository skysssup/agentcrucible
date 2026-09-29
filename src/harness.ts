import { decideFault, isPreCommitFault, observationFromDecision } from "./faults.js";
import type {
  AgentMessage,
  FaultSpec,
  ToolCallRecord,
  TrialTrace,
} from "./types.js";
import type { World } from "./worlds/types.js";

export interface AgentContext {
  task: string;
  tools: { name: string; description: string; mutating: boolean }[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<{
    ok: boolean;
    result?: unknown;
    error?: string;
    code?: string;
  }>;
  history: AgentMessage[];
}

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

/**
 * Deterministic in-process harness. Runs a scripted (or live) agent against a
 * world with fault injection. No MCP/network required — CI-native by default.
 */
export async function runHarness(opts: HarnessOptions): Promise<TrialTrace> {
  const { world, faults, seed, trialIndex } = opts;
  world.reset();
  const worldBefore = world.snapshot();
  const calls: ToolCallRecord[] = [];
  const messages: AgentMessage[] = [
    { role: "user", content: opts.task },
  ];
  const callCounts = new Map<string, number>();
  let seq = 0;

  const callTool: AgentContext["callTool"] = async (name, args) => {
    const tool = world.tools.find((t) => t.name === name);
    if (!tool) {
      return { ok: false, error: `unknown tool: ${name}`, code: "ENOTOOL" };
    }
    const callIndex = (callCounts.get(name) ?? 0) + 1;
    callCounts.set(name, callIndex);
    seq += 1;
    const id = `call_${seq}`;

    // Peek which fault would apply to decide pre-commit vs post-commit.
    const peek = decideFault(faults, name, callIndex, seed, trialIndex, null);
    let committedResult: unknown = undefined;
    let committed = false;

    if (peek.apply && peek.kind && isPreCommitFault(peek.kind)) {
      const { observation, committed: c } = observationFromDecision(peek, null);
      const record: ToolCallRecord = {
        id,
        tool: name,
        args: { ...args },
        callIndex,
        seq,
        observed: observation,
        committed: c,
        faultApplied: peek.kind,
        worldSnapshotAfter: world.snapshot(),
      };
      calls.push(record);
      messages.push({
        role: "assistant",
        content: `tool_call ${name}(${JSON.stringify(args)})`,
      });
      messages.push({
        role: "system",
        content: observation.ok
          ? `tool_result ${JSON.stringify(observation.result)}`
          : `tool_error ${observation.error}`,
      });
      return observation.ok
        ? { ok: true, result: observation.result }
        : { ok: false, error: observation.error, code: observation.code };
    }

    // Invoke world (commit), then maybe mask/mutate.
    try {
      committedResult = world.invoke(name, args);
      committed = true;
    } catch (err) {
      const observation = {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
        code: "EWORLD",
      };
      calls.push({
        id,
        tool: name,
        args: { ...args },
        callIndex,
        seq,
        observed: observation,
        committed: false,
        worldSnapshotAfter: world.snapshot(),
      });
      return observation;
    }

    const decision = decideFault(faults, name, callIndex, seed, trialIndex, committedResult);
    const { observation, committed: stillCommitted } = observationFromDecision(
      decision,
      committedResult
    );
    // timeout_after_commit keeps committed=true; mutate keeps committed=true
    const record: ToolCallRecord = {
      id,
      tool: name,
      args: { ...args },
      callIndex,
      seq,
      observed: observation,
      committed: committed && stillCommitted,
      committedResult,
      faultApplied: decision.kind,
      worldSnapshotAfter: world.snapshot(),
    };
    // For timeout_after_commit, observationFromDecision sets committed true
    if (decision.kind === "timeout_after_commit") {
      record.committed = true;
    }
    calls.push(record);
    messages.push({
      role: "assistant",
      content: `tool_call ${name}(${JSON.stringify(args)})`,
    });
    messages.push({
      role: "system",
      content: observation.ok
        ? `tool_result ${JSON.stringify(observation.result)}`
        : `tool_error ${observation.error}`,
    });
    return observation.ok
      ? { ok: true, result: observation.result }
      : { ok: false, error: observation.error, code: observation.code };
  };

  const ctx: AgentContext = {
    task: opts.task,
    tools: world.tools.map((t) => ({
      name: t.name,
      description: t.description,
      mutating: t.mutating,
    })),
    callTool,
    history: messages,
  };

  const finalAnswer = await opts.agent(ctx);
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
