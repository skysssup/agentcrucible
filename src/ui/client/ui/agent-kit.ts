/** Marks the agent pages share: where an agent comes from, its version, a trail of recent verdicts, and A/B rate bars. */
import type { Verdict } from "../../../types.js";
import { esc } from "../lib/format.js";
import { icon } from "../icons.js";
import { tip } from "./primitives.js";
import { VERDICT_VAR } from "./verdicts.js";

/** Where an agent comes from, as a dashed chip with an explanation in its tooltip. */
export function sourceChip(source: string): string {
  if (source === "built-in") return `<span class="src-tag"${tip("Ships with AgentCrucible as a reference strategy")}>${icon("cube", 11)}<span class="clip">built-in</span></span>`;
  if (!source) return `<span class="src-tag"${tip("Not registered in this session: its results come from the workspace history, and it cannot run until it is registered again")}>${icon("archive", 11)}<span class="clip">history only</span></span>`;
  const path = /[\\/]|\.[cm]?[jt]s$/.test(source);
  return `<span class="src-tag"${tip(path ? `Loaded from ${source}` : `Registered by the ${source}`)}>${icon(path ? "file" : source === "demo workspace" ? "spark" : "plug", 11)}<span class="clip">${esc(source)}</span></span>`;
}

/** The version an agent's newest runs carry, as a small ink chip. */
export function versionTag(version: string | undefined, title = "The version its newest run was started with"): string {
  return version ? `<span class="ver-tag"${tip(title)}>v${esc(version)}</span>` : "";
}

/** The newest verdicts as a strip of colored ticks, oldest first. */
export function verdictTrail(verdicts: Verdict[]): string {
  if (!verdicts.length) return "";
  return `<span class="vtrail" role="img" aria-label="${esc(`Latest ${verdicts.length} verdicts, oldest first: ${verdicts.join(", ")}`)}"${tip(`Latest ${verdicts.length === 1 ? "verdict" : `${verdicts.length} verdicts`}, oldest first`)}>${verdicts.map((v) => `<i style="--v:${VERDICT_VAR[v]}"></i>`).join("")}</span>`;
}

/** The color of a safe share, as the rate meters draw it: green from 80%, amber from 50%, red below. */
export function rateColor(rate: number): string {
  return rate >= 0.8 ? "var(--ssucc)" : rate >= 0.5 ? "var(--degr)" : "var(--harm)";
}

/** A safe share as a thin full-width meter. */
export function shareMeter(rate: number | null, label = "safe share"): string {
  const width = rate === null ? 0 : Math.round(rate * 100);
  return `<span class="share-meter" role="meter" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${width}"><i style="width:${width}%${rate === null ? "" : `;--rate-c:${rateColor(rate)}`}"></i></span>`;
}

/** A tint of a verdict's color for bar fills. */
export function verdictTint(v: Verdict, strength = 24): string {
  return `color-mix(in srgb, ${VERDICT_VAR[v]} ${strength}%, var(--surface))`;
}

/** The letter that marks agent A or B in a comparison. */
export function sideMark(side: "a" | "b"): string {
  return `<span class="side-mark ${side}" aria-hidden="true">${side.toUpperCase()}</span>`;
}

/** Two safe shares as paired bars, A over B, each with its percentage. */
export function pairBars(a: number | null, b: number | null, o: { titleA?: string; titleB?: string } = {}): string {
  const bar = (side: "a" | "b", rate: number | null, title = "") => `<span class="pair-row"${title ? tip(title) : ""}><span class="pair-bar ${side}"><i style="width:${rate === null ? 0 : Math.round(rate * 100)}%"></i></span><b>${rate === null ? "—" : `${Math.round(rate * 100)}%`}</b></span>`;
  return `<span class="pair">${bar("a", a, o.titleA)}${bar("b", b, o.titleB)}</span>`;
}
