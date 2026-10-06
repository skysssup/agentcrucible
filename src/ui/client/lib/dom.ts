/** Small DOM helpers: clipboard, downloads, and reading files the user picks. */
import { toast } from "../ui/overlays.js";

/** Copies text and briefly shows "Copied" on the control that asked. */
export async function copy(text: string, el?: HTMLElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    toast("The browser did not allow copying to the clipboard.", "bad");
    return;
  }
  if (!el) return void toast("Copied to the clipboard.", "ok", { ms: 2000 });
  const label = el.querySelector("span:not(.sr-only)") ?? (el.matches(".icon-btn, .btn-icon") ? null : el);
  el.classList.add("copied");
  if (label) {
    const before = label.textContent;
    label.textContent = "Copied";
    setTimeout(() => {
      label.textContent = before;
      el.classList.remove("copied");
    }, 1300);
  } else {
    toast("Copied to the clipboard.", "ok", { ms: 2000 });
    el.classList.remove("copied");
  }
}

export function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Lets the user pick a file and resolves with its text, or undefined when they cancel. */
export function pickFile(accept: string): Promise<{ name: string; text: string } | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      resolve(file ? { name: file.name, text: await file.text() } : undefined);
    });
    input.addEventListener("cancel", () => resolve(undefined));
    input.click();
  });
}

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const MOD = isMac ? "⌘" : "Ctrl";
