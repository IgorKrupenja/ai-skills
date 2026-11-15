---
name: linkedin-grow
description: Sends LinkedIn connection requests (without a note) to matching people on the "People you may know" grow page, filtered by configurable job title keywords.
allowed-tools: Bash, Read
---

# LinkedIn Grow Skill

Send connection requests (without a note) to people in LinkedIn's "People you may know" modal on the grow page, filtered by configurable job title keywords.

## Browser

Use this repo's own browser (playwright-cli session `ai-skills`), which keeps the LinkedIn login,
through `scripts/browser.ts` and `scripts/tab.ts` in the skills folder (the folder above this
skill's folder). Run
`bun <skills dir>/scripts/browser.ts list` first, and if `ai-skills` isn't open, start it with
`bun <skills dir>/scripts/browser.ts open --headed`. Other chats may be using the same browser,
and plain playwright-cli commands act on whichever tab is current, so work only in a background
tab of your own:

```bash
bun <skills dir>/scripts/tab.ts open li-grow "https://www.linkedin.com/mynetwork/grow/"
bun <skills dir>/scripts/tab.ts run li-grow <<'JS'
async (p, env) => {
  return await p.locator('body').ariaSnapshot();
}
JS
bun <skills dir>/scripts/tab.ts close li-grow
```

`p` is your tab's Playwright Page, and `run` prints what the function returns. Save screenshots
with `await p.screenshot({ path: env.shots + '/li-grow.png' })` and look at them with Read.

## Steps

### 1. Load environment variables

**ALWAYS load environment variables first:**

```bash
source "${SKILLS_DIR:-$HOME/.claude/skills}/.env"
```

Required env vars:

- `$LINKEDIN_GROW_KEYWORDS` - Comma-separated list of keywords to match against a person's job title (case-insensitive). Default: `HR,recruiter,talent,sourcing,hiring,people`
- `$LINKEDIN_GROW_LOCATION` - Location name used to find the correct section heading. Default: `Tallinn Metropolitan Area`

### 2. Open the grow page

Open your tab at <https://www.linkedin.com/mynetwork/grow/>. If LinkedIn shows a sign-in page,
ask the user to sign in in that tab of the `ai-skills` browser window, then load the URL again.

### 3. Open the "People you may know" modal

Look for the section **"People you may know in $LINKEDIN_GROW_LOCATION"**. It loads further down
the page, sometimes only after **Load more**. If it doesn't show up, use **"People you may know
based on your recent activity"** instead (in November 2026 only that one appeared). Each section
has a **Show all** link that opens a modal with all its suggestions. The page scrolls inside
`<main>`, not the window, so `p.mouse.wheel` doesn't move it. This `run` does all of that (put
`$LINKEDIN_GROW_LOCATION` in `location`):

```js
async (p, env) => {
  const location = 'Tallinn Metropolitan Area';
  const sections = [`People you may know in ${location}`, 'People you may know based on your recent activity'];
  const showAll = h => p.locator(`[aria-label="Show all suggestions for ${h}"]`);
  for (let i = 0; i < 6 && !(await showAll(sections[0]).count()); i++) {
    await p.evaluate(() => { const m = document.querySelector('main'); m ? m.scrollTop += 3000 : window.scrollBy(0, 3000); });
    await p.waitForTimeout(1500);
    const more = p.getByRole('button', { name: 'Load more', exact: true });
    if (await more.count()) { await more.first().click(); await p.waitForTimeout(2500); }
  }
  for (const h of sections) {
    if (await showAll(h).count()) {
      await showAll(h).first().click();
      await p.waitForTimeout(3000);
      return `opened: ${h}`;
    }
  }
  return 'no People you may know section found';
}
```

### 4. Process the cards

Process all cards with this `run`. The modal is a native HTML `<dialog>` element (not
`role="dialog"`).

```javascript
async (p, env) => {
  const keywords = ['hr','recruiter','talent','sourcing','hiring','people'];
  // Override with env var if set: split $LINKEDIN_GROW_KEYWORDS by comma

  let connected = 0;
  let skipped = 0;
  let limitHit = false;

  // Get all cards currently in dialog
  const cards = await p.evaluate((kws) => {
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
      // Word-boundary match, NOT a naive substring: short keywords like "hr"
      // otherwise match inside common words ("hr" in "tHRough") and names
      // ("hr" in "SuBHRajyoti"), sending many off-target invites.
      const matches = kws.some(kw => {
        const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp('\\b' + esc, 'i').test(linkText);
      });
      return { ariaLabel, matches };
    });
  }, keywords);

  for (const card of cards) {
    if (!card.matches) { skipped++; continue; }

    const btn = p.locator(`dialog button[aria-label="${card.ariaLabel}"]`).first();
    if (await btn.count() === 0) { skipped++; continue; }

    await btn.click();
    await p.waitForTimeout(1200);

    // Check limit
    if (/invitation limit|weekly limit/i.test(await p.evaluate(() => document.body.innerText))) {
      limitHit = true;
      const d = p.locator('button[aria-label*="Dismiss"], button[aria-label*="Close"]').first();
      if (await d.count() > 0) await d.click();
      break;
    }

    // Send without note
    const swn = p.locator('button:has-text("Send without a note")').first();
    if (await swn.count() > 0) {
      await swn.click();
      await p.waitForTimeout(800);
      connected++;
    } else { skipped++; }

    if (/invitation limit|weekly limit/i.test(await p.evaluate(() => document.body.innerText))) {
      limitHit = true; break;
    }
  }

  // Scroll dialog to load more, then click "Load more" if visible
  await p.evaluate(() => {
    const dialog = document.querySelector('dialog');
    const header = dialog?.querySelector('header');
    if (header?.nextElementSibling) header.nextElementSibling.scrollTop += 800;
  });
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
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

Match on a **leading word boundary** (`\b` + keyword), **never** a naive substring (`includes`). Short keywords like `hr` otherwise match inside ordinary words and names: `hr` is a substring of "t**hr**ough" (extremely common in headlines: "…driving success **through** data…") and of names like "Su**bhr**ajyoti Patra", which sends large numbers of off-target invites. A leading word boundary still catches "**HR** Specialist", "**HR**BP", "**Talent** Acquisition", "**People** Operations", plurals, etc.

#### Detecting the weekly limit

After each connection attempt, check `document.body.innerText` for text matching `/invitation limit|weekly limit/i`. If found, stop immediately.

### 5. Report summary

When done (limit hit or all matching people processed), close your tab and report:

- Total connections sent
- Total people skipped (title did not match)
- Whether the weekly limit was hit
- Any errors or unexpected behaviour

## Notes

- Do **not** click "Add a note": always use "Send without a note".
- Do **not** interact with "Pending", "Message", "Follow", or "View profile" buttons.
- The people are shown inside a **modal dialog** opened by "Show all", not on a separate page.
- The modal is a native HTML `<dialog>` element. Use `document.querySelector('dialog')`, **not** `[role="dialog"]`.
- Connect buttons inside the modal: `button[aria-label*="Invite"][aria-label*="to connect"]`.
- The scrollable content container is `dialog > div > header + div` (the sibling of `<header>` inside the dialog).
- If a Connect button opens a dropdown with "Connect" as one of the options, select "Connect" from the dropdown, then send without a note.
- Take a screenshot if something unexpected happens.
