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

Use the shared `personal` browser, so logins carry over. Run `playwright-cli list` first.

If `personal` isn't running, start it, adding the launch flags your global instructions give, if
any, and go on to step 2:

```bash
playwright-cli -s=personal open "<url>" --persistent
```

If it is already running, another chat may be using it. Open the page in a background tab of
your own, screenshot it and close it in one `run-code` call, then go to step 3. Never use
`tab-new` or `tab-select`: they pull the browser window in front of the user's other apps.

```bash
playwright-cli -s=personal run-code "async page => {
  const ctx = page.context(), tag = 'claude-' + Date.now();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Target.createTarget', { url: 'about:blank#' + tag, background: true });
  await cdp.detach();
  let mine;
  for (let i = 0; i < 50 && !mine; i++) {
    mine = ctx.pages().find(p => p.url().endsWith(tag));
    if (!mine) await new Promise(r => setTimeout(r, 100));
  }
  await mine.goto('<url>');
  await mine.waitForTimeout(2000);
  await mine.screenshot({ path: '$PWD/.playwright-cli/<short-descriptive-name>.png' });
  await mine.close();
}"
```

Keep `$PWD` in the path: a relative path in `run-code` lands in the browser daemon's folder, not
yours. To show a region lower on the page, add `await mine.mouse.wheel(0, 800);` before the
screenshot.

### 2. Screenshot the visible area only

In the browser you just started:

```bash
playwright-cli -s=personal screenshot --filename=.playwright-cli/<short-descriptive-name>.png
```

If the user wants a different region in view (e.g. lower on the page), scroll first
(`playwright-cli -s=personal mousewheel 0 800`), then take the screenshot, **still without
`--full-page`**.

### 3. Deliver

Send the file to the user with `SendUserFile`, passing its absolute path. Never close a browser
that was already running.

## Notes

- Keep the screenshot in `.playwright-cli/`, which git ignores, and never commit it: it's a
  one-off deliverable, not a source artifact.
- Keep the filename short and descriptive of the page content.
- If `SendUserFile` succeeds but the user reports they can't download or open it, the file is
  probably too large: check that `--full-page` wasn't used.
