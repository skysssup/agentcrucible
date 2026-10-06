/**
 * Coverage: what the scenario set exercises. Which tools each fault kind hits, which worlds and
 * agents the scenarios reach, and what nothing covers yet, with a link that starts the scenario
 * that closes each gap.
 */
import type { Coverage } from "../../../coverage.js";
import { plural, esc, href, scenariosHref, withQuery } from "../lib/format.js";
import { runtime } from "../lib/runtime.js";
import { load, store } from "../lib/state.js";
import { icon } from "../icons.js";
import type { Page } from "../routes.js";
import { callout, emptyState, kpi, kpis, metaItem, pageHead, panel } from "../ui/layout.js";
import { button, segmented, tip, toggle, worldChip, worldIcon } from "../ui/primitives.js";
import { fixHref, suggestKind } from "../ui/scenario-kit.js";
import { by, dataTable, registerTable, tableState } from "../ui/table.js";
import { stageLabel, tallyOf, verdictBar } from "../ui/verdicts.js";

export interface CoverageView {
  /** Show only this world's tools in the matrix. */
  world: string;
  /** Keep the fault kinds no scenario injects as rows. */
  unused: boolean;
}

export interface GapGroup {
  id: string;
  title: string;
  /** What the gap means for the tests, in a sentence. */
  note: string;
  items: string[];
  /** Where an item leads: the page that fixes it. */
  link: (item: string) => string;
  /** The label of the link that fixes an item. */
  fix: string;
}

/** The gap groups with items; a coverage with none is fully covered. */
export function gapGroups(c: Coverage): GapGroup[] {
  const mutating = (pair: string) => c.worlds.find((w) => w.name === pair.split("/")[0])?.tools.find((t) => t.name === pair.split("/")[1])?.mutating ?? false;
  const toolLink = (pair: string, kind?: string) => fixHref(pair.split("/")[0], pair.split("/")[1], kind ?? suggestKind(kindsOf(c), mutating(pair)));
  const firstTool = c.gaps.tools[0] ?? (c.worlds[0]?.tools[0] ? `${c.worlds[0].name}/${c.worlds[0].tools[0].name}` : "");
  const groups: GapGroup[] = [
    { id: "worlds", title: "Worlds without a scenario", note: "No scenario runs in these services, so no agent is tested against them.", items: c.gaps.worlds, link: (w) => withQuery("#/editor", { new: 1, world: w }), fix: "Write a scenario" },
    { id: "tools", title: "Tools no scenario faults", note: "The agent is never tested against these calls failing.", items: c.gaps.tools, link: (pair) => toolLink(pair), fix: "Fault this tool" },
    { id: "kinds", title: "Fault kinds no scenario injects", note: "These ways of failing are never tried.", items: c.gaps.faultKinds, link: (kind) => (firstTool ? fixHref(firstTool.split("/")[0], firstTool.split("/")[1], kind) : withQuery("#/editor", { new: 1, kind })), fix: "Inject it" },
    { id: "agents", title: "Agents no scenario holds to a verdict", note: "agentcrucible check cannot fail them, so a regression goes unnoticed.", items: c.gaps.agents, link: (id) => href("agent", id), fix: "Open the agent" },
    { id: "expect", title: "Scenarios without expect", note: "The grader cannot check completion, so no run can end SAFE_SUCCESS.", items: c.gaps.withoutExpect, link: (id) => href("editor", id), fix: "Add expect" },
    { id: "verdicts", title: "Scenarios without expected_verdicts", note: "agentcrucible check skips them.", items: c.gaps.withoutExpectedVerdicts, link: (id) => href("editor", id), fix: "Add verdicts" },
    { id: "faults", title: "Scenarios without faults", note: "Every tool works as it should, so they test the task, not recovery.", items: c.gaps.withoutFaults, link: (id) => href("editor", id), fix: "Add a fault" },
    { id: "tags", title: "Scenarios without tags", note: "Tags are how the scenario list filters.", items: c.gaps.withoutTags, link: (id) => href("editor", id), fix: "Add tags" },
  ];
  return groups.filter((g) => g.items.length);
}

const SCENARIO_GAPS = new Set(["expect", "verdicts", "faults", "tags"]);

const kindsOf = (c: Coverage) => c.faultKinds.map((k) => k.kind);

function toolCount(c: Coverage): { tools: number; faulted: number } {
  const tools = c.worlds.reduce((n, w) => n + w.tools.length, 0);
  return { tools, faulted: c.worlds.reduce((n, w) => n + w.tools.filter((t) => t.faultKinds.length).length, 0) };
}

export function coverageKpis(c: Coverage, groups: GapGroup[]): string {
  const { tools, faulted } = toolCount(c);
  const items = groups.reduce((n, g) => n + g.items.length, 0);
  return kpis(
    [
      kpi({ label: "Scenarios", value: c.scenarios.length, sub: "loaded", href: "#/scenarios", icon: "layers" }),
      kpi({ label: "Worlds covered", value: `${c.worlds.length - c.gaps.worlds.length}/${c.worlds.length}`, sub: c.gaps.worlds.length ? `${c.gaps.worlds.join(", ")} not run` : "every world has a scenario", icon: "cube" }),
      kpi({ label: "Tools faulted", value: `${faulted}/${tools}`, sub: `${tools - faulted} never faulted`, icon: "zap" }),
      kpi({ label: "Fault kinds used", value: `${c.faultKinds.length - c.gaps.faultKinds.length}/${c.faultKinds.length}`, sub: c.gaps.faultKinds.length ? `${c.gaps.faultKinds.length} unused` : "every kind is injected", icon: "crosshair" }),
      kpi({ label: "Agents held", value: `${c.agents.length - c.gaps.agents.length}/${c.agents.length}`, sub: "named in expected_verdicts", icon: "bot" }),
      kpi({ label: "Gaps", value: groups.length, sub: groups.length ? `${plural(items, "item")} in ${plural(groups.length, "group")}` : "none", tone: groups.length ? "warn" : "ok", icon: "alert" }),
    ],
    "Coverage"
  );
}

/** The fault-kind-by-tool matrix: a cell counts the scenarios that inject the kind into the tool and links to them. */
export function coverageMatrix(c: Coverage, v: CoverageView): string {
  const worlds = c.worlds.filter((w) => !v.world || w.name === v.world);
  const kinds = c.faultKinds.filter((k) => v.unused || k.scenarios.length);
  if (!kinds.length) return emptyState({ icon: "zap", title: "No fault kind is injected yet", text: "Every row hides while no scenario injects a fault. Show the unused kinds, or write a scenario.", compact: true });
  const cellAt = (kind: string, world: string, tool: string) => c.matrix.find((m) => m.kind === kind && m.world === world && m.tool === tool);
  const max = Math.max(1, ...c.matrix.map((m) => m.scenarios.length));
  const tools = worlds.flatMap((w) => w.tools.map((t) => ({ world: w.name, ...t })));
  const head = `<tr><th class="cov-kind" rowspan="2" scope="col">Fault kind</th>${worlds.map((w) => `<th class="cov-world" colspan="${w.tools.length}" scope="colgroup"><a href="${esc(withQuery("#/catalog/worlds", { world: w.name }))}"${tip(w.description)}>${worldIcon(w.name, 12)}${esc(w.name)}</a></th>`).join("")}<th class="cov-total" rowspan="2" scope="col"${tip("Scenarios that inject the kind anywhere")}>Total</th></tr>
    <tr>${tools.map((t) => `<th class="cov-tool${t.faultKinds.length ? "" : " none"}" scope="col"${tip(`${t.world}/${t.name}${t.mutating ? ", changes state" : ""}${t.faultKinds.length ? "" : ", never faulted"}`)}><span>${esc(t.name)}${t.mutating ? '<i aria-hidden="true">●</i>' : ""}</span></th>`).join("")}</tr>`;
  const rows = kinds
    .map((k) => {
      const cells = tools
        .map((t) => {
          const cell = cellAt(k.kind, t.world, t.name);
          if (!cell) return `<td class="cov-c"><a class="cov-add" href="${esc(fixHref(t.world, t.name, k.kind))}" tabindex="-1" aria-label="Write a scenario that injects ${esc(k.kind)} into ${esc(t.world)}/${esc(t.name)}"${tip(`No scenario injects ${k.kind} into ${t.world}/${t.name}. Write one.`)}>${icon("plus", 10)}</a></td>`;
          const n = cell.scenarios.length;
          return `<td class="cov-c"><a class="cov-n" href="${esc(scenariosHref(cell.scenarios))}" style="--a:${18 + Math.round((n / max) * 62)}%"${tip(`${k.kind} in ${t.world}/${t.name}: ${plural(n, "scenario")}\n${cell.scenarios.join("\n")}`)}>${n}</a></td>`;
        })
        .join("");
      return `<tr${k.scenarios.length ? "" : ' class="unused"'}><th scope="row" class="cov-kind"><a href="${esc(withQuery("#/catalog/faults", { kind: k.kind }))}"><code>${esc(k.kind)}</code></a><small>${esc(stageLabel(k.stage))}${k.scenarios.length ? "" : " · unused"}</small></th>${cells}<td class="cov-total">${k.scenarios.length ? `<a href="${esc(scenariosHref(k.scenarios))}">${k.scenarios.length}</a>` : '<span class="faint">0</span>'}</td></tr>`;
    })
    .join("");
  const foot = `<tr class="cov-foot"><th scope="row" class="cov-kind">Scenarios per tool</th>${tools.map((t) => `<td class="cov-c">${t.scenarios.length ? `<a href="${esc(scenariosHref(t.scenarios))}"${tip(`${plural(t.scenarios.length, "scenario")} fault ${t.world}/${t.name}`)}>${t.scenarios.length}</a>` : '<span class="faint">0</span>'}</td>`).join("")}<td></td></tr>`;
  return `<div class="cov-wrap"><table class="cov"><caption class="sr-only">Scenarios per fault kind and tool</caption><thead>${head}</thead><tbody>${rows}${foot}</tbody></table></div>`;
}

function gapsPanel(groups: GapGroup[]): string {
  const body = groups.length
    ? `<div class="gaps">${groups
        .map(
          (g) => `<div class="gap"><h3>${esc(g.title)}<span class="gap-n">${g.items.length}</span></h3><p>${esc(g.note)}</p><ul class="chip-row">${g.items
            .map((item) =>
              SCENARIO_GAPS.has(g.id)
                ? `<li class="gap-item"><a class="gap-link" href="${esc(href("scenario", item))}">${esc(item)}</a><a class="gap-fix" href="${esc(g.link(item))}"${tip(`${g.fix}: ${item}`)} aria-label="${esc(`${g.fix}: ${item}`)}">${icon("edit", 11)}</a></li>`
                : `<li class="gap-item"><a class="gap-link" href="${esc(g.link(item))}"${tip(`${g.fix}: ${item}`)}>${esc(item)}${icon("plus", 11)}</a></li>`
            )
            .join("")}</ul></div>`
        )
        .join("")}</div>`
    : callout("ok", "Every world, tool, fault kind, and agent is covered, and every scenario has expectations, expected verdicts, faults, and tags.", { title: "No gaps" });
  return panel({ title: "Gaps", icon: "alert", meta: groups.length ? plural(groups.length, "group") : "", flush: !groups.length }, body);
}

function worldsPanel(c: Coverage): string {
  return panel(
    { title: "Worlds", icon: "cube", meta: "tools faulted per service", actions: `<a class="link-quiet" href="#/catalog/worlds">Catalog ${icon("arrowRight", 12)}</a>` },
    `<ul class="cov-worlds">${c.worlds
      .map((w) => {
        const faulted = w.tools.filter((t) => t.faultKinds.length);
        const missing = w.tools.filter((t) => !t.faultKinds.length);
        return `<li><div class="cov-world-head">${worldChip(w.name)}<span class="grow"></span>${w.scenarios.length ? `<a class="link-mono" href="${esc(scenariosHref(w.scenarios))}">${plural(w.scenarios.length, "scenario")}</a>` : '<span class="bad-text small">no scenario</span>'}</div>
        <div class="cov-bar" role="img" aria-label="${faulted.length} of ${w.tools.length} tools faulted">${w.tools.map((t) => `<i class="${t.faultKinds.length ? "on" : ""}"${tip(`${t.name}: ${t.faultKinds.length ? t.faultKinds.join(", ") : "never faulted"}`)}></i>`).join("")}</div>
        <p class="cov-world-note"><b>${faulted.length}/${w.tools.length}</b> tools faulted${missing.length ? ` · never: ${missing.map((t) => `<a href="${esc(fixHref(w.name, t.name, suggestKind(kindsOf(c), t.mutating)))}"${tip(`Write a scenario that faults ${t.name}`)}>${esc(t.name)}</a>`).join(", ")}` : ""}</p></li>`;
      })
      .join("")}</ul>`
  );
}

const AGENTS = "coverage-agents";

function agentsPanel(c: Coverage): string {
  const state = tableState(AGENTS, { sort: "scenarios", dir: "desc", pageSize: 25 });
  const rows = c.agents;
  registerTable(AGENTS, () => agentsTable(rows));
  return panel({ title: "Agents held to expected verdicts", icon: "bot", meta: `${c.agents.length - c.gaps.agents.length} of ${c.agents.length} agents`, flush: true, actions: `<a class="link-quiet" href="#/agents">Agents ${icon("arrowRight", 12)}</a>` }, agentsTable(rows, state));
}

function agentsTable(rows: Coverage["agents"], state = tableState(AGENTS)): string {
  return dataTable({
    id: AGENTS,
    rows,
    state,
    plain: true,
    flush: true,
    cards: true,
    rowKey: (a) => a.id,
    rowCls: (a) => (a.scenarios.length ? "" : "row-muted"),
    caption: "Agents and the verdicts scenarios expect of them",
    empty: emptyState({ icon: "bot", title: "No agents registered", compact: true }),
    columns: [
      { id: "agent", label: "Agent", sort: by.text((a) => a.id), render: (a) => `<a class="row-link mono" href="${esc(href("agent", a.id))}">${esc(a.id)}</a>` },
      { id: "scenarios", label: "Scenarios", num: true, sort: by.num((a) => a.scenarios.length), render: (a) => (a.scenarios.length ? `<a class="link-mono" href="${esc(scenariosHref(a.scenarios))}">${a.scenarios.length}</a>` : '<span class="faint">0</span>') },
      { id: "expected", label: "Expected verdicts", render: (a) => (a.scenarios.length ? verdictBar(tallyOf(a.expected), { size: "sm" }) : '<span class="warn-text small">not held to any verdict</span>') },
    ],
  });
}

/** The whole page for a coverage. */
export function coverageBody(c: Coverage, v: CoverageView, notice = ""): string {
  const groups = gapGroups(c);
  const { tools, faulted } = toolCount(c);
  const first = groups.find((g) => g.id === "tools" || g.id === "worlds" || g.id === "kinds");
  const head = pageHead({
    title: "Coverage",
    desc: "What the scenario set exercises: which tools each fault kind hits, which agents are held to a verdict, and what nothing covers yet.",
    meta: [metaItem("layers", `<b class="fg">${plural(c.scenarios.length, "scenario")}</b>`), metaItem("zap", `<b class="fg">${faulted}</b> of ${plural(tools, "tool")} faulted`), metaItem("alert", groups.length ? `<b class="fg">${plural(groups.length, "gap group")}</b>` : "No gaps")],
    actions: `${button("Scenarios", { href: "#/scenarios", icon: "layers" })}${button(first ? "Close the first gap" : "New scenario", { href: first ? first.link(first.items[0]) : "#/editor?new=1", kind: "primary", icon: "plus", title: first ? `${first.fix}: ${first.items[0]}` : "" })}`,
  });
  if (!c.scenarios.length) {
    return `<div class="page">${head}${emptyState({ icon: "shieldCheck", title: "Nothing to cover yet", text: "Coverage compares the scenarios with the worlds, tools, fault kinds, and agents that exist. Write the first scenario to start.", actions: button("New scenario", { href: "#/editor", kind: "primary", icon: "plus", size: "sm" }) })}</div>`;
  }
  const worldFilter = segmented("cov-world", v.world, [{ value: "", label: "All worlds" }, ...c.worlds.map((w) => ({ value: w.name, label: w.name}))], { label: "World", wrap: true });
  const unused = c.faultKinds.length - c.faultKinds.filter((k) => k.scenarios.length).length;
  return `<div class="page cov-page">
  ${head}
  ${notice}
  ${coverageKpis(c, groups)}
  ${panel(
    {
      title: "Fault kind by tool",
      icon: "grid",
      meta: "scenarios that inject the kind into the tool; a cell lists them, a plus starts one",
      actions: `${worldFilter}${unused ? `<span class="cov-toggle">${toggle({ checked: v.unused, label: `Unused kinds (${unused})`, attrs: 'data-input="cov-unused"' })}</span>` : ""}`,
      flush: true,
      foot: `<span class="cov-legend"><i class="cov-sw n"></i>scenarios injecting it</span><span class="cov-legend"><i class="cov-sw add"></i>no scenario yet</span><span class="cov-legend"><b>●</b>tool changes state</span>`,
    },
    coverageMatrix(c, v)
  )}
  <div class="grid g-7-5 mt-16">${gapsPanel(groups)}<div class="stack">${worldsPanel(c)}</div></div>
  <div class="mt-16">${agentsPanel(c)}</div>
</div>`;
}

const view: CoverageView = { world: "", unused: true };

const page: Page = {
  nav: "coverage",
  title: () => "Coverage",
  skeleton: "dashboard",
  watches: ["scenarios"],
  async render() {
    await load.scenarios();
    const c = await load.coverage();
    if (!c) return `<div class="page">${pageHead({ title: "Coverage", desc: "What the scenario set exercises." })}${callout("bad", "The server did not return coverage. Reload the page; if it persists, run agentcrucible coverage in a terminal.", { title: "Coverage is not available" })}</div>`;
    return coverageBody(c, view, store.scenarioError ? callout("warn", esc(store.scenarioError), { title: "A scenario file does not load, so it is missing from this count" }) : "");
  },
  actions: {
    "cov-world": (el) => {
      view.world = el.dataset.value ?? "";
      return runtime.rerender();
    },
  },
  inputs: {
    "cov-unused": (el) => {
      view.unused = el.checked;
      return runtime.rerender();
    },
  },
};

export default page;
