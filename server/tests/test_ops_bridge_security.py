"""Bridge writes must fail closed independently of the agent's UI state."""
from dataclasses import replace

import pytest
from starlette.requests import Request

from app.routers import awen_agent as router
from app.services import awenops_tools as tools
from app.services import ops_bridge_security as security
from fastapi import HTTPException
import json
from concurrent.futures import ThreadPoolExecutor


@pytest.mark.asyncio
@pytest.mark.parametrize("token_auth", [False, True])
async def test_no_approval_cannot_reach_destructive_handler(monkeypatch, token_auth):
    reached = []
    tool = replace(tools._TOOL_BY_NAME["listing_create_project"],
                   handler=lambda args: reached.append(args) or {"id": "mutation"})
    monkeypatch.setitem(tools._TOOL_BY_NAME, tool.name, tool)
    principal = tools.principal_from_token(tools.issue_bridge_token()) if token_auth else None
    result = await tools.call_tool(tool.name, {"name": "未批准的项目"}, principal=principal)
    assert reached == [], "read-only bridge reached a destructive handler"
    assert result["ok"] is False
    assert result["error"] == "approval_required"


def test_host_header_cannot_choose_bridge_destination(monkeypatch):
    monkeypatch.delenv("AWENOPS_BRIDGE_URL", raising=False)
    request = Request({"type": "http", "scheme": "http", "path": "/",
                       "headers": [(b"host", b"attacker.example")],
                       "server": ("127.0.0.1", 8001)})
    assert router._bridge_base_url(request) == "http://127.0.0.1:8001/api/awen-agent-bridge"


def principal(mode="remote"):
    return tools.principal_from_token(tools.issue_bridge_token(mode))


def test_grant_binds_exact_arguments_and_turn_and_can_only_run_once():
    who = principal()
    args = {"name": "中文", "nested": {"price": 12}}
    cid = security.prepare(who, "write", args)["call_id"]
    assert not security.consume(who, "write", args, cid)
    security.bind_request("approve-exact", cid, who)
    security.decide("approve-exact", "approve")
    assert not security.consume(who, "different", args, cid)
    assert not security.consume(who, "write", {"name": "changed"}, cid)
    assert not security.consume(principal(), "write", args, cid)
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: security.consume(who, "write", args, cid), range(12)))
    assert results.count(True) == 1


@pytest.mark.parametrize("choice", ["deny", "abort", "timeout"])
def test_denied_or_timed_out_approval_never_runs(choice):
    who = principal()
    cid = security.prepare(who, "write", {})["call_id"]
    rid = "denial-" + choice
    security.bind_request(rid, cid, who)
    if choice == "timeout":
        security.revoke_request(rid)
    else:
        security.decide(rid, choice)
    assert not security.consume(who, "write", {}, cid)
    with pytest.raises(HTTPException):
        security.decide(rid, "approve")


def test_session_approval_does_not_authorize_other_tools_or_turns():
    who = principal()
    cid = security.prepare(who, "one", {})["call_id"]
    security.bind_request("session-grant", cid, who)
    security.decide("session-grant", "session")
    assert security.prepare(who, "one", {"next": 1})["approval_required"] is False
    assert security.prepare(who, "two", {})["approval_required"] is True
    assert security.prepare(principal(), "one", {})["approval_required"] is True
    security.revoke_request("session-grant")
    assert security.prepare(who, "one", {})["approval_required"] is True


def test_auto_grant_dies_with_turn_and_rejects_non_json_numbers():
    who = principal("auto")
    cid = security.prepare(who, "write", {})["call_id"]
    with pytest.raises(ValueError):
        security.prepare(who, "write", {"n": float("nan")})
    security.close_turn(who)
    assert not security.consume(who, "write", {}, cid)
    with pytest.raises(HTTPException):
        security.prepare(who, "write", {})


def test_expired_grant_cannot_be_used_or_reapproved():
    who = principal()
    cid = security.prepare(who, "write", {})["call_id"]
    security.bind_request("expire-grant", cid, who)
    security._CALLS[cid]["expires"] = 0
    with pytest.raises(HTTPException):
        security.decide("expire-grant", "approve")
    assert not security.consume(who, "write", {}, cid)


def test_sse_registers_approval_before_exposing_frame(monkeypatch):
    who = principal()
    cid = security.prepare(who, "write", {})["call_id"]
    data = {"request_id": "early-click", "bridge_call_id": cid, "title": "test"}
    frame = ("event: permission_request\ndata: " + json.dumps(data) + "\n\n").encode()
    monkeypatch.setattr(router, "_notify_approval", lambda *a: None)
    stream = router._tee_session_events(iter([frame]), "admin", persist=False, bridge_principal=who)
    assert next(stream) == frame
    assert router._approval_owner("early-click") == "admin"
    # Dispatch immediately when the agent is woken to reproduce the decision race.
    seen = []
    monkeypatch.setattr(router.svc, "chat_permission", lambda body: seen.append(
        security.consume(who, "write", {}, cid)) or {"ok": True})
    router.chat_permission(router.ChatPermissionBody(request_id="early-click", choice="approve"), user="admin")
    assert seen == [True]
    stream.close()


@pytest.mark.asyncio
async def test_auto_grant_executes_handler_once(monkeypatch):
    who = principal("auto")
    reached = []
    tool = replace(tools._TOOL_BY_NAME["listing_create_project"], handler=lambda args: reached.append(args))
    monkeypatch.setitem(tools._TOOL_BY_NAME, tool.name, tool)
    cid = tools.prepare_tool(tool.name, {"name": "approved"}, who)["call_id"]
    assert (await tools.call_tool(tool.name, {"name": "approved"}, who, cid))["ok"] is True
    assert (await tools.call_tool(tool.name, {"name": "approved"}, who, cid))["ok"] is False
    assert len(reached) == 1
