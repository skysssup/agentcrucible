/** Page structure: headers, panels, KPI strips, definition lists, page states, and callouts. */
import { esc } from "../lib/format.js";
import { icon, type IconName } from "../icons.js";

export interface PageHeadOpts {
  title: string;
  /** Escaped HTML under the title. */
  desc?: string;
  /** Escaped HTML items shown as a row of facts (agent, seed, time...). */
  meta?: string[];
  /** Escaped HTML above the title, such as a kind of object. */
  eyebrow?: string;
  actions?: string;
  /** The title is an id: shown in mono. */
  mono?: boolean;
  /** Escaped HTML placed after the title text (a badge, a status). */
  titleExtra?: string;
}

export function pageHead(o: PageHeadOpts): string {
  return `<header class="page-head">
  <div class="page-head-main">${o.eyebrow ? `<span class="eyebrow">${o.eyebrow}</span>` : ""}<h1 class="page-title${o.mono ? " mono" : ""}">${esc(o.title)}${o.titleExtra ?? ""}</h1>${o.desc ? `<p class="page-desc">${o.desc}</p>` : ""}${o.meta?.length ? `<div class="page-meta">${o.meta.map((m) => `<span>${m}</span>`).join("")}</div>` : ""}</div>
  ${o.actions ? `<div class="page-actions">${o.actions}</div>` : ""}
</header>`;
}

export function metaItem(name: IconName, html: string, title = ""): string {
  return `${icon(name, 13)}<span${title ? ` title="${esc(title)}"` : ""}>${html}</span>`;
}

export interface PanelOpts {
  title?: string;
  icon?: IconName;
  /** Escaped HTML beside the title. */
  meta?: string;
  /** Escaped HTML on the right of the head. */
  actions?: string;
  /** Escaped HTML in a footer bar. */
  foot?: string;
  /** No padding around the body, for tables and lists. */
  flush?: boolean;
  id?: string;
  cls?: string;
  attrs?: string;
  bodyCls?: string;
}

export function panel(o: PanelOpts, body: string): string {
  const head = o.title || o.actions ? `<div class="panel-head">${o.title ? `<h2 class="panel-title">${o.icon ? icon(o.icon, 14) : ""}${esc(o.title)}</h2>` : ""}${o.meta ? `<span class="panel-meta">${o.meta}</span>` : ""}${o.actions ? `<div class="panel-actions">${o.actions}</div>` : ""}</div>` : "";
  return `<section class="panel${o.flush ? " panel-flush" : ""}${o.cls ? ` ${o.cls}` : ""}"${o.id ? ` id="${esc(o.id)}"` : ""}${o.attrs ? ` ${o.attrs}` : ""}>${head}${o.flush ? body : `<div class="panel-body${o.bodyCls ? ` ${o.bodyCls}` : ""}">${body}</div>`}${o.foot ? `<div class="panel-foot">${o.foot}</div>` : ""}</section>`;
}

export interface KpiOpts {
  label: string;
  value: string | number;
  /** Small text after the value, such as "/ 25". */
  unit?: string;
  /** Escaped HTML: a delta. */
  delta?: string;
  /** Escaped HTML: a sparkline. */
  spark?: string;
  sub?: string;
  href?: string;
  tone?: "" | "ok" | "bad" | "warn";
  icon?: IconName;
  title?: string;
}

export function kpi(o: KpiOpts): string {
  const inner = `<span class="kpi-label">${o.icon ? icon(o.icon, 12) : ""}${esc(o.label)}</span><span class="kpi-row"><span class="kpi-num">${esc(o.value)}${o.unit ? `<small>${esc(o.unit)}</small>` : ""}</span>${o.delta ?? ""}</span>${o.spark ? `<span class="kpi-spark">${o.spark}</span>` : ""}${o.sub ? `<span class="kpi-sub" title="${esc(o.title ?? o.sub)}">${esc(o.sub)}</span>` : ""}`;
  const cls = `kpi${o.tone ? ` ${o.tone}` : ""}`;
  return o.href ? `<a class="${cls}" href="${esc(o.href)}">${inner}</a>` : `<div class="${cls}">${inner}</div>`;
}

export function kpis(items: string[], label = "Key numbers"): string {
  return `<section class="kpis" style="--kpi-cols:${items.length}" aria-label="${esc(label)}">${items.join("")}</section>`;
}

/** A definition list of label and escaped-HTML value pairs. */
export function facts(rows: Array<[string, string] | false | undefined>): string {
  return `<dl class="facts">${rows
    .filter((r): r is [string, string] => Boolean(r))
    .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`)
    .join("")}</dl>`;
}

export function emptyState(o: { icon?: IconName; title: string; text?: string; actions?: string; compact?: boolean }): string {
  return `<div class="empty${o.compact ? " compact" : ""}"><span class="empty-art">${icon(o.icon ?? "inbox", o.compact ? 16 : 20)}</span><div class="empty-title">${esc(o.title)}</div>${o.text ? `<p class="empty-text">${o.text}</p>` : ""}${o.actions ? `<div class="empty-actions">${o.actions}</div>` : ""}</div>`;
}

export function callout(kind: "info" | "ok" | "bad" | "warn" | "accent", body: string, o: { title?: string; icon?: IconName; actions?: string } = {}): string {
  const ic: IconName = o.icon ?? (kind === "ok" ? "checkCircle" : kind === "bad" ? "xCircle" : kind === "warn" ? "alert" : kind === "accent" ? "zap" : "info");
  return `<div class="callout ${kind}" role="${kind === "bad" ? "alert" : "status"}">${icon(ic, 15)}<div class="callout-body">${o.title ? `<strong class="callout-title">${esc(o.title)}</strong>` : ""}${body}</div>${o.actions ? `<div class="callout-actions">${o.actions}</div>` : ""}</div>`;
}

export function progressBar(fraction: number | null, o: { color?: string; label?: string } = {}): string {
  if (fraction === null) return `<div class="progress indeterminate" role="progressbar" aria-label="${esc(o.label ?? "Working")}"><span class="progress-fill"></span></div>`;
  const pct = Math.max(0, Math.min(100, Math.round(fraction * 100)));
  return `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"${o.label ? ` aria-label="${esc(o.label)}"` : ""}><span class="progress-fill" style="width:${pct}%${o.color ? `;--pf:${o.color}` : ""}"></span></div>`;
}

/** Grey blocks in the shape of a page while its data loads. */
export function skeletonPage(kind: "dashboard" | "table" | "detail" = "table"): string {
  const lines = (n: number) => Array.from({ length: n }, (_, i) => `<span class="sk sk-line" style="width:${[92, 76, 84, 60, 88, 70][i % 6]}%"></span>`).join("");
  const kpiRow = `<div class="kpis" style="--kpi-cols:4">${Array.from({ length: 4 }, () => `<div class="kpi"><span class="sk sk-line" style="width:40%"></span><span class="sk" style="height:22px;width:55%;margin:6px 0"></span><span class="sk sk-line" style="width:70%"></span></div>`).join("")}</div>`;
  const body =
    kind === "dashboard"
      ? `${kpiRow}<div class="grid g-8-4"><div class="panel"><div class="panel-body"><span class="sk sk-block" style="height:220px"></span></div></div><div class="panel"><div class="panel-body">${lines(8)}</div></div></div>`
      : kind === "detail"
        ? `<div class="grid g-main-side"><div class="stack"><div class="panel"><div class="panel-body">${lines(5)}</div></div><div class="panel"><div class="panel-body">${lines(7)}</div></div></div><div class="panel"><div class="panel-body">${lines(6)}</div></div></div>`
        : `<div class="panel"><div class="panel-body">${lines(10)}</div></div>`;
  return `<div class="page" aria-busy="true"><span class="sk sk-title"></span><span class="sk sk-line" style="width:340px;margin-bottom:22px"></span>${body}</div>`;
}

export function sectionHead(title: string, meta = "", actions = ""): string {
  return `<div class="section-head"><h2>${esc(title)}</h2>${meta ? `<span class="muted">${meta}</span>` : ""}${actions ? `<span class="spacer"></span>${actions}` : ""}</div>`;
}
