/** Toasts, dialogs, drawers, menus, and tooltips: the parts of the UI that float above a page. */
import { esc } from "../lib/format.js";
import { icon, type IconName } from "../icons.js";

export type ToastKind = "ok" | "bad" | "info" | "progress";

export interface ToastOpts {
  title?: string;
  action?: { label: string; href?: string; run?: () => void };
  /** Stays until closed; returns the closer either way. */
  persist?: boolean;
  /** Milliseconds before it closes on its own. */
  ms?: number;
}

/** Shows a toast at the bottom right. Returns a function that closes it. */
export function toast(text: string, kind: ToastKind = "ok", o: ToastOpts = {}): () => void {
  let stack = document.querySelector<HTMLElement>(".toasts");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toasts";
    stack.setAttribute("aria-live", "polite");
    document.body.append(stack);
  }
  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.setAttribute("role", kind === "bad" ? "alert" : "status");
  const lead = kind === "progress" ? '<span class="spinner"></span>' : icon(kind === "bad" ? "xCircle" : kind === "ok" ? "checkCircle" : "info", 16);
  el.innerHTML = `${lead}<div class="toast-body">${o.title ? `<strong class="toast-title">${esc(o.title)}</strong>` : ""}<div class="toast-text">${esc(text)}</div></div>${o.action ? (o.action.href ? `<a class="toast-action" href="${esc(o.action.href)}">${esc(o.action.label)}</a>` : `<button type="button" class="btn btn-ghost btn-sm toast-action">${esc(o.action.label)}</button>`) : ""}<button type="button" class="icon-btn sm" aria-label="Dismiss">${icon("x", 13)}</button>`;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    el.classList.add("out");
    setTimeout(() => el.remove(), 200);
  };
  el.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]')!.addEventListener("click", close);
  el.querySelector(".toast-action")?.addEventListener("click", () => {
    o.action?.run?.();
    close();
  });
  stack.append(el);
  while (stack.children.length > 4) stack.firstElementChild?.remove();
  if (!o.persist && kind !== "progress") setTimeout(close, o.ms ?? (kind === "bad" ? 9000 : 5000));
  return close;
}

/** Updates the text of the newest progress toast, if one is open. */
export function updateProgressToast(text: string): void {
  const label = document.querySelector(".toast-progress:last-child .toast-text");
  if (label) label.textContent = text;
}

/** A modal dialog from markup; resolves with the value of the button that closed it ("" on Escape). */
export function dialog(html: string, o: { cls?: string; focus?: string; onOpen?: (el: HTMLDialogElement) => void } = {}): Promise<string> {
  return new Promise((resolve) => {
    const el = document.createElement("dialog");
    el.className = `modal${o.cls ? ` ${o.cls}` : ""}`;
    el.innerHTML = html;
    document.body.append(el);
    el.addEventListener("close", () => {
      resolve(el.returnValue);
      el.remove();
    });
    el.addEventListener("click", (e) => {
      if (e.target === el) el.close("");
    });
    el.showModal();
    o.onOpen?.(el);
    el.querySelector<HTMLElement>(o.focus ?? "[autofocus], button[value=ok]")?.focus();
  });
}

export interface ConfirmOpts {
  title: string;
  /** Escaped HTML. */
  body: string;
  confirm: string;
  danger?: boolean;
  icon?: IconName;
  /** The user must type this to enable the confirm button, for irreversible actions. */
  typeToConfirm?: string;
}

/** A confirmation dialog; resolves true when the user confirms. */
export async function confirmDialog(o: ConfirmOpts): Promise<boolean> {
  const typed = o.typeToConfirm
    ? `<label class="field" style="margin-top:14px"><span class="field-label">Type <code class="code-inline">${esc(o.typeToConfirm)}</code> to confirm</span><input class="input mono" name="confirm-text" autocomplete="off" spellcheck="false"/></label>`
    : "";
  const value = await dialog(
    `<form method="dialog"><div class="modal-head"><span class="modal-icon${o.danger ? " danger" : ""}">${icon(o.icon ?? (o.danger ? "alert" : "help"), 17)}</span><div><h2>${esc(o.title)}</h2><p>${o.body}</p>${typed}</div></div><div class="modal-foot"><button type="submit" class="btn btn-secondary" value="cancel">Cancel</button><button type="submit" class="btn ${o.danger ? "btn-danger-solid" : "btn-primary"}" value="ok"${o.typeToConfirm ? " disabled" : ""}>${esc(o.confirm)}</button></div></form>`,
    {
      focus: o.typeToConfirm ? 'input[name="confirm-text"]' : 'button[value="ok"]',
      onOpen: (el) => {
        if (!o.typeToConfirm) return;
        const input = el.querySelector<HTMLInputElement>('input[name="confirm-text"]')!;
        const ok = el.querySelector<HTMLButtonElement>('button[value="ok"]')!;
        input.addEventListener("input", () => (ok.disabled = input.value.trim() !== o.typeToConfirm));
      },
    }
  );
  return value === "ok";
}

/** A dialog with a form; resolves with its fields, or undefined when cancelled. */
export async function formDialog(o: { title: string; desc?: string; fields: string; submit: string; wide?: boolean }): Promise<Record<string, string> | undefined> {
  let data: Record<string, string> | undefined;
  const value = await dialog(
    `<form method="dialog"><div class="modal-head"><div><h2>${esc(o.title)}</h2>${o.desc ? `<p>${o.desc}</p>` : ""}</div></div><div class="modal-body"><div class="col" style="gap:14px">${o.fields}</div></div><div class="modal-foot"><button type="submit" class="btn btn-secondary" value="cancel" formnovalidate>Cancel</button><button type="submit" class="btn btn-primary" value="ok">${esc(o.submit)}</button></div></form>`,
    {
      cls: o.wide ? "wide" : "",
      focus: "input, select, textarea",
      onOpen: (el) => {
        el.querySelector("form")!.addEventListener("submit", (e) => {
          const form = e.target as HTMLFormElement;
          data = Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, String(v)]));
        });
      },
    }
  );
  return value === "ok" ? data : undefined;
}

let drawerRoot: HTMLElement | undefined;
let drawerReturn: HTMLElement | null = null;

/** Opens a side sheet; returns its element so the caller can fill it. */
export function openDrawer(o: { title: string; body: string; foot?: string; wide?: boolean; label?: string }): HTMLElement {
  closeDrawer();
  drawerReturn = document.activeElement as HTMLElement | null;
  drawerRoot = document.createElement("div");
  drawerRoot.className = "drawer-root";
  drawerRoot.innerHTML = `<div class="drawer-scrim" data-close-drawer></div><aside class="drawer${o.wide ? " wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(o.label ?? o.title)}"><div class="drawer-head"><h2>${esc(o.title)}</h2><button type="button" class="icon-btn" data-close-drawer aria-label="Close">${icon("x", 16)}</button></div><div class="drawer-body">${o.body}</div>${o.foot ? `<div class="drawer-foot">${o.foot}</div>` : ""}</aside>`;
  document.getElementById("app")?.append(drawerRoot);
  for (const el of drawerRoot.querySelectorAll("[data-close-drawer]")) el.addEventListener("click", closeDrawer);
  drawerRoot.querySelector<HTMLElement>(".drawer-head .icon-btn")?.focus();
  return drawerRoot;
}

export function closeDrawer(): void {
  if (!drawerRoot) return;
  drawerRoot.remove();
  drawerRoot = undefined;
  drawerReturn?.focus();
}

export function drawerOpen(): boolean {
  return drawerRoot !== undefined;
}

export interface MenuItem {
  label: string;
  icon?: IconName;
  hint?: string;
  danger?: boolean;
  checked?: boolean;
  href?: string;
  run?: () => void;
}

let menuEl: HTMLElement | undefined;
let menuReturn: HTMLElement | null = null;

/** Opens a menu under `anchor`, or at a point for a context menu. Items may be "-" (separator) or a label string for a heading. */
export function openMenu(items: Array<MenuItem | "-" | { heading: string }>, at: HTMLElement | { x: number; y: number }, o: { align?: "start" | "end" } = {}): void {
  closeMenu();
  menuReturn = document.activeElement as HTMLElement | null;
  menuEl = document.createElement("div");
  menuEl.className = "menu";
  menuEl.setAttribute("role", "menu");
  const actions: Array<MenuItem> = [];
  menuEl.innerHTML = items
    .map((item) => {
      if (item === "-") return '<div class="menu-sep" role="separator"></div>';
      if ("heading" in item) return `<div class="menu-label">${esc(item.heading)}</div>`;
      actions.push(item);
      const inner = `${item.icon ? icon(item.icon, 14) : ""}<span>${esc(item.label)}</span>${item.hint ? `<span class="menu-hint">${esc(item.hint)}</span>` : ""}`;
      const attrs = `class="menu-item${item.danger ? " danger" : ""}" role="menuitem${item.checked === undefined ? "" : "radio"}"${item.checked === undefined ? "" : ` aria-checked="${item.checked}"`} data-index="${actions.length - 1}"`;
      return item.href ? `<a ${attrs} href="${esc(item.href)}">${inner}</a>` : `<button type="button" ${attrs}>${inner}</button>`;
    })
    .join("");
  document.body.append(menuEl);
  const rect = "x" in at ? { left: at.x, right: at.x, bottom: at.y, top: at.y } : at.getBoundingClientRect();
  const w = menuEl.offsetWidth;
  const h = menuEl.offsetHeight;
  let left = o.align === "end" ? rect.right - w : rect.left;
  let top = rect.bottom + 4;
  if (left + w > innerWidth - 8) left = innerWidth - w - 8;
  if (top + h > innerHeight - 8) top = Math.max(8, rect.top - h - 4);
  menuEl.style.left = `${Math.max(8, left)}px`;
  menuEl.style.top = `${top}px`;
  menuEl.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(".menu-item");
    if (!target) return;
    const item = actions[Number(target.dataset.index)];
    closeMenu(false);
    item?.run?.();
  });
  menuEl.addEventListener("keydown", (e) => {
    const list = [...menuEl!.querySelectorAll<HTMLElement>(".menu-item")];
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      list[(i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
    }
  });
  menuEl.querySelector<HTMLElement>(".menu-item")?.focus();
  setTimeout(() => document.addEventListener("pointerdown", outside, { capture: true }), 0);
}

function outside(e: Event): void {
  if (menuEl && !menuEl.contains(e.target as Node)) closeMenu(false);
}

export function closeMenu(restore = true): void {
  if (!menuEl) return;
  menuEl.remove();
  menuEl = undefined;
  document.removeEventListener("pointerdown", outside, { capture: true });
  if (restore) menuReturn?.focus();
}

export function menuOpen(): boolean {
  return menuEl !== undefined;
}

let tipEl: HTMLElement | undefined;
let tipFor: Element | undefined;

/** Shows tooltips for elements with data-tip (text) or data-tip-html (escaped markup), following the pointer. */
export function installTooltips(root: HTMLElement): void {
  root.addEventListener("pointerover", (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-tip], [data-tip-html]");
    if (!target || target === tipFor) return;
    tipFor = target;
    tipEl ??= document.body.appendChild(Object.assign(document.createElement("div"), { className: "tip", role: "tooltip" }));
    if (target.dataset.tipHtml !== undefined) tipEl.innerHTML = target.dataset.tipHtml;
    else tipEl.textContent = target.dataset.tip ?? "";
    tipEl.hidden = !(target.dataset.tipHtml || target.dataset.tip);
    place(e as PointerEvent);
  });
  root.addEventListener("pointermove", (e) => {
    if (tipFor && tipEl && !tipEl.hidden) place(e);
  });
  root.addEventListener("pointerout", (e) => {
    const to = (e as PointerEvent).relatedTarget as Node | null;
    if (tipFor && (!to || !tipFor.contains(to))) hideTip();
  });
  root.addEventListener("scroll", hideTip, { capture: true, passive: true });
}

function place(e: PointerEvent): void {
  if (!tipEl) return;
  const w = tipEl.offsetWidth;
  const h = tipEl.offsetHeight;
  let x = e.clientX + 14;
  let y = e.clientY + 16;
  if (x + w > innerWidth - 8) x = e.clientX - w - 14;
  if (y + h > innerHeight - 8) y = e.clientY - h - 12;
  tipEl.style.left = `${Math.max(8, x)}px`;
  tipEl.style.top = `${Math.max(8, y)}px`;
}

export function hideTip(): void {
  tipFor = undefined;
  if (tipEl) tipEl.hidden = true;
}

export interface ChecklistOption {
  value: string;
  label: string;
  /** Escaped HTML after the label, such as a count. */
  extra?: string;
  checked: boolean;
}

/**
 * A popover of checkboxes under `anchor`, for multi-select filters. `onChange` gets the checked
 * values after every change; the popover stays open until the user clicks outside or presses Escape.
 */
export function openChecklist(anchor: HTMLElement, o: { title: string; options: ChecklistOption[]; onChange: (values: string[]) => void; search?: boolean }): void {
  closeMenu();
  menuReturn = anchor;
  menuEl = document.createElement("div");
  menuEl.className = "menu checklist";
  menuEl.setAttribute("role", "dialog");
  menuEl.setAttribute("aria-label", o.title);
  const draw = (q = "") =>
    o.options
      .filter((opt) => !q || opt.label.toLowerCase().includes(q.toLowerCase()))
      .map((opt) => `<label class="menu-item"><span class="check"><input type="checkbox" value="${esc(opt.value)}"${opt.checked ? " checked" : ""}/><span class="check-box">${icon("check", 11)}</span></span><span class="grow clip">${esc(opt.label)}</span>${opt.extra ?? ""}</label>`)
      .join("") || '<div class="menu-label">No match</div>';
  menuEl.innerHTML = `<div class="menu-label">${esc(o.title)}</div>${o.search ? `<div style="padding:4px 4px 6px"><input class="input" type="search" placeholder="Filter" aria-label="Filter options"/></div>` : ""}<div class="checklist-items">${draw()}</div><div class="menu-sep"></div><div class="row" style="padding:2px 4px 2px"><button type="button" class="btn btn-ghost btn-sm" data-all>All</button><button type="button" class="btn btn-ghost btn-sm" data-none>None</button></div>`;
  document.body.append(menuEl);
  const rect = anchor.getBoundingClientRect();
  menuEl.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - menuEl.offsetWidth - 8))}px`;
  menuEl.style.top = `${rect.bottom + 4}px`;
  const items = menuEl.querySelector<HTMLElement>(".checklist-items")!;
  const emit = () => {
    for (const box of items.querySelectorAll<HTMLInputElement>("input")) {
      const opt = o.options.find((x) => x.value === box.value);
      if (opt) opt.checked = box.checked;
    }
    o.onChange(o.options.filter((x) => x.checked).map((x) => x.value));
  };
  items.addEventListener("change", emit);
  menuEl.querySelector("[data-all]")!.addEventListener("click", () => {
    for (const opt of o.options) opt.checked = true;
    items.innerHTML = draw(menuEl?.querySelector<HTMLInputElement>('input[type="search"]')?.value);
    o.onChange(o.options.map((x) => x.value));
  });
  menuEl.querySelector("[data-none]")!.addEventListener("click", () => {
    for (const opt of o.options) opt.checked = false;
    items.innerHTML = draw(menuEl?.querySelector<HTMLInputElement>('input[type="search"]')?.value);
    o.onChange([]);
  });
  menuEl.querySelector<HTMLInputElement>('input[type="search"]')?.addEventListener("input", (e) => (items.innerHTML = draw((e.target as HTMLInputElement).value)));
  menuEl.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
    }
  });
  (menuEl.querySelector<HTMLElement>('input[type="search"]') ?? menuEl.querySelector<HTMLElement>("input"))?.focus();
  setTimeout(() => document.addEventListener("pointerdown", outside, { capture: true }), 0);
}
