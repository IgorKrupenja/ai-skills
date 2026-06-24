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

# Headless Chromium for the Playwright MCP (the sandbox is headless Ubuntu, no display).
# --with-deps also installs the OS libraries Chromium needs (requires apt/root); fall
# back to a plain browser install if that step is not permitted.
echo "Installing headless Chromium for Playwright..."
npx -y playwright@latest install --with-deps chromium \
  || npx -y playwright@latest install chromium

# Nothing else to install: the skills are pure-stdlib Python and python3 is preinstalled
# on the sandbox.

echo "== cloud setup done — headless Chromium ready for the Playwright MCP =="
