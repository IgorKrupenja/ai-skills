#!/usr/bin/env python3
"""Keep a history of fashion-hunt results, so each run can say what is new, gone or repriced.

    history.py list                      show the saved searches and their last run
    history.py diff <search> [file]      compare a run (JSON from file or stdin) with the last
                                         saved run of <search> and print the changes
    history.py record <search> [file]    the same, then save the run

<search> is a short slug for the request, such as `white-mens-belts-lv-boss`; reuse the same
slug for the same request. A run looks like:

    {"date": "2026-11-15", "request": "white men's belts by LV or Hugo Boss",
     "listings": [{"url": "...", "shop": "Vinted", "item": "...", "price_eur": 160.76,
                   "kind": "match"}]}

where `kind` is "match" or "near". History lives in ~/.local/share/fashion-hunt (set
FASHION_HUNT_HOME to change it), outside the skill's public repo, and holds only listing links,
titles and prices.
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

HOME = Path(os.environ.get("FASHION_HUNT_HOME", Path.home() / ".local" / "share" / "fashion-hunt"))
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,80}$")


def key(url: str) -> str:
    """Normalise a listing URL so the same listing matches across runs."""
    url = url.split("#")[0].split("?")[0].rstrip("/")
    url = re.sub(r"^https?://(www\.)?", "", url)
    vinted = re.match(r"(vinted\.[a-z.]+/items/\d+)", url)
    return vinted.group(1) if vinted else url


def runs(search: str) -> list[Path]:
    folder = HOME / search
    return sorted(folder.glob("*.json")) if folder.is_dir() else []


def fmt_price(value: Any) -> str:
    return f"€{value:,.2f}" if isinstance(value, (int, float)) else "price unknown"


def describe(listing: dict[str, Any]) -> str:
    return f"{listing.get('shop', '?')} | {listing.get('item', '?')} | {listing['url']}"


def cmd_list() -> int:
    if not HOME.is_dir():
        print("no saved searches yet")
        return 0
    for folder in sorted(p for p in HOME.iterdir() if p.is_dir()):
        saved = runs(folder.name)
        if not saved:
            continue
        last = json.loads(saved[-1].read_text())
        kinds = [item.get("kind") for item in last.get("listings", [])]
        print(
            f"{folder.name}: {len(saved)} run{'s' if len(saved) != 1 else ''}, last {last.get('date', '?')} "
            f"({kinds.count('match')} matches, {kinds.count('near')} near) - {last.get('request', '')}"
        )
    return 0


def cmd_record(search: str, source: str, save: bool) -> int:
    if not SLUG_RE.match(search):
        sys.exit("search must be a lowercase slug of letters, digits and hyphens")
    raw = sys.stdin.read() if source == "-" else Path(source).read_text()
    run = json.loads(raw)
    listings = run.get("listings")
    if not isinstance(listings, list):
        sys.exit("the run needs a 'listings' list")
    for item in listings:
        if not item.get("url") or item.get("kind") not in ("match", "near"):
            sys.exit(f"each listing needs a url and kind 'match' or 'near': {item}")

    saved = runs(search)
    if saved:
        last = json.loads(saved[-1].read_text())
        before = {key(item["url"]): item for item in last.get("listings", [])}
        now = {key(item["url"]): item for item in listings}
        print(f"Compared with the run of {last.get('date', '?')}:")
        changes = 0
        for k, item in now.items():
            old = before.get(k)
            if not old:
                print(f"NEW ({item['kind']}): {describe(item)} | {fmt_price(item.get('price_eur'))}")
                changes += 1
            elif old.get("price_eur") != item.get("price_eur") and item.get("price_eur") is not None:
                print(
                    f"PRICE ({item['kind']}): {describe(item)} | "
                    f"from {fmt_price(old.get('price_eur'))} to {fmt_price(item.get('price_eur'))}"
                )
                changes += 1
            elif old.get("kind") != item["kind"]:
                print(f"NOW {item['kind'].upper()} (was {old.get('kind')}): {describe(item)}")
                changes += 1
        for k, old in before.items():
            if k not in now:
                print(f"GONE ({old.get('kind')}): {describe(old)} | was {fmt_price(old.get('price_eur'))}")
                changes += 1
        if not changes:
            print("no changes")
    else:
        print("first run of this search: nothing to compare with")

    if not save:
        return 0
    folder = HOME / search
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{datetime.now().strftime('%Y-%m-%dT%H-%M-%S-%f')}.json"
    path.write_text(json.dumps(run, ensure_ascii=False, indent=1))
    print(f"saved {path}")
    return 0


def main() -> int:
    args = sys.argv[1:]
    if args == ["list"]:
        return cmd_list()
    if len(args) in (2, 3) and args[0] in ("diff", "record"):
        return cmd_record(args[1], args[2] if len(args) == 3 else "-", save=args[0] == "record")
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main())
