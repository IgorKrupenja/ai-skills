---
name: screenshot
description: Take a screenshot of a web page given a URL and deliver it to the user. ALWAYS capture only the visible viewport area, never the full scrollable page. Use whenever the user asks for a screenshot, screen grab, or image of a web page.
allowed-tools: Bash, SendUserFile
---

# Screenshot Skill

Take a screenshot of a web page with `playwright-cli` (its commands are in the `playwright-cli`
skill) and send it to the user.

## The one rule

**Capture only the visible viewport, never the full page.** Never pass `--full-page`. Full-page
screenshots of long pages produce multi-megabyte files that fail to download in the chat UI; the
visible area stays small (~hundreds of KB) and delivers reliably.

## Steps

### 1. Open the page

Use the shared `personal` browser, so logins carry over. Run `playwright-cli list` first. If
`personal` is already open, another chat may be using it, so open the page in a tab of your own:

```bash
playwright-cli -s=personal tab-new "<url>"
```

Otherwise start it, adding the launch flags your global instructions give, if any:

```bash
playwright-cli -s=personal open "<url>" --persistent
```

### 2. Screenshot the visible area only

```bash
playwright-cli -s=personal screenshot --filename=.playwright-cli/<short-descriptive-name>.png
```

If the user wants a different region in view (e.g. lower on the page), scroll first
(`playwright-cli -s=personal mousewheel 0 800`), then take the screenshot, **still without
`--full-page`**.

### 3. Deliver

Send the file to the user with `SendUserFile`, passing its absolute path. If you opened a tab in a
browser that was already running, close only that tab (`playwright-cli -s=personal tab-close`),
never the browser.

## Notes

- Keep the screenshot in `.playwright-cli/`, which git ignores, and never commit it: it's a
  one-off deliverable, not a source artifact.
- Keep the filename short and descriptive of the page content.
- If `SendUserFile` succeeds but the user reports they can't download or open it, the file is
  probably too large: check that `--full-page` wasn't used.
