---
name: spotify
description: Use the Spotify Web API to manage the user's playlists — search albums/tracks, add full albums or individual tracks to a playlist, inspect playlists. Use whenever the user asks to add music to / edit / build a Spotify playlist.
allowed-tools: Bash, Read, mcp__playwright__browser_navigate, mcp__playwright__browser_snapshot, mcp__playwright__browser_click
---

# Spotify

Manage the user's Spotify playlists through the **official Web API** using a
registered-app **user** token. This is the preferred way to add/remove/list
tracks — it is reliable and not throttled like the scraped web-player token.

All operations go through the helper `spotify.py` in this skill's directory. It
auto-loads `.env`, manages the OAuth token (cache + refresh + first-time auth),
and exposes simple subcommands.

## Prerequisites

Env vars live in `.env` (see `.env.example`). `spotify.py` reads them itself, so
no manual export is needed.

- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` — from the user's app in the
  [Developer Dashboard](https://developer.spotify.com/dashboard) (reuse the **CLI** app).
- `SPOTIFY_REDIRECT_URI` — must be registered on the app, exactly. Default
  `http://127.0.0.1:8888/callback`. Spotify requires `127.0.0.1`, not `localhost`.
- `SPOTIFY_PLAYLIST_ID` — default playlist for `playlist` / `add-*` (the user's
  "To Do" list). Override per-call with `--playlist`.
- `SPOTIFY_REFRESH_TOKEN` — the user token's long-lived refresh token. With it set, the
  script renews access tokens forever with **no browser**, on any machine. Minted once
  via the bootstrap below (already set for this user).

Run everything from this skill's directory:

```bash
cd "${SKILLS_DIR:-$HOME/.claude/skills}/spotify"
```

## One-time bootstrap (only if `SPOTIFY_REFRESH_TOKEN` is unset)

**Why a browser at all, given the id + secret?** `client_id`+`client_secret` alone yield
only a _client-credentials_ token — read-only public data, **no** playlist writes. Editing
acts _as the user_, which Spotify only allows after a one-time consent. That consent
returns a **refresh token**; once it's in `.env` as `SPOTIFY_REFRESH_TOKEN`, secret +
refresh token renew access silently forever, on any machine — **the browser is never
needed again**. You only redo this if the token is revoked (e.g. password change or
client-secret regeneration). For this user it's already done, so skip this section.

To mint the refresh token:

1. Run auth in the **background** (serves a local callback, prints `AUTH_URL <url>`):
   ```bash
   python3 spotify.py auth
   ```
2. Drive the Playwright browser to that URL (`browser_navigate`); the user must be logged
   into the right Spotify account there. If already authorized it redirects straight
   through, otherwise click **Agree** (`browser_snapshot` → `browser_click`). The agent
   never types credentials.
3. On success it prints `REFRESH_TOKEN <value>` — put that in `.env` as
   `SPOTIFY_REFRESH_TOKEN`. Done permanently.

A short-lived access token is also cached in `.spotify_token.json` (gitignored) just to
avoid a refresh call on every command; safe to delete anytime.

## Commands

```bash
python3 spotify.py me                                  # verify token + whoami
python3 spotify.py playlist [PLAYLIST_ID]              # name / owner / track total
python3 spotify.py search "QUERY" [--type album|track] [--limit N]
python3 spotify.py album-tracks ALBUM                  # list a release's tracks
python3 spotify.py add-album  ALBUM [ALBUM ...] [--playlist ID] [--allow-dupes]
python3 spotify.py add-tracks TRACK [TRACK ...] [--playlist ID] [--allow-dupes]
python3 spotify.py token                               # print a valid access token (for ad-hoc curl)
```

`ALBUM` / `TRACK` accept a raw id, a `spotify:album:`/`spotify:track:` URI, or an
`open.spotify.com/...` URL. `add-*` append in the given order and **skip tracks
already in the playlist** (reported), unless `--allow-dupes`.

## Typical task — "add these albums in full to my playlist"

1. `search` each album to get the right release id. Pick by exact name + artist
   and a sensible track count (EP vs album vs remix single). Use the search query
   form `album:"NAME" artist:"ARTIST"`.
2. `add-album <id> <id> ...` (defaults to `SPOTIFY_PLAYLIST_ID`). It pulls every
   track of each release, dedups against the playlist, appends, and reports counts.
3. Report what was added / skipped and the new playlist total.

## Notes & gotchas

- **Scopes:** the token is minted with the **full** user-facing Web API scope set
  (see `SCOPES` in the script; override via `SPOTIFY_SCOPES`), so a missing scope is
  never the blocker. Editing a playlist still requires the token's account to **own or
  collaborate on** it — `playlist`/`me` confirm this.
- **Batch limit:** 100 URIs per add request (the script batches automatically).
- **Rate limits** apply per rolling 30s window; dev-mode apps are fine for this
  scale. The script honors `Retry-After` on 429.
- **Don't reach for the browser UI** for playlist edits — the API is better. The
  browser is only needed for the one-time `Agree` click during first auth.
- If the Playwright Chrome is stuck on a profile lock ("Browser is already in
  use ... mcp-chrome-stable"), kill the leftover Chrome and retry:
  `pkill -f "mcp-chrome"` (note: this logs the browser out of Spotify).
