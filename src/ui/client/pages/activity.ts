/**
 * The activity log: every event the workspace recorded, newest first and grouped by day, with
 * filters by kind, severity, period, and text, the volume per day, and a CSV export.
 */
import type { ActivityCategory, ActivityEvent, ActivitySeverity } from "../../api.js";
import { api } from "../lib/api.js";
import { download } from "../lib/dom.js";
import { absTime, csv, dayKey, dayLabel, esc, num, plural, relTime, shortDay } from "../lib/format.js";
import { runtime, patch } from "../lib/runtime.js";
import { load, store } from "../lib/state.js";
import { icon, type IconName } from "../icons.js";
import { CATEGORY_ICON, eventIcon } from "../notifications.js";
import type { Page } from "../routes.js";
import { barList, sparkline } from "../ui/charts.js";
import { emptyState, kpi, kpis, metaItem, pageHead, panel } from "../ui/layout.js";
import { button, pill, searchInput, segmented, select, tip } from "../ui/primitives.js";
import { toast } from "../ui/overlays.js";

export type Span = "7d" | "30d" | "all";

export interface ActivityFilter {
  query: string;
  category: ActivityCategory | "all";
  severity: ActivitySeverity | "all";
  span: Span;
}

export const CATEGORIES: Array<{ id: ActivityCategory; label: string }> = [
  { id: "runs", label: "Runs" },
  { id: "regressions", label: "Regressions" },
  { id: "sweeps", label: "Sweeps" },
  { id: "baseline", label: "Baseline" },
  { id: "scenarios", label: "Scenarios" },
  { id: "reports", label: "Reports" },
  { id: "system", label: "System" },
];

const SEVERITIES: ActivitySeverity[] = ["critical", "warning", "success", "info"];
const SPAN_DAYS: Record<Span, number> = { "7d": 7, "30d": 30, all: Infinity };
const PAGE = 60;

let filter: ActivityFilter = { query: "", category: "all", severity: "all", span: "all" };
let limit = PAGE;
let appliedQuery: string | undefined;

/** Events that match the filter, in the order given (newest first). */
export function filterEvents(events: ActivityEvent[], f: ActivityFilter, now = Date.now()): ActivityEvent[] {
  const since = now - SPAN_DAYS[f.span] * 86_400_000;
  const words = f.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return events.filter((e) => {
    if (f.category !== "all" && e.category !== f.category) return false;
    if (f.severity !== "all" && e.severity !== f.severity) return false;
    if (Date.parse(e.at) < since) return false;
    const text = `${e.title} ${e.detail ?? ""} ${e.type} ${e.actor}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

/** Events grouped by local day, keeping their order. */
export function groupByDay(events: ActivityEvent[]): Array<[string, ActivityEvent[]]> {
  const groups = new Map<string, ActivityEvent[]>();
  for (const e of events) {
    const key = dayKey(e.at);
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }
  return [...groups];
}

/** Events per day for the last `days` days, oldest first. */
export function eventsPerDay(events: ActivityEvent[], days: number, now = new Date()): Array<{ day: string; count: number }> {
  const counts = new Map<string, number>();
  for (const e of events) counts.set(dayKey(e.at), (counts.get(dayKey(e.at)) ?? 0) + 1);
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (days - 1 - i));
    const day = dayKey(d);
    return { day, count: counts.get(day) ?? 0 };
  });
}

const FACTS: Array<{ key: string; label: (n: number) => string; tone?: "bad" | "warn" | "ok" }> = [
  { key: "results", label: (n) => plural(n, "result") },
  { key: "runs", label: (n) => plural(n, "run") },
  { key: "unexpected", label: (n) => `${n} unexpected`, tone: "warn" },
  { key: "critical", label: (n) => `${n} critical`, tone: "bad" },
  { key: "regressions", label: (n) => plural(n, "regression"), tone: "bad" },
  { key: "newFailures", label: (n) => plural(n, "new failure"), tone: "bad" },
  { key: "improvements", label: (n) => `${n} improved`, tone: "ok" },
  { key: "files", label: (n) => plural(n, "file") },
  { key: "deleted", label: (n) => `${n} deleted` },
];

/** Small facts from an event's data, such as "15 results" and "1 unexpected"; zero counts of problems are left out. */
export function eventFacts(e: ActivityEvent): string {
  const data = e.data ?? {};
  const out = FACTS.filter((f) => typeof data[f.key] === "number" && (data[f.key] as number) > 0).map((f) => pill(f.label(data[f.key] as number), f.tone ?? "outline"));
  if (typeof data.resilience === "number") out.push(pill(`${Math.round(data.resilience * 100)}% resilient`, "outline"));
  return out.join("");
}

/** The events as CSV, one row per event. */
export function eventsCsv(events: ActivityEvent[]): string {
  return csv([["at", "type", "category", "severity", "actor", "title", "detail", "link"], ...events.map((e) => [e.at, e.type, e.category, e.severity, e.actor, e.title, e.detail ?? "", e.link ?? ""])]);
}

function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** One event in the timeline. */
export function activityItem(e: ActivityEvent): string {
  const label = CATEGORIES.find((c) => c.id === e.category)?.label ?? e.category;
  const title = e.link ? `<a class="feed-title" href="${esc(e.link)}">${esc(e.title)}</a>` : `<span class="feed-title">${esc(e.title)}</span>`;
  return `<li class="feed-item act-item${e.notify && !e.read && !e.dismissed ? " unread" : ""}">${eventIcon(e)}<div class="feed-body">${title}${e.detail ? `<span class="feed-detail">${esc(e.detail)}</span>` : ""}<span class="act-meta"><span class="act-kind">${icon(CATEGORY_ICON[e.category] ?? "info", 11)}${esc(label)}</span><code class="act-type">${esc(e.type)}</code>${eventFacts(e)}<span class="act-actor">${esc(e.actor)}</span></span></div><span class="feed-meta"${tip(`${absTime(e.at)} · ${relTime(e.at)}`)}>${esc(timeOfDay(e.at))}</span></li>`;
}

/** The timeline: day headings, the events, and a button for more. */
export function timeline(events: ActivityEvent[], shown: number, total: number): string {
  if (!total) {
    return emptyState({ icon: "activity", title: "Nothing has happened yet", text: "Runs, sweeps, baseline changes, saved reports, and scenario edits appear here as they happen.", actions: button("Start a run", { href: "#/launch", kind: "primary", icon: "play", size: "sm" }) });
  }
  if (!events.length) return emptyState({ icon: "filter", title: "No events match", text: "Nothing in the log matches these filters. Widen the period or clear the search.", actions: button("Clear filters", { action: "clear-filters", size: "sm", icon: "x" }) });
  const visible = events.slice(0, shown);
  const now = new Date();
  return `<ol class="feed act-feed">${groupByDay(visible)
    .map(([day, list]) => `<li class="feed-day"><span>${esc(dayLabel(day, now))}</span><span class="act-day-count">${plural(list.length, "event")}</span></li>${list.map(activityItem).join("")}`)
    .join("")}</ol>${events.length > shown ? `<div class="act-more">${button(`Show ${Math.min(PAGE, events.length - shown)} more`, { action: "more", size: "sm", icon: "chevronDown" })}<span class="muted small">${num(shown)} of ${num(events.length)}</span></div>` : ""}`;
}

function applyQuery(query: URLSearchParams): void {
  const key = query.toString();
  if (key === appliedQuery) return;
  appliedQuery = key;
  const category = query.get("category");
  const severity = query.get("severity");
  filter = {
    query: query.get("q") ?? "",
    category: CATEGORIES.some((c) => c.id === category) ? (category as ActivityCategory) : "all",
    severity: SEVERITIES.includes(severity as ActivitySeverity) ? (severity as ActivitySeverity) : "all",
    span: "all",
  };
  limit = PAGE;
}

function feedMeta(matched: number, total: number): string {
  return matched === total ? plural(total, "event") : `${num(matched)} of ${plural(total, "event")}`;
}

function redrawFeed(): void {
  const all = store.activity;
  const matched = filterEvents(all, filter);
  patch("act-feed", timeline(matched, limit, all.length));
  patch("act-count", feedMeta(matched.length, filterEvents(all, { ...filter, query: "", category: "all", severity: "all" }).length));
}

const page: Page = {
  nav: "activity",
  title: () => "Activity",
  skeleton: "table",
  watches: ["activity", "notifications"],
  async render(ctx) {
    applyQuery(ctx.query);
    await Promise.all([load.activity(), load.notifications(), load.system().catch(() => undefined)]);
    const all = store.activity;
    const inSpan = filterEvents(all, { ...filter, query: "", category: "all", severity: "all" });
    const matched = filterEvents(all, filter);
    const days = filter.span === "all" ? 30 : SPAN_DAYS[filter.span];
    const perDay = eventsPerDay(all, days);
    const count = (pred: (e: ActivityEvent) => boolean) => inSpan.filter(pred).length;
    const runs = inSpan.filter((e) => e.type === "run.completed");
    const graded = runs.reduce((n, e) => n + (typeof e.data?.results === "number" ? e.data.results : 0), 0);
    const problems = count((e) => e.severity === "critical" || e.severity === "warning");
    const critical = count((e) => e.severity === "critical");
    const changes = count((e) => e.category === "baseline" || e.category === "scenarios");
    const history = store.system?.history;
    const oldest = all.at(-1);
    const spanLabel = filter.span === "all" ? "all time" : `the last ${SPAN_DAYS[filter.span]} days`;

    const head = pageHead({
      eyebrow: `${icon("activity", 11)}Workspace`,
      title: "Activity",
      desc: "Everything this workspace recorded, newest first: runs and sweeps, regressions, baseline and scenario changes, saved reports, and settings. Notifications are the events that need you; this is the whole record.",
      meta: [
        metaItem("activity", `<b class="fg">${num(all.length)}</b> ${all.length === 1 ? "event" : "events"}`),
        metaItem("calendar", oldest ? `since <b class="fg">${esc(shortDay(dayKey(oldest.at)))}</b>` : "no events yet", oldest ? absTime(oldest.at) : ""),
        metaItem("bell", `${plural(store.notifications.unread, "unread notification")}`),
        metaItem("archive", history?.enabled ? `<code>${esc(history.path ?? "")}</code>` : "kept in memory for this session", history?.enabled ? "The history file" : "--no-history"),
      ],
      actions: `${button("Export CSV", { action: "export", icon: "download", disabled: !matched.length, title: "Download the events that match the filters" })}${button("Mark all read", { action: "read-all", icon: "check", disabled: !store.notifications.unread })}${button("Notifications", { action: "notifications", icon: "bell" })}`,
    });

    if (!all.length) return `<div class="page activity">${head}${panel({}, timeline([], limit, 0))}</div>`;

    const kpiRow = kpis([
      kpi({ label: "Events", icon: "activity", value: num(inSpan.length), sub: `in ${spanLabel}`, spark: sparkline(perDay.map((d) => d.count), { width: 120, min: 0, label: "events per day" }) }),
      kpi({ label: "Runs finished", icon: "runs", value: num(runs.length), sub: graded ? `${num(graded)} results graded` : "no runs in the period", href: "#/runs" }),
      kpi({ label: "Needs a look", icon: "alert", value: num(problems), tone: critical ? "bad" : problems ? "warn" : "ok", sub: critical ? `${plural(critical, "critical event")}` : problems ? "warnings only" : "no warnings or critical events" }),
      kpi({ label: "Changes", icon: "edit", value: num(changes), sub: "baseline and scenario edits" }),
      kpi({ label: "Unread", icon: "bell", value: num(store.notifications.unread), tone: store.notifications.unread ? "warn" : "", sub: `of ${plural(store.notifications.items.length, "notification")}` }),
    ]);

    const categoryCounts = CATEGORIES.map((c) => ({ ...c, n: inSpan.filter((e) => e.category === c.id).length }));
    const toolbar = `<div class="act-toolbar">${searchInput({ id: "act-q", value: filter.query, placeholder: "Search events", kbd: "/" })}${select({ input: "severity", value: filter.severity, label: "Severity", options: [{ value: "all", label: "Every severity" }, ...SEVERITIES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))] })}${segmented(
      "span",
      filter.span,
      [
        { value: "7d", label: "7d" },
        { value: "30d", label: "30d" },
        { value: "all", label: "All" },
      ],
      { label: "Period" }
    )}</div><div class="act-cats">${segmented("category", filter.category, [{ value: "all", label: "All", count: inSpan.length }, ...categoryCounts.map((c) => ({ value: c.id, label: c.label, count: c.n, icon: CATEGORY_ICON[c.id] as IconName }))], { label: "Kind of event", wrap: true })}</div>`;

    const feed = panel({ title: "Timeline", icon: "history", meta: `<span id="act-count">${feedMeta(matched.length, inSpan.length)}</span>`, flush: true, cls: "act-panel" }, `<div id="act-feed">${timeline(matched, limit, all.length)}</div>`);

    const max = Math.max(1, ...categoryCounts.map((c) => c.n));
    const byKind = panel(
      { title: "By kind", icon: "pieChart", meta: esc(spanLabel) },
      inSpan.length
        ? barList(
        categoryCounts.filter((c) => c.n).map((c) => ({ label: `${icon(CATEGORY_ICON[c.id] ?? "info", 12)} ${esc(c.label)}`, value: c.n, display: `${num(c.n)} · ${Math.round((c.n / Math.max(1, inSpan.length)) * 100)}%`, href: `#/activity?category=${c.id}`, color: c.id === "regressions" ? "var(--harm-bg)" : undefined })),
        { max }
      )
        : '<p class="muted small">No events in this period.</p>'
    );

    const peak = perDay.reduce((best, d) => (d.count > best.count ? d : best), perDay[0]);
    const volume = panel(
      { title: "Events per day", icon: "barChart", meta: `last ${days} days` },
      `${sparkline(perDay.map((d) => d.count), { width: 300, height: 64, min: 0, area: true, label: "events per day" })}<div class="act-volume"><span>${esc(shortDay(perDay[0].day))}</span><span>${peak.count ? `busiest ${esc(shortDay(peak.day))}: ${plural(peak.count, "event")}` : "no events"}</span><span>${esc(shortDay(perDay.at(-1)!.day))}</span></div>`
    );

    const attention = all.filter((e) => e.severity === "critical").slice(0, 4);
    const critPanel = panel(
      { title: "Latest critical", icon: "octagon", flush: true, actions: `<button type="button" class="link-quiet" data-action="only-critical">Show all ${icon("arrowRight", 12)}</button>` },
      attention.length ? `<ul class="list">${attention.map((e) => `<li>${e.link ? `<a class="list-row" href="${esc(e.link)}">` : '<div class="list-row">'}<span class="grow"><span class="title wrap">${esc(e.title)}</span><span class="detail">${esc(relTime(e.at))}</span></span>${e.link ? `${icon("chevronRight", 14, "faint")}</a>` : "</div>"}</li>`).join("")}</ul>` : emptyState({ icon: "checkCircle", title: "No critical events", compact: true })
    );

    return `<div class="page activity">${head}${kpiRow}${toolbar}<div class="grid g-main-side">${feed}<div class="stack">${byKind}${volume}${critPanel}</div></div></div>`;
  },
  actions: {
    span: (el) => {
      filter.span = el.dataset.value as Span;
      limit = PAGE;
      return runtime.rerender();
    },
    category: (el) => {
      filter.category = el.dataset.value as ActivityFilter["category"];
      limit = PAGE;
      return runtime.rerender();
    },
    "only-critical": () => {
      filter = { ...filter, severity: "critical", category: "all", span: "all" };
      limit = PAGE;
      return runtime.rerender();
    },
    "clear-filters": () => {
      filter = { query: "", category: "all", severity: "all", span: "all" };
      limit = PAGE;
      return runtime.rerender();
    },
    more: () => {
      limit += PAGE;
      redrawFeed();
    },
    export: () => {
      const rows = filterEvents(store.activity, filter);
      download(`agentcrucible-activity-${new Date().toISOString().slice(0, 10)}.csv`, eventsCsv(rows), "text/csv");
      toast(`Exported ${plural(rows.length, "event")} as CSV.`, "ok");
    },
    "read-all": async (el) => {
      el.classList.add("is-busy");
      try {
        await api("/api/notifications/read", { all: true });
        await Promise.all([load.notifications(), load.activity(true)]);
        runtime.refreshShell();
        toast("Every notification is marked read.", "ok");
        await runtime.rerender();
      } finally {
        el.classList.remove("is-busy");
      }
    },
  },
  inputs: {
    "act-q": (el) => {
      filter.query = el.value;
      limit = PAGE;
      redrawFeed();
    },
    severity: (el) => {
      filter.severity = el.value as ActivityFilter["severity"];
      limit = PAGE;
      return runtime.rerender();
    },
  },
};

export default page;
