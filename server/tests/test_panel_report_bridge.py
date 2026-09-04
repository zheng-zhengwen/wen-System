"""Agent → panel bridge: *_generate_report tools run the real flow and persist to history."""
from __future__ import annotations

import asyncio

import app.routers.market as market
import app.routers.playbook as playbook
from app.services import (ai_synthesis_service, awenops_tools,
                          playbook_synthesis_service, sorftime_service)


def test_market_generate_report_persists_to_history(tmp_path, monkeypatch):
    monkeypatch.setattr(market, "_history_db_path", lambda: str(tmp_path / "mh.sqlite3"))

    async def fake_kw(q, m, prog):
        return ({"k": 1}, [])

    monkeypatch.setattr(sorftime_service, "keyword_pipeline", fake_kw)

    async def fake_synth(mode, q, m, data, skip_agent=False, source='Sorftime'):
        assert skip_agent is True            # bridge must not re-enter the agent
        yield ("_attempt", "deepseek")
        yield ("deepseek", "# 市场调研报告\n正文")

    monkeypatch.setattr(ai_synthesis_service, "synthesize", fake_synth)

    res = asyncio.run(awenops_tools.call_tool("market_generate_report", {"query": "yoga mat"}))
    assert res["ok"] is True
    assert res["result"]["saved_to"] == "market_history"
    hist = market.get_history(_user="bridge")
    assert len(hist) == 1 and hist[0]["query"] == "yoga mat" and hist[0]["report"]


def test_playbook_generate_report_persists_to_history(tmp_path, monkeypatch):
    monkeypatch.setattr(playbook, "_history_db_path", lambda: str(tmp_path / "pb.sqlite3"))

    async def fake_kw(q, m, prog):
        return ({"k": 1}, [])

    monkeypatch.setattr(sorftime_service, "keyword_pipeline", fake_kw)

    async def fake_synth(mode, q, m, price, cost, data, skip_agent=False, source="Sorftime"):
        assert skip_agent is True
        assert source == "Sorftime"
        yield ("_attempt", "deepseek")
        yield ("deepseek", "# 打法推荐\n正文")

    monkeypatch.setattr(playbook_synthesis_service, "synthesize", fake_synth)

    res = asyncio.run(awenops_tools.call_tool("playbook_generate_report", {"query": "yoga mat"}))
    assert res["ok"] is True
    assert res["result"]["saved_to"] == "playbook_history"
    hist = playbook.get_history(_user="bridge")
    assert len(hist) == 1 and hist[0]["data_source"] == "sorftime"


def test_deep_generate_report_persists_to_history(tmp_path, monkeypatch):
    import app.routers.deep_analysis as da
    from app.services import sif_service
    monkeypatch.setattr(da, "_history_db_path", lambda: str(tmp_path / "dh.sqlite3"))

    async def fake_kw(q, c, a):
        return {"top": [{"asin": "B0", "share": 0.1}]}

    monkeypatch.setattr(sif_service, "keyword_competition", fake_kw)

    async def fake_gen(prompt, skip_agent=False):
        assert skip_agent is True
        return "# 关键词竞争分析报告\n正文"

    monkeypatch.setattr(ai_synthesis_service, "generate_text", fake_gen)

    res = asyncio.run(awenops_tools.call_tool(
        "deep_generate_report", {"tool": "keyword", "query": "yoga mat"}))
    assert res["ok"] is True
    assert res["result"]["saved_to"] == "deep_analysis_history"
    hist = da.get_history(_user="bridge")
    assert len(hist) == 1 and hist[0]["tool"] == "keyword" and hist[0]["report"]


def test_synthesize_skip_agent_excludes_awen_agent(monkeypatch):
    monkeypatch.setattr(ai_synthesis_service, "_text_provider_chain", lambda: ["awen-agent", "deepseek"])
    monkeypatch.setattr(ai_synthesis_service, "_build_prompt", lambda *a, **k: "p")
    called = {"agent": False}

    async def fake_agent(prompt, failures):
        called["agent"] = True
        yield ("_attempt", "awen-agent")

    async def fake_ds(prompt, failures):
        yield ("_attempt", "deepseek")
        yield ("deepseek", "ok")

    monkeypatch.setattr(ai_synthesis_service, "_try_awen_agent", fake_agent)
    monkeypatch.setattr(ai_synthesis_service, "_try_deepseek", fake_ds)

    async def run():
        return [(p, c) async for p, c in
                ai_synthesis_service.synthesize("keyword", "q", "US", {}, skip_agent=True)]

    out = asyncio.run(run())
    assert called["agent"] is False
    assert any(p == "deepseek" for p, _ in out)


def test_default_text_chain_leads_with_awen_agent():
    # Direction 1: panels default to awenAgent (chain order), even with no config set.
    assert ai_synthesis_service._text_provider_chain()[0] == "awen-agent"


def test_market_data_source_dispatch(monkeypatch, tmp_path):
    monkeypatch.setattr(market, "_history_db_path", lambda: str(tmp_path / "mh.sqlite3"))
    from app.services import sellersprite_service
    seen = {"src": None}

    async def ss_kw(q, m, prog):
        seen["src"] = "sellersprite"
        return ({"关键词流量": {"x": 1}}, [])

    async def sf_kw(q, m, prog):
        seen["src"] = "sorftime"
        return ({"k": 1}, [])

    monkeypatch.setattr(sellersprite_service, "keyword_pipeline", ss_kw)
    monkeypatch.setattr(sorftime_service, "keyword_pipeline", sf_kw)

    async def fake_synth(mode, q, m, data, skip_agent=False, source='Sorftime'):
        yield ("deepseek", "# r")

    monkeypatch.setattr(ai_synthesis_service, "synthesize", fake_synth)

    asyncio.run(market.generate_report("keyword", "yoga mat", "US", "sellersprite"))
    assert seen["src"] == "sellersprite"
    assert market.get_history(_user="bridge")[0]["data_source"] == "sellersprite"
    asyncio.run(market.generate_report("keyword", "yoga mat", "US", "sorftime"))
    assert seen["src"] == "sorftime"


def test_playbook_data_source_dispatch_and_prompt_label(monkeypatch, tmp_path):
    monkeypatch.setattr(playbook, "_history_db_path", lambda: str(tmp_path / "pb-source.sqlite3"))
    from app.services import sellersprite_service
    seen = {"pipeline": None, "source": None}

    async def ss_kw(q, m, prog):
        seen["pipeline"] = "sellersprite"
        return ({"ABA 排名趋势": {"rank": 12}}, [])

    async def sf_kw(q, m, prog):
        seen["pipeline"] = "sorftime"
        return ({"keyword_detail": {"volume": 100}}, [])

    async def fake_synth(mode, q, m, price, cost, data, skip_agent=False, source="Sorftime"):
        seen["source"] = source
        yield ("deepseek", "# playbook")

    monkeypatch.setattr(sellersprite_service, "keyword_pipeline", ss_kw)
    monkeypatch.setattr(sorftime_service, "keyword_pipeline", sf_kw)
    monkeypatch.setattr(playbook_synthesis_service, "synthesize", fake_synth)

    result = asyncio.run(playbook.generate_report(
        "keyword", "yoga mat", "US", "29.99", "8", "sellersprite",
    ))
    assert seen == {"pipeline": "sellersprite", "source": "卖家精灵"}
    assert result["data_source"] == "sellersprite"
    assert playbook.get_history(_user="bridge")[0]["data_source"] == "sellersprite"


def test_streams_report_actual_selected_data_source(monkeypatch):
    from app.services import sellersprite_service

    async def ss_kw(q, m, prog):
        return ({"keyword": {"rank": 1}}, [])

    async def fake_synth(*args, **kwargs):
        yield ("deepseek", "# report")

    monkeypatch.setattr(sellersprite_service, "keyword_pipeline", ss_kw)
    monkeypatch.setattr(ai_synthesis_service, "synthesize", fake_synth)

    async def collect():
        req = market.ResearchReq(mode="keyword", query="mat", marketplace="US", data_source="sellersprite")
        return "".join([chunk async for chunk in market._run_research(req)])

    output = asyncio.run(collect())
    assert '"type": "source"' in output
    assert '"actual": "sellersprite"' in output
    assert '"data_source_label": "卖家精灵"' in output


def test_selected_source_failure_never_silently_falls_back(monkeypatch):
    from app.services import sellersprite_service
    called = {"synth": False}

    async def failed_ss(q, m, prog):
        return ({}, ["卖家精灵 key 未配置"])

    async def forbidden_synth(*args, **kwargs):
        called["synth"] = True
        yield ("deepseek", "must not run")

    monkeypatch.setattr(sellersprite_service, "keyword_pipeline", failed_ss)
    monkeypatch.setattr(ai_synthesis_service, "synthesize", forbidden_synth)

    async def collect():
        req = market.ResearchReq(mode="keyword", query="mat", marketplace="US", data_source="sellersprite")
        return "".join([chunk async for chunk in market._run_research(req)])

    output = asyncio.run(collect())
    assert called["synth"] is False
    assert "卖家精灵 数据采集失败" in output
    assert "Sorftime" not in output


def test_market_ui_uses_server_side_sorftime_key_even_when_hermes_is_first(monkeypatch):
    calls = {"pipeline": 0, "native": 0}

    monkeypatch.setattr(ai_synthesis_service, "_text_provider_chain", lambda: ["hermes", "deepseek"])

    async def fake_pipeline(query, marketplace, progress):
        calls["pipeline"] += 1
        return {"product_report": {"asin": query}}, []

    async def forbidden_native(*args, **kwargs):
        calls["native"] += 1
        yield "hermes", "should not run"

    async def fake_synth(*args, **kwargs):
        yield "deepseek", "# report"

    monkeypatch.setattr(sorftime_service, "asin_pipeline", fake_pipeline)
    monkeypatch.setattr(ai_synthesis_service, "synthesize_native", forbidden_native)
    monkeypatch.setattr(ai_synthesis_service, "synthesize", fake_synth)

    async def collect():
        req = market.ResearchReq(mode="asin", query="B0TEST", marketplace="US")
        return "".join([chunk async for chunk in market._run_research(req)])

    output = asyncio.run(collect())
    assert calls == {"pipeline": 1, "native": 0}
    assert "# report" in output


def test_new_generate_tools_registered_and_listed():
    names = {t.name for t in awenops_tools.TOOLS}
    assert {"market_generate_report", "playbook_generate_report"} <= names
    listed = {t["name"] for t in awenops_tools.list_tools(module="market")["tools"]}
    assert "market_generate_report" in listed


def test_lingxing_optimizer_bridge_returns_completed_rule_result(monkeypatch):
    """The chat bridge must return candidates, not call a missing router helper."""
    from app.services import lingxing_optimizer, lingxing_service

    seen = {}

    async def fake_run_store(sid, progress=None, days=None):
        seen.update(sid=sid, progress=progress, days=days)
        return {"sid": sid, "window_days": days, "count": 1,
                "candidates": [{"lever": "否词"}]}

    monkeypatch.setattr(lingxing_optimizer, "run_store", fake_run_store)
    monkeypatch.setattr(lingxing_service, "is_master_enabled", lambda: True)

    res = asyncio.run(awenops_tools.call_tool(
        "lingxing_optimizer", {"sid": 113, "days": 3}))

    assert res["ok"] is True
    assert res["result"]["window_days"] == 3
    assert res["result"]["candidates"][0]["lever"] == "否词"
    assert seen == {"sid": 113, "progress": None, "days": 3}


def test_lingxing_optimizer_window_override_keeps_three_days(monkeypatch):
    """A requested 3-day patrol must not silently reuse/clamp the global window."""
    from app.services import lingxing_optimizer

    monkeypatch.setattr(
        lingxing_optimizer,
        "_cfg",
        lambda: {"lingxing_opt_exclude_recent_days": 2, "lingxing_opt_window_days": 30},
    )

    dates = lingxing_optimizer._window_dates(3)

    assert len(dates) == 3


def test_lingxing_optimizer_bridge_rejects_invalid_scope_before_fetch(monkeypatch):
    from app.services import lingxing_optimizer

    async def forbidden(*_args, **_kwargs):
        raise AssertionError("invalid scope must not reach Lingxing")

    monkeypatch.setattr(lingxing_optimizer, "run_store", forbidden)

    bad_sid = asyncio.run(awenops_tools.call_tool(
        "lingxing_optimizer", {"sid": 0, "days": 7}))
    bad_days = asyncio.run(awenops_tools.call_tool(
        "lingxing_optimizer", {"sid": 113, "days": 61}))

    assert bad_sid["ok"] is False and "sid" in bad_sid["detail"]
    assert bad_days["ok"] is False and "days" in bad_days["detail"]


def test_lingxing_optimizer_bridge_honors_master_switch(monkeypatch):
    from app.services import lingxing_optimizer, lingxing_service

    async def forbidden(*_args, **_kwargs):
        raise AssertionError("disabled integration must not reach Lingxing")

    monkeypatch.setattr(lingxing_service, "is_master_enabled", lambda: False)
    monkeypatch.setattr(lingxing_optimizer, "run_store", forbidden)

    res = asyncio.run(awenops_tools.call_tool(
        "lingxing_optimizer", {"sid": 113, "days": 7}))

    assert res["ok"] is False
    assert "总开关" in res["detail"]
