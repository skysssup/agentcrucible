/** The keyboard shortcuts, as the help dialog and the Settings page list them. */
import { MOD } from "../lib/dom.js";
import { esc } from "../lib/format.js";
import { ALL_NAV } from "../routes.js";
import { kbd } from "./primitives.js";

export function shortcutsHtml(): string {
  const group = (title: string, rows: Array<[string, string]>) => `<section><h3>${esc(title)}</h3><dl>${rows.map(([k, label]) => `<div><dt>${esc(label)}</dt><dd>${k}</dd></div>`).join("")}</dl></section>`;
  return `<div class="shortcuts">
  ${group("Anywhere", [
    [kbd(MOD, "K"), "Search everything"],
    [kbd("/"), "Search on this page"],
    [kbd("N"), "Start a new run"],
    [kbd("G", "N"), "Notifications"],
    [kbd("T"), "Light or dark theme"],
    [kbd("["), "Collapse the sidebar"],
    [kbd("?"), "These shortcuts"],
  ])}
  ${group("Go to", ALL_NAV.map((n) => [kbd("G", n.key.toUpperCase()), n.label]))}
  ${group("Report", [
    [kbd("J"), "Next call"],
    [kbd("K"), "Previous call"],
    [kbd("E"), "Expand or collapse every call"],
  ])}
  ${group("Editor", [
    [kbd(MOD, "S"), "Save the scenario"],
    [kbd(MOD, "↵"), "Run the draft"],
    [kbd("Tab"), "Indent; with Shift, outdent"],
  ])}
</div>`;
}

