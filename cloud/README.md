# Running these skills in cloud agents

Claude Code **cloud sessions** = headless Linux container, no display, no saved logins,
datacenter IP, egress through an agent proxy. A session **clones this repo** and reads its
config. Two kinds of skills run in cloud:

- **HTTP / API skills** — simplest, nothing to install. `volta-sales-crawl`
  (`python3 volta.py`, no browser) and `spotify` (Web API + token).
- **Headless-browser skills** — also work now, via the committed `.mcp.json` + the proxy/TLS
  wrapper (see [Headless browser in cloud](#headless-browser-in-cloud-for-js-only-pages)).
  Prefer HTTP/API where you can; reach for the browser only for genuinely client-rendered pages.

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
- **Secrets:** there's no secret vault in this UI. `spotify`'s `SPOTIFY_*` would have to sit in
  the plaintext env-vars box — acceptable only for a personal environment.

For **volta** that's the whole setup: Full network, then `python3 volta.py`. The browser
sections below only matter for headless-browser skills.

## Headless browser in cloud (for JS-only pages)

Most "JS-heavy" sites turn out server-rendered (endover was — that's why volta is
browser-free). Reach for a real browser only when a page is **genuinely client-rendered**.
When you do, three pieces make it work — all already wired up in this repo:

### 1. MCP server — committed `.mcp.json`

Cloud sessions read MCP servers **only** from a committed [`.mcp.json`](../.mcp.json) at the
repo root (your local `~/.claude.json` doesn't travel; the cloud env UI has no MCP field; the
Setup script can't `claude mcp add` — `claude` isn't on its PATH). It runs through a wrapper,
[`cloud/playwright-mcp-launch.sh`](playwright-mcp-launch.sh), rather than `npx @playwright/mcp`
directly — the wrapper wires Chromium to the agent proxy (see
[§3](#3-playwright-through-the-agent-proxy)); it still ends in the same
`npx -y @playwright/mcp@latest --headless --isolated --browser chromium`.

The server is named **`playwright-headless`** (not `playwright`) on purpose: a committed
`.mcp.json` also loads **locally** when you open this repo, and reusing the name `playwright`
would clobber your global **headed** server (in `~/.claude.json`) that the login skills rely
on. With a distinct name they coexist, so a cloud-viable browser skill lists **both** tool
namespaces in `allowed-tools` (`mcp__playwright__*` **and** `mcp__playwright-headless__*`) —
headed locally, headless in cloud.

> Minor local effect: opening **this repo** in Claude Code also starts the
> `playwright-headless` server (dormant until a browser tool is used; with no `$HTTPS_PROXY`
> the wrapper just launches it directly). It doesn't touch your headed `playwright`, and it's
> irrelevant when you invoke skills from other projects.

### 2. Headless Chromium — the cloud environment's Setup script

The MCP server needs a browser binary. In the cloud environment's **Setup script** field, paste
this (inline — **not** `bash cloud/setup.sh`; the setup script runs before the repo is at the CWD):

```bash
#!/bin/bash
# Install the browser @playwright/mcp expects — use ITS OWN installer so the build matches the
# MCP version (a plain `playwright install chromium` fetches a different build and the MCP errors
# with: Browser "chrome-for-testing" is not installed).
npx -y @playwright/mcp@latest install-browser chrome-for-testing
# OS libraries headless Chrome needs (best-effort; needs root — skip if it can't).
npx -y playwright@latest install-deps 2>/dev/null || true
```

### 3. Playwright through the agent proxy

Cloud sessions have **no direct internet** — all outbound HTTPS goes through Claude Code's agent
proxy (`$HTTPS_PROXY`). `curl`/`git` are pre-configured for it, but headless Chromium is **not**,
and a raw `npx @playwright/mcp` fails every navigation with `net::ERR_CONNECTION_CLOSED`. Two
distinct fixes are needed — both already live in the wrapper / config this repo ships, so it's
automatic:

1. **Point Chromium at the proxy.** Chromium ignores the `HTTPS_PROXY` env var; it needs an
   explicit `--proxy-server`. The wrapper passes `--proxy-server "$HTTPS_PROXY"` — but only when
   `HTTPS_PROXY` is set, so locally (no proxy) it connects directly and the headless server stays
   a harmless no-op. Without this, Chromium tries a direct connection the egress policy drops.
2. **Cap TLS at 1.2** (`--ssl-version-max=tls1.2`, in
   [`playwright-mcp-config.json`](playwright-mcp-config.json) via `--config`). Once the proxy
   CONNECT succeeds, Chrome's own TLS handshake to the site dies mid-flight (`SSL_HANDSHAKE_ERROR`,
   `net_error=-100`): its TLS 1.3 ClientHello carries the **post-quantum key share**
   (`X25519MLKEM768`), which is large/fragmented and the proxy's TLS frontend resets on it.
   `curl --tlsv1.3` over the *same* proxy works, so it's Chrome-specific. The PQ key share **can't**
   be disabled via `--disable-features` in the Playwright Chromium build (baked-in field-trial
   config), so capping the TLS version is the reliable lever. 1.2 is fine for crawling public pages.

> Diagnosing this yourself: launching Chrome with `--log-net-log=…` reveals the
> `HTTP/1.1 200 Connection Established` (proxy OK) followed by the `SSL_HANDSHAKE_ERROR` (TLS step
> failing) — that split is what tells the two fixes apart.

## Planned public scraper (Amazon / Discogs / vinyl)

Try **HTTP first** (endover surprised us — fully server-rendered). **Discogs has an official
API** — prefer it (token tier). **Amazon** is JS + aggressive bot detection on datacenter IPs —
even with the browser working in cloud, expect blocks/CAPTCHAs; may be local-only.
