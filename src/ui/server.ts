import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { isIP, type AddressInfo } from "node:net";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { compareBaseline, createBaseline, readBaseline, writeBaseline } from "../baseline.js";
import { describeFault, expectParts, worstTrial } from "../describe.js";
import { renderReportHtml } from "../html.js";
import type { Registry } from "../registry.js";
import { replayReport } from "../replay.js";
import { readReportFile, writeHtmlReport, writeJsonReport, writeJUnitReport } from "../report.js";
import { parseTrials, runScenario } from "../runner.js";
import { loadAllScenarios, parseScenario } from "../scenarios.js";
import { VERDICTS, type RunReport, type Scenario, type Verdict } from "../types.js";
import { VERSION } from "../version.js";
import { UI_CSS } from "./styles.js";

export interface UiOptions {
  /** Interface to listen on. Default 127.0.0.1; anything else exposes the API to the network. */
  host?: string;
  /** Port; 0 picks a free one. */
  port?: number;
  /** Where saved reports are listed from and saved to. */
  outDir: string;
  /** Scenario directories, bundled first. */
  scenarioRoots: string[];
  /** Directory the editor saves scenarios to (the first configured scenarioDirs entry), if any. */
  scenarioDir?: string;
  /** Baseline file the baseline view reads and writes. */
  baselinePath: string;
  registry: Registry;
  failOn: Verdict;
}

export interface UiServer {
  url: string;
  token: string;
  close(): Promise<void>;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Lets the client tell errors apart: "exists" means the save needs overwrite: true; "token" means the page is stale. */
    readonly code?: string
  ) {
    super(message);
  }
}

/** Runs kept in memory so the UI can show them before (or without) saving them. */
const MEMORY_LIMIT = 200;
const BODY_LIMIT = 1_000_000;

/**
 * Serves the local UI and its JSON API. Every API request must carry the session token from the
 * page (header x-agentcrucible-token), and the Host header must name this server, so other web
 * pages cannot drive it. Nothing is loaded from the network.
 */
export async function startUi(opts: UiOptions): Promise<UiServer> {
  const host = opts.host ?? "127.0.0.1";
  const token = randomBytes(24).toString("hex");
  const memory = new Map<string, RunReport>();
  let nextReport = 1;
  let nextRun = 1;
  const summaryCache = new Map<string, { mtimeMs: number; summary: ReportSummary }>();

  const scenarios = () => loadAllScenarios(opts.scenarioRoots, opts.registry);
  const findScenario = (id: string) => {
    const scenario = scenarios().find((s) => s.id === id);
    if (!scenario) throw new HttpError(404, `no scenario with id ${id}`);
    return scenario;
  };
  const report = (key: string): RunReport => {
    if (key.startsWith("mem-")) {
      const found = memory.get(key);
      if (!found) throw new HttpError(404, `run ${key} is no longer in memory; save runs to keep them`);
      return found;
    }
    if (!key.startsWith("file:")) throw new HttpError(400, "report keys start with mem- or file:");
    return readReportFile(reportPath(opts.outDir, key.slice(5)));
  };
  const remember = (r: RunReport): string => {
    const key = `mem-${nextReport++}`;
    memory.set(key, r);
    if (memory.size > MEMORY_LIMIT) memory.delete(memory.keys().next().value!);
    return key;
  };

  const api: Record<string, (req: IncomingMessage, url: URL) => Promise<unknown> | unknown> = {
    "GET /api/meta": () => ({
      version: VERSION,
      cwd: process.cwd(),
      outDir: opts.outDir,
      scenarioRoots: opts.scenarioRoots,
      scenarioDir: opts.scenarioDir ?? null,
      baselinePath: opts.baselinePath,
      failOn: opts.failOn,
      verdicts: VERDICTS,
      agents: [...opts.registry.agents].map(([id, e]) => ({ id, description: e.value.description, source: e.source })),
      worlds: [...opts.registry.worlds].map(([name, e]) => {
        const world = e.value();
        return {
          name,
          description: world.description,
          source: e.source,
          tools: world.tools.map((t) => ({ name: t.name, description: t.description, mutating: t.mutating, inputSchema: t.inputSchema, outputSchema: t.outputSchema ?? null })),
          records: world.recordFields,
        };
      }),
      faults: [...opts.registry.faults].map(([kind, e]) => ({ kind, stage: e.value.stage, description: e.value.description, params: Object.keys(e.value.params?.properties ?? {}), source: e.source })),
    }),
    "GET /api/scenarios": () => scenarios().map((s) => scenarioSummary(s, opts.scenarioRoots)),
    "GET /api/scenario": (_req, url) => {
      const scenario = findScenario(param(url, "id"));
      return {
        summary: scenarioSummary(scenario, opts.scenarioRoots),
        scenario,
        expect: expectParts({ scenario } as RunReport),
        faults: scenario.faults.map(describeFault),
        text: scenario.source ? readFileSync(scenario.source, "utf8") : "",
      };
    },
    "POST /api/validate": async (req) => {
      const text = stringField((await body(req)).text, "text");
      try {
        const scenario = parseDraft(text, opts.registry);
        return { ok: true, summary: scenarioSummary(scenario, opts.scenarioRoots), expect: expectParts({ scenario } as RunReport) };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
    "POST /api/run": async (req) => {
      const input = await body(req);
      const chosen: Scenario[] =
        input.text !== undefined ? [parseDraftOr400(stringField(input.text, "text"), opts.registry)] : stringList(input.scenarioIds, "scenarioIds").map(findScenario);
      if (chosen.length === 0) throw new HttpError(400, "choose at least one scenario");
      const requested = stringList(input.agents, "agents");
      const agents = requested.length ? requested : undefined;
      for (const id of agents ?? []) if (!opts.registry.agents.has(id)) throw new HttpError(400, `unknown agent ${id}`);
      let trials: number;
      try {
        trials = parseTrials(input.trials ?? 1);
      } catch (err) {
        throw new HttpError(400, (err as Error).message);
      }
      const seed = input.seed === undefined ? undefined : stringField(input.seed, "seed");
      if (seed !== undefined && !seed.trim()) throw new HttpError(400, "seed must be a non-empty string");
      const runId = `run-${nextRun++}`;
      const results: ReportSummary[] = [];
      for (const scenario of chosen) {
        const ids = agents ?? Object.keys(scenario.expectedVerdicts);
        if (ids.length === 0) throw new HttpError(400, `${scenario.id} lists no expected agents; choose agents to run`);
        for (const agentId of ids) {
          const r = await runScenario({ scenario, agentId, trials, seed, registry: opts.registry });
          results.push({ key: remember(r), ...reportSummary(r), expected: scenario.expectedVerdicts[agentId] ?? null });
        }
      }
      return { runId, results };
    },
    "GET /api/reports": () => {
      const saved = listReportFiles(opts.outDir).map((file) => {
        const path = join(opts.outDir, file);
        const mtimeMs = statSync(path).mtimeMs;
        const cached = summaryCache.get(file);
        if (cached?.mtimeMs === mtimeMs) return cached.summary;
        let summary: ReportSummary;
        try {
          summary = { key: `file:${file}`, file, ...reportSummary(readReportFile(path)) };
        } catch (err) {
          summary = { key: `file:${file}`, file, error: (err as Error).message };
        }
        summaryCache.set(file, { mtimeMs, summary });
        return summary;
      });
      return { outDir: opts.outDir, saved, memory: [...memory].reverse().map(([key, r]) => ({ key, ...reportSummary(r) })) };
    },
    "GET /api/report": (_req, url) => report(param(url, "key")),
    "POST /api/replay": async (req) => replayReport(report(stringField((await body(req)).key, "key")), opts.registry),
    "POST /api/save": async (req) => {
      const keys = stringList((await body(req)).keys, "keys");
      if (keys.length === 0 || keys.some((k) => !k.startsWith("mem-"))) throw new HttpError(400, "choose runs from this session to save (keys mem-N)");
      const files = keys.map((key) => {
        const r = report(key);
        const dir = join(opts.outDir, encodeURIComponent(r.agentId));
        writeJsonReport(r, dir);
        writeHtmlReport(r, dir);
        writeJUnitReport(r, dir, opts.failOn);
        return relative(opts.outDir, join(dir, `${encodeURIComponent(r.scenarioId)}.report.json`)).split(sep).join("/");
      });
      return { outDir: opts.outDir, files };
    },
    "GET /api/baseline": () => {
      if (!existsSync(opts.baselinePath)) return { path: opts.baselinePath, baseline: null };
      try {
        return { path: opts.baselinePath, baseline: readBaseline(opts.baselinePath) };
      } catch (err) {
        return { path: opts.baselinePath, baseline: null, error: (err as Error).message };
      }
    },
    "POST /api/baseline/compare": async (req) => {
      const keys = stringList((await body(req)).keys, "keys");
      if (!existsSync(opts.baselinePath)) throw new HttpError(404, `baseline ${opts.baselinePath} not found; save one first`);
      return compareBaseline(readBaseline(opts.baselinePath), keys.map(report));
    },
    "POST /api/baseline/save": async (req) => {
      const keys = stringList((await body(req)).keys, "keys");
      if (keys.length === 0) throw new HttpError(400, "choose at least one report");
      const baseline = createBaseline(keys.map(report));
      writeBaseline(opts.baselinePath, baseline);
      return { path: opts.baselinePath, entries: baseline.entries.length };
    },
    "POST /api/scenario/save": async (req) => {
      const input = await body(req);
      const text = stringField(input.text, "text");
      const overwrite = input.overwrite === true;
      if (!opts.scenarioDir) throw new HttpError(400, 'no scenario directory to save to; add "scenarioDirs" to the config file');
      const scenario = parseDraftOr400(text, opts.registry);
      const path = resolve(opts.scenarioDir, ...scenario.id.split("/")) + ".yaml";
      if (!path.startsWith(resolve(opts.scenarioDir) + sep)) throw new HttpError(400, "the scenario id does not map to a file inside the scenario directory");
      const existing = scenarios().find((s) => s.id === scenario.id);
      if (existing && resolve(existing.source ?? "") !== path) throw new HttpError(409, `${scenario.id} already exists in ${existing.source}`);
      if (existsSync(path) && !overwrite) throw new HttpError(409, `${path} already exists`, "exists");
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text.endsWith("\n") ? text : `${text}\n`);
      return { path, id: scenario.id };
    },
  };

  const server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      const status = err instanceof HttpError ? err.status : 500;
      send(res, status, { error: err instanceof Error ? err.message : String(err), ...(err instanceof HttpError && err.code ? { code: err.code } : {}) });
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!hostAllowed(req.headers.host, host, (server.address() as AddressInfo).port)) throw new HttpError(403, "unexpected Host header");
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    if (req.method === "GET" && url.pathname === "/") return page(res, indexHtml(token));
    if (req.method === "GET" && url.pathname === "/app.css") return asset(res, "text/css", UI_CSS);
    if (req.method === "GET" && url.pathname === "/app.js") {
      const bundle = clientBundle();
      if (!bundle) throw new HttpError(503, "the UI bundle is missing; run npm run build");
      return asset(res, "text/javascript", readFileSync(bundle, "utf8"));
    }
    if (req.method === "GET" && url.pathname === "/report-view") {
      if (url.searchParams.get("token") !== token) throw new HttpError(403, "missing or wrong token", "token");
      const theme = url.searchParams.get("theme");
      const key = param(url, "key");
      const r = report(key);
      const reportFile = key.startsWith("file:") ? join(opts.outDir, key.slice(5)) : undefined;
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(renderReportHtml(r, { reportFile, ...(theme === "light" || theme === "dark" ? { theme } : {}) }));
      return;
    }
    const handler = api[`${req.method} ${url.pathname}`];
    if (!handler) throw new HttpError(404, `no route ${req.method} ${url.pathname}`);
    if (req.headers["x-agentcrucible-token"] !== token) throw new HttpError(403, "missing or wrong token", "token");
    send(res, 200, await handler(req, url));
  }

  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, host, () => resolveListen());
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://${host.includes(":") ? `[${host}]` : host}:${port}/`,
    token,
    close: () =>
      new Promise((done) => {
        server.close(() => done());
        server.closeAllConnections();
      }),
  };
}

/** A report in the API's lists: a summary, or the error that kept a saved file from loading. */
type ReportSummary = { key: string; file?: string; error?: string; expected?: Verdict | null } & Partial<ReturnType<typeof reportSummary>>;

/**
 * Accepts Host headers a browser sends for this server: localhost, an IP literal, or the
 * configured host, with this port. A DNS-rebinding page sends its own domain name, so it is refused.
 */
export function hostAllowed(header: string | undefined, host: string, port: number): boolean {
  const match = /^(\[[^\]]+\]|[^:]+):(\d+)$/.exec(header ?? "");
  if (!match || Number(match[2]) !== port) return false;
  const name = match[1].replace(/^\[|\]$/g, "").toLowerCase();
  return name === "localhost" || isIP(name) !== 0 || name === host.toLowerCase();
}

function reportSummary(r: RunReport) {
  const worst = worstTrial(r);
  return {
    scenarioId: r.scenarioId,
    agentId: r.agentId,
    worlds: r.worlds,
    verdict: r.aggregateVerdict,
    reason: worst?.reason ?? "",
    rule: worst?.findings[0]?.rule ?? "",
    trials: r.stats.total,
    byVerdict: Object.fromEntries(VERDICTS.filter((v) => r.stats.byVerdict[v] > 0).map((v) => [v, r.stats.byVerdict[v]])),
    seed: r.seed,
    toolVersion: r.toolVersion,
    finishedAt: r.finishedAt,
  };
}

function scenarioSummary(s: Scenario, roots: string[]) {
  return {
    id: s.id,
    worlds: s.worlds,
    tags: s.tags,
    description: s.description,
    task: s.task,
    faults: s.faults.map(describeFault),
    hasExpect: Boolean(s.expect),
    outcomes: s.expect?.outcomes.map((o) => ({ name: o.name, verdict: o.verdict })) ?? [],
    invariants: s.expect?.invariants.length ?? 0,
    answerChecks: s.expect?.answer.length ?? 0,
    budget: s.budget,
    expectedVerdicts: s.expectedVerdicts,
    source: s.source ? displayPath(s.source, roots) : null,
    bundled: s.source ? resolve(s.source).startsWith(resolve(roots[0]) + sep) : false,
  };
}

function displayPath(path: string, roots: string[]): string {
  const root = roots.find((r) => resolve(path).startsWith(resolve(r) + sep));
  return root ? relative(dirname(resolve(root)), resolve(path)).split(sep).join("/") : path;
}

/** A scenario from editor text (YAML or JSON), checked like a file. */
function parseDraft(text: string, registry: Registry): Scenario {
  if (typeof text !== "string" || !text.trim()) throw new Error("draft: the scenario is empty");
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (err) {
    throw new Error(`draft: cannot parse: ${(err as Error).message}`);
  }
  return parseScenario(raw, "draft", registry);
}

function parseDraftOr400(text: string, registry: Registry): Scenario {
  try {
    return parseDraft(text, registry);
  } catch (err) {
    throw new HttpError(400, (err as Error).message);
  }
}

/** Saved report files under `dir`, as forward-slash paths relative to it, newest first. */
function listReportFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: Array<{ path: string; mtimeMs: number }> = [];
  const walk = (current: string, depth: number) => {
    for (const name of readdirSync(current)) {
      if (name.startsWith(".")) continue;
      const path = join(current, name);
      const stat = statSync(path);
      if (stat.isDirectory() && depth < 3) walk(path, depth + 1);
      else if (stat.isFile() && name.endsWith(".report.json")) files.push({ path, mtimeMs: stat.mtimeMs });
    }
  };
  walk(dir, 0);
  return files.sort((a, b) => b.mtimeMs - a.mtimeMs).map((f) => relative(dir, f.path).split(sep).join("/"));
}

/** The absolute path of a saved report, refusing anything outside the reports directory. */
function reportPath(outDir: string, file: string): string {
  const root = resolve(outDir);
  const path = resolve(root, file);
  if (!path.startsWith(root + sep) || !path.endsWith(".report.json")) throw new HttpError(400, "not a report file in the reports directory");
  if (!existsSync(path)) throw new HttpError(404, `${file} not found`);
  return path;
}

function param(url: URL, name: string): string {
  const value = url.searchParams.get(name);
  if (!value) throw new HttpError(400, `missing ?${name}=`);
  return value;
}

function stringField(value: unknown, name: string): string {
  if (typeof value !== "string") throw new HttpError(400, `${name} must be a string`);
  return value;
}

function stringList(value: unknown, name: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) throw new HttpError(400, `${name} must be a list of strings`);
  return value;
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size <= BODY_LIMIT) chunks.push(chunk as Buffer);
  }
  if (size > BODY_LIMIT) throw new HttpError(413, "request body too large");
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "the request body must be a JSON object");
  }
}

function send(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(value));
}

function asset(res: ServerResponse, type: string, content: string): void {
  res.writeHead(200, { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(content);
}

function page(res: ServerResponse, html: string): void {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  res.end(html);
}

function indexHtml(token: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="agentcrucible-token" content="${token}"/>
<title>AgentCrucible</title>
<link rel="icon" href="data:,"/>
<link rel="stylesheet" href="/app.css"/>
</head>
<body>
<div id="app"><noscript>The AgentCrucible UI needs JavaScript.</noscript></div>
<script type="module" src="/app.js"></script>
</body>
</html>
`;
}

/** The browser bundle: next to the CLI in dist/ui, or in dist/ui of a checkout when run from source. */
function clientBundle(): string | undefined {
  const here = dirname(fileURLToPath(import.meta.url));
  return [join(here, "ui", "app.js"), join(here, "..", "..", "dist", "ui", "app.js")].find((p) => existsSync(p));
}
