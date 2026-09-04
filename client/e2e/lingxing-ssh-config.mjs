/**
 * 领星 SSH 跳板配置页回归：真实 App/表单，只替换 HTTP 层。
 *
 * 保证空配置明确显示直连，四项输入能原样进入设置请求（尤其密码中的 @），
 * 且密码框不会以明文回显。
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { WsCDP, chromeArgs, click, evaluate, waitFor } from "./cdp.mjs";
import { startHarness } from "./harnessServer.mjs";

async function run() {
  const harness = await startHarness();
  const profile = await mkdtemp(path.join(os.tmpdir(), "awen-lingxing-ssh-profile-"));
  const { cdp, chrome } = await WsCDP.launch(chromeArgs(profile));
  try {
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const send = (method, params = {}) => cdp.send(method, params, sessionId);
    const errors = [];
    cdp.on("Runtime.exceptionThrown", (params, sid) => {
      if (sid === sessionId) errors.push(params.exceptionDetails?.text || "browser exception");
    });
    await Promise.all([send("Page.enable"), send("Runtime.enable")]);
    await send("Emulation.setDeviceMetricsOverride",
      { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", {
      url: `${harness.origin}/?r=/dashboard&tab=ads&panel=config`,
    });
    await waitFor(send, `!!document.querySelector('[data-testid="lingxing-ssh-host"]')`,
      "SSH 跳板表单", 60_000);

    const initial = await evaluate(send, `({
      status: document.querySelector('[data-testid="lingxing-ssh-status"]').textContent,
      passwordType: document.querySelector('[data-testid="lingxing-ssh-password"]').type,
      passwordValue: document.querySelector('[data-testid="lingxing-ssh-password"]').value,
    })`);
    assert.match(initial.status, /直接连接/);
    assert.equal(initial.passwordType, "password");
    assert.equal(initial.passwordValue, "");

    // 部分配置必须在前端就拦住，不能发一个看似保存成功、实际仍直连的请求。
    await evaluate(send, `(() => {
      const el = document.querySelector('[data-testid="lingxing-ssh-host"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'jump-only.test');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      window.__lastSettingsPatch = null;
    })()`);
    await click(send, `[data-testid='lingxing-ssh-save'] button`);
    assert.equal(await evaluate(send, `window.__lastSettingsPatch`), null);
    assert.match(await evaluate(send, `document.body.innerText`), /配置不完整/);

    await evaluate(send, `(() => {
      const set = (id, value) => {
        const el = document.querySelector('[data-testid="' + id + '"]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set('lingxing-ssh-host', '203.0.113.10');
      set('lingxing-ssh-port', '22');
      set('lingxing-ssh-user', 'proxy-user');
      set('lingxing-ssh-password', 'safe-P@ss-word');
    })()`);
    await click(send, `[data-testid='lingxing-ssh-save'] button`);
    await waitFor(send, `!!window.__lastSettingsPatch`, "SSH 配置保存请求", 10_000);
    const patch = await evaluate(send, `window.__lastSettingsPatch`);
    assert.deepEqual(patch.settings, {
      lingxing_ssh_host: "203.0.113.10",
      lingxing_ssh_user: "proxy-user",
      lingxing_ssh_port: 22,
      lingxing_ssh_password: "safe-P@ss-word",
    });

    // 假后端 reload 后仍返回空配置；全空保存就是明确的“恢复直连”请求。
    await waitFor(send,
      `document.querySelector('[data-testid="lingxing-ssh-host"]').value === ""`,
      "保存后重新载入", 10_000);
    await evaluate(send, `window.__lastSettingsPatch = null`);
    await click(send, `[data-testid='lingxing-ssh-save'] button`);
    await waitFor(send, `!!window.__lastSettingsPatch`, "清除 SSH 配置请求", 10_000);
    const cleared = await evaluate(send, `window.__lastSettingsPatch.settings`);
    assert.deepEqual(cleared, {
      lingxing_ssh_host: "", lingxing_ssh_user: "", lingxing_ssh_password: "",
      lingxing_ssh_port: 22, lingxing_ssh_host_key: "",
    });
    assert.deepEqual(errors, [], "页面不能抛异常");
    process.stdout.write("lingxing ssh config checks passed\n");
  } finally {
    chrome.kill("SIGKILL");
    harness.kill("SIGTERM");
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

await run();
