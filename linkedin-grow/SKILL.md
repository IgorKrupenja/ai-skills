---
name: linkedin-grow
description: Sends LinkedIn connection requests (without a note) to matching people on the "People you may know" grow page, filtered by configurable job title keywords.
allowed-tools: mcp__playwright__browser_navigate, mcp__playwright__browser_snapshot, mcp__playwright__browser_click, mcp__playwright__browser_wait_for, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_evaluate, mcp__playwright__browser_run_code
---

# LinkedIn Grow Skill

> **Runs in:** local only — same as `linkedin-connect`: uses your LinkedIn session, and cloud/datacenter IPs risk an account ban.

Send connection requests (without a note) to people in LinkedIn's "People you may know based on your recent activity" modal, filtered by configurable job title keywords.

## Steps

### 1. Open LinkedIn login page

Navigate to <https://www.linkedin.com/login> and wait for the user to log in manually.

Wait until the LinkedIn feed or home page is visible before proceeding.

### 2. Load environment variables and navigate to the grow page

**ALWAYS load environment variables first:**

```bash
source "${SKILLS_DIR:-$HOME/.claude/skills}/.env"
```

Required env vars:

- `$LINKEDIN_GROW_KEYWORDS` - Comma-separated list of keywords to match against a person's job title (case-insensitive). Default: `HR,recruiter,talent,sourcing,hiring,people`
- `$LINKEDIN_GROW_LOCATION` - Location name used to find the correct section heading. Default: `Tallinn Metropolitan Area`

Navigate to <https://www.linkedin.com/mynetwork/grow/>.

### 3. Open the "People you may know" modal

Look for the section heading **"People you may know in $LINKEDIN_GROW_LOCATION"** (e.g. "People you may know in Tallinn Metropolitan Area"). It may not appear immediately — it loads further down the page.

1. If the section heading is not visible, click the **"Load more"** button at the bottom of the page and wait for new content to appear.
2. Once the heading is visible, click the **"Show all"** button next to it. This opens a **modal** containing all suggestions.

### 4. Process cards using browser_run_code

Use a single `browser_run_code` script to process all cards. The modal is a native HTML `<dialog>` element (not `role="dialog"`).

```javascript
async (page) => {
  const keywords = ['hr','recruiter','talent','sourcing','hiring','people'];
  // Override with env var if set: split $LINKEDIN_GROW_KEYWORDS by comma

  let connected = 0;
  let skipped = 0;
  let limitHit = false;

  // Get all cards currently in dialog
  const cards = await page.evaluate((kws) => {
    const dialog = document.querySelector('dialog');
    if (!dialog) return [];
    const btns = dialog.querySelectorAll('button[aria-label*="Invite"][aria-label*="to connect"]');
    return Array.from(btns).map(btn => {
      const ariaLabel = btn.getAttribute('aria-label') || '';
      // Walk up to find profile link
      let el = btn;
      let linkText = '';
      for (let i = 0; i < 8; i++) {
        el = el.parentElement;
        if (!el) break;
        const link = el.querySelector('a[href*="linkedin.com/in/"]');
        if (link) { linkText = link.textContent?.toLowerCase() || ''; break; }
      }
      const matches = kws.some(kw => linkText.includes(kw));
      return { ariaLabel, matches };
    });
  }, keywords);

  for (const card of cards) {
    if (!card.matches) { skipped++; continue; }

    const btn = page.locator(`dialog button[aria-label="${card.ariaLabel}"]`).first();
    if (await btn.count() === 0) { skipped++; continue; }

    await btn.click();
    await page.waitForTimeout(1200);

    // Check limit
    if (/invitation limit|weekly limit/i.test(await page.evaluate(() => document.body.innerText))) {
      limitHit = true;
      const d = page.locator('button[aria-label*="Dismiss"], button[aria-label*="Close"]').first();
      if (await d.count() > 0) await d.click();
      break;
    }

    // Send without note
    const swn = page.locator('button:has-text("Send without a note")').first();
    if (await swn.count() > 0) {
      await swn.click();
      await page.waitForTimeout(800);
      connected++;
    } else { skipped++; }

    if (/invitation limit|weekly limit/i.test(await page.evaluate(() => document.body.innerText))) {
      limitHit = true; break;
    }
  }

  // Scroll dialog to load more, then click "Load more" if visible
  await page.evaluate(() => {
    const dialog = document.querySelector('dialog');
    const header = dialog?.querySelector('header');
    if (header?.nextElementSibling) header.nextElementSibling.scrollTop += 800;
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const dialog = document.querySelector('dialog');
    Array.from(dialog?.querySelectorAll('button') || [])
      .find(b => b.textContent?.trim() === 'Load more')?.click();
  });

  return { connected, skipped, limitHit };
}
```

Run this script in a loop (re-fetching cards each iteration) until no new unprocessed cards appear or the limit is hit.

#### Keyword matching

Match keywords **case-insensitively** against the profile link's full text content (which includes both name and title). The link text format is typically: `NAME NAME TITLE`.

#### Detecting the weekly limit

After each connection attempt, check `document.body.innerText` for text matching `/invitation limit|weekly limit/i`. If found, stop immediately.

### 5. Report summary

When done (limit hit or all matching people processed), report:

- Total connections sent
- Total people skipped (title did not match)
- Whether the weekly limit was hit
- Any errors or unexpected behaviour

## Notes

- Do **not** click "Add a note" — always use "Send without a note".
- Do **not** interact with "Pending", "Message", "Follow", or "View profile" buttons.
- The people are shown inside a **modal dialog** opened by "Show all" — not on a separate page.
- The modal is a native HTML `<dialog>` element. Use `document.querySelector('dialog')` — **not** `[role="dialog"]`.
- Connect buttons inside the modal: `button[aria-label*="Invite"][aria-label*="to connect"]`.
- The scrollable content container is `dialog > div > header + div` (the sibling of `<header>` inside the dialog).
- If a Connect button opens a dropdown with "Connect" as one of the options, select "Connect" from the dropdown, then send without a note.
- Take a screenshot if something unexpected happens.
