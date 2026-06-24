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
{ "mcpServers": { "playwright-headless": { "type": "stdio", "command": "bash",
  "args": ["cloud/playwright-mcp-launch.sh"] } } }
```

It runs through a small wrapper, [`cloud/playwright-mcp-launch.sh`](playwright-mcp-launch.sh),
rather than calling `npx @playwright/mcp` directly — the wrapper wires Chromium up to the
agent proxy (see [§3](#3-playwright-through-the-agent-proxy) below). The wrapper still ends in
the same `npx -y @playwright/mcp@latest --headless --isolated --browser chromium`.

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
# Install the browser @playwright/mcp expects — use ITS OWN installer so the build matches
# the MCP version (a plain `playwright install chromium` fetches a different build and the
# MCP errors with: Browser "chrome-for-testing" is not installed).
npx -y @playwright/mcp@latest install-browser chrome-for-testing
# OS libraries headless Chrome needs (best-effort; needs root — skip if it can't).
npx -y playwright@latest install-deps 2>/dev/null || true
```

Network access **Full**. No environment variables are needed for volta. **Don't put secrets
in the env-vars box** — it's plaintext and shared with anyone using the environment.

## 3. Playwright through the agent proxy

Cloud sessions have **no direct internet** — all outbound HTTPS goes through Claude Code's
agent proxy (`$HTTPS_PROXY`, e.g. `http://127.0.0.1:35415`, with a re-terminating CA at
`/root/.ccr/ca-bundle.crt`). `curl`/`git` are pre-configured for it, but headless Chromium is
**not**, and a raw `npx @playwright/mcp` fails every navigation with `net::ERR_CONNECTION_CLOSED`.
Two distinct fixes are needed — both live in the wrapper / config this repo ships:

1. **Point Chromium at the proxy.** Chromium ignores the `HTTPS_PROXY` env var; it needs an
   explicit `--proxy-server`. The wrapper passes `--proxy-server "$HTTPS_PROXY"` — but only
   when `HTTPS_PROXY` is set, so locally (no proxy) it connects directly and the headless
   server stays a harmless no-op. Without this, Chromium tries a direct connection that the
   egress policy drops.

2. **Cap TLS at 1.2** (`--ssl-version-max=tls1.2`, in [`playwright-mcp-config.json`](playwright-mcp-config.json)
   via `--config`). Once the proxy CONNECT succeeds, Chrome starts its own TLS handshake to the
   site *through* the tunnel and it dies mid-handshake (`SSL_HANDSHAKE_ERROR`, `net_error=-100`).
   Cause: Chrome's TLS 1.3 ClientHello carries the **post-quantum key share**
   (`X25519MLKEM768`), which is large and fragmented across TCP segments, and the proxy's TLS
   frontend resets on it. `curl --tlsv1.3` over the *same* proxy works, so the proxy itself
   speaks 1.3 fine — it's specific to Chrome's ClientHello. The PQ key share **can't** be
   turned off with `--disable-features=PostQuantumKyber,X25519MLKEM768,…` in the Playwright
   Chromium build (the field-trial testing config forces it on, even with
   `--disable-field-trial-config`), so capping the TLS version is the reliable lever. 1.2 is
   universally supported and fine for crawling public pages.

> Diagnosing this yourself: `curl -sS "$HTTPS_PROXY/__agentproxy/status"` shows recent
> proxy-side failures, and launching Chrome with `--log-net-log=…` reveals the
> `HTTP/1.1 200 Connection Established` (proxy OK) followed by the `SSL_HANDSHAKE_ERROR`
> (TLS step failing) — that split is what tells the two fixes apart. See `/root/.ccr/README.md`.

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
