#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const result = spawnSync(process.execPath, [join(scriptsDir, "check-errtext.mjs")], {
  cwd: join(scriptsDir, ".."),
  encoding: "utf8",
});

assert.equal(result.status, 0, result.stderr || result.stdout);
assert.match(result.stdout, /没有直接读 detail/);
console.log("check-errtext path regression test passed");
