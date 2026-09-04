/**
 * 运营驾驶舱回归：没有选择店铺时不取广告，选择后只取该店，深链标签必须可见。
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { WsCDP, chromeArgs, click, evaluate, waitFor } from "./cdp.mjs";
import { startHarness } from "./harnessServer.mjs";

async function run() {
  const harness = await startHarness();
  const profile = await mkdtemp(path.join(os.tmpdir(), "awen-cockpit-store-profile-"));
  const { cdp, chrome } = await WsCDP.launch(chromeArgs(profile));
  try {
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const send = (method, params = {}) => cdp.send(method, params, sessionId);
    await Promise.all([send("Page.enable"), send("Runtime.enable")]);
    await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        localStorage.setItem('lingxing.ui.v1', JSON.stringify({storeSid:'999999'}));
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: async (text) => { window.__copiedText = text; } },
        });
      `,
    });
    await send("Emulation.setDeviceMetricsOverride",
      { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

    await send("Page.navigate", { url: `${harness.origin}/?r=/dashboard&tab=ads` });
    await waitFor(send, `document.body.innerText.includes('运营驾驶舱')`, "驾驶舱", 60_000);
    await waitFor(send, `document.querySelector('.home-ops-bar .xsel-label')?.textContent?.includes('请选择店铺')`,
      "等待选择店铺", 10_000);

    const before = await evaluate(send,
      `(window.__apiRequests || []).filter(r => r.full.startsWith('/cockpit/ads')).length`);
    assert.equal(before, 0, "未选择店铺时不能请求广告看板");
    const stale = await evaluate(send,
      `(window.__apiRequests || []).filter(r => r.full.startsWith('/cockpit/ads') && String(r.params?.sids) === '999999').length`);
    assert.equal(stale, 0, "未校验或已失效的历史店铺不能提前触发请求");

    await click(send, ".home-ops-bar .xsel-wrap");
    await waitFor(send, `!![...document.querySelectorAll('.xsel-option')].find(b => b.textContent.includes('awen-US'))`,
      "店铺选项", 10_000);
    await evaluate(send,
      `([...document.querySelectorAll('.xsel-option')].find(b => b.textContent.includes('awen-US'))).click()`);
    await waitFor(send,
      `(window.__apiRequests || []).some(r => r.full.startsWith('/cockpit/ads') && String(r.params?.sids) === '101')`,
      "按店铺读取广告", 10_000);
    await waitFor(send, `!!document.querySelector('.cp-camp-name')`, "活动名称", 10_000);

    // 广告看板的核心工作流是“看摘要 → 筛活动 → 操作”，不再用一整块状态卡片
    // 把表格推到首屏以下。主筛选只留最高频项，次要条件收进“更多筛选”。
    const adsLayout = await evaluate(send, `(() => {
      const table = document.querySelector('.cp-campaign-table');
      const tableWrap = document.querySelector('.cp-campaign-table-wrap');
      const firstRow = document.querySelector('.cp-campaign-table tbody > tr.cp-row');
      return {
        hasRiskSection: !!document.querySelector('.cp-risk-section'),
        hasPerformanceStrip: !!document.querySelector('.cp-performance-strip'),
        directSelects: document.querySelectorAll('.cp-filter-row > .cp-filter-select').length,
        tableTop: table?.getBoundingClientRect().top ?? 9999,
        firstRowBottom: firstRow?.getBoundingClientRect().bottom ?? 9999,
        needsHorizontalScroll: (tableWrap?.scrollWidth ?? 0) > (tableWrap?.clientWidth ?? 0) + 1,
      };
    })()`);
    assert.equal(adsLayout.hasRiskSection, false, "广告看板不得再渲染“运营状态”卡片模块");
    assert.equal(adsLayout.hasPerformanceStrip, true, "核心指标应收敛成一条扁平摘要");
    assert.equal(adsLayout.directSelects, 2, "主工具栏只保留活动状态与运营问题两个高频下拉");
    assert.ok(adsLayout.tableTop < 500, "活动表格必须进入 720px 高窗口的首屏工作区");
    assert.ok(adsLayout.firstRowBottom <= 720, "首屏必须看得到至少一条完整活动记录");
    assert.equal(adsLayout.needsHorizontalScroll, false,
      "1280px 工作区内的核心运营列必须直接可见，不能依赖首屏外的横向滚动条");

    // 用真实活动行扩充到常见的 18 行页面，复现“表格滚动区比父容器更高，末行被
    // overflow:hidden 永久裁掉”的问题。测试完成后立即移除临时行，不影响后续交互。
    const verticalLayout = await evaluate(send, `(() => {
      const body = document.querySelector('.cp-campaign-table tbody');
      const source = body?.querySelector('tr.cp-row');
      const panel = document.querySelector('.cp-campaign-panel');
      const wrap = document.querySelector('.cp-campaign-table-wrap');
      if (!body || !source || !panel || !wrap) return null;
      const clones = Array.from({ length: 15 }, (_, index) => {
        const row = source.cloneNode(true);
        row.dataset.layoutProbe = String(index);
        body.appendChild(row);
        return row;
      });
      wrap.scrollTop = wrap.scrollHeight;
      const panelRect = panel.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      const lastRowRect = clones.at(-1).getBoundingClientRect();
      const result = {
        panelBottom: panelRect.bottom,
        wrapBottom: wrapRect.bottom,
        lastRowBottom: lastRowRect.bottom,
        lastRowFullyVisible: lastRowRect.bottom <= Math.min(panelRect.bottom, wrapRect.bottom) + 1,
      };
      clones.forEach((row) => row.remove());
      wrap.scrollTop = 0;
      return result;
    })()`);
    assert.ok(verticalLayout, "必须能读取广告表格纵向布局");
    assert.ok(verticalLayout.wrapBottom <= verticalLayout.panelBottom + 1,
      "广告表格滚动区不能伸出父容器后被裁切");
    assert.equal(verticalLayout.lastRowFullyVisible, true,
      "活动列表滚动到底时最后一行必须能够完整显示");

    // 测试数据不足 25 条时分页不会自然出现；临时注入一个仅供事件使用的每页 1 条
    // 选项，让 React 走真实分页分支，确认分页固定在表格下方而不是被一并裁掉。
    await evaluate(send, `(() => {
      const select = document.querySelector('.cp-result-controls select');
      const option = document.createElement('option');
      option.value = '1';
      option.textContent = '1';
      select.appendChild(option);
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(select, '1');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await waitFor(send, `!!document.querySelector('.cp-pagination')`, "广告活动分页", 10_000);
    const paginationLayout = await evaluate(send, `(() => {
      const panel = document.querySelector('.cp-campaign-panel').getBoundingClientRect();
      const wrap = document.querySelector('.cp-campaign-table-wrap').getBoundingClientRect();
      const pagination = document.querySelector('.cp-pagination').getBoundingClientRect();
      return {
        followsTable: pagination.top >= wrap.bottom - 1,
        fullyVisible: pagination.bottom <= panel.bottom + 1,
      };
    })()`);
    assert.equal(paginationLayout.followsTable, true, "分页必须固定在表格滚动区下方");
    assert.equal(paginationLayout.fullyVisible, true, "分页不能被广告明细父容器裁切");
    await evaluate(send, `(() => {
      const select = document.querySelector('.cp-result-controls select');
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(select, '25');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await waitFor(send, `!document.querySelector('.cp-pagination')`, "恢复默认广告活动页数", 10_000);

    const campaignCell = await evaluate(send, `(() => {
      const el = document.querySelector('.cp-camp-name[title*="125876403477002"]');
      return { tag: el.tagName, text: el.textContent.trim(), title: el.getAttribute('title') || '' };
    })()`);
    assert.equal(campaignCell.tag, "BUTTON", "活动名称应当是可单击复制的按钮");
    assert.equal(campaignCell.text, "绿植零号手动", "表格必须显示活动名称而不是活动 ID");
    assert.match(campaignCell.title, /125876403477002/, "悬浮提示必须包含活动 ID");
    await evaluate(send, `document.querySelector('.cp-camp-name[title*="125876403477002"]').click()`);
    await waitFor(send, `window.__copiedText === '125876403477002'`, "复制活动 ID", 10_000);
    await waitFor(send, `document.body.innerText.includes('已复制活动 ID')`, "复制成功反馈", 10_000);
    await evaluate(send, `(() => {
      navigator.clipboard.writeText = async () => { throw new Error('clipboard denied'); };
      document.execCommand = () => false;
    })()`);
    await evaluate(send, `document.querySelector('.cp-camp-name[title*="125876403477002"]').click()`);
    await waitFor(send, `document.body.innerText.includes('复制失败，请检查浏览器剪贴板权限')`,
      "复制失败反馈", 10_000);

    const adsRequestsAfterLoad = await evaluate(send,
      `(window.__apiRequests || []).filter(r => r.full.startsWith('/cockpit/ads')).length`);
    const initialAdsParams = await evaluate(send,
      `(window.__apiRequests || []).find(r => r.full.startsWith('/cockpit/ads'))?.params || {}`);
    assert.equal(Number(initialAdsParams.top), 10000,
      "广告看板应一次取回完整活动集合，后续筛选不能只基于前 25 条");

    // 运营筛选全部在前端完成：输入关键词时不得再次请求后端。
    await waitFor(send, `!!document.querySelector('.cp-filter-search')`, "活动筛选框", 10_000);
    await evaluate(send, `(() => {
      const el = document.querySelector('.cp-filter-search');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, '新品测试');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await waitFor(send,
      `document.querySelectorAll('.cp-campaign-table tbody > tr.cp-row').length === 1
        && document.querySelector('.cp-camp-name')?.textContent?.includes('新品测试')`,
      "关键词筛选结果", 10_000);
    assert.equal(await evaluate(send,
      `(window.__apiRequests || []).filter(r => r.full.startsWith('/cockpit/ads')).length`),
      adsRequestsAfterLoad, "关键词筛选不能重新请求领星数据");

    // 清空关键词后，在表格工具栏选择“ACOS 破位”；运营状态卡片已经完全移除。
    await evaluate(send, `(() => {
      const el = document.querySelector('.cp-filter-search');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await evaluate(send, `(() => {
      const el = document.querySelector('.cp-filter-problem');
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(el, 'ads.acos_breach');
      el.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await waitFor(send,
      `document.querySelectorAll('.cp-campaign-table tbody > tr.cp-row').length === 1
        && document.querySelector('.cp-camp-name')?.textContent?.includes('露营椅自动')`,
      "异常快捷筛选结果", 10_000);
    assert.match(await evaluate(send,
      `document.querySelector('.cp-active-filters')?.textContent || ''`), /ACOS 破位/,
      "已启用条件必须在表格上方明确展示并可单独移除");
    assert.equal(await evaluate(send,
      `(window.__apiRequests || []).filter(r => r.full.startsWith('/cockpit/ads')).length`),
      adsRequestsAfterLoad, "异常筛选不能重新请求领星数据");

    // 横向滚动时最右操作列仍必须留在可视区，不能像旧版一样被截断。
    const stickyLayout = await evaluate(send, `(() => {
      const wrap = document.querySelector('.cp-campaign-table-wrap');
      const cell = document.querySelector('.cp-campaign-table tbody .cp-col-actions');
      const wr = wrap.getBoundingClientRect(), cr = cell.getBoundingClientRect();
      return { visible: cr.left >= wr.left && cr.right <= wr.right + 1, position: getComputedStyle(cell).position };
    })()`);
    assert.equal(stickyLayout.visible, true, "操作列必须保持在表格可视区");
    assert.equal(stickyLayout.position, "sticky", "操作列必须使用 sticky 固定");

    // 切走再回来必须直接命中前端缓存，不能再次出现“正在汇总广告数据”。
    await evaluate(send,
      `([...document.querySelectorAll('.home-tab')].find(b => b.textContent.includes('促销日历'))).click()`);
    await waitFor(send,
      `document.querySelector('.home-tab.active')?.textContent?.includes('促销日历')`,
      "切到促销日历", 10_000);
    await evaluate(send,
      `([...document.querySelectorAll('.home-tab')].find(b => b.textContent.includes('广告看板'))).click()`);
    await waitFor(send, `!!document.querySelector('.cp-campaign-table')`, "从缓存恢复广告看板", 10_000);
    assert.equal(await evaluate(send,
      `(window.__apiRequests || []).filter(r => r.full.startsWith('/cockpit/ads')).length`),
      adsRequestsAfterLoad, "重新进入广告看板不能重复请求同一店铺和周期");
    assert.equal(await evaluate(send,
      `document.body.innerText.includes('正在汇总广告数据')`), false,
      "缓存命中时不能闪现阻塞式汇总提示");

    // 手动刷新是唯一强制绕过缓存的入口；刷新失败时必须继续保留已缓存的数据。
    await evaluate(send, `window.__failAdsRefresh = true`);
    await click(send, ".cp-refresh-btn");
    await waitFor(send,
      `document.body.innerText.includes('刷新失败，继续显示上次缓存：模拟广告刷新失败')`,
      "刷新失败保留缓存提示", 10_000);
    assert.equal(await evaluate(send,
      `document.querySelectorAll('.cp-campaign-table tbody > tr.cp-row').length`), 1,
      "刷新失败时不能清空当前筛选结果");
    const refreshRequests = await evaluate(send,
      `(window.__apiRequests || []).filter(r => r.full.startsWith('/cockpit/ads')).length`);
    assert.equal(refreshRequests, adsRequestsAfterLoad + 1, "手动刷新应且只应新增一次请求");
    const lastAdsParams = await evaluate(send,
      `(window.__apiRequests || []).filter(r => r.full.startsWith('/cockpit/ads')).at(-1)?.params || {}`);
    assert.equal(lastAdsParams.force, true, "手动刷新必须明确绕过前后端缓存");
    await evaluate(send, `window.__failAdsRefresh = false`);

    await send("Page.navigate", { url: `${harness.origin}/?r=/dashboard&tab=tickets` });
    await waitFor(send, `document.querySelector('.home-tab.active')?.textContent?.includes('工单')`,
      "工单标签", 60_000);
    await waitFor(send, `(() => {
      const c = document.querySelector('.home-tabs');
      const a = document.querySelector('.home-tab.active');
      if (!c || !a) return false;
      const cr = c.getBoundingClientRect(), ar = a.getBoundingClientRect();
      return ar.left >= cr.left && ar.right <= cr.right;
    })()`, "激活标签滚入可视区", 10_000);

    process.stdout.write("cockpit store scope checks passed\n");
  } finally {
    chrome.kill("SIGKILL");
    harness.kill("SIGTERM");
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

await run();
