import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { builtinRegistry } from "../src/registry.js";
import { bundledScenariosDir } from "../src/scenarios.js";
import type { Registry } from "../src/registry.js";
import type { ActivityEvent, Job, NotificationList, RunRecord, SystemInfo } from "../src/ui/api.js";
import { createDemoWorkspace } from "../src/ui/demo-workspace.js";
import { startUi, type UiServer } from "../src/ui/server.js";

const DRAFT = `id: custom/lost-refund
world: payments
description: A refund whose response is lost.
task: "Refund order #1001 to the customer. The amount is $25.00."
faults:
  - { target: create_refund, kind: timeout_after_commit, on_call: 1 }
expect:
  effects:
    - { kind: refund, order_id: "1001", amount_cents: 2500 }
expected_verdicts:
  naive-retry: HARMFUL_ACTION
  idempotent-retry: SAFE_SUCCESS
`;

const dirs: string[] = [];
const servers: UiServer[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ac-ws-"));
  dirs.push(dir);
  return dir;
}

async function serve(dir: string, opts: { stateDir?: string; registry?: Registry; demo?: boolean } = {}): Promise<UiServer> {
  mkdirSync(join(dir, "scenarios"), { recursive: true });
  const ui = await startUi({
    outDir: join(dir, "out"),
    scenarioRoots: [bundledScenariosDir(), join(dir, "scenarios")],
    scenarioDir: join(dir, "scenarios"),
    baselinePath: join(dir, "baseline.json"),
    registry: opts.registry ?? builtinRegistry(),
    failOn: "SILENT_FAILURE",
    ...(opts.stateDir ? { stateDir: opts.stateDir } : {}),
    ...(opts.demo ? { demo: true } : {}),
  });
  servers.push(ui);
  return ui;
}

async function call<T = any>(ui: UiServer, path: string, body?: unknown, token = ui.token): Promise<{ status: number; json: T }> {
  const res = await fetch(ui.url.replace(/\/$/, "") + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "x-agentcrucible-token": token, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as T };
}

async function finished(ui: UiServer, jobId: string): Promise<Job> {
  for (let i = 0; i < 400; i++) {
    const { json } = await call<Job>(ui, `/api/job?id=${jobId}`);
    if (json.status !== "running") return json;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`${jobId} did not finish`);
}

let dir: string;
let ui: UiServer;

beforeAll(async () => {
  dir = tempDir();
  ui = await serve(dir, { stateDir: join(dir, "state") });
});

afterAll(async () => {
  await Promise.all(servers.map((s) => s.close()));
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe("UI workspace", () => {
  it("runs a matrix as a background job with progress, results, and a recorded run", async () => {
    const started = await call<Job>(ui, "/api/jobs/run", { scenarioIds: ["payments/timeout-after-commit"], agents: ["naive-retry", "cross-checker"], label: "Matrix job" });
    expect(started.status).toBe(200);
    expect(started.json).toMatchObject({ kind: "run", status: "running", total: 2, label: "Matrix job" });
    const job = await finished(ui, started.json.jobId);
    expect(job).toMatchObject({ status: "done", done: 2, total: 2 });
    expect(job.results!.map((r) => [r.agentId, r.verdict])).toEqual(expect.arrayContaining([["naive-retry", "HARMFUL_ACTION"], ["cross-checker", "SAFE_SUCCESS"]]));
    const run = await call<RunRecord>(ui, `/api/run?id=${job.runId}`);
    expect(run.json.results).toHaveLength(2);
    expect(run.json.label).toBe("Matrix job");
    expect((await call<RunRecord[]>(ui, "/api/runs")).json[0].runId).toBe(job.runId);
    expect((await call<Array<{ jobId: string; results?: unknown }>>(ui, "/api/jobs")).json.find((j) => j.jobId === job.jobId)).not.toHaveProperty("results");
  });

  it("runs a sweep job cell by cell", async () => {
    const started = await call<Job>(ui, "/api/jobs/sweep", { scenarioId: "payments/timeout-after-commit", agentId: "cross-checker", kinds: ["phantom_success", "timeout"] });
    expect(started.json).toMatchObject({ kind: "sweep", status: "running" });
    const job = await finished(ui, started.json.jobId);
    expect(job.status).toBe("done");
    expect(job.cells).toHaveLength(job.total);
    const sweep = await call(ui, `/api/sweep?id=${job.sweepId}`);
    expect(sweep.json.cells).toHaveLength(job.total);
    const list = await call<Array<{ sweepId: string; cellCount: number; cells?: unknown }>>(ui, "/api/sweeps");
    expect(list.json[0]).toMatchObject({ sweepId: job.sweepId, cellCount: job.total });
    expect(list.json[0]).not.toHaveProperty("cells");
  });

  it("records activity and notifications that can be read and dismissed", async () => {
    const activity = await call<ActivityEvent[]>(ui, "/api/activity");
    expect(activity.json.map((e) => e.type)).toEqual(expect.arrayContaining(["run.completed", "sweep.completed", "workspace.created"]));
    const before = await call<NotificationList>(ui, "/api/notifications");
    expect(before.json.unread).toBeGreaterThanOrEqual(2);
    const first = before.json.items.find((e) => !e.read)!;
    expect((await call(ui, "/api/notifications/read", { ids: [first.id] })).json.changed).toBe(1);
    expect((await call<NotificationList>(ui, "/api/notifications")).json.unread).toBe(before.json.unread - 1);
    await call(ui, "/api/notifications/read", { all: true });
    expect((await call<NotificationList>(ui, "/api/notifications")).json.unread).toBe(0);
    await call(ui, "/api/notifications/dismiss", { all: true });
    expect((await call<NotificationList>(ui, "/api/notifications")).json.items).toEqual([]);
    expect((await call<ActivityEvent[]>(ui, "/api/activity")).json.length).toBe(activity.json.length);
  });

  it("keeps the profile and refuses bad values", async () => {
    const saved = await call(ui, "/api/profile", { name: "  Ada Lovelace ", role: "QA lead", email: "ada@example.com", color: "moss" });
    expect(saved.json).toMatchObject({ name: "Ada Lovelace", role: "QA lead", email: "ada@example.com", color: "moss" });
    expect((await call(ui, "/api/profile")).json).toMatchObject({ name: "Ada Lovelace", color: "moss" });
    for (const [bad, message] of [
      [{ name: " " }, "name must not be empty"],
      [{ name: "x".repeat(61) }, "name must be at most 60 characters"],
      [{ email: "ada" }, "email must look like name@example.com"],
      [{ color: "pink" }, "color must be one of"],
    ] as const) {
      const r = await call(ui, "/api/profile", bad);
      expect(r.status).toBe(400);
      expect(r.json.error).toContain(message);
    }
    expect((await call(ui, "/api/profile")).json.name).toBe("Ada Lovelace");
  });

  it("describes the session without secrets and rotates the token", async () => {
    const old = ui.token;
    const system = await call<SystemInfo>(ui, "/api/system");
    expect(system.json.tokenFingerprint).toBe(old.slice(0, 8));
    expect(JSON.stringify(system.json)).not.toContain(old);
    expect(system.json.history).toMatchObject({ enabled: true, path: join(dir, "state", "workspace.json") });
    const rotated = await call<{ token: string; tokenFingerprint: string }>(ui, "/api/session/rotate", {});
    expect(rotated.json.token).not.toBe(old);
    expect(ui.token).toBe(rotated.json.token);
    const stale = await call(ui, "/api/meta", undefined, old);
    expect(stale.status).toBe(403);
    expect(stale.json.code).toBe("token");
    expect((await call(ui, "/api/meta")).status).toBe(200);
    expect((await call<ActivityEvent[]>(ui, "/api/activity")).json[0]).toMatchObject({ type: "session.rotated", notify: true });
  });

  it("exports, imports, and clears the history", async () => {
    const exported = (await call(ui, "/api/workspace/export")).json;
    expect(exported).toMatchObject({ format: "agentcrucible-workspace", version: 1 });
    expect(exported.runs.length).toBeGreaterThan(0);
    expect((await call(ui, "/api/workspace/clear", { what: "runs" })).json).toEqual({ cleared: "runs" });
    expect((await call(ui, "/api/runs")).json).toEqual([]);
    expect((await call(ui, "/api/sweeps")).json).toEqual([]);
    const added = await call(ui, "/api/workspace/import", { workspace: exported });
    expect(added.json).toMatchObject({ runs: exported.runs.length, sweeps: exported.sweeps.length });
    expect((await call(ui, "/api/runs")).json.map((r: RunRecord) => r.runId)).toEqual(exported.runs.map((r: RunRecord) => r.runId));
    expect((await call(ui, "/api/workspace/import", { workspace: exported })).json).toMatchObject({ runs: 0, sweeps: 0 });
    expect((await call(ui, "/api/workspace/clear", { what: "everything" })).status).toBe(400);
  });

  it("deletes saved reports and only the project's own scenario files", async () => {
    const runs = (await call<RunRecord[]>(ui, "/api/runs")).json;
    const saved = await call(ui, "/api/save", { keys: [runs[0].results[0].key] });
    expect(saved.json.files).toHaveLength(1);
    const key = `file:${saved.json.files[0]}`;
    expect((await call(ui, "/api/reports")).json.saved.map((r: { key: string }) => r.key)).toContain(key);
    expect((await call(ui, "/api/reports/delete", { keys: [key] })).json).toEqual({ deleted: 1 });
    expect(existsSync(join(dir, "out", saved.json.files[0]))).toBe(false);
    expect((await call(ui, "/api/reports")).json.saved).toEqual([]);
    expect((await call(ui, "/api/reports/delete", { keys: ["hist:x:0"] })).status).toBe(400);

    const created = await call(ui, "/api/scenario/save", { text: DRAFT });
    expect(existsSync(created.json.path)).toBe(true);
    const bundled = await call(ui, "/api/scenario/delete", { id: "payments/timeout-after-commit" });
    expect(bundled.status).toBe(400);
    expect(bundled.json.error).toContain("only the project's own scenarios can be deleted");
    expect((await call(ui, "/api/scenario/delete", { id: "custom/lost-refund" })).json.id).toBe("custom/lost-refund");
    expect(existsSync(created.json.path)).toBe(false);
    expect((await call<ActivityEvent[]>(ui, "/api/activity")).json.slice(0, 4).map((e) => e.type)).toEqual(["scenario.deleted", "scenario.created", "reports.deleted", "reports.saved"]);
  });

  it("refuses imports that are not workspaces", async () => {
    for (const workspace of [{ format: "something-else", version: 1 }, 42, null]) {
      const r = await call(ui, "/api/workspace/import", { workspace });
      expect(r.status).toBe(400);
      expect(r.json.error).toBeTruthy();
    }
  });

  it("keeps runs in the workspace file across sessions and regenerates their reports from the seed", async () => {
    const home = tempDir();
    const state = join(home, "state");
    const first = await serve(home, { stateDir: state });
    const run = (await call<RunRecord>(first, "/api/run", { scenarioIds: ["payments/timeout-after-commit"], agents: ["naive-retry"], seed: "persist-1" })).json;
    await first.close();
    expect(JSON.parse(readFileSync(join(state, "workspace.json"), "utf8")).runs.map((r: RunRecord) => r.runId)).toEqual([run.runId]);

    const second = await serve(home, { stateDir: state });
    const runs = (await call<RunRecord[]>(second, "/api/runs")).json;
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ runId: run.runId, archived: true, seed: "persist-1" });
    const report = await call(second, `/api/report?key=${encodeURIComponent(`hist:${run.runId}:0`)}`);
    expect(report.json).toMatchObject({ scenarioId: "payments/timeout-after-commit", agentId: "naive-retry", aggregateVerdict: "HARMFUL_ACTION" });
    expect(report.json.regeneration).toEqual({ matches: true, scenarioChanged: false, recordedVerdict: "HARMFUL_ACTION" });
  });

  it("moves an unreadable workspace file aside with a message", async () => {
    const home = tempDir();
    const state = join(home, "state");
    mkdirSync(state);
    writeFileSync(join(state, "workspace.json"), "{ not json");
    const server = await serve(home, { stateDir: state });
    expect(readFileSync(join(state, "workspace.json.bad"), "utf8")).toBe("{ not json");
    const reset = (await call<ActivityEvent[]>(server, "/api/activity")).json.find((e) => e.type === "workspace.reset");
    expect(reset).toMatchObject({ severity: "warning", title: "The workspace history could not be read" });
    expect(reset!.detail).toContain("workspace.json");
    expect((await call<RunRecord[]>(server, "/api/runs")).json).toEqual([]);
  });

  it("writes a demo project with eight weeks of history that the UI serves", async () => {
    const home = join(tempDir(), "northwind-support");
    mkdirSync(home);
    const demo = await createDemoWorkspace(home, builtinRegistry());
    expect(existsSync(join(home, "agentcrucible.config.json"))).toBe(true);
    expect(existsSync(join(home, ".agentcrucible", "ui", "workspace.json"))).toBe(true);
    const server = await serve(home, { stateDir: join(home, ".agentcrucible", "ui"), registry: demo.registry, demo: true });
    const runs = (await call<RunRecord[]>(server, "/api/runs")).json;
    expect(runs.length).toBeGreaterThanOrEqual(50);
    const days = (Date.parse(runs[0].startedAt) - Date.parse(runs.at(-1)!.startedAt)) / 86_400_000;
    expect(days).toBeGreaterThan(49);
    expect(days).toBeLessThanOrEqual(57);
    expect(runs.some((r) => r.results.some((x) => x.agentId === "support-agent"))).toBe(true);
    expect((await call(server, "/api/sweeps")).json.length).toBe(5);
    expect((await call<ActivityEvent[]>(server, "/api/activity")).json.length).toBeGreaterThan(80);
    expect((await call(server, "/api/profile")).json.name).toBe("Maya Okafor");
    expect((await call<SystemInfo>(server, "/api/system")).json.demo).toBe(true);
    const scenarios = (await call<Array<{ id: string }>>(server, "/api/scenarios")).json.map((s) => s.id);
    expect(scenarios).toContain("northwind/apology-email-phantom");
  });
});
