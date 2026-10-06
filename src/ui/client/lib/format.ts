/** Formatting helpers shared by every page: counts, times, durations, percentages, links, CSV. */
import { shellQuote } from "../../../html.js";

export { esc, shellQuote } from "../../../html.js";

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/** Cuts text to `max` characters at a word boundary, with an ellipsis. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ") > max / 2 ? cut.lastIndexOf(" ") : max)}…`;
}

export function firstSentence(text: string): string {
  return text.split(/(?<=\.)\s/)[0];
}

let timeStyle: "relative" | "absolute" = "relative";

/** Whether `relTime` prints "3 h ago" or the date and time (the Preferences setting). */
export function setTimeStyle(style: "relative" | "absolute"): void {
  timeStyle = style;
}

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", or a date. */
export function relTime(iso: string | undefined, now = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return "";
  if (timeStyle === "absolute") return absTime(iso);
  const s = Math.max(0, (now - t) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  const days = Math.floor(s / 86_400);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Oct 5, 14:32" (this year) or "Oct 5, 2025, 14:32". */
export function absTime(iso: string | undefined): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), hour: "2-digit", minute: "2-digit", hour12: false });
}

/** The local calendar day of a timestamp, as YYYY-MM-DD. */
export function dayKey(iso: string | number | Date): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Today", "Yesterday", or "Mon, Oct 3" for a day key. */
export function dayLabel(key: string, now = new Date()): string {
  if (key === dayKey(now)) return "Today";
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (key === dayKey(y)) return "Yesterday";
  const [yy, mm, dd] = key.split("-").map(Number);
  return new Date(yy, mm - 1, dd).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...(yy === now.getFullYear() ? {} : { year: "numeric" }) });
}

/** "Oct 3" for a day key. */
export function shortDay(key: string): string {
  const [yy, mm, dd] = key.split("-").map(Number);
  return new Date(yy, mm - 1, dd).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "420 ms", "3.2 s", "4 min 12 s". */
export function duration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}

/** A share as "42%", or "—" when there is nothing to divide. */
export function pct(part: number, whole: number, digits = 0): string {
  return whole ? `${((part / whole) * 100).toFixed(digits)}%` : "—";
}

export function num(n: number): string {
  return n.toLocaleString("en-US");
}

/** "1.2 MB", "840 KB". */
export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Route links: ids and keys may contain "/" and ":", which stay readable in the hash. */
export function href(route: string, arg?: string): string {
  return `#/${route}${arg === undefined ? "" : `/${encodeURIComponent(arg).replace(/%2F/g, "/").replace(/%3A/g, ":")}`}`;
}

/** A link to the Scenarios page showing only `ids`. */
export function scenariosHref(ids: string[]): string {
  return `#/scenarios?ids=${ids.map((id) => encodeURIComponent(id).replace(/%2F/g, "/")).join(",")}`;
}

/** A route with query parameters, leaving out empty ones. */
export function withQuery(route: string, params: Record<string, string | number | undefined | null>): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v)).replace(/%2F/g, "/").replace(/%2C/g, ",")}`)
    .join("&");
  return q ? `${route}?${q}` : route;
}

export function csv(rows: unknown[][]): string {
  const field = (v: unknown) => {
    const text = String(v ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `${rows.map((row) => row.map(field).join(",")).join("\n")}\n`;
}

/** Initials for an avatar: "Maya Okafor" becomes "MO". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : (parts[0]?.[1] ?? ""))).toUpperCase();
}

/** The command that runs one scenario against agents with the given trials and seed. */
export function runCommand(scenario: string, agents: string[], trials?: number, seed?: string | null): string {
  return `npx agentcrucible run --scenario ${scenario}${agents.length ? ` --agents ${agents.join(",")}` : ""}${trials && trials !== 1 ? ` --trials ${trials}` : ""}${seed ? ` --seed ${shellQuote(seed)}` : ""}`;
}
