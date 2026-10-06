/**
 * The catalog: everything a scenario can name. Agents, worlds with their tools and arguments,
 * fault kinds with what each does to a call, the six verdicts, and the scenario policies.
 */
import type { Coverage } from "../../../coverage.js";
import { agentRows, faultImpact, isCritical, observations, type AgentRow, type KindImpact, type Observation } from "../lib/analytics.js";
import { esc, href, plural, pct, scenariosHref, withQuery } from "../lib/format.js";
import { patch } from "../lib/runtime.js";
import { load, store, type Meta } from "../lib/state.js";
import { icon, type IconName } from "../icons.js";
import type { Page } from "../routes.js";
import { codeView } from "../ui/code.js";
import { callout, emptyState, metaItem, pageHead, panel } from "../ui/layout.js";
import { button, codeChip, copyButton, faultTag, searchInput, segmented, tabs, tip, worldChip, worldIcon } from "../ui/primitives.js";
import { agentSees, POLICIES, stageDiagram, worldCommits } from "../ui/scenario-kit.js";
import { by, dataTable, registerTable, tableState } from "../ui/table.js";
import { stageLabel, tally, VERDICT_META, VERDICTS, verdictBar, verdictCode } from "../ui/verdicts.js";

export const SECTIONS = ["agents", "worlds", "faults", "verdicts", "policies"] as const;
export type Section = (typeof SECTIONS)[number];

type FaultInfo = Meta["faults"][number];
type ToolInfo = Meta["worlds"][number]["tools"][number];
type AgentInfo = Meta["agents"][number];

/** The arguments of an object schema as text: "order_id, amount_cents, idempotency_key?" marks the optional ones. */
export function argumentsLabel(schema: unknown): string {
  const s = schema as { properties?: Record<string, unknown>; required?: string[] } | null;
  return Object.keys(s?.properties ?? {})
    .map((name) => (s?.required?.includes(name) ? name : `${name}?`))
    .join(", ");
}

/** An object schema's arguments as chips: optional ones end in "?", and each carries its type and description in a tooltip. */
export function argumentChips(schema: unknown): string {
  const s = schema as { properties?: Record<string, { type?: string; description?: string }>; required?: string[] } | null;
  const names = Object.keys(s?.properties ?? {});
  if (!names.length) return '<span class="faint small">no arguments</span>';
  return `<span class="cat-args">${names
    .map((name) => {
      const optional = !s?.required?.includes(name);
      const p = s?.properties?.[name];
      return `<code class="cat-arg${optional ? " opt" : ""}"${tip([`${name}${optional ? " (optional)" : ""}`, p?.type, p?.description].filter(Boolean).join(" · "))}>${esc(name)}${optional ? "?" : ""}</code>`;
    })
    .join("")}</span>`;
}

const sourceTag = (source: string) => `<span class="src-tag"${tip(source === "built-in" ? "Ships with AgentCrucible" : `Registered by ${source}`)}>${esc(source)}</span>`;

interface CatalogData {
  meta: Meta;
  coverage?: Coverage;
  obs: Observation[];
}

const matches = (q: string, ...texts: Array<string | undefined>) => !q.trim() || texts.some((t) => (t ?? "").toLowerCase().includes(q.trim().toLowerCase()));

const AGENTS = "catalog-agents";

function agentsSection(d: CatalogData, q: string): string {
  const stats = new Map<string, AgentRow>(agentRows(d.obs).map((r) => [r.agent, r]));
  const held = new Map((d.coverage?.agents ?? []).map((a) => [a.id, a.scenarios]));
  const rows = d.meta.agents.filter((a) => matches(q, a.id, a.description, a.source));
  const state = tableState(AGENTS, { sort: "agent", dir: "asc", pageSize: store.prefs.pageSize });
  const render = () =>
    dataTable<AgentInfo>({
      id: AGENTS,
      rows,
      state,
      cards: true,
      flush: true,
      rowKey: (a) => a.id,
      rowHref: (a) => href("agent", a.id),
      caption: "Agents",
      empty: q ? emptyState({ icon: "search", title: "No agent matches", text: "Try another word, or clear the search.", compact: true }) : emptyState({ icon: "bot", title: "No agents registered", text: "Built-in agents ship with AgentCrucible; add your own in the config file.", compact: true }),
      columns: [
        { id: "agent", label: "Agent", sort: by.text((a) => a.id), render: (a) => `<a class="row-link mono" href="${esc(href("agent", a.id))}">${esc(a.id)}</a>` },
        { id: "description", label: "What it does", cls: "wrap", render: (a) => esc(a.description || "No description") },
        { id: "source", label: "Source", sort: by.text((a) => a.source), render: (a) => sourceTag(a.source) },
        { id: "held", label: "Held to verdicts in", title: "Scenarios whose expected_verdicts name the agent", num: true, sort: by.num((a) => held.get(a.id)?.length ?? 0), render: (a) => (held.get(a.id)?.length ? `<a class="link-mono" href="${esc(scenariosHref(held.get(a.id)!))}">${plural(held.get(a.id)!.length, "scenario")}</a>` : '<span class="faint">none</span>') },
        { id: "safe", label: "Safe share", title: "Share of the agent's results in the history that ended safe", sort: by.num((a) => stats.get(a.id)?.summary.safeRate), render: (a) => (stats.get(a.id) ? `<span${tip(`${plural(stats.get(a.id)!.summary.total, "result")} in the history`)}>${pct(stats.get(a.id)!.summary.safe, stats.get(a.id)!.summary.total)}</span>` : '<span class="faint">not run</span>') },
        { id: "run", label: "Actions", thCls: "sr-col", cls: "actions", render: (a) => button("Run", { href: withQuery("#/launch", { agents: a.id }), icon: "play", size: "sm", kind: "ghost", title: `Open the launcher with ${a.id} chosen` }) },
      ],
    });
  registerTable(AGENTS, render);
  return panel({ title: "Agents", icon: "bot", meta: `${plural(rows.length, "agent")}${q ? ` of ${d.meta.agents.length}` : ""}`, flush: true, actions: `<a class="link-quiet" href="#/agents">Agent profiles ${icon("arrowRight", 12)}</a>` }, render());
}

function toolRow(t: ToolInfo, d: CatalogData, world: string): string {
  const cov = d.coverage?.worlds.find((w) => w.name === world)?.tools.find((x) => x.name === t.name);
  return `<tr><td data-label="Tool"><code class="cat-tool">${esc(t.name)}</code>${t.mutating ? `<span class="cat-writes"${tip(`${t.name} changes state in ${world}`)}>writes</span>` : ""}</td><td data-label="Arguments">${argumentChips(t.inputSchema)}</td><td data-label="What it does" class="wrap">${esc(t.description)}</td><td data-label="Faulted by">${cov?.faultKinds.length ? `<span class="chip-row">${cov.faultKinds.map((k) => `<a href="${esc(withQuery("#/catalog/faults", { kind: k }))}">${faultTag(k)}</a>`).join("")}</span>` : '<span class="faint small">never faulted</span>'}</td></tr>`;
}

function worldsSection(d: CatalogData, q: string, selected: string): string {
  const worlds = d.meta.worlds.filter((w) => (!selected || w.name === selected) && (matches(q, w.name, w.description) || w.tools.some((t) => matches(q, t.name, t.description))));
  if (!worlds.length) return emptyState({ icon: "search", title: "No world or tool matches", text: "Try another word, or clear the search.", compact: true });
  return `<div class="stack">${worlds
    .map((w) => {
      const tools = w.tools.filter((t) => !q.trim() || matches(q, w.name, w.description) || matches(q, t.name, t.description));
      const covered = d.coverage?.worlds.find((x) => x.name === w.name);
      const records = Object.entries(w.records);
      return panel(
        {
          title: w.name,
          icon: "cube",
          id: `world-${w.name}`,
          cls: selected === w.name ? "cat-hl" : "",
          meta: `${plural(w.tools.length, "tool")}, ${plural(w.tools.filter((t) => t.mutating).length, "write")}`,
          actions: `${sourceTag(w.source)}${covered?.scenarios.length ? `<a class="link-quiet" href="${esc(scenariosHref(covered.scenarios))}">${plural(covered.scenarios.length, "scenario")} ${icon("arrowRight", 12)}</a>` : '<span class="faint small">no scenario</span>'}`,
          flush: true,
        },
        `<p class="cat-lead">${worldIcon(w.name, 14)}${esc(w.description)}</p>
        <div class="table-wrap flush"><table class="dt cards cat-tools"><thead><tr><th>Tool</th><th>Arguments</th><th>What it does</th><th>Faulted by</th></tr></thead><tbody>${tools.map((t) => toolRow(t, d, w.name)).join("")}</tbody></table></div>
        ${records.length ? `<div class="cat-records"><span class="eyebrow">Records the world holds</span>${records.map(([kind, fields]) => `<div class="cat-record"><code>${esc(kind)}</code>${Object.entries(fields).map(([f, type]) => `<span class="cat-field">${esc(f)}<em>${esc(type)}</em></span>`).join("")}</div>`).join("")}</div>` : ""}`
      );
    })
    .join("")}</div>`;
}

function faultCard(f: FaultInfo, d: CatalogData, impact: Map<string, KindImpact>, selected: string): string {
  const cov = d.coverage?.faultKinds.find((k) => k.kind === f.kind);
  const required = new Set(f.required ?? []);
  const seen = impact.get(f.kind);
  return `<article class="cat-fault${selected === f.kind ? " cat-hl" : ""}" id="fault-${esc(f.kind)}">
    <header><span class="cat-fault-name">${faultTag(f.kind, f.description)}</span><span class="cat-stage">${esc(stageLabel(f.stage))}</span><span class="grow"></span>${sourceTag(f.source)}</header>
    <p>${esc(f.description)}</p>
    ${stageDiagram(f.stage)}
    <dl class="cat-fault-facts">
      <div><dt>Agent sees</dt><dd>${esc(agentSees(f.kind, f.description))}</dd></div>
      <div><dt>The service keeps</dt><dd>${esc(worldCommits(f.stage))}</dd></div>
      <div><dt>Parameters</dt><dd>${f.params?.length ? `<span class="chip-row">${f.params.map((p) => `${codeChip(p)}${required.has(p) ? "" : '<span class="cat-opt">optional</span>'}`).join("")}</span>` : '<span class="faint">none</span>'}</dd></div>
    </dl>
    <footer>${cov?.scenarios.length ? `<a class="link-mono" href="${esc(scenariosHref(cov.scenarios))}">${plural(cov.scenarios.length, "scenario")} inject it</a>` : `<span class="warn-text">No scenario injects it</span> <a class="link-quiet" href="${esc(withQuery("#/editor", { new: 1, kind: f.kind }))}">Write one ${icon("arrowRight", 12)}</a>`}${seen ? `<span class="faint">·</span><span${tip(`${plural(seen.total, "result")} in the history had this kind in the schedule`)}>${pct(seen.safe, seen.total)} of ${plural(seen.total, "result")} ended safe</span>` : ""}</footer>
  </article>`;
}

const STAGE_SHORT: Record<string, string> = { before: "Before the call", after: "After the call", twice: "Runs twice" };

function faultsSection(d: CatalogData, q: string, stage: string, selected: string): string {
  const impact = new Map(faultImpact(d.obs).map((k) => [k.kind, k]));
  const pool = d.meta.faults.filter((f) => matches(q, f.kind, f.description, ...(f.params ?? [])));
  const rows = pool.filter((f) => !stage || f.stage === stage);
  const stages = ["before", "after", "twice"].filter((s) => d.meta.faults.some((f) => f.stage === s));
  const filter = segmented("fault-stage", stage, [{ value: "", label: "All", count: pool.length }, ...stages.map((s) => ({ value: s, label: STAGE_SHORT[s] ?? s, count: pool.filter((f) => f.stage === s).length, title: stageLabel(s) }))], { label: "When the fault strikes", wrap: true });
  return `<div class="cat-toolbar">${filter}</div>${rows.length ? `<div class="cat-faults">${rows.map((f) => faultCard(f, d, impact, selected)).join("")}</div>` : emptyState({ icon: "search", title: "No fault kind matches", text: "Try another word, or show every stage.", compact: true })}`;
}

function verdictsSection(d: CatalogData): string {
  const counts = tally(d.obs);
  const total = d.obs.length;
  const failIndex = VERDICTS.indexOf(d.meta.failOn);
  return `<div class="cat-verdicts">${VERDICTS.map((v, i) => {
    const n = counts.find(([x]) => x === v)?.[1] ?? 0;
    return `<article class="cat-verdict ${v}"><div class="cat-verdict-head"><span class="cat-verdict-icon">${icon(VERDICT_META[v].icon, 16)}</span><div><b>${esc(VERDICT_META[v].label)}</b>${verdictCode(v)}</div><span class="grow"></span>${i <= failIndex ? `<span class="pill bad"${tip(`agentcrucible check fails on ${d.meta.failOn} and anything more severe`)}>fails the check</span>` : ""}${isCritical(v) ? '<span class="pill outline" title="Counted as a critical result">critical</span>' : ""}</div><p>${esc(VERDICT_META[v].meaning)}</p><div class="cat-verdict-foot"><span class="muted small">${i === 0 ? "Most severe" : i === VERDICTS.length - 1 ? "Least severe" : `Severity ${i + 1} of ${VERDICTS.length}`}</span><span class="grow"></span><span class="small"${tip(`${n} of ${total} results in the history`)}>${total ? `<b class="fg">${n}</b> of ${plural(total, "result")} in the history` : "no results yet"}</span></div></article>`;
  }).join("")}</div>${total ? `<div class="cat-verdict-all">${verdictBar(counts, { size: "lg" })}</div>` : ""}`;
}

function policiesSection(q: string): string {
  const rows = POLICIES.filter((p) => matches(q, p.key, p.checks, p.fires, p.verdict));
  if (!rows.length) return emptyState({ icon: "search", title: "No policy matches", text: "Try another word, or clear the search.", compact: true });
  return `<div class="cat-policies">${rows
    .map(
      (p) => `<article class="cat-policy"><header><code class="cat-policy-key">${esc(p.key)}</code>${verdictCode(p.verdict, `A violation is graded ${p.verdict}`)}<span class="grow"></span><span class="muted small">When a scenario leaves it out: <b class="fg">${esc(p.fallback)}</b></span></header>
      <dl class="cat-fault-facts"><div><dt>Checks</dt><dd>${esc(p.checks)}</dd></div><div><dt>Fires when</dt><dd>${esc(p.fires)}</dd></div></dl>
      <div class="cat-example"><div class="cat-example-bar"><span class="eyebrow">In a scenario file</span>${copyButton(`policies:\n  ${p.example}`, "Copy", { size: "sm" })}</div>${codeView(`policies:\n  ${p.example}`, "yaml")}</div></article>`
    )
    .join("")}</div>`;
}

const LABELS: Record<Section, { label: string; icon: IconName; desc: string }> = {
  agents: { label: "Agents", icon: "bot", desc: "The programs the scenarios run against: built-in examples and the agents from your config file." },
  worlds: { label: "Worlds", icon: "cube", desc: "The offline mock services an agent calls: their tools, arguments, and the records they hold." },
  faults: { label: "Fault kinds", icon: "zap", desc: "The ways a tool call can fail, and what each one does to the call, the agent, and the service." },
  verdicts: { label: "Verdicts", icon: "shieldCheck", desc: "The six grades a result can get, from most to least severe." },
  policies: { label: "Policies", icon: "lock", desc: "Rules a scenario can add on top of its expectations." },
};

let data: CatalogData | undefined;
let section: Section = "agents";
let selected: { world: string; kind: string } = { world: "", kind: "" };
const search: Record<Section, string> = { agents: "", worlds: "", faults: "", verdicts: "", policies: "" };
let faultStage = "";

export function sectionBody(d: CatalogData, s: Section, sel = selected): string {
  if (s === "agents") return agentsSection(d, search.agents);
  if (s === "worlds") return worldsSection(d, search.worlds, sel.world);
  if (s === "faults") return faultsSection(d, search.faults, faultStage, sel.kind);
  if (s === "verdicts") return verdictsSection(d);
  return policiesSection(search.policies);
}

const counts = (m: Meta): Record<Section, number> => ({ agents: m.agents.length, worlds: m.worlds.length, faults: m.faults.length, verdicts: VERDICTS.length, policies: POLICIES.length });

const page: Page = {
  nav: "catalog",
  title: (ctx) => LABELS[(SECTIONS.find((s) => s === ctx.arg) ?? "agents") as Section].label,
  skeleton: "table",
  watches: ["runs", "scenarios"],
  async render(ctx) {
    await Promise.all([load.runs(), load.coverage()]);
    const meta = store.meta;
    section = SECTIONS.find((s) => s === ctx.arg) ?? "agents";
    selected = { world: ctx.query.get("world") ?? "", kind: ctx.query.get("kind") ?? "" };
    data = { meta, coverage: store.coverage, obs: observations(store.runs, store.saved) };
    const n = counts(meta);
    const head = pageHead({
      title: "Catalog",
      desc: `${LABELS[section].desc} Everything a scenario can name: the built-ins and the extensions in your config file.`,
      meta: [metaItem("bot", `<b class="fg">${plural(n.agents, "agent")}</b>`), metaItem("cube", `<b class="fg">${plural(n.worlds, "world")}</b>, ${plural(meta.worlds.reduce((k, w) => k + w.tools.length, 0), "tool")}`), metaItem("zap", `<b class="fg">${plural(n.faults, "fault kind")}</b>`)],
      actions: `${button("Coverage", { href: "#/coverage", icon: "shieldCheck" })}${button("New scenario", { href: "#/editor", kind: "primary", icon: "plus" })}`,
    });
    const nav = tabs(
      SECTIONS.map((s) => ({ id: s, label: LABELS[s].label, count: n[s], href: `#/catalog/${s}`, icon: LABELS[s].icon })),
      section,
      { label: "Catalog sections" }
    );
    const searchable = section !== "verdicts";
    const worldPick = section === "worlds" && meta.worlds.length > 1 ? `<span class="cat-pick">${[{ name: "", label: "All worlds" }, ...meta.worlds.map((w) => ({ name: w.name, label: w.name }))].map((w) => `<a class="tag${w.name === selected.world ? " on" : ""}" href="${esc(withQuery("#/catalog/worlds", { world: w.name }))}" aria-pressed="${w.name === selected.world}">${esc(w.label)}</a>`).join("")}</span>` : "";
    const empty = meta.worlds.length === 0 && meta.agents.length === 0 ? callout("warn", "The server reported no agents or worlds.", { title: "The registry is empty" }) : "";
    return `<div class="page cat-page">${head}<div class="page-tabs">${nav}</div>${empty}${searchable ? `<div class="cat-bar">${searchInput({ id: "cat-q", value: search[section], placeholder: `Search ${LABELS[section].label.toLowerCase()}`, label: `Search ${LABELS[section].label.toLowerCase()}`, kbd: "/" })}${worldPick}</div>` : ""}<div id="cat-body">${sectionBody(data, section)}</div></div>`;
  },
  mount() {
    const target = selected.world ? `world-${selected.world}` : selected.kind ? `fault-${selected.kind}` : "";
    if (target) document.getElementById(target)?.scrollIntoView({ block: "center" });
  },
  actions: {
    "fault-stage": (el) => {
      faultStage = el.dataset.value ?? "";
      if (data) patch("cat-body", sectionBody(data, "faults"));
    },
  },
  inputs: {
    "cat-q": (el) => {
      search[section] = el.value;
      if (data) patch("cat-body", sectionBody(data, section));
    },
  },
};

export default page;
