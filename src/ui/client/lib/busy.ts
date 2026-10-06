import { toast } from "../ui/overlays.js";

/** Runs `work` with the button shown as busy; a failure becomes a toast and resolves to undefined. */
export async function busy<T>(el: HTMLElement | undefined, work: () => Promise<T>): Promise<T | undefined> {
  if (el?.classList.contains("is-busy")) return undefined;
  el?.classList.add("is-busy");
  el?.setAttribute("aria-busy", "true");
  try {
    return await work();
  } catch (err) {
    toast((err as Error).message, "bad");
    return undefined;
  } finally {
    el?.classList.remove("is-busy");
    el?.removeAttribute("aria-busy");
  }
}
