#!/usr/bin/env python3
"""Print the current user's Vivaldi shop bookmarks from Fashion/Online and Fashion/Tallinn.

Pass --city <name> (repeatable) to also read another city's folder, such as Fashion/Helsinki.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any


PARENT_FOLDER = "Fashion"
DEFAULT_FOLDERS = ("Online", "Tallinn")
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


def collect_targets(
    bookmarks: dict[str, Any], wanted: list[str]
) -> tuple[dict[str, str], set[str], list[dict[str, str]]]:
    """Return the wanted folders found (keyed by casefolded name), all folders under Fashion,
    and the shops in the wanted ones."""
    wanted_keys = {name.casefold() for name in wanted}
    found: dict[str, str] = {}
    available: set[str] = set()
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
            if node.get("type") == "folder" and len(current) >= 2 and current[-2] == PARENT_FOLDER:
                available.add(current[-1])
                if current[-1].casefold() in wanted_keys:
                    found[current[-1].casefold()] = current[-1]
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
    return found, available, unique


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--city",
        action="append",
        default=[],
        metavar="NAME",
        help=f"also read {PARENT_FOLDER}/NAME, for a city the user asks about (repeatable)",
    )
    args = parser.parse_args()
    wanted: list[str] = []
    for name in (*DEFAULT_FOLDERS, *args.city):
        if name.casefold() not in {w.casefold() for w in wanted}:
            wanted.append(name)

    try:
        bookmarks_path = find_bookmarks_file()
        bookmarks = json.loads(bookmarks_path.read_text(encoding="utf-8"))
        found, available, entries = collect_targets(bookmarks, wanted)
    except (OSError, json.JSONDecodeError, RuntimeError) as exc:
        print(str(exc), file=sys.stderr)
        return 1

    searched = [found[name.casefold()] for name in wanted if name.casefold() in found]
    folder_counts = {
        name: sum(1 for entry in entries if entry["folder"] == name) for name in searched
    }
    result = {
        "bookmarks_file": str(bookmarks_path),
        "folders_found": searched,
        "folders_missing": [name for name in wanted if name.casefold() not in found],
        "folder_counts": folder_counts,
        "folders_empty": [name for name in searched if folder_counts[name] == 0],
        # City folders not read this time; read one with --city only when the user asks about it
        "other_folders": sorted(name for name in available if name not in searched),
        "stores": entries,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
