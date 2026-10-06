/** The navigation model: sidebar groups, keyboard keys, and the contract every page implements. */
import type { IconName } from "./icons.js";

export interface Ctx {
  route: string;
  arg?: string;
  query: URLSearchParams;
}

export interface Page {
  /** The sidebar entry the page belongs to. */
  nav: string;
  /** The last breadcrumb and the document title. */
  title: (ctx: Ctx) => string;
  /** The skeleton shown while `render` waits for data. */
  skeleton?: "dashboard" | "table" | "detail";
  render: (ctx: Ctx) => Promise<string> | string;
  /** Runs after the page's HTML is in the document. */
  mount?: (ctx: Ctx) => void;
  /** Runs before another page replaces this one. */
  unmount?: () => void;
  /** Handlers for data-action clicks inside the page. */
  actions?: Record<string, (el: HTMLElement, ev: Event) => unknown>;
  /** Handlers for input and change events of elements with data-input. */
  inputs?: Record<string, (el: HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement, ev: Event) => unknown>;
  /** Handlers for forms with data-submit. */
  submit?: Record<string, (form: HTMLFormElement, ev: SubmitEvent) => unknown>;
  /** Single-key shortcuts while the page is shown; return true when handled. */
  keys?: (e: KeyboardEvent) => boolean;
  /** When any of these change (a job finished, a notification arrived), the page is drawn again. */
  watches?: Array<"runs" | "reports" | "notifications" | "activity" | "sweeps" | "scenarios" | "baseline" | "profile">;
  /** A wider page without the max width. */
  wide?: boolean;
}

export interface NavItem {
  route: string;
  label: string;
  icon: IconName;
  /** The key after G that jumps here. */
  key: string;
  /** Which count the sidebar shows beside the entry. */
  count?: "scenarios" | "runs" | "reports" | "sweeps" | "agents";
}

export const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Workspace",
    items: [
      { route: "", label: "Command center", icon: "dashboard", key: "o" },
      { route: "analytics", label: "Analytics", icon: "barChart", key: "y" },
      { route: "activity", label: "Activity", icon: "activity", key: "l" },
    ],
  },
  {
    label: "Design",
    items: [
      { route: "scenarios", label: "Scenarios", icon: "layers", key: "s", count: "scenarios" },
      { route: "editor", label: "Editor", icon: "code", key: "e" },
      { route: "coverage", label: "Coverage", icon: "shieldCheck", key: "v" },
      { route: "catalog", label: "Catalog", icon: "book", key: "c" },
    ],
  },
  {
    label: "Execute",
    items: [
      { route: "runs", label: "Runs", icon: "runs", key: "r", count: "runs" },
      { route: "sweep", label: "Sweeps", icon: "grid", key: "w", count: "sweeps" },
      { route: "demo", label: "Guided demo", icon: "spark", key: "d" },
    ],
  },
  {
    label: "Results",
    items: [
      { route: "reports", label: "Reports", icon: "file", key: "p", count: "reports" },
      { route: "agents", label: "Agents", icon: "bot", key: "a", count: "agents" },
      { route: "baseline", label: "Baseline", icon: "compare", key: "b" },
    ],
  },
];

export const SETTINGS_NAV: NavItem = { route: "settings", label: "Settings", icon: "settings", key: "," };

export const ALL_NAV: NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), SETTINGS_NAV];

/** The five destinations of the phone tab bar. */
export const TABBAR: NavItem[] = [ALL_NAV[0], ALL_NAV.find((n) => n.route === "scenarios")!, ALL_NAV.find((n) => n.route === "runs")!, ALL_NAV.find((n) => n.route === "reports")!];

export function parseHash(hash: string): Ctx {
  const [path, query = ""] = hash.replace(/^#\/?/, "").split("?");
  const [route, ...rest] = path.split("/");
  const arg = rest.length && rest.join("/") ? decodeURIComponent(rest.join("/")) : undefined;
  return { route, query: new URLSearchParams(query), ...(arg !== undefined ? { arg } : {}) };
}
