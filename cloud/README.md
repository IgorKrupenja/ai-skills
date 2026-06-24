# Running these skills in cloud agents

Most skills here target **local** use — a headed Playwright browser with your logged-in
sessions. Some can also run in a **cloud agent** (headless Ubuntu, no display, no saved
logins, datacenter IP). Every `SKILL.md` has a **"Runs in:"** line stating which.

## Local vs cloud — two separate configs (not a repo toggle)

- **Local:** your global Playwright MCP in `~/.claude.json` — headed, with a persistent
  Chrome profile that holds your logins. Nothing here touches it.
- **Cloud:** configured in the **cloud agent itself**, not in this repo. A committed
  `.mcp.json` is *not* how cloud agents get MCP servers, and it would also wrongly apply
  locally (a second, profile-less browser). So cloud config lives in the agent
  definition; this folder holds the reference pieces to paste in.

## Cloud setup (once per agent)

1. **Gate flag:** set `SKILLS_CLOUD=1` in the cloud agent's environment. Locally it's
   unset, so the setup script is a **no-op** — your headed setup is never disturbed.
2. **Setup step:** run [`setup.sh`](setup.sh) as the agent's install/setup command.
   Gated on `SKILLS_CLOUD`, it installs **headless Chromium** for Playwright
   (`playwright install --with-deps chromium`). Nothing else to install — the skills are
   pure-stdlib Python and `python3` is preinstalled on the sandbox.
3. **MCP:** add the Playwright server from [`mcp.headless.json`](mcp.headless.json) to the
   agent's MCP config — it runs `@playwright/mcp --headless --isolated`.
4. **Secrets:** `.env` is gitignored and is **not** cloned into the cloud env. Provide any
   secrets (e.g. spotify's `SPOTIFY_*`) through your cloud platform's secret/env store,
   not a file. (Exact mechanism is platform-specific — e.g. a vault / environment config
   for managed agents.)

> The `SKILLS_CLOUD` boolean is the toggle you wanted: Chromium installs **only** when
> it's set, so the same repo stays clean locally and self-provisions in the cloud.

## Which skills run in cloud?

| Skill | Cloud? | Why |
| ----- | ------ | --- |
| `volta-sales-crawl` | ✅ yes | public pages, no login — **the reference cloud skill** |
| `spotify` | ✅ yes | Web API + token; provide `SPOTIFY_*` secrets in the cloud env |
| `linkedin-connect` / `linkedin-grow` | ❌ no | needs your LinkedIn session; datacenter IP + automation → account-ban risk |
| `lhv-investment-report` | ❌ no | Smart-ID interactive login (phone approval) — can't run headless |

## First cloud test: `volta-sales-crawl`

It needs **no login and no secrets** — the cleanest end-to-end check that the cloud
browser pipeline works.

1. Do the cloud setup above (so `SKILLS_CLOUD=1` and Chromium is installed).
2. Run the skill in the cloud agent (invoke `volta-sales-crawl`).
3. Expect the usual sold/unsold tables. Populated apartment tables prove headless
   rendering of JS-heavy pages works — pipeline good.

## Auth for cloud, by tier

| Tier | How | Use for |
| ---- | --- | ------- |
| **API + token** ✅ | token in the cloud secret store, no browser | spotify; anything with an API |
| **Saved session** ⚠️ | pre-auth locally → export Playwright `storageState` → store as a secret → run the MCP with `--storage-state <file>` | cookie-session sites with no API (fragile: cookies expire; IP-change/automation flags) |
| **Interactive** ❌ | impossible headless/unattended | Smart-ID, 2FA, OAuth consent, CAPTCHA |

## Planned public-scraper skill (Amazon / Discogs / vinyl store)

Public pages, so cloud-eligible like volta. Notes for when you build it:

- **Playwright > fetch** here (JS-heavy / SPA pages) — right call.
- **Amazon** runs bot detection; datacenter IPs hit CAPTCHAs/blocks more than your home
  IP. No login means no *ban* risk — worst case is a blocked request — so add
  retries/backoff and expect occasional misses. A residential proxy helps if it bites.
- **Discogs** has an official **API** (with a token) — prefer it over scraping where it
  covers what you need; that's the easy "API + token" tier.
