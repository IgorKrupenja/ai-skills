---
name: volta-sales-crawl
description: Crawls all Endover Volta apartment buildings (Uus-Volta, Tööstuse 47, Mootori 2, Krulli 10 / Volta Skai), counts sold vs unsold apartments per building and per apartment type, and presents the results as tables. Overall stats are given in two flavours — WITH and WITHOUT Volta Skai (Krulli 10).
allowed-tools: Bash, Read
---

# Volta Sales Crawl Skill

> **Runs in:** local + cloud — fetches the public pages over HTTP and parses them in Python (**no browser**). Trivially cloud-runnable; needs nothing installed.

Report **sold vs unsold** apartments across all Endover Volta buildings — overall, per
building, and per apartment type (rooms) — WITH and WITHOUT Volta Skai (Krulli 10).

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
<https://endover.ee/volta/en/volta-residentsid/maja-valik/>):

| Page | Building(s) |
| ---- | ----------- |
| `uus-volta-6-1` | **UV 6/1, 6/2, 6/3** — one **combined** table, split by the House column (crawled once) |
| `uus-volta-8-1` … `8-3` | UV 8/1, 8/2, 8/3 |
| `uus-volta-10-2`, `10-3` | UV 10/2, 10/3 |
| `toostuse-47` | Tööstuse 47 (Villa) |
| `mootori-2` | Mootori 2 (Hub) |
| `voltaskai…/krulli-10` | Krulli 10 (Skai) — the only `Commercial/other` units |

The list lives in `BUILDINGS` in `volta.py`; edit there if a building is added/removed.

## How it classifies (reference)

Per row, the **Price column** decides status: `Sold` → sold; a `€` price → available; exact
`Booked` → reserved; `Request` → price-on-request; blank/placeholder → commercial/other.
**Unsold = everything not Sold** (available + booked + request + commercial). Apartment type
comes from the **Rooms** column (`1`–`5`, else `Commercial/other`). The trailing `Book`
button column is a CTA, not a status — only the Price column is read.

## Output

Overall (WITH + WITHOUT Skai), per building (UV ascending, then Skai / Hub / Villa), per type
(WITH + WITHOUT Skai), a reconciliation check (per-building total == per-type total == overall),
and a "changes since last run" diff. History is `history.ndjson` (append-only, one JSON record
per line, next to `volta.py`).

## Notes

- All pages are **public** — no login, no env vars, no browser.
- If a page layout changes and the parser can't find a `ROOM` + `PRICE` header, `volta.py`
  exits with an error naming the URL — fix the parser there.
- This skill used to drive a headless browser; it's now plain HTTP + HTML parsing because the
  apartment tables are fully server-rendered. (Cloud browser setup for genuinely JS-only
  skills lives in [/cloud](../cloud/README.md).)
