import { parse } from "yaml";
import { builtinRegistry } from "../src/registry.js";
import { parseScenario } from "../src/scenarios.js";
import { TEMPLATES, outline, gapDraft, snippetEdit, snippetLines, applyEdit, SNIPPETS } from "../src/ui/client/lib/draft.js";

const registry = builtinRegistry();
const worlds = [...registry.worlds].map(([name, e]) => { const w = e.value(); return { name, description: w.description, source: e.source, tools: w.tools.map((t) => ({ name: t.name, description: t.description, mutating: t.mutating, inputSchema: t.inputSchema, outputSchema: t.outputSchema ?? null })), records: w.recordFields }; });
const faults = [...registry.faults].map(([kind, e]) => ({ kind, stage: e.value.stage, description: e.value.description, params: Object.keys(e.value.params?.properties ?? {}), required: (e.value.params?.required as string[] | undefined) ?? [], source: e.source }));
const meta = { worlds, faults } as never;
let bad = 0;
for (const w of worlds) for (const t of w.tools) for (const f of faults) {
  const text = gapDraft(meta, w.name, t.name, f.kind);
  try { parseScenario(parse(text), "gap", registry); } catch (e) { bad++; console.log("GAP FAIL", w.name, t.name, f.kind, (e as Error).message); }
}
console.log("gap drafts checked, failures:", bad);
console.log(gapDraft(meta, "payments", "get_refund", "stale_cache"));
console.log(gapDraft(meta, "tickets", "update_ticket", "duplicate_delivery"));
for (const t of TEMPLATES) {
  for (const s of SNIPPETS) {
    const lines = snippetLines(s.kind, t.text, worlds as never, faults.map((f) => f.kind));
    const e = snippetEdit(t.text, s.kind, lines);
    if (!e) { console.log("NO EDIT", t.name, s.kind); continue; }
    const next = applyEdit(t.text, e);
    try { parseScenario(parse(next), "snip", registry); } catch (err) { console.log("SNIPPET FAIL", t.name, s.kind, (err as Error).message); console.log(next); }
  }
}
const gap = gapDraft(meta, "payments", "get_refund", "stale_cache");
let g = gap;
for (const s of SNIPPETS) { const e = snippetEdit(g, s.kind, snippetLines(s.kind, g, worlds as never, faults.map((f) => f.kind)))!; g = applyEdit(g, e); }
console.log("--- gap + all snippets\n" + g);
try { parseScenario(parse(g), "gap+", registry); console.log("gap+snippets parses"); } catch (err) { console.log("FAIL", (err as Error).message); }
console.log(JSON.stringify(outline(TEMPLATES[3].text), null, 0));
