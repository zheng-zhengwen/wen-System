import assert from "node:assert/strict";
import { build } from "esbuild";

// Inspect actual bundle dependency edges: the initial dock chunk must not carry
// Console. CSS order stays owned by Vite; no generated files are needed here.
const result = await build({
  entryPoints: ["src/components/awenAgentDock.tsx"], bundle: true,
  format: "esm", splitting: true, metafile: true, write: false,
  outdir: "unused-lazy-dock-check", packages: "external", external: ["*.css"],
  logLevel: "silent",
});
const entry = Object.values(result.metafile.outputs).find(
  (out) => out.entryPoint === "src/components/awenAgentDock.tsx");
assert.ok(entry);
const visited = new Set();
function visit(out) {
  if (!out || visited.has(out)) return;
  visited.add(out);
  for (const item of out.imports) {
    if (!item.external && item.kind === "import-statement") visit(result.metafile.outputs[item.path]);
  }
}
visit(entry);
assert.ok(![...visited].some((out) => Object.keys(out.inputs).some(
  (name) => name.endsWith("/workbench/Console.tsx"))),
  "Console must not be eagerly bundled into the always-mounted dock (including shared chunks)");
assert.ok([...visited].some((out) => out.imports.some((item) => item.kind === "dynamic-import")));
console.log("lazy dock bundle contract passed");
