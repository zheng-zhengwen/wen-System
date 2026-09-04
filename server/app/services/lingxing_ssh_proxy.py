"""Optional SSH egress for every LingXing HTTP client.

When the four SSH fields are blank, callers receive a normal ``httpx`` client
and retain the existing direct/system-proxy behaviour.  A complete SSH config
starts a loopback-only HTTP CONNECT proxy; CONNECT channels are carried through
Paramiko ``direct-tcpip`` channels, so DNS resolution and the public source IP
both belong to the jump host.

The proxy is deliberately LingXing-specific: it accepts only the configured
OpenAPI and MCP host/port pairs.  It is not a general-purpose proxy for other
processes on the machine.
"""
from __future__ import annotations

import asyncio
import atexit
import base64
import hashlib
import hmac
import ipaddress
import logging
import re
import socket
import socketserver
import threading
from dataclasses import dataclass, replace
from typing import Any, Dict, Tuple
from urllib.parse import urlsplit

import httpx

from app.core import hub_settings as _hs

logger = logging.getLogger("awen.lingxing.ssh_proxy")

_SSH_KEYS = frozenset({
    "lingxing_ssh_host",
    "lingxing_ssh_user",
    "lingxing_ssh_password",
    "lingxing_ssh_port",
    "lingxing_ssh_host_key",
})
_CONNECT_TIMEOUT_S = 12.0
_MAX_PROXY_HEADER = 16 * 1024


class SSHProxyError(RuntimeError):
    """A safe, user-facing SSH proxy configuration or connection failure."""


@dataclass(frozen=True)
class SSHProxyConfig:
    host: str
    user: str
    password: str
    port: int
    host_key: str
    destinations: Tuple[Tuple[str, int], ...]

    @property
    def enabled(self) -> bool:
        return bool(self.host or self.user or self.password)

    def validate(self) -> None:
        if not self.enabled:
            return
        missing = []
        if not self.host:
            missing.append("主机")
        if not self.user:
            missing.append("用户")
        if not self.password:
            missing.append("密码")
        if missing:
            raise SSHProxyError(f"SSH 跳板配置不完整：缺少{'、'.join(missing)}")
        if not 1 <= self.port <= 65535:
            raise SSHProxyError("SSH 端口必须在 1–65535 之间")
        if not self.destinations:
            raise SSHProxyError("没有可通过 SSH 转发的领星 HTTPS 地址")

    def allows(self, host: str, port: int) -> bool:
        target = (str(host or "").rstrip(".").lower(), int(port))
        return target in self.destinations


def _normalise_host(raw: Any) -> str:
    value = str(raw or "").strip()
    if not value:
        return ""
    if "://" in value:
        parsed = urlsplit(value)
        if parsed.scheme.lower() not in ("http", "https") or not parsed.hostname:
            raise SSHProxyError("SSH 主机格式无效，请填写 IP 或域名")
        if parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise SSHProxyError("SSH 主机只填写 IP 或域名，不要包含账号、参数或路径")
        if parsed.path not in ("", "/"):
            raise SSHProxyError("SSH 主机只填写 IP 或域名，不要包含路径")
        try:
            explicit_port = parsed.port
        except ValueError as exc:
            raise SSHProxyError("SSH 主机中的端口格式无效") from exc
        if explicit_port is not None:
            raise SSHProxyError("SSH 主机与端口请分开填写")
        value = parsed.hostname
    elif any(ch in value for ch in "/?#@"):
        raise SSHProxyError("SSH 主机只填写 IP 或域名")
    elif ":" in value:
        try:
            ipaddress.ip_address(value)
        except ValueError as exc:
            raise SSHProxyError("SSH 主机与端口请分开填写") from exc
    value = value.rstrip(".").lower()
    try:
        return ipaddress.ip_address(value).compressed.lower()
    except ValueError:
        try:
            ascii_host = value.encode("idna").decode("ascii")
        except UnicodeError as exc:
            raise SSHProxyError("SSH 主机格式无效，请填写 IP 或域名") from exc
        labels = ascii_host.split(".")
        if (
            len(ascii_host) > 253
            or any(not re.fullmatch(r"(?!-)[a-z0-9-]{1,63}(?<!-)", label) for label in labels)
        ):
            raise SSHProxyError("SSH 主机格式无效，请填写 IP 或域名")
        return ascii_host


def _port(raw: Any) -> int:
    if raw == "":
        value = 22
    elif isinstance(raw, bool) or not re.fullmatch(r"[0-9]+", str(raw)):
        raise SSHProxyError("SSH 端口必须是 1–65535 的整数")
    else:
        try:
            value = int(raw)
        except (TypeError, ValueError) as exc:
            raise SSHProxyError("SSH 端口必须是 1–65535 的整数") from exc
    if not 1 <= value <= 65535:
        raise SSHProxyError("SSH 端口必须在 1–65535 之间")
    return value


def _destination(raw_url: Any) -> Tuple[str, int] | None:
    value = str(raw_url or "").strip()
    if not value:
        return None
    # Preserve the existing LingXing MCP compatibility rule.
    if value.lower().startswith("http://") and "lingxing.com" in value.lower():
        value = "https://" + value[len("http://"):]
    parsed = urlsplit(value)
    if parsed.scheme.lower() != "https" or not parsed.hostname:
        raise SSHProxyError("启用 SSH 跳板时，领星 OpenAPI/MCP 地址必须使用 https")
    return (parsed.hostname.rstrip(".").lower(), parsed.port or 443)


def load_config() -> SSHProxyConfig:
    host = _normalise_host(_hs.get("lingxing_ssh_host", ""))
    user = str(_hs.get("lingxing_ssh_user", "") or "").strip()
    password = str(_hs.get("lingxing_ssh_password", "") or "")
    # Do not impose the SSH transport's HTTPS requirement on legacy/direct
    # installs.  Endpoint validation belongs only to the enabled proxy path.
    destinations = []
    if host or user or password:
        for key in ("lingxing_openapi_host", "lingxing_mcp_url"):
            destination = _destination(_hs.get(key, ""))
            if destination and destination not in destinations:
                destinations.append(destination)
    config = SSHProxyConfig(
        host=host,
        user=user,
        password=password,
        port=_port(_hs.get("lingxing_ssh_port", 22)),
        host_key=str(_hs.get("lingxing_ssh_host_key", "") or "").strip(),
        destinations=tuple(destinations),
    )
    config.validate()
    return config


def normalize_settings_patch(updates: Dict[str, Any]) -> Dict[str, Any]:
    """Validate/normalise an incoming generic settings patch.

    Explicitly blanking the host is the user-facing "clear and use direct"
    operation and clears every SSH field, including the pinned host key.
    """
    out = dict(updates)
    if not (_SSH_KEYS & out.keys()):
        return out
    if "lingxing_ssh_host" in out and not str(out["lingxing_ssh_host"] or "").strip():
        out.update({
            "lingxing_ssh_host": "",
            "lingxing_ssh_user": "",
            "lingxing_ssh_password": "",
            "lingxing_ssh_port": 22,
            "lingxing_ssh_host_key": "",
        })
        return out

    previous = {
        key: _hs.get(key, "" if key != "lingxing_ssh_port" else 22)
        for key in _SSH_KEYS
    }
    merged = {**previous, **{key: out[key] for key in _SSH_KEYS if key in out}}
    host = _normalise_host(merged["lingxing_ssh_host"])
    user = str(merged["lingxing_ssh_user"] or "").strip()
    password = str(merged["lingxing_ssh_password"] or "")
    port = _port(merged["lingxing_ssh_port"])
    missing = [label for label, value in (("主机", host), ("用户", user), ("密码", password)) if not value]
    if missing:
        raise SSHProxyError(f"SSH 跳板配置不完整：缺少{'、'.join(missing)}")

    old_identity = (
        _normalise_host(previous["lingxing_ssh_host"]),
        str(previous["lingxing_ssh_user"] or "").strip(),
        _port(previous["lingxing_ssh_port"]),
    )
    new_identity = (host, user, port)
    host_key = str(merged["lingxing_ssh_host_key"] or "").strip()
    if new_identity != old_identity:
        host_key = ""  # a different server must establish a new TOFU pin
    out.update({
        "lingxing_ssh_host": host,
        "lingxing_ssh_user": user,
        "lingxing_ssh_password": password,
        "lingxing_ssh_port": port,
        "lingxing_ssh_host_key": host_key,
    })
    return out


def verify_host_key(expected: str, actual: str) -> None:
    if expected and not hmac.compare_digest(expected.strip(), actual.strip()):
        raise SSHProxyError(
            "SSH 主机指纹与首次连接时不一致；为防止中间人攻击已拒绝连接。"
            "如服务器确实重装，请清除跳板配置后重新填写。"
        )


def _fingerprint(server_key: Any) -> str:
    digest = hashlib.sha256(server_key.asbytes()).digest()
    return "SHA256:" + base64.b64encode(digest).decode("ascii").rstrip("=")


class _ConnectHandler(socketserver.BaseRequestHandler):
    server: "_ConnectServer"

    def _reply(self, status: str) -> None:
        self.request.sendall(f"HTTP/1.1 {status}\r\nConnection: close\r\n\r\n".encode("ascii"))

    def handle(self) -> None:
        channel = None
        try:
            self.request.settimeout(_CONNECT_TIMEOUT_S)
            header = bytearray()
            while b"\r\n\r\n" not in header:
                chunk = self.request.recv(4096)
                if not chunk:
                    return
                header.extend(chunk)
                if len(header) > _MAX_PROXY_HEADER:
                    self._reply("431 Request Header Fields Too Large")
                    return
            first = bytes(header).split(b"\r\n", 1)[0].decode("ascii", "replace")
            parts = first.split()
            if len(parts) != 3 or parts[0].upper() != "CONNECT":
                self._reply("405 Method Not Allowed")
                return
            target = urlsplit("//" + parts[1])
            host = target.hostname or ""
            port = target.port or 443
            if not self.server.config.allows(host, port):
                self._reply("403 Forbidden")
                return
            channel = self.server.manager.open_channel(host, port, self.client_address)
            self._reply("200 Connection Established")
            self.request.settimeout(None)
            while True:
                import select
                readable, _, _ = select.select([self.request, channel], [], [], 30.0)
                if not readable:
                    if not self.server.manager.is_active():
                        return
                    continue
                for source in readable:
                    data = source.recv(65536)
                    if not data:
                        return
                    (channel if source is self.request else self.request).sendall(data)
        except Exception:
            logger.debug("领星 SSH CONNECT 通道关闭", exc_info=True)
            if channel is None:
                try:
                    self._reply("502 Bad Gateway")
                except OSError:
                    pass
        finally:
            if channel is not None:
                channel.close()


class _ConnectServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True
    block_on_close = False

    def __init__(self, manager: "_TunnelManager", config: SSHProxyConfig):
        self.manager = manager
        self.config = config
        super().__init__(("127.0.0.1", 0), _ConnectHandler)


class _TunnelManager:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._config: SSHProxyConfig | None = None
        self._transport: Any = None
        self._server: _ConnectServer | None = None
        self._thread: threading.Thread | None = None
        self._fingerprint = ""

    def _connect(self, config: SSHProxyConfig) -> SSHProxyConfig:
        try:
            import paramiko
        except ImportError as exc:
            raise SSHProxyError("SSH 跳板依赖未安装，请安装后端 requirements.txt 后重试") from exc

        sock = None
        transport = None
        try:
            sock = socket.create_connection((config.host, config.port), timeout=_CONNECT_TIMEOUT_S)
            transport = paramiko.Transport(sock)
            transport.start_client(timeout=_CONNECT_TIMEOUT_S)
            server_key = transport.get_remote_server_key()
            fingerprint = _fingerprint(server_key)
            verify_host_key(config.host_key, fingerprint)
            transport.auth_password(config.user, config.password)
            if not transport.is_authenticated():
                raise SSHProxyError("SSH 用户名或密码验证失败")
            transport.set_keepalive(30)
        except SSHProxyError:
            if transport:
                transport.close()
            elif sock:
                sock.close()
            raise
        except Exception as exc:
            if transport:
                transport.close()
            elif sock:
                sock.close()
            name = type(exc).__name__
            if name in ("AuthenticationException", "BadAuthenticationType", "UnableToAuthenticate"):
                raise SSHProxyError("SSH 用户名或密码验证失败") from exc
            raise SSHProxyError(f"SSH 跳板连接失败：{name}") from exc

        if not config.host_key:
            # Trust on first successful authentication, then pin all reconnects.
            _hs.save({"lingxing_ssh_host_key": fingerprint})
            config = replace(config, host_key=fingerprint)
        self._transport = transport
        self._fingerprint = fingerprint
        return config

    def proxy_url(self, config: SSHProxyConfig) -> str:
        config.validate()
        with self._lock:
            if (
                self._config == config
                and self._server is not None
                and self._transport is not None
                and self._transport.is_active()
            ):
                host, port = self._server.server_address
                return f"http://{host}:{port}"
            self._close_locked()
            config = self._connect(config)
            server = _ConnectServer(self, config)
            thread = threading.Thread(
                target=server.serve_forever,
                name="lingxing-ssh-connect-proxy",
                daemon=True,
            )
            thread.start()
            self._config = config
            self._server = server
            self._thread = thread
            host, port = server.server_address
            logger.info(
                "领星 SSH 跳板已连接 %s@%s:%s，允许目标数=%s",
                config.user,
                config.host,
                config.port,
                len(config.destinations),
            )
            return f"http://{host}:{port}"

    def open_channel(self, host: str, port: int, origin: tuple) -> Any:
        with self._lock:
            if self._transport is None or not self._transport.is_active():
                raise SSHProxyError("SSH 跳板连接已断开")
            return self._transport.open_channel("direct-tcpip", (host, port), origin)

    def is_active(self) -> bool:
        with self._lock:
            return bool(self._transport is not None and self._transport.is_active())

    def status(self) -> Dict[str, Any]:
        with self._lock:
            return {"active": self.is_active(), "fingerprint": self._fingerprint}

    def _close_locked(self) -> None:
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()
        if self._transport is not None:
            self._transport.close()
        self._server = None
        self._transport = None
        self._thread = None
        self._config = None
        self._fingerprint = ""

    def close(self) -> None:
        with self._lock:
            self._close_locked()


_MANAGER = _TunnelManager()
atexit.register(_MANAGER.close)


def settings_changed(keys: Any) -> None:
    """Drop an established tunnel when its credentials or destinations change."""
    watched = _SSH_KEYS | {"lingxing_openapi_host", "lingxing_mcp_url"}
    if watched.intersection(set(keys)):
        _MANAGER.close()


def public_status() -> Dict[str, Any]:
    raw = {
        "host": str(_hs.get("lingxing_ssh_host", "") or "").strip(),
        "user": str(_hs.get("lingxing_ssh_user", "") or "").strip(),
        "password_present": bool(_hs.get("lingxing_ssh_password", "")),
        "port": _hs.get("lingxing_ssh_port", 22),
        "host_key": str(_hs.get("lingxing_ssh_host_key", "") or "").strip(),
    }
    try:
        config = load_config()
        raw.update({
            "configured": config.enabled,
            "host": config.host,
            "user": config.user,
            "port": config.port,
            "host_key": config.host_key,
            "error": "",
        })
    except SSHProxyError as exc:
        raw.update({"configured": bool(raw["host"] or raw["user"] or raw["password_present"]), "error": str(exc)})
    raw.update(_MANAGER.status())
    if not raw.get("fingerprint"):
        raw["fingerprint"] = raw.get("host_key", "")
    return raw


async def create_async_client(**kwargs: Any) -> httpx.AsyncClient:
    """Create the one approved HTTP client path for both LingXing backends."""
    config = load_config()
    if not config.enabled:
        return httpx.AsyncClient(**kwargs)
    proxy = await asyncio.to_thread(_MANAGER.proxy_url, config)
    # Never inherit HTTP_PROXY/HTTPS_PROXY on top of the explicit SSH route.
    return httpx.AsyncClient(proxy=proxy, trust_env=False, **kwargs)


async def probe() -> Dict[str, Any]:
    config = load_config()
    if not config.enabled:
        return {"configured": False, "active": False, "mode": "direct"}
    started = asyncio.get_running_loop().time()
    await asyncio.to_thread(_MANAGER.proxy_url, config)
    state = public_status()
    return {
        "ok": True,
        "configured": True,
        "active": True,
        "mode": "ssh",
        "host": config.host,
        "port": config.port,
        "user": config.user,
        "fingerprint": state.get("fingerprint", ""),
        "latency_ms": round((asyncio.get_running_loop().time() - started) * 1000),
    }
