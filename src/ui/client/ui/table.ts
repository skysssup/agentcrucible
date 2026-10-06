/**
 * Data tables with sortable columns, pagination, row selection, and a card layout on phones.
 * A page renders a table with `dataTable`; the app's dt-* actions change its state and redraw
 * only that table through the renderer the page registered with `registerTable`.
 */
import { esc, num } from "../lib/format.js";
import { icon } from "../icons.js";

export interface Column<T> {
  id: string;
  label: string;
  /** Sortable when given: compares two rows ascending. */
  sort?: (a: T, b: T) => number;
  num?: boolean;
  cls?: string;
  /** Header class, such as "when". */
  thCls?: string;
  width?: string;
  title?: string;
  /** Escaped HTML for the cell. */
  render: (row: T) => string;
}

export interface TableState {
  sort?: string;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
}

interface Registered {
  state: TableState;
  render: () => string;
  selected?: Set<string>;
  /** Called after the selection changes, to update bulk-action bars. */
  onSelect?: () => void;
  /** Keys of every row the table currently shows (all pages), for select-all. */
  keys?: string[];
}

const tables = new Map<string, Registered>();

/** The state of table `id`, created with the defaults the first time. */
export function tableState(id: string, defaults: Partial<TableState> = {}): TableState {
  const found = tables.get(id);
  if (found) return found.state;
  const state: TableState = { dir: "desc", page: 1, pageSize: 25, ...defaults };
  tables.set(id, { state, render: () => "" });
  return state;
}

export function registerTable(id: string, render: () => string, opts: { selected?: Set<string>; onSelect?: () => void } = {}): void {
  const entry = tables.get(id) ?? { state: { dir: "desc", page: 1, pageSize: 25 }, render };
  entry.render = render;
  entry.selected = opts.selected;
  entry.onSelect = opts.onSelect;
  tables.set(id, entry);
}

export function redrawTable(id: string): void {
  const entry = tables.get(id);
  const el = typeof document === "undefined" ? null : document.getElementById(id);
  if (!entry || !el) return;
  el.outerHTML = entry.render();
}

/** Handles the dt-* actions and inputs. Returns true when it did. */
export function tableAction(action: string, el: HTMLElement): boolean {
  const id = el.dataset.table ?? el.closest<HTMLElement>("[data-table-root]")?.id ?? "";
  const entry = tables.get(id);
  if (!entry) return false;
  const s = entry.state;
  switch (action) {
    case "dt-sort": {
      const col = el.dataset.col ?? "";
      if (s.sort === col) s.dir = s.dir === "asc" ? "desc" : "asc";
      else {
        s.sort = col;
        s.dir = el.dataset.dir === "asc" ? "asc" : "desc";
      }
      s.page = 1;
      break;
    }
    case "dt-page":
      s.page = Math.max(1, Number(el.dataset.page) || 1);
      break;
    case "dt-size":
      s.pageSize = Number((el as HTMLSelectElement).value) || 25;
      s.page = 1;
      break;
    case "dt-select": {
      const key = el.dataset.key ?? "";
      if ((el as HTMLInputElement).checked) entry.selected?.add(key);
      else entry.selected?.delete(key);
      el.closest("tr")?.classList.toggle("is-selected", (el as HTMLInputElement).checked);
      syncSelectAll(id);
      entry.onSelect?.();
      return true;
    }
    case "dt-select-all": {
      const on = (el as HTMLInputElement).checked;
      for (const key of entry.keys ?? []) on ? entry.selected?.add(key) : entry.selected?.delete(key);
      entry.onSelect?.();
      break;
    }
    default:
      return false;
  }
  redrawTable(id);
  if (action === "dt-page") document.getElementById(id)?.scrollIntoView({ block: "nearest" });
  return true;
}

function syncSelectAll(id: string): void {
  const entry = tables.get(id);
  const box = document.querySelector<HTMLInputElement>(`#${CSS.escape(id)} input[data-action="dt-select-all"]`);
  if (!entry || !box) return;
  const keys = entry.keys ?? [];
  const n = keys.filter((k) => entry.selected?.has(k)).length;
  box.checked = n > 0 && n === keys.length;
  box.indeterminate = n > 0 && n < keys.length;
}

export interface TableOpts<T> {
  id: string;
  columns: Column<T>[];
  rows: T[];
  state: TableState;
  rowKey?: (row: T) => string;
  rowHref?: (row: T) => string | undefined;
  rowCls?: (row: T) => string;
  /** Rows get a checkbox; the set holds the selected keys. */
  selected?: Set<string>;
  /** Escaped HTML shown when there are no rows. */
  empty: string;
  /** Rows become cards on phones. */
  cards?: boolean;
  /** Groups rows under headings, in the order the groups first appear. */
  groupBy?: (row: T) => string;
  /** Leave out the pagination footer, for short embedded tables. */
  plain?: boolean;
  flush?: boolean;
  caption?: string;
}

/** Sorts and pages `rows` by the state, without rendering them (for exports and counts). */
export function arrange<T>(rows: T[], columns: Column<T>[], state: TableState): { sorted: T[]; shown: T[]; pages: number } {
  const col = columns.find((c) => c.id === state.sort && c.sort);
  const sorted = col ? [...rows].sort((a, b) => (state.dir === "asc" ? 1 : -1) * col.sort!(a, b)) : rows;
  const pages = Math.max(1, Math.ceil(sorted.length / state.pageSize));
  if (state.page > pages) state.page = pages;
  const shown = sorted.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
  return { sorted, shown, pages };
}

export function dataTable<T>(o: TableOpts<T>): string {
  const { sorted, shown, pages } = o.plain ? { sorted: o.rows, shown: o.rows, pages: 1 } : arrange(o.rows, o.columns, o.state);
  const entry = tables.get(o.id);
  if (entry && o.rowKey) entry.keys = sorted.map(o.rowKey);
  const sel = o.selected;
  const allKeys = o.rowKey ? sorted.map(o.rowKey) : [];
  const picked = sel ? allKeys.filter((k) => sel.has(k)).length : 0;
  const head = `<tr>${sel ? `<th class="check-col"><label class="check"><input type="checkbox" data-action="dt-select-all" data-table="${esc(o.id)}"${picked && picked === allKeys.length ? " checked" : ""} aria-label="Select all ${num(allKeys.length)} rows"/><span class="check-box">${icon(picked && picked < allKeys.length ? "minus" : "check", 11)}</span></label></th>` : ""}${o.columns
    .map((c) => {
      const on = o.state.sort === c.id;
      const ind = on ? icon(o.state.dir === "asc" ? "arrowUp" : "arrowDown", 11) : icon("chevronsUpDown", 11);
      const label = c.sort ? `<button type="button" class="sort${on ? " on" : ""}" data-action="dt-sort" data-table="${esc(o.id)}" data-col="${esc(c.id)}"${c.num ? ' data-dir="desc"' : ""} aria-label="Sort by ${esc(c.label)}">${esc(c.label)}${ind}</button>` : esc(c.label);
      return `<th class="${[c.num ? "num" : "", c.thCls ?? ""].filter(Boolean).join(" ")}"${c.width ? ` style="width:${esc(c.width)}"` : ""}${c.title ? ` title="${esc(c.title)}"` : ""}${on ? ` aria-sort="${o.state.dir === "asc" ? "ascending" : "descending"}"` : ""}>${label}</th>`;
    })
    .join("")}</tr>`;
  let group: string | undefined;
  const colspan = o.columns.length + (sel ? 1 : 0);
  const body = shown
    .map((row) => {
      const key = o.rowKey?.(row);
      const link = o.rowHref?.(row);
      const g = o.groupBy?.(row);
      const groupRow = g !== undefined && g !== group ? `<tr class="group-row"><td colspan="${colspan}">${esc(g)}<span>${sorted.filter((r) => o.groupBy!(r) === g).length}</span></td></tr>` : "";
      group = g;
      const checked = key !== undefined && sel?.has(key);
      return `${groupRow}<tr${link ? ` data-href="${esc(link)}"` : ""} class="${[checked ? "is-selected" : "", o.rowCls?.(row) ?? ""].filter(Boolean).join(" ")}">${sel && key !== undefined ? `<td class="check-col"><label class="check"><input type="checkbox" data-action="dt-select" data-table="${esc(o.id)}" data-key="${esc(key)}"${checked ? " checked" : ""} aria-label="Select row"/><span class="check-box">${icon("check", 11)}</span></label></td>` : ""}${o.columns
        .map((c) => `<td class="${[c.num ? "num" : "", c.cls ?? ""].filter(Boolean).join(" ")}" data-label="${esc(c.label)}">${c.render(row)}</td>`)
        .join("")}</tr>`;
    })
    .join("");
  const table = o.rows.length
    ? `<div class="table-wrap${o.flush ? " flush" : ""}"><table class="dt${o.cards ? " cards" : ""}">${o.caption ? `<caption class="sr-only">${esc(o.caption)}</caption>` : ""}<thead>${head}</thead><tbody>${body}</tbody></table></div>`
    : o.empty;
  return `<div id="${esc(o.id)}" data-table-root>${table}${!o.plain && o.rows.length > Math.min(o.state.pageSize, 10) ? pager(o.id, o.state, sorted.length, pages) : ""}</div>`;
}

function pager(id: string, s: TableState, total: number, pages: number): string {
  const from = (s.page - 1) * s.pageSize + 1;
  const to = Math.min(total, s.page * s.pageSize);
  const btn = (page: number, label: string, o: { on?: boolean; disabled?: boolean; aria?: string } = {}) =>
    `<button type="button" data-action="dt-page" data-table="${esc(id)}" data-page="${page}"${o.on ? ' class="on" aria-current="page"' : ""}${o.disabled ? " disabled" : ""}${o.aria ? ` aria-label="${esc(o.aria)}"` : ""}>${label}</button>`;
  const nums: Array<number | "gap"> = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - s.page) <= 1) nums.push(p);
    else if (nums.at(-1) !== "gap") nums.push("gap");
  }
  return `<div class="dt-foot"><span>Showing <b class="fg">${num(from)}–${num(to)}</b> of ${num(total)}</span><span class="page-size">Rows <select class="input" data-action="dt-size" data-table="${esc(id)}" aria-label="Rows per page">${[10, 25, 50, 100].map((n) => `<option value="${n}"${n === s.pageSize ? " selected" : ""}>${n}</option>`).join("")}</select></span>${
    pages > 1
      ? `<nav class="pager" aria-label="Pages">${btn(s.page - 1, icon("chevronLeft", 13), { disabled: s.page === 1, aria: "Previous page" })}${nums.map((p) => (p === "gap" ? '<span class="gap">…</span>' : btn(p, String(p), { on: p === s.page }))).join("")}${btn(s.page + 1, icon("chevronRight", 13), { disabled: s.page === pages, aria: "Next page" })}</nav>`
      : ""
  }</div>`;
}

/** Comparators for common column types. */
export const by = {
  text: <T>(f: (r: T) => string | undefined) => (a: T, b: T) => (f(a) ?? "").localeCompare(f(b) ?? ""),
  num: <T>(f: (r: T) => number | null | undefined) => (a: T, b: T) => (f(a) ?? -Infinity) - (f(b) ?? -Infinity),
  time: <T>(f: (r: T) => string | undefined) => (a: T, b: T) => (f(a) ?? "").localeCompare(f(b) ?? ""),
};
