/**
 * Functions the app shell provides to pages, set when the app starts. Pages import this module
 * instead of the app, so the app can import every page without an import cycle.
 */
export const runtime = {
  /** Draws the current page again with fresh data, keeping the scroll position. */
  rerender: async (): Promise<void> => {},
  /** Goes to a hash route. */
  navigate: (hash: string): void => {
    location.hash = hash;
  },
  /** Refreshes the sidebar counts, the notification badge, and the jobs indicator. */
  refreshShell: (): void => {},
  /** Opens the global search, optionally with a query and a scope. */
  openSearch: (_q?: string, _scope?: string): void => {},
  /** Tells the app which data changed, so the page on screen can redraw if it shows it. */
  changed: (_names: string[]): void => {},
};

/** Replaces the inner HTML of the element with `id`, if it is on the page. */
export function patch(id: string, html: string): void {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}
