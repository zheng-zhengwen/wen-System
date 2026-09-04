import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { WsCDP, chromeArgs } from "./cdp.mjs";
import { localTool } from "./runtime.mjs";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const governance = {
  ok: true,
  healthy: true,
  summary: {
    pending_reviews: 0,
    approved_not_published: 0,
    published_changes: 1,
    coverage_gaps: 0,
    stale_cards: 0,
    monitor_errors: 0,
    monitor_overdue: 0,
    conflicts: 0,
    unverified_approved: 0,
  },
  reviews: { summary: { pending: 0 }, changes: [] },
  coverage: {
    summary: { requirements: 41, covered: 41, gaps: 0, coverage_rate: 1, primary_current_rate: 0.976 },
    requirements: [{
      domain: "tax_compliance", marketplace: "GLOBAL", status: "strong", covered: true,
      primary_current: true, card_ids: ["tax.tax_reports_and_liability"], source_urls: [],
    }],
    policy: "GLOBAL applies to cross-market reporting and advertising domains.",
  },
  freshness: {
    summary: {
      cards: 71,
      card_freshness: { current: 70, reviewed: 1, stale_needs_review: 0 },
      monitor_sources: 47,
      monitor_status: { current: 47, unseen: 0, overdue: 0, error: 0 },
    },
    cards_requiring_review: [],
    sources: [],
  },
  conflicts: [],
};

let evidenceApplied = false;
function apiPayload(url, method) {
  const pathname = new URL(url).pathname;
  if (pathname === "/api/auth/me") return { username: "e2e-admin", role: "admin", permissions: [] };
  if (pathname === "/api/setup/status") return { needs_setup: false, setup_done: true, checks: {} };
  if (pathname === "/api/health") return { ok: true, version: "e2e" };
  if (pathname === "/api/setup/update-info") {
    return { current: "e2e", latest: "e2e", update_available: false, platform_update_supported: false };
  }
  if (pathname === "/api/skill-tools/pinned") return [];
  if (pathname === "/api/autofix/status") return { enabled: false, job: null };
  if (pathname === "/api/awen-agent/knowledge/governance") return governance;
  if (pathname === "/api/awen-agent/knowledge/changes") {
    return { ok: true, summary: { changes: 0, pending: 0, published: 0 }, changes: [], review_required: false };
  }
  if (pathname === "/api/awen-agent/knowledge/evidence" && method === "GET") {
    return {
      ok: true,
      summary: { evidence: evidenceApplied ? 1 : 0, ready_for_diagnosis: evidenceApplied ? 1 : 0 },
      evidence: evidenceApplied ? [{
        id: "ev-e2e", title: "E2E settlement evidence", kind: "settlement_report", marketplace: "US",
        card_id: "user.evidence.settlement.e2e", diagnostic: { ready_for_diagnosis: true },
      }] : [],
    };
  }
  if (pathname === "/api/awen-agent/knowledge/evidence/draft") {
    return {
      ok: true,
      raw_preserved: false,
      evidence: {
        id: "ev-e2e", redactions: { email: 1 },
        diagnostic: { ready_for_diagnosis: true, missing_inputs: [] },
      },
      draft: { diff: "--- old\n+++ new\n+sanitized settlement evidence" },
    };
  }
  if (pathname === "/api/awen-agent/knowledge/evidence/apply") {
    evidenceApplied = true;
    return { ok: true, evidence: { id: "ev-e2e" }, result: { ok: true, applied: true } };
  }
  return {};
}

async function evaluate(send, expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(`browser evaluation failed: ${JSON.stringify(result.exceptionDetails)}`);
  }
  return result.result?.value;
}

async function waitFor(send, expression, label, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(send, expression)) return;
    await delay(100);
  }
  const state = await evaluate(send, `({
    text: document.body.innerText.slice(0, 800),
    location: window.location.href,
  })`);
  throw new Error(`timed out waiting for ${label}: ${JSON.stringify(state)}`);
}

async function setValue(send, selector, value) {
  await evaluate(send, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error("missing element: " + ${JSON.stringify(selector)});
    const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
}

async function run() {
  if (process.env.AWEN_E2E_SKIP_BUILD !== "1") {
    const build = spawnSync(process.execPath, [localTool("vite"), "build", "--mode", "e2e"],
                            { cwd: path.resolve("."), encoding: "utf8" });
    if (build.status !== 0) throw new Error(build.stderr || build.stdout || "client build failed");
  }
  const dist = path.resolve("dist-e2e");
  const rawHtml = await readFile(path.join(dist, "index.html"), "utf8");
  const assetRoot = pathToFileURL(path.join(dist, "assets")).href.replace(/\/$/, "");
  const appHtml = rawHtml
    .replace(/(?:<link rel="icon"[^>]*>|<link rel="apple-touch-icon"[^>]*>)/g, "")
    // Built assets request their JS/CSS with CORS semantics, but this test loads
    // the bundle from file:// where the origin is null. Drop the attribute only
    // in this temporary page so the lazy chunks can resolve locally.
    .replace(/\s+crossorigin/g, "")
    .replace(/(["'])\/assets\//g, `$1${assetRoot}/`)
    .replace("<script type=\"module\"", `<script>
      const originalFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const value = typeof input === "string" && input.startsWith("/api/") ? "https://awen-e2e.local" + input : input;
        return originalFetch(value, init);
      };
      const originalOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        const value = typeof url === "string" && url.startsWith("/api/") ? "https://awen-e2e.local" + url : url;
        return originalOpen.call(this, method, value, ...rest);
      };
    </script><script type="module"`);

  const profile = await mkdtemp(path.join(os.tmpdir(), "awen-knowledge-e2e-"));
  const { cdp, chrome } = await WsCDP.launch(chromeArgs(profile));
  try {
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const send = (method, params = {}) => cdp.send(method, params, sessionId);
    const browserErrors = [];
    cdp.on("Runtime.exceptionThrown", (params, eventSession) => {
      if (eventSession === sessionId) browserErrors.push(params.exceptionDetails?.text || "browser exception");
    });
    cdp.on("Fetch.requestPaused", async ({ requestId, request }, eventSession) => {
      if (eventSession !== sessionId) return;
      let body;
      let contentType;
      if (request.url.startsWith("file:///brain")) {
        body = appHtml;
        contentType = "text/html; charset=utf-8";
      } else {
        body = JSON.stringify(apiPayload(request.url, request.method));
        contentType = "application/json; charset=utf-8";
      }
      await send("Fetch.fulfillRequest", {
        requestId,
        responseCode: 200,
        responseHeaders: [
          { name: "Content-Type", value: contentType },
          { name: "Access-Control-Allow-Origin", value: "*" },
        ],
        body: Buffer.from(body).toString("base64"),
      });
    });
    await Promise.all([
      send("Page.enable"),
      send("Runtime.enable"),
      send("Fetch.enable", { patterns: [
        { urlPattern: "file:///brain*", requestStage: "Request" },
        { urlPattern: "https://awen-e2e.local/api/*", requestStage: "Request" },
      ] }),
    ]);
    await send("Page.navigate", { url: "file:///brain?tab=governance" });
    await waitFor(send, `document.body.innerText.includes("awenAgent 知识治理中心")`, "governance center");
    assert.equal(await evaluate(send, `document.body.innerText.includes("41/41")`), true);

    await evaluate(send, `document.querySelector('[data-testid="knowledge-view-evidence"]').click()`);
    await waitFor(send, `!!document.querySelector('[data-testid="knowledge-evidence-view"]')`, "evidence view");
    await setValue(send, '[data-testid="evidence-kind"]', "settlement_report");
    await setValue(send, '[data-testid="evidence-title"]', "E2E settlement evidence");
    await setValue(send, '[data-testid="evidence-message"]', "Payment released for settlement");
    await setValue(send, '[data-testid="evidence-content"]', "Contact email owner@example.com; settlement reconciled.");
    await evaluate(send, `document.querySelector('[data-testid="evidence-authorized"]').click()`);
    await evaluate(send, `document.querySelector('[data-testid="evidence-rights"]').click()`);
    await waitFor(send, `!document.querySelector('[data-testid="evidence-preview-button"]').disabled`, "enabled preview button");
    await evaluate(send, `document.querySelector('[data-testid="evidence-preview-button"]').click()`);
    await waitFor(send, `!!document.querySelector('[data-testid="evidence-preview"]')`, "sanitized evidence preview");
    assert.equal(await evaluate(send, `document.body.innerText.includes("原始文件保留：否")`), true);

    await evaluate(send, `document.querySelector('[data-testid="evidence-apply-button"]').click()`);
    await waitFor(send, `!!document.querySelector('.confirm-ok-normal')`, "confirmation dialog");
    await evaluate(send, `document.querySelector('.confirm-ok-normal').click()`);
    await waitFor(send, `document.body.innerText.includes("user.evidence.settlement.e2e")`, "applied evidence row");
    assert.deepEqual(browserErrors, []);
    process.stdout.write("knowledge governance browser E2E passed\n");
  } finally {
    try { chrome.kill("SIGKILL"); } catch {}
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

await run();
