/** Styles that belong to one page or one group of pages; this file joins them. */
import { AGENTS_CSS } from "./agents.js";
import { OVERVIEW_CSS } from "./overview.js";
import { REPORTS_CSS } from "./reports.js";
import { RUNS_CSS } from "./runs.js";
import { SCENARIOS_CSS } from "./scenarios.js";
import { WORKSPACE_CSS } from "./workspace.js";

export const PAGES_CSS = [OVERVIEW_CSS, SCENARIOS_CSS, RUNS_CSS, REPORTS_CSS, AGENTS_CSS, WORKSPACE_CSS].join("\n");
