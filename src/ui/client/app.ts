/**
 * The browser side of `agentcrucible ui`: boots the shell, routes the hash to a page, dispatches
 * clicks, inputs, and forms to the page's handlers, and keeps the shell's live state current.
 */
import { ApiError, onConnection } from "./lib/api.js";
import { copy, download } from "./lib/dom.js";
import { esc } from "./lib/format.js";
import { runtime } from "./lib/runtime.js";
import { invalidate, load, projectName, savePrefs, store } from "./lib/state.js";
import { applyTheme, isDark, setTheme } from "./lib/theme.js";
import { shortcutsHtml } from "./ui/shortcuts.js";
import { icon } from "./icons.js";
import { resumeJobs } from "./jobs.js";
import { closeNotifications, notificationsOpen, toggleNotifications } from "./notifications.js";
import { PAGES, searchActions } from "./pages/index.js";
import { ALL_NAV, parseHash, type Ctx, type Page } from "./routes.js";
import { closeSearch, openSearch, searchOpen } from "./search-panel.js";
import { setActiveNav, setCrumbs, shell, showBanner, updateShell } from "./shell.js";
import { fitCharts } from "./ui/charts.js";
import { emptyState, skeletonPage } from "./ui/layout.js";
import { closeDrawer, closeMenu, dialog, drawerOpen, hideTip, installTooltips, menuOpen, openMenu, toast } from "./ui/overlays.js";
import { button } from "./ui/primitives.js";
import { tableAction } from "./ui/table.js";

const app = document.getElementById("app")!;
let current: { page: Page; ctx: Ctx } | undefined;
let renders = 0;
let shownHash = "";

function view(): HTMLElement {
  return document.getElementById("view")!;
}

function pageFor(route: string): Page | undefined {
  return PAGES[route];
}

async function render(opts: { keepScroll?: boolean } = {}): Promise<void> {
  if (!document.getElementById("view")) return;
  const ticket = ++renders;
  const ctx = parseHash(location.hash || store.prefs.landing || "");
  const page = pageFor(ctx.route);
  closeMenu(false);
  hideTip();
  document.querySelector(".app")?.classList.remove("menu-open");
  const sameHash = location.hash === shownHash;
  const scrollTop = view().scrollTop;
  if (current && (!sameHash || !opts.keepScroll)) current.page.unmount?.();
  if (!page) {
    current = undefined;
    setActiveNav("");
    setCrumbs([[projectName(), "#/"], ["Not found"]]);
    view().innerHTML = `<div class="page">${emptyState({ icon: "help", title: "There is no such page", text: `Nothing lives at <code>${esc(location.hash)}</code>.`, actions: button("Go to the command center", { href: "#/", kind: "secondary" }) })}</div>`;
    return;
  }
  setActiveNav(page.nav);
  const bar = setTimeout(() => document.getElementById("progress")?.classList.add("on"), 120);
  const skeleton = !sameHash && page.skeleton ? setTimeout(() => ticket === renders && (view().innerHTML = skeletonPage(page.skeleton)), 160) : undefined;
  let html: string;
  try {
    html = await page.render(ctx);
  } catch (err) {
    html = errorPage(err);
  } finally {
    clearTimeout(bar);
    clearTimeout(skeleton);
  }
  if (ticket !== renders) return;
  document.getElementById("progress")?.classList.remove("on");
  view().innerHTML = html;
  const title = safeTitle(page, ctx);
  const nav = ALL_NAV.find((n) => n.route === page.nav);
  setCrumbs(page.nav === ctx.route && !ctx.arg ? [[projectName(), "#/"], [nav?.label ?? title]] : [[projectName(), "#/"], [nav?.label ?? "", `#/${page.nav}`], [title]]);
  document.title = `${title} · AgentCrucible`;
  if (!sameHash) {
    view().scrollTo(0, 0);
    if (!searchOpen() && !notificationsOpen()) view().focus({ preventScroll: true });
    view().classList.remove("view-enter");
    void view().offsetWidth;
    view().classList.add("view-enter");
  } else if (opts.keepScroll) view().scrollTop = scrollTop;
  shownHash = location.hash;
  current = { page, ctx };
  page.mount?.(ctx);
  requestAnimationFrame(() => fitCharts(view()));
  updateShell();
}

function safeTitle(page: Page, ctx: Ctx): string {
  try {
    return page.title(ctx);
  } catch {
    return "AgentCrucible";
  }
}

function errorPage(err: unknown): string {
  const stale = err instanceof ApiError && err.code === "token";
  const offline = err instanceof ApiError && err.code === "offline";
  return `<div class="page">${emptyState({
    icon: stale ? "key" : offline ? "wifiOff" : "alert",
    title: stale ? "This tab belongs to an earlier session" : offline ? "The server is not answering" : "Something went wrong",
    text: esc((err as Error).message),
    actions: stale || offline ? button("Reload", { action: "reload", kind: "primary", icon: "refresh" }) : `${button("Try again", { action: "retry", icon: "refresh" })}${button("Go to the command center", { href: "#/", kind: "ghost" })}`,
  })}</div>`;
}

runtime.rerender = () => render({ keepScroll: true });
runtime.navigate = (hash) => {
  if (location.hash === hash) void render({ keepScroll: true });
  else location.hash = hash;
};
runtime.refreshShell = updateShell;
runtime.openSearch = (q, scope) => openSearch(searchActions(), q, scope as never);
runtime.changed = (names) => {
  updateShell();
  if (current?.page.watches?.some((w) => names.includes(w)) && !document.querySelector("dialog[open]") && !drawerOpen()) void render({ keepScroll: true });
};

function flipTheme(): void {
  const dark = isDark();
  setTheme(dark ? "light" : "dark");
  toast(`Switched to the ${dark ? "light" : "dark"} theme.`, "info", { ms: 1800 });
}

function toggleSidebar(): void {
  savePrefs({ sidebar: store.prefs.sidebar === "collapsed" ? "expanded" : "collapsed" });
  applyTheme();
  setTimeout(() => fitCharts(view()), 260);
}

function showShortcuts(): void {
  if (document.querySelector("dialog.shortcuts-dialog")) return;
  void dialog(`<form method="dialog"><div class="modal-head"><span class="modal-icon">${icon("keyboard", 17)}</span><div><h2>Keyboard shortcuts</h2><p>Everything in AgentCrucible works from the keyboard. Shortcuts pause while a text field has the focus.</p></div></div><div class="modal-body">${shortcutsHtml()}</div><div class="modal-foot"><button type="submit" class="btn btn-secondary" value="close">Close</button></div></form>`, { cls: "wide shortcuts-dialog", focus: 'button[value="close"]' });
}

/** Actions any page can use: theme, sidebar, search, notifications, copy, download, tables. */
const GLOBAL: Record<string, (el: HTMLElement, ev: Event) => unknown> = {
  reload: () => location.reload(),
  retry: () => render(),
  search: () => runtime.openSearch(),
  notifications: () => toggleNotifications(),
  shortcuts: () => showShortcuts(),
  "toggle-sidebar": () => toggleSidebar(),
  "open-sidebar": () => document.querySelector(".app")?.classList.add("menu-open"),
  "close-sidebar": () => document.querySelector(".app")?.classList.remove("menu-open"),
  "theme-menu": (el) =>
    openMenu(
      [
        { heading: "Theme" },
        ...(["system", "light", "dark"] as const).map((t) => ({ label: t === "system" ? "Match the system" : t === "light" ? "Light" : "Dark", icon: (t === "system" ? "monitor" : t === "light" ? "sun" : "moon") as "monitor" | "sun" | "moon", checked: store.prefs.theme === t, run: () => setTheme(t) })),
        "-",
        { label: store.prefs.density === "compact" ? "Comfortable rows" : "Compact rows", icon: "rows", run: () => (savePrefs({ density: store.prefs.density === "compact" ? "comfortable" : "compact" }), applyTheme()) },
        { label: "All preferences", icon: "sliders", href: "#/settings/preferences" },
      ],
      el,
      { align: "end" }
    ),
  "workspace-menu": (el) =>
    openMenu(
      [
        { heading: projectName() },
        { label: "Workspace settings", icon: "settings", href: "#/settings/workspace" },
        { label: "Integrations", icon: "plug", href: "#/settings/integrations" },
        { label: "Data and history", icon: "archive", href: "#/settings/data" },
        "-",
        { label: "Copy the project path", icon: "copy", run: () => void copy(store.meta.cwd) },
        { label: "Keyboard shortcuts", icon: "keyboard", hint: "?", run: showShortcuts },
      ],
      el
    ),
  "jobs-menu": (el) =>
    openMenu(
      [
        { heading: "Running" },
        ...store.jobs.filter((j) => j.status === "running").map((j) => ({ label: `${j.label} · ${j.done}/${j.total}`, icon: (j.kind === "run" ? "runs" : "grid") as "runs" | "grid", href: j.kind === "run" ? `#/launch?job=${j.jobId}` : `#/sweep?job=${j.jobId}` })),
      ],
      el,
      { align: "end" }
    ),
  copy: (el) => copy(el.dataset.copy ?? "", el),
  download: (el) => download(el.dataset.name ?? "download.txt", el.dataset.content ?? "", el.dataset.type ?? "text/plain"),
};

function dispatch(action: string, el: HTMLElement, ev: Event): void {
  const handler = current?.page.actions?.[action] ?? GLOBAL[action];
  if (handler) {
    Promise.resolve(handler(el, ev)).catch((err: Error) => toast(err.message, "bad"));
    return;
  }
  if (action.startsWith("dt-")) tableAction(action, el);
}

app.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const el = target.closest<HTMLElement>("[data-action]");
  if (el && !(el instanceof HTMLInputElement) && !(el instanceof HTMLSelectElement) && !el.matches("form")) {
    if (el.tagName !== "A" || !el.getAttribute("href")) e.preventDefault();
    dispatch(el.dataset.action!, el, e);
    return;
  }
  const row = target.closest<HTMLElement>("[data-href]");
  if (row && !target.closest("a, input, label, button, select, textarea")) {
    if (e.metaKey || e.ctrlKey) window.open(row.dataset.href, "_blank");
    else location.hash = row.dataset.href!;
  }
});

app.addEventListener("change", (e) => {
  const el = e.target as HTMLElement;
  const action = el.dataset.action;
  if (action && (el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) return dispatch(action, el, e);
  const name = el.dataset.input;
  if (name && el instanceof HTMLSelectElement) current?.page.inputs?.[name]?.(el as never, e);
  else if (name && el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) current?.page.inputs?.[name]?.(el as never, e);
});

app.addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement;
  const name = el.dataset.input;
  if (!name || el.type === "checkbox" || el.type === "radio" || el instanceof HTMLSelectElement) return;
  current?.page.inputs?.[name]?.(el as never, e);
});

app.addEventListener("submit", (e) => {
  const form = e.target as HTMLFormElement;
  const name = form.dataset.submit;
  if (!name) return;
  e.preventDefault();
  const handler = current?.page.submit?.[name];
  if (handler) Promise.resolve(handler(form, e as SubmitEvent)).catch((err: Error) => toast(err.message, "bad"));
});

app.addEventListener("contextmenu", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-context]");
  if (!el || !current?.page.actions?.["context-menu"]) return;
  e.preventDefault();
  current.page.actions["context-menu"](el, e);
});

/** Set after "g" is pressed, for a moment, so the next key picks a page. */
let goPending: ReturnType<typeof setTimeout> | undefined;

document.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && !e.altKey && e.key.toLowerCase() === "k") {
    e.preventDefault();
    if (searchOpen()) closeSearch();
    else runtime.openSearch();
    return;
  }
  if (e.key === "Escape") {
    if (menuOpen()) return closeMenu();
    if (notificationsOpen()) return closeNotifications();
    if (drawerOpen()) return closeDrawer();
    document.querySelector(".app")?.classList.remove("menu-open");
  }
  if (current?.page.keys && !searchOpen() && current.page.keys(e)) return;
  const typing = target.closest("input, textarea, select, [contenteditable]");
  if (mod || e.altKey || searchOpen() || document.querySelector("dialog[open]") || drawerOpen() || typing) return;
  if (goPending) {
    clearTimeout(goPending);
    goPending = undefined;
    const key = e.key.toLowerCase();
    if (key === "n") {
      e.preventDefault();
      void toggleNotifications();
      return;
    }
    const nav = ALL_NAV.find((n) => n.key === key);
    if (nav) {
      e.preventDefault();
      location.hash = `#/${nav.route}`;
    }
    return;
  }
  switch (e.key) {
    case "/": {
      e.preventDefault();
      const search = view().querySelector<HTMLInputElement>('input[type="search"]');
      if (search) search.focus();
      else runtime.openSearch();
      return;
    }
    case "g":
      goPending = setTimeout(() => (goPending = undefined), 800);
      return;
    case "?":
      e.preventDefault();
      return showShortcuts();
    case "t":
      return flipTheme();
    case "[":
      return toggleSidebar();
    case "n":
      e.preventDefault();
      location.hash = "#/launch";
      return;
  }
});

window.addEventListener("hashchange", () => void render());
let resizeTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => fitCharts(view()), 120);
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => store.prefs.theme === "system" && applyTheme());

onConnection((online) => {
  showBanner(online ? "" : `<div class="offline-banner" role="alert">${icon("wifiOff", 15)}<span>The AgentCrucible server stopped answering. Start <code>agentcrucible ui</code> again; this page reconnects on its own.</span></div>`);
  if (online) {
    toast("Reconnected to the server.", "ok", { ms: 2500 });
    invalidate("runs", "reports", "activity");
    void render({ keepScroll: true });
  }
});

/** Every 20 seconds: new notifications (from another tab or a finished job), and whether the server is still there. */
function poll(): void {
  setInterval(async () => {
    if (document.hidden) return;
    const before = store.notifications.items[0]?.id;
    const list = await load.notifications().catch(() => undefined);
    if (!list) return;
    updateShell();
    if (list.items[0] && list.items[0].id !== before) runtime.changed(["notifications", "activity"]);
  }, 20_000);
}

async function start(): Promise<void> {
  applyTheme();
  try {
    await load.meta();
  } catch (err) {
    app.innerHTML = `<div class="page" style="padding-top:12vh">${emptyState({ icon: "wifiOff", title: "Cannot reach the AgentCrucible server", text: `${esc((err as Error).message)}. Start <code>agentcrucible ui</code> again and open the address it prints.`, actions: button("Reload", { action: "reload", kind: "primary", icon: "refresh" }) })}</div>`;
    app.addEventListener("click", (e) => (e.target as HTMLElement).closest('[data-action="reload"]') && location.reload());
    return;
  }
  await Promise.all([load.profile(), load.notifications()]).catch(() => undefined);
  app.innerHTML = shell();
  installTooltips(app);
  updateShell();
  await render();
  void Promise.all([load.scenarios(), load.runs(), load.reports(), load.sweeps(), resumeJobs()]).then(updateShell, () => undefined);
  poll();
}

void start();
