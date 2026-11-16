---
name: screenshot
description: Take a screenshot of a web page given a URL and deliver it to the user. ALWAYS capture only the visible viewport area, never the full scrollable page. Use whenever the user asks for a screenshot, screen grab, or image of a web page.
allowed-tools: Bash, SendUserFile
---

# Screenshot Skill

Take a screenshot of a web page in this repo's own browser and send it to the user.

## The one rule

**Capture only the visible viewport, never the full page.** Never pass `--full-page` or
`fullPage: true`. Full-page screenshots of long pages produce multi-megabyte files that fail to
download in the chat UI; the visible area stays small (~hundreds of KB) and delivers reliably.

## Steps

### 1. Open the browser

Use this repo's own browser (playwright-cli session `ai-skills`), so logins carry over, through
`node_modules/skills-kit/browser.ts` and `node_modules/skills-kit/tab.ts` in the skills folder (the folder above this skill's
folder). Run `bun <skills dir>/node_modules/skills-kit/browser.ts list` first, and if `ai-skills` isn't open,
start it with `bun <skills dir>/node_modules/skills-kit/browser.ts open --headed`.

### 2. Screenshot the visible area in a tab of your own

Another chat may be using the browser, so open the page in a background tab of your own,
screenshot it and close the tab. Pick a tag no other chat uses, like `shot-<page>-<time>`:

```bash
bun <skills dir>/node_modules/skills-kit/tab.ts open shot-example "<url>"
bun <skills dir>/node_modules/skills-kit/tab.ts run shot-example <<'JS'
async (p, env) => {
  await p.waitForTimeout(2000);
  const path = `${env.shots}/<short-descriptive-name>.png`;
  await p.screenshot({ path });
  return path;
}
JS
bun <skills dir>/node_modules/skills-kit/tab.ts close shot-example
```

`run` prints the file's absolute path (`env.shots` is `.playwright-cli/` in the current folder).
To show a region lower on the page, add `await p.mouse.wheel(0, 800);` before the screenshot,
**still without `fullPage`**.

### 3. Deliver

Send the file to the user with `SendUserFile`, passing its absolute path. Close only your own
tab, never the browser.

## Notes

- Keep the screenshot in `.playwright-cli/`, which git ignores, and never commit it: it's a
  one-off deliverable, not a source artifact.
- Keep the filename short and descriptive of the page content.
- If `SendUserFile` succeeds but the user reports they can't download or open it, the file is
  probably too large: check that `fullPage` wasn't used.
