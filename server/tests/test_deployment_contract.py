"""Deployment defaults must be persistent, private, and reproducible."""
from pathlib import Path
import os
import shutil
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[2]


def test_docker_defaults_preserve_agent_data_and_require_release_pin():
    docker = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    assert "ENV AWEN_HOME=/app/data/awen-agent" in docker
    assert "ARG AWEN_AGENT_REF=main" not in docker
    assert "AWEN_AGENT_REF:?" in compose
    assert "127.0.0.1" in compose


def test_docker_example_does_not_ship_default_credentials():
    example = (ROOT / ".env.example").read_text(encoding="utf-8")
    entry = (ROOT / "deploy/docker/entrypoint.sh").read_text(encoding="utf-8")
    assert "ADMIN_PASSWORD=admin123" not in example
    assert "AWENOPS_ALLOWED_ORIGINS" in entry
    assert "AWENOPS_SECRET:?" in entry


def test_installers_do_not_fallback_to_unreleased_main():
    for file in ["scripts/install-components.ps1", "scripts/install.ps1", "scripts/install.sh"]:
        text = (ROOT / file).read_text(encoding="utf-8-sig")
        assert '$awenAgentRef = "main"' not in text, file
        assert 'AWEN_AGENT_REF="main"' not in text, file


def test_legacy_setup_entrypoints_delegate_to_canonical_installers():
    assert "scripts/install.sh" in (ROOT / "setup.sh").read_text(encoding="utf-8")
    assert "scripts\\install.ps1" in (ROOT / "setup.ps1").read_text(encoding="utf-8-sig")


@pytest.mark.parametrize("overrides", [
    {"AWENOPS_SECRET": ""}, {"AWENOPS_SECRET": "short"},
    {"ADMIN_PASSWORD": "admin123"}, {"ADMIN_PASSWORD": ""}, {"AWENOPS_ALLOWED_ORIGINS": ""},
])
def test_docker_entrypoint_rejects_unsafe_config_before_starting(overrides):
    git_bash = Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Git/bin/bash.exe"
    bash = str(git_bash) if os.name == "nt" and git_bash.is_file() else shutil.which("bash")
    if not bash:
        pytest.skip("bash is not installed")
    env = {**os.environ, "AWENOPS_SECRET": "x" * 32, "ADMIN_PASSWORD": "test-password-long",
           "AWENOPS_PASSWORD_HASH": "", "AWENOPS_ALLOWED_ORIGINS": "http://localhost:8080", **overrides}
    result = subprocess.run([bash, str(ROOT / "deploy/docker/entrypoint.sh")],
                            env=env, capture_output=True, timeout=10)
    assert result.returncode != 0
    assert b"awenops - starting" not in result.stdout
    assert b"AWENOPS_" in result.stderr or b"ADMIN_PASSWORD" in result.stderr
