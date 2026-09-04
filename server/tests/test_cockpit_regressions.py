"""运营驾驶舱跨层回归：店铺作用域、并发取数、日志脱敏与运行器契约。"""
from __future__ import annotations

import asyncio
import logging

import pytest
from fastapi import HTTPException

from app.core import obs
from app.routers import ad_audit as ad_audit_router
from app.routers import cockpit
from app.services import lingxing_data
from app.services import runners


def test_ads_route_refuses_an_implicit_all_store_scan(monkeypatch):
    called = False

    async def fake_board(*args, **kwargs):
        nonlocal called
        called = True
        return {}

    monkeypatch.setattr(cockpit._ads, "board", fake_board)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(cockpit.ads())

    assert exc.value.status_code == 400
    assert "店铺" in str(exc.value.detail)
    assert called is False


def test_promotions_route_refuses_an_implicit_all_store_scan(monkeypatch):
    called = False

    async def fake_board(*args, **kwargs):
        nonlocal called
        called = True
        return {}

    monkeypatch.setattr(cockpit._promo, "board", fake_board)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(cockpit.promotions())

    assert exc.value.status_code == 400
    assert "店铺" in str(exc.value.detail)
    assert called is False


def test_same_dataset_request_is_coalesced(monkeypatch):
    calls = 0

    monkeypatch.setattr(lingxing_data, "_cache_get", lambda *args, **kwargs: None)
    monkeypatch.setattr(lingxing_data, "_cache_put", lambda *args, **kwargs: "2026-09-03T00:00:00+00:00")

    async def fake_read(*args, **kwargs):
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.02)
        return {"data": [{"sid": 101}]}

    monkeypatch.setattr(lingxing_data._gw, "call_openapi_read", fake_read)

    async def run():
        return await asyncio.gather(
            lingxing_data.fetch_dataset("sellers", {}, caller="test-a"),
            lingxing_data.fetch_dataset("sellers", {}, caller="test-b"),
        )

    first, second = asyncio.run(run())
    assert calls == 1
    assert first["rows"] == second["rows"] == [{"sid": 101}]


def test_http_log_filter_redacts_lingxing_query_secrets():
    record = logging.LogRecord(
        "httpx",
        logging.INFO,
        __file__,
        1,
        "POST https://example.test/token?appSecret=secret-a&refreshToken=secret-b&access_token=secret-c&sign=secret-d",
        (),
        None,
    )
    assert obs._RequestIdFilter().filter(record) is True
    rendered = record.getMessage()
    for secret in ("secret-a", "secret-b", "secret-c", "secret-d"):
        assert secret not in rendered
    assert rendered.count("***") == 4


def test_existing_log_files_are_scrubbed_on_upgrade(tmp_path):
    directory = tmp_path / "logs"
    directory.mkdir()
    current = directory / "awenops.log"
    rotated = directory / "awenops.log.1"
    current.write_text("GET /token?appSecret=old-secret&sign=old-sign\n", encoding="utf-8")
    rotated.write_text('{"ssh_password":"old-password"}\n', encoding="utf-8")

    obs._scrub_existing_logs(tmp_path)

    assert "old-secret" not in current.read_text(encoding="utf-8")
    assert "old-sign" not in current.read_text(encoding="utf-8")
    assert "old-password" not in rotated.read_text(encoding="utf-8")
    assert current.read_text(encoding="utf-8").count("***") == 2


def test_ad_audit_runner_route_uses_shared_runner_matrix(monkeypatch):
    expected = [{"name": "codex", "available": True}]
    monkeypatch.setattr(runners, "runner_status", lambda: expected)
    assert ad_audit_router.ad_runners(_user="test") == {"runners": expected}
