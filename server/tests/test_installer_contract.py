"""Installer source and cross-platform text-output regression tests."""
from __future__ import annotations

import asyncio
import shutil
import sys
from pathlib import Path

import pytest

from app.core import proc as proc_core
from app.routers import setup


REPO_ROOT = Path(__file__).resolve().parents[2]
CANONICAL_AGENT_REPO = "https://github.com/zheng-zhengwen/awen-agent.git"
STALE_AGENT_SLUG = "Hector-xue" + "/awen-agent"
TEXT_SUFFIXES = {
    ".md",
    ".py",
    ".ps1",
    ".sh",
    ".toml",
    ".yml",
    ".yaml",
}
IGNORED_PARTS = {".git", ".venv", "node_modules", "data", "dist", "__pycache__"}
UTF8_BOM = b"\xef\xbb\xbf"


def _project_text_files() -> list[Path]:
    files: list[Path] = []
    for path in REPO_ROOT.rglob("*"):
        if not path.is_file() or any(part in IGNORED_PARTS for part in path.parts):
            continue
        if path.suffix.lower() in TEXT_SUFFIXES or path.name == "Dockerfile":
            files.append(path)
    return files


def test_all_agent_consumers_use_the_canonical_repository() -> None:
    stale: list[str] = []
    canonical: list[str] = []
    for path in _project_text_files():
        text = path.read_text(encoding="utf-8-sig")
        relative = str(path.relative_to(REPO_ROOT))
        if STALE_AGENT_SLUG in text:
            stale.append(relative)
        if CANONICAL_AGENT_REPO in text:
            canonical.append(relative)

    assert stale == []
    assert {
        "Dockerfile",
        str(Path("scripts/install-components.ps1")),
        str(Path("scripts/install.ps1")),
        str(Path("scripts/install.sh")),
        str(Path("server/app/routers/setup.py")),
        str(Path("server/app/services/awen_agent_service.py")),
    }.issubset(set(canonical))


def test_non_ascii_powershell_scripts_have_a_utf8_bom() -> None:
    missing: list[str] = []
    for path in REPO_ROOT.rglob("*.ps1"):
        if any(part in IGNORED_PARTS for part in path.parts):
            continue
        raw = path.read_bytes()
        body = raw[len(UTF8_BOM):] if raw.startswith(UTF8_BOM) else raw
        if any(byte >= 0x80 for byte in body) and not raw.startswith(UTF8_BOM):
            missing.append(str(path.relative_to(REPO_ROOT)))

    assert missing == []


@pytest.mark.parametrize(
    ("text", "encoding", "preferred"),
    [
        ("安装完成：中文路径 🚀", "utf-8", "cp936"),
        ("安装失败：请检查仓库", "cp936", "cp936"),
        ("café déjà vu", "cp1252", "cp1252"),
    ],
)
def test_process_output_decoder_handles_utf8_and_native_code_pages(
    text: str,
    encoding: str,
    preferred: str,
) -> None:
    decoder = getattr(proc_core, "decode_process_output", None)
    assert decoder is not None, "a shared subprocess decoder is required"

    decoded = decoder(text.encode(encoding), preferred_encoding=preferred)

    assert decoded == text
    assert "\ufffd" not in decoded


def test_process_output_decoder_escapes_truly_unknown_bytes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(proc_core, "_windows_output_encodings", lambda: [])
    monkeypatch.setattr(proc_core.locale, "getpreferredencoding", lambda _setlocale=False: "ascii")
    decoded = proc_core.decode_process_output(
        b"broken: \xff",
        preferred_encoding="ascii",
    )

    assert "\ufffd" not in decoded
    assert "\\xff" in decoded


def test_powershell_utf8_wrapper_quotes_paths_and_values() -> None:
    command = proc_core.powershell_utf8_script_command(
        "powershell.exe",
        Path("C:/O'Brien/安装.ps1"),
        named_args={"Component": "awen'agent"},
    )

    assert command[:5] == [
        "powershell.exe",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
    ]
    assert "[Console]::OutputEncoding=$utf8" in command[5]
    assert "O''Brien" in command[5]
    assert "awen''agent" in command[5]


def test_powershell_utf8_wrapper_rejects_parameter_injection() -> None:
    with pytest.raises(ValueError, match="invalid PowerShell parameter"):
        proc_core.powershell_utf8_script_command(
            "powershell.exe",
            "installer.ps1",
            named_args={"Component;Remove-Item": "x"},
        )


@pytest.mark.skipif(sys.platform != "win32", reason="Windows PowerShell regression")
def test_hidden_windows_component_installer_streams_unicode_without_mojibake(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    powershell = shutil.which("powershell.exe") or shutil.which("powershell")
    if not powershell:
        pytest.skip("Windows PowerShell is unavailable")

    root = tmp_path / "含中文 空格"
    scripts = root / "scripts"
    scripts.mkdir(parents=True)
    fake_installer = scripts / "install-components.ps1"
    fake_installer.write_bytes(
        UTF8_BOM
        + (
            'param([string]$Component)\r\n'
            '[Console]::WriteLine("安装失败：中文路径")\r\n'
            'exit 7\r\n'
        ).encode("utf-8")
    )
    monkeypatch.setattr(setup, "_runtime_root", lambda: root)
    monkeypatch.setattr(setup, "_powershell_bin", lambda: powershell)

    async def collect() -> list[str]:
        return [event async for event in setup._component_install_stream("awen-agent")]

    output = "".join(asyncio.run(collect()))

    assert "安装失败：中文路径" in output
    assert "\ufffd" not in output
    assert "installer exited with code 7" in output
