"""领星可选 SSH 跳板的传输与配置契约。

这些测试不连接真实服务器；它们钉住的是：空配置保持直连、完整配置统一接管
OpenAPI/MCP 的 httpx 客户端、代理失败不偷跑直连，以及密码永不明文落盘/回显。
"""
from __future__ import annotations

import asyncio
import json
import select
import socket
import socketserver
import sys
import threading
from types import SimpleNamespace
from urllib.parse import urlsplit

import pytest

from app.core import hub_settings
from app.routers import hub_settings as settings_router
from app.services import lingxing_ssh_proxy as ssh_proxy


def _get_from(values):
    return lambda key, default=None: values.get(key, default)


def test_blank_config_keeps_existing_direct_httpx_path(monkeypatch):
    made = []

    class FakeClient:
        def __init__(self, **kwargs):
            made.append(kwargs)

    monkeypatch.setattr(ssh_proxy._hs, "get", _get_from({}))
    monkeypatch.setattr(ssh_proxy.httpx, "AsyncClient", FakeClient)

    client = asyncio.run(ssh_proxy.create_async_client(timeout=12.0))

    assert isinstance(client, FakeClient)
    assert made == [{"timeout": 12.0}]


def test_blank_ssh_does_not_reject_legacy_http_endpoint(monkeypatch):
    monkeypatch.setattr(ssh_proxy._hs, "get", _get_from({
        "lingxing_openapi_host": "http://legacy-openapi.example.test",
        "lingxing_mcp_url": "",
    }))
    assert ssh_proxy.load_config().enabled is False


def test_complete_config_routes_httpx_through_local_proxy(monkeypatch):
    values = {
        "lingxing_ssh_host": "jump.example.test",
        "lingxing_ssh_user": "proxy-user",
        "lingxing_ssh_password": "p@ss word",
        "lingxing_ssh_port": 2222,
        "lingxing_ssh_host_key": "SHA256:known",
        "lingxing_openapi_host": "https://openapi.lingxing.test",
        "lingxing_mcp_url": "https://mcp.lingxing.test/rpc",
    }
    made = []

    class FakeClient:
        def __init__(self, **kwargs):
            made.append(kwargs)

    monkeypatch.setattr(ssh_proxy._hs, "get", _get_from(values))
    monkeypatch.setattr(ssh_proxy.httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr(
        ssh_proxy._MANAGER, "proxy_url", lambda cfg: "http://127.0.0.1:43123"
    )

    asyncio.run(ssh_proxy.create_async_client(timeout=20.0))

    assert made == [{
        "timeout": 20.0,
        "proxy": "http://127.0.0.1:43123",
        "trust_env": False,
    }]


def test_partial_config_fails_closed_before_any_direct_client(monkeypatch):
    made = []
    monkeypatch.setattr(ssh_proxy._hs, "get", _get_from({
        "lingxing_ssh_host": "jump.example.test",
        "lingxing_ssh_user": "root",
        "lingxing_ssh_password": "",
        "lingxing_ssh_port": 22,
    }))
    monkeypatch.setattr(
        ssh_proxy.httpx, "AsyncClient", lambda **kwargs: made.append(kwargs)
    )

    with pytest.raises(ssh_proxy.SSHProxyError, match="密码"):
        asyncio.run(ssh_proxy.create_async_client())
    assert made == []


def test_proxy_start_failure_never_falls_back_to_direct(monkeypatch):
    made = []
    monkeypatch.setattr(ssh_proxy._hs, "get", _get_from({
        "lingxing_ssh_host": "jump.example.test",
        "lingxing_ssh_user": "root",
        "lingxing_ssh_password": "secret",
        "lingxing_ssh_port": 22,
        "lingxing_openapi_host": "https://openapi.lingxing.test",
    }))
    monkeypatch.setattr(
        ssh_proxy._MANAGER,
        "proxy_url",
        lambda cfg: (_ for _ in ()).throw(ssh_proxy.SSHProxyError("SSH 认证失败")),
    )
    monkeypatch.setattr(
        ssh_proxy.httpx, "AsyncClient", lambda **kwargs: made.append(kwargs)
    )

    with pytest.raises(ssh_proxy.SSHProxyError, match="认证失败"):
        asyncio.run(ssh_proxy.create_async_client())
    assert made == []


def test_settings_patch_normalizes_host_and_blank_host_clears_proxy(monkeypatch):
    monkeypatch.setattr(ssh_proxy._hs, "get", _get_from({}))
    saved = ssh_proxy.normalize_settings_patch({
        "lingxing_ssh_host": "  https://47.1.2.3/ ",
        "lingxing_ssh_user": " root ",
        "lingxing_ssh_password": "safe-P@ssword",
        "lingxing_ssh_port": "22",
    })
    assert saved["lingxing_ssh_host"] == "47.1.2.3"
    assert saved["lingxing_ssh_user"] == "root"
    assert saved["lingxing_ssh_port"] == 22

    cleared = ssh_proxy.normalize_settings_patch({
        "lingxing_ssh_host": "",
    })
    assert cleared == {
        "lingxing_ssh_host": "",
        "lingxing_ssh_user": "",
        "lingxing_ssh_password": "",
        "lingxing_ssh_port": 22,
        "lingxing_ssh_host_key": "",
    }


@pytest.mark.parametrize("port", [0, 65536, "not-a-port", None, 22.5, True])
def test_invalid_port_is_rejected(monkeypatch, port):
    monkeypatch.setattr(ssh_proxy._hs, "get", _get_from({}))
    with pytest.raises(ssh_proxy.SSHProxyError, match="端口"):
        ssh_proxy.normalize_settings_patch({
            "lingxing_ssh_host": "jump.example.test",
            "lingxing_ssh_user": "root",
            "lingxing_ssh_password": "secret",
            "lingxing_ssh_port": port,
        })


def test_host_and_port_must_be_separate(monkeypatch):
    monkeypatch.setattr(ssh_proxy._hs, "get", _get_from({}))
    with pytest.raises(ssh_proxy.SSHProxyError, match="分开填写"):
        ssh_proxy.normalize_settings_patch({
            "lingxing_ssh_host": "jump.example.test:2222",
            "lingxing_ssh_user": "root",
            "lingxing_ssh_password": "secret",
            "lingxing_ssh_port": 2222,
        })
    with pytest.raises(ssh_proxy.SSHProxyError, match="分开填写"):
        ssh_proxy.normalize_settings_patch({
            "lingxing_ssh_host": "https://jump.example.test:2222",
            "lingxing_ssh_user": "root",
            "lingxing_ssh_password": "secret",
            "lingxing_ssh_port": 2222,
        })


@pytest.mark.parametrize("host", ["bad host", "-bad.example", "bad_.example"])
def test_invalid_host_is_rejected(monkeypatch, host):
    monkeypatch.setattr(ssh_proxy._hs, "get", _get_from({}))
    with pytest.raises(ssh_proxy.SSHProxyError, match="主机格式"):
        ssh_proxy.normalize_settings_patch({
            "lingxing_ssh_host": host,
            "lingxing_ssh_user": "root",
            "lingxing_ssh_password": "secret",
            "lingxing_ssh_port": 22,
        })


def test_ssh_password_is_encrypted_at_rest_and_masked_from_settings_response(
    _isolate_data_dir,
):
    password = "jump-secret-P@ssword"
    hub_settings.save({
        "lingxing_ssh_host": "jump.example.test",
        "lingxing_ssh_user": "root",
        "lingxing_ssh_password": password,
        "lingxing_ssh_port": 22,
    })

    raw = (_isolate_data_dir / "hub_settings.json").read_text(encoding="utf-8")
    assert password not in raw
    assert json.loads(raw)["lingxing_ssh_password"].startswith("enc:v1:")
    assert hub_settings.get("lingxing_ssh_password") == password

    public = settings_router._settings_response(hub_settings.load())
    assert public["settings"]["lingxing_ssh_password"] == ""
    assert public["configured_secret_keys"] == ["lingxing_ssh_password"]
    assert password not in repr(public)


def test_generic_settings_endpoint_validates_and_never_echoes_ssh_password(
    _isolate_data_dir,
    monkeypatch,
):
    monkeypatch.setattr(ssh_proxy._MANAGER, "close", lambda: None)
    password = "endpoint-P@ssword"
    body = settings_router.SettingsPatch(settings={
        "lingxing_ssh_host": "jump.example.test",
        "lingxing_ssh_user": "proxy-user",
        "lingxing_ssh_password": password,
        "lingxing_ssh_port": 22,
    })
    response = asyncio.run(settings_router.patch_settings(body, _u="admin"))
    assert response["settings"]["lingxing_ssh_password"] == ""
    assert "lingxing_ssh_password" in response["configured_secret_keys"]
    assert password not in repr(response)

    partial = settings_router.SettingsPatch(settings={
        "lingxing_ssh_host": "other.example.test",
        "lingxing_ssh_user": "",
    })
    with pytest.raises(Exception) as exc:
        asyncio.run(settings_router.patch_settings(partial, _u="admin"))
    assert getattr(exc.value, "status_code", None) == 422


def test_host_key_change_is_rejected():
    with pytest.raises(ssh_proxy.SSHProxyError, match="主机指纹"):
        ssh_proxy.verify_host_key("SHA256:old", "SHA256:new")


def test_connect_proxy_only_allows_configured_lingxing_destinations():
    cfg = ssh_proxy.SSHProxyConfig(
        host="jump.example.test",
        user="root",
        password="secret",
        port=22,
        host_key="",
        destinations=(("openapi.lingxing.test", 443), ("mcp.lingxing.test", 8443)),
    )
    assert cfg.allows("OPENAPI.LINGXING.TEST", 443)
    assert cfg.allows("mcp.lingxing.test", 8443)
    assert not cfg.allows("example.com", 443)
    assert not cfg.allows("openapi.lingxing.test", 80)


def test_manager_authenticates_exact_password_and_pins_first_host_key(monkeypatch):
    authenticated = []
    saved = []

    class ServerKey:
        def asbytes(self):
            return b"stable-test-host-key"

    class FakeTransport:
        def __init__(self, sock):
            self.active = True

        def start_client(self, timeout):
            assert timeout == 12.0

        def get_remote_server_key(self):
            return ServerKey()

        def auth_password(self, user, password):
            authenticated.append((user, password))

        def is_authenticated(self):
            return True

        def is_active(self):
            return self.active

        def set_keepalive(self, seconds):
            assert seconds == 30

        def close(self):
            self.active = False

    monkeypatch.setitem(sys.modules, "paramiko", SimpleNamespace(Transport=FakeTransport))
    monkeypatch.setattr(ssh_proxy.socket, "create_connection", lambda *a, **k: object())
    monkeypatch.setattr(ssh_proxy._hs, "save", lambda values: saved.append(values) or values)
    manager = ssh_proxy._TunnelManager()
    cfg = ssh_proxy.SSHProxyConfig(
        host="jump.example.test", user="root", password="exact-P@ss word", port=22,
        host_key="", destinations=(("openapi.lingxing.test", 443),),
    )
    try:
        assert manager.proxy_url(cfg).startswith("http://127.0.0.1:")
        assert authenticated == [("root", "exact-P@ss word")]
        assert saved and saved[0]["lingxing_ssh_host_key"].startswith("SHA256:")
    finally:
        manager.close()


def test_openapi_and_mcp_both_use_shared_client_factory(monkeypatch):
    from app.services import lingxing_openapi, lingxing_service

    made = []

    class FakeClient:
        async def aclose(self):
            return None

    async def factory(**kwargs):
        made.append(kwargs)
        return FakeClient()

    monkeypatch.setattr(lingxing_openapi._ssh_proxy, "create_async_client", factory)
    assert isinstance(asyncio.run(lingxing_openapi._client(timeout=7)), FakeClient)

    monkeypatch.setattr(lingxing_service, "_url", lambda: "https://mcp.lingxing.test")
    monkeypatch.setattr(lingxing_service, "_key", lambda: "mcp-key")
    session = lingxing_service._McpSession(rate_limited=False)

    async def no_initialize():
        return None

    monkeypatch.setattr(session, "_initialize", no_initialize)

    async def enter():
        return await session.__aenter__()

    assert asyncio.run(enter()) is session
    assert made == [
        {"timeout": 7},
        {"timeout": lingxing_service._REQUEST_TIMEOUT_S},
    ]


def test_settings_change_closes_existing_tunnel(monkeypatch):
    closed = []
    monkeypatch.setattr(ssh_proxy._MANAGER, "close", lambda: closed.append(True))
    ssh_proxy.settings_changed(["unrelated"])
    assert closed == []
    ssh_proxy.settings_changed(["lingxing_ssh_password"])
    assert closed == [True]


def test_real_connection_failure_is_sanitized_and_does_not_leak_password():
    probe_socket = socket.socket()
    probe_socket.bind(("127.0.0.1", 0))
    unused_port = probe_socket.getsockname()[1]
    probe_socket.close()
    password = "never-echo-this-P@ss"
    manager = ssh_proxy._TunnelManager()
    cfg = ssh_proxy.SSHProxyConfig(
        host="127.0.0.1", user="proxy-user", password=password, port=unused_port,
        host_key="", destinations=(("openapi.lingxing.test", 443),),
    )
    try:
        with pytest.raises(ssh_proxy.SSHProxyError) as exc:
            manager.proxy_url(cfg)
        assert password not in str(exc.value)
        assert "SSH 跳板连接失败" in str(exc.value)
    finally:
        manager.close()


def test_real_paramiko_direct_tcpip_round_trip(monkeypatch):
    """Actual Paramiko client/server + loopback CONNECT proxy, no internet.

    This exercises the Windows-sensitive part that mocks cannot: selecting a
    Paramiko Channel beside a socket and relaying bytes in both directions.
    """
    import paramiko

    class Echo(socketserver.BaseRequestHandler):
        def handle(self):
            while True:
                data = self.request.recv(4096)
                if not data:
                    return
                self.request.sendall(data)

    class EchoServer(socketserver.ThreadingTCPServer):
        allow_reuse_address = True
        daemon_threads = True

    echo = EchoServer(("127.0.0.1", 0), Echo)
    echo_thread = threading.Thread(target=echo.serve_forever, daemon=True)
    echo_thread.start()

    ssh_listener = socket.socket()
    ssh_listener.bind(("127.0.0.1", 0))
    ssh_listener.listen(1)
    host_key = paramiko.RSAKey.generate(2048)
    server_errors = []

    class SSHServer(paramiko.ServerInterface):
        destination = None

        def check_auth_password(self, username, password):
            return (paramiko.AUTH_SUCCESSFUL
                    if (username, password) == ("proxy-user", "safe-P@ss")
                    else paramiko.AUTH_FAILED)

        def check_channel_direct_tcpip_request(self, chanid, origin, destination):
            self.destination = destination
            return paramiko.OPEN_SUCCEEDED

    def serve_ssh():
        transport = None
        upstream = None
        try:
            conn, _ = ssh_listener.accept()
            transport = paramiko.Transport(conn)
            transport.add_server_key(host_key)
            iface = SSHServer()
            transport.start_server(server=iface)
            channel = transport.accept(8)
            if channel is None or iface.destination is None:
                raise RuntimeError("direct-tcpip channel was not opened")
            upstream = socket.create_connection(iface.destination, timeout=5)
            while transport.is_active() and not channel.closed:
                readable, _, _ = select.select([channel, upstream], [], [], 1)
                for source in readable:
                    data = source.recv(4096)
                    if not data:
                        return
                    (upstream if source is channel else channel).sendall(data)
        except Exception as exc:  # surfaced in the test thread below
            server_errors.append(exc)
        finally:
            if upstream:
                upstream.close()
            if transport:
                transport.close()

    ssh_thread = threading.Thread(target=serve_ssh, daemon=True)
    ssh_thread.start()
    monkeypatch.setattr(ssh_proxy._hs, "save", lambda values: values)
    manager = ssh_proxy._TunnelManager()
    cfg = ssh_proxy.SSHProxyConfig(
        host="127.0.0.1", user="proxy-user", password="safe-P@ss",
        port=ssh_listener.getsockname()[1], host_key="",
        destinations=(("127.0.0.1", echo.server_address[1]),),
    )
    client = None
    try:
        proxy = urlsplit(manager.proxy_url(cfg))
        client = socket.create_connection((proxy.hostname, proxy.port), timeout=5)
        client.sendall(
            f"CONNECT 127.0.0.1:{echo.server_address[1]} HTTP/1.1\r\n"
            f"Host: 127.0.0.1:{echo.server_address[1]}\r\n\r\n".encode("ascii")
        )
        response = client.recv(4096)
        assert b"200 Connection Established" in response
        client.sendall(b"ssh-proxy-round-trip")
        assert client.recv(4096) == b"ssh-proxy-round-trip"
        assert server_errors == []
        blocked = socket.create_connection((proxy.hostname, proxy.port), timeout=5)
        try:
            blocked.sendall(b"CONNECT example.com:443 HTTP/1.1\r\nHost: example.com\r\n\r\n")
            assert b"403 Forbidden" in blocked.recv(4096)
        finally:
            blocked.close()
    finally:
        if client:
            client.close()
        manager.close()
        ssh_listener.close()
        echo.shutdown()
        echo.server_close()
