import { esc } from "../../../html.js";

const VALUE_TOKEN = /(\s+)|("(?:[^"\\]|\\.)*"?|'(?:[^']|'')*'?)|(#.*)|([{}[\],])|([^\s{}[\],:#"']+(?:[:#][^\s{}[\],:#"']+)*)(\s*:(?=\s|$))?|(:)|(.)/gy;
const KEY = /^((?:"[^"]*"|'[^']*'|[^\s#"'{}[\],:][^#:{}[\],]*?))(\s*:)(?=\s|$)/;

/** YAML as HTML with keys, strings, numbers, literals, punctuation, and comments in spans, one output line per input line. */
export function highlightYaml(text: string): string {
  let blockIndent = -1;
  return text
    .split("\n")
    .map((line) => {
      const indent = line.length - line.trimStart().length;
      if (blockIndent >= 0) {
        if (!line.trim() || indent > blockIndent) return line ? `<span class="tk-str">${esc(line)}</span>` : "";
        blockIndent = -1;
      }
      if (/^\s*#/.test(line)) return `<span class="tk-com">${esc(line)}</span>`;
      const lead = /^(\s*)((?:-(?:\s+|$))*)/.exec(line)!;
      let out = esc(lead[1]) + (lead[2] ? `<span class="tk-punc">${esc(lead[2])}</span>` : "");
      let rest = line.slice(lead[0].length);
      const key = KEY.exec(rest);
      if (key) {
        out += `<span class="tk-key">${esc(key[1])}</span><span class="tk-punc">${esc(key[2])}</span>`;
        rest = rest.slice(key[0].length);
        if (/^\s*[|>][-+0-9]*\s*(#.*)?$/.test(rest)) {
          blockIndent = lead[0].length;
          return out + `<span class="tk-punc">${esc(rest)}</span>`;
        }
      }
      return out + highlightValue(rest);
    })
    .join("\n");
}

function highlightValue(text: string): string {
  let out = "";
  VALUE_TOKEN.lastIndex = 0;
  for (let m = VALUE_TOKEN.exec(text); m; m = VALUE_TOKEN.exec(text)) {
    const [all, space, quoted, comment, punct, plain, flowKey, colon] = m;
    if (space !== undefined) out += space;
    else if (quoted !== undefined) out += `<span class="tk-str">${esc(quoted)}</span>`;
    else if (comment !== undefined) out += `<span class="tk-com">${esc(comment)}</span>`;
    else if (punct !== undefined || colon !== undefined) out += `<span class="tk-punc">${esc(all)}</span>`;
    else if (plain !== undefined) {
      const kind = flowKey ? "tk-key" : /^-?\d+(\.\d+)?$/.test(plain) ? "tk-num" : /^(true|false|null|~|[&*][\w-]+)$/.test(plain) ? "tk-lit" : "tk-str";
      out += `<span class="${kind}">${esc(plain)}</span>${flowKey ? `<span class="tk-punc">${esc(flowKey)}</span>` : ""}`;
    } else out += esc(all);
    if (VALUE_TOKEN.lastIndex >= text.length) break;
  }
  return out;
}

/** The 1-based line a YAML parse error names ("at line 3, column 5"), if it names one. */
export function errorLine(message: string | undefined): number | undefined {
  const match = /\bline (\d+)\b/.exec(message ?? "");
  return match ? Number(match[1]) : undefined;
}

/** Line numbers for the editor gutter, marking `bad` when given. */
export function gutterLines(text: string, bad?: number): string {
  const count = text.split("\n").length;
  return Array.from({ length: count }, (_, i) => `<span${i + 1 === bad ? ' class="bad"' : ""}>${i + 1}</span>`).join("");
}
