# Handover: AgentCrucible 2.1.0 console overhaul

You are continuing a large, unfinished overhaul. The previous agent's machine could not be restarted (the org's memory budget was full) and the user is low on credits. Everything that survived is on GitHub. Work in one agent, keep tool output short, and do not start subagents.

## The brief (from the user)

Rework AgentCrucible (fault-injection testing for tool-using AI agents) into a polished, production-quality app for a video presentation at HortWiz Anderson Academy:

- A product-wide redesign of the local console (`agentcrucible ui`) and a large feature expansion: every page polished, analytics, global search, notifications, a profile, realistic demo data, and moments that look good on video.
- No AI-generated look: no gradients, glows, glassmorphism, blur, emoji, or big rounded cards. "Ink on warm paper": monochrome chrome, color only where it means something (verdicts, faults, deltas, one orange primary action per region).
- Responsive (desktop, tablet, phone), light and dark themes, keyboard accessible.
- A presentation-quality README, docs, changelog, and fresh screenshots.
- Never merge anything. Open pull requests; the user merges.

## Branches

| Branch | Contents |
|---|---|
| `main` (5e74d99) | 2.0.0 (#5) plus dependabot #6, #7, #8. CI is red: #8 bumped TypeScript to 7.0.2 and `tsup --dts` crashes (`Cannot read properties of undefined (reading 'useCaseSensitiveFileNames')`). |
| `capy/fix-ts7-build` | One commit off main: `tsconfig.build.json` plus a build script that drops `--dts` and runs `tsc -p tsconfig.build.json`. Verified on the old machine: build, typecheck, 734 tests, `test:docs` (46 commands), and `test:package` (including the strict NodeNext declaration check) all pass. Open a PR from it first so main goes green. |
| `capy/console-overhaul` | Main plus the overhaul foundation (one commit, includes the same build fix) plus this `handover/` folder. Continue here. Delete `handover/` before the final PR. |
| `capy/overhaul-wip-{scenarios,runs,reports,agents,workspace}` | The same foundation plus one partial, unverified commit from each page team, stopped mid-work. The last commit on each branch holds only that team's changes: `git show --stat origin/capy/overhaul-wip-runs`. Reuse what is good; it may not compile. |

## What the foundation already has

- **Server** (`src/ui/server.ts`, `src/ui/api.ts`, `src/ui/workspace.ts`): run history, activity events, notifications, and a profile persisted to `.agentcrucible/ui/workspace.json`; background jobs for matrix runs and sweeps with progress; reports from history regenerate from their seed (`hist:` keys); export, import, and clear of the history; deleting saved reports and the project's own scenario files; session token rotation. `runEvent`, `sweepEvent`, and `reportSummary` are exported.
- **Demo workspace** (`src/ui/demo-workspace.ts`, `ui --demo`): project `northwind-support`, 58 runs, 5 sweeps, 94 events over eight weeks; `support-agent` goes from v1.0 (7% safe) to v2.0 (91% safe).
- **CLI** (`src/cli.ts`): `ui --demo`, `--state <dir>` (default `.agentcrucible/ui`), `--no-history`. Default port 7357.
- **Design system**: tokens in `BASE_CSS` in `src/html.ts` (warm paper and graphite, burnt-orange accent, verdict colors) and a new logo; layered CSS in `src/ui/styles/` (base, controls, layout, data, overlays) and one file per page group in `src/ui/styles/pages/`.
- **Client** (`src/ui/client/`): `lib/` (state store, API, search, analytics, format, theme, yaml), `ui/` (primitives, charts, data table, overlays, code view, verdicts, layout, shortcuts), `shell.ts` (sidebar, top bar, mobile tab bar), `routes.ts`, `jobs.ts`, `search-panel.ts` (Ctrl+K search with scopes and a preview pane), `notifications.ts` (notification center), keyboard shortcuts (`?`, `/`, `g` sequences, `t` theme, `[` sidebar, `n` new run).
- **Pages**: `pages/overview.ts` (the command center) is complete and is the reference for every other page. All other pages render a stub through `pages/_stub.ts`.
- Removed: the old `views.ts`, the legacy palette, `test/ui-views.test.ts`. The 2.0 views are in git history (`git show 5e74d99:src/ui/client/views.ts`); keep every capability they had.

## Work that was lost and must be redone

These were done on the dead machine after the foundation was snapshotted and never pushed.

1. **`test/ui-workspace.test.ts`** (11 tests, all passed): matrix run as a background job with progress, results, and a recorded run; sweep job cell by cell; activity plus notifications read and dismissed; profile kept and bad values refused; session described without secrets and token rotation; export, import, and clear of the history; deleting saved reports and only the project's own scenario files; runs kept in the workspace file across sessions with reports regenerated from the seed; an unreadable workspace file moved aside with a message; import refuses files that are not workspaces; the demo workspace writes a project with eight weeks of history that the UI serves.
2. **Version 2.1.0**: `package.json` version and description ("Fault-injection testing for tool-using AI agents: break tool calls on a seeded schedule in offline mock services, grade what the agent did and said against what actually committed, and track reliability over time in a local console with run history, analytics, sweeps, and a CI gate."), `npm install --package-lock-only`, "AgentCrucible 2.0.0" to 2.1.0 in `docs/traces.md`, "captured from 2.0.0" in `docs/examples.md`, and the tarball links in `README.md` and `docs/ci.md`. No v2.0.0 or v2.1.0 GitHub release exists (latest is v1.0.0; tags `v*` trigger `.github/workflows/release.yml`). Ask the user before pushing any tag.
3. **`docs/cli.md`**: add `[--state <dir> | --no-history] [--demo]` to the `ui` synopsis and describe them in the command table row.
4. **`.gitignore`**: add `.agentcrucible/ui/`.
5. **Mobile shell** (`src/ui/styles/layout.ts`, phone breakpoint): `.tb-search` gets `min-width:0`; on phones it becomes a 36px icon button (hide its text and kbd) pushed right with `margin-left:auto`; `.panel-head` wraps with `.panel-meta` on its own full-width row; `.panel-body` padding 14px. Without this the top bar overflows at 390px and panel titles overlap their meta.
6. **Standalone run index** (`renderRunIndex` in `src/html.ts`): a `page-title` header with a meta row (scenarios x agents, reports, trials, fail threshold) and a KPI strip using `kpiCells` (Reports, Ended safe, Critical, Gate "fails"/"passes" colored by verdict tone). Keep the table row markup byte-for-byte; `test/cli.test.ts` and `test/traces.test.ts` pin it.
7. **`relTime`** (`src/ui/client/lib/format.ts`): floor hours and use `Math.max(1, Math.floor(s / 60))` minutes, so it never prints "24 h ago" or "60 min ago".
8. **Bell label** (`src/ui/client/shell.ts`): `Notifications, ${n} unread`, not "unreads".
9. **`scripts/check-docs.mjs`**: `isCommand` must also skip `node dist/cli.js ui|mcp` (they serve forever), so the README can show `node dist/cli.js ui --demo` in a bash block.
10. **`CONTRIBUTING.md`** layout table: rows for the server/API/workspace, the demo workspace, the client folders, and the styles. **`SECURITY.md`**: Settings, Security rotates the session token; a bullet on the UI history file (what it holds, `--no-history`, `--state`, export/import/clear).

## Remaining work, in order

1. PR from `capy/fix-ts7-build` (title: "Build type declarations with tsc so the build works with TypeScript 7").
2. Build the page groups to the standard of `pages/overview.ts`, following `handover/SPEC.md` (written for five parallel teams; ignore its `~/.capy/work` paths and delivery steps):
   - scenarios: Scenarios list, Scenario detail, Coverage, Catalog (agents, worlds, faults, verdicts, policies)
   - runs: Runs, Run detail and run-vs-run compare, Launcher with live job progress, Sweeps and sweep detail
   - reports: Reports list with filters, Report explorer (trace timeline), Baseline
   - agents: Agents, Agent profile, Compare two agents, Analytics
   - workspace: Editor with live validation, Guided demo, Activity, Settings (profile, preferences, workspace, integrations, security, data, shortcuts, about)
   Each group gets `test/ui-<group>.test.ts` for its pure helpers and key renders (escaping, empty states, markers).
3. Redo the lost items above.
4. Checks: `npm run build`, `npm run typecheck`, `npx vitest run`, `npm run test:docs`, `npm run test:package`.
5. Visual audit with `node dist/cli.js ui --demo --port 7400` at 1440, 1024, and 390 wide, light and dark (`t` toggles), no console errors. Restart the server after CSS changes: the stylesheet is compiled into the server bundle.
6. Docs: README overhaul, `docs/ui.md` rewrite (pages, search, notifications, jobs, history, demo workspace, shortcuts, API routes, flags, security), `CHANGELOG.md` 2.1.0 entry (the UI and its API may change in a minor release per `docs/stability.md`; the new flags are additive), and regenerated `docs/images/` screenshots.
7. One PR from `capy/console-overhaul` with a full description. Do not merge.

### Planned README structure

Title and badges; a two-sentence pitch; hero screenshot (`<picture>` with light and dark); what it finds (keep the five bullets); a highlights table (seeded faults, grading against committed state, a console with memory, sweeps and coverage, any agent, CI gate, offline); "Try it in thirty seconds" (clone, `npm ci && npm run build`, `node dist/cli.js ui --demo`, port 7357); a console tour with screenshots (command center, guided demo, launcher with live progress, runs, report explorer, sweeps, analytics, agent profile, editor, search and notifications, settings); a five-minute presenter walkthrough; then the existing Install, Sixty seconds, Test your agent, Scenarios, Verdicts, Sweeps, Reports, CI sections kept verbatim; Architecture (the existing engine mermaid plus a console mermaid, technology choices, project layout); Development; Documentation; Limitations.

`scripts/check-docs.mjs` runs README bash blocks and compares the following text block, so: the first ```yaml block must stay the `custom/order-confirmation` scenario, and the bash block right before the "Sixty seconds" text block must run `demo`.

### Screenshots for `docs/images/`

`ui-overview.png` and `ui-overview-dark.png` (hero), `ui-demo.png`, `ui-launch.png`, `ui-run.png`, `ui-report.png`, `ui-sweep.png`, `ui-coverage.png`, `ui-analytics.png`, `ui-agents.png` or `ui-agent.png`, `ui-editor.png`, `ui-search.png`, and a phone shot. Take them from the demo workspace at 1440x900.

## Constraints the tests enforce

- CSS (`test/ui-html.test.ts`): no `gradient(`, `backdrop-filter`, `text-shadow`, keyframes named glow, shimmer, or pulse, and no `border-radius` literal of 7px or more.
- The client bundle must contain no `http://` or `https://` string (`test:package` greps `dist/ui/app.js`); refer to docs as plain text.
- Escape every value with `esc()`, attributes included. Call `/api/*` only through `api()` in `lib/api.ts`.
- Keep the browser bundle free of Node imports.
- Keep TypeScript 7.
