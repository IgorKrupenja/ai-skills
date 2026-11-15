---
name: lhv-investment-report
description: Automates the LHV investment account tax report (Investeerimiskonto aruanne). Logs in via Smart-ID, selects the correct account and period, filters rows by Revolut account, and sends to MTA.
allowed-tools: Bash, Read
---

Automate the LHV investment account report for tax purposes (Investeerimiskonto aruanne).

## Prerequisites

**ALWAYS load environment variables first:**

```bash
set -a && source "${SKILLS_DIR:-$HOME/.claude/skills}/.env" && set +a
```

Required env vars:

- `$LHV_USERNAME` - LHV internet bank username
- `$LHV_ISIKUKOOD` - Estonian personal ID number (isikukood)
- `$LHV_ACCOUNT_INVESTMENT` - LHV investment account IBAN
- `$LHV_ACCOUNT_EXTERNAL` - Revolut account IBAN (used to filter report rows)

## Browser

Use `playwright-cli` with the shared `personal` browser. Run `playwright-cli list` first, and if
`personal` isn't open, start it with `playwright-cli -s=personal open --headed --persistent`,
adding the launch flags your global instructions give, if any. Other chats may be using the same
browser, and plain `playwright-cli` commands act on whichever tab is current, so work only in a
background tab of your own through `scripts/tab.py` in the skills folder (the folder above this
skill's folder):

```bash
python3 <skills dir>/scripts/tab.py open lhv "https://www.lhv.ee/ibank/cf/portfolio/reports_inv"
python3 <skills dir>/scripts/tab.py run lhv <<'JS'
async (p, env) => {
  return await p.locator('body').ariaSnapshot();
}
JS
python3 <skills dir>/scripts/tab.py close lhv
```

`p` is your tab's Playwright Page, and `run` prints what the function returns. Save screenshots
with `await p.screenshot({ path: env.shots + '/lhv.png' })` and look at them with Read.

## Steps

1. Open your tab at <https://www.lhv.ee/ibank/cf/portfolio/reports_inv>.
2. If it redirected to the login page, read the page, select **Smart-ID**, fill **$LHV_USERNAME**
   into the username field and **$LHV_ISIKUKOOD** into the isikukood field, and click the login
   button. The user approves on their phone. In the same `run`, wait for the redirect back to the
   report page: `await p.waitForURL(/portfolio\/reports_inv/, { timeout: 180000 })`.
3. The report page's content is inside `iframe[title="Content"]`: read and click in it through
   `p.frameLocator('iframe[title="Content"]')`. Make sure only the
   **Investment • $LHV_ACCOUNT_INVESTMENT** account checkbox is checked; uncheck all other account
   checkboxes.
4. Set the period to the previous full year (01.01.YYYY to 31.12.YYYY) and click **Saada päring**
   to load the report.
5. Once the report table loads, check only the rows where **Konto = $LHV_ACCOUNT_EXTERNAL**, with
   this `run` (put the IBAN in `iban`). It reads each row's hidden popup for the account:

```js
async (p, env) => {
  const iban = 'LHV_ACCOUNT_EXTERNAL';
  return await p.evaluate((iban) => {
    const doc = document.querySelector('iframe[title="Content"]').contentDocument;
    let checked = 0, unchecked = 0;
    for (const row of doc.querySelectorAll('tbody tr')) {
      const checkbox = row.querySelector('input[type="checkbox"]');
      if (!checkbox) continue;
      let konto = '';
      const popup = row.querySelector('dl');
      if (popup) {
        const terms = popup.querySelectorAll('dt');
        const defs = popup.querySelectorAll('dd');
        for (let i = 0; i < terms.length; i++) {
          if (terms[i].textContent.trim() === 'Konto') {
            konto = defs[i].textContent.trim();
            break;
          }
        }
      }
      const shouldBeChecked = konto === iban;
      if (checkbox.checked !== shouldBeChecked) checkbox.click();
      if (shouldBeChecked) checked++;
      else unchecked++;
    }
    return { checked, unchecked };
  }, iban);
}
```

6. Take a screenshot, look at it, and report how many rows were checked vs unchecked.
7. Click **Saada MTA-sse** to send the report to the Estonian Tax Authority, then close your tab.

## Notes

- Authentication requires Smart-ID or Mobile-ID approval on the user's phone, which can't be
  automated.
- `$LHV_ACCOUNT_EXTERNAL` is the Revolut account. Only transfers to/from this account are relevant
  for the investment account tax report.
- If the tab gets stuck, close it with `tab.py close lhv` and open a new one.
