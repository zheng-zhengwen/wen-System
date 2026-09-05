"""One-turn, one-use write grants for the embedded agent (bridge protocol v2).

No credentials or raw tool arguments are retained here. Like remote approval
queues, grants live in the single backend process; restarting fails closed.
"""
from __future__ import annotations

import hashlib
import json
import threading
import time
import uuid
from typing import Any

from fastapi import HTTPException

PROTOCOL_VERSION = 2
TTL = 15 * 60
_LOCK = threading.Lock()
_CALLS: dict[str, dict[str, Any]] = {}
_REQUESTS: dict[str, str] = {}
_SESSION: dict[tuple[str, str], tuple[float, str]] = {}
_TURNS: dict[str, float] = {}


def open_turn(turn: str, expires: float) -> None:
    with _LOCK:
        _prune()
        _TURNS[turn] = expires


def _digest(arguments: dict) -> str:
    return hashlib.sha256(json.dumps(arguments, sort_keys=True, ensure_ascii=False,
                                    separators=(",", ":"), allow_nan=False).encode("utf-8")).hexdigest()


def _claims(principal: dict) -> dict:
    claims = principal.get("_bridge") or {}
    if (claims.get("protocol_version") != PROTOCOL_VERSION
            or claims.get("mode") not in {"remote", "auto"}
            or claims.get("turn") not in _TURNS or claims.get("expires", 0) <= time.time()):
        raise HTTPException(403, "approval_required")
    return claims


def _prune() -> None:
    now = time.time()
    for key in [key for key, expiry in _TURNS.items() if expiry <= now]:
        _TURNS.pop(key)
    for key in [key for key, row in _CALLS.items() if row["expires"] <= now]:
        _CALLS.pop(key)
    for rid in [rid for rid, cid in _REQUESTS.items() if cid not in _CALLS]:
        _REQUESTS.pop(rid)
    for key in [key for key, (expiry, _) in _SESSION.items() if expiry <= now]:
        _SESSION.pop(key)


def prepare(principal: dict, name: str, arguments: dict) -> dict:
    claims = _claims(principal)
    fingerprint = _digest(arguments)
    with _LOCK:
        _prune()
        if claims["turn"] not in _TURNS:
            raise HTTPException(403, "Bridge turn closed")
        if len(_CALLS) >= 4096:
            raise HTTPException(503, "Too many pending bridge operations")
        cid = uuid.uuid4().hex
        approved = claims["mode"] == "auto" or (claims["turn"], name) in _SESSION
        _CALLS[cid] = {"turn": claims["turn"], "name": name, "digest": fingerprint,
                       "expires": claims["expires"], "state": "approved" if approved else "pending"}
    return {"ok": True, "protocol_version": PROTOCOL_VERSION,
            "call_id": cid, "approval_required": not approved}


def bind_request(request_id: str, call_id: str, principal: dict) -> None:
    claims = _claims(principal)
    with _LOCK:
        _prune()
        row = _CALLS.get(call_id)
        if (not row or row["turn"] != claims["turn"] or row["state"] != "pending"
                or request_id in _REQUESTS or call_id in _REQUESTS.values()):
            raise HTTPException(409, "Bridge approval expired or belongs to another turn")
        _REQUESTS[request_id] = call_id


def decide(request_id: str, choice: str) -> None:
    """Grant before waking the agent, so a fast caller cannot race the decision."""
    with _LOCK:
        cid = _REQUESTS.get(request_id)
        if cid is None:
            return  # regular (non-board) approval
        row = _CALLS.get(cid)
        if not row or row["expires"] <= time.time() or row["state"] != "pending":
            raise HTTPException(409, "Bridge approval already handled or expired")
        row["state"] = "approved" if choice in {"approve", "session"} else "denied"
        if choice == "session":
            _SESSION[(row["turn"], row["name"])] = (row["expires"], request_id)


def revoke_request(request_id: str) -> None:
    with _LOCK:
        row = _CALLS.get(_REQUESTS.get(request_id, ""))
        if row:
            row["state"] = "denied"
        for key in [key for key, (_, rid) in _SESSION.items() if rid == request_id]:
            _SESSION.pop(key)


def consume(principal: dict, name: str, arguments: dict, call_id: str) -> bool:
    try:
        claims = _claims(principal)
        fingerprint = _digest(arguments)
    except (HTTPException, ValueError, TypeError):
        return False
    with _LOCK:
        _prune()
        row = _CALLS.get(call_id)
        if (claims["turn"] not in _TURNS or not row or row["state"] != "approved" or row["turn"] != claims["turn"]
                or row["name"] != name or row["digest"] != fingerprint):
            return False
        row["state"] = "consumed"  # atomic, before invoking any handler; never retry implicitly
        return True


def close_turn(principal: dict) -> None:
    turn = (principal.get("_bridge") or {}).get("turn")
    with _LOCK:
        _TURNS.pop(turn, None)
        for row in _CALLS.values():
            if row["turn"] == turn:
                row["state"] = "closed"
        for key in [key for key in _SESSION if key[0] == turn]:
            _SESSION.pop(key)
        _prune()
