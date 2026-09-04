import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAgents, type AgentInfo } from "../api/agents";
import { buildReportDoc, reportReference, writeAgentHandoff } from "../lib/deepAnalysis";
import SheetSelect from "./SheetSelect";

// Generic "深入分析" panel shared by 市场调研 / 打法推荐 / 分析工具.
// Each board passes its own analysis presets; the report is handed off as a
// document to the native agents app (see lib/deepAnalysis + AppContent reader).

export type DeepAnalysisType = {
  id: string;
  icon: string;
  label: string;
  promptFn: (query: string, marketplace: string, report: string) => string;
};

export default function DeepAnalysisPanel({
  types,
  query,
  marketplace,
  report,
  slug,
}: {
  types: readonly DeepAnalysisType[];
  query: string;
  marketplace: string;
  report: string;
  /** filename slug for the report doc; defaults to `query`. */
  slug?: string;
}) {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState<string>(types[0]?.id ?? "");
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetchAgents()
      .then((list) => {
        const enabled = list.filter((a) => a.enabled);
        setAgents(enabled);
        if (enabled.length > 0) setSelectedAgent(enabled[0].id);
      })
      .catch(() => {});
  }, []);

  const handleStart = () => {
    if (!selectedAgent || loading) return;
    setLoading(true);
    setErr("");
    try {
      const typeConf = types.find((t) => t.id === selectedType) ?? types[0];
      // Hand the full report over as a document (no truncation, no giant paste):
      // the native composer writes it into the working dir and the prompt asks
      // the agent to Read it. See AppContent's `awenops-agent-handoff` reader.
      const doc = buildReportDoc(slug || query, report);
      const prompt = typeConf.promptFn(query, marketplace, reportReference(doc));
      writeAgentHandoff({ provider: selectedAgent, prompt, doc });
      navigate("/agents");
    } catch (e: any) {
      setErr(e?.message || "跳转失败");
      setLoading(false);
    }
  };

  return (
    <div className="market-deep-panel">
      <div className="market-deep-hd">
        <span className="market-deep-title">深入分析</span>
        <span className="market-deep-sub">将报告作为上下文，在智能体会话中继续探讨</span>
      </div>
      <div className="market-deep-body">
        {/* Analysis type selector */}
        <div className="market-deep-types">
          {types.map((t) => (
            <button
              key={t.id}
              className={"market-deep-type" + (selectedType === t.id ? " active" : "")}
              onClick={() => setSelectedType(t.id)}
            >
              <span className="market-deep-type-icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Agent selector + start */}
        <div className="market-deep-actions">
          {agents.length > 0 ? (
            <SheetSelect
              className="market-deep-agent-select"
              value={selectedAgent}
              onChange={setSelectedAgent}
              disabled={loading}
              title="选择智能体"
              options={agents.map((a) => ({ value: a.id, label: a.display_name || a.id }))}
            />
          ) : (
            <span className="market-deep-no-agent">暂无可用智能体</span>
          )}
          <button
            className="market-deep-start-btn"
            onClick={handleStart}
            disabled={loading || !selectedAgent}
          >
            {loading ? "创建中…" : "开始分析 →"}
          </button>
        </div>

        {err && <div className="market-deep-err">{err}</div>}
      </div>
    </div>
  );
}
