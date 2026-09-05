import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WsCDP, chromeArgs, click, evaluate, waitFor } from "./cdp.mjs";
import { startHarness } from "./harnessServer.mjs";

const harness = await startHarness();
const profile = await mkdtemp(path.join(os.tmpdir(), "awen-dock-lifecycle-"));
let browser;
try {
  browser = await WsCDP.launch(chromeArgs(profile));
  const { cdp } = browser;
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params = {}) => cdp.send(method, params, sessionId);
  const errors = [];
  cdp.on("Runtime.exceptionThrown", (data, sid) => { if (sid === sessionId) errors.push(data); });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.navigate", { url: `${harness.origin}/?r=/capabilities` });
  await waitFor(send, `!!document.querySelector('.awen-agent-fab')`, "dock trigger", 60_000);
  assert.equal(await evaluate(send, `!!document.querySelector('.awen-agent-panel')`), false);
  await click(send, ".awen-agent-fab");
  await waitFor(send, `!!document.querySelector('.awen-agent-body .cc-input')`, "embedded console", 30_000);
  await click(send, ".awen-agent-body .cc-input");
  await send("Input.insertText", { text: "保留中文草稿 🚀" });
  await evaluate(send, `(() => { window.__dockInput = document.querySelector('.awen-agent-body .cc-input'); return true; })()`);
  await click(send, ".awen-agent-head button:last-child");
  assert.equal(await evaluate(send, `getComputedStyle(document.querySelector('.awen-agent-panel')).display`), "none");
  await click(send, ".awen-agent-fab");
  assert.equal(await evaluate(send, `document.querySelector('.awen-agent-body .cc-input') === window.__dockInput`), true);
  assert.equal(await evaluate(send, `window.__dockInput.value`), "保留中文草稿 🚀");
  assert.deepEqual(errors, []);
  console.log("dock lifecycle: first open, close/reopen and Chinese draft preservation passed");
} finally {
  browser?.cdp.ws.close();
  browser?.chrome.kill("SIGTERM");
  harness.kill("SIGTERM");
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
