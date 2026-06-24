# Running these skills in cloud agents

Some skills run in **Claude Code cloud sessions** (headless Linux container, no display,
no saved logins, datacenter IP). Each `SKILL.md` has a **"Runs in:"** line. Today the
viable ones are **public-page browser skills** (volta) and **API skills**; login skills
stay local.

A cloud session **clones this repo** and reads its config. Two pieces make a browser skill
work in the cloud:

## 1. The Playwright MCP server — committed `.mcp.json`

Cloud sessions get MCP servers **only** from a committed [`.mcp.json`](../.mcp.json) at the
repo root. (Your local `~/.claude.json` doesn't travel; the cloud env UI has no MCP field;
and the Setup script can't run `claude mcp add` — the `claude` CLI isn't on its PATH.) This
repo ships one:

```json
{ "mcpServers": { "playwright-headless": { "type": "stdio", "command": "npx",
  "args": ["-y","@playwright/mcp@latest","--headless","--isolated","--browser","chromium"] } } }
```

It's named **`playwright-headless`** (not `playwright`) on purpose: a committed `.mcp.json`
also loads **locally** when you open this repo, and reusing the name `playwright` would
clobber your global **headed** server (in `~/.claude.json`) that the login skills rely on.
With a distinct name they coexist. Cloud-viable browser skills therefore list **both** tool
namespaces in `allowed-tools` (`mcp__playwright__*` **and** `mcp__playwright-headless__*`),
so they use headed locally and headless in cloud.

> Minor local effect: opening **this repo** in Claude Code now also starts the
> `playwright-headless` server. It's dormant until a browser tool is called, and it does
> not touch your headed `playwright`. (It's irrelevant when you invoke skills from other
> projects — only this repo's `.mcp.json` is read.)

## 2. Headless Chromium — the cloud environment's Setup script

The MCP server needs a browser binary. In the cloud environment's **Setup script** field,
paste this (inline — **not** `bash cloud/setup.sh`; the setup script runs before the repo
is at the working directory, so a repo path won't resolve there):

```bash
#!/bin/bash
npx -y playwright@latest install --with-deps chromium || npx -y playwright@latest install chromium
```

Network access **Full**. No environment variables are needed for volta. **Don't put secrets
in the env-vars box** — it's plaintext and shared with anyone using the environment.

## Which skills run in cloud?

| Skill | Cloud? | Notes |
| ----- | ------ | ----- |
| `volta-sales-crawl` | ✅ yes | public pages, no login, no secrets — **the reference cloud skill** |
| `spotify` | ⚠️ only if you accept plaintext secrets | needs `SPOTIFY_*` in the plaintext env-vars box — OK for a *personal* environment, not a shared one. No secret vault exists in this UI. |
| `linkedin-connect` / `linkedin-grow` | ❌ no | needs your LinkedIn session; datacenter IP + automation → account-ban risk |
| `lhv-investment-report` | ❌ no | Smart-ID interactive login — can't run headless |

## First cloud test: `volta-sales-crawl`

1. Push the repo (done) so the cloud session clones the `.mcp.json`.
2. In the cloud environment: **Setup script** = the Chromium install above; **Network access** = Full.
3. Start a **new** session and invoke `volta-sales-crawl`. The agent should use the
   `playwright-headless` tools and return the sold/unsold tables — confirming the cloud
   browser pipeline works.

## Auth tiers (for future skills)

| Tier | How | Use for |
| ---- | --- | ------- |
| **Public, no auth** ✅ | nothing | volta; the planned Amazon/Discogs scraper |
| **API + token** | token in the env-vars box (plaintext — personal envs only) | spotify |
| **Saved session** ⚠️ | export Playwright `storageState` locally, ship it, run the MCP with `--storage-state <file>` | cookie-session sites (fragile; IP/automation flags) |
| **Interactive** ❌ | impossible headless/unattended | Smart-ID, 2FA, OAuth consent, CAPTCHA |

## Planned public scraper (Amazon / Discogs / vinyl)

Public pages → cloud-eligible like volta (no auth, no secrets). Playwright handles the
JS-heavy pages. **Amazon** runs bot detection; datacenter IPs hit CAPTCHAs/blocks more than
your home IP — no login means no *ban* risk, so add retries/backoff. **Discogs** has an
official **API** (token) — prefer it over scraping.
