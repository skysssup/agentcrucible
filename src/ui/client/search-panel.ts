/**
 * Global search: one box over pages, actions, scenarios, agents, runs, reports, findings, and the
 * catalog, with scopes, recent searches, keyboard navigation, and a preview of the active result.
 */
import { VERDICT_SEVERITY, type Verdict } from "../../types.js";
import { adviceFor, agentRows, isUnexpected, observations, topRules } from "./lib/analytics.js";
import { absTime, clip, esc, firstSentence, href, plural, relTime } from "./lib/format.js";
import { highlight, rank, SCOPES, type Scope, type Searchable } from "./lib/search.js";
import { clearSearches, rememberSearch, store } from "./lib/state.js";
import { icon, type IconName } from "./icons.js";
import { ALL_NAV } from "./routes.js";
import { facts } from "./ui/layout.js";
import { worldChip } from "./ui/primitives.js";
import { badge, rateMeter, tally, verdictBar, verdictText, VERDICT_META, VERDICTS } from "./ui/verdicts.js";

export interface SearchAction {
  label: string;
  detail?: string;
  icon: IconName;
  keywords?: string;
  run: () => void;
}

interface Item extends Searchable {
  icon: IconName;
  href?: string;
  run?: () => void;
  verdict?: Verdict;
  preview?: () => string;
}

const GROUP_LABEL: Record<Exclude<Scope, "all">, string> = { pages: "Pages & actions", scenarios: "Scenarios", agents: "Agents", runs: "Runs", reports: "Reports", findings: "Findings", catalog: "Catalog" };
const ORDER: Array<Exclude<Scope, "all">> = ["pages", "scenarios", "agents", "runs", "reports", "findings", "catalog"];

let root: HTMLElement | undefined;

export function searchOpen(): boolean {
  return root !== undefined;
}

export function closeSearch(): void {
  root?.remove();
  root = undefined;
}

function buildIndex(actions: SearchAction[]): Item[] {
  const obs = observations(store.runs, store.saved);
  const items: Item[] = [];
  for (const n of ALL_NAV) items.push({ id: `page:${n.route}`, scope: "pages", label: n.label, detail: `Go to · G ${n.key.toUpperCase()}`, icon: n.icon, href: `#/${n.route}`, boost: 1 });
  for (const a of actions) items.push({ id: `action:${a.label}`, scope: "pages", label: a.label, detail: a.detail, keywords: a.keywords, icon: a.icon, run: a.run });
  for (const s of store.scenarios ?? []) {
    const mine = obs.filter((o) => o.scenarioId === s.id);
    const last = mine.reduce<(typeof mine)[number] | undefined>((a, b) => (!a || b.at > a.at ? b : a), undefined);
    items.push({
      id: `scenario:${s.id}`,
      scope: "scenarios",
      label: s.id,
      detail: firstSentence(s.description),
      keywords: `${s.task} ${s.tags.join(" ")} ${s.faults.join(" ")} ${s.worlds.join(" ")}`,
      icon: s.worlds.length > 1 ? "workflow" : "layers",
      href: href("scenario", s.id),
      verdict: last?.verdict,
      preview: () => `<span class="eyebrow">${icon("layers", 11)}Scenario${s.bundled ? " · bundled" : " · project"}</span><h3>${esc(s.id)}</h3><p>${esc(s.description)}</p><div class="chip-row" style="margin-bottom:12px">${s.worlds.map(worldChip).join("")}</div>${facts([
        ["Task", esc(clip(s.task, 160))],
        ["Faults", s.faults.length ? s.faults.map((f) => `<code>${esc(f)}</code>`).join("<br/>") : "none"],
        ["Expected", Object.entries(s.expectedVerdicts).map(([a, v]) => `<code>${esc(a)}</code> ${verdictText(v)}`).join("<br/>") || "none"],
        ["Results", mine.length ? `${verdictBar(tally(mine), { size: "sm" })}<span class="muted small">${plural(mine.length, "result")}, last ${esc(relTime(last?.at))}</span>` : "none yet"],
      ])}`,
    });
  }
  const rows = agentRows(obs);
  for (const a of store.meta.agents) {
    const row = rows.find((r) => r.agent === a.id);
    items.push({
      id: `agent:${a.id}`,
      scope: "agents",
      label: a.id,
      detail: a.description || a.source,
      icon: "bot",
      href: href("agent", a.id),
      preview: () => `<span class="eyebrow">${icon("bot", 11)}Agent · ${esc(a.source === "built-in" ? "built-in" : a.source)}</span><h3>${esc(a.id)}</h3><p>${esc(a.description || "No description.")}</p>${row ? facts([
        ["Safe share", rateMeter(row.summary.safeRate)],
        ["Results", `${row.summary.total.toLocaleString("en-US")} in ${plural(row.scenarios, "scenario")}`],
        ["Critical", String(row.summary.critical)],
        ["Most severe", verdictText(row.worst)],
        ["Mix", verdictBar(tally(obs.filter((o) => o.agentId === a.id)), { size: "sm" })],
      ]) : '<p class="muted">No results yet.</p>'}`,
    });
  }
  for (const r of store.runs.slice(0, 200)) {
    const off = r.results.filter(isUnexpected).length;
    items.push({
      id: `run:${r.runId}`,
      scope: "runs",
      label: `${r.runId}${r.label ? ` · ${r.label}` : ""}`,
      detail: `${plural(r.scenarios.length, "scenario")} · ${plural(r.results.length, "result")} · ${relTime(r.startedAt)}${off ? ` · ${off} unexpected` : ""}`,
      keywords: `${r.scenarios.join(" ")} ${(r.agents ?? []).join(" ")} ${r.version ?? ""}`,
      icon: "runs",
      href: href("run", r.runId),
      preview: () => `<span class="eyebrow">${icon("runs", 11)}Run · ${esc(absTime(r.startedAt))}</span><h3>${esc(r.label ?? r.runId)}</h3>${verdictBar(tally(r.results), { size: "lg" })}${facts([
        ["Run", `<code>${esc(r.runId)}</code>${r.version ? ` · v${esc(r.version)}` : ""}`],
        ["Scope", `${plural(r.scenarios.length, "scenario")} × ${r.agents ? plural(r.agents.length, "agent") : "expected agents"} × ${plural(r.trials, "trial")}`],
        ["Results", `${r.results.length} · ${off ? `<span class="bad-text">${off} unexpected</span>` : "as expected"}`],
        ["By", esc(r.actor ?? "")],
      ])}`,
    });
  }
  const results = [...store.saved.filter((r) => !r.error), ...obs.slice(-400).map((o) => ({ key: o.key, scenarioId: o.scenarioId, agentId: o.agentId, verdict: o.verdict, reason: o.reason, rule: o.rule, finishedAt: o.at, file: undefined as string | undefined, expected: o.expected }))];
  const seenReports = new Set<string>();
  for (const r of results.reverse()) {
    if (!r.scenarioId || !r.agentId || seenReports.has(`${r.scenarioId}|${r.agentId}|${r.file ? "f" : "h"}`)) continue;
    seenReports.add(`${r.scenarioId}|${r.agentId}|${r.file ? "f" : "h"}`);
    items.push({
      id: `report:${r.key}`,
      scope: "reports",
      label: `${r.scenarioId} · ${r.agentId}`,
      detail: `${r.verdict}${r.file ? " · saved" : ""} · ${relTime(r.finishedAt)}`,
      keywords: `${r.rule ?? ""} ${r.reason ?? ""}`,
      icon: "file",
      href: href("report", r.key),
      verdict: r.verdict,
      preview: () => `<span class="eyebrow">${icon("file", 11)}${r.file ? "Saved report" : "Result"} · ${esc(relTime(r.finishedAt))}</span><h3>${esc(r.scenarioId!)}</h3><div style="margin-bottom:10px">${badge(r.verdict)}</div><p>${esc(clip(r.reason ?? "", 260))}</p>${facts([["Agent", `<code>${esc(r.agentId!)}</code>`], ["Rule", `<code>${esc(r.rule ?? "")}</code>`], ["Expected", r.expected ? verdictText(r.expected) : "not listed"]])}`,
    });
  }
  for (const rule of topRules(obs)) {
    const advice = adviceFor(rule.rule);
    items.push({
      id: `finding:${rule.rule}`,
      scope: "findings",
      label: rule.rule,
      detail: `${plural(rule.count, "result")} · ${rule.agents.slice(0, 3).join(", ")}${rule.agents.length > 3 ? "…" : ""}`,
      keywords: `${advice?.topic ?? ""} ${advice?.advice ?? ""}`,
      icon: "flag",
      href: `#/reports?rule=${encodeURIComponent(rule.rule)}`,
      verdict: rule.verdict,
      preview: () => `<span class="eyebrow">${icon("flag", 11)}Finding rule</span><h3>${esc(rule.rule)}</h3><div style="margin-bottom:10px">${badge(rule.verdict)}</div>${advice ? `<p><b>${esc(advice.topic[0].toUpperCase() + advice.topic.slice(1))}.</b> ${esc(advice.advice)}</p>` : ""}${facts([["Decided", plural(rule.count, "result")], ["Agents", rule.agents.map((a) => `<code>${esc(a)}</code>`).join(", ")]])}`,
    });
  }
  for (const w of store.meta.worlds) {
    items.push({ id: `world:${w.name}`, scope: "catalog", label: w.name, detail: `World · ${w.tools.length} tools`, keywords: w.description, icon: "cube", href: `#/catalog/worlds?world=${encodeURIComponent(w.name)}` });
    for (const t of w.tools) items.push({ id: `tool:${w.name}/${t.name}`, scope: "catalog", label: t.name, detail: `${w.name} tool${t.mutating ? " · changes state" : ""}`, keywords: t.description, icon: "terminal", href: `#/catalog/worlds?world=${encodeURIComponent(w.name)}`, preview: () => `<span class="eyebrow">${icon("terminal", 11)}Tool · ${esc(w.name)}</span><h3>${esc(t.name)}</h3><p>${esc(t.description)}</p>${facts([["Changes state", t.mutating ? "yes" : "no"]])}` });
  }
  for (const f of store.meta.faults) items.push({ id: `fault:${f.kind}`, scope: "catalog", label: f.kind, detail: `Fault kind · ${f.stage}`, keywords: f.description, icon: "zap", href: `#/catalog/faults?kind=${encodeURIComponent(f.kind)}`, preview: () => `<span class="eyebrow">${icon("zap", 11)}Fault kind · ${esc(f.stage)}</span><h3>${esc(f.kind)}</h3><p>${esc(f.description[0].toUpperCase() + f.description.slice(1))}.</p>` });
  for (const v of VERDICTS) items.push({ id: `verdict:${v}`, scope: "catalog", label: v, detail: `Verdict · ${VERDICT_META[v].label}`, keywords: VERDICT_META[v].meaning, icon: VERDICT_META[v].icon, href: "#/catalog/verdicts", verdict: v, boost: VERDICT_SEVERITY[v] / 10, preview: () => `<span class="eyebrow">Verdict</span><h3>${esc(v)}</h3><div style="margin-bottom:10px">${badge(v)}</div><p>${esc(VERDICT_META[v].meaning)}</p>` });
  return items;
}

/** Opens the search over `actions` and the store's data. */
export function openSearch(actions: SearchAction[], query = "", initialScope: Scope = "all"): void {
  closeSearch();
  const returnFocus = document.activeElement as HTMLElement | null;
  const index = buildIndex(actions);
  let scope: Scope = initialScope;
  let shown: Item[] = [];
  let active = 0;
  root = document.createElement("div");
  root.className = "search-root";
  root.innerHTML = `<div class="search-scrim"></div><div class="search-panel" role="dialog" aria-modal="true" aria-label="Search">
  <div class="search-input">${icon("search", 18)}<input type="text" value="${esc(query)}" placeholder="Search scenarios, agents, runs, reports, findings… (type > for actions)" aria-label="Search" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="search-results"/><kbd>esc</kbd></div>
  <div class="search-scopes" role="tablist" aria-label="Scope"></div>
  <div class="search-main"><div class="search-results" id="search-results" role="listbox"></div><aside class="search-preview" aria-live="polite"></aside></div>
  <div class="search-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>tab</kbd> next scope</span><span><kbd>&gt;</kbd> actions</span><span class="spacer"></span><span id="search-count"></span></div>
</div>`;
  document.body.append(root);
  const input = root.querySelector("input")!;
  const list = root.querySelector<HTMLElement>(".search-results")!;
  const preview = root.querySelector<HTMLElement>(".search-preview")!;
  const scopesEl = root.querySelector<HTMLElement>(".search-scopes")!;

  const draw = () => {
    let q = input.value;
    let sc = scope;
    if (q.startsWith(">")) {
      q = q.slice(1);
      sc = "pages";
    }
    const matches = rank(index, q, "all");
    const counts = new Map<Scope, number>([["all", matches.length]]);
    for (const m of matches) counts.set(m.scope, (counts.get(m.scope) ?? 0) + 1);
    scopesEl.innerHTML = SCOPES.map((s) => `<button type="button" class="scope${s.id === sc ? " on" : ""}" data-scope="${s.id}" role="tab" aria-selected="${s.id === sc}">${esc(s.label)}${q.trim() ? `<b>${counts.get(s.id) ?? 0}</b>` : ""}</button>`).join("");
    const pool = sc === "all" ? matches : matches.filter((m) => m.scope === sc);
    if (!q.trim() && sc === "all") {
      const recents = store.recent.slice(0, 6).map((r) => index.find((i) => i.id === `${r.kind}:${r.id}`)).filter((x): x is Item => Boolean(x));
      const pages = index.filter((i) => i.scope === "pages").slice(0, 8);
      shown = [...recents, ...pages.filter((p) => !recents.includes(p))];
      let n = -1;
      list.innerHTML = `${store.searches.length ? `<div class="search-group">Recent searches<button type="button" class="btn-link" data-clear-searches style="float:right;font-size:11px;text-transform:none;letter-spacing:0">Clear</button></div><div class="search-recent">${store.searches.map((s) => `<button type="button" class="tag" data-recent-search="${esc(s)}">${icon("history", 12)}${esc(s)}</button>`).join("")}</div>` : ""}${recents.length ? `<div class="search-group">Recently viewed</div>${recents.map((i) => row(i, ++n, "")).join("")}` : ""}<div class="search-group">Jump to</div>${pages.filter((p) => !recents.includes(p)).map((i) => row(i, ++n, "")).join("")}`;
    } else {
      const perGroup = sc === "all" ? 6 : 60;
      shown = [];
      let html = "";
      for (const g of ORDER) {
        const inGroup = pool.filter((m) => m.scope === g);
        if (!inGroup.length) continue;
        const take = inGroup.slice(0, perGroup);
        html += `<div class="search-group">${esc(GROUP_LABEL[g])}<span>${inGroup.length}</span></div>${take.map((i) => row(i, shown.push(i) - 1, q)).join("")}`;
      }
      list.innerHTML = html || `<div class="search-empty">${icon("search", 18)}<p>Nothing matches “${esc(q)}”${sc !== "all" ? ` in ${esc(GROUP_LABEL[sc as Exclude<Scope, "all">])}` : ""}.</p><p class="small">Try fewer words, a scenario folder such as <code>payments</code>, or a rule such as <code>duplicate</code>.</p></div>`;
    }
    active = Math.min(active, Math.max(0, shown.length - 1));
    const countEl = root!.querySelector("#search-count");
    if (countEl) countEl.textContent = q.trim() ? `${pool.length} result${pool.length === 1 ? "" : "s"}` : "";
    mark();
  };
  const row = (i: Item, n: number, q: string) =>
    `<div class="search-item${n === active ? " active" : ""}" role="option" id="search-${n}" aria-selected="${n === active}" data-index="${n}"><span class="glyph">${icon(i.icon, 14)}</span><span class="si-text"><span class="si-label">${highlight(i.label, q)}</span>${i.detail ? `<span class="si-detail">${esc(i.detail)}</span>` : ""}</span>${i.verdict ? `<span class="vdot ${i.verdict}" title="${i.verdict}"></span>` : ""}<span class="si-go">${icon("arrowRight", 13)}</span></div>`;
  const mark = () => {
    for (const el of list.querySelectorAll<HTMLElement>(".search-item")) {
      const on = Number(el.dataset.index) === active;
      el.classList.toggle("active", on);
      el.setAttribute("aria-selected", String(on));
    }
    input.setAttribute("aria-activedescendant", shown.length ? `search-${active}` : "");
    list.querySelector(".search-item.active")?.scrollIntoView({ block: "nearest" });
    const item = shown[active];
    preview.innerHTML = item?.preview ? item.preview() : item ? `<span class="eyebrow">${icon(item.icon, 11)}${esc(GROUP_LABEL[item.scope])}</span><h3>${esc(item.label)}</h3><p>${esc(item.detail ?? "")}</p>` : `<p class="muted">Search everything in this workspace. Results update as you type.</p>`;
  };
  const pick = (i: number) => {
    const item = shown[i];
    if (!item) return;
    rememberSearch(input.value.replace(/^>/, ""));
    closeSearch();
    if (item.run) item.run();
    else if (item.href) location.hash = item.href;
  };
  input.addEventListener("input", () => {
    active = 0;
    draw();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % Math.max(1, shown.length);
      mark();
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(active);
    } else if (e.key === "Tab") {
      e.preventDefault();
      const i = SCOPES.findIndex((s) => s.id === scope);
      scope = SCOPES[(i + (e.shiftKey ? -1 : 1) + SCOPES.length) % SCOPES.length].id;
      active = 0;
      draw();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeSearch();
      returnFocus?.focus();
    }
  });
  list.addEventListener("mousemove", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>(".search-item");
    if (!el || Number(el.dataset.index) === active) return;
    active = Number(el.dataset.index);
    mark();
  });
  list.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const recent = t.closest<HTMLElement>("[data-recent-search]");
    if (recent) {
      input.value = recent.dataset.recentSearch ?? "";
      active = 0;
      draw();
      input.focus();
      return;
    }
    if (t.closest("[data-clear-searches]")) {
      clearSearches();
      draw();
      input.focus();
      return;
    }
    const el = t.closest<HTMLElement>(".search-item");
    if (el) pick(Number(el.dataset.index));
  });
  scopesEl.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-scope]");
    if (!b) return;
    scope = b.dataset.scope as Scope;
    if (input.value.startsWith(">") && scope !== "pages") input.value = input.value.slice(1);
    active = 0;
    draw();
    input.focus();
  });
  root.querySelector(".search-scrim")!.addEventListener("click", () => {
    closeSearch();
    returnFocus?.focus();
  });
  draw();
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}
