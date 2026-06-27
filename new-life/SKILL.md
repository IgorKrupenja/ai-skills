---
name: new-life
description: Personal "New Life" events for the soul (culture/leisure, NOT work). Crawl Igor's bookmarked sources, list candidates in chat, add chosen ones to the private "New Life" Google Calendar, and remember what to skip — both single events and whole banned series. Use when Igor asks to show / review "new life" events, add a personal non-work event, or ban an event series.
---

# New Life — Personal Events Skill

Runs in: **local** (needs the browser + the local Vivaldi bookmarks file).

A dead-simple, personal counterpart to the tallinn.dev event skills — but for **culture & leisure** ("для души"), not IT/work. No Coda, no labels, no publishing. Just:

**crawl bookmarked sources → list in chat → add the picks to a private calendar → remember the rejects.**

Everything is private: a personal Google Calendar and a git-ignored `state.json`. Nothing is published anywhere.

## Prerequisites

Always load env first (some values contain spaces, so use `set -a`, not `export $(...)`):

```bash
set -a && source "${SKILLS_DIR:-$HOME/.claude/skills}/.env" && set +a
```

| Variable                    | Meaning                                                              |
| --------------------------- | ------------------------------------------------------------------- |
| `BOOKMARKS_FILE`            | Path to the Chromium/Vivaldi bookmarks JSON                         |
| `NEW_LIFE_BOOKMARKS_FOLDER` | Folder path inside bookmarks, `/`-separated (e.g. `New Life/Events`) |
| `NEW_LIFE_CALENDAR_ID`      | Target Google Calendar ID (the private "New Life" calendar)          |
| `NEW_LIFE_EVENT_COLOR`      | `gog` event color id 1–11 (so events stand out). `6` = Tangerine     |
| `NEW_LIFE_TIMEZONE`         | IANA timezone, e.g. `Europe/Tallinn`                                 |

State file: **`new-life/state.json`** (git-ignored). If missing, create it from `state.example.json`.

The calendar was created once with:
`gog calendar create-calendar "New Life" --timezone "Europe/Tallinn"`
and colored in the sidebar with `gog calendar subscribe "$NEW_LIFE_CALENDAR_ID" --color-id 6`. You don't need to recreate it.

---

## The three things Igor will ask

### A) "Show / review new life events" → crawl

1. **Get today's date first** (avoid year mistakes):
   ```bash
   date +"%Y-%m-%d %A %Z"
   ```

2. **Read source URLs fresh** from the bookmarks folder (the list changes between runs):
   ```bash
   FIRST="${NEW_LIFE_BOOKMARKS_FOLDER%%/*}"   # e.g. "New Life"
   LAST="${NEW_LIFE_BOOKMARKS_FOLDER##*/}"    # e.g. "Events"
   jq -r --arg first "$FIRST" --arg last "$LAST" '
     [.. | objects | select(.type=="folder" and .name==$first)][0]
     | [.. | objects | select(.type=="folder" and .name==$last)][0]
     | .children[]? | select(.type=="url") | "\(.name)\t\(.url)"
   ' "$BOOKMARKS_FILE"
   ```

3. **Crawl every source.** Open each URL in the browser, dismiss cookie/login popups, read the snapshot, and extract event candidates based on what's actually on the page (don't hardcode per-site logic).
   - **Never skip a source** because it's noisy or you "already have enough". Every bookmark is there on purpose. If a page needs login, ask Igor to log in.
   - **Every candidate MUST have a URL.** If you can see a title/date but no link, click into it / read the `href` before moving on.
   - Collect across ALL sources before showing anything:
     ```
     candidate = { title, date, url, source_url, location? }
     ```
   - `source_url` = the bookmark the candidate came from (needed for series bans).

4. **Filter against `state.json`** (see [Filtering](#filtering-what-not-to-show)). Drop:
   - anything already in `added` or `declined` (by URL), and
   - anything matching a `banned_series` entry.

5. **Present ALL survivors** as one numbered table in chat:

   | # | Date | Title | Where | Source | Link |
   |---|------|-------|-------|--------|------|

   Then **report what was filtered** — never drop silently:
   > Скрыл 4: 2 уже добавлены, 1 ранее отклонён, 1 из забаненной серии «Open Mic».

   Criteria for now: **show everything** (no taste filtering yet). This will be refined over time.

### B) "Add 1, 3, 5" → put on the calendar

For each chosen candidate:

1. **Extract full content** from its page. For **Facebook**, always click **"See more"** to expand the full text first.
2. **Content policy:** do **not** summarize, do **not** translate, keep original formatting/emojis. (This is a private calendar — full original text is the point.)
3. **Resolve location** to a real address when a venue name is given — either pass the venue/address text straight to `--location`, or let `gog` resolve it with `--location-search "Venue name, City"`.
4. **Dedup:** skip if the URL is already in `state.json` `added`. (Optional extra safety: `gog calendar events "$NEW_LIFE_CALENDAR_ID" --from … --to … --json` for that day and compare title+time.)
5. **Create the event:**
   ```bash
   gog calendar create "$NEW_LIFE_CALENDAR_ID" \
     --summary "Event Title" \
     --from "YYYY-MM-DDTHH:MM:SS" \
     --to   "YYYY-MM-DDTHH:MM:SS" \
     --timezone "$NEW_LIFE_TIMEZONE" \
     --location "Full address or venue" \
     --event-color "$NEW_LIFE_EVENT_COLOR" \
     --description "<EVENT_URL>

   <FULL ORIGINAL DESCRIPTION>"
   ```
   - Description format: **URL on line 1**, blank line, then the full original text.
   - Times: local `YYYY-MM-DDTHH:MM:SS` + `--timezone` (Google applies DST correctly). For all-day: `--all-day --from YYYY-MM-DD --to YYYY-MM-DD` (end = next day).
6. **Record it** in `state.json` `added` so it's never re-suggested (see schema below).
7. Report back with the event's `htmlLink`.

### C) "Not interested in 2, 4" / "Ban series 6" → remember the skip

- **Single event** ("не интересно", "skip"): append to `declined`.
- **Whole series** ("забань серию", "больше не предлагай такое"): append to `banned_series`. The match key is the event's **normalized title** (see below), scoped to its `source_url`. Igor can also give a custom phrase ("забань всё с 'карнавал осьминогов'") — normalize that phrase instead.
- After editing, confirm in one line what will now be hidden.

---

## Filtering: what NOT to show

`state.json` is the memory of rejects. Use this normalization for both **creating** a ban key and **matching** candidates, so they line up:

```python
import re
def normalize(t):
    t = (t or "").lower()
    t = re.sub(r'[#№]', ' ', t)
    t = re.sub(r'\d+', ' ', t)               # drop numbers: vol 12, years, dates
    t = re.sub(r'[^\w\s]', ' ', t, re.UNICODE)  # drop punctuation/emoji, keep RU/ET/EN words
    return re.sub(r'\s+', ' ', t).strip()
```

A candidate is **hidden** when any of these is true:
- its `url` is in `added` (by url) or `declined` (by url);
- there is a `banned_series` entry `b` where `b.source` is `"*"` **or** equals the candidate's `source_url`, **and** `b.match` is contained in `normalize(candidate.title)`.

Ready-to-run filter (write the crawled candidates to a temp JSON array first):

```python
import json, re, sys
def normalize(t):
    t=(t or "").lower(); t=re.sub(r'[#№]',' ',t); t=re.sub(r'\d+',' ',t)
    t=re.sub(r'[^\w\s]',' ',t,flags=re.UNICODE); return re.sub(r'\s+',' ',t).strip()

state = json.load(open(sys.argv[1]))            # state.json
cands = json.load(open(sys.argv[2]))            # [{title,date,url,source_url,location}]
seen  = {e["url"] for e in state["added"]} | {e["url"] for e in state["declined"]}
bans  = state["banned_series"]

show, hidden = [], []
for c in cands:
    if c["url"] in seen:
        hidden.append((c, "already added/declined")); continue
    nt = normalize(c["title"])
    hit = next((b for b in bans
                if (b["source"] in ("*", c.get("source_url"))) and b["match"] in nt), None)
    if hit:
        hidden.append((c, f"banned series «{hit['label']}»")); continue
    show.append(c)

print(f"SHOW {len(show)} / HIDE {len(hidden)}")
for c,why in hidden: print("  hidden:", c["title"], "—", why)
print(json.dumps(show, ensure_ascii=False, indent=2))
```

---

## `state.json` schema

```jsonc
{
  "added":    [ { "url": "...", "title": "...", "date": "2026-06-29", "added_at": "2026-06-27" } ],
  "declined": [ { "url": "...", "title": "...", "declined_at": "2026-06-27" } ],
  "banned_series": [
    {
      "match":  "open mic",                          // normalized phrase to match in titles
      "label":  "Open Mic @ Erinevate Tubade Klubi", // human-readable, for reports
      "source": "https://www.facebook.com/erinevatetubadeklubi/", // bookmark scope, or "*" for global
      "banned_at": "2026-06-27"
    }
  ]
}
```

Use `date +%F` for the `*_at` stamps. Edit the file directly (read → modify JSON → write); keep it valid JSON.

---

## Quality checklist

- ✅ Sourced env; ran `date` first
- ✅ Read bookmarks **fresh**; crawled **every** source; no source skipped
- ✅ Every candidate has a URL
- ✅ Filtered against `added` + `declined` + `banned_series`
- ✅ Reported how many were hidden and why (no silent drops)
- ✅ On add: full original text (no summary/translate), FB "See more" expanded, URL on line 1
- ✅ Event created with `--event-color "$NEW_LIFE_EVENT_COLOR"` and `--timezone "$NEW_LIFE_TIMEZONE"`
- ✅ Recorded adds/declines/bans back into `state.json`

## Pitfalls

- ❌ Skipping a source because there are "enough" candidates already
- ❌ A candidate with no URL
- ❌ Summarizing/translating the description, or forgetting FB "See more"
- ❌ Date-only `--from/--to` for a timed event (use `THH:MM:SS` + `--timezone`)
- ❌ Forgetting to record an add/decline/ban → it gets suggested again
- ❌ Committing `state.json` (it's git-ignored — keep it that way)
