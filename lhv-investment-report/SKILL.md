---
name: lhv-investment-report
description: Automates the LHV investment account tax report (Investeerimiskonto aruanne) — logs in via Smart-ID, selects the correct account and period, filters rows by Revolut account, and sends to MTA.
allowed-tools: mcp__playwright__browser_navigate, mcp__playwright__browser_snapshot, mcp__playwright__browser_click, mcp__playwright__browser_type, mcp__playwright__browser_evaluate, mcp__playwright__browser_wait_for, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_fill_form, mcp__playwright__browser_select_option
---

Automate the LHV investment account report for tax purposes (Investeerimiskonto aruanne).

## Prerequisites

**ALWAYS load environment variables first:**

```bash
export $(grep -v '^#' "${SKILLS_DIR:-$HOME/.claude/skills}/.env" | xargs)
```

Required env vars:

- `$LHV_USERNAME` - LHV internet bank username
- `$LHV_ISIKUKOOD` - Estonian personal ID number (isikukood)
- `$LHV_ACCOUNT_INVESTMENT` - LHV investment account IBAN
- `$LHV_ACCOUNT_EXTERNAL` - Revolut account IBAN (used to filter report rows)

## Steps

1. Open the browser and navigate to <https://www.lhv.ee/ibank/cf/portfolio/reports_inv>
2. If redirected to login, select **Smart-ID**, type **$LHV_USERNAME** into the username field and **$LHV_ISIKUKOOD** into the isikukood field, then click the login button to initiate authentication. Wait for the user to approve on their mobile device. The browser will automatically redirect to the report page once approved — wait for that redirect before continuing.
3. Make sure only the **Investment • $LHV_ACCOUNT_INVESTMENT** account checkbox is checked; uncheck all other account checkboxes.
4. Set the period to the previous full year (01.01.YYYY – 31.12.YYYY) and click **Saada päring** to load the report.
5. Once the report table loads, use JavaScript to read the hidden popup data for each row and check/uncheck checkboxes so that **only rows where Konto = $LHV_ACCOUNT_EXTERNAL** are checked. Use this script (replace REVOLUT_IBAN with the actual value from env):

```js
async () => {
  const iframe = document.querySelector('iframe[title="Content"]');
  const doc = iframe.contentDocument;
  const rows = doc.querySelectorAll('tbody tr');
  let checked = 0, unchecked = 0;
  for (const row of rows) {
    const checkbox = row.querySelector('input[type="checkbox"]');
    if (!checkbox) continue;
    const popup = row.querySelector('dl');
    let konto = '';
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
    const shouldBeChecked = konto === 'REVOLUT_IBAN';
    if (checkbox.checked !== shouldBeChecked) checkbox.click();
    if (shouldBeChecked) checked++;
    else unchecked++;
  }
  return { checked, unchecked };
}
```

1. Take a screenshot and report back how many rows were checked vs unchecked.
2. Click **Saada MTA-sse** to send the report to the Estonian Tax Authority.

## Notes

- Authentication requires Smart-ID or Mobile-ID — this cannot be automated, user must log in manually.
- `$LHV_ACCOUNT_EXTERNAL` is the Revolut account. Only transfers to/from this account are relevant for the investment account tax report.
- The report is inside an iframe (`iframe[title="Content"]`), so all DOM queries must go through `iframe.contentDocument`.
- If the browser session is stuck, kill the Playwright Chrome process: `pkill -f "mcp-chrome"`
