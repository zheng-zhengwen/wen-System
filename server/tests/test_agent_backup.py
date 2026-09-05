"""Agent data is part of a recoverable deployment, but never plaintext secrets."""
import json
import sqlite3
import zipfile

from app.core import backup


def test_nested_wal_database_is_snapshotted(tmp_path):
    data = tmp_path / "data"
    (data / "nested").mkdir(parents=True)
    conn = sqlite3.connect(data / "nested" / "state.db")
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("CREATE TABLE marker(value TEXT)")
        conn.execute("INSERT INTO marker VALUES ('fresh')")
        conn.commit()
        archive = backup.create(data_dir=data)
        target = tmp_path / "restore"
        assert backup.restore(archive, dry_run=False, data_dir=target)["ok"]
        with sqlite3.connect(target / "nested" / "state.db") as restored:
            assert restored.execute("SELECT value FROM marker").fetchone() == ("fresh",)
    finally:
        conn.close()


def test_agent_backup_without_passphrase_is_explicitly_incomplete(tmp_path):
    home = tmp_path / "awen-agent"
    home.mkdir()
    (home / "models.json").write_text('{"api_key":"never-in-plain-zip"}', encoding="utf-8")
    archive = backup.create(data_dir=tmp_path)
    with zipfile.ZipFile(archive) as zf:
        manifest = json.loads(zf.read(backup.MANIFEST))
        assert manifest["agent_data_included"] is False
        assert not any("awen-agent/" in name for name in zf.namelist())
    assert any("awenAgent" in warning for warning in backup.inspect(archive)["problems"])


def test_encrypted_agent_backup_restores_unicode_and_secrets(tmp_path):
    data = tmp_path / "data"
    home = data / "awen-agent"
    (home / "sessions").mkdir(parents=True)
    (home / "config.json").write_text('{"api_key":"private-token"}', encoding="utf-8")
    (home / "sessions" / "中文.json").write_text('{"message":"你好🚀"}', encoding="utf-8")
    archive = backup.create(data_dir=data, passphrase="backup-test")
    with zipfile.ZipFile(archive) as zf:
        assert "secrets/awen-agent.enc" in zf.namelist()
        assert not any(b"private-token" in zf.read(name) for name in zf.namelist())
    target = tmp_path / "target"
    assert not backup.restore(archive, passphrase="wrong", dry_run=False, data_dir=target)["ok"]
    assert not target.exists()
    result = backup.restore(archive, passphrase="backup-test", dry_run=False, data_dir=target)
    assert result["ok"]
    assert (target / "awen-agent" / "sessions" / "中文.json").read_text(encoding="utf-8") == '{"message":"你好🚀"}'


def test_custom_agent_directory_cannot_leak_through_normal_payload(tmp_path):
    home = tmp_path / "custom" / "private-agent"
    home.mkdir(parents=True)
    (home / "config.json").write_text('{"key":"keep-private"}', encoding="utf-8")
    archive = backup.create(data_dir=tmp_path, agent_dir=home)
    with zipfile.ZipFile(archive) as zf:
        assert not any(b"keep-private" in zf.read(name) for name in zf.namelist())


def test_backup_output_at_data_root_does_not_include_itself(tmp_path):
    (tmp_path / "config.json").write_text("{}", encoding="utf-8")
    archive = backup.create(dest_dir=tmp_path, data_dir=tmp_path)
    with zipfile.ZipFile(archive) as zf:
        assert not any(name.endswith(".zip") for name in zf.namelist())
