from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
FORBIDDEN_BRAND = "ivy" + "ea"
IGNORED_DIRECTORIES = {
    ".git",
    ".pytest_cache",
    ".ruff_cache",
    ".venv",
    "__pycache__",
    "build",
    "dist",
    "node_modules",
    "venv",
}
BINARY_SUFFIXES = {
    ".7z",
    ".avi",
    ".bin",
    ".db",
    ".dll",
    ".exe",
    ".gif",
    ".gz",
    ".ico",
    ".jpeg",
    ".jpg",
    ".mov",
    ".mp3",
    ".mp4",
    ".otf",
    ".pdf",
    ".png",
    ".pyd",
    ".so",
    ".sqlite",
    ".sqlite3",
    ".tar",
    ".ttf",
    ".webp",
    ".woff",
    ".woff2",
    ".zip",
}


def _project_files() -> list[Path]:
    files: list[Path] = []
    for path in REPO_ROOT.rglob("*"):
        if any(part in IGNORED_DIRECTORIES for part in path.parts):
            continue
        if path.is_file():
            files.append(path)
    return files


def test_removed_brand_does_not_appear_in_paths_or_text() -> None:
    path_matches: list[str] = []
    content_matches: list[str] = []

    for path in _project_files():
        relative = path.relative_to(REPO_ROOT)
        if FORBIDDEN_BRAND in str(relative).lower():
            path_matches.append(str(relative))

        if path.suffix.lower() in BINARY_SUFFIXES:
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        if FORBIDDEN_BRAND in content.lower():
            content_matches.append(str(relative))

    assert path_matches == []
    assert content_matches == []
