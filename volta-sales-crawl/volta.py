#!/usr/bin/env python3
"""Volta sales crawl — browser-free.

Fetches each Endover Volta building's public apartment table from the ESTONIAN site (the
English version has had listing errors), parses it straight from the server-rendered
HTML (no browser / Playwright needed), classifies sold vs unsold,
and prints the report (overall / per building / per type, WITH and WITHOUT Volta Skai).
Diffs against the previous run (aggregates + every flat that changed status) and appends a
record to history.ndjson, including a per-flat snapshot (`units`).

Pure Python 3 standard library. Run:
    python3 volta.py            # crawl, report, and append to history.ndjson
    python3 volta.py --dry-run  # crawl + report + diff, but do NOT write history
"""
import gzip
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser

HERE = os.path.dirname(os.path.abspath(__file__))
HISTORY = os.path.join(HERE, "history.ndjson")
# Request gzip: these pages are ~2.2 MB uncompressed, and some proxies/CDNs truncate
# the plain transfer mid-stream (urllib then raises IncompleteRead). The gzipped body
# (~290 KB) fits in one read and decompresses to the full page with stdlib only.
UA = {"User-Agent": "Mozilla/5.0 (volta-sales-crawl)", "Accept-Encoding": "gzip"}

# (url, display_name, is_skai, combined)
#   combined=True -> one page holding several buildings, split by the "Maja" (house) column;
#   each sub-building is named "UV <house-cell>" (e.g. "UV 6/1").
# Always the Estonian pages — the English ones (/en/houses/…) have had listing errors, e.g.
# UV 10/2 PH12 listed twice (sold + a stray copy "for sale" at 964 900 €).
BUILDINGS = [
    ("https://endover.ee/volta/majad/uus-volta-6-1/",  None,                  False, True),
    ("https://endover.ee/volta/majad/uus-volta-8-1/",  "UV 8/1",              False, False),
    ("https://endover.ee/volta/majad/uus-volta-8-2/",  "UV 8/2",              False, False),
    ("https://endover.ee/volta/majad/uus-volta-8-3/",  "UV 8/3",              False, False),
    ("https://endover.ee/volta/majad/uus-volta-10-2/", "UV 10/2",             False, False),
    ("https://endover.ee/volta/majad/uus-volta-10-3/", "UV 10/3",             False, False),
    ("https://endover.ee/volta/majad/toostuse-47/",    "Tööstuse 47 (Villa)", False, False),
    ("https://endover.ee/volta/majad/mootori-2/",      "Mootori 2 (Hub)",     False, False),
    ("https://voltaskai.endover.ee/maja/krulli-10/?field=price&order=desc",
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
        resp = urllib.request.urlopen(req, timeout=25)
        raw = resp.read()
        if resp.headers.get("Content-Encoding", "").lower() == "gzip":
            raw = gzip.decompress(raw)
        html = raw.decode("utf-8", "replace")
    except Exception as e:
        sys.exit(f"Failed to fetch {url}: {e}")
    p = TableRows()
    p.feed(html)
    return p.rows


def unit_status(text):
    """Hind-column text -> sold (Müüdud) | available (€ price) | booked (Broneeritud) |
    request (Küsi hinda) | other (blank)."""
    if re.search(r"müüdud", text, re.I):
        return "sold"  # everything else counts as unsold
    if "€" in text:
        return "available"
    if re.fullmatch(r"broneeritud", text, re.I):
        return "booked"
    if re.search(r"küsi", text, re.I):
        return "request"
    return "other"


def prices(text):
    """'319 900 € 339 900 €' -> [319900, 339900]: the current price, then the struck-out old one."""
    return [int(p.replace(" ", "")) for p in re.findall(r"(\d[\d ]*)€", text)]


def num(text):
    """'84.5' / '197,1' / '7,4 m2' -> 84.5 / 197.1 / 7.4; '' or '-' -> None."""
    m = re.search(r"\d+(?:[.,]\d+)?", text)
    if not m:
        return None
    v = float(m.group(0).replace(",", "."))
    return int(v) if v.is_integer() else v


def parse_building(url, display, is_skai, combined):
    rows = fetch_rows(url)
    rooms_re = "TUBE|RUUM|TOAD"  # the rooms header varies by page: Tube / Ruume / Toad
    hdr, up = -1, []
    for i, r in enumerate(rows):
        up = [c.upper() for c in r]
        if any(re.search(rooms_re, c) for c in up) and any("HIND" in c for c in up):
            hdr = i
            break
    if hdr < 0:
        sys.exit(f"No apartment table (rooms + Hind header) found at {url}")

    def col(pattern):  # index of the first header cell matching `pattern`, else -1
        return next((j for j, c in enumerate(up) if re.search(pattern, c)), -1)

    room_i, price_i, bldg_i = col(rooms_re), col("HIND"), col("MAJA")
    nr_i, floor_i, size_i, balc_i = col("^NR"), col("KORRUS|KRS"), col("SUURUS"), col("RÕDU")
    if nr_i < 0:
        sys.exit(f"No Nr column in the apartment table at {url}")

    def cell(r, j):
        return r[j].strip() if 0 <= j < len(r) else ""

    apts = []
    for r in rows[hdr + 1:]:
        if not r:
            continue
        rooms, price_txt = cell(r, room_i), cell(r, price_i)
        name = ("UV " + r[bldg_i].strip()) if (combined and 0 <= bldg_i < len(r)) else display
        room_key = rooms if re.fullmatch(r"[0-9]+", rooms) else "Commercial/other"
        status = unit_status(price_txt)
        nr = re.sub(r"[\s*]", "", cell(r, nr_i))  # some numbers carry a footnote star: '1 *', 'B30 *'
        unit = {"nr": nr, "floor": cell(r, floor_i) or None,
                "rooms": int(rooms) if room_key != "Commercial/other" else None,
                "m2": num(cell(r, size_i)), "balcony": num(cell(r, balc_i)), "status": status}
        if status == "available":
            unit.update(zip(("price", "old_price"), prices(price_txt)))
        apts.append({"bldg": name, "room_key": room_key, "sold": status == "sold", "skai": is_skai,
                     "unit": {k: v for k, v in unit.items() if v is not None}})
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


def nat(nr):
    """Natural sort key for flat numbers: '9' < '10', 'B4' < 'B30'."""
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", nr)]


def eur(v):
    return f"{v:,}".replace(",", " ") + " €"


def status_label(u):
    if u["status"] == "available" and "price" in u:
        return f"available {eur(u['price'])}"
    return "price on request" if u["status"] == "request" else u["status"]


def flat_label(bldg, nr, u):
    bits = [f"{u['rooms']}-room" if "rooms" in u else "commercial/other"]
    bits += [f"{u['m2']} m²"] if "m2" in u else []
    bits += [f"floor {u['floor']}"] if "floor" in u else []
    return f"{bldg} #{nr} ({', '.join(bits)})"


def dedupe(apts):
    """Count a flat number listed twice in one building once -> (apts, warning lines).
    Guard against listing errors like the English site's UV 10/2 PH12, listed twice: sold
    (114.4 m²) plus a stray 'ph12-2' copy at 964 900 €. Keeps the Sold row (a sold flat
    can't also be for sale), else the first one."""
    keep, warn = {}, []
    for a in apts:
        k = (a["bldg"], a["unit"]["nr"])
        if k not in keep:
            keep[k] = a
            continue
        if a["sold"] and not keep[k]["sold"]:
            keep[k], a = a, keep[k]
        kept = keep[k]["unit"]
        warn.append(f"⚠️ {a['bldg']} lists #{kept['nr']} twice (site error) — counted once, as "
                    f"{status_label(kept)} ({kept.get('m2')} m²); ignored the duplicate "
                    f"{status_label(a['unit'])} ({a['unit'].get('m2')} m²).")
    return list(keep.values()), warn


def unit_changes(was_units, now_units):
    """Markdown bullets for every flat whose status changed, appeared or vanished."""
    out = []
    for name, now in now_units.items():
        was = was_units.get(name)
        if was is None:
            out.append(f"- {name}: new in the crawl ({len(now)} flats)")
            continue
        for nr in sorted(set(was) | set(now), key=nat):
            w, n = was.get(nr), now.get(nr)
            if w and n and w["status"] != n["status"]:
                out.append(f"- {flat_label(name, nr, n)}: {status_label(w)} → {status_label(n)}")
            elif n and not w:
                out.append(f"- {flat_label(name, nr, n)}: new in the table ({status_label(n)})")
            elif w and not n:
                out.append(f"- {flat_label(name, nr, w)}: no longer listed (was {status_label(w)})")
    out += [f"- {name}: no longer crawled" for name in was_units if name not in now_units]
    return out


def main():
    dry = "--dry-run" in sys.argv

    all_apts = []
    for url, display, skai, combined in BUILDINGS:
        all_apts += parse_building(url, display, skai, combined)
    all_apts, dup_warnings = dedupe(all_apts)
    non_skai = [a for a in all_apts if not a["skai"]]

    # per-flat snapshot: {building: {flat nr: {floor, rooms, m2, balcony, status, price, old_price}}}
    units = {}
    for a in all_apts:
        u = dict(a["unit"])
        units.setdefault(a["bldg"], {})[u.pop("nr")] = u
    units = {n: dict(sorted(units[n].items(), key=lambda kv: nat(kv[0])))
             for n in DISPLAY_ORDER + sorted(set(units) - set(DISPLAY_ORDER)) if n in units}

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
    for w in dup_warnings:
        print(w + "\n")

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
        if "units" not in prev:
            print("\n_Per-flat changes start from the next run — the previous run has no per-flat "
                  "snapshot._")
        else:
            changes = unit_changes(prev["units"], units)
            print("\nFlats that changed status:" if changes else "\nNo flat changed status.")
            for line in changes:
                print(line)
        print()

    # ---- save run (step 7) ----
    record = {
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "overall": {"withSkai": ov_with, "withoutSkai": ov_without},
        "byBuilding": {n: by_building[n] for n in DISPLAY_ORDER if n in by_building},
        "byType": {k: type_with[k] for k in TYPE_ORDER},
        "units": units,
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
