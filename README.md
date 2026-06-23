# ai-skills

A collection of AI agent skills for automating personal workflows. Uses the common [Agent Skills](https://agentskills.io/home) format supported by different agentic AI tools: Claude Code, Cursor, Gemini CLI, Codex, OpenClaw and so on.

## Setup

1. Clone this repo into a folder your agentic AI tool uses for skills.
2. Run `cp .env.example .env` and fill in your values in the `.env` file.
3. TypeScript skills (e.g. `spotify`) run with [Bun](https://bun.sh) — install it, then run `bun install` for dev type definitions.

## Skills

### lhv-investment-report

Automate the annual LHV investment account tax report (Investeerimiskonto aruanne) and submit to MTA.

| Variable                 | Description                                                                     |
| ------------------------ | ------------------------------------------------------------------------------- |
| `LHV_USERNAME`           | LHV internet bank username                                                      |
| `LHV_ISIKUKOOD`          | Estonian personal ID number (isikukood)                                         |
| `LHV_ACCOUNT_INVESTMENT` | LHV investment account IBAN                                                     |
| `LHV_ACCOUNT_EXTERNAL`   | External account IBAN that is used to make transfers from/to investment account |

### linkedin-connect

Send LinkedIn connection requests (without a note) to people in search results, page by page, until the weekly limit is reached.

This is the **main** skill that should be used before weekly limit is hit.

| Variable               | Description                                |
| ---------------------- | ------------------------------------------ |
| `LINKEDIN_CONNECT_URL` | LinkedIn people search URL to iterate over |

### linkedin-grow

Send LinkedIn connection requests (without a note) to matching people in the "People you may know" section on the grow page, filtered by job title keywords.

Use as a fallback when `linkedin-connect` hits the weekly limit — "People you may know" invites are throttled separately and often still go through.

| Variable                 | Description                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `LINKEDIN_GROW_KEYWORDS` | Comma-separated job title keywords to match (case-insensitive)                                |
| `LINKEDIN_GROW_LOCATION` | Location name for the "People you may know in ..." section (e.g. `Tallinn Metropolitan Area`) |

### volta-sales-crawl

Crawl all Endover Volta apartment buildings (the 8 Uus-Volta houses, Tööstuse 47, Mootori 2, and Krulli 10 / Volta Skai), then report **sold vs unsold** apartments with percentages — overall, per building, and per apartment type. Overall stats are given in two flavours: **with** and **without** Volta Skai (Krulli 10).

No env vars required — all source pages are public.

### spotify

Manage Spotify playlists via the Web API — search and add full albums or individual tracks to a playlist, and inspect playlists. Uses a registered-app **user** token (cached and auto-refreshed); the first run authorizes once via the browser. All operations go through `spotify/spotify.ts`, run with [Bun](https://bun.sh) (`bun spotify.ts <cmd>`).

| Variable                  | Description                                                                      |
| ------------------------- | -------------------------------------------------------------------------------- |
| `SPOTIFY_CLIENT_ID`       | Spotify app Client ID (Developer Dashboard)                                      |
| `SPOTIFY_CLIENT_SECRET`   | Spotify app Client Secret                                                        |
| `SPOTIFY_REDIRECT_URI`    | Registered OAuth redirect URI (default `http://127.0.0.1:8888/callback`)         |
| `SPOTIFY_PLAYLIST_ID`     | Default playlist to edit (override per call with `--playlist`)                   |
| `SPOTIFY_PLAYLIST_<NAME>` | Named playlists, each usable as `--playlist <name>` (e.g. `_SPORT`, `_CLASSICS`) |
| `SPOTIFY_REFRESH_TOKEN`   | Long-lived refresh token; set once via `auth`, then no browser ever              |

## Security disclaimer

All secrets should be in env variables. Please check skills content and run them at your own risk.
