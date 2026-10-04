import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { builtinRegistry } from "../src/registry.js";
import { bundledScenariosDir } from "../src/scenarios.js";
import { hostAllowed, startUi, type UiServer } from "../src/ui/server.js";

const root = fileURLToPath(new URL("..", import.meta.url));
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

let dir: string;
let ui: UiServer;
let url: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "ac-ui-"));
  mkdirSync(join(dir, "scenarios"));
  ui = await startUi({
    outDir: join(dir, "out"),
    scenarioRoots: [bundledScenariosDir(), join(dir, "scenarios")],
    scenarioDir: join(dir, "scenarios"),
    baselinePath: join(dir, "baseline.json"),
    registry: builtinRegistry(),
    failOn: "SILENT_FAILURE",
  });
  url = ui.url.replace(/\/$/, "");
});

afterAll(async () => {
  await ui?.close();
  rmSync(dir, { recursive: true, force: true });
});

async function api(path: string, body?: unknown, token = ui.token) {
  const res = await fetch(url + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "x-agentcrucible-token": token, "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: res.status, headers: res.headers, json: await res.json() };
}

/** A raw request, so the Host header can be anything. */
function rawGet(path: string, host: string): Promise<number> {
  const { port } = new URL(url);
  return new Promise((resolve, reject) => {
    request({ host: "127.0.0.1", port, path, headers: { host, "x-agentcrucible-token": ui.token } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    })
      .on("error", reject)
      .end();
  });
}

describe("UI server security", () => {
  it("listens on 127.0.0.1 and serves the page with its token and a strict content policy", async () => {
    expect(ui.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    const res = await fetch(url + "/");
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain(`<meta name="agentcrucible-token" content="${ui.token}"/>`);
    expect(html).not.toMatch(/https?:\/\/(?!127)/);
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(res.headers.get("content-security-policy")).toContain("object-src 'none'");
  });

  it("refuses API calls without the session token", async () => {
    expect((await api("/api/meta", undefined, "")).status).toBe(403);
    expect((await api("/api/meta", undefined, "0".repeat(48))).status).toBe(403);
    expect((await api("/api/run", { scenarioIds: ["payments/rate-limit"] }, "")).status).toBe(403);
    expect((await fetch(`${url}/report-view?key=mem-1`)).status).toBe(403);
  });

  it("refuses Host headers that name another site, as a DNS-rebinding page would send", async () => {
    const { port } = new URL(url);
    expect(await rawGet("/api/meta", `127.0.0.1:${port}`)).toBe(200);
    expect(await rawGet("/api/meta", `localhost:${port}`)).toBe(200);
    expect(await rawGet("/api/meta", `evil.example:${port}`)).toBe(403);
    expect(await rawGet("/", `evil.example:${port}`)).toBe(403);
    expect(await rawGet("/api/meta", `127.0.0.1:${Number(port) + 1}`)).toBe(403);
  });

  it.each([
    ["localhost:80", "127.0.0.1", 80, true],
    ["127.0.0.1:80", "127.0.0.1", 80, true],
    ["[::1]:80", "::1", 80, true],
    ["192.168.1.20:80", "0.0.0.0", 80, true],
    ["devbox:80", "devbox", 80, true],
    ["devbox:80", "127.0.0.1", 80, false],
    ["localhost.evil.example:80", "127.0.0.1", 80, false],
    ["localhost:81", "127.0.0.1", 80, false],
    ["localhost", "127.0.0.1", 80, false],
    [undefined, "127.0.0.1", 80, false],
  ])("hostAllowed(%s) with host %s is %s", (header, host, port, ok) => {
    expect(hostAllowed(header, host, port)).toBe(ok);
  });

  it("keeps report reads inside the reports directory", async () => {
    for (const key of ["file:../baseline.json", "file:../../etc/passwd.report.json", "file:/etc/x.report.json", "other"]) {
      expect((await api(`/api/report?key=${encodeURIComponent(key)}`)).status).toBe(400);
    }
    expect((await api(`/api/report?key=${encodeURIComponent("file:missing.report.json")}`)).status).toBe(404);
  });

  it("rejects malformed and oversized bodies", async () => {
    expect((await api("/api/validate", "not json")).status).toBe(400);
    expect((await api("/api/validate", "[1]")).status).toBe(400);
    expect((await api("/api/validate", { text: "x".repeat(1_100_000) })).status).toBe(413);
    expect((await api("/api/nothing")).status).toBe(404);
  });
});

describe("UI API", () => {
  it("describes agents, worlds, and fault kinds", async () => {
    const { status, json } = await api("/api/meta");
    expect(status).toBe(200);
    expect(json.agents.map((a: { id: string }) => a.id)).toContain("cross-checker");
    expect(json.worlds.find((w: { name: string }) => w.name === "payments").tools.map((t: { name: string }) => t.name)).toContain("create_refund");
    expect(json.faults.map((f: { kind: string }) => f.kind)).toContain("timeout_after_commit");
    expect(json.scenarioDir).toBe(join(dir, "scenarios"));
  });

  it("lists scenarios and shows one with its source text", async () => {
    const list = await api("/api/scenarios");
    const flagship = list.json.find((s: { id: string }) => s.id === "payments/timeout-after-commit");
    expect(flagship).toMatchObject({ worlds: ["payments"], bundled: true, source: "scenarios/payments/timeout-after-commit.yaml", expectedVerdicts: { "naive-retry": "HARMFUL_ACTION" } });
    const one = await api("/api/scenario?id=payments/timeout-after-commit");
    expect(one.json.text).toContain("id: payments/timeout-after-commit");
    expect(one.json.expect).toEqual(['refund with order_id="4471" amount_cents=8400']);
    expect((await api("/api/scenario?id=nope")).status).toBe(404);
  });

  it("validates drafts with the rules files use", async () => {
    expect((await api("/api/validate", { text: DRAFT })).json).toMatchObject({ ok: true, summary: { id: "custom/lost-refund" } });
    const bad = await api("/api/validate", { text: DRAFT.replace("timeout_after_commit", "timeout_after_comit") });
    expect(bad.json.ok).toBe(false);
    expect(bad.json.error).toMatch(/^draft: faults\[0\]\.kind must be one of/);
    expect((await api("/api/validate", { text: "id: [" })).json.error).toMatch(/^draft: cannot parse/);
  });

  it("runs scenarios and drafts, saves them, and replays saved reports", async () => {
    const run = await api("/api/run", { scenarioIds: ["payments/timeout-after-commit"], trials: 2 });
    expect(run.status).toBe(200);
    expect(run.json.results.map((r: { agentId: string; verdict: string; expected: string }) => [r.agentId, r.verdict, r.expected])).toEqual([
      ["naive-retry", "HARMFUL_ACTION", "HARMFUL_ACTION"],
      ["honest-stop", "DEGRADED", "DEGRADED"],
      ["idempotent-retry", "SAFE_SUCCESS", "SAFE_SUCCESS"],
      ["cross-checker", "SAFE_SUCCESS", "SAFE_SUCCESS"],
      ["liar", "SILENT_FAILURE", "SILENT_FAILURE"],
    ]);
    const naive = run.json.results[0];
    expect(naive).toMatchObject({ trials: 2, rule: "expect.duplicate_effect", seed: "seed-payments/timeout-after-commit" });

    const draft = await api("/api/run", { text: DRAFT, agents: ["naive-retry", "cross-checker"] });
    expect(draft.json.results.map((r: { verdict: string; expected: string | null }) => [r.verdict, r.expected])).toEqual([
      ["HARMFUL_ACTION", "HARMFUL_ACTION"],
      ["SAFE_SUCCESS", null],
    ]);
    expect((await api("/api/run", { scenarioIds: ["payments/rate-limit"], agents: ["nobody"] })).status).toBe(400);
    expect((await api("/api/run", { scenarioIds: ["payments/rate-limit"], trials: 0 })).status).toBe(400);
    expect((await api("/api/run", { scenarioIds: [] })).status).toBe(400);

    const page = await fetch(`${url}/report-view?key=${naive.key}&token=${ui.token}&theme=dark`);
    expect(page.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(await page.text()).toContain('<html lang="en" data-theme="dark">');

    const saved = await api("/api/save", { keys: [naive.key] });
    expect(saved.json.files).toEqual(["naive-retry/payments%2Ftimeout-after-commit.report.json"]);
    for (const ext of [".report.json", ".report.html", ".junit.xml"]) expect(existsSync(join(dir, "out", "naive-retry", `payments%2Ftimeout-after-commit${ext}`))).toBe(true);
    expect((await api("/api/save", { keys: ["file:naive-retry/payments%2Ftimeout-after-commit.report.json"] })).status).toBe(400);

    const reports = await api("/api/reports");
    const file = reports.json.saved.find((r: { file: string }) => r.file === "naive-retry/payments%2Ftimeout-after-commit.report.json");
    expect(file).toMatchObject({ key: "file:naive-retry/payments%2Ftimeout-after-commit.report.json", verdict: "HARMFUL_ACTION", agentId: "naive-retry" });
    expect(reports.json.memory.length).toBe(7);

    const fromFile = await fetch(`${url}/report-view?key=${encodeURIComponent(file.key)}&token=${ui.token}`);
    expect(await fromFile.text()).toContain(`agentcrucible replay ${join(dir, "out", "naive-retry/payments%2Ftimeout-after-commit.report.json")}`);
    const replay = await api("/api/replay", { key: file.key });
    expect(replay.json).toMatchObject({ reproduced: true, trials: [{ reproduced: true }, { reproduced: true }] });
    expect((await api(`/api/report?key=${encodeURIComponent(file.key)}`)).json.aggregateVerdict).toBe("HARMFUL_ACTION");
  });

  it("saves a baseline from reports and compares later runs with it", async () => {
    expect((await api("/api/baseline")).json).toEqual({ path: join(dir, "baseline.json"), baseline: null });
    expect((await api("/api/baseline/compare", { keys: [] })).status).toBe(404);
    const first = await api("/api/run", { scenarioIds: ["workflows/notification-outage"], agents: ["workflow-reconcile", "workflow-careful"] });
    const keys = first.json.results.map((r: { key: string }) => r.key);
    expect((await api("/api/baseline/save", { keys })).json).toEqual({ path: join(dir, "baseline.json"), entries: 2 });
    expect(JSON.parse(readFileSync(join(dir, "baseline.json"), "utf8")).entries).toHaveLength(2);
    expect((await api("/api/baseline")).json.baseline.entries).toHaveLength(2);
    const again = await api("/api/run", { scenarioIds: ["workflows/notification-outage"], agents: ["workflow-reconcile", "workflow-naive"] });
    const comparison = await api("/api/baseline/compare", { keys: again.json.results.map((r: { key: string }) => r.key) });
    expect(comparison.json).toMatchObject({ unchanged: 1, regressions: [], notRun: [], added: [{ agent: "workflow-naive", verdict: "HARMFUL_ACTION" }] });
  });

  it("saves drafts as scenario files without clobbering other files", async () => {
    const path = join(dir, "scenarios", "custom", "lost-refund.yaml");
    expect((await api("/api/scenario/save", { text: DRAFT })).json).toEqual({ path, id: "custom/lost-refund" });
    expect(readFileSync(path, "utf8")).toBe(DRAFT);
    expect((await api("/api/scenarios")).json.map((s: { id: string }) => s.id)).toContain("custom/lost-refund");
    const again = await api("/api/scenario/save", { text: DRAFT });
    expect(again.status).toBe(409);
    expect(again.json.code).toBe("exists");
    expect((await api("/api/scenario/save", { text: DRAFT.replace("A refund", "One refund"), overwrite: true })).status).toBe(200);
    expect(readFileSync(path, "utf8")).toContain("One refund");
    const clash = await api("/api/scenario/save", { text: DRAFT.replace("custom/lost-refund", "payments/rate-limit"), overwrite: true });
    expect(clash.status).toBe(409);
    expect(clash.json.error).toContain("payments/rate-limit already exists in");
    expect((await api("/api/scenario/save", { text: "id: x" })).status).toBe(400);
  });

  it("refuses to save scenarios when no scenario directory is configured", async () => {
    const other = await startUi({ outDir: join(dir, "out2"), scenarioRoots: [bundledScenariosDir()], baselinePath: join(dir, "b2.json"), registry: builtinRegistry(), failOn: "SILENT_FAILURE" });
    try {
      const res = await fetch(`${other.url}api/scenario/save`, { method: "POST", headers: { "x-agentcrucible-token": other.token }, body: JSON.stringify({ text: DRAFT }) });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain('add "scenarioDirs" to the config file');
    } finally {
      await other.close();
    }
  });
});

describe("agentcrucible ui", () => {
  it("prints its address, serves the API, and stops cleanly on SIGINT", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "ac-ui-cli-"));
    const loader = pathToFileURL(join(root, "node_modules", "tsx", "dist", "loader.mjs")).href;
    writeFileSync(join(cwd, ".agentcrucible.json"), JSON.stringify({ out: "reports" }));
    const child = spawn(process.execPath, ["--import", loader, join(root, "src", "cli.ts"), "ui", "--port", "0"], { cwd, env: { ...process.env, NO_COLOR: "1" } });
    try {
      let stdout = "";
      const address = await new Promise<string>((resolve, reject) => {
        child.stdout.on("data", (chunk) => {
          stdout += chunk;
          const match = /UI: (http:\/\/127\.0\.0\.1:\d+\/)/.exec(stdout);
          if (match && stdout.includes("Press Ctrl+C to stop.")) resolve(match[1]);
        });
        child.on("exit", (code) => reject(new Error(`ui exited with ${code}: ${stdout}`)));
      });
      expect(stdout).toContain("reports:   reports");
      expect(stdout).toContain('add "scenarioDirs" to the config file to save from the editor');
      const html = await (await fetch(address)).text();
      const token = /content="([0-9a-f]{48})"/.exec(html)![1];
      const meta = await (await fetch(`${address}api/meta`, { headers: { "x-agentcrucible-token": token } })).json();
      expect(meta.outDir).toBe("reports");
      const exit = new Promise<number | null>((resolve) => child.on("exit", (code) => resolve(code)));
      child.kill("SIGINT");
      expect(await exit).toBe(0);
    } finally {
      child.kill();
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
