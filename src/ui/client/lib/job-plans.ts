/**
 * What each job started in this tab asked for. A job reports its results as they arrive; the plan
 * lets the live views lay out the results still to come and start the same job again.
 */
import type { Job, ScenarioSummary } from "../../api.js";
import { startRunJob, startSweepJob, type RunRequest } from "../jobs.js";
import { plannedPairs } from "./runs.js";

export interface SweepRequest {
  scenarioId: string;
  agentId: string;
  kinds: string[];
  steps: number;
  trials: number;
  seed?: string;
}

export interface RunPlan {
  request: RunRequest;
  /** The scenario and agent pairs in the order the server runs them. */
  pairs: Array<{ scenarioId: string; agentId: string }>;
}

export const runPlans = new Map<string, RunPlan>();
export const sweepPlans = new Map<string, SweepRequest>();

/** Starts a matrix run in the background and remembers its plan for the live view. */
export async function startPlannedRun(request: RunRequest, scenarios: ScenarioSummary[]): Promise<Job> {
  const chosen = scenarios.filter((s) => request.scenarioIds?.includes(s.id));
  const job = await startRunJob(request);
  runPlans.set(job.jobId, { request, pairs: plannedPairs({ scenarios: chosen, agents: request.agents.length ? request.agents : null }) });
  return job;
}

/** Starts a sweep in the background and remembers its request for the live view. */
export async function startPlannedSweep(request: SweepRequest): Promise<Job> {
  const job = await startSweepJob(request);
  sweepPlans.set(job.jobId, request);
  return job;
}
