"""Consumer contract: actual Agent tools + RemoteApproval against actual Ops routes.

No LLM, external API, or production mutation is involved. CI installs the selected
awen-agent dependency; running against an old dependency must expose the mismatch.
"""
import asyncio
import json
import threading
from dataclasses import replace

import pytest

pytest.importorskip("awen_agent")
from awen_agent import agent_tools, service as agent_service
from app.routers import awen_agent as router
from app.services import awenops_tools as tools


@pytest.mark.parametrize("choice,expected", [("approve", 1), ("deny", 0), ("abort", 0)])
def test_cross_repository_remote_write_contract(monkeypatch, tmp_path, choice, expected):
    monkeypatch.setenv("AWEN_HOME", str(tmp_path / "agent"))
    token = tools.issue_bridge_token("remote")
    who = tools.principal_from_token(token)
    reached, frames, errors = [], [], []
    ready = threading.Event()
    tool = replace(tools._TOOL_BY_NAME["listing_create_project"],
                   handler=lambda args: reached.append(args) or {"id": "approved"})
    monkeypatch.setitem(tools._TOOL_BY_NAME, tool.name, tool)
    monkeypatch.setattr(router, "_notify_approval", lambda *a: None)

    def bridge(ctx, path, payload, timeout=20):
        auth = "Bearer " + token
        if path == "/tools":
            return router.bridge_tools(router.OpsToolsListBody(), auth)
        body = router.OpsToolCallBody(**payload)
        if path == "/prepare":
            return router.bridge_prepare(body, auth)
        return asyncio.run(router.bridge_call(body, auth))

    def emit(event, data):
        frame = (f"event: {event}\ndata: " + json.dumps(data) + "\n\n").encode()
        stream = router._tee_session_events(iter([frame]), "admin", persist=False, bridge_principal=who)
        next(stream)  # registration happens before the frame reaches the browser
        frames.append((stream, data))
        ready.set()

    monkeypatch.setattr(agent_tools, "_ops_bridge_request", bridge)
    monkeypatch.setattr(router.svc, "chat_permission", lambda body: {
        "ok": agent_service.resolve_permission(body["request_id"], body["choice"])})
    ctx = agent_tools.ToolContext(execute=True)
    ctx.ops_bridge = {"base_url": "http://127.0.0.1/api/awen-agent-bridge", "token": token, "protocol_version": 2}
    ctx.perm.prompt_fn = agent_service.RemoteApproval(emit, "test-contract", timeout=5).prompt

    def run():
        try:
            agent_tools._t_awen_ops_call_tool({"name": tool.name, "arguments": {"name": "中文项目"}}, ctx)
        except Exception as exc:
            errors.append(exc)

    worker = threading.Thread(target=run, daemon=True)
    worker.start()
    try:
        assert ready.wait(5), f"Agent did not request an Ops-bound approval: {errors}"
        request = frames[0][1]
        assert request["bridge_call_id"]
        assert not reached
        router.chat_permission(router.ChatPermissionBody(request_id=request["request_id"], choice=choice), user="admin")
        worker.join(5)
        assert not worker.is_alive()
        assert errors == []
        assert len(reached) == expected
        assert ctx.executed_writes is bool(expected)
    finally:
        for stream, data in frames:
            agent_service.resolve_permission(data["request_id"], "deny")
            stream.close()
        worker.join(6)
