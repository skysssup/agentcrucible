export type * from "./types.js";
export { VERDICTS, VERDICT_SEVERITY, FAULT_KINDS, REPORT_VERSION } from "./types.js";
export { runHarness, createToolCaller, DEFAULT_CALL_LIMIT } from "./harness.js";
export type { AgentAnswer, AgentContext, ScriptedAgent, ToolCallResult, HarnessOptions, CallerOptions } from "./harness.js";
export { runScenario, runMatrix, parseTrials, parseTimeout, parseConcurrency, MAX_TRIALS, MAX_CONCURRENCY } from "./runner.js";
export type { RunOptions, MatrixOptions } from "./runner.js";
export { gradeTrial } from "./grader.js";
export type { GradingSpec } from "./grader.js";
export { evaluatePolicies } from "./policy.js";
export { readAnswer, statedBoolean, extractOutput } from "./answer.js";
export type { AnswerReading, StatedBoolean, ExtractedOutput } from "./answer.js";
export { checkAnswer } from "./assertions.js";
export { checkInvariants, chooseOutcome, describePattern, resolveRef } from "./expect.js";
export { validate, schemaProblems, sampleValue } from "./schema.js";
export type { JsonSchema, JsonType } from "./schema.js";
export { loadAllScenarios, loadScenarioFile, findScenarios, parseScenario, bundledScenariosDir, SCENARIO_ID_PATTERN } from "./scenarios.js";
export { composeWorlds, effectsBetween, traceEffects } from "./worlds/index.js";
export type { World, WorldFactory, WorldTool, WorldRecord, FieldType } from "./worlds/index.js";
export { BUILTIN_FAULTS, FAULT_STAGES, describeSchedule } from "./faults.js";
export type { FaultDefinition, FaultInput, FaultStage } from "./faults.js";
export {
  builtinRegistry,
  extendRegistry,
  createWorlds,
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
export { formatReport, formatTrialDetail, printReport, readReportFile, writeHtmlReport, writeJsonReport, writeJUnitReport, writeRunIndex } from "./report.js";
export { renderRunSummary, writeRunSummary } from "./summary.js";
export type { SummaryOptions } from "./summary.js";
export { loadConfig, loadConfigFile, findConfigPath, parseConfigText, CONFIG_FILES } from "./config.js";
export type { CrucibleConfig } from "./config.js";
export { VERSION } from "./version.js";
export { runSweep, sweepKinds, summarizeSweep, scoreCells, worstOf, formatSweep, sweepMarkdown, parseSweepSteps, DEFAULT_SWEEP_STEPS, MAX_SWEEP_STEPS } from "./sweep.js";
export type { SweepOptions, SweepResult, SweepSummary, SweepCell, SweepStep, SweepKind, SweepScore } from "./sweep.js";
export { computeCoverage, formatCoverage } from "./coverage.js";
export type { Coverage, WorldCoverage, ToolCoverage, FaultKindCoverage, AgentCoverage, CoverageCell } from "./coverage.js";
export { createModelAgent, registerModelAgent, parseModelAgentId, parseMaxSteps, requestKey, cassettePath, MODEL_PROVIDERS, DEFAULT_SYSTEM_PROMPT, DEFAULT_MAX_STEPS, MAX_MODEL_STEPS } from "./models.js";
export type { ModelAgentSpec, ModelAgentOptions, ModelProvider } from "./models.js";
export { describeUsage } from "./describe.js";
