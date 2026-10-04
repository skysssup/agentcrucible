#!/usr/bin/env node
// Runs the commands in README.md and docs/examples.md against the built CLI and checks that
// every line of the output shown after a command block appears in the real output.
// Commands that need the network (npm install, git clone) or a file the reader creates are skipped.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "dist", "cli.js");
let failures = 0;
let checked = 0;

for (const doc of ["README.md", "docs/examples.md"]) {
  const blocks = [...readFileSync(join(root, doc), "utf8").matchAll(/```(\w+)\n([\s\S]*?)```/g)].map((m) => ({ lang: m[1], body: m[2] }));
  blocks.forEach((block, i) => {
    // The scenario-authoring block needs files the reader creates; it is checked separately below.
    if (block.lang !== "bash" || block.body.includes("my-scenarios")) return;
    const commands = block.body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^(npx )?agentcrucible /.test(line) || line.startsWith("node dist/cli.js "));
    if (commands.length === 0) return;
    const cwd = mkdtempSync(join(tmpdir(), "agentcrucible-docs-"));
    let output = "";
    for (const command of commands) {
      const args = command.replace(/^(npx )?agentcrucible |^node dist\/cli\.js /, "").match(/"[^"]*"|\S+/g).map((a) => a.replace(/^"|"$/g, ""));
      const r = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
      output += r.stdout + r.stderr;
      checked++;
      if (r.status === 1) {
        console.log(`FAIL ${doc}: "${command}" exited 1\n${r.stderr}`);
        failures++;
      }
    }
    rmSync(cwd, { recursive: true, force: true });
    const shown = blocks[i + 1];
    if (shown?.lang !== "text") return;
    for (const line of shown.body.split("\n").filter((l) => l.trim())) {
      if (!output.includes(line)) {
        console.log(`FAIL ${doc}: output of "${commands.join(" && ")}" lacks:\n     ${line}`);
        failures++;
      }
    }
  });
}

const readmeYaml = readFileSync(join(root, "README.md"), "utf8").match(/```yaml\n([\s\S]*?)```/)[1];
const cwd = mkdtempSync(join(tmpdir(), "agentcrucible-docs-"));
spawnSync("mkdir", ["-p", join(cwd, "my-scenarios")]);
writeFileSync(join(cwd, "my-scenarios", "order-confirmation.yaml"), readmeYaml);
writeFileSync(join(cwd, ".agentcrucible.json"), JSON.stringify({ scenarioDirs: ["my-scenarios"] }));
for (const [args, status] of [[["check", "--scenario", "custom/order-confirmation"], 0], [["run", "--scenario", "custom/order-confirmation", "--agent", "naive-retry"], 2]]) {
  const r = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });
  checked++;
  if (r.status !== status) {
    console.log(`FAIL README scenario: agentcrucible ${args.join(" ")} exited ${r.status}, expected ${status}\n${r.stdout}${r.stderr}`);
    failures++;
  }
}
rmSync(cwd, { recursive: true, force: true });

console.log(failures ? `${failures} documentation check(s) failed (${checked} commands run)` : `Documentation commands and outputs match (${checked} commands run)`);
process.exitCode = failures ? 1 : 0;
