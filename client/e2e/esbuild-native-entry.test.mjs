import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// npm installs esbuild/bin/esbuild as native ELF/Mach-O on Unix, but leaves a
// JavaScript wrapper on Windows. Substitute a real native executable only when
// a test tries to feed that CLI entry to Node, reproducing the CI failure on any OS.
// The preload is isolated in each child; installed dependencies remain untouched.
const nativeEntry = "data:text/javascript," + encodeURIComponent(`
  import cp from "node:child_process";
  import { syncBuiltinESMExports } from "node:module";
  const original = cp.spawnSync;
  cp.spawnSync = (command, args, options) => {
    if (command === process.execPath && String(args?.[0]).replaceAll("\\\\", "/").endsWith("/esbuild/bin/esbuild")) {
      return original(command, [process.execPath, ...args.slice(1)], options);
    }
    return original(command, args, options);
  };
  syncBuiltinESMExports();
`);
const cwd = fileURLToPath(new URL("../", import.meta.url));

for (const script of ["approval-modes.mjs", "turn-stats.mjs", "session-restore.mjs"]) {
  test(`${script} works with a native esbuild CLI entry`, () => {
    const result = spawnSync(process.execPath, ["--import", nativeEntry, path.join(cwd, "e2e", script)], {
      cwd, encoding: "utf8", timeout: 30_000, windowsHide: true,
    });
    assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  });
}
