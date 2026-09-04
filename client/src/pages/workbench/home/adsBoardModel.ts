import type { AdsBoard, Campaign, Metrics } from "../../../api/cockpit";

/**
 * 今天的广告数据在服务端也是 5 分钟缓存；前端采用相同窗口，避免切换标签时
 * 反复显示阻塞加载态。缓存只存在于当前页面内存，不把经营数据写进 localStorage。
 */
export const ADS_BOARD_CACHE_TTL_MS = 5 * 60 * 1000;
export const ADS_BOARD_FETCH_LIMIT = 10_000;

type CacheEntry = { data: AdsBoard; savedAt: number };
export type AdsBoardCacheHit = CacheEntry & { fresh: boolean; ageMs: number };

const resultCache = new Map<string, CacheEntry>();
const pendingLoads = new Map<string, Promise<AdsBoard>>();
const MAX_CACHE_ENTRIES = 24;

export function adsBoardCacheKey(storeSid: string, days: number): string {
  return `${storeSid}:${days}`;
}

export function readAdsBoardCache(key: string, now = Date.now()): AdsBoardCacheHit | null {
  const entry = resultCache.get(key);
  if (!entry) return null;
  const ageMs = Math.max(0, now - entry.savedAt);
  return { ...entry, ageMs, fresh: ageMs < ADS_BOARD_CACHE_TTL_MS };
}

function saveAdsBoardCache(key: string, data: AdsBoard): void {
  // Map 的插入顺序用作轻量 LRU；店铺 × 周期最多保留 24 份，防止长期开页无限增长。
  resultCache.delete(key);
  resultCache.set(key, { data, savedAt: Date.now() });
  while (resultCache.size > MAX_CACHE_ENTRIES) {
    const oldest = resultCache.keys().next().value as string | undefined;
    if (!oldest) break;
    resultCache.delete(oldest);
  }
}

export async function loadAdsBoardCached(
  key: string,
  loader: () => Promise<AdsBoard>,
  force = false,
): Promise<{ data: AdsBoard; fromCache: boolean }> {
  const cached = readAdsBoardCache(key);
  if (!force && cached?.fresh) return { data: cached.data, fromCache: true };

  if (!force) {
    const pending = pendingLoads.get(key);
    if (pending) return { data: await pending, fromCache: false };
  }

  const request = loader().then((data) => {
    saveAdsBoardCache(key, data);
    return data;
  });
  if (!force) pendingLoads.set(key, request);
  try {
    return { data: await request, fromCache: false };
  } finally {
    if (!force && pendingLoads.get(key) === request) pendingLoads.delete(key);
  }
}

export type HealthFilter = "" | "good" | "watch" | "bad" | "unknown";
export type StateFilter = "" | "enabled" | "paused" | "archived" | "unknown";
export type TargetingFilter = "" | "auto" | "manual" | "unknown";
export type OrderFilter = "" | "with_orders" | "without_orders";
export type AnomalyFilter =
  | "" | "any" | "budget"
  | "ads.spend_no_sales" | "ads.acos_breach" | "ads.out_of_budget"
  | "ads.budget_capped" | "ads.cpc_jump" | "ads.impression_zero";

export type AdsBoardFilters = {
  query: string;
  health: HealthFilter;
  state: StateFilter;
  targeting: TargetingFilter;
  anomaly: AnomalyFilter;
  minSpend: string;
  minClicks: string;
  orders: OrderFilter;
};

export const EMPTY_ADS_FILTERS: AdsBoardFilters = {
  query: "",
  health: "",
  state: "",
  targeting: "",
  anomaly: "",
  minSpend: "",
  minClicks: "",
  orders: "",
};

export type CampaignSortKey =
  | "priority" | "name" | "spend" | "sales" | "orders"
  | "acos" | "cvr" | "cpc" | "budget_used_pct";
export type CampaignSort = { key: CampaignSortKey; dir: "asc" | "desc" };

function threshold(raw: string): number | null {
  if (!raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, value) : null;
}

function anomalyCodes(campaign: Campaign): Set<string> {
  return new Set((campaign.anomalies ?? []).map((item) => String(item.code || "")));
}

export function filterCampaigns(campaigns: Campaign[], filters: AdsBoardFilters): Campaign[] {
  const query = filters.query.trim().toLocaleLowerCase("zh-CN");
  const minSpend = threshold(filters.minSpend);
  const minClicks = threshold(filters.minClicks);

  return campaigns.filter((campaign) => {
    if (query) {
      const text = `${campaign.name || ""}\n${campaign.campaign_id || ""}`.toLocaleLowerCase("zh-CN");
      if (!text.includes(query)) return false;
    }
    if (filters.health && (campaign.health || "unknown") !== filters.health) return false;
    if (filters.state && (campaign.state || "unknown") !== filters.state) return false;
    if (filters.targeting && (campaign.targeting_type || "unknown") !== filters.targeting) return false;

    const codes = anomalyCodes(campaign);
    if (filters.anomaly === "any" && codes.size === 0) return false;
    if (filters.anomaly === "budget"
      && !codes.has("ads.out_of_budget") && !codes.has("ads.budget_capped")) return false;
    if (filters.anomaly && filters.anomaly !== "any" && filters.anomaly !== "budget"
      && !codes.has(filters.anomaly)) return false;

    if (minSpend != null && campaign.spend < minSpend) return false;
    if (minClicks != null && campaign.clicks < minClicks) return false;
    if (filters.orders === "with_orders" && campaign.orders <= 0) return false;
    if (filters.orders === "without_orders" && campaign.orders > 0) return false;
    return true;
  });
}

const severityScore: Record<string, number> = { crit: 3, warn: 2, info: 1 };

function priorityValue(campaign: Campaign): [number, number, number, number] {
  const severity = Math.max(0, ...(campaign.anomalies ?? []).map(
    (item) => severityScore[item.severity] ?? 0));
  return [severity, campaign.anomalies?.length ?? 0,
    Math.max(campaign.acos_vs_target ?? 0, 0), campaign.spend];
}

function compareTuple(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function sortCampaigns(campaigns: Campaign[], sort: CampaignSort): Campaign[] {
  const direction = sort.dir === "asc" ? 1 : -1;
  return [...campaigns].sort((a, b) => {
    if (sort.key === "priority") {
      return compareTuple(priorityValue(a), priorityValue(b)) * direction;
    }
    if (sort.key === "name") {
      return String(a.name || "").localeCompare(String(b.name || ""), "zh-CN") * direction;
    }
    const av = a[sort.key];
    const bv = b[sort.key];
    // 空值始终沉底；否则按 ACOS 升序时会先看到一屏“—”。
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (Number(av) - Number(bv)) * direction;
  });
}

export function campaignTotals(campaigns: Campaign[]): Metrics {
  const totals = campaigns.reduce((sum, campaign) => ({
    spend: sum.spend + campaign.spend,
    sales: sum.sales + campaign.sales,
    orders: sum.orders + campaign.orders,
    clicks: sum.clicks + campaign.clicks,
    impressions: sum.impressions + campaign.impressions,
  }), { spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 });
  return {
    ...totals,
    spend: Number(totals.spend.toFixed(2)),
    sales: Number(totals.sales.toFixed(2)),
    acos: totals.sales ? totals.spend / totals.sales : null,
    roas: totals.spend ? totals.sales / totals.spend : null,
    ctr: totals.impressions ? totals.clicks / totals.impressions : null,
    cvr: totals.clicks ? totals.orders / totals.clicks : null,
    cpc: totals.clicks ? totals.spend / totals.clicks : null,
  };
}

export function hasAdsFilters(filters: AdsBoardFilters): boolean {
  return Object.values(filters).some((value) => String(value).trim() !== "");
}
