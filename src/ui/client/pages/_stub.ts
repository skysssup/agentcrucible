/** A placeholder page used while a page is being built. */
import type { Page } from "../routes.js";
import { emptyState, pageHead } from "../ui/layout.js";

export function stubPage(nav: string, title: string): Page {
  return {
    nav,
    title: (ctx) => ctx.arg ?? title,
    render: (ctx) => `<div class="page">${pageHead({ title: ctx.arg ?? title })}${emptyState({ icon: "inbox", title: `${title} is being built` })}</div>`,
  };
}
