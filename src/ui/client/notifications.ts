/** The notification center: what needs attention, read and unread, filtered by kind, with links. */
import type { ActivityEvent } from "../api.js";
import { api } from "./lib/api.js";
import { absTime, esc, relTime } from "./lib/format.js";
import { runtime } from "./lib/runtime.js";
import { load, store } from "./lib/state.js";
import { icon, type IconName } from "./icons.js";
import { emptyState } from "./ui/layout.js";

type Filter = "all" | "unread" | "critical";
let root: HTMLElement | undefined;
let filter: Filter = "all";

export const CATEGORY_ICON: Record<string, IconName> = { runs: "runs", regressions: "trendDown", baseline: "compare", scenarios: "layers", reports: "file", sweeps: "grid", system: "settings" };
export const SEVERITY_ICON: Record<string, IconName> = { critical: "octagon", warning: "alert", success: "checkCircle", info: "info" };

export function notificationsOpen(): boolean {
  return root !== undefined;
}

export function closeNotifications(): void {
  root?.remove();
  root = undefined;
  document.removeEventListener("pointerdown", outside, { capture: true });
}

function outside(e: Event): void {
  const t = e.target as HTMLElement;
  if (root && !root.contains(t) && !t.closest("#bell")) closeNotifications();
}

/** Icon box for an event: its severity when it is a problem or a success, otherwise its category. */
export function eventIcon(e: ActivityEvent, size = 14): string {
  const name = e.severity === "critical" || e.severity === "warning" || e.severity === "success" ? SEVERITY_ICON[e.severity] : (CATEGORY_ICON[e.category] ?? "info");
  return `<span class="feed-icon ${esc(e.severity)}">${icon(name, size)}</span>`;
}

function item(e: ActivityEvent): string {
  return `<li class="notif${e.read ? "" : " unread"}" data-id="${esc(e.id)}"${e.link ? ` data-link="${esc(e.link)}"` : ""} tabindex="0">
  ${eventIcon(e)}
  <div><span class="n-title">${esc(e.title)}</span>${e.detail ? `<span class="n-detail">${esc(e.detail)}</span>` : ""}<span class="n-meta"><span title="${esc(absTime(e.at))}">${esc(relTime(e.at))}</span><span>·</span><span>${esc(e.category)}</span></span></div>
  <div class="n-actions">
    <button type="button" class="icon-btn sm" data-n="toggle" title="${e.read ? "Mark unread" : "Mark read"}" aria-label="${e.read ? "Mark unread" : "Mark read"}">${icon(e.read ? "dot" : "check", 13)}</button>
    <button type="button" class="icon-btn sm" data-n="dismiss" title="Dismiss" aria-label="Dismiss">${icon("x", 13)}</button>
  </div>
</li>`;
}

function draw(): void {
  if (!root) return;
  const all = store.notifications.items;
  const shown = all.filter((e) => (filter === "unread" ? !e.read : filter === "critical" ? e.severity === "critical" : true));
  const unread = all.filter((e) => !e.read).length;
  const critical = all.filter((e) => e.severity === "critical").length;
  root.innerHTML = `<div class="notif-head"><h2>Notifications</h2><button type="button" class="btn btn-ghost btn-sm" data-n="read-all"${unread ? "" : " disabled"}>${icon("check", 13)}<span>Mark all read</span></button><button type="button" class="icon-btn sm" data-n="close" aria-label="Close">${icon("x", 14)}</button></div>
  <nav class="notif-tabs" role="tablist">${(["all", "unread", "critical"] as Filter[]).map((f) => `<button type="button" class="tab${f === filter ? " on" : ""}" role="tab" aria-selected="${f === filter}" data-filter="${f}">${f === "all" ? "All" : f === "unread" ? "Unread" : "Critical"}<span class="tab-count">${f === "all" ? all.length : f === "unread" ? unread : critical}</span></button>`).join("")}</nav>
  ${shown.length ? `<ul class="notif-list">${shown.slice(0, 80).map(item).join("")}</ul>` : `<div class="notif-list">${emptyState({ icon: "bellOff", title: filter === "unread" ? "You are all caught up" : filter === "critical" ? "Nothing critical" : "No notifications", text: "Finished runs, regressions against the baseline, and failed jobs show up here.", compact: true })}</div>`}
  <div class="notif-foot"><a class="link-quiet" href="#/activity" data-n="close">${icon("activity", 13)}View all activity</a><button type="button" class="btn btn-ghost btn-sm" data-n="clear"${all.length ? "" : " disabled"}>Clear all</button></div>`;
}

async function act(action: string, id?: string): Promise<void> {
  if (action === "close") return closeNotifications();
  if (action === "read-all") await api("/api/notifications/read", { all: true });
  else if (action === "clear") await api("/api/notifications/dismiss", { all: true });
  else if (action === "toggle" && id) {
    const e = store.notifications.items.find((x) => x.id === id);
    await api("/api/notifications/read", { ids: [id], read: !e?.read });
  } else if (action === "dismiss" && id) await api("/api/notifications/dismiss", { ids: [id] });
  await load.notifications();
  runtime.refreshShell();
  draw();
}

export async function toggleNotifications(): Promise<void> {
  if (root) return closeNotifications();
  root = document.createElement("div");
  root.className = "notif-panel";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Notifications");
  document.body.append(root);
  draw();
  root.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const tab = t.closest<HTMLElement>("[data-filter]");
    if (tab) {
      filter = tab.dataset.filter as Filter;
      return draw();
    }
    const btn = t.closest<HTMLElement>("[data-n]");
    const li = t.closest<HTMLElement>(".notif");
    if (btn) {
      e.stopPropagation();
      void act(btn.dataset.n!, li?.dataset.id);
      return;
    }
    if (li) openItem(li);
  });
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeNotifications();
    const li = (e.target as HTMLElement).closest<HTMLElement>(".notif");
    if (li && e.key === "Enter") openItem(li);
  });
  setTimeout(() => document.addEventListener("pointerdown", outside, { capture: true }), 0);
  await load.notifications().catch(() => undefined);
  runtime.refreshShell();
  draw();
}

function openItem(li: HTMLElement): void {
  const id = li.dataset.id!;
  const e = store.notifications.items.find((x) => x.id === id);
  if (e && !e.read) void api("/api/notifications/read", { ids: [id] }).then(() => load.notifications().then(() => runtime.refreshShell()));
  closeNotifications();
  if (li.dataset.link) location.hash = li.dataset.link;
}
