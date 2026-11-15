---
name: linkedin-connect
description: Automates sending LinkedIn connection requests (without a note) to recruiters and HR professionals found via a search query, page by page, until the weekly limit is hit.
allowed-tools: mcp__playwright__browser_navigate, mcp__playwright__browser_snapshot, mcp__playwright__browser_click, mcp__playwright__browser_wait_for, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_evaluate
---

# LinkedIn Connect Skill

Automatically send connection requests (without a note) to people in LinkedIn search results, page by page, until LinkedIn's weekly invitation limit is reached.

## Steps

### 1. Open LinkedIn login page

Navigate to <https://www.linkedin.com/login> and wait for the user to log in manually.

Wait until the LinkedIn feed or home page is visible before proceeding.

### 2. Navigate to the search results page

**ALWAYS load environment variables first:**

```bash
export $(grep -v '^#' "${SKILLS_DIR:-$HOME/.claude/skills}/.env" | xargs)
```

Required env vars:

- `$LINKEDIN_CONNECT_URL` - LinkedIn people search URL to use (see `.env.example` for default)

Navigate to `$LINKEDIN_CONNECT_URL`.

### 3. Process each page methodically

For each page of search results, repeat the following loop:

#### 3a. Scan the current page for Connect buttons

Take a snapshot and identify all **"Connect"** buttons on the page. **Skip any buttons that say "Pending", "Message", "Follow", or anything else** — only act on buttons labelled exactly **"Connect"**.

#### 3b. Click each Connect button

For each "Connect" button found:

1. Click the **Connect** button.
2. Wait for the confirmation modal to appear.
3. If the modal contains a **"Send without a note"** button, click it.
4. If the modal contains a **"Connect"** confirmation button (no note option), click it.
5. Wait briefly (about 1 second) before moving to the next person.

#### 3c. Detect the weekly limit

After each connection attempt, check whether LinkedIn has shown a limit warning. The warning may appear as:

- A modal or alert containing text like **"You've reached the weekly invitation limit"** or **"invitation limit"**
- A button or dialog preventing further invitations

**If the limit is detected: stop immediately. Report how many connections were sent and on which page.**

#### 3d. Move to the next page

After processing all Connect buttons on the current page, click the **Next** button (pagination) to go to the next page of results. Repeat from step 3a.

If there is no Next button (last page reached), stop and report the total.

### 4. Report summary

When done (limit hit or all pages processed), report:

- Total connections sent
- Page number where the limit was hit (if applicable)
- Any errors or skipped items

## Notes

- Do **not** click "Add a note" — always use "Send without a note".
- Do **not** interact with "Pending", "Message", "Follow", or "View profile" buttons.
- LinkedIn's weekly invitation limit is typically around 100 invitations. The limit popup/modal is the signal to stop.
- If a Connect button opens a dropdown (e.g. with "Connect" as one of the options), select "Connect" from the dropdown, then send without a note.
- Take a screenshot if something unexpected happens.
