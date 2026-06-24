#!/usr/bin/env python3
"""Volta sales crawl — browser-free.

Fetches each Endover Volta building's public apartment table, parses it straight from
the server-rendered HTML (no browser / Playwright needed), classifies sold vs unsold,
and prints the report (overall / per building / per type, WITH and WITHOUT Volta Skai).
Diffs against the previous run and appends a record to history.ndjson.

Pure Python 3 standard library. Run:
    python3 volta.py            # crawl, report, and append to history.ndjson
    python3 volta.py --dry-run  # crawl + report + diff, but do NOT write history
"""
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser

HERE = os.path.dirname(os.path.abspath(__file__))
HISTORY = os.path.join(HERE, "history.ndjson")
UA = {"User-Agent": "Mozilla/5.0 (volta-sales-crawl)"}

# (url, display_name, is_skai, combined)
#   combined=True -> one page holding several buildings, split by the "House" column;
#   each sub-building is named "UV <house-cell>" (e.g. "UV 6/1").
BUILDINGS = [
    ("https://endover.ee/volta/en/houses/uus-volta-6-1/",  None,                  False, True),
    ("https://endover.ee/volta/en/houses/uus-volta-8-1/",  "UV 8/1",              False, False),
    ("https://endover.ee/volta/en/houses/uus-volta-8-2/",  "UV 8/2",              False, False),
    ("https://endover.ee/volta/en/houses/uus-volta-8-3/",  "UV 8/3",              False, False),
    ("https://endover.ee/volta/en/houses/uus-volta-10-2/", "UV 10/2",             False, False),
    ("https://endover.ee/volta/en/houses/uus-volta-10-3/", "UV 10/3",             False, False),
    ("https://endover.ee/volta/en/houses/toostuse-47/",    "Tööstuse 47 (Villa)", False, False),
    ("https://endover.ee/volta/en/houses/mootori-2/",      "Mootori 2 (Hub)",     False, False),
    ("https://voltaskai.endover.ee/en/house/krulli-10/?field=price&order=desc",
                                                           "Krulli 10 (Skai)",    True,  False),
]
DISPLAY_ORDER = ["UV 6/1", "UV 6/2", "UV 6/3", "UV 8/1", "UV 8/2", "UV 8/3",
                 "UV 10/2", "UV 10/3", "Krulli 10 (Skai)", "Mootori 2 (Hub)", "Tööstuse 47 (Villa)"]
TYPE_ORDER = ["1", "2", "3", "4", "5", "Commercial/other"]


class TableRows(HTMLParser):
    """Collect every <tr> as a list of trimmed cell strings (td/th)."""
    def __init__(self):
        super().__init__()
        self.rows, self._row, self._cell = [], None, None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self._row = []
        elif tag in ("td", "th") and self._row is not None:
            self._cell = []

    def handle_endtag(self, tag):
        if tag == "tr" and self._row is not None:
            self.rows.append(self._row)
            self._row = None
        elif tag in ("td", "th") and self._cell is not None:
            self._row.append(" ".join("".join(self._cell).split()))
            self._cell = None

    def handle_data(self, data):
        if self._cell is not None:
            self._cell.append(data)


def fetch_rows(url):
    try:
        req = urllib.request.Request(url, headers=UA)
        html = urllib.request.urlopen(req, timeout=25).read().decode("utf-8", "replace")
    except Exception as e:
        sys.exit(f"Failed to fetch {url}: {e}")
    p = TableRows()
    p.feed(html)
    return p.rows


def classify_sold(status):
    """Price-column text -> True if sold. Sold | €-price | Booked | Request | (blank)."""
    return bool(re.search(r"sold", status, re.I))  # everything else counts as unsold


def parse_building(url, display, is_skai, combined):
    rows = fetch_rows(url)
    room_i = price_i = bldg_i = -1
    hdr = -1
    for i, r in enumerate(rows):
        up = [c.upper() for c in r]
        ri = next((j for j, c in enumerate(up) if "ROOM" in c), -1)
        pi = next((j for j, c in enumerate(up) if "PRICE" in c), -1)
        if ri >= 0 and pi >= 0:
            room_i, price_i, hdr = ri, pi, i
            bldg_i = next((j for j, c in enumerate(up) if re.search(r"HOUSE|BUILDING|MAJA", c)), -1)
            break
    if hdr < 0:
        sys.exit(f"No apartment table (ROOM + PRICE header) found at {url}")
    apts = []
    for r in rows[hdr + 1:]:
        if not r:
            continue
        rooms = r[room_i].strip() if room_i < len(r) else ""
        status = r[price_i].strip() if price_i < len(r) else ""
        name = ("UV " + r[bldg_i].strip()) if (combined and 0 <= bldg_i < len(r)) else display
        room_key = rooms if re.fullmatch(r"[0-9]+", rooms) else "Commercial/other"
        apts.append({"bldg": name, "room_key": room_key,
                     "sold": classify_sold(status), "skai": is_skai})
    return apts


def tally(apts):
    sold = sum(1 for a in apts if a["sold"])
    return {"sold": sold, "unsold": len(apts) - sold}


def with_total(t):
    return {**t, "total": t["sold"] + t["unsold"]}


def by_type(apts):
    d = {k: {"sold": 0, "unsold": 0} for k in TYPE_ORDER}
    for a in apts:
        k = a["room_key"] if a["room_key"] in d else "Commercial/other"
        d[k]["sold" if a["sold"] else "unsold"] += 1
    return d


def pct(sold, total):
    return f"{(100 * sold / total):.1f}%" if total else "—"


def md(headers, rows):
    print("| " + " | ".join(headers) + " |")
    print("| " + " | ".join("---" for _ in headers) + " |")
    for row in rows:
        print("| " + " | ".join(str(c) for c in row) + " |")
    print()


def overall_rows(t):
    return [[t["sold"], t["unsold"], t["total"], pct(t["sold"], t["total"])]]


def main():
    dry = "--dry-run" in sys.argv

    all_apts = []
    for url, display, skai, combined in BUILDINGS:
        all_apts += parse_building(url, display, skai, combined)
    non_skai = [a for a in all_apts if not a["skai"]]

    ov_with = with_total(tally(all_apts))
    ov_without = with_total(tally(non_skai))

    by_building = {}
    for a in all_apts:
        b = by_building.setdefault(a["bldg"], {"sold": 0, "unsold": 0})
        b["sold" if a["sold"] else "unsold"] += 1
    type_with, type_without = by_type(all_apts), by_type(non_skai)

    # ---- report ----
    print("## Volta — sold vs unsold\n")
    print("### Overall — WITH Skai (all buildings)")
    md(["Sold", "Unsold", "Total", "% Sold"], overall_rows(ov_with))
    print("### Overall — without Skai (excludes Krulli 10)")
    md(["Sold", "Unsold", "Total", "% Sold"], overall_rows(ov_without))

    print("### Per building")
    brows = []
    for name in DISPLAY_ORDER:
        b = by_building.get(name)
        if not b:
            continue
        tot = b["sold"] + b["unsold"]
        brows.append([name, b["sold"], b["unsold"], tot, pct(b["sold"], tot)])
    md(["Building", "Sold", "Unsold", "Total", "% Sold"], brows)

    for label, td in (("WITH Skai (all buildings)", type_with),
                      ("without Skai (excludes Krulli 10)", type_without)):
        print(f"### Per apartment type — {label}")
        trows = []
        for k in TYPE_ORDER:
            t = td[k]
            tot = t["sold"] + t["unsold"]
            name = "Commercial/other" if k == "Commercial/other" else f"{k}-room"
            trows.append([name, t["sold"], t["unsold"], tot, pct(t["sold"], tot)])
        md(["Type", "Sold", "Unsold", "Total", "% Sold"], trows)

    print("> _Unsold_ = available + reserved (Booked) + price-on-request + commercial/other "
          "(everything not Sold).\n")

    # ---- reconcile (step 5) ----
    b_sum = sum(v["sold"] + v["unsold"] for v in by_building.values())
    t_sum = sum(v["sold"] + v["unsold"] for v in type_with.values())
    ok = (b_sum == ov_with["total"] == t_sum)
    print(f"Reconciliation: per-building total {b_sum}, per-type total {t_sum}, "
          f"overall {ov_with['total']} — {'✓ match' if ok else '✗ MISMATCH, re-check a page'}.\n")

    # ---- diff vs previous run (step 6) ----
    prev = None
    if os.path.exists(HISTORY):
        lines = [ln for ln in open(HISTORY).read().splitlines() if ln.strip()]
        if lines:
            prev = json.loads(lines[-1])
    print("### Changes since last run")
    if not prev:
        print("No previous run to compare against.\n")
    else:
        def delta(now, was):
            d = now - was
            return f"{was} → {now} ({'+' if d > 0 else ''}{d if d else '±0'})"
        print(f"_baseline: {prev['ts']}_\n")
        for key, label in (("withSkai", "WITH Skai"), ("withoutSkai", "without Skai")):
            now, was = (ov_with if key == "withSkai" else ov_without), prev["overall"][key]
            print(f"- Overall {label}: sold {delta(now['sold'], was['sold'])}, "
                  f"unsold {delta(now['unsold'], was['unsold'])}")
        for name in DISPLAY_ORDER:
            now, was = by_building.get(name), prev["byBuilding"].get(name)
            if now and was and (now["sold"] != was["sold"] or now["unsold"] != was["unsold"]):
                print(f"- {name}: sold {delta(now['sold'], was['sold'])}, "
                      f"unsold {delta(now['unsold'], was['unsold'])}")
        for k in TYPE_ORDER:
            now, was = type_with[k], prev["byType"].get(k)
            if was and (now["sold"] != was["sold"] or now["unsold"] != was["unsold"]):
                label = "Commercial/other" if k == "Commercial/other" else f"{k}-room"
                print(f"- {label}: sold {delta(now['sold'], was['sold'])}, "
                      f"unsold {delta(now['unsold'], was['unsold'])}")
        new_b = set(by_building) - set(prev["byBuilding"])
        gone_b = set(prev["byBuilding"]) - set(by_building)
        if new_b or gone_b:
            print(f"- ⚠️ building keys changed — new: {sorted(new_b)}, vanished: {sorted(gone_b)}")
        print()

    # ---- save run (step 7) ----
    record = {
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "overall": {"withSkai": ov_with, "withoutSkai": ov_without},
        "byBuilding": {n: by_building[n] for n in DISPLAY_ORDER if n in by_building},
        "byType": {k: type_with[k] for k in TYPE_ORDER},
    }
    if dry:
        print("(--dry-run: not writing history)")
        return
    with open(HISTORY, "a") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
    n = sum(1 for ln in open(HISTORY).read().splitlines() if ln.strip())
    print(f"Saved run `{record['ts']}` ({n} total records in history).")


if __name__ == "__main__":
    main()
