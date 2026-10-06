/** The frame around every page: the sidebar, the top bar, and the phone tab bar, and their live counts. */
import { logo } from "../../html.js";
import { esc } from "./lib/format.js";
import { MOD } from "./lib/dom.js";
import { projectName, store } from "./lib/state.js";
import { icon } from "./icons.js";
import { NAV_GROUPS, SETTINGS_NAV, TABBAR, type NavItem } from "./routes.js";
import { avatar } from "./ui/primitives.js";

function navLink(item: NavItem): string {
  return `<a class="sb-link" href="#/${item.route}" data-nav="${item.route}" title="${esc(item.label)} (G then ${item.key.toUpperCase()})">${icon(item.icon, 16)}<span class="sb-text">${esc(item.label)}</span>${item.count ? `<span class="sb-badge" data-count="${item.count}"></span>` : ""}</a>`;
}

export function shell(): string {
  const meta = store.meta;
  return `<div class="app" id="shell">
  <aside class="sidebar" id="sidebar" aria-label="Navigation">
    <button type="button" class="ws" data-action="workspace-menu" title="${esc(meta.cwd)}">
      <span class="ws-mark">${logo(20)}</span>
      <span class="ws-text"><span class="ws-name">${esc(projectName(meta))}</span><span class="ws-sub">${meta.demoWorkspace ? "demo workspace" : "local workspace"} · v${esc(meta.version)}</span></span>
      ${icon("chevronsUpDown", 14)}
    </button>
    <nav class="sb-nav" aria-label="Main">
      ${NAV_GROUPS.map((g) => `<div class="sb-group"><div class="sb-group-label">${esc(g.label)}</div>${g.items.map(navLink).join("")}</div>`).join("")}
    </nav>
    <div class="sb-foot">
      ${navLink(SETTINGS_NAV)}
      <a class="me" href="#/settings/profile" id="me">${meProfile()}</a>
      <div class="sb-tools">
        <span class="sb-status" id="sb-status" title="The server runs on this machine and loads nothing from the network"><span class="status-dot live"></span>Local · offline-safe</span>
        <button type="button" class="icon-btn sm" data-action="toggle-sidebar" title="Collapse the sidebar ([)" aria-label="Collapse the sidebar">${icon("sidebar", 15)}</button>
        <button type="button" class="icon-btn sm" data-action="theme-menu" title="Theme" aria-label="Theme">${icon("sun", 15)}</button>
      </div>
    </div>
  </aside>
  <div class="scrim" data-action="close-sidebar"></div>
  <div class="main" id="main">
    <div id="banner"></div>
    <header class="topbar">
      <button type="button" class="icon-btn menu-btn" data-action="open-sidebar" aria-label="Open navigation">${icon("menu", 18)}</button>
      <a class="tb-logo" href="#/" aria-label="Command center">${logo(22)}</a>
      <nav class="crumbs" id="crumbs" aria-label="Breadcrumb"></nav>
      <button type="button" class="tb-search" data-action="search" aria-label="Search">${icon("search", 14)}<span>Search scenarios, runs, agents, findings…</span><kbd>${MOD}</kbd><kbd>K</kbd></button>
      <div class="tb-actions">
        <span id="jobs-indicator"></span>
        <button type="button" class="icon-btn tb-btn" data-action="notifications" id="bell" aria-label="Notifications" title="Notifications (G then N)">${icon("bell", 17)}<span class="tb-count" id="bell-count" hidden></span></button>
        <button type="button" class="icon-btn tb-btn tb-hide-sm" data-action="shortcuts" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">${icon("keyboard", 17)}</button>
        <span class="tb-divider tb-hide-sm"></span>
        <a class="btn btn-primary btn-sm" href="#/launch" title="Start a new run (N)">${icon("play", 12)}<span class="tb-hide-sm">New run</span></a>
      </div>
      <div class="topbar-progress" id="progress" aria-hidden="true"></div>
    </header>
    <main class="view" id="view" tabindex="-1"></main>
  </div>
  <nav class="tabbar" aria-label="Sections">
    ${TABBAR.map((t) => `<a href="#/${t.route}" data-nav="${t.route}">${icon(t.icon, 19)}<span>${esc(t.label === "Command center" ? "Home" : t.label)}</span></a>`).join("")}
    <button type="button" data-action="open-sidebar">${icon("menu", 19)}<span>More</span></button>
  </nav>
</div>`;
}

function meProfile(): string {
  const p = store.profile;
  if (!p) return `${avatar("?", "slate", "sm")}<span class="me-text"><span class="me-name">Profile</span></span>`;
  return `${avatar(p.name, p.color)}<span class="me-text"><span class="me-name">${esc(p.name)}</span><span class="me-role">${esc(p.role || "Operator")}</span></span>`;
}

export function setActiveNav(nav: string): void {
  for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-nav]")) {
    const on = link.dataset.nav === nav;
    link.classList.toggle("active", on);
    if (on) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

/** Sidebar counts, the profile card, the notification badge, and the jobs indicator, from the store. */
export function updateShell(): void {
  const counts: Record<string, number | undefined> = {
    scenarios: store.scenarios?.length,
    runs: store.runs.length || undefined,
    reports: store.saved.length || undefined,
    sweeps: store.sweeps.length || undefined,
    agents: store.meta.agents.length,
  };
  for (const el of document.querySelectorAll<HTMLElement>(".sb-badge[data-count]")) {
    const n = counts[el.dataset.count ?? ""];
    el.textContent = n === undefined ? "" : String(n);
  }
  const me = document.getElementById("me");
  if (me) me.innerHTML = meProfile();
  const bell = document.getElementById("bell-count");
  if (bell) {
    const n = store.notifications.unread;
    bell.hidden = n === 0;
    bell.textContent = n > 99 ? "99+" : String(n);
    document.getElementById("bell")?.setAttribute("aria-label", n ? `Notifications, ${n} unread` : "Notifications");
  }
  const jobs = document.getElementById("jobs-indicator");
  if (jobs) {
    const running = store.jobs.filter((j) => j.status === "running");
    jobs.innerHTML = running.length
      ? `<button type="button" class="jobs-chip" data-action="jobs-menu" title="Running in the background">${'<span class="status-dot running"></span>'}${running.length === 1 ? `${esc(running[0].done)}/${esc(running[0].total)}` : `${running.length} jobs`}</button>`
      : "";
  }
}

export function setCrumbs(trail: Array<[string, string?]>): void {
  const el = document.getElementById("crumbs");
  if (!el) return;
  el.innerHTML = trail.map(([label, link], i) => `${i ? icon("chevronRight", 12, "crumb-sep") : ""}${link ? `<a href="${esc(link)}">${esc(label)}</a>` : `<span aria-current="page">${esc(label)}</span>`}`).join("");
}

export function showBanner(html: string): void {
  const el = document.getElementById("banner");
  if (el) el.innerHTML = html;
}
