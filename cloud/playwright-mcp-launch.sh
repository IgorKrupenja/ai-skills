#!/usr/bin/env bash
# Launch the headless Playwright MCP server, wired up for Claude Code's agent proxy.
#
# Two things are needed for a headless Chromium to reach the internet from a cloud
# session (and any proxied environment); see cloud/README.md "Playwright through the
# agent proxy" for the full story:
#
#   1. --proxy-server $HTTPS_PROXY — Chromium does NOT read the HTTPS_PROXY env var on
#      its own. Without this it tries a direct connection, which the egress policy blocks
#      (ERR_CONNECTION_CLOSED). We add the flag ONLY when HTTPS_PROXY is set, so the same
#      config also works locally (no proxy -> direct connection, headless stays dormant).
#
#   2. --ssl-version-max=tls1.2 (via the --config file) — works around the proxy resetting
#      Chrome's large TLS 1.3 / post-quantum ClientHello.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

proxy_args=()
if [[ -n "${HTTPS_PROXY:-}" ]]; then
  proxy_args=(--proxy-server "$HTTPS_PROXY")
fi

exec npx -y @playwright/mcp@latest \
  --headless --isolated --browser chromium \
  "${proxy_args[@]}" \
  --config "$here/playwright-mcp-config.json"
