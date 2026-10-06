/**
 * What each job started in this tab asked for. A job reports its results as they arrive; the plan
 * lets the live views lay out the results still to come and start the same job again.
 */
import type { RunRequest } from "../jobs.js";

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
