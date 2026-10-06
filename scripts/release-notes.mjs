#!/usr/bin/env node
// Prints the CHANGELOG.md section for a version, for the GitHub release body.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2];
if (!version) {
  console.error("usage: release-notes.mjs <version>");
  process.exit(1);
}
const changelog = readFileSync(join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "CHANGELOG.md"), "utf8");
const match = new RegExp(`^## ${version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n([\\s\\S]*?)(?=^## |\\s*$(?![\\s\\S]))`, "m").exec(changelog);
if (!match) {
  console.error(`CHANGELOG.md has no "## ${version}" section`);
  process.exit(1);
}
process.stdout.write(`${match[1].trim()}\n`);
