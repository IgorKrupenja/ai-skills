---
name: volta-sales-crawl
description: Crawls all Endover Volta apartment buildings (Uus-Volta, Tööstuse 47, Mootori 2, Krulli 10 / Volta Skai), counts sold vs unsold apartments per building and per apartment type, and presents the results as tables. Overall stats are given in two flavours — WITH and WITHOUT Volta Skai (Krulli 10).
allowed-tools: mcp__playwright__browser_navigate, mcp__playwright__browser_evaluate, mcp__playwright__browser_snapshot, Read, Write, Bash
---

# Volta Sales Crawl Skill

> **Runs in:** local + cloud — crawls only **public** pages, no login. Reference skill for cloud agents (needs headless Chromium; see [/cloud](../cloud/README.md)).

Crawl every Endover Volta building, read its apartment table, and report **sold vs unsold** counts with percentages — overall, per building, and per apartment type (rooms).

## Buildings to crawl

Crawl exactly these pages (the source of truth is the selection page
<https://endover.ee/volta/en/volta-residentsid/maja-valik/>, but the list below is canonical):

| # | URL | Display name |
| - | --- | ------------ |
| 1 | `https://endover.ee/volta/en/houses/uus-volta-6-1/` | UV 6/1, UV 6/2, UV 6/3 |
| 2 | `https://endover.ee/volta/en/houses/uus-volta-8-1/` | UV 8/1 |
| 3 | `https://endover.ee/volta/en/houses/uus-volta-8-2/` | UV 8/2 |
| 4 | `https://endover.ee/volta/en/houses/uus-volta-8-3/` | UV 8/3 |
| 5 | `https://endover.ee/volta/en/houses/uus-volta-10-2/` | UV 10/2 |
| 6 | `https://endover.ee/volta/en/houses/uus-volta-10-3/` | UV 10/3 |
| 7 | `https://endover.ee/volta/en/houses/toostuse-47/` | Tööstuse 47 (Villa) |
| 8 | `https://endover.ee/volta/en/houses/mootori-2/` | Mootori 2 (Hub) |
| 9 | `https://voltaskai.endover.ee/en/house/krulli-10/?field=price&order=desc` | Krulli 10 (Skai) |

> **Important — UV-6 is one combined table.** The `uus-volta-6-1` page contains a single
> table for all three buildings (6/1, 6/2, 6/3) with a leading building column. Crawl it
> **once**. Do **NOT** also crawl `uus-volta-6-2` / `uus-volta-6-3` — that would triple-count.

## Steps

### 1. For each building page: navigate then parse

Navigate to the URL, then run this parser via `browser_evaluate`. It auto-detects the
`ROOMS` and `PRICE` column positions from the header (layouts differ per page) and splits
by building when a building column is present (the UV-6 combined table):

```js
() => {
  const allRows = Array.from(document.querySelectorAll('table tr'));
  let roomIdx = -1, priceIdx = -1, bldgIdx = -1, headerRowEl = null;
  for (const r of allRows) {
    const cells = Array.from(r.querySelectorAll('td,th')).map(c => c.innerText.trim().toUpperCase());
    const ri = cells.findIndex(c => /ROOM/.test(c));
    const pi = cells.findIndex(c => /PRICE/.test(c));
    if (ri >= 0 && pi >= 0) {
      roomIdx = ri; priceIdx = pi; headerRowEl = r;
      bldgIdx = cells.findIndex(c => /HOUSE|BUILDING|MAJA/.test(c));
      break;
    }
  }
  const res = { roomIdx, priceIdx, bldgIdx, sold: 0, available: 0, booked: 0,
                requestPrice: 0, other: 0, byRoom: {}, byBldg: {}, otherRows: [] };
  if (roomIdx < 0) return res; // no table found
  const dataRows = allRows.slice(allRows.indexOf(headerRowEl) + 1);
  dataRows.forEach(r => {
    const cells = Array.from(r.querySelectorAll('td,th')).map(c => c.innerText.trim());
    if (!cells.length) return;
    const rooms = (cells[roomIdx] || '').trim();
    const status = (cells[priceIdx] || '').trim();
    const bldg = bldgIdx >= 0 ? (cells[bldgIdx] || '').trim() : 'this';
    // Room-type bucket: 1..5 stay as-is; "-" / blank = commercial/other unit
    const roomKey = /^[0-9]+$/.test(rooms) ? rooms : 'Commercial/other';
    let cat;
    if (/sold/i.test(status)) cat = 'sold';
    else if (/€/.test(status)) cat = 'available';
    else if (/^booked$/i.test(status)) cat = 'booked';
    else if (/request/i.test(status)) cat = 'requestPrice';
    else { cat = 'other'; res.otherRows.push(cells.join(' ~ ')); } // empty/placeholder row
    res[cat]++;
    const isSold = cat === 'sold';
    res.byRoom[roomKey] = res.byRoom[roomKey] || { sold: 0, unsold: 0 };
    res.byBldg[bldg]    = res.byBldg[bldg]    || { sold: 0, unsold: 0 };
    if (isSold) { res.byRoom[roomKey].sold++; res.byBldg[bldg].sold++; }
    else        { res.byRoom[roomKey].unsold++; res.byBldg[bldg].unsold++; }
  });
  return res;
}
```

### 2. Classification rules

For each apartment row, the **PRICE column** determines status:

| Status | Rule | Counts as |
| ------ | ---- | --------- |
| **Sold** | text contains `Sold` | sold |
| **Available** | contains a `€` price | unsold |
| **Booked** | text is exactly `Booked` (reserved) | unsold |
| **Request price** | contains `Request` | unsold |
| **Commercial / placeholder** | empty price + no room count (e.g. Krulli `B3`, `B5`) | unsold |

- **Unsold = available + booked + request-price + commercial/other.** (Everything not Sold.)
- **Apartment type** comes from the ROOMS column: `1`–`5` → that many rooms; `-` or blank →
  **Commercial/other** (Krulli 10 lists commercial units this way; the other buildings don't).

### 3. Sanity check

Each building's **available** count should match the "**X available**" label shown on the
selection page. If a count is off, re-check the table (column detection / new statuses).

### 4. Aggregate and present

Produce the following, in this exact order. UV buildings are ordered **by number ascending**
(6/1, 6/2, 6/3, 8/1, 8/2, 8/3, 10/2, 10/3), then Krulli 10 (Skai), Mootori 2 (Hub),
Tööstuse 47 (Villa).

Percentages are `sold / total`, rounded to one decimal. Add a note that "Unsold" includes
reserved (Booked), price-on-request, and commercial units.

#### 4a. OVERALL — two flavours

Always give the overall stats **twice**:

```
### Overall — WITH Skai (all buildings)
| Sold | Unsold | Total | % Sold |

### Overall — without Skai (excludes Krulli 10)
| Sold | Unsold | Total | % Sold |
```

#### 4b. Per building

| Building | Sold | Unsold | Total | % Sold |

(One row per building, UV ascending then Skai / Hub / Villa.)

#### 4c. Per apartment type (rooms) — two flavours

Always give the per-type table **twice** (same WITH/WITHOUT Skai split as the overall stats):

```
### Per apartment type — WITH Skai (all buildings)
| Type | Sold | Unsold | Total | % Sold |

### Per apartment type — without Skai (excludes Krulli 10)
| Type | Sold | Unsold | Total | % Sold |
```

Rows: `1-room`, `2-room`, `3-room`, `4-room`, `5-room`, `Commercial/other`.
Krulli 10 (Skai) holds the only `Commercial/other` units, so that row drops to all-zeros in
the WITHOUT-Skai table — keep the row anyway for consistency.

### 5. Verify the math

Cross-check that the per-building totals and per-type totals both sum to the same overall
Sold / Unsold / Total. If they don't reconcile, re-crawl the offending page.

### 6. Compare to the previous run

History lives in **`history.ndjson`** in this skill's own directory (alongside `SKILL.md`):
one JSON record per line, oldest first. Each line is the schema in step 7.

1. `Read` `history.ndjson`. If it's missing or empty, this is the **first run** — note
   "no previous run to compare against" and skip to step 7.
2. Otherwise take the **last line** (most recent prior run) as the baseline.
3. Print a **"Changes since last run"** section comparing the new run to the baseline:

   - **Overall** (both WITH and WITHOUT Skai): show `sold` and `unsold` deltas, e.g.
     `Sold WITH Skai: 119 → 121 (+2)`. A `0` delta is fine to show as `(±0)`.
   - **Per building** and **per type**: list **only rows whose sold or unsold changed**,
     formatted `UV 10/3: sold 20 → 22 (+2), unsold 13 → 11 (-2)`. If nothing changed in a
     section, say "no changes".
   - Flag any **new or vanished** building/type keys (e.g. a new commercial unit appears)
     so a layout change on the site doesn't get silently swallowed.
4. Quote the baseline's timestamp so it's clear what "since last run" means.

### 7. Save this run

Append one record to `history.ndjson` so the next run can diff against it.

1. Get a UTC timestamp via `Bash`: `date -u +%Y-%m-%dT%H:%M:%SZ`.
2. Build this exact record (single line of JSON, no pretty-printing):

   ```json
   {
     "ts": "<UTC timestamp>",
     "overall": {
       "withSkai":    { "sold": 0, "unsold": 0, "total": 0 },
       "withoutSkai": { "sold": 0, "unsold": 0, "total": 0 }
     },
     "byBuilding": { "UV 6/1": { "sold": 0, "unsold": 0 }, "...": {} },
     "byType":     { "1": { "sold": 0, "unsold": 0 }, "...": {}, "Commercial/other": { "sold": 0, "unsold": 0 } }
   }
   ```

   - `byBuilding` keys are the display names from the buildings table (UV 6/1 … Krulli 10 (Skai),
     Mootori 2 (Hub), Tööstuse 47 (Villa)). `byType` keys are `1`–`5` and `Commercial/other`.
     Keep keys stable across runs — that's what makes the diff in step 6 work.
3. Append it: `Read` the current `history.ndjson` (empty string if it doesn't exist yet),
   add the new line at the end, and `Write` the whole file back. Append-only — never edit or
   reorder past lines.
4. Confirm to the user: "Saved run `<ts>` (`<N>` total records in history)."

### 8. Commit and push the history

After the record is appended, **always** commit and push `history.ndjson` so the log is
persisted and available to the next run (including cloud runs). Stage **only** that file —
never sweep in unrelated working-tree changes:

```bash
git -C /Users/igor/.claude/skills add volta-sales-crawl/history.ndjson
git -C /Users/igor/.claude/skills commit -m "volta-sales-crawl: log run <ts>"
git -C /Users/igor/.claude/skills push
```

- `history.ndjson` lives in this skill's directory, inside the `~/.claude/skills` git repo.
  `git -C <repo>` avoids `cd` (which can trip the Bash tool's permission prompt).
- Commit directly to the current branch (`main`) — this is an append-only data log, not a
  code change, so no feature branch or PR. Use the run's UTC `<ts>` (from step 7) in the
  message.
- Commit/push **only** if the append in step 7 actually added a record. If the crawl was
  aborted or no record was written, skip this step.
- If `push` fails (e.g. no network / missing credentials in a cloud sandbox), report the
  failure but don't treat the crawl as failed — the record is already saved locally and will
  push on a later run.

## Notes

- Column layouts differ between pages (some have a balcony column, UV-6 has a building
  column, Krulli puts NR before FLOOR). The parser detects columns from the header — don't
  hardcode indices.
- The trailing `BOOK` button text on available rows is just a CTA, **not** a "Booked" status.
  Only an exact `Booked` in the price column means reserved.
- These are separate developments grouped under Volta: the 8 Uus-Volta buildings + Tööstuse
  47 + Mootori 2 are the "Volta Residentsid / Galerii Loftid" cluster; **Krulli 10 is the
  Volta Skai tower** — hence the WITH/WITHOUT Skai split.
- No login or env vars required; all pages are public.
