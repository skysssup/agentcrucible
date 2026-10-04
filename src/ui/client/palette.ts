import { icon, type IconName } from "./icons.js";
import { esc } from "./views.js";

export interface PaletteItem {
  group: string;
  label: string;
  hint?: string;
  icon: IconName;
  /** Extra words the search matches, such as a scenario's task. */
  keywords?: string;
  run: () => void;
}

let root: HTMLElement | undefined;

export function paletteOpen(): boolean {
  return root !== undefined;
}

export function closePalette(): void {
  root?.remove();
  root = undefined;
}

/** Items whose label or keywords hold every word of the query, best matches first, kept together by group. */
function rank(items: PaletteItem[], query: string): PaletteItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return items;
  const ranked = items
    .map((item, i) => {
      const label = item.label.toLowerCase();
      const text = `${label} ${item.group.toLowerCase()} ${item.keywords?.toLowerCase() ?? ""}`;
      if (!words.every((w) => text.includes(w))) return undefined;
      const score = (label.startsWith(words[0]) ? 4 : 0) + (label.includes(words.join(" ")) ? 2 : 0) + (words.every((w) => label.includes(w)) ? 1 : 0);
      return { item, score, i };
    })
    .filter((x): x is { item: PaletteItem; score: number; i: number } => x !== undefined)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.item);
  const groups = [...new Set(ranked.map((item) => item.group))];
  return groups.flatMap((group) => ranked.filter((item) => item.group === group));
}

/** A command palette over `items`: type to filter, arrows to move, Enter to run, Escape to close. */
export function openPalette(items: PaletteItem[]): void {
  closePalette();
  const returnFocus = document.activeElement as HTMLElement | null;
  root = document.createElement("div");
  root.className = "palette-root";
  root.innerHTML = `<div class="palette-scrim"></div><div class="palette" role="dialog" aria-modal="true" aria-label="Search and jump">
  <div class="palette-input">${icon("search", 17)}<input type="text" placeholder="Search scenarios, pages, and actions" aria-label="Search" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="palette-list"/><kbd>esc</kbd></div>
  <div class="palette-list" id="palette-list" role="listbox"></div>
  <div class="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div>
</div>`;
  document.body.append(root);
  const input = root.querySelector("input")!;
  const list = root.querySelector<HTMLElement>(".palette-list")!;
  let shown: PaletteItem[] = [];
  let active = 0;
  const draw = () => {
    shown = rank(items, input.value).slice(0, 60);
    active = Math.min(active, Math.max(0, shown.length - 1));
    let group = "";
    list.innerHTML = shown.length
      ? shown
          .map((item, i) => {
            const head = item.group === group ? "" : `<div class="palette-group">${esc(item.group)}</div>`;
            group = item.group;
            return `${head}<div class="palette-item${i === active ? " active" : ""}" role="option" id="palette-${i}" aria-selected="${i === active}" data-index="${i}">${icon(item.icon, 15)}<span class="pi-label">${esc(item.label)}</span>${item.hint ? `<span class="pi-hint">${esc(item.hint)}</span>` : ""}${i === active ? `<span class="pi-enter">${icon("arrowRight", 13)}</span>` : ""}</div>`;
          })
          .join("")
      : `<div class="palette-empty">Nothing matches “${esc(input.value)}”.</div>`;
    input.setAttribute("aria-activedescendant", shown.length ? `palette-${active}` : "");
    list.querySelector(".active")?.scrollIntoView({ block: "nearest" });
  };
  const pick = (i: number) => {
    const item = shown[i];
    if (!item) return;
    closePalette();
    item.run();
  };
  input.addEventListener("input", () => {
    active = 0;
    draw();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % Math.max(1, shown.length);
      draw();
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closePalette();
      returnFocus?.focus();
    }
  });
  list.addEventListener("mousemove", (e) => {
    const item = (e.target as HTMLElement).closest<HTMLElement>(".palette-item");
    if (!item || Number(item.dataset.index) === active) return;
    active = Number(item.dataset.index);
    draw();
  });
  list.addEventListener("click", (e) => {
    const item = (e.target as HTMLElement).closest<HTMLElement>(".palette-item");
    if (item) pick(Number(item.dataset.index));
  });
  root.querySelector(".palette-scrim")!.addEventListener("click", () => {
    closePalette();
    returnFocus?.focus();
  });
  draw();
  input.focus();
}
