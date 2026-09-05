"""Launch the real fixture from a path that ASCII-only .cmd files cannot encode."""
import subprocess

import pytest

from app.tests.test_agents_p6b import _fake_codex_launcher, _fake_hermes_launcher


@pytest.mark.parametrize("launcher,expected", [
    (_fake_codex_launcher, "PONG from codex"), (_fake_hermes_launcher, "Hello from fake hermes")])
def test_fixture_launcher_runs_from_unicode_path(tmp_path, launcher, expected):
    root = tmp_path / "中文 空格"
    root.mkdir()
    result = subprocess.run([launcher(root)], capture_output=True, timeout=10, check=True)
    assert expected in result.stdout.decode("utf-8")
