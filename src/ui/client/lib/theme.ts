/** Applies the appearance preferences (theme, density, sidebar, motion) to the document. */
import { setTimeStyle } from "./format.js";
import { savePrefs, store, type Theme } from "./state.js";

export function applyTheme(): void {
  const root = document.documentElement;
  const { theme, density, sidebar, motion, time } = store.prefs;
  setTimeStyle(time);
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  if (density === "compact") root.dataset.density = "compact";
  else delete root.dataset.density;
  if (sidebar === "collapsed") root.dataset.sidebar = "collapsed";
  else delete root.dataset.sidebar;
  if (motion === "reduce") root.dataset.motion = "reduce";
  else delete root.dataset.motion;
}

export function setTheme(theme: Theme): void {
  savePrefs({ theme });
  applyTheme();
}

/** True when the page shows the dark theme, whether forced or from the system. */
export function isDark(): boolean {
  return store.prefs.theme === "dark" || (store.prefs.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
}
