/**
 * Settings: the profile, how the console looks and behaves, this workspace's paths and limits,
 * integrations (CI, MCP clients, model providers), the session, the history, shortcuts, and about.
 */
import type { Profile, SystemInfo } from "../../api.js";
import { api, setSessionToken } from "../lib/api.js";
import { download, pickFile } from "../lib/dom.js";
import { absTime, bytes, esc, initials, num, plural, relTime } from "../lib/format.js";
import { runtime } from "../lib/runtime.js";
import { clearRecent, clearSearches, DEFAULT_PREFS, invalidate, load, projectName, resetPrefs, saveDraft, savePrefs, store, type Prefs } from "../lib/state.js";
import { applyTheme } from "../lib/theme.js";
import { icon, type IconName } from "../icons.js";
import { ALL_NAV, type Page } from "../routes.js";
import { codeView } from "../ui/code.js";
import { callout, facts, metaItem, pageHead, panel } from "../ui/layout.js";
import { confirmDialog, toast } from "../ui/overlays.js";
import { avatar, button, codeChip, copyButton, field, pill, segmented, select, toggle } from "../ui/primitives.js";
import { shortcutsHtml } from "../ui/shortcuts.js";
import { badge, VERDICT_META } from "../ui/verdicts.js";

export const SECTIONS: Array<{ id: string; label: string; icon: IconName; desc: string }> = [
  { id: "profile", label: "Profile", icon: "user", desc: "Your name on runs and events" },
  { id: "preferences", label: "Preferences", icon: "sliders", desc: "Theme, density, defaults" },
  { id: "workspace", label: "Workspace", icon: "folder", desc: "Paths, config, limits" },
  { id: "integrations", label: "Integrations", icon: "plug", desc: "CI, MCP clients, models" },
  { id: "security", label: "Security", icon: "lock", desc: "Session and token" },
  { id: "data", label: "Data", icon: "archive", desc: "History, export, import" },
  { id: "shortcuts", label: "Shortcuts", icon: "keyboard", desc: "Keys for everything" },
  { id: "about", label: "About", icon: "info", desc: "Version and system" },
];

export const AVATAR_COLORS = ["clay", "moss", "slate", "plum", "ochre", "teal"] as const;

const DOCS: Array<[string, string]> = [
  ["docs/ui.md", "this console: pages, search, jobs, history, the API"],
  ["docs/scenarios.md", "the scenario file format"],
  ["docs/grading.md", "how verdicts are decided"],
  ["docs/sweeps.md", "fault sweeps and resilience scores"],
  ["docs/ci.md", "the GitHub Action and the CI gate"],
  ["docs/model-agents.md", "provider:model agents and recorded responses"],
  ["docs/mcp.md", "the MCP server mode"],
  ["docs/cli.md", "every command and flag"],
];

/** The section a route names, or the first one. */
export function sectionOf(arg: string | undefined): string {
  return SECTIONS.some((s) => s.id === arg) ? arg! : "profile";
}

/** The profile form: a preview and the fields, every value escaped. */
export function profileForm(p: Profile): string {
  const colors = AVATAR_COLORS.map((c) => `<label class="radio-card set-swatch" title="${esc(c)}"><input type="radio" name="color" value="${esc(c)}"${c === p.color ? " checked" : ""} data-input="color-preview"/>${avatar(p.name || "?", c, "sm")}<span>${esc(c)}</span></label>`).join("");
  return `<form class="set-form" data-submit="profile" novalidate>
  <div class="set-profile-preview" id="profile-preview">${profilePreview(p)}</div>
  <div class="set-fields">
    ${field("Name", `<input class="input" name="name" value="${esc(p.name)}" maxlength="60" required autocomplete="name" data-input="profile-name"/>`, { hint: "Shown on the runs, sweeps, and events you start." })}
    ${field("Role", `<input class="input" name="role" value="${esc(p.role)}" maxlength="60" autocomplete="organization-title"/>`, { optional: true })}
    ${field("Email", `<input class="input" type="email" name="email" value="${esc(p.email)}" maxlength="120" autocomplete="email"/>`, { optional: true, hint: "Kept in the history file only; nothing is sent anywhere." })}
    <div class="field"><span class="field-label">Avatar color</span><div class="set-swatches" role="radiogroup" aria-label="Avatar color">${colors}</div></div>
    <div class="set-actions">${button("Save profile", { type: "submit", kind: "primary", icon: "check" })}</div>
  </div>
</form>`;
}

function profilePreview(p: Profile): string {
  return `${avatar(p.name || "?", p.color, "lg")}<div><b>${esc(p.name || "Your name")}</b><span>${esc(p.role || "Operator")}</span>${p.email ? `<span class="mono small">${esc(p.email)}</span>` : ""}${p.createdAt ? `<span class="muted small" title="${esc(absTime(p.createdAt))}">Since ${esc(new Date(p.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }))}</span>` : ""}</div>`;
}

function prefRow(label: string, hint: string, control: string): string {
  return `<div class="set-row"><div class="set-row-text"><span class="set-row-label">${esc(label)}</span><span class="set-row-hint">${hint}</span></div><div class="set-row-control">${control}</div></div>`;
}

/** The preferences, each control showing the current value. */
export function preferencesBody(prefs: Prefs): string {
  const theme = (["system", "light", "dark"] as const)
    .map((t) => {
      const ic: IconName = t === "system" ? "monitor" : t === "light" ? "sun" : "moon";
      const label = t === "system" ? "Match the system" : t === "light" ? "Light" : "Dark";
      return `<label class="radio-card set-theme"><input type="radio" name="theme" value="${t}"${prefs.theme === t ? " checked" : ""} data-input="pref-theme"/>${icon(ic, 15)}<span>${label}</span></label>`;
    })
    .join("");
  const landing = ALL_NAV.filter((n) => n.route !== "settings").map((n) => ({ value: n.route, label: n.label }));
  const appearance = panel(
    { title: "Appearance", icon: "sun", meta: "applies at once, kept in this browser" },
    `${prefRow("Theme", "Warm paper by day, graphite at night. <kbd>T</kbd> switches.", `<div class="set-themes" role="radiogroup" aria-label="Theme">${theme}</div>`)}
    ${prefRow("Density", "Compact rows fit more results on screen.", segmented("pref-density", prefs.density, [{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }], { label: "Density" }))}
    ${prefRow("Sidebar", "Collapsed shows icons only. <kbd>[</kbd> toggles.", segmented("pref-sidebar", prefs.sidebar, [{ value: "expanded", label: "Expanded" }, { value: "collapsed", label: "Collapsed" }], { label: "Sidebar" }))}
    ${prefRow("Motion", "Reduce turns off transitions and animated progress.", segmented("pref-motion", prefs.motion, [{ value: "system", label: "Match the system" }, { value: "reduce", label: "Reduce" }], { label: "Motion" }))}`
  );
  const behavior = panel(
    { title: "Behavior", icon: "sliders", actions: button("Reset to defaults", { action: "reset-prefs", size: "sm", icon: "refresh", kind: "ghost" }) },
    `${prefRow("Times", 'Relative ("3 h ago") or the date and time.', segmented("pref-time", prefs.time, [{ value: "relative", label: "Relative" }, { value: "absolute", label: "Absolute" }], { label: "Times" }))}
    ${prefRow("Rows per page", "The page size of tables that are opened next.", select({ input: "pref-pagesize", value: String(prefs.pageSize), label: "Rows per page", options: [10, 25, 50, 100].map((n) => ({ value: String(n), label: String(n) })) }))}
    ${prefRow("Trials", "Preselected in the run launcher; more trials catch flaky behavior.", select({ input: "pref-trials", value: String(prefs.trials), label: "Trials", options: [1, 2, 3, 5, 10].map((n) => ({ value: String(n), label: plural(n, "trial") })) }))}
    ${prefRow("Start page", "The page the console opens on.", select({ input: "pref-landing", value: prefs.landing, label: "Start page", options: landing }))}
    ${prefRow("Confirm before deleting", "Ask before deleting reports or scenarios, clearing history, or replacing the baseline.", toggle({ checked: prefs.confirm, attrs: 'data-input="pref-confirm" aria-label="Confirm before deleting"' }))}
    ${prefRow("Notify when runs finish", "A toast when a run or sweep that runs in the background finishes.", toggle({ checked: prefs.notifyRuns, attrs: 'data-input="pref-notify" aria-label="Notify when runs finish"' }))}`
  );
  return `${appearance}${behavior}`;
}

function workspaceBody(sys: SystemInfo | undefined): string {
  const m = store.meta;
  const roots = m.scenarioRoots.map((r) => `<code class="code-inline">${esc(r)}</code>`).join(" ");
  const paths = panel(
    { title: "Project", icon: "folder", actions: copyButton(m.cwd, "Copy path", { size: "sm" }) },
    facts([
      ["Name", `<b>${esc(projectName(m))}</b>`],
      ["Directory", `<code class="code-inline">${esc(m.cwd)}</code>`],
      ["Scenario directories", roots],
      ["New scenarios go to", m.scenarioDir ? `<code class="code-inline">${esc(m.scenarioDir)}</code>` : '<span class="muted">nowhere: add "scenarioDirs" to the config file</span>'],
      ["Saved reports", `<code class="code-inline">${esc(m.outDir)}</code>`],
      ["Baseline", `<code class="code-inline">${esc(m.baselinePath)}</code>`],
      ["Fails at", `${badge(m.failOn)} <span class="muted small">or worse</span>`],
      ["Registry", `${plural(m.agents.length, "agent")} · ${plural(m.worlds.length, "world")} · ${plural(m.faults.length, "fault kind")}`],
    ])
  );
  const values = sys?.config.values ?? {};
  const config = panel(
    { title: "Config file", icon: "code", meta: sys?.config.path ? `<code>${esc(sys.config.path)}</code>` : "none found" },
    Object.keys(values).length ? codeView(JSON.stringify(values, null, 2), "json", { maxHeight: 280 }) : `<p class="muted small">No config file in this directory, so the defaults apply. <code class="code-inline">agentcrucible init</code> writes one with every option.</p>`
  );
  const limits = sys
    ? panel(
        { title: "Limits", icon: "gauge" },
        facts([
          ["Trial timeout", sys.limits.timeoutMs ? `${num(sys.limits.timeoutMs)} ms` : "none"],
          ["Concurrency", plural(sys.limits.concurrency, "trial") + " at a time"],
          ["Session reports kept", num(sys.limits.memoryReports)],
          ["History kept", `${num(sys.limits.keptRuns)} runs · ${num(sys.limits.keptSweeps)} sweeps`],
        ])
      )
    : "";
  const demo = m.demoWorkspace ? callout("accent", "This is the generated Northwind demo in a temporary directory. Runs, edits, and deletions here never touch your own project.", { title: "Demo workspace", icon: "spark" }) : "";
  return `${demo}${paths}<div class="grid g-2 mt-16">${config}${limits}</div>`;
}

function integrationsBody(sys: SystemInfo | undefined): string {
  const workflows = sys?.ci.workflows ?? [];
  const yaml = `- uses: skysssup/agentcrucible@v2\n  with:\n    command: check\n- uses: skysssup/agentcrucible@v2\n  with:\n    tag: smoke\n    agent: ./agents/my-agent.mjs\n    baseline: agentcrucible-baseline.json`;
  const ci = panel(
    { title: "GitHub Actions", icon: "workflow", meta: workflows.length ? plural(workflows.length, "workflow") + " found" : "not set up", actions: copyButton(yaml, "Copy steps", { size: "sm" }) },
    `${workflows.length ? `<ul class="set-list">${workflows.map((w) => `<li>${icon("checkCircle", 13, "ok-text")}<code class="code-inline">.github/workflows/${esc(w)}</code></li>`).join("")}</ul>` : `<p class="set-p">Gate pull requests: the action holds the scenarios to their expected verdicts, runs your agent, annotates failing scenarios, and fails only on regressions against the baseline.</p>`}${codeView(yaml, "yaml")}<p class="set-note">Inputs and a full workflow: docs/ci.md in the repository.</p>`
  );
  const mcpCmd = "npx agentcrucible mcp --scenario payments/timeout-after-commit --out reports";
  const mcpJson = JSON.stringify({ mcpServers: { agentcrucible: { command: "npx", args: ["-y", "agentcrucible", "mcp", "--scenario", "payments/timeout-after-commit", "--out", "reports"], cwd: store.meta.cwd } } }, null, 2);
  const mcp = panel(
    { title: "MCP clients", icon: "plug", actions: copyButton(mcpJson, "Copy config", { size: "sm" }) },
    `<p class="set-p">Serve one scenario's mock tools to a desktop assistant or any MCP client; each session is graded like a run and written to the report directory.</p><div class="set-cmd">${codeChip(mcpCmd)}${copyButton(mcpCmd, "Copy", { size: "sm", iconOnly: true })}</div>${codeView(mcpJson, "json")}<p class="set-note">More in docs/mcp.md.</p>`
  );
  const providers = panel(
    { title: "Model providers", icon: "cpu", meta: `${(sys?.providers ?? []).filter((p) => p.configured).length} of ${(sys?.providers ?? []).length} configured`, flush: true },
    `<ul class="list">${(sys?.providers ?? [])
      .map((p) => `<li><div class="list-row"><span class="glyph">${icon("cpu", 13)}</span><span class="grow"><span class="title">${esc(p.label)}</span><span class="detail"><code>${esc(p.variable)}</code></span></span>${p.configured ? pill("configured", "ok") : pill("not set", "outline")}</div></li>`)
      .join("")}</ul><div class="panel-body set-provider-foot"><p class="muted small">Name a model as an agent, such as <code class="code-inline">openai:gpt-4o-mini</code>. With <code class="code-inline">--record cassettes</code> the responses are kept, so later runs need no key. Keys come from the environment of the process that started this console and are never shown.</p></div>`
  );
  return `${ci}<div class="grid g-2 mt-16">${mcp}${providers}</div>`;
}

function securityBody(sys: SystemInfo | undefined): string {
  if (!sys) return callout("warn", "The server did not describe the session.");
  const exposure = sys.loopback ? pill("loopback only", "ok") : pill("reachable from the network", "bad");
  const session = panel(
    { title: "Session", icon: "key", actions: button("Rotate token", { action: "rotate", size: "sm", icon: "refresh" }) },
    `${sys.loopback ? "" : callout("bad", "This server listens on a network interface. Anyone who can reach it and read the page can run agents and write reports, scenarios, and the baseline.", { title: "Exposed beyond this machine" })}${facts([
      ["Address", `<code class="code-inline">${esc(sys.url)}</code> ${exposure}`],
      ["Session token", `<code class="code-inline">${esc(sys.tokenFingerprint)}…</code> <span class="muted small">first characters only</span>`],
      ["Started", `<span title="${esc(absTime(sys.startedAt))}">${esc(relTime(sys.startedAt))}</span> · process ${esc(sys.pid)}`],
    ])}<p class="set-note">Rotating issues a new token to this tab. Other open tabs of the console stop working until they reload.</p>`
  );
  const guards: Array<[IconName, string, string]> = [
    ["key", "Token on every request", "Each API call carries the session token the page received; a stale or missing token is refused."],
    ["globe", "Host header check", "Requests must name this server, so another web page cannot drive it, DNS rebinding included."],
    ["shield", "Strict content policy", "No inline scripts, frames, or remote resources; the console loads nothing from the network."],
    ["wifiOff", "Offline by default", "Scenarios, grading, reports, and this console make no network requests. Only provider:model agents call their provider."],
  ];
  const protections = panel({ title: "Protections", icon: "shieldCheck", flush: true }, `<ul class="list">${guards.map(([ic, title, text]) => `<li><div class="list-row"><span class="glyph">${icon(ic, 13)}</span><span class="grow"><span class="title">${esc(title)}</span><span class="detail wrap">${esc(text)}</span></span></div></li>`).join("")}</ul>`);
  return `<div class="grid g-2">${session}${protections}</div>`;
}

function dataBody(sys: SystemInfo | undefined): string {
  const h = sys?.history;
  const history = panel(
    { title: "History", icon: "archive", meta: h?.enabled ? bytes(h.bytes) : "in memory", actions: `${button("Import", { action: "import", size: "sm", icon: "upload" })}${button("Export", { action: "export", size: "sm", icon: "download", kind: "primary" })}` },
    `${facts([
      ["File", h?.enabled ? `<code class="code-inline">${esc(h.path ?? "")}</code>` : `<span class="muted">none: started with <code class="code-inline">--no-history</code>, so this session's runs are lost when the server stops</span>`],
      ["Runs", h ? `${num(h.runs)} <span class="muted small">of at most ${num(sys!.limits.keptRuns)}</span>` : "—"],
      ["Sweeps", h ? `${num(h.sweeps)} <span class="muted small">of at most ${num(sys!.limits.keptSweeps)}</span>` : "—"],
      ["Events", h ? num(h.events) : "—"],
    ])}<p class="set-note">Export writes runs, sweeps, activity, and the profile as one JSON file. Import adds the runs, sweeps, and events of such a file that are not here yet.</p>`
  );
  const clearRow = (what: string, title: string, text: string) => `<div class="set-row"><div class="set-row-text"><span class="set-row-label">${esc(title)}</span><span class="set-row-hint">${esc(text)}</span></div><div class="set-row-control">${button(title, { action: "clear", size: "sm", kind: "danger", icon: "trash", data: { what } })}</div></div>`;
  const danger = panel(
    { title: "Clear history", icon: "trash", cls: "set-danger" },
    `${clearRow("runs", "Clear runs and sweeps", "Results stay in saved reports and the baseline; analytics start over.")}${clearRow("activity", "Clear activity", "Empties the activity log and the notifications.")}${clearRow("all", "Clear everything", "Runs, sweeps, activity, and notifications. The profile stays.")}`
  );
  const local = panel(
    { title: "This browser", icon: "monitor", meta: "kept in local storage" },
    `${prefRow("Recently viewed", plural(store.recent.length, "item"), button("Clear", { action: "clear-recent", size: "sm", disabled: !store.recent.length }))}${prefRow("Recent searches", plural(store.searches.length, "search", "searches"), button("Clear", { action: "clear-searches", size: "sm", disabled: !store.searches.length }))}${prefRow("Editor draft", store.draft ? `${num(store.draft.length)} characters not saved to a file` : "none", button("Discard", { action: "discard-draft", size: "sm", disabled: !store.draft }))}`
  );
  return `${history}<div class="grid g-2 mt-16">${danger}${local}</div>`;
}

function aboutBody(sys: SystemInfo | undefined): string {
  const product = panel(
    { title: "AgentCrucible", icon: "flask", meta: sys ? `v${esc(sys.version)}` : "" },
    `<p class="set-p">Fault-injection testing for tool-using AI agents. It runs an agent against offline mock services, breaks tool calls on a seeded schedule, and grades what the agent did and said against what the services actually committed. The same seed gives the same faults, so every verdict can be replayed call by call.</p>${sys ? facts([
      ["Version", `<code class="code-inline">${esc(sys.version)}</code>`],
      ["Node.js", `<code class="code-inline">${esc(sys.node)}</code>`],
      ["Platform", esc(sys.platform)],
      ["License", "MIT"],
    ]) : ""}`
  );
  const verdicts = panel(
    { title: "Verdicts", icon: "scale", meta: "most to least severe", flush: true },
    `<ul class="list">${store.meta.verdicts.map((v) => `<li><div class="list-row">${badge(v)}<span class="grow detail wrap">${esc(VERDICT_META[v].meaning)}</span></div></li>`).join("")}</ul>`
  );
  const docs = panel({ title: "Documentation", icon: "book", meta: "in the repository", flush: true }, `<ul class="list">${DOCS.map(([path, what]) => `<li><div class="list-row"><span class="glyph">${icon("file", 13)}</span><span class="grow"><code class="title mono">${esc(path)}</code><span class="detail">${esc(what)}</span></span></div></li>`).join("")}</ul>`);
  return `${product}<div class="grid g-2 mt-16">${verdicts}${docs}</div>`;
}

function nav(current: string): string {
  return `<nav class="set-nav" aria-label="Settings sections">${SECTIONS.map((s) => `<a class="set-nav-item${s.id === current ? " on" : ""}" href="#/settings/${s.id}"${s.id === current ? ' aria-current="page"' : ""}>${icon(s.icon, 14)}<span class="set-nav-text"><span>${esc(s.label)}</span><small>${esc(s.desc)}</small></span></a>`).join("")}</nav>`;
}

async function refreshAll(): Promise<void> {
  invalidate("runs", "sweeps", "activity", "reports", "system");
  await Promise.all([load.runs(true), load.sweeps(true), load.activity(true), load.notifications(), load.system(true)]);
  runtime.refreshShell();
  runtime.changed(["runs", "sweeps", "activity", "notifications"]);
}

function setPref(update: Partial<Prefs>): Promise<void> {
  savePrefs(update);
  applyTheme();
  return runtime.rerender();
}

const page: Page = {
  nav: "settings",
  title: (ctx) => SECTIONS.find((s) => s.id === sectionOf(ctx.arg))!.label,
  skeleton: "detail",
  watches: ["profile"],
  async render(ctx) {
    const current = sectionOf(ctx.arg);
    const [profile, sys] = await Promise.all([load.profile(), load.system(true).catch(() => undefined)]);
    const section = SECTIONS.find((s) => s.id === current)!;
    const body =
      current === "profile"
        ? panel({ title: "Profile", icon: "user", meta: "stored in the workspace history" }, profileForm(profile))
        : current === "preferences"
          ? preferencesBody(store.prefs)
          : current === "workspace"
            ? workspaceBody(sys)
            : current === "integrations"
              ? integrationsBody(sys)
              : current === "security"
                ? securityBody(sys)
                : current === "data"
                  ? dataBody(sys)
                  : current === "shortcuts"
                    ? panel({ title: "Keyboard shortcuts", icon: "keyboard", meta: "press ? anywhere" }, shortcutsHtml())
                    : aboutBody(sys);
    const head = pageHead({
      eyebrow: `${icon("settings", 11)}Settings`,
      title: section.label,
      desc: esc(
        {
          profile: "Who you are in this workspace. Your name labels the runs, sweeps, and events you start.",
          preferences: "How the console looks and behaves in this browser. Changes apply at once.",
          workspace: "Where this workspace reads scenarios and writes reports, the baseline, and its history.",
          integrations: "Gate pull requests in CI, serve scenarios to MCP clients, and grade model agents.",
          security: "How the console protects the session, and the token every request carries.",
          data: "The run history this console keeps: export it, import it, or clear it.",
          shortcuts: "Every key the console understands. Press ? on any page to see them.",
          about: "What AgentCrucible is, the version that is running, and where to read more.",
        }[current]!
      ),
      meta: [metaItem("folder", esc(projectName())), metaItem("archive", sys?.history.enabled ? "history on disk" : "history in memory"), ...(sys ? [metaItem("hash", `v${esc(sys.version)}`)] : [])],
    });
    return `<div class="page settings">${head}<div class="set-layout">${nav(current)}<div class="set-main">${body}</div></div></div>`;
  },
  actions: {
    "pref-density": (el) => setPref({ density: el.dataset.value as Prefs["density"] }),
    "pref-sidebar": (el) => setPref({ sidebar: el.dataset.value as Prefs["sidebar"] }),
    "pref-motion": (el) => setPref({ motion: el.dataset.value as Prefs["motion"] }),
    "pref-time": (el) => setPref({ time: el.dataset.value as Prefs["time"] }),
    "reset-prefs": async () => {
      resetPrefs();
      applyTheme();
      toast("Preferences are back to their defaults.", "ok");
      await runtime.rerender();
    },
    rotate: async (el) => {
      if (store.prefs.confirm && !(await confirmDialog({ title: "Rotate the session token?", body: "This tab gets the new token at once. Other open tabs of the console stop working until they reload.", confirm: "Rotate token", icon: "key" }))) return;
      el.classList.add("is-busy");
      try {
        const r = await api<{ token: string; tokenFingerprint: string }>("/api/session/rotate", {});
        setSessionToken(r.token);
        await Promise.all([load.system(true), load.notifications()]);
        runtime.refreshShell();
        toast(`The new token starts with ${r.tokenFingerprint}.`, "ok", { title: "Session token rotated" });
        await runtime.rerender();
      } finally {
        el.classList.remove("is-busy");
      }
    },
    export: async (el) => {
      el.classList.add("is-busy");
      try {
        const w = await api<{ runs: unknown[]; sweeps: unknown[]; events: unknown[] }>("/api/workspace/export");
        download(`agentcrucible-workspace-${new Date().toISOString().slice(0, 10)}.json`, `${JSON.stringify(w, null, 2)}\n`, "application/json");
        toast(`Exported ${plural(w.runs.length, "run")}, ${plural(w.sweeps.length, "sweep")}, and ${plural(w.events.length, "event")}.`, "ok");
      } finally {
        el.classList.remove("is-busy");
      }
    },
    import: async (el) => {
      const file = await pickFile(".json,application/json");
      if (!file) return;
      let workspace: unknown;
      try {
        workspace = JSON.parse(file.text);
      } catch {
        toast(`${file.name} is not JSON.`, "bad", { title: "Nothing imported" });
        return;
      }
      el.classList.add("is-busy");
      try {
        const added = await api<{ runs: number; sweeps: number; events: number }>("/api/workspace/import", { workspace });
        await refreshAll();
        toast(`Added ${plural(added.runs, "run")}, ${plural(added.sweeps, "sweep")}, and ${plural(added.events, "event")} from ${file.name}.`, "ok", { title: "History imported" });
        await runtime.rerender();
      } finally {
        el.classList.remove("is-busy");
      }
    },
    clear: async (el) => {
      const what = el.dataset.what as "runs" | "activity" | "all";
      const label = what === "runs" ? "the run and sweep history" : what === "activity" ? "the activity log and notifications" : "the whole history";
      const ask = what === "all" || store.prefs.confirm;
      if (ask && !(await confirmDialog({ title: `Clear ${label}?`, body: `This cannot be undone. Export the history first if you may need it.`, confirm: "Clear", danger: true, ...(what === "all" ? { typeToConfirm: "clear" } : {}) }))) return;
      el.classList.add("is-busy");
      try {
        await api("/api/workspace/clear", { what });
        await refreshAll();
        toast(`Cleared ${label}.`, "ok");
        await runtime.rerender();
      } finally {
        el.classList.remove("is-busy");
      }
    },
    "clear-recent": () => {
      clearRecent();
      toast("Recently viewed items cleared.", "ok");
      return runtime.rerender();
    },
    "clear-searches": () => {
      clearSearches();
      toast("Recent searches cleared.", "ok");
      return runtime.rerender();
    },
    "discard-draft": async () => {
      if (store.prefs.confirm && !(await confirmDialog({ title: "Discard the editor draft?", body: "The text you have not saved to a scenario file is lost.", confirm: "Discard", danger: true }))) return;
      saveDraft("");
      store.draft = null;
      toast("Editor draft discarded.", "ok");
      return runtime.rerender();
    },
  },
  inputs: {
    "pref-theme": (el) => setPref({ theme: el.value as Prefs["theme"] }),
    "pref-pagesize": (el) => setPref({ pageSize: Number(el.value) || DEFAULT_PREFS.pageSize }),
    "pref-trials": (el) => setPref({ trials: Number(el.value) || DEFAULT_PREFS.trials }),
    "pref-landing": (el) => setPref({ landing: el.value }),
    "pref-confirm": (el) => setPref({ confirm: el.checked }),
    "pref-notify": (el) => setPref({ notifyRuns: el.checked }),
    "profile-name": (el) => {
      const form = el.form!;
      const preview = document.getElementById("profile-preview");
      if (preview && store.profile) preview.innerHTML = profilePreview({ ...store.profile, name: el.value, color: String(new FormData(form).get("color") ?? store.profile.color) });
    },
    "color-preview": (el) => {
      const form = el.form!;
      const preview = document.getElementById("profile-preview");
      if (preview && store.profile) preview.innerHTML = profilePreview({ ...store.profile, name: String(new FormData(form).get("name") ?? store.profile.name), color: el.value });
    },
  },
  submit: {
    profile: async (form) => {
      const data = Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, String(v)]));
      if (!data.name?.trim()) {
        toast("Enter a name; it labels the runs you start.", "bad", { title: "Profile not saved" });
        return;
      }
      const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      btn?.classList.add("is-busy");
      try {
        store.profile = await api<Profile>("/api/profile", { name: data.name, role: data.role ?? "", email: data.email ?? "", color: data.color ?? store.profile?.color });
        runtime.refreshShell();
        toast(`Saved as ${store.profile.name} (${initials(store.profile.name)}).`, "ok", { title: "Profile saved" });
        await runtime.rerender();
      } catch (err) {
        toast((err as Error).message, "bad", { title: "Profile not saved" });
      } finally {
        btn?.classList.remove("is-busy");
      }
    },
  },
};

export default page;
