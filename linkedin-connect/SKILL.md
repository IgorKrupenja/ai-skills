---
name: linkedin-connect
description: Automates sending LinkedIn connection requests (without a note) to recruiters and HR professionals found via a search query, page by page, until the weekly limit is hit.
allowed-tools: Bash, Read
---

# LinkedIn Connect Skill

Automatically send connection requests (without a note) to people in LinkedIn search results, page by page, until LinkedIn's weekly invitation limit is reached.

## Browser

Use `playwright-cli` with the shared `personal` browser, which keeps the LinkedIn login. Run
`playwright-cli list` first, and if `personal` isn't open, start it with
`playwright-cli -s=personal open --headed --persistent`, adding the launch flags your global
instructions give, if any. Other chats may be using the same browser, and plain `playwright-cli`
commands act on whichever tab is current, so work only in a background tab of your own through
`scripts/tab.py` in the skills folder (the folder above this skill's folder):

```bash
python3 <skills dir>/scripts/tab.py open li-connect "<url>"
python3 <skills dir>/scripts/tab.py run li-connect <<'JS'
async (p, env) => {
  return await p.locator('body').ariaSnapshot();
}
JS
python3 <skills dir>/scripts/tab.py close li-connect
```

`p` is your tab's Playwright Page, and `run` prints what the function returns. Save screenshots
with `await p.screenshot({ path: env.shots + '/li-connect.png' })` and look at them with Read.

## Steps

### 1. Open the search results

**ALWAYS load environment variables first:**

```bash
set -a && source "${SKILLS_DIR:-$HOME/.claude/skills}/.env" && set +a
```

Required env vars:

- `$LINKEDIN_CONNECT_URL` - LinkedIn people search URL to use (see `.env.example` for default)

Open your tab at `$LINKEDIN_CONNECT_URL`. If LinkedIn shows a sign-in page instead of results,
ask the user to sign in in that tab of the `personal` browser window, then load the URL again.

### 2. Process the pages

Run this script once per page, again and again, until it returns `limit: true` or `done: true`.
It clicks only controls labelled exactly **Connect** (search results render them as links,
`a[aria-label="Invite <name> to connect"]`), so Pending, Message and Follow are never touched. It
sends each invite without a note, stops at the weekly limit, and then moves to the next page:

```js
async (p, env) => {
  const limitRe = /invitation limit|weekly limit/i;
  const atLimit = async () => limitRe.test(await p.evaluate(() => document.body.innerText));
  const q = s => s.replace(/["\\]/g, '\\$&');
  await p.waitForTimeout(2500);
  const labels = await p.$$eval('main [aria-label^="Invite "][aria-label$=" to connect"]',
    els => els.filter(e => e.innerText.trim() === 'Connect').map(e => e.getAttribute('aria-label')));
  let sent = 0, limit = false;
  const skipped = [];
  for (const label of labels) {
    const name = label.slice('Invite '.length, -' to connect'.length);
    await p.locator(`main [aria-label="${q(label)}"]`).first().click();
    await p.waitForTimeout(1200);
    if (await atLimit()) { limit = true; break; }
    const send = p.locator('dialog, [role="dialog"]').getByRole('button', { name: 'Send without a note' });
    if (await send.count()) { await send.first().click(); await p.waitForTimeout(800); }
    if (await atLimit()) { limit = true; break; }
    if (await p.locator(`main [aria-label$="invitation sent to ${q(name)}"]`).count()) { sent++; continue; }
    skipped.push(name);
    const dismiss = p.locator('dialog, [role="dialog"]').getByRole('button', { name: 'Dismiss' });
    if (await dismiss.count()) await dismiss.first().click();
  }
  const page = Number(new URL(p.url()).searchParams.get('page') || 1);
  const next = p.getByRole('button', { name: 'Next', exact: true });
  const done = !(await next.count()) || !(await next.first().isEnabled());
  if (!limit && !done) {
    const u = new URL(p.url());
    u.searchParams.set('page', String(page + 1));
    await p.goto(u.toString(), { waitUntil: 'domcontentloaded' });
  }
  return { page, sent, skipped, limit, done };
}
```

A person counts as sent once their control turns into **Pending**. `skipped` lists anyone whose
invite didn't go through (for example LinkedIn asked for their email): take a screenshot when
that happens and say why in the report.

### 3. Report summary

When done (limit hit or last page processed), close your tab and report:

- Total connections sent
- Page number where the limit was hit (if applicable)
- Any errors or skipped people

## Notes

- Do **not** click "Add a note": always use "Send without a note".
- Do **not** interact with "Pending", "Message", "Follow", or "View profile" controls.
- LinkedIn's weekly invitation limit is typically around 100 invitations. The limit popup/modal
  is the signal to stop.
- Take a screenshot if something unexpected happens.
