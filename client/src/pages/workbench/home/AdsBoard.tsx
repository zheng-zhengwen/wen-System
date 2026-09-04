import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown, ChevronRight, Clock3, RefreshCw, Search, SlidersHorizontal, X,
} from "lucide-react";
import {
  fetchAdsBoard, fetchHourly,
  type AdsBoard as AdsBoardData, type AdjustIntent, type Campaign,
  type HourlyResult, type Metrics,
} from "../../../api/cockpit";
import { copyTextToClipboard } from "../../../agents/utils/clipboard";
import { useToast } from "../../../components/toast";
import { errText } from "../../../lib/errText";
import { fmtMoney } from "../lingxingCurrency";
import AdjustDrawer from "./AdjustDrawer";
import LingXingGate from "./LingXingGate";
import {
  ADS_BOARD_FETCH_LIMIT,
  EMPTY_ADS_FILTERS,
  adsBoardCacheKey,
  campaignTotals,
  filterCampaigns,
  hasAdsFilters,
  loadAdsBoardCached,
  readAdsBoardCache,
  sortCampaigns,
  type AdsBoardFilters,
  type AnomalyFilter,
  type CampaignSort,
  type CampaignSortKey,
} from "./adsBoardModel";

const HEALTH_TEXT: Record<string, string> = {
  good: "达标", watch: "偏高", bad: "亏损", unknown: "无基准",
};
const STATE_TEXT: Record<string, string> = {
  enabled: "启用", paused: "暂停", archived: "归档", unknown: "状态未知", "": "状态未知",
};
const TARGETING_TEXT: Record<string, string> = {
  auto: "自动投放", manual: "手动投放", unknown: "投放方式未知", "": "投放方式未知",
};
const ANOMALY_OPTIONS: { value: AnomalyFilter; label: string }[] = [
  { value: "", label: "全部运营问题" },
  { value: "any", label: "有待处理问题" },
  { value: "ads.spend_no_sales", label: "有花费零销售" },
  { value: "ads.acos_breach", label: "ACOS 破位" },
  { value: "budget", label: "预算受限" },
  { value: "ads.cpc_jump", label: "CPC 跳涨" },
  { value: "ads.impression_zero", label: "曝光归零" },
];
const SORT_TEXT: Record<CampaignSortKey, string> = {
  priority: "处理优先级",
  name: "活动名称",
  spend: "花费",
  sales: "销售额",
  orders: "订单",
  acos: "ACOS",
  cvr: "CVR",
  cpc: "CPC",
  budget_used_pct: "预算进度",
};
const PAGE_SIZE_OPTIONS = [25, 50];
const DAYS_STORAGE_KEY = "awenops.ads.days";

let rememberedFilters: AdsBoardFilters = { ...EMPTY_ADS_FILTERS };
let rememberedSort: CampaignSort = { key: "priority", dir: "desc" };
let rememberedPageSize = 25;

function initialDays(): number {
  try {
    const value = Number(localStorage.getItem(DAYS_STORAGE_KEY));
    return [1, 7, 14, 30].includes(value) ? value : 7;
  } catch {
    return 7;
  }
}

function pct(value: number | null | undefined, digits = 1): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function num(value: number | null | undefined, digits = 0): string {
  if (value == null) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function updatedTime(raw?: string): string {
  if (!raw) return "更新时间未知";
  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) return "更新时间未知";
  return `更新于 ${value.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
}

function Delta({ value, meaning = "neutral" }: {
  value: number | null;
  meaning?: "higher-better" | "lower-better" | "neutral";
}) {
  if (value == null) return null;
  let tone = "neutral";
  if (value !== 0 && meaning !== "neutral") {
    const good = meaning === "higher-better" ? value > 0 : value < 0;
    tone = good ? "good" : "bad";
  }
  return (
    <span className={`cp-delta ${tone}`}>
      {value > 0 ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}

function Kpi({ label, value, delta, meaning, hint }: {
  label: string;
  value: string;
  delta?: number | null;
  meaning?: "higher-better" | "lower-better" | "neutral";
  hint?: string;
}) {
  return (
    <div className="cp-kpi" title={hint}>
      <div className="cp-kpi-label">{label}</div>
      <div className="cp-kpi-value">
        {value}<Delta value={delta ?? null} meaning={meaning} />
      </div>
    </div>
  );
}

function SortHeader({ label, sortKey, sort, onSort, className = "" }: {
  label: string;
  sortKey: CampaignSortKey;
  sort: CampaignSort;
  onSort: (key: CampaignSortKey) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th className={className} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className={`cp-sort-button${active ? " active" : ""}`}
              onClick={() => onSort(sortKey)}>
        {label}<span aria-hidden="true">{active ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  );
}

/** 单活动的 24 小时累计花费曲线。 */
function HourChart({ result, campaign }: { result: HourlyResult; campaign: Campaign }) {
  const series = result.series.filter((item) => item.points.length > 0);
  if (series.length === 0) return <div className="cp-empty-inline">这天没有小时数据</div>;
  const max = Math.max(...series.flatMap((item) => item.points.map((point) => point.spend_cumulative)), 1);
  const width = 640;
  const height = 180;
  const padX = 34;
  const padTop = 18;
  const padBottom = 30;
  return (
    <div className="cp-hour">
      <svg viewBox={`0 0 ${width} ${height}`} className="cp-hour-svg" role="img"
           aria-label={`${campaign.name || "活动"}今日累计花费曲线`}>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padTop + ratio * (height - padTop - padBottom);
          return <line key={ratio} x1={padX} x2={width - padX} y1={y} y2={y} className="cp-hour-grid" />;
        })}
        {[0, 6, 12, 18, 23].map((hour) => (
          <text key={hour} x={padX + (hour / 23) * (width - padX * 2)} y={height - 8}
                className="cp-hour-tick" textAnchor="middle">{hour}时</text>
        ))}
        {series.map((item, index) => {
          const points = item.points.map((point) => {
            const x = padX + (point.hour / 23) * (width - padX * 2);
            const y = height - padBottom - (point.spend_cumulative / max)
              * (height - padTop - padBottom);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          }).join(" ");
          return <polyline key={item.campaign_id} points={points} className={`cp-hour-line c${index % 5}`} />;
        })}
      </svg>
      <div className="cp-hour-legend">
        <span title={`活动 ID：${campaign.campaign_id}`}>
          {campaign.name || "活动名称未同步"} · 累计 {fmtMoney(series[0]?.spend_total, campaign.currency)}
        </span>
      </div>
    </div>
  );
}

function CampaignRow({ campaign, onAdjust, onHourly }: {
  campaign: Campaign;
  onAdjust: (intent: AdjustIntent, label: string, unit: string) => void;
  onHourly: (campaign: Campaign) => void;
}) {
  const [open, setOpen] = useState(false);
  const notify = useToast();
  const used = campaign.budget_used_pct;
  const campaignName = String(campaign.name ?? "").trim() || "活动名称未同步";
  const state = campaign.state || "unknown";
  const targeting = campaign.targeting_type || "unknown";

  const copyCampaignId = async () => {
    const copied = await copyTextToClipboard(campaign.campaign_id);
    notify(copied ? "success" : "error",
      copied ? `已复制活动 ID：${campaign.campaign_id}` : "复制失败，请检查浏览器剪贴板权限");
  };

  return (
    <>
      <tr className={`cp-row cp-health-${campaign.health}`}>
        <td className="cp-campaign-name-cell">
          <div className="cp-campaign-primary">
            <button type="button" className="cp-row-toggle" onClick={() => setOpen((value) => !value)}
                    aria-label={open ? `收起 ${campaignName}` : `展开 ${campaignName}`}>
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            <div className="cp-campaign-identity">
              <button type="button" className="cp-camp-name"
                      title={`活动 ID：${campaign.campaign_id}（单击复制）`}
                      aria-label={`${campaignName}，活动 ID ${campaign.campaign_id}，单击复制`}
                      onClick={() => { void copyCampaignId(); }}>
                {campaignName}
              </button>
              <div className="cp-campaign-meta">
                <span className={`cp-state state-${state}`}>{STATE_TEXT[state] ?? state}</span>
                <span>{TARGETING_TEXT[targeting] ?? targeting}</span>
                {campaign.serving_status?.includes("OUT_OF_BUDGET") && (
                  <span className="cp-state budget-limited">预算耗尽</span>
                )}
                {campaign.anomalies.length > 0 && (
                  <span className="cp-issue-count" title={campaign.anomalies.map((item) => item.label).join("、")}>
                    {campaign.anomalies.length} 个问题
                  </span>
                )}
              </div>
            </div>
          </div>
        </td>
        <td className="cp-num-cell">
          <div>{fmtMoney(campaign.spend, campaign.currency)}</div>
          <Delta value={campaign.spend_change_pct} meaning="neutral" />
        </td>
        <td className="cp-num-cell">{fmtMoney(campaign.sales, campaign.currency)}</td>
        <td className="cp-num-cell">{campaign.orders}</td>
        <td className={`cp-num-cell cp-acos cp-health-${campaign.health}`}>
          <strong>{pct(campaign.acos)}</strong>
          <span className="cp-acos-target">目标 {pct(campaign.target_acos, 0)}</span>
        </td>
        <td className="cp-num-cell cp-col-secondary">{pct(campaign.cvr, 1)}</td>
        <td className="cp-num-cell cp-col-secondary">{fmtMoney(campaign.cpc, campaign.currency)}</td>
        <td className="cp-budget-cell">
          {used != null ? (
            <div title={`今日已花 ${fmtMoney(campaign.today_spend, campaign.currency)} / 日预算 ${fmtMoney(campaign.daily_budget, campaign.currency)}`}>
              <div className="cp-budget-numbers">
                <span>{fmtMoney(campaign.today_spend, campaign.currency)}</span>
                <span className={used >= 90 ? "hot" : ""}>{used}%</span>
              </div>
              <div className="cp-mini-bar">
                <div className={`cp-mini-fill${used >= 90 ? " hot" : ""}`}
                     style={{ width: `${Math.min(100, Math.max(0, used))}%` }} />
              </div>
            </div>
          ) : "—"}
        </td>
        <td className="cp-col-actions">
          <button type="button" className="cp-row-action" onClick={() => onHourly(campaign)}>趋势</button>
          <button type="button" className="cp-row-action primary" onClick={() => onAdjust({
            op_type: "campaign_budget", sid: campaign.sid, target_id: campaign.campaign_id,
            target_name: campaign.name || campaign.campaign_id, cur_value: campaign.daily_budget,
            new_value: Number((campaign.daily_budget * 0.85).toFixed(2)),
            rationale: "驾驶舱手动调整",
          }, "调整日预算", "")}>调预算</button>
        </td>
      </tr>
      {open && (
        <tr className="cp-row-detail">
          <td colSpan={9}>
            <div className="cp-detail">
              <div className="cp-detail-metrics">
                <span>曝光 <b>{num(campaign.impressions)}</b></span>
                <span>点击 <b>{num(campaign.clicks)}</b></span>
                <span>CTR <b>{pct(campaign.ctr, 2)}</b></span>
                <span>CVR <b>{pct(campaign.cvr, 1)}</b></span>
                <span>ROAS <b>{num(campaign.roas, 2)}</b></span>
                <span>健康度 <b>{HEALTH_TEXT[campaign.health]}</b></span>
                {campaign.breakeven_acos != null && (
                  <span>盈亏平衡 <b>{pct(campaign.breakeven_acos, 0)}</b></span>
                )}
              </div>
              {campaign.anomalies.length === 0 && (
                <div className="cp-detail-clear">当前规则下未发现需要立即处理的问题。</div>
              )}
              {campaign.anomalies.map((item) => (
                <div key={item.code} className={`cp-anomaly sev-${item.severity}`}>
                  <span className="cp-anomaly-label">{item.label}</span>
                  <span className="cp-anomaly-detail">{item.detail}</span>
                  {item.intent && (
                    <button type="button" className="cp-btn tiny primary"
                            onClick={() => onAdjust(item.intent!, item.label, "")}>
                      按建议调整至 {item.intent.new_value}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AdsBoard({ storeSid }: { storeSid: string }) {
  const [days, setDays] = useState(initialDays);
  const key = adsBoardCacheKey(storeSid, days);
  const initialCache = useMemo(() => readAdsBoardCache(key), []); // 只给首次挂载取初值
  const [boardState, setBoardState] = useState<{ key: string; data: AdsBoardData } | null>(
    () => initialCache ? { key, data: initialCache.data } : null);
  const [loading, setLoading] = useState(!initialCache);
  const [refreshing, setRefreshing] = useState(false);
  const [cacheHit, setCacheHit] = useState(!!initialCache);
  const [errorState, setErrorState] = useState<{ key: string; text: string } | null>(null);
  const [refreshWarning, setRefreshWarning] = useState("");
  const [filters, setFilters] = useState<AdsBoardFilters>(() => ({ ...rememberedFilters }));
  const [sort, setSort] = useState<CampaignSort>(() => ({ ...rememberedSort }));
  const [pageSize, setPageSize] = useState(rememberedPageSize);
  const [page, setPage] = useState(1);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [hourlyCampaign, setHourlyCampaign] = useState<Campaign | null>(null);
  const [hourly, setHourly] = useState<HourlyResult | null>(null);
  const [hourlyBusy, setHourlyBusy] = useState(false);
  const [hourlyError, setHourlyError] = useState("");
  const [drawer, setDrawer] = useState<
    { intent: AdjustIntent; label: string; unit: string } | null>(null);
  const alive = useRef(true);
  const requestVersion = useRef(0);
  const hourlyVersion = useRef(0);

  const cachedForKey = readAdsBoardCache(key);
  const board = boardState?.key === key ? boardState.data : cachedForKey?.data ?? null;
  const visibleError = errorState?.key === key ? errorState.text : "";
  const blockingLoading = !board && (loading || boardState?.key !== key);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      requestVersion.current += 1;
      hourlyVersion.current += 1;
    };
  }, []);

  const load = useCallback(async (force = false) => {
    const requestKey = adsBoardCacheKey(storeSid, days);
    const cached = readAdsBoardCache(requestKey);
    const version = ++requestVersion.current;
    setErrorState(null);
    setRefreshWarning("");

    if (!force && cached?.fresh) {
      setBoardState({ key: requestKey, data: cached.data });
      setLoading(false);
      setRefreshing(false);
      setCacheHit(true);
      return;
    }

    if (cached) {
      setBoardState({ key: requestKey, data: cached.data });
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
      setRefreshing(false);
    }

    try {
      const result = await loadAdsBoardCached(requestKey, () => fetchAdsBoard({
        sids: storeSid,
        days,
        top: ADS_BOARD_FETCH_LIMIT,
        force,
      }), force);
      if (!alive.current || requestVersion.current !== version) return;
      setBoardState({ key: requestKey, data: result.data });
      setCacheHit(result.fromCache);
    } catch (error: any) {
      if (!alive.current || requestVersion.current !== version) return;
      const message = errText(error, "广告数据加载失败");
      if (cached) setRefreshWarning(`刷新失败，继续显示上次缓存：${message}`);
      else setErrorState({ key: requestKey, text: message });
    } finally {
      if (alive.current && requestVersion.current === version) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [days, storeSid]);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    try { localStorage.setItem(DAYS_STORAGE_KEY, String(days)); } catch { /* 不影响当前页面 */ }
  }, [days]);

  useEffect(() => { rememberedFilters = { ...filters }; }, [filters]);
  useEffect(() => { rememberedSort = { ...sort }; }, [sort]);
  useEffect(() => { rememberedPageSize = pageSize; }, [pageSize]);
  useEffect(() => { setPage(1); }, [filters, sort, pageSize, key]);

  useEffect(() => {
    if (!hourlyCampaign) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        hourlyVersion.current += 1;
        setHourlyCampaign(null);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [hourlyCampaign]);

  const allCampaigns = useMemo(() => board?.by_campaign ?? [], [board]);
  const hasFilters = hasAdsFilters(filters);
  const filteredCampaigns = useMemo(
    () => sortCampaigns(filterCampaigns(allCampaigns, filters), sort),
    [allCampaigns, filters, sort]);
  const filteredTotals = useMemo(() => campaignTotals(filteredCampaigns), [filteredCampaigns]);
  const activeFilters = useMemo(() => {
    const items: { key: keyof AdsBoardFilters; label: string }[] = [];
    if (filters.query.trim()) items.push({ key: "query", label: `搜索：${filters.query.trim()}` });
    if (filters.state) items.push({ key: "state", label: `状态：${STATE_TEXT[filters.state]}` });
    if (filters.anomaly) {
      const label = ANOMALY_OPTIONS.find((item) => item.value === filters.anomaly)?.label;
      if (label) items.push({ key: "anomaly", label });
    }
    if (filters.health) items.push({ key: "health", label: `健康度：${HEALTH_TEXT[filters.health]}` });
    if (filters.targeting) {
      items.push({ key: "targeting", label: TARGETING_TEXT[filters.targeting] });
    }
    if (filters.minSpend.trim()) {
      items.push({ key: "minSpend", label: `花费 ≥ ${filters.minSpend.trim()}` });
    }
    if (filters.minClicks.trim()) {
      items.push({ key: "minClicks", label: `点击 ≥ ${filters.minClicks.trim()}` });
    }
    if (filters.orders) {
      items.push({ key: "orders", label: filters.orders === "with_orders" ? "有订单" : "无订单" });
    }
    return items;
  }, [filters]);
  const advancedFilterCount = [
    filters.health, filters.targeting, filters.minSpend, filters.minClicks, filters.orders,
  ].filter((value) => String(value).trim()).length;
  const pages = Math.max(1, Math.ceil(filteredCampaigns.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visibleCampaigns = filteredCampaigns.slice(
    (currentPage - 1) * pageSize, currentPage * pageSize);

  const updateFilters = (patch: Partial<AdsBoardFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
  };
  const clearFilter = (filterKey: keyof AdsBoardFilters) => {
    setFilters((current) => ({ ...current, [filterKey]: "" }));
  };
  const resetFilters = () => setFilters({ ...EMPTY_ADS_FILTERS });
  const toggleSort = (sortKey: CampaignSortKey) => {
    setSort((current) => current.key === sortKey
      ? { key: sortKey, dir: current.dir === "desc" ? "asc" : "desc" }
      : { key: sortKey, dir: sortKey === "name" ? "asc" : "desc" });
  };

  const showHourly = async (campaign: Campaign) => {
    const version = ++hourlyVersion.current;
    setHourlyCampaign(campaign);
    setHourly(null);
    setHourlyError("");
    setHourlyBusy(true);
    try {
      const result = await fetchHourly(campaign.sid, [campaign.campaign_id]);
      if (alive.current && hourlyVersion.current === version) setHourly(result);
    } catch (error: any) {
      if (alive.current && hourlyVersion.current === version) {
        setHourlyError(errText(error, "小时数据取不到"));
      }
    } finally {
      if (alive.current && hourlyVersion.current === version) setHourlyBusy(false);
    }
  };

  const totals = board?.totals as Metrics | undefined;
  const target = board?.by_store?.[0]?.target;
  const currency = board?.by_store?.[0]?.currency;
  const loadedCompletely = !board || board.campaign_count <= allCampaigns.length;

  return (
    <div className="cp-page cp-ads-page">
      <div className="cp-toolbar cp-ads-toolbar">
        <div className="cp-ads-toolbar-left">
          <div className="cp-seg" aria-label="统计周期">
            {[1, 7, 14, 30].map((value) => (
              <button type="button" key={value}
                      className={`cp-seg-btn${days === value ? " active" : ""}`}
                      onClick={() => setDays(value)}>
                {value === 1 ? "昨天" : `${value}天`}
              </button>
            ))}
          </div>
          <div className="cp-data-state" aria-live="polite">
            <Clock3 size={14} aria-hidden="true" />
            <span>{updatedTime(board?.generated_at)}</span>
            {cacheHit && !refreshing && <span className="cp-cache-state">前端缓存</span>}
            {refreshing && <span className="cp-cache-state refreshing">后台刷新中</span>}
          </div>
        </div>
        <button type="button" className="cp-btn cp-refresh-btn" onClick={() => { void load(true); }}
                disabled={loading || refreshing}>
          <RefreshCw size={14} className={refreshing ? "cp-spin" : ""} aria-hidden="true" />
          {refreshing ? "刷新中" : "刷新"}
        </button>
      </div>

      <section className="cp-performance-strip" aria-label="广告表现概览">
        <div className="cp-performance-meta">
          <div>
            <strong>{days === 1 ? "昨日" : `最近 ${days} 天`}</strong>
            <span>完整数据，不含今天未结束数据</span>
          </div>
          {target?.note && (
            <span className="cp-target-benchmark" title={target.note}>
              目标 ACOS <b>{pct(target.target_acos, 0)}</b>
            </span>
          )}
        </div>
        <div className="cp-kpis">
          <Kpi label="广告花费" value={fmtMoney(totals?.spend, currency)}
               delta={board?.delta.spend_pct} meaning="lower-better" />
          <Kpi label="广告销售额" value={fmtMoney(totals?.sales, currency)}
               delta={board?.delta.sales_pct} meaning="higher-better" />
          <Kpi label="订单" value={num(totals?.orders)}
               delta={board?.delta.orders_pct} meaning="higher-better" />
          <Kpi label="ACOS" value={pct(totals?.acos)}
               delta={board?.delta.acos_delta != null ? board.delta.acos_delta * 100 : null}
               meaning="lower-better" hint={target?.note || ""} />
          <Kpi label="CPC" value={fmtMoney(totals?.cpc, currency)} />
          <Kpi label="点击" value={num(totals?.clicks)} />
        </div>
      </section>

      <section className="cp-campaign-panel" aria-label="活动明细">
        <div className="cp-filter-panel">
          <div className="cp-filter-row">
            <label className="cp-search-field">
              <Search size={15} aria-hidden="true" />
              <input className="cp-filter-search" value={filters.query}
                     onChange={(event) => updateFilters({ query: event.target.value })}
                     placeholder="搜索活动名称或活动 ID" aria-label="搜索活动名称或活动 ID" />
              {filters.query && (
                <button type="button" onClick={() => updateFilters({ query: "" })} aria-label="清空搜索">
                  <X size={14} />
                </button>
              )}
            </label>
            <select className="cp-filter-select" value={filters.state}
                    onChange={(event) => updateFilters({ state: event.target.value as AdsBoardFilters["state"] })}
                    aria-label="活动状态">
              <option value="">全部状态</option>
              <option value="enabled">启用</option>
              <option value="paused">暂停</option>
              <option value="archived">归档</option>
              <option value="unknown">状态未知</option>
            </select>
            <select className="cp-filter-select cp-filter-problem" value={filters.anomaly}
                    onChange={(event) => updateFilters({ anomaly: event.target.value as AnomalyFilter })}
                    aria-label="运营问题">
              {ANOMALY_OPTIONS.map((option) => (
                <option key={option.value || "all"} value={option.value}>{option.label}</option>
              ))}
            </select>
            <button type="button" className={`cp-more-filter${advancedOpen ? " active" : ""}`}
                    onClick={() => setAdvancedOpen((value) => !value)} aria-expanded={advancedOpen}>
              <SlidersHorizontal size={14} aria-hidden="true" />
              更多筛选{advancedFilterCount > 0 && <span>{advancedFilterCount}</span>}
            </button>
          </div>
          {advancedOpen && (
            <div className="cp-filter-advanced">
              <label>健康度
                <select value={filters.health}
                        onChange={(event) => updateFilters({ health: event.target.value as AdsBoardFilters["health"] })}>
                  <option value="">不限</option>
                  <option value="good">达标</option>
                  <option value="watch">偏高</option>
                  <option value="bad">亏损</option>
                  <option value="unknown">无基准</option>
                </select>
              </label>
              <label>投放方式
                <select value={filters.targeting}
                        onChange={(event) => updateFilters({ targeting: event.target.value as AdsBoardFilters["targeting"] })}>
                  <option value="">不限</option>
                  <option value="auto">自动投放</option>
                  <option value="manual">手动投放</option>
                  <option value="unknown">方式未知</option>
                </select>
              </label>
              <label>最低花费
                <input type="number" min="0" value={filters.minSpend}
                       onChange={(event) => updateFilters({ minSpend: event.target.value })}
                       placeholder="不限" />
              </label>
              <label>最低点击
                <input type="number" min="0" step="1" value={filters.minClicks}
                       onChange={(event) => updateFilters({ minClicks: event.target.value })}
                       placeholder="不限" />
              </label>
              <label>订单情况
                <select value={filters.orders}
                        onChange={(event) => updateFilters({ orders: event.target.value as AdsBoardFilters["orders"] })}>
                  <option value="">不限</option>
                  <option value="with_orders">有订单</option>
                  <option value="without_orders">无订单</option>
                </select>
              </label>
            </div>
          )}
          {hasFilters && (
            <div className="cp-active-filters" aria-label="当前筛选条件">
              <span className="cp-active-filters-label">已筛选</span>
              {activeFilters.map((item) => (
                <button type="button" key={item.key} className="cp-active-filter"
                        onClick={() => clearFilter(item.key)} aria-label={`移除筛选：${item.label}`}>
                  {item.label}<X size={12} aria-hidden="true" />
                </button>
              ))}
              <button type="button" className="cp-filter-reset" onClick={resetFilters}>全部清除</button>
            </div>
          )}
        </div>

        <div className="cp-result-bar">
          <div className="cp-result-summary">
            <strong>{filteredCampaigns.length}</strong> / {allCampaigns.length} 个活动
            {hasFilters && (
              <span> · 命中花费 {fmtMoney(filteredTotals.spend, currency)} · 销售额 {fmtMoney(filteredTotals.sales, currency)}</span>
            )}
          </div>
          <div className="cp-result-controls">
            <span>按 {SORT_TEXT[sort.key]}{sort.dir === "asc" ? "升序" : "降序"}</span>
            <label>每页
              <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
                {PAGE_SIZE_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </div>
        </div>

        {refreshWarning && <div className="cp-refresh-warning">{refreshWarning}</div>}
        {!loadedCompletely && (
          <div className="cp-refresh-warning">
            当前账户共有 {board!.campaign_count} 个活动，本次仅加载 {allCampaigns.length} 个；请缩短周期后重试。
          </div>
        )}
        {(board?.scope.skipped?.length ?? 0) > 0 && (
          <div className="cp-skipped">
            已跳过 {board!.scope.skipped.map((item) => `${item.name}（${item.reason}）`).join("、")}
          </div>
        )}

        <LingXingGate error={visibleError} />
        {blockingLoading && (
          <div className="cp-loading cp-loading-card">
            <RefreshCw size={18} className="cp-spin" aria-hidden="true" />
            <div><strong>正在汇总广告数据</strong><span>首次进入或切换店铺/周期时需要读取一次</span></div>
          </div>
        )}

        {!blockingLoading && board && allCampaigns.length === 0 && !visibleError && (
          <div className="cp-empty">
            <div className="cp-empty-title">这段时间没有广告数据</div>
            <div className="cp-empty-desc">当前店铺在所选周期内没有产生广告投放记录。</div>
          </div>
        )}

        {!blockingLoading && allCampaigns.length > 0 && filteredCampaigns.length === 0 && (
          <div className="cp-empty cp-filter-empty">
            <div className="cp-empty-title">没有符合条件的活动</div>
            <div className="cp-empty-desc">当前数据已经加载，只是被筛选条件过滤掉了。</div>
            <button type="button" className="cp-btn primary" onClick={resetFilters}>清空筛选</button>
          </div>
        )}

        {visibleCampaigns.length > 0 && (
          <div className="cp-table-wrap cp-campaign-table-wrap">
            <table className="cp-table cp-campaign-table">
              <caption className="sr-only">广告活动运营明细</caption>
              <thead>
                <tr>
                  <SortHeader label="活动" sortKey="name" sort={sort} onSort={toggleSort}
                              className="cp-campaign-name-cell" />
                  <SortHeader label="花费" sortKey="spend" sort={sort} onSort={toggleSort} />
                  <SortHeader label="销售额" sortKey="sales" sort={sort} onSort={toggleSort} />
                  <SortHeader label="订单" sortKey="orders" sort={sort} onSort={toggleSort} />
                  <SortHeader label="ACOS / 目标" sortKey="acos" sort={sort} onSort={toggleSort} />
                  <SortHeader label="CVR" sortKey="cvr" sort={sort} onSort={toggleSort}
                              className="cp-col-secondary" />
                  <SortHeader label="CPC" sortKey="cpc" sort={sort} onSort={toggleSort}
                              className="cp-col-secondary" />
                  <SortHeader label="今日花费 / 预算" sortKey="budget_used_pct" sort={sort} onSort={toggleSort} />
                  <th className="cp-col-actions"><span className="sr-only">操作</span></th>
                </tr>
              </thead>
              <tbody>
                {visibleCampaigns.map((campaign) => (
                  <CampaignRow key={`${campaign.sid}:${campaign.campaign_id}`} campaign={campaign}
                               onAdjust={(intent, label, unit) => setDrawer({ intent, label, unit })}
                               onHourly={(value) => { void showHourly(value); }} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredCampaigns.length > pageSize && (
          <div className="cp-pagination">
            <button type="button" className="cp-btn" disabled={currentPage <= 1}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</button>
            <span>第 {currentPage} / {pages} 页</span>
            <button type="button" className="cp-btn" disabled={currentPage >= pages}
                    onClick={() => setPage((value) => Math.min(pages, value + 1))}>下一页</button>
          </div>
        )}
      </section>

      {hourlyCampaign && (
        <div className="cp-hour-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            hourlyVersion.current += 1;
            setHourlyCampaign(null);
          }
        }}>
          <aside className="cp-hour-drawer" role="dialog" aria-modal="true" aria-label="活动小时趋势">
            <div className="cp-hour-drawer-head">
              <div>
                <span>小时花费趋势</span>
                <strong>{hourlyCampaign.name || "活动名称未同步"}</strong>
                <small title={hourlyCampaign.campaign_id}>活动 ID：{hourlyCampaign.campaign_id}</small>
              </div>
              <button type="button" className="cp-drawer-x" onClick={() => {
                hourlyVersion.current += 1;
                setHourlyCampaign(null);
              }} aria-label="关闭小时趋势"><X size={18} /></button>
            </div>
            {hourlyBusy && <div className="cp-loading"><RefreshCw size={16} className="cp-spin" />正在读取小时数据…</div>}
            {hourlyError && <div className="cp-error">{hourlyError}</div>}
            {hourly && <HourChart result={hourly} campaign={hourlyCampaign} />}
          </aside>
        </div>
      )}

      {drawer && (
        <AdjustDrawer
          payload={{ ...drawer.intent, label: drawer.label, unit: drawer.unit }}
          onClose={() => setDrawer(null)}
          onDone={() => { setDrawer(null); void load(true); }}
        />
      )}
    </div>
  );
}
