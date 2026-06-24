# Running these skills in cloud agents

Claude Code **cloud sessions** = headless Linux container, no display, no saved logins,
datacenter IP, egress through a proxy. A session **clones this repo** and reads its config.

**What works in cloud today: HTTP + API skills.**

- **`volta-sales-crawl`** — pure HTTP + HTML parse (`python3 volta.py`), **no browser**. Just works.
- **`spotify`** — Web API + token (secret caveat below).

**Headless-browser-in-cloud is _not_ proven yet** (see the open proxy issue below). The repo
keeps the browser scaffolding for that investigation, but **no current skill needs it**.

## Which skills run in cloud?

| Skill | Cloud? | Notes |
| ----- | ------ | ----- |
| `volta-sales-crawl` | ✅ yes | `python3 volta.py` — HTTP + parse, no browser, nothing to install |
| `spotify` | ⚠️ personal env only | `SPOTIFY_*` would go in the **plaintext** env-vars box — OK for a private environment, not a shared one. No secret vault in this UI. |
| `linkedin-connect` / `linkedin-grow` | ❌ no | needs your LinkedIn session; datacenter IP + automation → account-ban risk |
| `lhv-investment-report` | ❌ no | Smart-ID interactive login — can't run headless |

## Cloud environment setup

- **Network access: Full.**
- **Environment variables** box is `.env` format but **plaintext and shared — put no real
  secrets there.** volta needs none.
- **Secrets:** there's no secret vault in this UI. `spotify`'s `SPOTIFY_*` would have to sit
  in the plaintext env-vars box — acceptable only for a personal environment.

For volta that's the whole setup: Full network, nothing else. Start a session, run
`python3 volta.py`.

## Browser-in-cloud (experimental — for future JS-only skills)

Most "JS-heavy" sites turn out server-rendered (endover was — that's why volta is
browser-free). Reach for a real browser only when a page is **genuinely client-rendered**.
Current status of that path:

1. **MCP server** — committed [`.mcp.json`](../.mcp.json), server **`playwright-headless`**
   (distinct name so it doesn't clobber your local headed `playwright`). Cloud sessions read
   MCP servers **only** from a committed `.mcp.json` — not `~/.claude.json`, there's no MCP UI
   field, and the Setup script can't `claude mcp add` (`claude` isn't on its PATH).
2. **Browser binary** — cloud env **Setup script** (inline; **not** `bash cloud/setup.sh` —
   the setup script runs before the repo is at the CWD):

   ```bash
   #!/bin/bash
   npx -y @playwright/mcp@latest install-browser chrome-for-testing
   npx -y playwright@latest install-deps 2>/dev/null || true
   ```

3. **⚠️ Open issue — proxy.** The sandbox forces egress through `$HTTPS_PROXY`; `curl`/`git`
   honor it but the bundled Chromium doesn't → `net::ERR_CONNECTION_CLOSED` on every
   navigation. Likely fix: pass `--proxy-server=$HTTPS_PROXY` (and maybe `--ignore-https-errors`)
   to `@playwright/mcp`. **Under investigation.** Separately, datacenter IPs get bot-blocked by
   sites like Amazon regardless.

> Net: prefer **HTTP/API** in cloud. Reserve the headless browser for genuinely JS-only pages,
> and expect the proxy + anti-bot hurdles above.

## Planned public scraper (Amazon / Discogs / vinyl)

Try **HTTP first** (endover surprised us — fully server-rendered). **Discogs has an official
API** — prefer it (token tier). **Amazon** is JS + aggressive bot detection on datacenter IPs —
hard in cloud; likely local-only.
