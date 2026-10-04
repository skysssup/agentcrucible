/**
 * The browser side of `agentcrucible ui`: a hash router over the views in views.ts and the JSON
 * API in server.ts. Every request carries the session token the server put in the page.
 */
import {
  baselineView,
  catalogView,
  draftResults,
  editorView,
  esc,
  filterScenarios,
  header,
  href,
  overviewView,
  reportActions,
  reportList,
  reportsView,
  reportView,
  runsView,
  runView,
  scenarioList,
  scenariosView,
  scenarioView,
  selectionNote,
  TEMPLATES,
  validationPanel,
  type Comparison,
  type EditorState,
  type Meta,
  type ReplayResult,
  type ReportSummary,
  type RunState,
  type ScenarioDetail,
  type ScenarioSummary,
} from "./views.js";

type Theme = "system" | "light" | "dark";

const token = document.querySelector<HTMLMetaElement>('meta[name="agentcrucible-token"]')?.content ?? "";
const app = document.getElementById("app")!;
const DRAFT_KEY = "agentcrucible-draft";
const THEME_KEY = "agentcrucible-theme";
const DEMO = "payments/timeout-after-commit";

const state = {
  meta: undefined as unknown as Meta,
  scenarios: undefined as ScenarioSummary[] | undefined,
  scenarioError: undefined as string | undefined,
  saved: [] as ReportSummary[],
  memory: [] as ReportSummary[],
  runs: [] as RunState[],
  scenarioFilter: { q: "", tag: "", world: "" },
  selectedScenarios: new Set<string>(),
  reportFilter: { q: "", verdict: "" },
  selectedReports: new Set<string>(),
  comparison: undefined as Comparison | undefined,
  replays: new Map<string, ReplayResult>(),
  detail: undefined as ScenarioDetail | undefined,
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

const NAV: Record<string, string> = { scenario: "scenarios", run: "runs", report: "reports" };
let renders = 0;

async function render(): Promise<void> {
  const ticket = ++renders;
  const { route, arg } = parseHash();
  let view: string;
  try {
    view = await viewFor(route, arg);
  } catch (err) {
    const stale = err instanceof ApiError && err.code === "token";
    view = `<main class="view"><div class="status bad">${esc((err as Error).message)}${stale ? ` <button type="button" data-action="reload">Reload</button>` : ""}</div></main>`;
  }
  if (ticket !== renders) return;
  app.innerHTML = header(state.meta, NAV[route] ?? route, state.theme) + view;
  if (route === "editor" && !state.editor.validation) void validate();
}

async function viewFor(route: string, arg?: string): Promise<string> {
  const meta = state.meta;
  switch (route) {
    case "":
      await Promise.all([ensureScenarios(), refreshReports()]);
      return overviewView(meta, state.scenarios ?? [], state.saved, state.runs);
    case "scenarios":
      await ensureScenarios();
      return scenariosView(meta, state.scenarios ?? [], state.scenarioFilter, state.selectedScenarios, state.scenarioError);
    case "scenario":
      state.detail = await api<ScenarioDetail>(`/api/scenario?id=${encodeURIComponent(arg ?? "")}`);
      return scenarioView(meta, state.detail);
    case "runs":
      return runsView(state.runs);
    case "run": {
      const run = state.runs.find((r) => r.runId === arg);
      return run ? runView(run) : notice("This run is not in this browser tab any more. Its reports stay on the Reports page until the server stops; save them to keep them.");
    }
    case "reports":
      await refreshReports();
      return reportsView(meta, state.saved, state.memory, state.reportFilter, state.selectedReports);
    case "report": {
      const key = arg ?? "";
      if (!findSummary(key)) await refreshReports();
      return reportView(key, findSummary(key), reportViewUrl(key), state.replays.get(key));
    }
    case "baseline":
      return baselineView(meta, await api("/api/baseline"), state.comparison);
    case "editor":
      if (arg && arg !== state.editorSource) {
        const detail = await api<ScenarioDetail>(`/api/scenario?id=${encodeURIComponent(arg)}`);
        state.editor = { text: detail.text };
        state.editorSource = arg;
        state.draftAgentsTouched = false;
        localStorage.setItem(DRAFT_KEY, detail.text);
      }
      return editorView(meta, state.editor);
    case "catalog":
      return catalogView(meta);
    default:
      return notice(`There is no page "${route}".`);
  }
}

function notice(text: string): string {
  return `<main class="view"><p class="empty">${esc(text)}</p></main>`;
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

function findSummary(key: string): ReportSummary | undefined {
  return [...state.runs.flatMap((r) => r.results), ...state.memory, ...state.saved].find((r) => r.key === key);
}

function reportViewUrl(key: string): string {
  return `/report-view?key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}${state.theme === "system" ? "" : `&theme=${state.theme}`}`;
}

function applyTheme(): void {
  if (state.theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = state.theme;
}

function toast(text: string, bad = false): void {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = `toast${bad ? " bad" : ""}`;
  el.setAttribute("role", bad ? "alert" : "status");
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), bad ? 9000 : 4500);
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

/** Disables a control while its request runs and shows `label` on it. */
async function busy<T>(el: HTMLElement, label: string, work: () => Promise<T>): Promise<T | undefined> {
  const button = (el.matches("button") ? el : el.querySelector("button[type=submit]")) as HTMLButtonElement | null;
  const before = button?.textContent;
  el.classList.add("busy");
  if (button) {
    button.disabled = true;
    button.textContent = label;
  }
  try {
    return await work();
  } catch (err) {
    toast((err as Error).message, true);
    return undefined;
  } finally {
    el.classList.remove("busy");
    if (button?.isConnected) {
      button.disabled = false;
      button.textContent = before ?? "";
    }
  }
}

async function startRun(request: { scenarioIds?: string[]; text?: string }, agents: string[], trials: number, seed: string | undefined, label: string): Promise<RunState> {
  const res = await api<{ runId: string; results: ReportSummary[] }>("/api/run", { ...request, agents, trials, ...(seed ? { seed } : {}) });
  const run: RunState = { runId: res.runId, label, at: new Date().toLocaleString(), results: res.results };
  state.runs.unshift(run);
  return run;
}

async function runFromForm(form: HTMLFormElement): Promise<void> {
  const data = new FormData(form);
  const agents = data.getAll("agent").map(String);
  const trials = Number(data.get("trials") || 1);
  const seed = String(data.get("seed") ?? "").trim() || undefined;
  const who = `${agents.length ? agents.join(", ") : "expected agents"} · ${trials} trial${trials === 1 ? "" : "s"}`;
  const action = form.dataset.action;
  if (action === "run-draft") {
    const run = await busy(form, "Running…", () => startRun({ text: state.editor.text }, agents, trials, seed, `Draft ${state.editor.validation?.summary?.id ?? ""} · ${who}`));
    if (!run) return;
    state.editor.run = run;
    const target = document.getElementById("editor-run");
    if (target) target.innerHTML = draftResults(run);
    return;
  }
  const ids = action === "run-scenario" ? [state.detail?.summary.id ?? ""] : [...state.selectedScenarios];
  if (ids.length === 0) return toast("Select at least one scenario first.", true);
  const run = await busy(form, "Running…", () => startRun({ scenarioIds: ids }, agents, trials, seed, `${ids.length === 1 ? ids[0] : `${ids.length} scenarios`} · ${who}`));
  if (run) location.hash = href("run", run.runId);
}

function selectedKeys(el: HTMLElement): string[] {
  const run = state.runs.find((r) => r.runId === el.dataset.run);
  return run ? run.results.map((r) => r.key) : [...state.selectedReports];
}

async function act(action: string, el: HTMLElement): Promise<void> {
  switch (action) {
    case "reload":
      location.reload();
      return;
    case "theme":
      state.theme = state.theme === "system" ? "light" : state.theme === "light" ? "dark" : "system";
      localStorage.setItem(THEME_KEY, state.theme);
      applyTheme();
      return render();
    case "tag":
      state.scenarioFilter.tag = state.scenarioFilter.tag === el.dataset.tag ? "" : (el.dataset.tag ?? "");
      return render();
    case "run-demo": {
      const run = await busy(el, "Running…", () => startRun({ scenarioIds: [DEMO] }, [], 1, undefined, `Demo: ${DEMO}`));
      if (run) location.hash = href("run", run.runId);
      return;
    }
    case "save-run":
    case "save-one": {
      const keys = action === "save-one" ? [el.dataset.key ?? ""] : selectedKeys(el);
      const saved = await busy(el, "Saving…", () => api<{ outDir: string; files: string[] }>("/api/save", { keys }));
      if (saved) toast(`Saved ${saved.files.length} report${saved.files.length === 1 ? "" : "s"} under ${saved.outDir}: ${saved.files.join(", ")}`);
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
      if (!confirm(`Write ${keys.length} report${keys.length === 1 ? "" : "s"} to ${state.meta.baselinePath} as the new baseline? This replaces the file.`)) return;
      const saved = await busy(el, "Saving…", () => api<{ path: string; entries: number }>("/api/baseline/save", { keys }));
      if (!saved) return;
      toast(`Baseline ${saved.path} now has ${saved.entries} entr${saved.entries === 1 ? "y" : "ies"}.`);
      state.comparison = undefined;
      if (location.hash === "#/baseline") return render();
      location.hash = "#/baseline";
      return;
    }
    case "replay": {
      const key = el.dataset.key ?? "";
      const result = await busy(el, "Replaying…", () => api<ReplayResult>("/api/replay", { key }));
      if (!result) return;
      state.replays.set(key, result);
      return render();
    }
    case "download": {
      const report = await busy(el, "Preparing…", () => api<{ scenarioId: string }>(`/api/report?key=${encodeURIComponent(el.dataset.key ?? "")}`));
      if (report) download(`${encodeURIComponent(report.scenarioId)}.report.json`, `${JSON.stringify(report, null, 2)}\n`, "application/json");
      return;
    }
    case "template": {
      const text = TEMPLATES[el.dataset.template ?? ""];
      if (!text || (state.editor.text.trim() && state.editor.text !== text && !confirm("Replace the editor text with the template?"))) return;
      setDraft(text);
      if (location.hash !== "#/editor") location.hash = "#/editor";
      return render();
    }
    case "save-scenario":
      return saveScenario(el);
    case "download-scenario":
      download(`${(state.editor.validation?.summary?.id ?? "scenario").replace(/\//g, "-")}.yaml`, state.editor.text, "text/yaml");
      return;
  }
}

function setDraft(text: string): void {
  state.editor = { text };
  state.editorSource = undefined;
  state.draftAgentsTouched = false;
  localStorage.setItem(DRAFT_KEY, text);
}

/** Saves the draft. Overwriting asks first, unless the draft was opened from or saved to that scenario. */
async function saveScenario(el: HTMLElement): Promise<void> {
  const text = state.editor.text;
  const save = (overwrite: boolean) => api<{ path: string; id: string }>("/api/scenario/save", { text, overwrite });
  const ownFile = state.editorSource !== undefined && state.editorSource === state.editor.validation?.summary?.id;
  const saved = await busy(el, "Saving…", async () => {
    try {
      return await save(ownFile);
    } catch (err) {
      if (!(err instanceof ApiError && err.code === "exists")) throw err;
      return confirm(`${err.message}. Overwrite it?`) ? save(true) : undefined;
    }
  });
  if (!saved) return;
  state.scenarios = undefined;
  state.editorSource = saved.id;
  toast(`Saved ${saved.id} to ${saved.path}`);
}

let validateTimer: ReturnType<typeof setTimeout> | undefined;
let validations = 0;

async function validate(): Promise<void> {
  const ticket = ++validations;
  const result = await api<NonNullable<EditorState["validation"]>>("/api/validate", { text: state.editor.text }).catch((err: Error) => ({ ok: false, error: err.message }));
  if (ticket !== validations) return;
  state.editor.validation = result;
  const status = document.getElementById("editor-status");
  if (status) status.innerHTML = validationPanel(result);
  const expected = result.ok && "summary" in result && result.summary ? Object.keys(result.summary.expectedVerdicts) : undefined;
  if (expected && !state.draftAgentsTouched) {
    for (const box of document.querySelectorAll<HTMLInputElement>('form[data-action="run-draft"] input[name="agent"]')) box.checked = expected.includes(box.value);
  }
}

app.addEventListener("click", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (!el || el.tagName === "FORM" || el.tagName === "INPUT") return;
  e.preventDefault();
  void act(el.dataset.action ?? "", el);
});

app.addEventListener("change", (e) => {
  const el = e.target as HTMLInputElement;
  if (el.dataset.action === "select-scenario") {
    if (el.checked) state.selectedScenarios.add(el.dataset.id ?? "");
    else state.selectedScenarios.delete(el.dataset.id ?? "");
    const note = app.querySelector('form[data-action="run-selected"] .note');
    if (note) note.textContent = selectionNote(state.selectedScenarios.size);
  } else if (el.dataset.action === "select-report") {
    if (el.checked) state.selectedReports.add(el.dataset.key ?? "");
    else state.selectedReports.delete(el.dataset.key ?? "");
    const actions = document.getElementById("report-actions");
    if (actions) actions.innerHTML = reportActions(state.selectedReports.size);
  } else if (el.id === "scenario-world") {
    state.scenarioFilter.world = el.value;
    updateScenarioList();
  } else if (el.id === "report-verdict") {
    state.reportFilter.verdict = el.value;
    updateReportList();
  } else if (el.name === "agent" && el.closest('form[data-action="run-draft"]')) {
    state.draftAgentsTouched = true;
  }
});

app.addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement | HTMLTextAreaElement;
  if (el.id === "scenario-q") {
    state.scenarioFilter.q = el.value;
    updateScenarioList();
  } else if (el.id === "report-q") {
    state.reportFilter.q = el.value;
    updateReportList();
  } else if (el.id === "editor-text") {
    state.editor.text = el.value;
    localStorage.setItem(DRAFT_KEY, el.value);
    clearTimeout(validateTimer);
    validateTimer = setTimeout(() => void validate(), 300);
  }
});

app.addEventListener("submit", (e) => {
  e.preventDefault();
  void runFromForm(e.target as HTMLFormElement);
});

document.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement;
  if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || target.closest("input, textarea, select, [contenteditable]")) return;
  const search = app.querySelector<HTMLInputElement>('input[type="search"]');
  if (!search) return;
  e.preventDefault();
  search.focus();
});

function updateScenarioList(): void {
  const list = document.getElementById("scenario-list");
  if (list) list.innerHTML = scenarioList(filterScenarios(state.scenarios ?? [], state.scenarioFilter), state.selectedScenarios);
}

function updateReportList(): void {
  const list = document.getElementById("report-list");
  if (list) list.innerHTML = reportList([...state.memory, ...state.saved], state.reportFilter, state.selectedReports);
}

window.addEventListener("hashchange", () => void render());

async function start(): Promise<void> {
  applyTheme();
  try {
    state.meta = await api<Meta>("/api/meta");
  } catch (err) {
    app.innerHTML = `<main class="view"><div class="status bad">Cannot reach the AgentCrucible server: ${esc((err as Error).message)}. Start <code>agentcrucible ui</code> again and open the address it prints.</div></main>`;
    return;
  }
  await render();
}

void start();
