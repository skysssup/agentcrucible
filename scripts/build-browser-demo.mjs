import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { findScenarios } from "../dist/index.js";

const root = fileURLToPath(new URL("..", import.meta.url));
execFileSync(process.execPath, [fileURLToPath(new URL("../node_modules/tsup/dist/cli-default.js", import.meta.url)), "src/browser-refund.ts", "--format", "esm", "--platform", "browser", "--target", "es2022", "--outDir", "dist/demo", "--minify"], { cwd: root, stdio: "inherit" });
mkdirSync(new URL("../dist/demo/", import.meta.url), { recursive: true });
const scenario = { ...findScenarios({ id: "payments/timeout-after-commit" })[0], source: "scenarios/payments/timeout-after-commit.yaml" };
writeFileSync(new URL("../dist/demo/refund-scenario.json", import.meta.url), JSON.stringify(scenario, null, 2) + "\n");
