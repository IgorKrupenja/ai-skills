#!/usr/bin/env bash
# Cloud bootstrap for the ai-skills repo — run as the cloud agent's setup/install step.
#
# Gated on SKILLS_CLOUD so it is a safe no-op locally: set SKILLS_CLOUD=1 ONLY in the
# cloud agent's environment. When unset (i.e. on your machine) this does nothing, so
# your local headed Playwright setup is never touched.
set -euo pipefail

if [ "${SKILLS_CLOUD:-}" != "1" ]; then
  echo "SKILLS_CLOUD != 1 -> local mode; skipping cloud setup (nothing installed)."
  exit 0
fi

echo "== ai-skills cloud setup (SKILLS_CLOUD=1) =="

# 1) Headless Chromium for the Playwright MCP (the sandbox is headless Ubuntu, no display).
#    --with-deps also installs the OS libraries Chromium needs (requires apt/root);
#    fall back to a plain browser install if that step is not permitted.
echo "Installing headless Chromium for Playwright..."
npx -y playwright@latest install --with-deps chromium \
  || npx -y playwright@latest install chromium

# 2) Bun + repo deps — best-effort. Needed by TypeScript skills (e.g. spotify); NOT by
#    volta (the first cloud test), so a failure here does not block browser-only skills.
if ! command -v bun >/dev/null 2>&1; then
  echo "Installing Bun..."
  curl -fsSL https://bun.sh/install | bash || echo "WARN: bun install failed (only TS skills need it)."
  export PATH="$HOME/.bun/bin:$PATH"
fi
command -v bun >/dev/null 2>&1 && { bun install || echo "WARN: bun install failed."; }

echo "== cloud setup done — headless Chromium ready for the Playwright MCP =="
