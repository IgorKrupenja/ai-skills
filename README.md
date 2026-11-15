# ai-skills

A collection of AI agent skills for automating personal workflows. Uses the common [Agent Skills](https://agentskills.io/home) format supported by different agentic AI tools: Claude Code, Cursor, Gemini CLI, Codex, OpenClaw and so on.

## Setup

1. Clone this repo into a folder your agentic AI tool uses for skills.
2. Run `cp .env.example .env` and fill in your values in the `.env` file.
3. Skills look for the `.env` in `~/.claude/skills`. If you cloned the repo somewhere else, also set `SKILLS_DIR` to its path in your shell environment: a value inside `.env` can't help find the `.env` itself.

Depending on the skill, you also need:

- Python 3. The scripts use only the standard library.
- `playwright-cli` (the `@playwright/cli` package), for the browser skills and the first `spotify` authorization. They share one persistent browser named `personal`, each in a background tab of its own through `scripts/tab.py`.
- The `gog` Google Calendar CLI, for `social-calendar`.

## Skills

### lhv-investment-report

Automate the annual LHV investment account tax report (Investeerimiskonto aruanne): log in with Smart-ID, pick the right account and period, keep only the rows for the external account, and submit the report to MTA.

| Variable                 | Description                                                                     |
| ------------------------ | ------------------------------------------------------------------------------- |
| `LHV_USERNAME`           | LHV internet bank username                                                      |
| `LHV_ISIKUKOOD`          | Estonian personal ID number (isikukood)                                         |
| `LHV_ACCOUNT_INVESTMENT` | LHV investment account IBAN                                                     |
| `LHV_ACCOUNT_EXTERNAL`   | External account IBAN that is used to make transfers from/to investment account |

### linkedin-connect

Send LinkedIn connection requests (without a note) to people in search results, page by page, until the weekly limit is reached.

This is the **main** skill to use until the weekly limit is hit.

| Variable               | Description                                |
| ---------------------- | ------------------------------------------ |
| `LINKEDIN_CONNECT_URL` | LinkedIn people search URL to iterate over |

### linkedin-grow

Send LinkedIn connection requests (without a note) to matching people in the "People you may know" section on the grow page, filtered by job title keywords.

Use as a fallback when `linkedin-connect` hits the weekly limit: "People you may know" invites are throttled separately and often still go through.

| Variable                 | Description                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `LINKEDIN_GROW_KEYWORDS` | Comma-separated job title keywords to match (case-insensitive)                                |
| `LINKEDIN_GROW_LOCATION` | Location name for the "People you may know in ..." section (e.g. `Tallinn Metropolitan Area`) |

### volta-sales-crawl

Crawl all Endover Volta apartment buildings (the 8 Uus-Volta houses, Tööstuse 47, Mootori 2, and Krulli 10 / Volta Skai), then report **sold vs unsold** apartments with percentages: overall, per building, and per apartment type. Overall stats are given in two flavours: **with** and **without** Volta Skai (Krulli 10).

Each run is appended to `volta-sales-crawl/history.ndjson` with every flat's status and price, so the skill can also say which flat sold, got booked or changed since the previous run.

Browser-free: runs via `python3 volta-sales-crawl/volta.py` (HTTP + HTML parse, Python stdlib). No env vars: all source pages are public.

### spotify

Manage Spotify playlists via the Web API: search and add full albums or individual tracks to a playlist, and inspect playlists. Uses a registered-app **user** token (cached and auto-refreshed); the first run authorizes once via the browser.

All operations go through `spotify/spotify.py`, Python 3 standard library only (`python3 spotify.py <cmd>`).

| Variable                  | Description                                                                      |
| ------------------------- | -------------------------------------------------------------------------------- |
| `SPOTIFY_CLIENT_ID`       | Spotify app Client ID (Developer Dashboard)                                      |
| `SPOTIFY_CLIENT_SECRET`   | Spotify app Client Secret                                                        |
| `SPOTIFY_REDIRECT_URI`    | Registered OAuth redirect URI (default `http://127.0.0.1:8888/callback`)         |
| `SPOTIFY_PLAYLIST_ID`     | Default playlist to edit (override per call with `--playlist`)                   |
| `SPOTIFY_PLAYLIST_<NAME>` | Named playlists, each usable as `--playlist <name>` (e.g. `_SPORT`, `_CLASSICS`) |
| `SPOTIFY_REFRESH_TOKEN`   | Long-lived refresh token; set once via `auth`, then no browser ever              |
| `SPOTIFY_SCOPES`          | Optional OAuth scopes; the default is the full user-facing Web API set           |

### social-calendar

Personal events **"for the soul"** (culture, leisure, run clubs; not work), a simple counterpart to the tallinn.dev event skills. Crawl bookmarked sources → list candidates in chat → add the chosen ones to a private Google Calendar (events colored so they stand out next to mundane entries) → remember the rejects, including whole **banned series** so they never get suggested again. Runs locally.

Uses the `gog` Google Calendar CLI. On every crawl `sync_sources.py` syncs the bookmarks folder into `social-calendar/sources.yaml`: new bookmarks are added, deleted ones removed, per-source notes kept. The reject/added/ban memory lives in a git-ignored `social-calendar/state.json` (see `social-calendar/state.example.json` for the shape), and `filter.py` applies it to each crawl. Events you paid or registered for move to a second private calendar, and `bought.py` lists the upcoming ones there, so crawls set apart what's already bought. How to crawl run clubs (Instagram schedules, the Estonian sörk club directory) is in `social-calendar/run-clubs.md`. The Tallinna Rahvaülikool cooking courses sell out fast, so `kokandus.py` watches the whole listing and reports new courses, freed spots and Italian ones on every crawl.

| Variable                           | Description                                                        |
| ---------------------------------- | ------------------------------------------------------------------ |
| `BOOKMARKS_FILE`                   | Path to the Chromium/Vivaldi bookmarks JSON                        |
| `SOCIAL_CALENDAR_BOOKMARKS_FOLDER` | Folder path inside bookmarks, `/`-separated (e.g. `Social/Events`) |
| `SOCIAL_CALENDAR_ID`               | Target Google Calendar ID (a private calendar)                     |
| `SOCIAL_CALENDAR_PAID_ID`          | Second private calendar, for events you paid or registered for     |
| `SOCIAL_CALENDAR_EVENT_COLOR`      | `gog` event color id 1-11 so events stand out (`6` = Tangerine)    |
| `SOCIAL_CALENDAR_TIMEZONE`         | IANA timezone, e.g. `Europe/Tallinn`                               |

### fashion-hunt

Find live listings of a fashion item, mostly designer accessories, in the shops bookmarked in Vivaldi under `Fashion/Online` and `Fashion/Tallinn`, and compare each with the brand's new price. Subagents search all shops and brand stores in parallel, each in its own background tab of the shared `playwright-cli` browser. The report is one table sorted by price, with near matches grouped apart, authenticity risks flagged and changes since the last run.

In tools without subagents, it searches the shops one at a time instead.

| Variable         | Description                                 |
| ---------------- | ------------------------------------------- |
| `BOOKMARKS_FILE` | Path to the Chromium/Vivaldi bookmarks JSON |

### screenshot

Take a screenshot of a web page and send it to the user. It always captures only the visible viewport, since full-page shots of long pages are too big to download in a chat. Uses `playwright-cli` with the shared `personal` browser, in a background tab of its own when another chat is using it. No env vars.

## Security disclaimer

- All secrets should be in env variables.
- Please check skills content and run them at your own risk.
