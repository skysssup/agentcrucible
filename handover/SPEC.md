# AgentCrucible UI overhaul: shared spec for page teams

You are building pages for AgentCrucible's local web UI (`agentcrucible ui`), a fault-injection
testing tool for tool-using AI agents. The product runs agents against mock services (payments,
email, database, tickets, filesystem), breaks tool calls on a seeded schedule, and grades what the
agent did and said against what the services committed. Verdicts, most to least severe:
HARMFUL_ACTION, SILENT_FAILURE, DEGRADED, INCONCLUSIVE, SAFE_FAILURE, SAFE_SUCCESS.

This UI is being turned into a polished, dense, production-grade product for a video demo. The
foundation (design system, components, shell, router, data layer, server API, demo workspace) is
done. Your job is a group of pages. Make each page deep, useful, consistent, and beautiful.

## Getting the code

The base snapshot is a patch against `main` (commit 5e74d99). On your machine:

```bash
cd /workspace/agentcrucible            # your checkout of skysssup/agentcrucible at main
git apply --index /home/user/.capy/work/overhaul/overhaul-base.patch
git -c user.name=base -c user.email=base@local commit -qm "base snapshot (local only, never push)"
npm ci && npm run build
```

NEVER push, never open a PR, never commit anything else to a remote. Your deliverable is a patch
file (see "Delivering").

## Running and looking at your work

```bash
npm run build && node dist/cli.js ui --demo --port 7400     # run detached; rebuild + reload to see changes
```

`--demo` generates "northwind-support": a fictional team's workspace with 8 weeks of real history
(58 runs, ~1000 results, 5 sweeps, ~95 activity events, a baseline, saved reports). The project
agent `support-agent` improves over releases v1.0 → v2.0 (7% → 91% safe); a new scenario
`northwind/apology-email-phantom` exposes a SILENT_FAILURE in v2.0 (an open, unexpected, critical
result). Every result comes from the real engine. Results of runs from earlier sessions open by
being regenerated from their seed (`GET /api/report?key=hist:<run>:<i>` adds `regeneration:
{ matches, scenarioChanged, recordedVerdict }`); old versions regenerate with today's agent, so
`matches` is false for v1.x results: show that honestly (a callout), it is a feature.

Check every page with the browser tool at 1440×900 (desktop), 1024×768 (tablet: sidebar becomes
an icon rail), and 390×844 mobile (bottom tab bar, drawer nav, tables become cards with the
`cards: true` table option). Check light and dark (`localStorage` key `agentcrucible-prefs`,
`{"theme":"dark"}`, or press `T`). Read the browser console for errors. Attach screenshots to your
final report.

## Architecture (read these files first)

- `src/ui/client/app.ts`: boot, routing, dispatch. Clicks on `[data-action]` call
  `page.actions[name](el, ev)` first, then global actions (`copy` with `data-copy`, `search`,
  `notifications`, `dt-*` table actions...). `input`/`change` on elements with `data-input="name"`
  call `page.inputs[name](el, ev)`. Forms with `data-submit="name"` call `page.submit[name]`.
  Rows with `data-href` navigate on click. Elements with `data-context` call
  `page.actions["context-menu"]` on right click.
- `src/ui/client/routes.ts`: the `Page` interface (render returns an HTML string; mount/unmount;
  actions; inputs; submit; keys; watches), nav groups, `parseHash`.
- `src/ui/client/pages/index.ts`: route → page registry. Your pages already exist as stubs
  (`pages/<route>.ts` exporting `stubPage(...)`); replace their contents. Keep `export default page`.
- `src/ui/client/lib/state.ts`: `store` (meta, scenarios, runs, saved/memory reports, sweeps,
  coverage, baseline, activity, notifications, profile, system, jobs, caches, prefs, recent) and
  `load.*` loaders (`load.runs(force?)`, `load.report(key)`, `load.scenario(id)`...), `invalidate`,
  `remember(...)` (recently viewed: call it on detail pages), `findResult(key)`, `runOf(key)`.
- `src/ui/client/lib/analytics.ts`: `observations(runs, saved)` gives one `Observation` per result
  (with run context: label, version, at); `summarize`, `inRange`, `dailySeries`, `agentTrends`,
  `agentRows`, `matrix`, `faultImpact`, `topRules`, `scenarioRows`, `versionRows`, `latest`,
  `insights`, `adviceFor`, `isSafe/isCritical/isUnexpected/isFlaky`, `groupBy`.
- `src/ui/client/lib/format.ts`: `esc` (ALWAYS escape every value from data), `plural`, `clip`,
  `relTime`, `absTime`, `dayKey`, `dayLabel`, `shortDay`, `duration`, `pct`, `num`, `bytes`, `href`,
  `scenariosHref`, `withQuery`, `csv`, `initials`, `runCommand`, `shellQuote`.
- `src/ui/client/lib/runtime.ts`: `runtime.rerender()` (redraw current page, keeps scroll),
  `runtime.navigate(hash)`, `runtime.refreshShell()`, `runtime.openSearch(q, scope)`,
  `patch(id, html)` to redraw a region.
- `src/ui/client/lib/dom.ts`: `copy(text, el)`, `download(name, text, type)`, `pickFile(accept)`, `MOD`.
- `src/ui/client/jobs.ts`: `startRunJob(req)`, `startSweepJob(req)`, `onJob(id, fn)`, `jobDone(id)`.
- `src/ui/api.ts`: the JSON contract types (ReportSummary, RunRecord, SweepResponse, ActivityEvent,
  Job, Profile, SystemInfo, Regeneration...). `src/ui/server.ts` has every route.

### Components (src/ui/client/ui/) — use these, do not hand-roll equivalents

- `primitives.ts`: `button(label, {action, href, kind: primary|secondary|ghost|danger|ink|link,
  icon, iconEnd, size: sm|lg, kbd, iconOnly, data, attrs, disabled, title})`, `iconButton`,
  `copyButton(text)`, `kbd`, `avatar`, `glyph(icon)`, `statusDot`, `pill(text, kind)`, `worldChip`,
  `worldIcon`, `faultTag`, `codeChip`, `delta(change, {unit, inverse})`, `checkbox`, `toggle`,
  `segmented(action, current, options)` (handler reads `el.dataset.value`), `tabs(items, current,
  {action})` (href tabs or action tabs), `field(label, control, {hint, optional})`,
  `searchInput({id, placeholder, kbd: "/"})` (fires `inputs[id]`), `select({...})`,
  `filterButton(label, action, chosen, total)`, `tip(text)` / `tipHtml(html)` tooltips.
- `verdicts.ts`: `badge(v)`, `verdictText(v)`, `verdictCode(v)`, `vdot(v)`, `tally`, `tallyOf`,
  `verdictBar(tally, {size})`, `verdictLegend`, `mixCounts`, `rateMeter(rate)`, `expectedMark(r)`,
  `stageLabel`, `VERDICT_META` (label, short, icon, meaning), `VERDICT_VAR` (CSS colors).
- `layout.ts`: `pageHead({title, desc, meta, eyebrow, actions, mono, titleExtra})`, `metaItem(icon,
  html)`, `panel({title, icon, meta, actions, foot, flush, id, cls}, body)`, `kpi({...})` +
  `kpis([...])`, `facts([[label, html]])`, `emptyState({icon, title, text, actions, compact})`,
  `callout(kind, html, {title, actions})`, `progressBar`, `skeletonPage`, `sectionHead`.
- `table.ts`: `dataTable({id, columns, rows, state, rowKey, rowHref, selected, empty, cards,
  groupBy, plain, flush})` with `tableState(id, defaults)` and `registerTable(id, render, {selected,
  onSelect})` — register in `render()` so sort/page/select redraw only the table. `arrange()` for
  exports. Comparators: `by.text`, `by.num`, `by.time`.
- `charts.ts`: `chart({kind: "line", series, labels, ...})`, `chart({kind: "bars", stacks, line,
  marks, normalized, hrefs})` (auto-fit to width after mount), `sparkline`, `donut(tally, {value,
  label})`, `heatmap(rows, cols, cell)`, `barList(items)`, `rateColors(rate)`, `SERIES_COLORS`.
- `overlays.ts`: `toast(text, kind, {title, action, persist})`, `confirmDialog({title, body,
  confirm, danger, typeToConfirm})`, `formDialog`, `dialog`, `openDrawer({title, body, foot})` /
  `closeDrawer`, `openMenu(items, anchor)` (items: {label, icon, hint, danger, checked, href, run} |
  "-" | {heading}), `openChecklist(anchor, {title, options, onChange, search})`.
- `code.ts`: `codeView(text, "yaml"|"json", {maxHeight, bad})`. `lib/yaml.ts`: `highlightYaml`,
  `errorLine`, `gutterLines`. `html.ts` (repo root src): `highlightJson`, `reportSections`,
  `sweepHeatMap`, `VERDICT_CODE`, `renderReportHtml`.
- `icons.ts`: `icon(name, size)`; many icons exist (look at the file before inventing).

### CSS

Global layers live in `src/ui/styles/` (base, controls, layout, data, overlays) and tokens in
`BASE_CSS` in `src/html.ts`. Do NOT edit those shared files. Put your page styles in your group's
file `src/ui/styles/pages/<group>.ts` (already created and registered). Use tokens only:
`--surface`, `--surface-2`, `--surface-3`, `--sunken`, `--border`, `--border-2`, `--fg`, `--fg-2`,
`--muted`, `--faint`, `--ink`/`--on-ink`, `--accent-solid` (brand/primary/fault), `--accent-soft`,
`--accent-fg`, verdict vars (`--harm --silent --degr --inc --sfail --ssucc` and `-fg -bg -bd`;
add class `HARMFUL_ACTION` etc. to an element to get `--v --v-fg --v-bg --v-bd`), `--fault*`,
radii `--r-xs/--r-sm/--r-md` (no radius above 6px except `--r-full` pills), `--shadow-pop`
(overlays only; panels have borders, no shadows), fonts `--font-sans` / `--font-mono`, motion
`--t-fast/--t-med/--t-slow` + `--ease`.

If you truly need a shared component or a server change, add it in a NEW file (e.g.
`src/ui/client/ui/matrix.ts`) or describe the exact change in your report; do not edit shared
files. Exception: your group's ownership list below may include specific shared regions.

## Visual identity (non-negotiable)

- "Ink on warm paper": monochrome chrome; color appears only where it means something (verdicts,
  faults, deltas, the single orange primary action per region).
- No gradients, glows, glassmorphism, blur, text shadows, big rounded cards, emoji, or decorative
  illustration. Panels: 1px borders, 6px radius max. Buttons: the `btn` system only.
- Dense but organized: tables with mono numerics; uppercase mono micro-labels (`.eyebrow`,
  `.kpi-label`, `th`); hierarchy by weight and size, not color.
- Every page: `pageHead` with a clear title, a one-line description that says what the page is
  for, meta facts, and actions (primary action rightmost). Then content in panels/grids.
- Every list: search/filter/sort where it helps, pagination for long lists, a real empty state
  (icon, title, one sentence, an action), a "no match" state distinct from "no data".
- Every async action: busy state on the button (`el.classList.add("is-busy")`), a toast on
  success/failure, confirmation dialogs for destructive actions (respect `store.prefs.confirm`).
- Details: tooltips on truncated or abbreviated things (`tip()`), `title` on icons, keyboard
  access (all actions are buttons/links), `aria-label` on icon-only controls, relative times with
  absolute time in the tooltip (`absTime`), copy buttons for ids/commands.
- Copy tone: plain, specific, active voice, no hype, no exclamation marks. Explain mechanisms
  ("A blind retry refunds twice") rather than marketing.
- Realism: everything shown must come from real data (store / API). Never invent numbers.

## Code quality

- TypeScript strict; `npm run typecheck` must pass. Pure render functions returning strings; keep
  page state in module-level variables of the page module; no frameworks.
- Escape EVERY data value with `esc()` (attributes too). Never put raw user/scenario text in HTML.
- Reuse components; no copy-pasted near-duplicates; no dead code; no inline `style=` except for
  computed values (widths, CSS variables).
- Keep functions focused, early returns, no comments narrating code (doc comments on exported
  functions in the repo's style are fine).
- Add a test file `test/ui-<group>.test.ts` (vitest) for your pure helpers and for key render
  functions (escaping, empty states, important markers). `npm test` must pass.

## Delivering

When done (and verified visually):

```bash
cd /workspace/agentcrucible && git add -A && git diff --cached --binary HEAD > /home/user/.capy/work/overhaul/<group>.patch
```

(HEAD is your local "base snapshot" commit.) Report: what each page does, the files you touched,
anything shared you need changed, and attach screenshots (desktop light, desktop dark, mobile).

## Hard constraints that tests enforce

- The client bundle must not contain any `http://` or `https://` URL string (the package test greps
  `dist/ui/app.js` for them; the UI loads nothing from the network). No external links: refer to
  docs as plain text such as "docs/ui.md in the repository".
- CSS: no `gradient(`, `backdrop-filter`, `text-shadow`, keyframes named glow/shimmer/pulse, and no
  `border-radius` literal of 7px or more (see `test/ui-html.test.ts`).
- Security: every value escaped; `/api/*` calls only through `api()` from `lib/api.ts`.
- `npm run typecheck`, `npm test` (vitest), and `npm run build` must pass before you deliver.

## The old implementation

The 2.0 UI is in git history: after your local base commit, `git show HEAD~1:src/ui/client/views.ts`,
`git show HEAD~1:src/ui/client/app.ts`, and `git show HEAD~1:test/ui-views.test.ts` show the old
views, behaviors, and tests. Keep every capability the old page had (and its test coverage, ported
to your new functions in `test/ui-<group>.test.ts`), then go far beyond it.

## Cross-page links (contract between groups)

| Link | Owner |
|---|---|
| `#/launch?scenarios=a,b&agents=x,y` (prefilled launcher), `#/launch?job=job-N` (live progress) | runs |
| `#/runs?day=YYYY-MM-DD`, `#/run/<id>`, `#/run/<id>?compare=<other>` | runs |
| `#/sweep`, `#/sweep/<id>`, `#/sweep?scenario=<id>&agent=<id>`, `#/sweep?job=job-N` | runs |
| `#/scenarios?ids=a,b`, `#/scenario/<id>`, `#/coverage`, `#/catalog/<agents|worlds|faults|verdicts|policies>?world=&kind=` | scenarios |
| `#/reports?verdict=<VERDICT|critical>&unexpected=1&flaky=1&rule=<rule>&agent=<id>&scenario=<id>`, `#/report/<key>`, `#/baseline`, `#/baseline?compare=latest` | reports |
| `#/agents`, `#/agent/<id>`, `#/compare?a=<id>&b=<id>`, `#/analytics` | agents |
| `#/editor`, `#/editor/<scenario id>`, `#/editor?template=<name>`, `#/editor?new=1&world=<w>&tool=<t>&kind=<k>`, `#/demo`, `#/demo?play=1`, `#/activity`, `#/settings/<profile|preferences|workspace|integrations|security|data|shortcuts|about>` | workspace |
