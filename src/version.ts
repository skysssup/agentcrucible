import { createRequire } from "node:module";

/** Version of the installed package, read from the package.json next to `src/` or `dist/`. */
export const VERSION: string = (createRequire(import.meta.url)("../package.json") as { version: string }).version;
