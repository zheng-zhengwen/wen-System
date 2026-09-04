/**
 * 服务器终端的生命周期回归测试。
 *
 * 覆盖两条真实事故：
 *   1. snapshot 回放里的设备查询会让 xterm 产生自动应答；回放期间不能把该应答
 *      当键盘输入送进 PowerShell，否则会出现 `[?1;2c`，甚至污染正在输入的命令。
 *   2. `/terminal` 是常驻板块，切走时外层宽度会变成 0；隐藏期间不能 fit 到两列
 *      并把这个尺寸发给 ConPTY，否则切回来后每行只剩两三个字符。
 *
 * 跑的是真实 <App/> + 真实 TerminalLivePane，只把 HTTP 与终端 WebSocket 换成假的。
 *
 * 跑：node e2e/terminal-runtime.mjs
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { WsCDP, chromeArgs, click, delay, evaluate, waitFor } from "./cdp.mjs";
import { startHarness } from "./harnessServer.mjs";

async function run() {
  const harness = await startHarness();
  const origin = harness.origin;
  const profile = await mkdtemp(path.join(os.tmpdir(), "awen-terminal-runtime-profile-"));
  const { cdp, chrome } = await WsCDP.launch(chromeArgs(profile));
  try {
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const send = (method, params = {}) => cdp.send(method, params, sessionId);
    const errors = [];
    cdp.on("Runtime.exceptionThrown", (params, s) => {
      if (s === sessionId) errors.push(params.exceptionDetails?.text || "browser exception");
    });
    await Promise.all([send("Page.enable"), send("Runtime.enable")]);
    await send("Emulation.setDeviceMetricsOverride",
               { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    // 在任何产品脚本加载前装入一个最小 WebSocket。连接后立即回放带 DA 查询的
    // snapshot；xterm 会自动生成 ESC[?1;2c，这正是事故里的那段伪输入。
    await send("Page.addScriptToEvaluateOnNewDocument", { source: `
      (() => {
        class TerminalMockWebSocket {
          static CONNECTING = 0;
          static OPEN = 1;
          static CLOSING = 2;
          static CLOSED = 3;
          constructor(url) {
            this.url = url;
            this.readyState = TerminalMockWebSocket.CONNECTING;
            window.__terminalSent = [];
            window.__terminalSocket = this;
            setTimeout(() => {
              this.readyState = TerminalMockWebSocket.OPEN;
              this.onopen?.({ type: "open" });
              setTimeout(() => this.emit({ type: "snapshot", data: "\\u001b[cWindows PowerShell\\r\\nPS C:\\\\> " }), 20);
            }, 0);
          }
          send(data) { window.__terminalSent.push(JSON.parse(String(data))); }
          emit(payload) { this.onmessage?.({ data: JSON.stringify(payload) }); }
          close() {
            this.readyState = TerminalMockWebSocket.CLOSED;
            this.onclose?.({ type: "close" });
          }
        }
        window.WebSocket = TerminalMockWebSocket;
      })();
    ` });

    await send("Page.navigate", { url: `${origin}/?r=/terminal` });
    await waitFor(send, `!!document.querySelector(".xterm-screen")`, "终端画布", 60_000);
    await delay(500);

    const snapshotInputs = await evaluate(send,
      `window.__terminalSent.filter((m) => m.type === "input").map((m) => m.data)`);
    assert.deepEqual(snapshotInputs, [],
      `snapshot 回放不能产生伪键盘输入：${JSON.stringify(snapshotInputs)}`);

    // 不能把所有协议应答一刀切掉：来自实时 output 的 DA 查询仍然需要正常回给
    // 正在运行的 TUI/终端程序。空 snapshot 的回调也必须恢复转发状态。
    await evaluate(send, `window.__terminalSent.length = 0; window.__terminalSocket.emit({type:"snapshot", data:""})`);
    await delay(50);
    await evaluate(send, `window.__terminalSocket.emit({type:"output", data:"\\u001b[c"})`);
    await waitFor(send,
      `window.__terminalSent.some((m) => m.type === "input" && m.data.includes("[?1;2c"))`,
      "实时设备查询应答", 5_000);

    const visibleWidth = await evaluate(send,
      `parseFloat(document.querySelector(".xterm-screen").style.width) || 0`);
    assert.ok(visibleWidth > 100, `终端可见时画布宽度异常：${visibleWidth}`);

    await click(send, `a[href='/console']`);
    await waitFor(send, `location.pathname === "/console"`, "切到任务台", 15_000);
    await delay(500);
    const hidden = await evaluate(send, `(() => {
      const host = document.querySelector(".cli-host");
      const screen = document.querySelector(".xterm-screen");
      return {
        hostWidth: host.getBoundingClientRect().width,
        canvasWidth: parseFloat(screen.style.width) || 0,
        resizeMessages: window.__terminalSent.filter((m) => m.type === "resize"),
      };
    })()`);
    assert.equal(hidden.hostWidth, 0, "测试前提：常驻终端切走后宿主宽度应为 0");
    assert.ok(hidden.canvasWidth > 100,
      `隐藏时不能把 xterm fit 到两列：${JSON.stringify(hidden)}`);
    assert.ok(!hidden.resizeMessages.some((m) => Number(m.cols) <= 2),
      `隐藏时不能向后端发送两列尺寸：${JSON.stringify(hidden.resizeMessages)}`);

    assert.deepEqual(errors, [], "页面不能抛异常");
    process.stdout.write("terminal runtime checks passed\n");
  } finally {
    chrome.kill("SIGKILL");
    harness.kill("SIGTERM");
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

await run();
