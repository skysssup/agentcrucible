/**
 * The scenario editor: YAML with a gutter, live validation by the server's own parser, a structured
 * outline, snippets, templates, a draft run with replay of each result, and save to the project.
 */
import type { ReplayResult } from "../../../replay.js";
import type { Job, ReportSummary, Validation } from "../../api.js";
import { api, ApiError } from "../lib/api.js";
import { copy, download, MOD } from "../lib/dom.js";
import { applyEdit, gapDraft, lineOf, offsetOfLine, outline, snippetEdit, snippetLines, SNIPPETS, TEMPLATES, templateNamed, type OutlineItem, type OutlineKind, type SnippetKind } from "../lib/draft.js";
import { clip, esc, href, plural } from "../lib/format.js";
import { patch, runtime } from "../lib/runtime.js";
import { errorLine, gutterLines, highlightYaml } from "../lib/yaml.js";
import { invalidate, load, saveDraft, store, type Meta } from "../lib/state.js";
import { icon, type IconName } from "../icons.js";
import { jobDone, onJob, startRunJob } from "../jobs.js";
import type { Page } from "../routes.js";
import { callout, emptyState, metaItem, pageHead, panel, progressBar } from "../ui/layout.js";
import { confirmDialog, openMenu, toast } from "../ui/overlays.js";
import { button, checkbox, codeChip, copyButton, field, pill, tip, worldChip } from "../ui/primitives.js";
import { checksLabel, suggestKind } from "../ui/scenario-kit.js";
import { expectedMark, verdictText } from "../ui/verdicts.js";

const TEMPLATE_FIRST = TEMPLATES[0];

interface Session {
  text: string;
  /** What the project holds for this draft; the draft is unsaved while it differs. */
  savedText: string;
  /** The scenario id the text was opened from or saved as. */
  source: string | undefined;
  /** The hash the session was last opened for, so a redraw does not open it again. */
  openedFor: string;
}

const session: Session = { text: "", savedText: "", source: undefined, openedFor: "" };
let validation: Validation | undefined;
let checking = false;
let validateTimer: ReturnType<typeof setTimeout> | undefined;
let validateSeq = 0;
/** The agents the user chose for the draft run; undefined until they choose, so the expected ones are preselected. */
let chosen: Set<string> | undefined;
let job: Job | undefined;
let stopJob: (() => void) | undefined;
let replays = new Map<string, ReplayResult | string>();
let leaveGuard: ((e: MouseEvent) => void) | undefined;
let beforeUnload: ((e: BeforeUnloadEvent) => void) | undefined;

const isDirty = () => session.text !== session.savedText;
const textarea = () => document.getElementById("ed-text") as HTMLTextAreaElement | null;
const draftId = (v: Validation | undefined) => (v?.ok ? v.summary.id : undefined);

/** The 1-based line an error belongs to: the line the parser names, else the fault or key the message names. */
export function locateError(text: string, message: string | undefined): number | undefined {
  const named = errorLine(message);
  if (named) return named;
  const items = outline(text);
  const fault = /\bfaults\[(\d+)\]/.exec(message ?? "");
  if (fault) return items.filter((i) => i.kind === "fault")[Number(fault[1])]?.line;
  const key = /^(?:draft: )?([a-z_]+)\b/i.exec(message ?? "")?.[1];
  return items.find((i) => i.kind === "key" && i.depth === 0 && i.label === key)?.line;
}

/** What the draft is: valid with its summary, invalid with the message, or being checked for the first time. */
export function validationPanel(v: Validation | undefined, o: { checking?: boolean; line?: number } = {}): string {
  if (!v) return `<div class="ed-state checking"><span class="spinner"></span>Checking…</div>`;
  const spin = o.checking ? '<span class="spinner" role="status" aria-label="Checking"></span>' : "";
  if (!v.ok) {
    return `<div class="ed-state bad" role="alert"><div class="ed-state-head">${icon("xCircle", 15)}<strong>Not valid</strong>${o.line ? `<button type="button" class="btn btn-link btn-sm" data-action="jump" data-line="${o.line}">Line ${o.line}</button>` : ""}${spin}</div><p class="ed-state-msg">${esc(v.error)}</p></div>`;
  }
  const s = v.summary;
  return `<div class="ed-state ok"><div class="ed-state-head">${icon("checkCircle", 15)}<strong>Valid</strong><code>${esc(s.id)}</code>${spin}</div>
  <div class="ed-state-meta">${s.worlds.map(worldChip).join("")}<span>${esc(checksLabel(s))}</span></div>
  <ul class="ed-expect">${v.expect.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
  ${Object.keys(s.expectedVerdicts).length ? `<p class="ed-state-note">Expected verdicts: ${Object.entries(s.expectedVerdicts).map(([a, x]) => `${codeChip(a)} ${esc(x)}`).join(", ")}</p>` : '<p class="ed-state-note warn-text">No expected_verdicts: agentcrucible check will skip this scenario.</p>'}</div>`;
}

/** What a replay of a recorded result found, trial by trial. */
export function replayPanel(r: Pick<ReplayResult, "reproduced" | "trials">): string {
  const lines = r.trials.map((t) =>
    t.divergence ? `trial ${t.trialIndex}: diverged at ${t.divergence.at} (${t.divergence.field})` : t.reproduced ? `trial ${t.trialIndex}: ${t.replayedCalls} call(s) replayed identically; ${t.verdict} as recorded` : `trial ${t.trialIndex}: graded ${t.verdict}, recorded ${t.recordedVerdict}`
  );
  return `<div class="callout ${r.reproduced ? "ok" : "bad"}" role="status">${icon(r.reproduced ? "checkCircle" : "xCircle", 15)}<div class="callout-body"><strong class="callout-title">${r.reproduced ? "Reproduced: every call, state, and verdict matches the report." : "Not reproduced."}</strong><ul class="ed-replay">${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div></div>`;
}

/** The results of a draft run, each with a link to its report and a replay button. */
export function draftResults(results: ReportSummary[], replayed: Map<string, ReplayResult | string> = new Map()): string {
  if (!results.length) return "";
  return `<ul class="ed-results">${results
    .map((r) => {
      const rep = replayed.get(r.key);
      return `<li><div class="ed-result"><a class="ed-result-main" href="${esc(href("report", r.key))}"><span class="ed-result-head">${verdictText(r.verdict)}<code>${esc(r.agentId)}</code>${expectedMark(r)}</span><span class="ed-result-why">${esc(clip(r.reason ?? "", 140))}</span></a>${button("Replay", { action: "replay", icon: "replay", size: "sm", kind: "ghost", data: { key: r.key }, title: "Run the recorded calls again against fresh worlds and compare" })}</div>${typeof rep === "string" ? `<p class="ed-replay-err">${esc(rep)}</p>` : rep ? replayPanel(rep) : ""}</li>`;
    })
    .join("")}</ul>`;
}

const KIND_ICON: Record<OutlineKind, IconName> = { key: "hash", fault: "zap", setup: "cube", effect: "target", outcome: "checkCircle", invariant: "lock", answer: "message", verdict: "shield" };

/** The outline as buttons that jump to their line. */
export function outlineList(items: OutlineItem[]): string {
  if (!items.length) return '<p class="ed-none">Nothing to outline yet. Start from a template, or type a scenario.</p>';
  return `<ul class="ed-outline">${items
    .map((i) => `<li class="d${i.depth}"><button type="button" class="ed-ol" data-action="jump" data-line="${i.line}"${tip(`Line ${i.line}`)}>${icon(KIND_ICON[i.kind], 12)}<b>${esc(i.label)}</b>${i.detail ? `<span>${esc(clip(i.detail, 64))}</span>` : ""}<em>${i.line}</em></button></li>`)
    .join("")}</ul>`;
}

/** The text a link into the editor asks for: a coverage gap, a blank scenario, or a named template. */
export function draftFor(meta: Pick<Meta, "worlds" | "faults">, q: URLSearchParams): { text: string; note: string } | undefined {
  const template = templateNamed(q.get("template") ?? "");
  if (template) return { text: template.text, note: template.title };
  if (q.get("new") !== "1") return undefined;
  const world = meta.worlds.find((w) => w.name === q.get("world")) ?? (q.get("tool") ? meta.worlds.find((w) => w.tools.some((t) => t.name === q.get("tool"))) : undefined) ?? (q.get("world") || q.get("kind") ? meta.worlds[0] : undefined);
  if (!world) return { text: TEMPLATE_FIRST.text, note: TEMPLATE_FIRST.title };
  const tool = world.tools.find((t) => t.name === q.get("tool")) ?? world.tools.find((t) => t.mutating) ?? world.tools[0];
  const kind = meta.faults.find((f) => f.kind === q.get("kind"))?.kind ?? suggestKind(meta.faults.map((f) => f.kind), Boolean(tool?.mutating));
  return { text: gapDraft(meta, world.name, tool.name, kind), note: `${world.name}/${tool.name} with ${kind}` };
}

function targetPath(): string {
  const id = draftId(validation);
  return store.meta.scenarioDir ? `${store.meta.scenarioDir}/${id ?? "<id>"}.yaml` : "";
}

function badLine(): number | undefined {
  return validation && !validation.ok ? locateError(session.text, validation.error) : undefined;
}

/** The highlighted text, with the line an error names underlined. */
function highlighted(): string {
  const bad = badLine();
  const lines = highlightYaml(session.text).split("\n");
  if (bad && lines[bad - 1] !== undefined) lines[bad - 1] = `<span class="ed-bad">${lines[bad - 1]}</span>`;
  return `${lines.join("\n")}\n`;
}

function statusHtml(): string {
  return validationPanel(validation, { checking, line: badLine() });
}

function position(): string {
  const ta = textarea();
  if (!ta) return "Ln 1, Col 1";
  const upTo = session.text.slice(0, ta.selectionStart);
  return `Ln ${lineOf(session.text, ta.selectionStart)}, Col ${upTo.length - upTo.lastIndexOf("\n")}`;
}

function footHtml(): string {
  const lines = session.text.split("\n").length;
  return `<span id="ed-pos">${esc(position())}</span><span>${plural(lines, "line")}</span><span>YAML · 2 spaces</span><span class="grow"></span><span id="ed-target"${tip(store.meta.scenarioDir ? "Where Save writes the file" : "")}>${esc(store.meta.scenarioDir ? `saves to ${targetPath()}` : "not saved to disk")}</span>`;
}

function agentChoice(): Set<string> {
  if (chosen) return chosen;
  return new Set(validation?.ok ? Object.keys(validation.summary.expectedVerdicts) : []);
}

function runHtml(): string {
  const picked = agentChoice();
  const expected = validation?.ok ? validation.summary.expectedVerdicts : {};
  const running = job?.status === "running";
  const progress = job ? `<div class="ed-job">${job.status === "running" ? `${progressBar(job.total ? job.done / job.total : null, { label: "Draft run progress" })}<span class="muted small">${esc(job.detail || "Running")}${job.total ? ` · ${job.done}/${job.total}` : ""}</span>` : job.status === "failed" ? callout("bad", esc(job.error ?? "The run failed."), { title: "The draft run failed" }) : `<span class="muted small">${esc(job.detail)}</span>`}</div>` : "";
  return `<form class="ed-run" data-submit="run-draft">
    <fieldset class="ed-agents"><legend class="sr-only">Agents to run the draft against</legend>${store.meta.agents
      .map((a) => `<span class="ed-agent"${tip(a.description || a.source)}>${checkbox({ name: "agent", value: a.id, checked: picked.has(a.id), label: a.id, action: "pick-agent" })}${expected[a.id] ? `<span class="ed-exp">${esc(expected[a.id].replace(/_/g, " ").toLowerCase())}</span>` : ""}</span>`)
      .join("")}</fieldset>
    <div class="ed-run-opts">${field("Trials", `<input class="input mono" type="number" name="trials" min="1" max="1000" value="${store.prefs.trials}" inputmode="numeric" aria-label="Trials"/>`)}${field("Seed", '<input class="input mono" name="seed" placeholder="default" autocomplete="off" spellcheck="false" aria-label="Seed"/>', { optional: true })}</div>
    ${button(running ? "Running…" : "Run draft", { type: "submit", kind: "secondary", icon: "play", disabled: running || !validation?.ok, attrs: 'data-run-submit=""', title: validation?.ok ? `Run in memory; nothing is written until you save (${MOD}+Enter)` : "Fix the errors first" })}
    <p class="field-hint">Drafts run in memory. With no agent checked, the agents in expected_verdicts run.</p>
  </form>${progress}<div id="ed-results">${draftResults(job?.results ?? [], replays)}</div>`;
}

function refreshCode(): void {
  const ta = textarea();
  patch("ed-hl", highlighted());
  patch("ed-gutter-lines", gutterLines(session.text, badLine()));
  patch("ed-foot", footHtml());
  patch("ed-outline", outlineList(outline(session.text)));
  if (ta) syncScroll(ta);
  const file = document.getElementById("ed-file");
  if (file) file.textContent = draftId(validation) ? `${draftId(validation)}.yaml` : session.source ? `${session.source}.yaml` : "draft.yaml";
  document.getElementById("ed-dirty")?.toggleAttribute("hidden", !isDirty());
}

function refreshStatus(): void {
  patch("ed-status", statusHtml());
  patch("ed-run", runHtml());
  patch("ed-foot", footHtml());
  patch("ed-gutter-lines", gutterLines(session.text, badLine()));
  patch("ed-hl", highlighted());
  const file = document.getElementById("ed-file");
  if (file) file.textContent = draftId(validation) ? `${draftId(validation)}.yaml` : session.source ? `${session.source}.yaml` : "draft.yaml";
  const save = document.querySelector<HTMLButtonElement>('[data-action="save"]');
  if (save) save.title = validation && !validation.ok ? "Fix the errors first" : store.meta.scenarioDir ? `Save to ${targetPath()} (${MOD}+S)` : 'Add "scenarioDirs" to the config file to save scenarios from the editor';
}

function syncScroll(ta: HTMLTextAreaElement): void {
  const hl = document.getElementById("ed-hl-wrap");
  if (hl) {
    hl.scrollTop = ta.scrollTop;
    hl.scrollLeft = ta.scrollLeft;
  }
  const gutter = document.getElementById("ed-gutter-lines");
  if (gutter) gutter.style.transform = `translateY(${-ta.scrollTop}px)`;
}

async function validate(): Promise<void> {
  const seq = ++validateSeq;
  checking = true;
  patch("ed-status", statusHtml());
  const result = await api<Validation>("/api/validate", { text: session.text }).catch((err: Error): Validation => ({ ok: false, error: err.message }));
  if (seq !== validateSeq) return;
  checking = false;
  validation = result;
  refreshStatus();
}

function scheduleValidate(): void {
  clearTimeout(validateTimer);
  checking = true;
  patch("ed-status", statusHtml());
  validateTimer = setTimeout(() => void validate(), 350);
}

function edited(): void {
  saveDraft(session.text);
  refreshCode();
  scheduleValidate();
}

/** Replaces the whole text (a template, a copy, a file from the project) and starts checking it. */
function setText(text: string, source: string | undefined, savedText: string): void {
  session.text = text;
  session.source = source;
  session.savedText = savedText;
  validation = undefined;
  chosen = undefined;
  job = undefined;
  replays = new Map();
  saveDraft(text);
}

async function confirmReplace(what: string): Promise<boolean> {
  if (!isDirty() || !session.text.trim() || !store.prefs.confirm) return true;
  return confirmDialog({ title: "Replace the editor text?", body: `The editor holds changes that are not saved to the project. ${esc(what)} takes their place.`, confirm: "Replace", icon: "edit" });
}

async function useText(text: string, what: string, source: string | undefined, saved: string): Promise<void> {
  if (!(await confirmReplace(what))) return;
  setText(text, source, saved);
  await runtime.rerender();
  textarea()?.focus();
}

/** Inserts text in place of from..to the way typing does, so the browser's undo still works. */
function insert(ta: HTMLTextAreaElement, from: number, to: number, text: string): void {
  ta.focus();
  ta.setSelectionRange(from, to);
  if (document.execCommand("insertText", false, text)) return;
  ta.setRangeText(text, from, to, "end");
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}

function jump(line: number): void {
  const ta = textarea();
  if (!ta) return;
  const at = offsetOfLine(ta.value, line);
  const end = ta.value.indexOf("\n", at);
  ta.focus();
  ta.setSelectionRange(at, end < 0 ? ta.value.length : end);
  const height = parseFloat(getComputedStyle(ta).lineHeight) || 20;
  ta.scrollTop = Math.max(0, (line - 4) * height);
  syncScroll(ta);
  patch("ed-pos", position());
}

function addSnippet(kind: SnippetKind): void {
  const ta = textarea();
  if (!ta) return;
  const lines = snippetLines(kind, session.text, store.meta.worlds, store.meta.faults.map((f) => f.kind));
  const edit = snippetEdit(session.text, kind, lines);
  const at = ta.selectionStart;
  const lead = at === 0 || session.text[at - 1] === "\n" ? "" : "\n";
  const e = edit ?? { from: at, to: at, insert: `${lead}${lines.join("\n")}\n` };
  const after = applyEdit(session.text, e);
  insert(ta, e.from, e.to, e.insert);
  if (ta.value === after) jump(lineOf(after, e.from + e.insert.length - 1));
}

function indentEdit(ta: HTMLTextAreaElement, outdent: boolean): void {
  const value = ta.value;
  const start = value.lastIndexOf("\n", ta.selectionStart - 1) + 1;
  const endIdx = value.indexOf("\n", ta.selectionEnd);
  const end = endIdx < 0 ? value.length : endIdx;
  const block = value.slice(start, end).split("\n");
  const next = block.map((l) => (outdent ? l.replace(/^ {1,2}/, "") : `  ${l}`));
  insert(ta, start, end, next.join("\n"));
  ta.setSelectionRange(start, start + next.join("\n").length);
}

async function save(el?: HTMLElement): Promise<void> {
  if (!store.meta.scenarioDir) return void toast('Add "scenarioDirs" to the config file to save scenarios from the editor.', "bad", { title: "No scenario directory" });
  if (validation && !validation.ok) return void toast(validation.error, "bad", { title: "The draft is not valid" });
  el?.classList.add("is-busy");
  const text = session.text;
  const id = draftId(validation);
  const post = (overwrite: boolean) => api<{ path: string; id: string }>("/api/scenario/save", { text, overwrite });
  try {
    let saved: { path: string; id: string };
    try {
      saved = await post(Boolean(session.source && session.source === id));
    } catch (err) {
      if (!(err instanceof ApiError) || err.code !== "exists") throw err;
      const ok = !store.prefs.confirm || (await confirmDialog({ title: "Overwrite the file?", body: `${esc(err.message)}. Saving replaces it with the editor text.`, confirm: "Overwrite", danger: true, icon: "save" }));
      if (!ok) return;
      saved = await post(true);
    }
    session.savedText = text;
    session.source = saved.id;
    store.scenarioDetails.delete(saved.id);
    invalidate("scenarios", "coverage", "activity");
    await load.scenarios(true);
    runtime.refreshShell();
    history.replaceState(null, "", href("editor", saved.id));
    session.openedFor = location.hash;
    toast(saved.path, "ok", { title: `Saved ${saved.id}`, action: { label: "Open", href: href("scenario", saved.id) } });
    await runtime.rerender();
  } catch (err) {
    toast((err as Error).message, "bad", { title: "The scenario was not saved" });
  } finally {
    el?.classList.remove("is-busy");
  }
}

async function runDraft(form: HTMLFormElement): Promise<void> {
  if (!validation?.ok) return void toast("Fix the errors first.", "bad");
  const data = new FormData(form);
  const agents = data.getAll("agent").map(String);
  const trials = Math.max(1, Math.floor(Number(data.get("trials")) || 1));
  const seed = String(data.get("seed") ?? "").trim();
  const submit = form.querySelector<HTMLButtonElement>("[data-run-submit]");
  submit?.classList.add("is-busy");
  try {
    stopJob?.();
    replays = new Map();
    job = await startRunJob({ text: session.text, agents, trials, ...(seed ? { seed } : {}) });
    patch("ed-run", runHtml());
    const id = job.jobId;
    stopJob = onJob(id, (j) => {
      job = j;
      if (location.hash.startsWith("#/editor")) patch("ed-run", runHtml());
    });
    const done = await jobDone(id);
    job = done;
    if (location.hash.startsWith("#/editor")) patch("ed-run", runHtml());
    if (done.status === "failed") toast(done.error ?? "The run failed.", "bad", { title: "The draft run failed" });
  } catch (err) {
    toast((err as Error).message, "bad", { title: "The run did not start" });
  } finally {
    submit?.classList.remove("is-busy");
  }
}

async function open(ctx: { arg?: string; query: URLSearchParams }): Promise<void> {
  if (ctx.arg) {
    if (session.source === ctx.arg && session.text) return;
    if (!(await confirmReplace(`The file of ${ctx.arg}`))) return void history.replaceState(null, "", "#/editor");
    const d = await load.scenario(ctx.arg, true);
    if (!d.text) throw new Error(`${ctx.arg} is not loaded from a file, so there is no text to edit. Duplicate it from its page instead.`);
    return setText(d.text, ctx.arg, d.text);
  }
  const wanted = draftFor(store.meta, ctx.query);
  if (wanted) {
    if (!(await confirmReplace(wanted.note))) return void history.replaceState(null, "", "#/editor");
    setText(wanted.text, undefined, wanted.text);
    return void history.replaceState(null, "", "#/editor");
  }
  if (store.draft?.trim() && store.draft !== session.text) return setText(store.draft, undefined, "");
  if (!session.text) setText(TEMPLATE_FIRST.text, undefined, TEMPLATE_FIRST.text);
}

function templateCards(): string {
  return TEMPLATES.map(
    (t) => `<button type="button" class="ed-template" data-action="template" data-name="${esc(t.name)}"><span class="ed-template-icon">${icon(t.icon, 15)}</span><span class="ed-template-text"><b>${esc(t.title)}</b><span>${esc(t.summary)}</span></span></button>`
  ).join("");
}

function referenceHtml(): string {
  const m = store.meta;
  return `<div class="ed-ref"><div><span class="eyebrow">Fault kinds <em>click to copy</em></span><div class="chip-row">${m.faults.map((f) => `<button type="button" class="code-chip" data-action="copy" data-copy="${esc(f.kind)}"${tip(`${f.description} (${f.stage})`)}>${esc(f.kind)}</button>`).join("")}</div></div>
  <div><span class="eyebrow">Worlds and tools <em>click to copy</em></span>${m.worlds.map((w) => `<div class="ed-ref-world">${worldChip(w.name)}<span class="chip-row">${w.tools.map((t) => `<button type="button" class="code-chip" data-action="copy" data-copy="${esc(t.name)}"${tip(t.description)}>${esc(t.name)}</button>`).join("")}</span></div>`).join("")}</div></div>`;
}

function editorHtml(): string {
  const id = draftId(validation);
  const dirty = isDirty();
  const head = pageHead({
    title: "Scenario editor",
    desc: `Checked as you type by the same parser the CLI uses. Run the draft against any agents and replay a result, then ${store.meta.scenarioDir ? `save it to <code>${esc(store.meta.scenarioDir)}</code>` : "download it (add scenarioDirs to the config file to save from here)"}.`,
    meta: [metaItem("file", `<code>${esc(session.source ? `${session.source}.yaml` : "new scenario")}</code>`, session.source ? "Opened from the project" : "Not saved yet"), metaItem("folder", store.meta.scenarioDir ? `Saves to <code>${esc(store.meta.scenarioDir)}</code>` : "No scenario directory configured", store.meta.scenarioRoots.join("\n"))],
    actions: `${button("Templates", { action: "templates", icon: "stack", iconEnd: "chevronDown", attrs: 'aria-haspopup="menu"' })}${button("More", { action: "more", icon: "moreH", iconEnd: "chevronDown", attrs: 'aria-haspopup="menu"' })}${button("Save to project", { action: "save", icon: "save", kind: "primary", kbd: `${MOD}S`, disabled: false, title: store.meta.scenarioDir ? `Save to ${targetPath()}` : 'Add "scenarioDirs" to the config file to save scenarios from the editor' })}`,
  });
  return `<div class="page ed-page">${head}
  <div class="ed-layout">
    <section class="panel ed-pane" aria-label="Scenario text">
      <div class="ed-bar"><span class="ed-file">${icon("file", 13)}<span id="ed-file">${esc(id ? `${id}.yaml` : session.source ? `${session.source}.yaml` : "draft.yaml")}</span><span id="ed-dirty" class="pill warn"${dirty ? "" : " hidden"}>unsaved</span></span><span class="grow"></span><span class="ed-hint"><kbd>${MOD}</kbd><kbd>S</kbd> save <kbd>${MOD}</kbd><kbd>↵</kbd> run <kbd>Esc</kbd> leave the text</span>${button("Insert", { action: "insert", icon: "plus", iconEnd: "chevronDown", size: "sm", kind: "ghost", attrs: 'aria-haspopup="menu"', title: "Insert a fault, effect, invariant, or answer check where it belongs" })}</div>
      <div class="ed-code">
        <div class="ed-gutter" aria-hidden="true"><div id="ed-gutter-lines">${gutterLines(session.text, badLine())}</div></div>
        <div class="ed-body"><pre class="ed-hl code yaml" id="ed-hl-wrap" aria-hidden="true"><code id="ed-hl">${highlighted()}</code></pre><textarea id="ed-text" class="ed-text" data-input="ed-text" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off" aria-label="Scenario YAML">${esc(session.text)}</textarea></div>
      </div>
      <div class="ed-foot" id="ed-foot">${footHtml()}</div>
    </section>
    <div class="ed-side">
      ${panel({ title: "Validation", icon: "checkCircle", meta: "as you type" }, `<div id="ed-status">${statusHtml()}</div>`)}
      ${panel({ title: "Outline", icon: "list", meta: "click to jump", flush: true }, `<div id="ed-outline" class="ed-outline-wrap">${outlineList(outline(session.text))}</div>`)}
      ${panel({ title: "Run and replay", icon: "play", meta: "in memory" }, `<div id="ed-run">${runHtml()}</div>`)}
    </div>
  </div>
  <div class="grid g-7-5 mt-16">
    ${panel({ title: "Start from a template", icon: "stack", meta: `${TEMPLATES.length} starting points; each one parses and runs` }, `<div class="ed-templates">${templateCards()}</div>`)}
    ${panel({ title: "Quick reference", icon: "book", actions: `<a class="link-quiet" href="#/catalog">Catalog ${icon("arrowRight", 12)}</a>` }, referenceHtml())}
  </div>
</div>`;
}

const page: Page = {
  nav: "editor",
  title: (ctx) => (ctx.arg ? `Edit ${ctx.arg}` : "Editor"),
  skeleton: "detail",
  async render(ctx) {
    await load.scenarios().catch(() => undefined);
    if (session.openedFor !== location.hash) {
      try {
        await open(ctx);
      } catch (err) {
        return `<div class="page">${pageHead({ title: "Scenario editor" })}${emptyState({ icon: "alert", title: "The scenario cannot be opened", text: esc((err as Error).message), actions: `${button("Scenarios", { href: "#/scenarios", size: "sm" })}${button("Blank editor", { href: "#/editor", kind: "primary", size: "sm" })}` })}</div>`;
      }
      session.openedFor = location.hash;
    }
    return editorHtml();
  },
  mount() {
    const ta = textarea();
    if (ta) {
      const sync = () => patch("ed-pos", position());
      for (const type of ["keyup", "click", "focus", "select"]) ta.addEventListener(type, sync);
      ta.addEventListener("scroll", () => syncScroll(ta));
      syncScroll(ta);
    }
    if (validation && !checking) refreshStatus();
    else void validate();
    leaveGuard = (e) => {
      const link = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#/"]');
      if (!link || !isDirty() || e.defaultPrevented || link.getAttribute("href")?.startsWith("#/editor")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const to = link.getAttribute("href") ?? "#/";
      void confirmDialog({ title: "Leave the editor?", body: "The draft has changes that are not saved to the project. It stays in this browser, and the editor opens it again.", confirm: "Leave", icon: "edit" }).then((ok) => {
        if (ok) location.hash = to;
      });
    };
    beforeUnload = (e) => {
      if (isDirty()) e.preventDefault();
    };
    document.addEventListener("click", leaveGuard, true);
    window.addEventListener("beforeunload", beforeUnload);
  },
  unmount() {
    session.openedFor = "";
    clearTimeout(validateTimer);
    validateSeq++;
    checking = false;
    stopJob?.();
    stopJob = undefined;
    if (leaveGuard) document.removeEventListener("click", leaveGuard, true);
    if (beforeUnload) window.removeEventListener("beforeunload", beforeUnload);
    leaveGuard = beforeUnload = undefined;
    if (isDirty()) toast("Your unsaved draft stays in this browser. Open the editor to continue.", "info", { title: "Draft kept" });
  },
  keys(e) {
    const ta = textarea();
    const inText = ta !== null && e.target === ta;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void save(document.querySelector<HTMLElement>('[data-action="save"]') ?? undefined);
      return true;
    }
    if (mod && e.key === "Enter") {
      e.preventDefault();
      const form = document.querySelector<HTMLFormElement>("form.ed-run");
      if (form) void runDraft(form);
      return true;
    }
    if (!inText || mod || e.altKey) return false;
    if (e.key === "Escape") {
      ta.blur();
      return true;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      if (ta.selectionStart !== ta.selectionEnd || e.shiftKey) indentEdit(ta, e.shiftKey);
      else insert(ta, ta.selectionStart, ta.selectionEnd, "  ");
      return true;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      const before = ta.value.slice(0, ta.selectionStart);
      const line = before.slice(before.lastIndexOf("\n") + 1);
      const indent = /^\s*/.exec(line)![0] + (/:\s*[|>][-+]?\s*$/.test(line) || /:\s*$/.test(line) ? "  " : "");
      e.preventDefault();
      insert(ta, ta.selectionStart, ta.selectionEnd, `\n${indent}`);
      return true;
    }
    return false;
  },
  actions: {
    jump: (el) => jump(Number(el.dataset.line)),
    templates: (el) =>
      openMenu(
        [{ heading: "Replace the text with" }, ...TEMPLATES.map((t) => ({ label: t.title, icon: t.icon, hint: t.name, run: () => void useText(t.text, t.title, undefined, t.text) }))],
        el
      ),
    template: (el) => {
      const t = templateNamed(el.dataset.name ?? "");
      if (t) void useText(t.text, t.title, undefined, t.text);
    },
    insert: (el) => openMenu([{ heading: "Insert where it belongs" }, ...SNIPPETS.map((s) => ({ label: s.label, icon: s.icon, hint: s.where, run: () => addSnippet(s.kind) }))], el, { align: "end" }),
    more: (el) =>
      openMenu(
        [
          { label: "Download", icon: "download", run: () => download(`${(draftId(validation) ?? "scenario").replace(/\//g, "-")}.yaml`, session.text, "text/yaml") },
          { label: "Copy text", icon: "copy", run: () => void copy(session.text) },
          ...(draftId(validation) && session.source ? [{ label: "Open the scenario page", icon: "arrowRight" as const, href: href("scenario", session.source) }] : []),
          "-" as const,
          ...(isDirty() && session.source ? [{ label: "Revert to the saved file", icon: "history" as const, run: () => void useText(session.savedText, "The saved file", session.source, session.savedText) }] : []),
          { label: "Start over", icon: "trash" as const, danger: true, run: () => void useText(TEMPLATE_FIRST.text, "The first template", undefined, TEMPLATE_FIRST.text) },
        ],
        el,
        { align: "end" }
      ),
    save: (el) => save(el),
    "pick-agent": () => {
      chosen = new Set(Array.from(document.querySelectorAll<HTMLInputElement>('form.ed-run input[name="agent"]:checked')).map((b) => b.value));
    },
    replay: async (el) => {
      const key = el.dataset.key ?? "";
      el.classList.add("is-busy");
      try {
        replays.set(key, await api<ReplayResult>("/api/replay", { key }));
      } catch (err) {
        replays.set(key, (err as Error).message);
      } finally {
        patch("ed-results", draftResults(job?.results ?? [], replays));
      }
    },
  },
  inputs: {
    "ed-text": (el) => {
      session.text = el.value;
      edited();
    },
  },
  submit: {
    "run-draft": (form) => runDraft(form),
  },
};

export default page;
