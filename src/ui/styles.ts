import { BASE_CSS, REPORT_CSS, SWEEP_CSS } from "../html.js";
import { BASE_UI_CSS } from "./styles/base.js";
import { CONTROLS_CSS } from "./styles/controls.js";
import { DATA_CSS } from "./styles/data.js";
import { LAYOUT_CSS } from "./styles/layout.js";
import { OVERLAYS_CSS } from "./styles/overlays.js";
import { PAGES_CSS } from "./styles/pages/index.js";

/**
 * The local UI's stylesheet: the tokens, verdict styles, report timeline, and sweep heat map that
 * the standalone HTML pages share, then the UI's own layers from controls to pages.
 */
export const UI_CSS = [BASE_CSS, REPORT_CSS, SWEEP_CSS, BASE_UI_CSS, CONTROLS_CSS, LAYOUT_CSS, DATA_CSS, OVERLAYS_CSS, PAGES_CSS].join("\n");
