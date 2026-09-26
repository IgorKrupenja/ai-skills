#!/usr/bin/env python3
"""Sync sources.yaml with the bookmarks folder (social-calendar skill).

Bookmarks are the inbox: the user adds and deletes sources there while browsing.
sources.yaml is the copy kept next to the skill, with a free-text `notes` field per source.
On every run:
  - bookmarks missing from the file are added (the subfolder path becomes `category`),
  - sources whose bookmark was deleted are removed,
  - `name` and `category` follow the bookmark, `notes` are kept,
  - when a bookmark's URL changed but its name didn't, its notes move over.
Prints the diff, then the synced list as TSV: category, name, url, notes.

Only the standard library is used, so the YAML is a fixed subset: one mapping per
source, every value a double-quoted string on a single line.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
YAML_PATH = os.path.join(HERE, "sources.yaml")
KEYS = ("name", "category", "url", "notes")
HEADER = """\
# Sources for the social-calendar crawl, synced from the bookmarks folder by sync_sources.py
# on every crawl: new bookmarks are added, deleted ones are removed, `notes` are kept.
# Edit `notes` freely, but keep every value a double-quoted string on a single line."""


def find_folder(node, name):
    if node.get("type") == "folder" and node.get("name") == name:
        return node
    for child in node.get("children", []):
        hit = find_folder(child, name)
        if hit:
            return hit
    return None


def bookmark_sources():
    folder = os.environ["SOCIAL_CALENDAR_BOOKMARKS_FOLDER"]
    first, last = folder.split("/")[0], folder.split("/")[-1]
    roots = json.load(open(os.environ["BOOKMARKS_FILE"], encoding="utf-8"))["roots"]
    top = next((f for f in (find_folder(r, first) for r in roots.values() if isinstance(r, dict)) if f), None)
    base = find_folder(top, last) if top else None
    if not base:
        sys.exit(f"bookmarks folder not found: {folder}")
    out = []

    def walk(node, category):
        for child in node.get("children", []):
            if child["type"] == "folder":
                walk(child, f"{category}/{child['name']}" if category else child["name"])
            elif child["type"] == "url":
                out.append({"name": child["name"], "category": category, "url": child["url"]})

    walk(base, "")
    return out


def load():
    if not os.path.exists(YAML_PATH):
        return []
    items = []
    for n, line in enumerate(open(YAML_PATH, encoding="utf-8"), 1):
        s = line.rstrip("\n")
        if not s.strip() or s.lstrip().startswith("#") or s.strip() == "sources:":
            continue
        m = re.match(r"^\s*(-\s+)?([a-z_]+):\s*(.*)$", s)
        if not m or (not m.group(1) and not items):
            sys.exit(f"sources.yaml line {n}: cannot parse: {s}")
        if m.group(1):
            items.append({})
        value = m.group(3).strip()
        items[-1][m.group(2)] = json.loads(value) if value.startswith('"') else value
    return items


def dump(items):
    lines = [HEADER, "sources:"]
    for item in items:
        for i, key in enumerate(KEYS):
            lines.append(("  - " if i == 0 else "    ") + f"{key}: {json.dumps(item.get(key, ''), ensure_ascii=False)}")
    with open(YAML_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def main():
    old = load()
    bookmarks = bookmark_sources()
    by_url = {s["url"]: s for s in old}
    live_urls = {b["url"] for b in bookmarks}
    removed = [s for s in old if s["url"] not in live_urls]
    removed_by_name = {s["name"]: s for s in removed}
    merged, added, moved = [], [], []
    for b in bookmarks:
        prev = by_url.get(b["url"])
        if prev is None and b["name"] in removed_by_name:
            prev = removed_by_name.pop(b["name"])
            removed.remove(prev)
            moved.append(b["name"])
        elif prev is None:
            added.append(b["name"])
        merged.append({**b, "notes": (prev or {}).get("notes", "")})
    dump(merged)
    print(f"sources: {len(merged)} | added: {added or '-'} | removed: {[s['name'] for s in removed] or '-'} | url changed: {moved or '-'}")
    for s in merged:
        print("\t".join([s["category"] or "-", s["name"], s["url"], s["notes"]]))


if __name__ == "__main__":
    main()
