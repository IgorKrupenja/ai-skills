# ai-skills

A collection of AI agent skills for automating personal workflows. Uses the common [Agent Skills](https://agentskills.io/home) format supported by different agentic AI tools: Claude Code, Cursor, Gemini CLI, Codex, OpenClaw and so on.

## Setup

1. Pre-requisites:
   - Install [Google Chrome](https://www.google.com/chrome/).
   - Install [Bun](https://bun.sh): `curl -fsSL https://bun.sh/install | bash` or `brew install oven-sh/bun/bun`.
   - For `social-calendar`, configure OAuth client (a Desktop app) with `~/.config/gws/client_secret.json`, as the [gws README](https://github.com/googleworkspace/cli) explains.
2. Clone this repo into a folder your agentic AI tool uses for skills.
3. Run `bun install` in it.
4. Run `cp .env.example .env` and fill in your values in the `.env` file.
5. Sign in to a Google account you want to use `social-calendar` with:

    ```bash
    bun node_modules/skills-kit/src/gws.ts auth login --scopes 'openid,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/calendar'
    ```

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

Browser-free: runs via `bun volta-sales-crawl/volta.ts` (HTTP + HTML parse, no dependencies). No env vars: all source pages are public.

### spotify

Manage Spotify playlists via the Web API: search and add full albums or individual tracks to a playlist, and inspect playlists. Uses a registered-app **user** token (cached and auto-refreshed); the first run authorizes once via the browser.

All operations go through `spotify/spotify.ts` (`bun spotify.ts <cmd>`), with no dependencies.

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

Find culture and leisure events in the sources you bookmark, list them in chat and add the ones you pick to a private Google Calendar. Events and series you reject are not suggested again.

| Variable                           | Description                                                        |
| ---------------------------------- | ------------------------------------------------------------------ |
| `BOOKMARKS_FILE`                   | Path to the Chromium/Vivaldi bookmarks JSON                        |
| `SOCIAL_CALENDAR_BOOKMARKS_FOLDER` | Folder path inside bookmarks, `/`-separated (e.g. `Social/Events`) |
| `SOCIAL_CALENDAR_ID`               | Target Google Calendar ID (a private calendar)                     |
| `SOCIAL_CALENDAR_PAID_ID`          | Second private calendar, for events you paid or registered for     |
| `SOCIAL_CALENDAR_EVENT_COLOR`      | Event color id 1-11 so events stand out (`6` = Tangerine)          |
| `SOCIAL_CALENDAR_TIMEZONE`         | IANA timezone, e.g. `Europe/Tallinn`                               |
| `GOOGLE_PLACES_API_KEY`            | Google Places API (New) key, to turn venue names into addresses    |

### fashion-hunt

Find live listings of a fashion item, mostly designer accessories, in the shops bookmarked in Vivaldi under `Fashion/Online` and `Fashion/Tallinn`, and compare each with the brand's new price. Subagents search all shops and brand stores in parallel, each in its own background tab of the repo's browser. The report is a page published as an Artifact: every listing sorted by price, a tab for the matches and one per kind of near match, filters by size, condition, shop, authenticity risk and EU, and changes since the last run. Small results come as a table in chat instead.

In tools without subagents, it searches the shops one at a time instead.

| Variable         | Description                                 |
| ---------------- | ------------------------------------------- |
| `BOOKMARKS_FILE` | Path to the Chromium/Vivaldi bookmarks JSON |

### screenshot

Take a screenshot of a web page and send it to the user. It always captures only the visible viewport, since full-page shots of long pages are too big to download in a chat. Uses the repo's browser, in a background tab of its own. No env vars.

## Security disclaimer

- All secrets should be in env variables.
- Please check skills content and run them at your own risk.
