---
name: screenshot
description: Take a screenshot of a web page given a URL and deliver it to the user. ALWAYS capture only the visible viewport area, never the full scrollable page. Use whenever the user asks for a screenshot, screen grab, or image of a web page.
allowed-tools: mcp__playwright-headless__browser_navigate, mcp__playwright-headless__browser_take_screenshot, Bash, SendUserFile
---

# Screenshot Skill

> **Runs in:** local + cloud — drives the headless browser configured in `.mcp.json` (`playwright-headless`).

Take a screenshot of a web page and send it to the user.

## The one rule

**Capture only the visible viewport — never the full page.** Always call
`browser_take_screenshot` with `fullPage` omitted (or `false`). Full-page
screenshots of long pages produce multi-megabyte files that fail to download in
the chat UI; the visible area stays small (~hundreds of KB) and delivers
reliably.

## Steps

### 1. Navigate

Use `mcp__playwright-headless__browser_navigate` with the URL the user gave.

### 2. Screenshot the visible area only

```
mcp__playwright-headless__browser_take_screenshot
  type: png
  filename: <short-descriptive-name>.png
  # do NOT set fullPage — visible viewport only
```

If the user wants a different region in view (e.g. lower on the page), scroll
first, then screenshot — still viewport-only, never `fullPage: true`.

### 3. Deliver

Send the saved file to the user with `SendUserFile`. The file is written under
the working directory; pass its absolute path.

## Notes

- **Don't commit the screenshot to the repo.** It's a one-off deliverable, not a
  source artifact. If a stop-hook complains about the untracked `.png`, delete
  it after delivery rather than committing it. (Only commit if the user
  explicitly asks, or if the chat download is failing and they need to fetch it
  from the branch as a fallback.)
- Keep the filename short and descriptive of the page content.
- If `SendUserFile` succeeds but the user reports they can't download/open it,
  the file is probably too large — confirm you used the visible viewport and not
  `fullPage`.
