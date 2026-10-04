export type * from "./types.js";
export { VERDICTS, VERDICT_SEVERITY, FAULT_KINDS, REPORT_VERSION } from "./types.js";
export { runHarness, createToolCaller, DEFAULT_CALL_LIMIT } from "./harness.js";
export type { AgentAnswer, AgentContext, ScriptedAgent, ToolCallResult, HarnessOptions, CallerOptions } from "./harness.js";
export { runScenario, parseTrials, MAX_TRIALS } from "./runner.js";
export type { RunOptions } from "./runner.js";
export { gradeTrial } from "./grader.js";
export type { GradingSpec } from "./grader.js";
export { evaluatePolicies } from "./policy.js";
export { readAnswer, statedBoolean, extractOutput } from "./answer.js";
export type { AnswerReading, StatedBoolean, ExtractedOutput } from "./answer.js";
export { checkAnswer } from "./assertions.js";
export { checkInvariants, chooseOutcome, describePattern, resolveRef } from "./expect.js";
export { validate, schemaProblems } from "./schema.js";
export type { JsonSchema, JsonType } from "./schema.js";
export { loadAllScenarios, loadScenarioFile, findScenarios, parseScenario, bundledScenariosDir, SCENARIO_ID_PATTERN } from "./scenarios.js";
export { composeWorlds, effectsBetween, traceEffects } from "./worlds/index.js";
export type { World, WorldFactory, WorldTool, WorldRecord, FieldType } from "./worlds/index.js";
export { BUILTIN_FAULTS, describeSchedule } from "./faults.js";
export type { FaultDefinition, FaultInput } from "./faults.js";
export {
  builtinRegistry,
  extendRegistry,
  createWorlds,
  getAgent,
  loadExtension,
  loadAgentModule,
  worldProblems,
  faultProblems,
} from "./registry.js";
export type { Registry, Extension, AgentDefinition } from "./registry.js";
export { BUILTIN_AGENTS } from "./fixtures/agents.js";
export { replayReport } from "./replay.js";
export type { ReplayResult, ReplayedTrial, ReplayDivergence } from "./replay.js";
export { createBaseline, compareBaseline, readBaseline, writeBaseline, baselineEntry } from "./baseline.js";
export type { Baseline, BaselineEntry, BaselineComparison } from "./baseline.js";
export { computeStats, aggregateVerdict, wilsonLower } from "./stats.js";
export { resolveFindings, worseVerdict, isCritical, atLeast } from "./verdict.js";
export { formatReport, formatTrialDetail, printReport, readReportFile, writeHtmlReport, writeJsonReport, writeJUnitReport } from "./report.js";
export { loadConfig, loadConfigFile, findConfigPath, parseConfigText, CONFIG_FILES } from "./config.js";
export type { CrucibleConfig } from "./config.js";
export { VERSION } from "./version.js";
