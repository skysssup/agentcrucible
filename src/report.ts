import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { BOLD, DIM, RESET, verdictColor } from "./verdict.js";
import { isCritical } from "./verdict.js";
import type { RunReport } from "./types.js";

export function printReport(report: RunReport): void {
  const vColor = verdictColor(report.aggregateVerdict);
  console.log();
  console.log(`${BOLD}AgentCrucible${RESET} · ${report.scenarioId}`);
  console.log(`${DIM}world=${report.world ?? "?"}  agent=${report.agentId}  seed=${report.seed}  trials=${report.stats.total}  ${report.durationMs}ms${RESET}`);
  console.log();
  console.log(
    `Aggregate verdict: ${vColor}${BOLD}${report.aggregateVerdict}${RESET}`
  );
  console.log(`${DIM}${report.trials[0]?.reason ?? ""}${RESET}`);
  console.log();

  // Verdict histogram
  console.log("Trial breakdown:");
  for (const [verdict, n] of Object.entries(report.stats.byVerdict)) {
    if (n === 0) continue;
    const bar = "█".repeat(Math.max(1, Math.round((n / report.stats.total) * 20)));
    console.log(
      `  ${verdictColor(verdict as never)}${verdict.padEnd(16)}${RESET} ${String(n).padStart(3)}  ${bar}`
    );
  }
  console.log();
  console.log(
    `Flaky rate: ${(report.stats.flakyRate * 100).toFixed(1)}% · Critical rate ≥95% lower bound: ${(report.stats.criticalRateLower95 * 100).toFixed(1)}%`
  );

  // Evidence from first worst trial
  const worst = [...report.trials].sort((a, b) => {
    const order = ["HARMFUL_ACTION", "SILENT_FAILURE", "DEGRADED", "SAFE_FAILURE", "SAFE_SUCCESS"];
    return order.indexOf(a.verdict) - order.indexOf(b.verdict);
  })[0];

  if (worst) {
    console.log();
    console.log(`${BOLD}Evidence (trial ${worst.trace.trialIndex})${RESET}`);
    for (const f of worst.findings.slice(0, 5)) {
      console.log(`  • [${f.verdict}] ${f.rule}`);
      console.log(`    ${f.reason}`);
      for (const e of f.evidence) {
        console.log(`    ${DIM}↳ ${e.kind}: ${e.summary}${RESET}`);
        if (e.callIds?.length) {
          console.log(`      calls: ${e.callIds.join(", ")}`);
        }
      }
    }

    console.log();
    console.log(`${BOLD}Tool timeline${RESET}`);
    for (const c of worst.trace.calls) {
      const flag = c.faultApplied ? ` FAULT=${c.faultApplied}` : "";
      const commit = c.committed ? "committed" : "no-commit";
      const obs = c.observed.ok ? "ok" : `err:${c.observed.error}`;
      console.log(
        `  ${c.id}  ${c.tool}#${c.callIndex}  ${commit}  observed=${obs}${flag}`
      );
    }

    console.log();
    console.log(`${BOLD}Final answer${RESET}`);
    console.log(`  ${worst.trace.finalAnswer}`);
  }
  console.log();
}

export function writeJsonReport(report: RunReport, outDir: string): string {
  mkdirSync(outDir, { recursive: true });
  const safe = report.scenarioId.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const path = join(outDir, `${safe}.report.json`);
  writeFileSync(path, JSON.stringify(report, null, 2));
  return path;
}

export function writeHtmlReport(report: RunReport, outDir: string): string {
  mkdirSync(outDir, { recursive: true });
  const safe = report.scenarioId.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const path = join(outDir, `${safe}.report.html`);
  const order = ["HARMFUL_ACTION", "SILENT_FAILURE", "DEGRADED", "SAFE_FAILURE", "SAFE_SUCCESS"];
  const worst = [...report.trials].sort(
    (a, b) => order.indexOf(a.verdict) - order.indexOf(b.verdict),
  )[0];
  const rows = (worst?.trace.calls ?? [])
    .map((c) => {
      const obs = c.observed.ok
        ? `<code>${escapeHtml(JSON.stringify(c.observed.result))}</code>`
        : `<span class="err">${escapeHtml(c.observed.error)}</span>`;
      return `<tr>
        <td>${c.id}</td>
        <td>${c.tool}#${c.callIndex}</td>
        <td>${c.committed ? "yes" : "no"}</td>
        <td>${c.faultApplied ?? "—"}</td>
        <td>${obs}</td>
      </tr>`;
    })
    .join("\n");

  const findings = (worst?.findings ?? [])
    .map(
      (f) => `<li class="v-${f.verdict}"><strong>${f.verdict}</strong> <code>${f.rule}</code>
        <div>${escapeHtml(f.reason)}</div>
        <ul>${f.evidence.map((e) => `<li>${escapeHtml(e.kind)}: ${escapeHtml(e.summary)}</li>`).join("")}</ul>
      </li>`
    )
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>AgentCrucible — ${escapeHtml(report.scenarioId)}</title>
<style>
  :root { color-scheme: dark; --bg:#0b0f14; --panel:#121821; --ink:#e7ecf3; --mute:#8b98a8; --hairline:#1e2633;
    --harm:#ff4d6a; --silent:#c084fc; --degraded:#f5a623; --safe-fail:#38bdf8; --ok:#34d399; }
  body { margin:0; font:14px/1.5 ui-sans-serif,system-ui,sans-serif; background:var(--bg); color:var(--ink); }
  main { max-width:960px; margin:0 auto; padding:32px 20px 64px; }
  h1 { font-size:22px; letter-spacing:-0.02em; margin:0 0 4px; }
  .meta { color:var(--mute); margin-bottom:24px; }
  .badge { display:inline-block; padding:4px 10px; border-radius:999px; font-weight:600; font-size:12px; }
  .HARMFUL_ACTION { background:var(--harm); color:#14040a; }
  .SILENT_FAILURE { background:var(--silent); color:#1a0a24; }
  .DEGRADED { background:var(--degraded); color:#1a1000; }
  .SAFE_FAILURE { background:var(--safe-fail); color:#041018; }
  .SAFE_SUCCESS { background:var(--ok); color:#04140e; }
  .panel { background:var(--panel); border:1px solid var(--hairline); border-radius:12px; padding:16px 18px; margin:16px 0; }
  table { width:100%; border-collapse:collapse; }
  th,td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--hairline); vertical-align:top; }
  th { color:var(--mute); font-weight:500; font-size:12px; text-transform:uppercase; letter-spacing:0.04em; }
  code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; }
  .err { color:var(--harm); }
  .answer { white-space:pre-wrap; background:#0a0e14; border-radius:8px; padding:12px; }
  ol.findings { padding-left:18px; }
  .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px; }
  .stat { background:#0a0e14; border-radius:8px; padding:12px; }
  .stat .n { font-size:22px; font-weight:600; }
  .stat .l { color:var(--mute); font-size:12px; }
</style>
</head>
<body>
<main>
  <h1>AgentCrucible report</h1>
  <div class="meta">${escapeHtml(report.scenarioId)} · agent <code>${escapeHtml(report.agentId)}</code> · seed <code>${escapeHtml(report.seed)}</code></div>
  <div><span class="badge ${report.aggregateVerdict}">${report.aggregateVerdict}</span></div>

  <div class="panel stats">
    <div class="stat"><div class="n">${report.stats.total}</div><div class="l">Trials</div></div>
    <div class="stat"><div class="n">${(report.stats.flakyRate * 100).toFixed(0)}%</div><div class="l">Flaky rate</div></div>
    <div class="stat"><div class="n">${(report.stats.criticalRateLower95 * 100).toFixed(0)}%</div><div class="l">Critical ≥95% lo</div></div>
    <div class="stat"><div class="n">${report.durationMs}ms</div><div class="l">Duration</div></div>
  </div>

  <div class="panel">
    <h2>Findings</h2>
    <ol class="findings">${findings || "<li>None</li>"}</ol>
  </div>

  <div class="panel">
    <h2>Tool timeline</h2>
    <table>
      <thead><tr><th>ID</th><th>Tool</th><th>Committed</th><th>Fault</th><th>Observed</th></tr></thead>
      <tbody>${rows || "<tr><td colspan=5>No calls</td></tr>"}</tbody>
    </table>
  </div>

  <div class="panel">
    <h2>Final answer</h2>
    <div class="answer">${escapeHtml(worst?.trace.finalAnswer ?? "")}</div>
  </div>
</main>
</body>
</html>`;
  writeFileSync(path, html);
  return path;
}

export function writeJUnitReport(report: RunReport, outDir: string): string {
  mkdirSync(outDir, { recursive: true });
  const safe = report.scenarioId.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const path = join(outDir, `${safe}.junit.xml`);
  const failures = report.trials.filter((t) => isCritical(t.verdict));
  const cases = report.trials
    .map((t, i) => {
      const name = `${report.scenarioId}::trial${i}`;
      if (isCritical(t.verdict)) {
        return `<testcase classname="agentcrucible.${escapeXml(report.world ?? "world")}" name="${escapeXml(name)}" time="0">
  <failure message="${escapeXml(t.verdict)}">${escapeXml(t.reason)}</failure>
</testcase>`;
      }
      return `<testcase classname="agentcrucible.${escapeXml(report.world ?? "world")}" name="${escapeXml(name)}" time="0"/>`;
    })
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="agentcrucible.${escapeXml(report.scenarioId)}" tests="${report.trials.length}" failures="${failures.length}" time="${(report.durationMs / 1000).toFixed(3)}">
${cases}
</testsuite>
`;
  writeFileSync(path, xml);
  return path;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeXml(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
