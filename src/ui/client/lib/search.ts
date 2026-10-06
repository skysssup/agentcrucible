/** Ranking for the global search: every word of the query must match; label matches rank first. */
import { esc } from "./format.js";

export type Scope = "all" | "pages" | "scenarios" | "agents" | "runs" | "reports" | "findings" | "catalog";

export const SCOPES: Array<{ id: Scope; label: string }> = [
  { id: "all", label: "All" },
  { id: "scenarios", label: "Scenarios" },
  { id: "agents", label: "Agents" },
  { id: "runs", label: "Runs" },
  { id: "reports", label: "Reports" },
  { id: "findings", label: "Findings" },
  { id: "catalog", label: "Catalog" },
  { id: "pages", label: "Pages & actions" },
];

export interface Searchable {
  id: string;
  scope: Exclude<Scope, "all">;
  label: string;
  detail?: string;
  /** More words that match, such as a scenario's task. */
  keywords?: string;
  /** Ranks higher among equal matches. */
  boost?: number;
}

export function words(q: string): string[] {
  return q.toLowerCase().split(/\s+/).filter(Boolean);
}

/** The items that match every word of `q`, best first. An empty query keeps the given order. */
export function rank<T extends Searchable>(items: T[], q: string, scope: Scope = "all"): T[] {
  const pool = scope === "all" ? items : items.filter((i) => i.scope === scope);
  const ws = words(q);
  if (ws.length === 0) return pool;
  return pool
    .map((item, index) => {
      const label = item.label.toLowerCase();
      const rest = `${item.detail ?? ""} ${item.keywords ?? ""}`.toLowerCase();
      let score = item.boost ?? 0;
      for (const w of ws) {
        const at = label.indexOf(w);
        if (at === 0) score += 8;
        else if (at > 0 && /[\s/._:-]/.test(label[at - 1])) score += 5;
        else if (at > 0) score += 3;
        else if (rest.includes(w)) score += 1;
        else return undefined;
      }
      if (label === q.trim().toLowerCase()) score += 12;
      return { item, score, index };
    })
    .filter((x): x is { item: T; score: number; index: number } => x !== undefined)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((x) => x.item);
}

/** The label with each matched word wrapped in <mark>, escaped. */
export function highlight(label: string, q: string): string {
  const ws = words(q).filter((w) => w.length > 0);
  if (ws.length === 0) return esc(label);
  const lower = label.toLowerCase();
  const marks: Array<[number, number]> = [];
  for (const w of ws) {
    const at = lower.indexOf(w);
    if (at >= 0) marks.push([at, at + w.length]);
  }
  marks.sort((a, b) => a[0] - b[0]);
  let out = "";
  let last = 0;
  for (const [from, to] of marks) {
    if (from < last) continue;
    out += esc(label.slice(last, from)) + `<mark>${esc(label.slice(from, to))}</mark>`;
    last = to;
  }
  return out + esc(label.slice(last));
}
