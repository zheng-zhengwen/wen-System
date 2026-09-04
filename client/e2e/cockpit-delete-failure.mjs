/** 删除接口失败时，监控项必须留在页面上，不能制造“看起来已删除”的假象。 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { WsCDP, chromeArgs, evaluate, waitFor } from "./cdp.mjs";
import { startHarness } from "./harnessServer.mjs";

async function run() {
  const harness = await startHarness();
  const profile = await mkdtemp(path.join(os.tmpdir(), "awen-cockpit-delete-profile-"));
  const { cdp, chrome } = await WsCDP.launch(chromeArgs(profile));
  try {
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const send = (method, params = {}) => cdp.send(method, params, sessionId);
    await Promise.all([send("Page.enable"), send("Runtime.enable")]);
    await send("Page.navigate", {
      url: `${harness.origin}/?r=/dashboard&tab=competitor&homeDeleteErr=1`,
    });
    await waitFor(send, `document.querySelectorAll('.asin-card').length === 1`, "竞品卡片", 60_000);
    await evaluate(send, `document.querySelector('.asin-card button[title="移除"]').click()`);
    await waitFor(send, `document.body.innerText.includes('模拟删除失败')`, "删除失败提示", 10_000);
    const after = await evaluate(send, `document.querySelectorAll('.asin-card').length`);
    assert.equal(after, 1, "服务端删除失败时前端不能移除卡片");
    process.stdout.write("cockpit delete failure check passed\n");
  } finally {
    chrome.kill("SIGKILL");
    harness.kill("SIGTERM");
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

await run();
