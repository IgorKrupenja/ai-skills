#!/usr/bin/env python3
"""Read only current user's Vivaldi bookmarks from Fashion/Online and Fashion/Tallinn."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any


TARGET_FOLDERS = {"Online", "Tallinn"}
BOOKMARK_ROOT = Path.home() / "Library" / "Application Support" / "Vivaldi"


def find_bookmarks_file() -> Path:
    override = os.environ.get("VIVALDI_BOOKMARKS_FILE")
    if override:
        path = Path(override).expanduser()
        if path.is_file():
            return path
        raise FileNotFoundError(f"VIVALDI_BOOKMARKS_FILE is not a file: {path}")

    state_path = BOOKMARK_ROOT / "Local State"
    if state_path.is_file():
        try:
            state = json.loads(state_path.read_text(encoding="utf-8"))
            last_used = state.get("profile", {}).get("last_used")
            if isinstance(last_used, str) and last_used:
                candidate = BOOKMARK_ROOT / last_used / "Bookmarks"
                if candidate.is_file():
                    return candidate
        except (OSError, json.JSONDecodeError):
            pass

    default_profile = BOOKMARK_ROOT / "Default" / "Bookmarks"
    if default_profile.is_file():
        return default_profile

    candidates = sorted(path for path in BOOKMARK_ROOT.glob("*/Bookmarks") if path.is_file())
    if len(candidates) == 1:
        return candidates[0]
    if len(candidates) > 1:
        paths = "\n".join(str(path) for path in candidates)
        raise RuntimeError(
            "More than one Vivaldi profile has bookmarks and the active profile is unclear. "
            "Set VIVALDI_BOOKMARKS_FILE to the active profile's Bookmarks file.\n" + paths
        )
    raise FileNotFoundError(f"No Vivaldi Bookmarks file found under {BOOKMARK_ROOT}")


def walk_folder(
    node: dict[str, Any],
    path: tuple[str, ...],
    folder_name: str,
    output: list[dict[str, str]],
) -> None:
    for child in node.get("children", []):
        if not isinstance(child, dict):
            continue
        name = str(child.get("name", ""))
        child_path = path + ((name,) if name else ())
        if child.get("type") == "url":
            url = child.get("url", "")
            if isinstance(url, str) and url.startswith(("https://", "http://")):
                output.append(
                    {
                        "folder": folder_name,
                        "path": "/".join(child_path),
                        "title": str(child.get("name", "")),
                        "url": url,
                    }
                )
        else:
            walk_folder(child, child_path, folder_name, output)


def collect_targets(bookmarks: dict[str, Any]) -> tuple[set[str], list[dict[str, str]]]:
    found: set[str] = set()
    entries: list[dict[str, str]] = []
    roots = bookmarks.get("roots", {})

    for root_key, root_node in roots.items():
        if root_key.casefold() in {"deleted", "trash"}:
            continue
        if not isinstance(root_node, dict):
            continue

        def visit(node: dict[str, Any], path: tuple[str, ...]) -> None:
            name = str(node.get("name", ""))
            current = path + ((name,) if name else ())
            if node.get("type") == "folder" and len(current) >= 2:
                if current[-2] == "Fashion" and current[-1] in TARGET_FOLDERS:
                    found.add(current[-1])
                    walk_folder(node, current, current[-1], entries)
                    return
            for child in node.get("children", []):
                if isinstance(child, dict):
                    visit(child, current)

        visit(root_node, ())

    unique: list[dict[str, str]] = []
    seen: set[str] = set()
    for entry in entries:
        if entry["url"] in seen:
            continue
        seen.add(entry["url"])
        unique.append(entry)
    return found, unique


def main() -> int:
    try:
        bookmarks_path = find_bookmarks_file()
        bookmarks = json.loads(bookmarks_path.read_text(encoding="utf-8"))
        found, entries = collect_targets(bookmarks)
    except (OSError, json.JSONDecodeError, RuntimeError) as exc:
        print(str(exc), file=sys.stderr)
        return 1

    folder_counts = {
        name: sum(1 for entry in entries if entry["folder"] == name)
        for name in ("Online", "Tallinn")
    }
    result = {
        "bookmarks_file": str(bookmarks_path),
        "folders_found": [name for name in ("Online", "Tallinn") if name in found],
        "folders_missing": [name for name in ("Online", "Tallinn") if name not in found],
        "folder_counts": folder_counts,
        "folders_empty": [
            name for name in ("Online", "Tallinn")
            if name in found and folder_counts[name] == 0
        ],
        "stores": entries,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
