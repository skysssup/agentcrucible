/**
 * SVG charts drawn from data: sparklines, line charts, stacked verdict bars, donuts, heat maps,
 * and bar lists. Line and bar charts register their spec so `fitCharts` can redraw them at the
 * width of their container; every point carries a tooltip with its numbers.
 */
import { VERDICTS, type Verdict } from "../../../types.js";
import { esc } from "../lib/format.js";
import { VERDICT_VAR, type Tally } from "./verdicts.js";

export interface Series {
  id: string;
  label: string;
  color: string;
  values: Array<number | null>;
}

export interface LineSpec {
  kind: "line";
  series: Series[];
  /** One label per x position, shown sparsely under the axis. */
  labels: string[];
  /** Full labels for tooltips; defaults to `labels`. */
  tipLabels?: string[];
  height?: number;
  min?: number;
  max?: number;
  format?: (v: number) => string;
  /** Vertical marks, such as releases. */
  marks?: Array<{ index: number; label: string }>;
  area?: boolean;
  ariaLabel: string;
}

export interface BarsSpec {
  kind: "bars";
  labels: string[];
  tipLabels?: string[];
  stacks: Array<Partial<Record<Verdict, number>>>;
  /** Each bar shows shares of its total instead of counts. */
  normalized?: boolean;
  /** A line over the bars on a 0-1 scale, such as the safe rate. */
  line?: { label: string; color: string; values: Array<number | null> };
  /** Vertical marks, such as releases. */
  marks?: Array<{ index: number; label: string }>;
  height?: number;
  hrefs?: Array<string | undefined>;
  ariaLabel: string;
}

type Spec = LineSpec | BarsSpec;
const specs = new Map<string, Spec>();
let nextChart = 1;

const PAD = { top: 12, right: 12, bottom: 24, left: 40 };

/** A round step for about four gridlines up to `v`: 1, 2, or 5 times a power of ten. */
function niceStep(v: number): number {
  if (v <= 0) return 1;
  const raw = v / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** The top of the axis and its gridline values for data up to `v`. */
function axis(v: number, integer: boolean): { max: number; ticks: number[] } {
  const step = Math.max(integer ? 1 : 0, niceStep(v || 1));
  const max = Math.max(step, Math.ceil((v || 1) / step) * step);
  const ticks: number[] = [];
  for (let t = 0; t <= max + 1e-9; t += step) ticks.push(Number(t.toFixed(6)));
  return { max, ticks };
}

/** Which x positions get a label: about one per 90 pixels, always the first and the last. */
function labelIndexes(count: number, width: number): Set<number> {
  const room = Math.max(2, Math.floor(width / 90));
  const step = Math.max(1, Math.ceil(count / room));
  const out = new Set<number>();
  for (let i = 0; i < count; i += step) out.add(i);
  const lastPicked = Math.floor((count - 1) / step) * step;
  if (lastPicked !== 0 && count - 1 - lastPicked < step / 2) out.delete(lastPicked);
  out.add(count - 1);
  return out;
}

function renderLine(s: LineSpec, width: number): string {
  const height = s.height ?? 220;
  const w = width - PAD.left - PAD.right;
  const h = height - PAD.top - PAD.bottom;
  const n = s.labels.length;
  const all = s.series.flatMap((x) => x.values.filter((v): v is number => v !== null));
  const min = s.min ?? 0;
  const ax = axis(Math.max(...all, 0), s.max === undefined);
  const max = s.max ?? ax.max;
  const fmt = s.format ?? ((v: number) => String(Math.round(v)));
  const x = (i: number) => PAD.left + (n <= 1 ? w / 2 : (i / (n - 1)) * w);
  const y = (v: number) => PAD.top + h - ((v - min) / (max - min || 1)) * h;
  const ticks = s.max === undefined ? ax.ticks : [0, 0.25, 0.5, 0.75, 1].map((t) => min + t * (max - min));
  const grid = ticks.map((t) => `<line class="grid-line${t === min ? " zero" : ""}" x1="${PAD.left}" x2="${PAD.left + w}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/><text class="axis-label y" x="${PAD.left - 8}" y="${(y(t) + 3).toFixed(1)}">${esc(fmt(t))}</text>`).join("");
  const shown = labelIndexes(n, w);
  const xLabels = s.labels.map((l, i) => (shown.has(i) ? `<text class="axis-label" x="${x(i).toFixed(1)}" y="${height - 6}" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}">${esc(l)}</text>` : "")).join("");
  const marks = (s.marks ?? []).map((m) => `<line class="annot-line" x1="${x(m.index).toFixed(1)}" x2="${x(m.index).toFixed(1)}" y1="${PAD.top}" y2="${PAD.top + h}"/><text class="annot-text" x="${(x(m.index) + 4).toFixed(1)}" y="${PAD.top + 9}">${esc(m.label)}</text>`).join("");
  const lines = s.series
    .map((ser) => {
      const segs: string[] = [];
      let cur = "";
      ser.values.forEach((v, i) => {
        if (v === null) {
          if (cur) segs.push(cur);
          cur = "";
          return;
        }
        cur += `${cur ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
      });
      if (cur) segs.push(cur);
      const area = s.area && s.series.length === 1 ? segs.map((d) => `<path class="series-area" fill="${ser.color}" d="${d}L${d.match(/([\d.]+) [\d.]+$/)?.[1]} ${PAD.top + h}L${d.match(/^M([\d.]+)/)?.[1]} ${PAD.top + h}Z"/>`).join("") : "";
      const lone = ser.values.map((v, i) => (v !== null && (ser.values[i - 1] ?? null) === null && (ser.values[i + 1] ?? null) === null ? `<circle class="series-dot" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.6" fill="${ser.color}"/>` : "")).join("");
      return `${area}${segs.map((d) => `<path class="series-line" stroke="${ser.color}" d="${d}"/>`).join("")}${lone}`;
    })
    .join("");
  const colW = n <= 1 ? w : w / (n - 1);
  const hits = s.labels
    .map((_, i) => {
      const rows = s.series.filter((ser) => ser.values[i] !== null).map((ser) => `<span class="tip-row"><span><i style="--sw:${ser.color}"></i> ${esc(ser.label)}</span><b>${esc(fmt(ser.values[i]!))}</b></span>`);
      const tip = `<span class="tip-title">${esc(s.tipLabels?.[i] ?? s.labels[i])}</span>${rows.join("") || '<span class="tip-row">no results</span>'}`;
      const left = Math.max(PAD.left, x(i) - colW / 2);
      const right = Math.min(PAD.left + w, x(i) + colW / 2);
      return `<rect class="hit" x="${left.toFixed(1)}" y="${PAD.top}" width="${Math.max(1, right - left).toFixed(1)}" height="${h}" data-tip-html="${esc(tip)}"/>`;
    })
    .join("");
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(s.ariaLabel)}">${grid}${xLabels}${marks}${lines}${hits}</svg>`;
}

function renderBars(s: BarsSpec, width: number): string {
  const height = s.height ?? 200;
  const right = s.line ? 36 : PAD.right;
  const w = width - PAD.left - right;
  const h = height - PAD.top - PAD.bottom;
  const n = s.labels.length;
  const totals = s.stacks.map((st) => VERDICTS.reduce((sum, v) => sum + (st[v] ?? 0), 0));
  const ax = axis(Math.max(...totals, 1), true);
  const max = s.normalized ? 1 : ax.max;
  const slot = w / Math.max(1, n);
  const barW = Math.max(2, Math.min(28, slot * 0.68));
  const y = (v: number) => PAD.top + h - (v / max) * h;
  const ticks = s.normalized ? [0, 0.25, 0.5, 0.75, 1] : ax.ticks;
  const fmt = (v: number) => (s.normalized ? `${Math.round(v * 100)}%` : Number.isInteger(v) ? String(v) : v.toFixed(1));
  const grid = ticks.map((t) => `<line class="grid-line${t === 0 ? " zero" : ""}" x1="${PAD.left}" x2="${PAD.left + w}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/><text class="axis-label y" x="${PAD.left - 8}" y="${(y(t) + 3).toFixed(1)}">${esc(fmt(t))}</text>`).join("");
  const right2 = s.line ? [0, 0.5, 1].map((t) => `<text class="axis-label" x="${PAD.left + w + 6}" y="${(PAD.top + h - t * h + 3).toFixed(1)}">${Math.round(t * 100)}%</text>`).join("") : "";
  const shown = labelIndexes(n, w);
  const bars = s.stacks
    .map((st, i) => {
      const cx = PAD.left + slot * i + slot / 2;
      let acc = 0;
      const total = totals[i];
      const segs = VERDICTS.filter((v) => (st[v] ?? 0) > 0)
        .reverse()
        .map((v) => {
          const val = s.normalized ? (st[v] ?? 0) / (total || 1) : (st[v] ?? 0);
          const y0 = y(acc + val);
          const y1 = y(acc);
          acc += val;
          return `<rect class="bar-seg" x="${(cx - barW / 2).toFixed(1)}" y="${y0.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0.5, y1 - y0).toFixed(1)}" fill="${VERDICT_VAR[v]}"/>`;
        })
        .join("");
      const label = shown.has(i) ? `<text class="axis-label" x="${cx.toFixed(1)}" y="${height - 6}" text-anchor="middle">${esc(s.labels[i])}</text>` : "";
      const rows = VERDICTS.filter((v) => (st[v] ?? 0) > 0).map((v) => `<span class="tip-row ${v}"><span><i></i> ${v}</span><b>${st[v]}</b></span>`);
      const lineRow = s.line && s.line.values[i] !== null ? `<span class="tip-row"><span><i style="--sw:${s.line.color}"></i> ${esc(s.line.label)}</span><b>${Math.round(s.line.values[i]! * 100)}%</b></span>` : "";
      const tip = `<span class="tip-title">${esc(s.tipLabels?.[i] ?? s.labels[i])} · ${total} result${total === 1 ? "" : "s"}</span>${rows.join("")}${lineRow}`;
      const href = s.hrefs?.[i];
      const hit = `<rect class="hit" x="${(PAD.left + slot * i).toFixed(1)}" y="${PAD.top}" width="${slot.toFixed(1)}" height="${h}" data-tip-html="${esc(tip)}"${href ? ` data-href="${esc(href)}"` : ""}/>`;
      return `${segs}${label}${hit}`;
    })
    .join("");
  let line = "";
  if (s.line) {
    const pts = s.line.values.map((v, i) => (v === null ? null : [PAD.left + slot * i + slot / 2, PAD.top + h - v * h] as const));
    let d = "";
    for (const p of pts) if (p) d += `${d ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    line = `<path class="series-line" stroke="${s.line.color}" d="${d}" style="pointer-events:none"/>${pts.map((p) => (p ? `<circle class="series-dot" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.4" fill="${s.line!.color}" style="pointer-events:none"/>` : "")).join("")}`;
  }
  const marks = (s.marks ?? []).map((m) => {
    const mx = PAD.left + slot * m.index + slot / 2;
    return `<line class="annot-line" x1="${mx.toFixed(1)}" x2="${mx.toFixed(1)}" y1="${PAD.top}" y2="${PAD.top + h}"/><text class="annot-text" x="${(mx + 4).toFixed(1)}" y="${PAD.top + 9}">${esc(m.label)}</text>`;
  }).join("");
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(s.ariaLabel)}">${grid}${right2}${marks}${bars}${line}</svg>`;
}

function render(spec: Spec, width: number): string {
  return spec.kind === "line" ? renderLine(spec, width) : renderBars(spec, width);
}

/** A chart that redraws itself at its container's width once the page is mounted. */
export function chart(spec: Spec, width = 720): string {
  const id = `chart-${nextChart++}`;
  specs.set(id, spec);
  if (specs.size > 60) specs.delete(specs.keys().next().value!);
  return `<div class="chart-wrap" data-chart="${id}">${render(spec, width)}</div>`;
}

/** Redraws every chart under `root` at the width it has now. */
export function fitCharts(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>(".chart-wrap[data-chart]")) {
    const spec = specs.get(el.dataset.chart ?? "");
    const width = Math.floor(el.clientWidth);
    if (!spec || width < 40 || Number(el.dataset.width) === width) continue;
    el.dataset.width = String(width);
    el.innerHTML = render(spec, width);
  }
}

/** A small trend line with an optional filled area and a dot on the last value. */
export function sparkline(values: Array<number | null>, o: { width?: number; height?: number; color?: string; min?: number; max?: number; label?: string; area?: boolean } = {}): string {
  const width = o.width ?? 96;
  const height = o.height ?? 24;
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return `<svg class="spark" width="${width}" height="${height}" aria-hidden="true"><line x1="0" x2="${width}" y1="${height - 1}" y2="${height - 1}" stroke="var(--border)" stroke-dasharray="2 3"/></svg>`;
  const min = o.min ?? Math.min(...nums);
  const max = o.max ?? Math.max(...nums);
  const x = (i: number) => (values.length <= 1 ? width / 2 : (i / (values.length - 1)) * (width - 4) + 2);
  const y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6);
  let d = "";
  let last: [number, number] | undefined;
  values.forEach((v, i) => {
    if (v === null) return;
    d += `${d ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    last = [x(i), y(v)];
  });
  const first = values.findIndex((v) => v !== null);
  const area = o.area !== false && last ? `<path class="area" d="${d}L${last[0].toFixed(1)} ${height}L${x(first).toFixed(1)} ${height}Z"/>` : "";
  return `<svg class="spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="${o.color ? `--spark:${o.color}` : ""}" role="img" aria-label="${esc(o.label ?? "trend")}">${area}<path d="${d}"/>${last ? `<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2"/>` : ""}</svg>`;
}

/** A ring of verdict shares with a number in the middle. */
export function donut(parts: Tally, o: { size?: number; thickness?: number; value?: string; label?: string } = {}): string {
  const size = o.size ?? 132;
  const t = o.thickness ?? 12;
  const r = (size - t) / 2;
  const c = 2 * Math.PI * r;
  const total = parts.reduce((s, [, n]) => s + n, 0);
  const gap = parts.length > 1 ? 2 : 0;
  let offset = 0;
  const segs = total
    ? parts
        .map(([v, n]) => {
          const len = (n / total) * c;
          const seg = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${VERDICT_VAR[v]}" stroke-width="${t}" stroke-dasharray="${Math.max(0, len - gap).toFixed(2)} ${(c - Math.max(0, len - gap)).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"><title>${n} ${v}</title></circle>`;
          offset += len;
          return seg;
        })
        .join("")
    : "";
  return `<span class="donut-wrap" style="width:${size}px;height:${size}px"><svg class="donut" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(parts.map(([v, n]) => `${n} ${v}`).join(", ") || "no results")}" style="transform:rotate(-90deg)"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="${t}"/>${segs}</svg>${o.value !== undefined ? `<span class="donut-center"><b>${esc(o.value)}</b>${o.label ? `<span>${esc(o.label)}</span>` : ""}</span>` : ""}</span>`;
}

/** Background and text colors for a safe rate: red below half, amber below 80%, green above. */
export function rateColors(rate: number | null): { bg: string; fg: string } {
  if (rate === null) return { bg: "transparent", fg: "var(--faint)" };
  const hue = rate >= 0.8 ? "ssucc" : rate >= 0.5 ? "degr" : "harm";
  const strength = rate >= 0.8 ? 12 + (rate - 0.8) * 100 : rate >= 0.5 ? 14 + (0.8 - rate) * 40 : 16 + (0.5 - rate) * 50;
  return { bg: `color-mix(in srgb, var(--${hue}) ${Math.round(strength)}%, var(--surface))`, fg: `var(--${hue}-fg)` };
}

export interface HeatCell {
  text: string;
  tip: string;
  href?: string;
  bg?: string;
  fg?: string;
  empty?: boolean;
}

/** A grid of labeled cells, rows by columns, with a tooltip and an optional link per cell. */
export function heatmap(rows: string[], cols: string[], cell: (row: string, col: string) => HeatCell, o: { rowHref?: (row: string) => string; corner?: string; ariaLabel: string }): string {
  return `<div class="table-wrap flush" style="overflow:auto"><table class="hm-grid" aria-label="${esc(o.ariaLabel)}"><thead><tr><th class="row-h">${esc(o.corner ?? "")}</th>${cols.map((c) => `<th title="${esc(c)}">${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows
    .map(
      (r) =>
        `<tr><th class="row-h" scope="row">${o.rowHref ? `<a class="link-mono" href="${esc(o.rowHref(r))}">${esc(r)}</a>` : esc(r)}</th>${cols
          .map((c) => {
            const v = cell(r, c);
            const style = v.empty ? "" : ` style="--hm-bg:${v.bg ?? "var(--surface-3)"};--hm-fg:${v.fg ?? "var(--fg)"}"`;
            const inner = `${esc(v.text)}`;
            return `<td>${v.href && !v.empty ? `<a class="hm-cell2" href="${esc(v.href)}"${style} data-tip="${esc(v.tip)}">${inner}</a>` : `<span class="hm-cell2${v.empty ? " empty" : ""}"${style} data-tip="${esc(v.tip)}">${inner}</span>`}</td>`;
          })
          .join("")}</tr>`
    )
    .join("")}</tbody></table></div>`;
}

export interface BarItem {
  /** Escaped HTML label. */
  label: string;
  value: number;
  /** Text on the right, such as "12 · 40%". */
  display: string;
  color?: string;
  href?: string;
  tip?: string;
}

/** Horizontal bars behind labels, scaled to the largest value. */
export function barList(items: BarItem[], o: { max?: number } = {}): string {
  const max = o.max ?? Math.max(...items.map((i) => i.value), 1);
  return `<ul class="barlist">${items
    .map((i) => {
      const inner = `<span class="fill" style="width:${((i.value / max) * 100).toFixed(1)}%;--bl:${i.color ?? "var(--surface-3)"}"></span><span class="bl-label">${i.label}</span><span class="bl-val">${esc(i.display)}</span>`;
      return `<li${i.tip ? ` data-tip="${esc(i.tip)}"` : ""}>${i.href ? `<a href="${esc(i.href)}">${inner}</a>` : inner}</li>`;
    })
    .join("")}</ul>`;
}

/** Colors for agents and other series that carry no verdict meaning. */
export const SERIES_COLORS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)", "var(--c7)", "var(--c8)"];
