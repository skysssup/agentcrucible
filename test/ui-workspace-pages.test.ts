import { describe, expect, it } from "vitest";
import type { ActivityEvent, Profile } from "../src/ui/api.js";
import { activityItem, eventFacts, eventsCsv, eventsPerDay, filterEvents, groupByDay, timeline, type ActivityFilter } from "../src/ui/client/pages/activity.js";
import { preferencesBody, profileForm, sectionOf, SECTIONS } from "../src/ui/client/pages/settings.js";
import { DEFAULT_PREFS } from "../src/ui/client/lib/state.js";

const NOW = Date.parse("2026-10-05T12:00:00");

function ev(over: Partial<ActivityEvent>): ActivityEvent {
  return { id: "evt-1", at: new Date(NOW - 3_600_000).toISOString(), type: "run.completed", category: "runs", severity: "success", actor: "Maya Okafor", title: "run-12 finished", notify: false, ...over };
}

const EVENTS: ActivityEvent[] = [
  ev({ id: "a", title: "run-12 finished: 15/15 as expected", data: { results: 15, unexpected: 0, critical: 0 } }),
  ev({ id: "b", at: new Date(NOW - 26 * 3_600_000).toISOString(), type: "run.completed", category: "regressions", severity: "critical", title: "1 unexpected verdict in run-11", detail: "northwind/apology-email-phantom", data: { results: 15, unexpected: 1, critical: 1 }, notify: true }),
  ev({ id: "c", at: new Date(NOW - 10 * 86_400_000).toISOString(), type: "baseline.saved", category: "baseline", severity: "success", title: "Baseline updated with 30 entries" }),
  ev({ id: "d", at: new Date(NOW - 40 * 86_400_000).toISOString(), type: "sweep.completed", category: "sweeps", severity: "warning", title: "sweep-3: support-agent 88% resilient", data: { runs: 24, critical: 2, resilience: 0.875 } }),
];

const ALL: ActivityFilter = { query: "", category: "all", severity: "all", span: "all" };

describe("Activity page", () => {
  it("filters events by kind, severity, period, and every word of the search, keeping their order", () => {
    expect(filterEvents(EVENTS, ALL, NOW).map((e) => e.id)).toEqual(["a", "b", "c", "d"]);
    expect(filterEvents(EVENTS, { ...ALL, category: "regressions" }, NOW).map((e) => e.id)).toEqual(["b"]);
    expect(filterEvents(EVENTS, { ...ALL, severity: "success" }, NOW).map((e) => e.id)).toEqual(["a", "c"]);
    expect(filterEvents(EVENTS, { ...ALL, span: "7d" }, NOW).map((e) => e.id)).toEqual(["a", "b"]);
    expect(filterEvents(EVENTS, { ...ALL, span: "30d" }, NOW).map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(filterEvents(EVENTS, { ...ALL, query: "  APOLOGY   run-11 " }, NOW).map((e) => e.id)).toEqual(["b"]);
    expect(filterEvents(EVENTS, { ...ALL, query: "baseline.saved" }, NOW).map((e) => e.id)).toEqual(["c"]);
    expect(filterEvents(EVENTS, { ...ALL, query: "nothing like this" }, NOW)).toEqual([]);
  });

  it("groups events by local day and counts them per day, zero days included", () => {
    const groups = groupByDay(EVENTS);
    expect(groups.map(([, list]) => list.map((e) => e.id))).toEqual([["a"], ["b"], ["c"], ["d"]]);
    const perDay = eventsPerDay(EVENTS, 3, new Date(NOW));
    expect(perDay.map((d) => d.count)).toEqual([0, 1, 1]);
    expect(perDay.at(-1)!.day).toBe("2026-10-05");
  });

  it("escapes every value of an event and marks unread notifications", () => {
    const html = activityItem(ev({ title: '<img src=x onerror="alert(1)">', detail: "<b>bold</b>", type: "x.<y>", actor: "<Eve>", link: '#/run/r"1', notify: true }));
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>bold");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain('href="#/run/r&quot;1"');
    expect(html).toContain("&lt;Eve&gt;");
    expect(html).toContain("x.&lt;y&gt;");
    expect(html).toContain('class="feed-item act-item unread"');
    expect(activityItem(ev({ notify: true, read: true }))).not.toContain(" unread");
  });

  it("shows counts from an event's data, leaving out problems that did not happen", () => {
    expect(eventFacts(EVENTS[0])).toContain("15 results");
    expect(eventFacts(EVENTS[0])).not.toContain("unexpected");
    expect(eventFacts(EVENTS[1])).toContain("1 unexpected");
    expect(eventFacts(EVENTS[1])).toContain('class="pill bad"');
    expect(eventFacts(EVENTS[3])).toContain("24 runs");
    expect(eventFacts(EVENTS[3])).toContain("88% resilient");
    expect(eventFacts(ev({}))).toBe("");
  });

  it("tells an empty log from a filter that matches nothing, and offers more when the list is long", () => {
    expect(timeline([], 60, 0)).toContain("Nothing has happened yet");
    const none = timeline([], 60, 4);
    expect(none).toContain("No events match");
    expect(none).toContain('data-action="clear-filters"');
    const many = Array.from({ length: 70 }, (_, i) => ev({ id: `e${i}`, at: new Date(NOW - i * 60_000).toISOString() }));
    const first = timeline(many, 60, 70);
    expect(first.match(/class="feed-item/g)).toHaveLength(60);
    expect(first).toContain("Show 10 more");
    expect(first).toContain("60 of 70");
    expect(timeline(many, 120, 70)).not.toContain("Show");
  });

  it("exports events as CSV with quoted fields", () => {
    const out = eventsCsv([ev({ title: 'Saved "3" reports, finally', detail: "a,b" })]);
    const [header, row] = out.trim().split("\n");
    expect(header).toBe("at,type,category,severity,actor,title,detail,link");
    expect(row).toContain('"Saved ""3"" reports, finally"');
    expect(row).toContain('"a,b"');
  });
});

describe("Settings page", () => {
  it("opens the section the route names, and the profile for anything else", () => {
    expect(SECTIONS.map((s) => s.id)).toEqual(["profile", "preferences", "workspace", "integrations", "security", "data", "shortcuts", "about"]);
    expect(sectionOf("security")).toBe("security");
    expect(sectionOf(undefined)).toBe("profile");
    expect(sectionOf("../etc")).toBe("profile");
  });

  it("fills the profile form with escaped values and the chosen avatar color", () => {
    const p: Profile = { name: '<script>alert("x")</script>', role: "QA & reliability", email: 'a"b@example.com', color: "moss", createdAt: "2026-08-10T09:00:00.000Z" };
    const html = profileForm(p);
    expect(html).not.toContain("<script>");
    expect(html).toContain('value="&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"');
    expect(html).toContain('value="QA &amp; reliability"');
    expect(html).toContain('value="a&quot;b@example.com"');
    expect(html).toContain('value="moss" checked');
    expect(html).not.toContain('value="clay" checked');
    expect(html).toContain('data-submit="profile"');
  });

  it("shows each preference with its current value", () => {
    const html = preferencesBody({ ...DEFAULT_PREFS, theme: "dark", density: "compact", pageSize: 50, trials: 5, confirm: false, notifyRuns: true });
    expect(html).toContain('value="dark" checked');
    expect(html).not.toContain('value="system" checked');
    expect(html).toMatch(/class="seg-btn on" data-action="pref-density" data-value="compact"/);
    expect(html).toContain('<option value="50" selected>');
    expect(html).toContain('<option value="5" selected>5 trials</option>');
    expect(html).toMatch(/data-input="pref-notify"[^>]*/);
    expect(html).toMatch(/<input type="checkbox" role="switch" checked data-input="pref-notify"/);
    expect(html).toMatch(/<input type="checkbox" role="switch" data-input="pref-confirm"/);
  });
});
