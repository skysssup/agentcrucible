/** Every page by route, and the actions the global search offers. */
import { api } from "../lib/api.js";
import { download } from "../lib/dom.js";
import { runtime } from "../lib/runtime.js";
import { load, savePrefs, store } from "../lib/state.js";
import { applyTheme, isDark, setTheme } from "../lib/theme.js";
import type { Page } from "../routes.js";
import type { SearchAction } from "../search-panel.js";
import { toast } from "../ui/overlays.js";
import activity from "./activity.js";
import agent from "./agent.js";
import agents from "./agents.js";
import analytics from "./analytics.js";
import baseline from "./baseline.js";
import catalog from "./catalog.js";
import compare from "./compare.js";
import coverage from "./coverage.js";
import demo from "./demo.js";
import editor from "./editor.js";
import launch from "./launch.js";
import overview from "./overview.js";
import report from "./report.js";
import reports from "./reports.js";
import run from "./run.js";
import runs from "./runs.js";
import scenario from "./scenario.js";
import scenarios from "./scenarios.js";
import settings from "./settings.js";
import sweep from "./sweep.js";

export const PAGES: Record<string, Page> = {
  "": overview,
  analytics,
  activity,
  scenarios,
  scenario,
  editor,
  coverage,
  catalog,
  runs,
  run,
  launch,
  sweep,
  demo,
  reports,
  report,
  agents,
  agent,
  compare,
  baseline,
  settings,
};

/** What the global search can do besides opening things. */
export function searchActions(): SearchAction[] {
  const go = (hash: string) => () => runtime.navigate(hash);
  return [
    { label: "Start a new run", detail: "Pick scenarios, agents, and trials · N", icon: "play", keywords: "launch matrix execute", run: go("#/launch") },
    { label: "Run the guided demo", detail: "Five agents, one lost refund response", icon: "spark", keywords: "demo tour", run: go("#/demo?play=1") },
    { label: "Sweep a scenario", detail: "Every fault kind at every step", icon: "grid", keywords: "fault injection heat map resilience", run: go("#/sweep") },
    { label: "Write a single-step scenario", detail: "Open the editor with a template", icon: "plus", keywords: "new scenario template yaml", run: go("#/editor?template=single") },
    { label: "Write a workflow scenario", detail: "Two worlds, an invariant, an answer check", icon: "workflow", keywords: "new scenario template yaml", run: go("#/editor?template=workflow") },
    { label: "Compare two agents", detail: "Head to head on the scenarios both ran", icon: "split", keywords: "versus diff", run: go("#/compare") },
    { label: "Compare the latest run with the baseline", detail: "Regressions and new failures", icon: "compare", keywords: "gate ci regression", run: go("#/baseline?compare=latest") },
    { label: isDark() ? "Switch to the light theme" : "Switch to the dark theme", detail: "T", icon: isDark() ? "sun" : "moon", keywords: "appearance color theme", run: () => setTheme(isDark() ? "light" : "dark") },
    { label: store.prefs.density === "compact" ? "Use comfortable rows" : "Use compact rows", icon: "rows", keywords: "density table", run: () => (savePrefs({ density: store.prefs.density === "compact" ? "comfortable" : "compact" }), applyTheme()) },
    { label: store.prefs.sidebar === "collapsed" ? "Expand the sidebar" : "Collapse the sidebar", detail: "[", icon: "sidebar", keywords: "navigation", run: () => (savePrefs({ sidebar: store.prefs.sidebar === "collapsed" ? "expanded" : "collapsed" }), applyTheme()) },
    {
      label: "Mark all notifications read",
      icon: "check",
      keywords: "inbox clear",
      run: () =>
        void api("/api/notifications/read", { all: true })
          .then(() => load.notifications())
          .then(() => (runtime.refreshShell(), toast("Every notification is marked read.", "ok"))),
    },
    { label: "Export the workspace history", detail: "Runs, sweeps, and activity as JSON", icon: "download", keywords: "backup data json", run: () => void api("/api/workspace/export").then((w) => download(`agentcrucible-workspace-${new Date().toISOString().slice(0, 10)}.json`, `${JSON.stringify(w, null, 2)}\n`, "application/json")) },
    { label: "Edit your profile", icon: "user", keywords: "name role avatar account", run: go("#/settings/profile") },
    { label: "Preferences", detail: "Theme, density, defaults", icon: "sliders", keywords: "settings options", run: go("#/settings/preferences") },
    { label: "Integrations", detail: "CI, MCP clients, model providers", icon: "plug", keywords: "github action mcp openai anthropic ollama", run: go("#/settings/integrations") },
    { label: "Security and session", icon: "lock", keywords: "token host privacy", run: go("#/settings/security") },
  ];
}
