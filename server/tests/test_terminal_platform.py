"""服务器终端的跨平台回归测试。"""
from __future__ import annotations

import subprocess

from app.routers import terminal


def test_legacy_ttyd_is_unsupported_without_touching_systemctl_on_windows(monkeypatch):
    """Windows 只有 ConPTY 会话，没有 Linux 的 systemd/ttyd 主终端。"""
    monkeypatch.setattr(terminal, "_WINDOWS", True)
    # Make the regression deterministic even when this test itself runs on
    # Windows: the module-level platform decision must take precedence over a
    # Linux-looking runtime that happens to have systemctl available.
    monkeypatch.setattr(terminal.sys, "platform", "linux")
    monkeypatch.setattr(terminal.shutil, "which", lambda _name: "/usr/bin/systemctl")

    def unexpected_systemctl(*_args, **_kwargs):
        raise AssertionError("Windows 不能调用 systemctl")

    monkeypatch.setattr(terminal.subprocess, "run", unexpected_systemctl)

    status = terminal._legacy_ttyd_status()
    assert status == {
        "service": "ttyd",
        "supported": False,
        "active": False,
        "status": "unsupported",
        "substate": "windows",
        "url": "",
    }
    assert terminal._legacy_ttyd_action("start") == status
    assert terminal._legacy_ttyd_action("stop") == status


def test_legacy_ttyd_is_unsupported_when_systemctl_is_missing(monkeypatch):
    monkeypatch.setattr(terminal, "_WINDOWS", False)
    monkeypatch.setattr(terminal.sys, "platform", "linux")
    monkeypatch.setattr(terminal.shutil, "which", lambda _name: None)

    def unexpected_systemctl(*_args, **_kwargs):
        raise AssertionError("没有 systemctl 时不能尝试启动 ttyd")

    monkeypatch.setattr(terminal.subprocess, "run", unexpected_systemctl)
    status = terminal._legacy_ttyd_status()
    assert status["supported"] is False
    assert status["status"] == "unsupported"
    assert status["substate"] == "systemd-unavailable"


def test_legacy_ttyd_remains_supported_on_linux_with_systemctl(monkeypatch):
    monkeypatch.setattr(terminal, "_WINDOWS", False)
    monkeypatch.setattr(terminal.sys, "platform", "linux")
    monkeypatch.setattr(terminal.shutil, "which", lambda _name: "/usr/bin/systemctl")
    calls: list[list[str]] = []

    def fake_systemctl(args, **_kwargs):
        calls.append(args)
        if args[1] == "is-active":
            return subprocess.CompletedProcess(args, 0, stdout="active\n", stderr="")
        return subprocess.CompletedProcess(
            args,
            0,
            stdout="ActiveState=active\nSubState=running\n",
            stderr="",
        )

    monkeypatch.setattr(terminal.subprocess, "run", fake_systemctl)

    status = terminal._legacy_ttyd_status()
    assert status["supported"] is True
    assert status["active"] is True
    assert status["substate"] == "running"
    assert [call[1] for call in calls] == ["is-active", "show"]
