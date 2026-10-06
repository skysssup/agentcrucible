/** Small building blocks every page uses: buttons, form controls, chips, avatars, deltas. All return HTML strings. */
import { esc, initials } from "../lib/format.js";
import { icon, type IconName } from "../icons.js";

export type ButtonKind = "primary" | "secondary" | "ghost" | "danger" | "ink" | "link";

export interface ButtonOpts {
  action?: string;
  href?: string;
  kind?: ButtonKind;
  icon?: IconName;
  /** Icon after the label, such as a chevron on a menu button. */
  iconEnd?: IconName;
  attrs?: string;
  title?: string;
  disabled?: boolean;
  size?: "sm" | "lg";
  /** A keyboard hint shown inside the button. */
  kbd?: string;
  type?: "button" | "submit";
  /** Only the icon is shown; the label becomes the accessible name. */
  iconOnly?: boolean;
  data?: Record<string, string | number | undefined>;
}

function dataAttrs(data?: Record<string, string | number | undefined>): string {
  return data
    ? Object.entries(data)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => ` data-${k}="${esc(v)}"`)
        .join("")
    : "";
}

export function button(label: string, o: ButtonOpts = {}): string {
  const cls = `btn btn-${o.kind ?? "secondary"}${o.size ? ` btn-${o.size}` : ""}${o.iconOnly ? " btn-icon" : ""}`;
  const inner = `${o.icon ? icon(o.icon, o.size === "sm" ? 13 : 14) : ""}${o.iconOnly ? `<span class="sr-only">${esc(label)}</span>` : `<span>${esc(label)}</span>`}${o.iconEnd ? icon(o.iconEnd, 13) : ""}${o.kbd ? `<kbd class="btn-kbd">${esc(o.kbd)}</kbd>` : ""}`;
  const title = o.title ?? (o.iconOnly ? label : undefined);
  const common = `class="${cls}"${title ? ` title="${esc(title)}" aria-label="${esc(o.iconOnly ? label : title)}"` : ""}${dataAttrs(o.data)}${o.attrs ? ` ${o.attrs}` : ""}`;
  if (o.href && !o.disabled) return `<a ${common} href="${esc(o.href)}">${inner}</a>`;
  return `<button type="${o.type ?? "button"}" ${common}${o.action ? ` data-action="${esc(o.action)}"` : ""}${o.disabled ? " disabled" : ""}>${inner}</button>`;
}

export function iconButton(name: IconName, label: string, o: { action?: string; attrs?: string; size?: "sm"; pressed?: boolean; href?: string; data?: Record<string, string | number | undefined> } = {}): string {
  const cls = `icon-btn${o.size ? ` ${o.size}` : ""}`;
  const common = `class="${cls}" title="${esc(label)}" aria-label="${esc(label)}"${o.pressed === undefined ? "" : ` aria-pressed="${o.pressed}"`}${dataAttrs(o.data)}${o.attrs ? ` ${o.attrs}` : ""}`;
  if (o.href) return `<a ${common} href="${esc(o.href)}">${icon(name, o.size ? 14 : 16)}</a>`;
  return `<button type="button" ${common}${o.action ? ` data-action="${esc(o.action)}"` : ""}>${icon(name, o.size ? 14 : 16)}</button>`;
}

export function copyButton(text: string, label = "Copy", o: { size?: "sm"; kind?: ButtonKind; iconOnly?: boolean } = {}): string {
  return button(label, { action: "copy", icon: "copy", kind: o.kind ?? "ghost", size: o.size ?? "sm", iconOnly: o.iconOnly, data: { copy: text } });
}

export function kbd(...keys: string[]): string {
  return keys.map((k) => `<kbd>${esc(k)}</kbd>`).join("");
}

export function avatar(name: string, color = "clay", size: "" | "sm" | "lg" = ""): string {
  return `<span class="avatar ${esc(color)}${size ? ` ${size}` : ""}" aria-hidden="true">${esc(initials(name))}</span>`;
}

export function glyph(name: IconName, size: "" | "lg" = ""): string {
  return `<span class="glyph${size ? ` ${size}` : ""}" aria-hidden="true">${icon(name, size ? 18 : 15)}</span>`;
}

export function statusDot(kind: "ok" | "bad" | "warn" | "accent" | "live" | "running" | "" = "", title = ""): string {
  return `<span class="status-dot ${kind}"${title ? ` title="${esc(title)}"` : ""} aria-hidden="true"></span>`;
}

export function pill(text: string, kind: "" | "ok" | "bad" | "warn" | "accent" | "info" | "outline" = "", title = ""): string {
  return `<span class="pill ${kind}"${title ? ` title="${esc(title)}"` : ""}>${esc(text)}</span>`;
}

export const WORLD_ICONS: Record<string, IconName> = { payments: "card", email: "mail", database: "database", tickets: "ticket", filesystem: "folder" };

export function worldIcon(world: string, size = 14): string {
  return icon(WORLD_ICONS[world] ?? "cube", size);
}

export function worldChip(world: string): string {
  return `<span class="world-chip">${worldIcon(world, 12)}${esc(world)}</span>`;
}

export function faultTag(text: string, title = ""): string {
  return `<span class="fault-tag" title="${esc(title || text)}">${icon("zap", 11)}${esc(text)}</span>`;
}

export function codeChip(text: string, title = ""): string {
  return `<code class="code-chip"${title ? ` title="${esc(title)}"` : ""}>${esc(text)}</code>`;
}

/**
 * A change between two numbers: "▲ 12 pts" in green when up is good. `inverse` flips the colors
 * for numbers where up is bad, such as critical results.
 */
export function delta(change: number | null, o: { unit?: "pts" | "%" | ""; inverse?: boolean; digits?: number; title?: string } = {}): string {
  if (change === null || !Number.isFinite(change)) return "";
  const unit = o.unit ?? "";
  const value = Math.abs(change).toFixed(o.digits ?? 0);
  const suffix = unit === "%" ? "%" : unit ? ` ${unit}` : "";
  if (Number(value) === 0) return `<span class="delta flat"${o.title ? ` title="${esc(o.title)}"` : ""}>±0${suffix}</span>`;
  const dir = change > 0 ? "up" : "down";
  return `<span class="delta ${dir}${o.inverse ? " inverse" : ""}"${o.title ? ` title="${esc(o.title)}"` : ""}>${icon(change > 0 ? "arrowUp" : "arrowDown", 11)}${value}${suffix}</span>`;
}

export function checkbox(o: { name?: string; value?: string; checked?: boolean; label?: string; action?: string; attrs?: string; ariaLabel?: string; indeterminate?: boolean }): string {
  return `<label class="check"><input type="checkbox"${o.name ? ` name="${esc(o.name)}"` : ""}${o.value !== undefined ? ` value="${esc(o.value)}"` : ""}${o.checked ? " checked" : ""}${o.action ? ` data-action="${esc(o.action)}"` : ""}${o.ariaLabel ? ` aria-label="${esc(o.ariaLabel)}"` : ""}${o.indeterminate ? " data-indeterminate" : ""}${o.attrs ? ` ${o.attrs}` : ""}/><span class="check-box">${icon(o.indeterminate ? "minus" : "check", 11)}</span>${o.label ? `<span class="check-label">${esc(o.label)}</span>` : ""}</label>`;
}

export function toggle(o: { name?: string; checked?: boolean; label?: string; attrs?: string }): string {
  return `<label class="switch"><input type="checkbox" role="switch"${o.name ? ` name="${esc(o.name)}"` : ""}${o.checked ? " checked" : ""}${o.attrs ? ` ${o.attrs}` : ""}/><span class="switch-track"></span>${o.label ? `<span class="check-label">${esc(o.label)}</span>` : ""}</label>`;
}

/** A segmented control: one choice of several, each a button with data-action and data-value. */
export function segmented(action: string, current: string, options: Array<{ value: string; label: string; count?: number; icon?: IconName; title?: string }>, o: { label?: string; wrap?: boolean } = {}): string {
  return `<div class="seg${o.wrap ? " seg-wrap" : ""}" role="group"${o.label ? ` aria-label="${esc(o.label)}"` : ""}>${options
    .map(
      (opt) =>
        `<button type="button" class="seg-btn${opt.value === current ? " on" : ""}" data-action="${esc(action)}" data-value="${esc(opt.value)}" aria-pressed="${opt.value === current}"${opt.title ? ` title="${esc(opt.title)}"` : ""}>${opt.icon ? icon(opt.icon, 13) : ""}${esc(opt.label)}${opt.count !== undefined ? `<span class="seg-count">${opt.count}</span>` : ""}</button>`
    )
    .join("")}</div>`;
}

/** Tabs that link to routes (`href`) or switch in place (`action` + data-value). */
export function tabs(items: Array<{ id: string; label: string; count?: number; href?: string; icon?: IconName }>, current: string, o: { action?: string; label?: string } = {}): string {
  return `<nav class="tabs" role="tablist"${o.label ? ` aria-label="${esc(o.label)}"` : ""}>${items
    .map((t) => {
      const on = t.id === current;
      const inner = `${t.icon ? icon(t.icon, 14) : ""}${esc(t.label)}${t.count !== undefined ? `<span class="tab-count">${t.count}</span>` : ""}`;
      return t.href
        ? `<a class="tab${on ? " on" : ""}" role="tab" aria-selected="${on}" href="${esc(t.href)}">${inner}</a>`
        : `<button type="button" class="tab${on ? " on" : ""}" role="tab" aria-selected="${on}" data-action="${esc(o.action ?? "tab")}" data-value="${esc(t.id)}">${inner}</button>`;
    })
    .join("")}</nav>`;
}

export function field(label: string, control: string, o: { hint?: string; optional?: boolean; error?: string; attrs?: string } = {}): string {
  return `<label class="field"${o.attrs ? ` ${o.attrs}` : ""}><span class="field-label">${esc(label)}${o.optional ? '<span class="opt">optional</span>' : ""}</span>${control}${o.hint ? `<span class="field-hint">${o.hint}</span>` : ""}${o.error ? `<span class="field-error">${esc(o.error)}</span>` : ""}</label>`;
}

export function searchInput(o: { id: string; value?: string; placeholder: string; label?: string; kbd?: string; attrs?: string; width?: string }): string {
  return `<label class="input-wrap search"${o.width ? ` style="width:${esc(o.width)}"` : ""}>${icon("search", 14)}<input class="input" type="search" id="${esc(o.id)}" data-input="${esc(o.id)}" value="${esc(o.value ?? "")}" placeholder="${esc(o.placeholder)}" aria-label="${esc(o.label ?? o.placeholder)}" autocomplete="off" spellcheck="false"${o.attrs ? ` ${o.attrs}` : ""}/>${o.kbd ? `<kbd>${esc(o.kbd)}</kbd>` : ""}</label>`;
}

export function select(o: { name?: string; id?: string; input?: string; value: string; options: Array<{ value: string; label: string }>; label?: string; attrs?: string; width?: string }): string {
  return `<select class="input"${o.name ? ` name="${esc(o.name)}"` : ""}${o.id ? ` id="${esc(o.id)}"` : ""}${o.input ? ` data-input="${esc(o.input)}"` : ""}${o.label ? ` aria-label="${esc(o.label)}"` : ""}${o.width ? ` style="width:${esc(o.width)}"` : ""}${o.attrs ? ` ${o.attrs}` : ""}>${o.options.map((opt) => `<option value="${esc(opt.value)}"${opt.value === o.value ? " selected" : ""}>${esc(opt.label)}</option>`).join("")}</select>`;
}

/** A tooltip on any element: plain text in data-tip. */
export function tip(text: string): string {
  return ` data-tip="${esc(text)}"`;
}

/** A tooltip with markup the caller built and escaped. */
export function tipHtml(html: string): string {
  return ` data-tip-html="${esc(html)}"`;
}

/** A filter control that opens a checklist: "Agents · 3" when some are chosen, "Agents" when none or all are. */
export function filterButton(label: string, action: string, chosen: number, total: number, o: { icon?: IconName } = {}): string {
  const active = chosen > 0 && chosen < total;
  return `<button type="button" class="btn btn-secondary btn-sm filter-btn${active ? " active" : ""}" data-action="${esc(action)}" aria-haspopup="dialog">${o.icon ? icon(o.icon, 13) : ""}<span>${esc(label)}</span>${active ? `<b class="filter-count">${chosen}</b>` : ""}${icon("chevronDown", 12)}</button>`;
}
