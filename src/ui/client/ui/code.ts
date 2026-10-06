/** Source text with line numbers and highlighting, as scenario files and JSON reports are shown. */
import { highlightJson } from "../../../html.js";
import { gutterLines, highlightYaml } from "../lib/yaml.js";
import { esc } from "../lib/format.js";

export function codeView(text: string, lang: "yaml" | "json" | "text" = "yaml", o: { maxHeight?: number; bad?: number } = {}): string {
  const body = text.replace(/\n$/, "");
  const html = lang === "yaml" ? highlightYaml(body) : lang === "json" ? highlightJson(body) : esc(body);
  return `<div class="code-view"${o.maxHeight ? ` style="max-height:${o.maxHeight}px"` : ""}><div class="code-gutter" aria-hidden="true">${gutterLines(body, o.bad)}</div><pre class="code ${lang}">${html}</pre></div>`;
}
