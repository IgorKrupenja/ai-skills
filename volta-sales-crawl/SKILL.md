---
name: volta-sales-crawl
description: Crawls all Endover Volta apartment buildings (Uus-Volta, Tööstuse 47, Mootori 2, Krulli 10 / Volta Skai), counts sold vs unsold apartments per building and per apartment type, and presents the results as tables. Overall stats are given in two flavours — WITH and WITHOUT Volta Skai (Krulli 10). Saves every flat's status and price on each run, so it can also answer which specific flat sold, got booked or changed (e.g. "which flat sold in UV 10/3?").
allowed-tools: Bash, Read
---

# Volta Sales Crawl Skill

> **Runs in:** local + cloud — fetches the public pages over HTTP and parses them in Python (**no browser**). Trivially cloud-runnable; needs nothing installed.

Report **sold vs unsold** apartments across all Endover Volta buildings — overall, per
building, and per apartment type (rooms) — WITH and WITHOUT Volta Skai (Krulli 10).

> **Always use the ESTONIAN site** (`endover.ee/volta/majad/…`, `voltaskai.endover.ee/maja/…`),
> never the English `/en/` pages, for crawls and for ad-hoc look-ups of a flat. Igor has seen
> the English version carry listing errors more than once, from before this skill existed.
> Example: it lists UV 10/2 PH12 twice, sold plus a stray copy "for sale" at €964,900. The
> Estonian page lists it once, as sold.

## How to run

```bash
python3 "${SKILLS_DIR:-$HOME/.claude/skills}/volta-sales-crawl/volta.py"
```

`volta.py` (Python 3 stdlib, no dependencies, no browser) does the whole job: fetches each
building's public apartment table, parses the **server-rendered HTML**, classifies every
unit, aggregates, diffs against the previous run, prints the markdown report, and appends a
record to `history.ndjson`. **Present its output as-is.** Add `--dry-run` to crawl + report
**without** writing history.

## What it crawls (reference)

Canonical building list (the source of truth is the selection page
<https://endover.ee/volta/volta-residentsid/maja-valik/>):

| Page (`endover.ee/volta/majad/…`) | Building(s) |
| ---- | ----------- |
| `uus-volta-6-1` | **UV 6/1, 6/2, 6/3** — one **combined** table, split by the `Maja` column (crawled once) |
| `uus-volta-8-1` … `8-3` | UV 8/1, 8/2, 8/3 |
| `uus-volta-10-2`, `10-3` | UV 10/2, 10/3 |
| `toostuse-47` | Tööstuse 47 (Villa) |
| `mootori-2` | Mootori 2 (Hub) |
| `voltaskai.endover.ee/maja/krulli-10` | Krulli 10 (Skai) — the only `Commercial/other` units |

The list lives in `BUILDINGS` in `volta.py`; edit there if a building is added/removed.

## How it classifies (reference)

Per row, the **`Hind` (price) column** decides status: `Müüdud` → `sold`; a `€` price →
`available`; exact `Broneeritud` → `booked` (reserved); `Küsi hinda` → `request` (price on
request); blank → `other`. **Unsold = everything not sold** (available + booked + request +
other). Apartment type comes from the rooms column, headed `Tube`, `Ruume` or `Toad` depending
on the page (`1`–`5`, else `Commercial/other`). The trailing `Broneeri` button column is a
CTA, not a status — only the `Hind` column is read.

A flat number listed **twice in one building** is a site error and is counted once, keeping
the sold row, with a ⚠️ line in the report. The Estonian pages have had no duplicates; the
English UV 10/2 PH12 above was the known case. Footnote stars in flat numbers (`1 *`,
`B30 *`) are stripped.

## Output

Overall (WITH + WITHOUT Skai), per building (UV ascending, then Skai / Hub / Villa), per type
(WITH + WITHOUT Skai), a reconciliation check (per-building total == per-type total == overall),
and a "changes since last run" diff. The diff shows the aggregate deltas, then **every flat that
changed status**, e.g. `UV 10/3 #16 (3-room, 84.5 m², floor 3): available 429 900 € → sold`,
including available → booked and flats that appear in or drop out of the tables. History is
`history.ndjson` (append-only, one JSON record per line, next to `volta.py`).

## Per-flat history (for "which flat…?" questions)

Every record from `2026-09-26T10:08:04Z` onward has `units`, a snapshot of every flat:
`{building: {flat nr: {floor, rooms, m2, balcony, status, price, old_price}}}`. `rooms` is
missing for commercial/other units. `price` and `old_price` (the struck-out pre-discount price)
appear only while a flat is `available`. Answer questions about specific flats from these
snapshots, not from the aggregates. Examples: which flat sold, when #16 sold, what it was last
listed at, whether prices dropped. Older records only have aggregates.

Records up to `2026-09-26T10:08:04Z` were crawled from the English pages, and later ones from
the Estonian pages. The switch didn't change any saved flat: all 347 matched on every field.
Only records before `10:08` count 13 flats in UV 10/2, because they include the stray PH12.
Timeline of one flat:

```bash
python3 -c "import json; [print(r['ts'], r['units']['UV 10/3'].get('16')) for r in map(json.loads, open('$HOME/.claude/skills/volta-sales-crawl/history.ndjson')) if 'units' in r]"
```

## Notes

- All pages are **public** — no login, no env vars, no browser.
- If a page layout changes and the parser can't find a rooms + `Hind` header or an `Nr`
  column, `volta.py` exits with an error naming the URL — fix the parser there.
- This skill used to drive a headless browser; it's now plain HTTP + HTML parsing because the
  apartment tables are fully server-rendered. (Cloud browser setup for genuinely JS-only
  skills lives in [/cloud](../cloud/README.md).)
