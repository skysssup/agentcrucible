/**
 * The browser side of `agentcrucible ui`: a hash router over the views in views.ts and the JSON
 * API in server.ts. Every request carries the session token the server put in the page.
 */
import type { Baseline } from "../../baseline.js";
import { esc } from "../../html.js";
import type { RunReport } from "../../types.js";
import type { RunRecord } from "../server.js";
import { errorLine, gutterLines, highlightYaml } from "./editor.js";
import { icon } from "./icons.js";
import { closePalette, openPalette, paletteOpen, type PaletteItem } from "./palette.js";
import {
  agentsView,
  baselineView,
  catalogView,
  crumbs,
  demoView,
  draftResults,
  editorView,
  errorView,
  filterScenarios,
  href,
  overviewView,
  plural,
  projectName,
  reportActions,
  reportList,
  reportsView,
  reportView,
  ROUTES,
  runCommands,
  runCsv,
  runMarkdown,
  runsView,
  runView,
  scenarioList,
  scenariosView,
  scenarioView,
  selectionNote,
  shell,
  shortcutsView,
  TEMPLATES,
  uniqueResults,
  validationPanel,
  type Comparison,
  type DemoState,
  type EditorState,
  type Meta,
  type ReplayView,
  type ReportSummary,
  type RunState,
  type ScenarioDetail,
  type ScenarioSummary,
  type Theme,
  type Validation,
} from "./views.js";

const token = document.querySelector<HTMLMetaElement>('meta[name="agentcrucible-token"]')?.content ?? "";
const app = document.getElementById("app")!;
const DRAFT_KEY = "agentcrucible-draft";
const THEME_KEY = "agentcrucible-theme";
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const state = {
  meta: undefined as unknown as Meta,
  scenarios: undefined as ScenarioSummary[] | undefined,
  scenarioError: undefined as string | undefined,
  saved: [] as ReportSummary[],
  memory: [] as ReportSummary[],
  runs: undefined as RunState[] | undefined,
  scenarioFilter: { q: "", tag: "", world: "" },
  selectedScenarios: new Set<string>(),
  reportFilter: { q: "", verdict: "" },
  selectedReports: new Set<string>(),
  comparison: undefined as Comparison | undefined,
  replays: new Map<string, ReplayView>(),
  /** Full reports from this session; their keys never change, so they are fetched once. */
  reports: new Map<string, RunReport>(),
  detail: undefined as ScenarioDetail | undefined,
  demo: { status: "idle", results: [], reports: {} } as DemoState,
  editor: { text: localStorage.getItem(DRAFT_KEY) ?? TEMPLATES.single } as EditorState,
  /** The scenario id the editor text was loaded from, if it was. */
  editorSource: undefined as string | undefined,
  /** True once the user picks agents for the draft run, so validation stops preselecting them. */
  draftAgentsTouched: false,
  theme: (localStorage.getItem(THEME_KEY) as Theme | null) ?? "system",
};

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
  }
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "x-agentcrucible-token": token, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (res.status === 403 && data.code === "token") throw new ApiError("This page belongs to an earlier agentcrucible ui session. Reload the page to reconnect.", 403, "token");
  if (!res.ok) throw new ApiError(data.error ?? `HTTP ${res.status}`, res.status, data.code);
  return data as T;
}

function parseHash(): { route: string; arg?: string } {
  const [route, ...rest] = location.hash.replace(/^#\/?/, "").split("/");
  return { route, ...(rest.length && rest.join("/") ? { arg: decodeURIComponent(rest.join("/")) } : {}) };
}

/** The sidebar entry a detail page belongs to. */
const NAV: Record<string, string> = { scenario: "scenarios", run: "runs", report: "reports" };
let renders = 0;
let shownHash = "";

function view(): HTMLElement {
  return document.getElementById("view")!;
}

/** The sheet that scrolls the page content. */
function scroller(): HTMLElement {
  return document.getElementById("main")!;
}

async function render(): Promise<void> {
  const ticket = ++renders;
  const { route, arg } = parseHash();
  const nav = NAV[route] ?? route;
  setActiveNav(nav);
  closeMenu();
  const bar = setTimeout(() => document.getElementById("progress")?.classList.add("on"), 120);
  let html: string;
  try {
    html = await viewFor(route, arg);
  } catch (err) {
    html = errorView((err as Error).message, err instanceof ApiError && err.code === "token");
  } finally {
    clearTimeout(bar);
  }
  if (ticket !== renders) return;
  document.getElementById("progress")?.classList.remove("on");
  view().innerHTML = html;
  const trail = crumbsFor(route, arg);
  document.getElementById("crumbs")!.innerHTML = crumbs(trail);
  document.title = `${trail[trail.length - 1][0]} · AgentCrucible`;
  if (location.hash !== shownHash) {
    scroller().scrollTo(0, 0);
    if (!paletteOpen()) view().focus({ preventScroll: true });
  }
  shownHash = location.hash;
  updateCounts();
  if (route === "editor") {
    setupEditor();
    if (!state.editor.validation) void validate();
  }
}

/** Project, page, and the item a detail page shows. */
function crumbsFor(route: string, arg?: string): Array<[string, string?]> {
  const page = ROUTES.find((r) => r.route === (NAV[route] ?? route));
  const project: [string, string] = [projectName(state.meta), "#/"];
  if (!page) return [project, ["Not found"]];
  if (!arg) return [project, [page.label]];
  const item =
    route === "run"
      ? (state.runs?.find((r) => r.runId === arg)?.label ?? arg)
      : route === "report"
        ? (findSummary(arg)?.scenarioId ?? state.reports.get(arg)?.scenarioId ?? arg)
        : arg;
  return [project, [page.label, `#/${page.route}`], [item]];
}

async function viewFor(route: string, arg?: string): Promise<string> {
  const meta = state.meta;
  switch (route) {
    case "":
      await Promise.all([ensureScenarios(), refreshReports(), loadRuns(true)]);
      return overviewView(meta, state.scenarios ?? [], [...state.memory, ...state.saved]);
    case "demo":
      await Promise.all([ensureScenarios(), state.demo.status === "idle" ? restoreDemo() : undefined]);
      return demoView(meta, state.scenarios?.find((s) => s.id === meta.demo.scenario), state.demo);
    case "scenarios":
      await ensureScenarios();
      return scenariosView(meta, state.scenarios ?? [], state.scenarioFilter, state.selectedScenarios, state.scenarioError);
    case "scenario": {
      const [detail] = await Promise.all([api<ScenarioDetail>(`/api/scenario?id=${encodeURIComponent(arg ?? "")}`), refreshReports()]);
      state.detail = detail;
      return scenarioView(meta, detail, uniqueResults([...state.memory, ...state.saved]).filter((r) => r.scenarioId === detail.summary.id));
    }
    case "runs":
      await loadRuns(true);
      return runsView(state.runs ?? []);
    case "run": {
      await loadRuns(true);
      const run = state.runs?.find((r) => r.runId === arg);
      return run ? runView(run) : errorView("This run is no longer kept by the server: it restarted, or newer runs replaced it. Saved reports stay on the Reports page.");
    }
    case "reports":
      await refreshReports();
      return reportsView(meta, state.saved, state.memory, state.reportFilter, state.selectedReports);
    case "report": {
      const key = arg ?? "";
      const [report] = await Promise.all([loadReport(key), findSummary(key) ? undefined : refreshReports()]);
      const file = key.startsWith("file:") ? key.slice(5) : undefined;
      return reportView(key, findSummary(key), report, {
        reportFile: file ? `${meta.outDir.replace(/[\\/]+$/, "")}/${file}` : undefined,
        htmlUrl: `/report-view?key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}${state.theme === "system" ? "" : `&theme=${state.theme}`}`,
        replay: state.replays.get(key),
      });
    }
    case "agents":
      await refreshReports();
      return agentsView(meta, [...state.memory, ...state.saved]);
    case "baseline":
      return baselineView(meta, await api<{ path: string; baseline: Baseline | null; error?: string }>("/api/baseline"), state.comparison);
    case "editor":
      if (arg && arg !== state.editorSource) {
        const detail = await api<ScenarioDetail>(`/api/scenario?id=${encodeURIComponent(arg)}`);
        state.editor = { text: detail.text };
        state.editorSource = arg;
        state.draftAgentsTouched = false;
        localStorage.setItem(DRAFT_KEY, detail.text);
      }
      return editorView(meta, state.editor, isMac);
    case "catalog":
      return catalogView(meta);
    default:
      return errorView(`There is no page "${route}".`);
  }
}

/** Loads the scenario list once; a load that failed (a broken file, say) is retried on the next visit. */
async function ensureScenarios(): Promise<void> {
  if (state.scenarios) return;
  try {
    state.scenarios = await api<ScenarioSummary[]>("/api/scenarios");
    state.scenarioError = undefined;
  } catch (err) {
    if (err instanceof ApiError && err.code === "token") throw err;
    state.scenarioError = (err as Error).message;
  }
}

async function refreshReports(): Promise<void> {
  const r = await api<{ saved: ReportSummary[]; memory: ReportSummary[] }>("/api/reports");
  state.saved = r.saved;
  state.memory = r.memory;
}

async function loadRuns(fresh = false): Promise<void> {
  if (state.runs && !fresh) return;
  state.runs = (await api<RunRecord[]>("/api/runs")).map(toRunState);
}

async function loadReport(key: string): Promise<RunReport> {
  const cached = state.reports.get(key);
  if (cached) return cached;
  const report = await api<RunReport>(`/api/report?key=${encodeURIComponent(key)}`);
  if (key.startsWith("mem-")) state.reports.set(key, report);
  return report;
}

function toRunState(r: RunRecord): RunState {
  const agents = r.agents ? (r.agents.length <= 3 ? r.agents.join(", ") : plural(r.agents.length, "agent")) : "expected agents";
  return {
    ...r,
    label: r.draft ? `Draft ${r.scenarios[0]}` : r.scenarios.length === 1 ? r.scenarios[0] : plural(r.scenarios.length, "scenario"),
    at: new Date(r.startedAt).toLocaleString(),
    detail: [agents, plural(r.trials, "trial"), ...(r.seed ? [`seed ${r.seed}`] : [])].join(" · "),
    demo: !r.draft && r.agents === null && r.seed === state.meta.demo.seed && r.scenarios.length === 1 && r.scenarios[0] === state.meta.demo.scenario,
  };
}

function findSummary(key: string): ReportSummary | undefined {
  return [...(state.runs ?? []).flatMap((r) => r.results), ...state.memory, ...state.saved].find((r) => r.key === key);
}

function findRun(el: HTMLElement): RunState | undefined {
  return state.runs?.find((r) => r.runId === el.dataset.run);
}

function setActiveNav(route: string): void {
  for (const link of document.querySelectorAll<HTMLAnchorElement>(".sb-link")) {
    const on = link.dataset.route === route;
    link.classList.toggle("active", on);
    if (on) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

function updateCounts(): void {
  const counts: Record<string, number | undefined> = { scenarios: state.scenarios?.length, runs: state.runs?.length || undefined, reports: state.saved.length || undefined };
  for (const el of document.querySelectorAll<HTMLElement>(".sb-count")) el.textContent = counts[el.dataset.count ?? ""]?.toString() ?? "";
}

function applyTheme(): void {
  if (state.theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = state.theme;
  for (const b of document.querySelectorAll<HTMLElement>(".theme-switch [data-theme]")) b.setAttribute("aria-checked", String(b.dataset.theme === state.theme));
}

function setTheme(theme: Theme): void {
  state.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  applyTheme();
}

/** Switches to the opposite of the theme on screen. */
function flipTheme(): void {
  const dark = state.theme === "dark" || (state.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  setTheme(dark ? "light" : "dark");
}

function closeMenu(): void {
  document.querySelector(".app")?.classList.remove("menu-open");
}

/** Shows a toast; it closes itself after a few seconds unless `persist` is set. Returns a function that closes it. */
function toast(text: string, kind: "ok" | "bad" | "info" | "progress" = "ok", opts: { action?: { label: string; href: string }; persist?: boolean } = {}): () => void {
  let stack = document.querySelector(".toasts");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toasts";
    document.body.append(stack);
  }
  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.setAttribute("role", kind === "bad" ? "alert" : "status");
  const lead = kind === "progress" ? '<span class="spinner"></span>' : icon(kind === "bad" ? "xCircle" : kind === "ok" ? "checkCircle" : "info", 16);
  el.innerHTML = `${lead}<div class="toast-text">${esc(text)}</div>${opts.action ? `<a class="toast-action" href="${esc(opts.action.href)}">${esc(opts.action.label)}</a>` : ""}<button type="button" class="icon-btn" aria-label="Dismiss">${icon("x", 14)}</button>`;
  const remove = () => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 200);
  };
  el.querySelector("button")!.addEventListener("click", remove);
  el.querySelector(".toast-action")?.addEventListener("click", remove);
  stack.append(el);
  if (!opts.persist) setTimeout(remove, kind === "bad" ? 9000 : 5000);
  return remove;
}

/** A toast with a running clock for work that takes more than a moment. Returns a function that closes it. */
function progress(text: string): () => void {
  const started = Date.now();
  let close: (() => void) | undefined;
  let clock: ReturnType<typeof setInterval> | undefined;
  const show = setTimeout(() => {
    close = toast(text, "progress", { persist: true });
    const label = document.querySelector(".toast-progress:last-child .toast-text");
    clock = setInterval(() => {
      if (label) label.textContent = `${text} · ${Math.round((Date.now() - started) / 1000)}s`;
    }, 1000);
  }, 500);
  return () => {
    clearTimeout(show);
    clearInterval(clock);
    close?.();
  };
}

/** A modal dialog; resolves with the value of the button that closed it. */
function dialog(className: string, html: string, focus: string): Promise<string> {
  return new Promise((resolve) => {
    const el = document.createElement("dialog");
    el.className = className;
    el.innerHTML = html;
    document.body.append(el);
    el.addEventListener("close", () => {
      resolve(el.returnValue);
      el.remove();
    });
    el.addEventListener("click", (e) => {
      if (e.target === el) el.close("cancel");
    });
    el.showModal();
    el.querySelector<HTMLElement>(focus)?.focus();
  });
}

/** A modal confirmation; resolves true when the user confirms. */
async function confirmDialog(o: { title: string; body: string; confirm: string; danger?: boolean }): Promise<boolean> {
  const value = await dialog(
    "dialog",
    `<form method="dialog"><div class="dialog-body"><span class="dialog-icon${o.danger ? " danger" : ""}">${icon(o.danger ? "alert" : "help", 18)}</span><div><h2>${esc(o.title)}</h2><p>${o.body}</p></div></div><div class="dialog-actions"><button type="submit" class="btn btn-secondary" value="cancel">Cancel</button><button type="submit" class="btn ${o.danger ? "btn-danger" : "btn-primary"}" value="ok">${esc(o.confirm)}</button></div></form>`,
    'button[value="ok"]'
  );
  return value === "ok";
}

function showShortcuts(): void {
  if (document.querySelector("dialog.dialog-shortcuts")) return;
  void dialog(
    "dialog dialog-shortcuts",
    `<form method="dialog"><div class="dialog-head"><h2>${icon("keyboard", 17)}Keyboard shortcuts</h2><button type="submit" class="icon-btn" value="close" aria-label="Close">${icon("x", 15)}</button></div>${shortcutsView(isMac)}</form>`,
    'button[value="close"]'
  );
}

function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Disables a control, if any, while its request runs and shows `label` and a spinner on it. Errors become toasts. */
async function busy<T>(el: HTMLElement | undefined, label: string, work: () => Promise<T>): Promise<T | undefined> {
  const button = (el?.matches("button") ? el : el?.querySelector("button[type=submit]")) as HTMLButtonElement | null | undefined;
  const before = button?.innerHTML;
  el?.classList.add("busy");
  if (button) {
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span><span>${esc(label)}</span>`;
  }
  try {
    return await work();
  } catch (err) {
    toast((err as Error).message, "bad");
    return undefined;
  } finally {
    el?.classList.remove("busy");
    if (button?.isConnected) {
      button.disabled = false;
      button.innerHTML = before ?? "";
    }
  }
}

async function startRun(request: { scenarioIds?: string[]; text?: string }, agents: string[], trials: number, seed: string | undefined): Promise<RunState> {
  const res = await api<RunRecord>("/api/run", { ...request, agents, trials, ...(seed ? { seed } : {}) });
  await loadRuns(true);
  updateCounts();
  return toRunState(res);
}

function runLabel(scenarios: number, agentRuns: number, trials: number): string {
  return `Running ${plural(scenarios, "scenario")}: ${plural(agentRuns, "agent run")} × ${plural(trials, "trial")}`;
}

async function runFromForm(form: HTMLFormElement): Promise<void> {
  const data = new FormData(form);
  const agents = data.getAll("agent").map(String);
  const trials = Number(data.get("trials") || 1);
  const seed = String(data.get("seed") ?? "").trim() || undefined;
  const action = form.dataset.action;
  const expected = (verdicts: Record<string, unknown> | undefined) => agents.length || Object.keys(verdicts ?? {}).length;
  if (action === "run-draft") {
    const done = progress(runLabel(1, expected(state.editor.validation?.ok ? state.editor.validation.summary.expectedVerdicts : undefined), trials));
    const run = await busy(form, "Running…", () => startRun({ text: state.editor.text }, agents, trials, seed)).finally(done);
    if (!run) return;
    state.editor.run = run;
    const target = document.getElementById("editor-run");
    if (target) target.innerHTML = draftResults(run);
    return;
  }
  const ids = action === "run-scenario" ? [state.detail?.summary.id ?? ""] : [...state.selectedScenarios];
  if (ids.length === 0) return void toast("Select at least one scenario first.", "bad");
  const done = progress(runLabel(ids.length, ids.reduce((n, id) => n + expected(state.scenarios?.find((s) => s.id === id)?.expectedVerdicts), 0), trials));
  const run = await busy(form, "Running…", () => startRun({ scenarioIds: ids }, agents, trials, seed)).finally(done);
  if (run) location.hash = href("run", run.runId);
}

/** Runs the same scenarios, agents, trials, and seed as `run` again, and opens the new run. */
async function rerun(run: RunState | undefined, el?: HTMLElement): Promise<void> {
  if (!run?.scenarios || run.draft) return;
  const done = progress(runLabel(run.scenarios.length, run.results.length, run.trials ?? 1));
  const again = await busy(el, "Running…", () => startRun({ scenarioIds: run.scenarios }, run.agents ?? [], run.trials ?? 1, run.seed ?? undefined)).finally(done);
  if (again) location.hash = href("run", again.runId);
}

function showAgentReports(agent: string): void {
  state.reportFilter = { q: agent, verdict: "" };
  location.hash = "#/reports";
}

function selectedKeys(el: HTMLElement): string[] {
  const run = findRun(el);
  return run ? run.results.map((r) => r.key) : [...state.selectedReports];
}

/** Shows the latest demo run of this server session, if its reports are still in memory. */
async function restoreDemo(): Promise<void> {
  await loadRuns();
  const run = state.runs?.find((r) => r.demo);
  const reports = run && (await Promise.all(run.results.map((r) => loadReport(r.key))).catch(() => undefined));
  if (run && reports && state.demo.status === "idle") state.demo = { status: "done", results: run.results, reports: Object.fromEntries(reports.map((r) => [r.agentId, r])) };
}

async function runDemo(): Promise<void> {
  if (state.demo.status === "running") return;
  state.demo = { status: "running", results: [], reports: {} };
  if (location.hash !== "#/demo") location.hash = "#/demo";
  else void render();
  const started = Date.now();
  try {
    const run = await startRun({ scenarioIds: [state.meta.demo.scenario] }, [], 1, state.meta.demo.seed);
    const reports = await Promise.all(run.results.map((r) => loadReport(r.key)));
    await new Promise((done) => setTimeout(done, Math.max(0, 450 - (Date.now() - started))));
    state.demo = { status: "done", results: run.results, reports: Object.fromEntries(reports.map((r) => [r.agentId, r])) };
  } catch (err) {
    state.demo = { status: "error", results: [], reports: {}, error: (err as Error).message };
  }
  if (parseHash().route === "demo") void render();
}

/** Scrolls to the run form on pages that have one, and goes to the scenario list from the others. */
function newRun(): void {
  const form = view().querySelector<HTMLFormElement>("form.run-card");
  if (!form || form.dataset.action === "run-draft") {
    location.hash = "#/scenarios";
    return;
  }
  form.scrollIntoView({ behavior: "smooth", block: "center" });
  form.classList.remove("flash");
  void form.offsetWidth;
  form.classList.add("flash");
  form.querySelector<HTMLButtonElement>("button[type=submit]")?.focus({ preventScroll: true });
}

/** Keeps the run form's note and button in step with the scenario selection. */
function updateSelection(): void {
  for (const box of document.querySelectorAll<HTMLInputElement>('input[data-action="select-scenario"]')) {
    box.checked = state.selectedScenarios.has(box.dataset.id ?? "");
    box.closest(".scn-row")?.classList.toggle("selected", box.checked);
  }
  const form = app.querySelector('form[data-action="run-selected"]');
  const note = form?.querySelector(".note");
  if (note) note.textContent = selectionNote(state.selectedScenarios.size);
  const label = form?.querySelector("button[type=submit] span:last-child");
  if (label) label.textContent = state.selectedScenarios.size ? `Run ${plural(state.selectedScenarios.size, "scenario")}` : "Run";
}

async function act(action: string, el: HTMLElement): Promise<void> {
  switch (action) {
    case "reload":
      location.reload();
      return;
    case "theme":
      return setTheme((el.dataset.theme as Theme | undefined) ?? "system");
    case "palette":
      return showPalette();
    case "shortcuts":
      return showShortcuts();
    case "menu":
      document.querySelector(".app")?.classList.add("menu-open");
      return;
    case "close-menu":
      return closeMenu();
    case "new-run":
    case "focus-run":
      return newRun();
    case "tag":
      state.scenarioFilter.tag = state.scenarioFilter.tag === el.dataset.tag ? "" : (el.dataset.tag ?? "");
      return render();
    case "world":
      state.scenarioFilter.world = el.dataset.world ?? "";
      return render();
    case "select-shown":
      for (const s of filterScenarios(state.scenarios ?? [], state.scenarioFilter)) state.selectedScenarios.add(s.id);
      return updateSelection();
    case "clear-scenarios":
      state.selectedScenarios.clear();
      return updateSelection();
    case "report-verdict":
      state.reportFilter.verdict = el.dataset.verdict ?? "";
      return render();
    case "agent-reports":
      return showAgentReports(el.dataset.agent ?? "");
    case "agents": {
      const form = el.closest("form");
      for (const box of form?.querySelectorAll<HTMLInputElement>('input[name="agent"]') ?? []) box.checked = el.dataset.pick === "all";
      if (form?.dataset.action === "run-draft") state.draftAgentsTouched = true;
      return;
    }
    case "matrix-filter":
    case "density": {
      const matrix = document.getElementById("matrix");
      if (matrix) matrix.dataset[action === "density" ? "density" : "filter"] = el.dataset[action === "density" ? "density" : "filter"] ?? "";
      for (const b of el.parentElement?.querySelectorAll<HTMLElement>(".seg-btn") ?? []) {
        b.classList.toggle("on", b === el);
        b.setAttribute("aria-pressed", String(b === el));
      }
      return;
    }
    case "scroll-to":
      document.getElementById(el.dataset.target ?? "")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    case "copy":
      return copy(el.dataset.copy ?? "", el);
    case "copy-markdown": {
      const run = findRun(el);
      return run ? copy(runMarkdown(run), el) : undefined;
    }
    case "copy-commands": {
      const run = findRun(el);
      return run ? copy(runCommands(run).join("\n"), el) : undefined;
    }
    case "download-csv": {
      const run = findRun(el);
      if (run) download(`agentcrucible-${run.runId}.csv`, runCsv(run), "text/csv");
      return;
    }
    case "rerun":
      return rerun(findRun(el), el);
    case "clear-selection":
      state.selectedReports.clear();
      return render();
    case "run-demo":
      return runDemo();
    case "save-run":
    case "save-one": {
      const keys = action === "save-one" ? [el.dataset.key ?? ""] : selectedKeys(el);
      const saved = await busy(el, "Saving…", () => api<{ outDir: string; files: string[] }>("/api/save", { keys }));
      if (saved) toast(`Saved ${plural(saved.files.length, "report")} under ${saved.outDir}`, "ok", { action: { label: "View", href: "#/reports" } });
      return;
    }
    case "compare-run":
    case "compare-selected": {
      const comparison = await busy(el, "Comparing…", () => api<Comparison>("/api/baseline/compare", { keys: selectedKeys(el) }));
      if (!comparison) return;
      state.comparison = comparison;
      if (location.hash === "#/baseline") return render();
      location.hash = "#/baseline";
      return;
    }
    case "baseline-run":
    case "baseline-selected": {
      const keys = selectedKeys(el);
      const ok = await confirmDialog({
        title: "Replace the baseline?",
        body: `${esc(plural(keys.length, "report"))} will be written to <code>${esc(state.meta.baselinePath)}</code> as the new baseline. This replaces the file, and CI compares against it from then on.`,
        confirm: "Replace baseline",
        danger: true,
      });
      if (!ok) return;
      const saved = await busy(el, "Saving…", () => api<{ path: string; entries: number }>("/api/baseline/save", { keys }));
      if (!saved) return;
      toast(`Baseline ${saved.path} now has ${plural(saved.entries, "entry", "entries")}.`);
      state.comparison = undefined;
      if (location.hash === "#/baseline") return render();
      location.hash = "#/baseline";
      return;
    }
    case "replay": {
      const key = el.dataset.key ?? "";
      const result = await busy(el, "Replaying…", () => api<ReplayView>("/api/replay", { key }));
      if (!result) return;
      state.replays.set(key, result);
      toast(result.reproduced ? "Reproduced: every call, state, and verdict matches the report." : "Not reproduced: see the differences on the page.", result.reproduced ? "ok" : "bad");
      return render();
    }
    case "download": {
      const report = await busy(el, "Preparing…", () => loadReport(el.dataset.key ?? ""));
      if (report) download(`${encodeURIComponent(report.scenarioId)}.report.json`, `${JSON.stringify(report, null, 2)}\n`, "application/json");
      return;
    }
    case "template":
      return useTemplate(el.dataset.template ?? "");
    case "save-scenario":
      return saveScenario(el);
    case "download-scenario":
      download(`${(state.editor.validation?.ok ? state.editor.validation.summary.id : "scenario").replace(/\//g, "-")}.yaml`, state.editor.text, "text/yaml");
      return;
  }
}

async function copy(text: string, el: HTMLElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    const label = el.querySelector("span") ?? el;
    const before = label.textContent;
    label.textContent = "Copied";
    el.classList.add("copied");
    setTimeout(() => {
      label.textContent = before;
      el.classList.remove("copied");
    }, 1200);
  } catch {
    toast("The browser did not allow copying to the clipboard.", "bad");
  }
}

async function useTemplate(name: string): Promise<void> {
  const text = TEMPLATES[name];
  if (!text) return;
  if (state.editor.text.trim() && state.editor.text !== text) {
    const ok = await confirmDialog({ title: "Replace the editor text?", body: "Your draft is replaced with the template. It is not kept anywhere else.", confirm: "Replace" });
    if (!ok) return;
  }
  setDraft(text);
  if (location.hash !== "#/editor") location.hash = "#/editor";
  else void render();
}

function setDraft(text: string): void {
  state.editor = { text };
  state.editorSource = undefined;
  state.draftAgentsTouched = false;
  localStorage.setItem(DRAFT_KEY, text);
}

/** Saves the draft. Overwriting asks first, unless the draft was opened from or saved to that scenario. */
async function saveScenario(el: HTMLElement): Promise<void> {
  if (!state.meta.scenarioDir) return void toast('Add "scenarioDirs" to the config file to save scenarios from the editor.', "bad");
  const text = state.editor.text;
  const save = (overwrite: boolean) => api<{ path: string; id: string }>("/api/scenario/save", { text, overwrite });
  const ownFile = state.editorSource !== undefined && state.editor.validation?.ok === true && state.editorSource === state.editor.validation.summary.id;
  const saved = await busy(el, "Saving…", async () => {
    try {
      return await save(ownFile);
    } catch (err) {
      if (!(err instanceof ApiError && err.code === "exists")) throw err;
      return (await confirmDialog({ title: "Overwrite the file?", body: `${esc(err.message)}. Saving replaces it with the editor text.`, confirm: "Overwrite", danger: true })) ? save(true) : undefined;
    }
  });
  if (!saved) return;
  state.scenarios = undefined;
  state.editorSource = saved.id;
  toast(`Saved ${saved.id} to ${saved.path}`, "ok", { action: { label: "Open", href: href("scenario", saved.id) } });
}

let validateTimer: ReturnType<typeof setTimeout> | undefined;
let validations = 0;

async function validate(): Promise<void> {
  const ticket = ++validations;
  const result = await api<Validation>("/api/validate", { text: state.editor.text }).catch((err: Error): Validation => ({ ok: false, error: err.message }));
  if (ticket !== validations) return;
  state.editor.validation = result;
  const status = document.getElementById("editor-status");
  if (status) status.innerHTML = validationPanel(result);
  const lines = document.getElementById("editor-lines");
  if (lines) lines.innerHTML = gutterLines(state.editor.text, result.ok ? undefined : errorLine(result.error));
  if (!result.ok) return;
  const file = document.getElementById("editor-file");
  if (file) file.textContent = `${result.summary.id}.yaml`;
  const target = document.getElementById("editor-target");
  if (target?.dataset.dir) target.textContent = `saves to ${target.dataset.dir}/${result.summary.id}.yaml`;
  if (state.draftAgentsTouched) return;
  const expected = Object.keys(result.summary.expectedVerdicts);
  for (const box of document.querySelectorAll<HTMLInputElement>('form[data-action="run-draft"] input[name="agent"]')) box.checked = expected.includes(box.value);
}

function editorParts() {
  return {
    text: document.getElementById("editor-text") as HTMLTextAreaElement | null,
    highlight: document.getElementById("editor-highlight"),
    lines: document.getElementById("editor-lines"),
  };
}

function setupEditor(): void {
  const { text } = editorParts();
  if (!text) return;
  text.addEventListener("scroll", syncEditorScroll);
  syncEditorScroll();
  updateCaret();
}

function syncEditorScroll(): void {
  const { text, highlight, lines } = editorParts();
  if (!text) return;
  highlight?.parentElement?.style.setProperty("transform", `translate(${-text.scrollLeft}px, ${-text.scrollTop}px)`);
  lines?.style.setProperty("transform", `translateY(${-text.scrollTop}px)`);
}

function updateCaret(): void {
  const { text } = editorParts();
  const pos = document.getElementById("editor-pos");
  if (!text || !pos) return;
  const before = text.value.slice(0, text.selectionStart);
  const line = before.split("\n").length;
  pos.textContent = `Ln ${line}, Col ${before.length - before.lastIndexOf("\n")}${text.selectionEnd > text.selectionStart ? ` (${text.selectionEnd - text.selectionStart} selected)` : ""}`;
}

function onEditorInput(value: string): void {
  state.editor.text = value;
  localStorage.setItem(DRAFT_KEY, value);
  const { highlight, lines } = editorParts();
  if (highlight) highlight.innerHTML = `${highlightYaml(value)}\n`;
  if (lines) lines.innerHTML = gutterLines(value);
  syncEditorScroll();
  updateCaret();
  clearTimeout(validateTimer);
  validateTimer = setTimeout(() => void validate(), 300);
}

/** Inserts text at the selection so the browser's undo history keeps it. */
function insertText(area: HTMLTextAreaElement, text: string): void {
  if (!document.execCommand("insertText", false, text)) {
    area.setRangeText(text, area.selectionStart, area.selectionEnd, "end");
    area.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function editorKey(e: KeyboardEvent, area: HTMLTextAreaElement): void {
  const { value, selectionStart: start, selectionEnd: end } = area;
  if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    if (!e.shiftKey && !value.slice(start, end).includes("\n")) return insertText(area, "  ");
    const block = value.slice(lineStart, end);
    const changed = e.shiftKey ? block.replace(/^ {1,2}/gm, "") : block.replace(/^/gm, "  ");
    area.setSelectionRange(lineStart, end);
    insertText(area, changed);
    area.setSelectionRange(lineStart, lineStart + changed.length);
  } else if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const line = value.slice(lineStart, start);
    let indent = /^\s*/.exec(line)![0];
    if (/^\s*- /.test(line)) indent += "  ";
    if (/:\s*([|>][-+]?)?\s*$/.test(line)) indent += "  ";
    e.preventDefault();
    insertText(area, `\n${indent}`);
  }
}

function showPalette(): void {
  void ensureScenarios().then(() => {
    const go = (hash: string) => () => {
      location.hash = hash;
    };
    const latest = state.runs?.find((r) => !r.draft);
    const items: PaletteItem[] = [
      ...ROUTES.map((r) => ({ group: "Pages", label: r.label, hint: `G ${r.key.toUpperCase()}`, icon: r.icon, run: go(`#/${r.route}`) })),
      { group: "Actions", label: "Run the guided demo", icon: "play", keywords: "demo timeout refund", run: () => void runDemo() },
      { group: "Actions", label: "New run", hint: "N", icon: "runs", keywords: "start scenarios agents", run: newRun },
      ...(latest ? [{ group: "Actions", label: `Re-run ${latest.label}`, hint: latest.detail, icon: "repeat" as const, keywords: "again repeat last run", run: () => void rerun(latest) }] : []),
      { group: "Actions", label: "New single-step scenario", icon: "plus", keywords: "template editor", run: () => void useTemplate("single") },
      { group: "Actions", label: "New workflow scenario", icon: "workflow", keywords: "template editor", run: () => void useTemplate("workflow") },
      { group: "Actions", label: "Keyboard shortcuts", hint: "?", icon: "keyboard", keywords: "keys help", run: showShortcuts },
      ...(["system", "light", "dark"] as const).map((t) => ({
        group: "Actions",
        label: `Theme: ${t === "system" ? "follow the system" : t}`,
        icon: t === "system" ? ("monitor" as const) : t === "light" ? ("sun" as const) : ("moon" as const),
        keywords: "appearance color dark light",
        run: () => setTheme(t),
      })),
      ...(state.scenarios ?? []).map((s) => ({ group: "Scenarios", label: s.id, hint: s.worlds.join(" + "), icon: "layers" as const, keywords: `${s.task} ${s.tags.join(" ")} ${s.faults.join(" ")}`, run: go(href("scenario", s.id)) })),
      ...(state.runs ?? []).slice(0, 10).map((r) => ({ group: "Runs", label: r.label, hint: r.detail, icon: "runs" as const, run: go(href("run", r.runId)) })),
      ...state.meta.agents.map((a) => ({ group: "Agents", label: a.id, hint: "reports", icon: "bot" as const, keywords: a.description, run: () => showAgentReports(a.id) })),
    ];
    openPalette(items);
  });
}

function jumpToCall(id: string): void {
  const target = document.getElementById(id);
  const trial = target?.closest<HTMLElement>(".trial");
  if (!target || !trial) return;
  showTrial(trial.dataset.trial ?? "");
  target.querySelector("details")?.setAttribute("open", "");
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.remove("flash");
  void target.offsetWidth;
  target.classList.add("flash");
  setTimeout(() => target.classList.remove("flash"), 1600);
}

function showTrial(index: string): void {
  for (const t of document.querySelectorAll<HTMLElement>("#report-root .trial")) t.classList.toggle("current", t.dataset.trial === index);
  for (const a of document.querySelectorAll<HTMLElement>("#report-root .trial-nav a")) a.classList.toggle("current", a.dataset.trial === index);
}

/** Opens every call of the shown trial, or closes them all when every one is open. */
function toggleCalls(): void {
  const calls = [...document.querySelectorAll<HTMLDetailsElement>("#report-root .trial.current li.call > details")];
  const open = calls.some((d) => !d.open);
  for (const d of calls) d.open = open;
  const label = document.getElementById("toggle-calls");
  if (label) label.textContent = open ? "Collapse calls" : "Expand calls";
}

/** Moves the focus to the next or previous call of the shown trial. */
function stepCall(by: 1 | -1): void {
  const calls = [...document.querySelectorAll<HTMLElement>("#report-root .trial.current li.call:not(.hidden)")].filter((li) => li.offsetParent !== null);
  if (calls.length === 0) return;
  const current = calls.indexOf(document.activeElement?.closest<HTMLElement>("li.call") as HTMLElement);
  const next = calls[current < 0 ? (by > 0 ? 0 : calls.length - 1) : Math.min(calls.length - 1, Math.max(0, current + by))];
  next.querySelector("summary")?.focus({ preventScroll: true });
  next.scrollIntoView({ behavior: "smooth", block: "center" });
}

app.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const reportLink = target.closest<HTMLAnchorElement>('#report-root a[href^="#t"]');
  if (reportLink) {
    e.preventDefault();
    if (reportLink.dataset.trial !== undefined) showTrial(reportLink.dataset.trial);
    else jumpToCall(reportLink.getAttribute("href")!.slice(1));
    return;
  }
  const copyButton = target.closest<HTMLElement>("#report-root button[data-copy]");
  if (copyButton) return void copy(copyButton.dataset.copy ?? "", copyButton);
  if (target.closest("#toggle-calls")) return toggleCalls();
  const el = target.closest<HTMLElement>("[data-action]");
  if (el && el.tagName !== "FORM" && el.tagName !== "INPUT") {
    e.preventDefault();
    void act(el.dataset.action ?? "", el);
    return;
  }
  const row = target.closest<HTMLElement>("tr[data-href]");
  if (row && !target.closest("a, input, label, button")) location.hash = row.dataset.href!;
});

app.addEventListener("change", (e) => {
  const el = e.target as HTMLInputElement;
  if (el.dataset.action === "select-scenario") {
    if (el.checked) state.selectedScenarios.add(el.dataset.id ?? "");
    else state.selectedScenarios.delete(el.dataset.id ?? "");
    updateSelection();
  } else if (el.dataset.action === "select-report" || el.dataset.action === "select-all-reports") {
    const boxes = el.dataset.action === "select-all-reports" ? [...document.querySelectorAll<HTMLInputElement>('#report-list input[data-action="select-report"]')] : [el];
    for (const box of boxes) {
      box.checked = el.checked;
      if (el.checked) state.selectedReports.add(box.dataset.key ?? "");
      else state.selectedReports.delete(box.dataset.key ?? "");
      box.closest("tr")?.classList.toggle("selected", el.checked);
    }
    const actions = document.getElementById("report-actions");
    if (actions) {
      actions.innerHTML = reportActions(state.selectedReports.size);
      actions.classList.toggle("show", state.selectedReports.size > 0);
    }
  } else if (el.id === "filter-faults") {
    document.getElementById("report-root")?.classList.toggle("filter-faults", el.checked);
  } else if (el.name === "agent" && el.closest('form[data-action="run-draft"]')) {
    state.draftAgentsTouched = true;
  }
});

app.addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement | HTMLTextAreaElement;
  if (el.id === "scenario-q") {
    state.scenarioFilter.q = el.value;
    const shown = filterScenarios(state.scenarios ?? [], state.scenarioFilter);
    const list = document.getElementById("scenario-list");
    if (list) list.innerHTML = scenarioList(shown, state.selectedScenarios);
    const count = document.getElementById("scenario-shown");
    if (count) count.textContent = `${plural(shown.length, "scenario")} shown`;
  } else if (el.id === "report-q") {
    state.reportFilter.q = el.value;
    const list = document.getElementById("report-list");
    if (list) list.innerHTML = reportList([...state.memory, ...state.saved], state.reportFilter, state.selectedReports);
  } else if (el.id === "call-search") {
    const q = el.value.trim().toLowerCase();
    for (const li of document.querySelectorAll<HTMLElement>("#report-root li.call")) li.classList.toggle("hidden", q !== "" && !li.textContent!.toLowerCase().includes(q));
  } else if (el.id === "editor-text") {
    onEditorInput(el.value);
  }
});

app.addEventListener("submit", (e) => {
  e.preventDefault();
  void runFromForm(e.target as HTMLFormElement);
});

document.addEventListener("selectionchange", () => {
  if (document.activeElement?.id === "editor-text") updateCaret();
});

/** Set after "g" is pressed, for half a second, so the next key picks a page. */
let goPending: ReturnType<typeof setTimeout> | undefined;

document.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && !e.altKey && e.key.toLowerCase() === "k") {
    e.preventDefault();
    if (paletteOpen()) closePalette();
    else showPalette();
    return;
  }
  if (target.id === "editor-text") {
    if (mod && e.key.toLowerCase() === "s") {
      e.preventDefault();
      const save = view().querySelector<HTMLElement>('[data-action="save-scenario"]');
      if (save) void saveScenario(save);
    } else if (mod && e.key === "Enter") {
      e.preventDefault();
      view().querySelector<HTMLFormElement>('form[data-action="run-draft"]')?.requestSubmit();
    } else editorKey(e, target as HTMLTextAreaElement);
    return;
  }
  if (e.key === "Escape") closeMenu();
  if (mod || e.altKey || paletteOpen() || document.querySelector("dialog[open]") || target.closest("input, textarea, select, [contenteditable]")) return;
  if (goPending) {
    clearTimeout(goPending);
    goPending = undefined;
    const page = ROUTES.find((r) => r.key === e.key.toLowerCase());
    if (page) {
      e.preventDefault();
      location.hash = `#/${page.route}`;
    }
    return;
  }
  const inReport = Boolean(document.getElementById("report-root"));
  switch (e.key) {
    case "/": {
      const search = view().querySelector<HTMLInputElement>('input[type="search"]');
      if (!search) return;
      e.preventDefault();
      search.focus();
      return;
    }
    case "g":
      goPending = setTimeout(() => (goPending = undefined), 600);
      return;
    case "?":
      e.preventDefault();
      return showShortcuts();
    case "t":
      return flipTheme();
    case "n":
      return newRun();
    case "j":
    case "k":
      if (inReport) stepCall(e.key === "j" ? 1 : -1);
      return;
    case "e":
      if (inReport) toggleCalls();
      return;
  }
});

window.addEventListener("hashchange", () => void render());

async function start(): Promise<void> {
  applyTheme();
  try {
    state.meta = await api<Meta>("/api/meta");
  } catch (err) {
    app.innerHTML = `<div class="boot-error">${errorView(`Cannot reach the AgentCrucible server: ${(err as Error).message}. Start agentcrucible ui again and open the address it prints.`)}</div>`;
    return;
  }
  app.innerHTML = shell(state.meta, isMac);
  applyTheme();
  await render();
  await Promise.all([ensureScenarios(), loadRuns(), refreshReports()]).catch(() => undefined);
  updateCounts();
}

void start();
