---
name: volta-sales-crawl
description: Crawls all Endover Volta apartment buildings (Uus-Volta, Tööstuse 47, Mootori 2, Krulli 10 / Volta Skai), counts sold vs unsold apartments per building and per apartment type, and presents the results as tables. Overall stats are given in two flavours — WITH and WITHOUT Volta Skai (Krulli 10).
allowed-tools: mcp__playwright__browser_navigate, mcp__playwright__browser_evaluate, mcp__playwright__browser_snapshot
---

# Volta Sales Crawl Skill

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

#### 4c. Per apartment type (rooms)

| Type | Sold | Unsold | Total | % Sold |

Rows: `1-room`, `2-room`, `3-room`, `4-room`, `5-room`, `Commercial/other`.
The "without Skai" totals here are optional — only add a second type table if the user asks;
otherwise the per-type table is WITH Skai (all buildings).

### 5. Verify the math

Cross-check that the per-building totals and per-type totals both sum to the same overall
Sold / Unsold / Total. If they don't reconcile, re-crawl the offending page.

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
