---
name: social-calendar
description: Personal social calendar with events for the soul (culture, leisure, run clubs; NOT work). Crawls the sources the user bookmarks, lists candidates in chat, adds their picks to a private Google Calendar and remembers what to skip, single events and whole banned series alike. Use when the user asks to show or review their events (they may still say "new life" events, the skill's old name); when they paste ANY event link (Facebook, Instagram, tiks.me, Fienta, …) and ask to add it to their personal / private / "личный" calendar, including a bare "добавь в личный календарь <ссылка>"; or when they want to ban an event series.
---

# Social Calendar: Personal Events Skill

A dead-simple, personal counterpart to the tallinn.dev event skills, but for **culture & leisure** ("для души"), not IT/work. No Coda, no labels, no publishing. Just:

**crawl bookmarked sources → list in chat → add the picks to a private calendar → remember the rejects.**

Plus a standalone entry point that needs no crawl: **the user pastes an event link → it lands on the calendar, fully filled in.** Same calendar, same formatting rules, same `state.json` bookkeeping: that's exactly why it lives in this skill and not a separate one.

Picks and rejects stay private: two personal Google Calendars (picks, plus a separate one for what the user has paid or registered for) and a git-ignored `state.json`. The sources live in [`sources.yaml`](sources.yaml), synced from the bookmarks (step A2).

## Prerequisites

Always load env first (some values contain spaces, so use `set -a`, not `export $(...)`):

```bash
set -a && source "${SKILLS_DIR:-$HOME/.claude/skills}/.env" && set +a
```

| Variable                           | Meaning                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `BOOKMARKS_FILE`                   | Path to the Chromium/Vivaldi bookmarks JSON                        |
| `SOCIAL_CALENDAR_BOOKMARKS_FOLDER` | Folder path inside bookmarks, `/`-separated (e.g. `Social/Events`) |
| `SOCIAL_CALENDAR_ID`               | Target Google Calendar ID (a private calendar)                     |
| `SOCIAL_CALENDAR_EVENT_COLOR`      | Event `colorId` 1-11 (so events stand out). `6` = Tangerine        |
| `SOCIAL_CALENDAR_TIMEZONE`         | IANA timezone, e.g. `Europe/Tallinn`                               |
| `SOCIAL_CALENDAR_PAID_ID`          | Second private calendar, for events the user paid or registered for |
| `GOOGLE_PLACES_API_KEY`            | Google Places key for skills-kit's `places.ts` (venue → address)  |

State file: **`social-calendar/state.json`** (git-ignored). If missing, create it from `state.example.json`.
`kokandus.ts` keeps its own snapshot in `social-calendar/kokandus.json` (git-ignored); when it's missing, the next run saves a baseline.

**Browser:** this repo's own `playwright-cli` browser (session `ai-skills`), which keeps the user's logins. Plain playwright-cli commands go through [skills-kit](https://github.com/IgorKrupenja/skills-kit)'s `browser.ts`: `bun "${SKILLS_DIR:-$HOME/.claude/skills}/node_modules/skills-kit/src/browser.ts" list` first, and `… browser.ts open --headed` if `ai-skills` isn't open. Other chats may use it at the same time, so work in a background tab of your own through its `tab.ts`: `bun "${SKILLS_DIR:-$HOME/.claude/skills}/node_modules/skills-kit/src/tab.ts" open|run|close …` (usage in its header).

**Google Calendar:** through skills-kit's `gws.ts`, this repo's `gws` (Google Workspace CLI): `bun "${SKILLS_DIR:-$HOME/.claude/skills}/node_modules/skills-kit/src/gws.ts" calendar <resource> <method> --params '<json>' --json '<body>'`. Build the JSON with `jq -n`: it reads the env values as `$ENV.SOCIAL_CALENDAR_ID` and the like, and quotes everything right.

The calendar was created once and colored in the sidebar, so you don't need to recreate it. Should it ever be needed again:
```bash
bun "${SKILLS_DIR:-$HOME/.claude/skills}/node_modules/skills-kit/src/gws.ts" calendar calendars insert --json '{"summary": "<name>", "timeZone": "Europe/Tallinn"}'
bun "${SKILLS_DIR:-$HOME/.claude/skills}/node_modules/skills-kit/src/gws.ts" calendar calendarList patch \
  --params "$(jq -n '{calendarId: $ENV.SOCIAL_CALENDAR_ID}')" --json '{"colorId": "6"}'
```

**Paid events get their own calendar**, `New Life · PAID` (created 2026-10-13 the same way).
Among dozens of options in the picks calendar, a bought ticket drowned (the user's words). The
user sets its color in the sidebar; events in it carry **no color of their own**, so they show in
the calendar's color (an explicit event color there gives an odd two-tone block, the user's call
on 2026-10-13). A [PAID] event never stays in `$SOCIAL_CALENDAR_ID`: see step 6.

## Already bought? Check before every answer

Before you show, list, recommend or add **any** event, check whether the user has already bought
it. This holds for every request, not only crawls: a quick "покажи кулинарные курсы", "что бы ты
выбрал?", a pasted link. The PAID calendar is the record of what was bought (`state.json`
`added` holds picks and purchases alike). The user's call on 2026-10-15, after a cooking course
they had bought on 03.10 was listed as open and recommended, and they paid for it a second time.

```bash
bun "${SKILLS_DIR:-$HOME/.claude/skills}/social-calendar/bought.ts"
```

It prints every upcoming event in the PAID calendar (date, time, title, URL) and reads the
calendar id from `.env` itself, so it works without the env step. `filter.ts` and `kokandus.ts`
run the same check on their own: the filter hides bought candidates (same URL, or the same date
with one title inside the other), and `kokandus.ts` moves bought courses into its ALREADY BOUGHT
block, out of every other block. Anything put together without them (an ad-hoc list, a single
recommendation, a link the user pasted) you check against the `bought.ts` output yourself.

- A bought event is never offered as something to buy or sign up for. In an ad-hoc list it
  stays, marked `уже куплено`; a recommendation skips it and says it's already bought.
- When the calendar can't be read (gws sign-in, network), all three scripts print a `WARNING`.
  That means unknown, never "nothing bought": tell the user, and present nothing as available
  until the PAID calendar has been checked.

---

## The three things the user will ask

### A) "Show / review events" → crawl

1. **Get today's date first** (avoid year mistakes):
   ```bash
   date +"%Y-%m-%d %A %Z"
   ```

2. **Sync the sources, then read them.** Bookmarks are the user's inbox: they add and delete sources
   there while browsing. [`sources.yaml`](sources.yaml) is the copy next to this file, with a
   `notes` field per source. Sync it at the start of **every** crawl:
   ```bash
   bun "${SKILLS_DIR:-$HOME/.claude/skills}/social-calendar/sync_sources.ts"
   ```
   It walks the bookmarks folder recursively (a subfolder becomes the `category`, e.g. `Running`),
   adds new bookmarks, **removes every source whose bookmark the user deleted**, keeps `notes`, and
   carries the notes over when only a URL changed. It prints the diff, then the synced list as
   TSV. Report the diff in one line (e.g. `Источники: добавлен 1 (X), удалён 1 (Y)`).

   Read a source's `notes` before crawling it: they hold what earlier crawls learned (meeting
   points, API shortcuts, traps). When a crawl teaches you something durable about a source,
   update its `notes` in the same run, keeping each value one double-quoted line.

   Subfolders matter: an earlier version read only the top level and silently skipped the whole
   `Running/` folder (fixed 2026-09-26).

3. **Crawl every source.** Open each URL in the browser, dismiss cookie/login popups, read the snapshot, and extract event candidates based on what's actually on the page (don't hardcode per-site logic).
   - **Never skip a source** because it's noisy or you "already have enough". Every bookmark is there on purpose. If a page needs login, ask the user to log in.
   - **Every candidate MUST have a URL.** If you can see a title/date but no link, click into it / read the `href` before moving on.
   - **Window: today through today + 14 days**, for every source (a Saturday 26.09 crawl covers
     events through Saturday 10.10). Leave out anything later: the user wants exactly two weeks
     ahead (2026-09-26). The only exception is the cooking listing below, which has no window.
   - **Facebook pages and groups** show empty `blockquote: Facebook` placeholders in snapshots, but
     the DOM's `innerText` (read with `p.evaluate`) has the posts. Groups: iterate
     `[role=feed] > div` and open them with `?sorting_setting=CHRONOLOGICAL`, since "Most relevant"
     surfaces year-old posts. Pages: climb from `[data-ad-preview=message]` to the ancestor that
     contains "Write a comment". Page events are at `/<page>/upcoming_hosted_events`, group events
     at `/groups/<id>/events`. Scope `a[href*="/events/"]` to `[role=main]`, because the
     notifications panel injects other people's event links into every page. Feeds load out of
     order and `innerText` timestamps are obfuscated, so confirm a post's age from a screenshot.
   - **Sources in the `Running` category are run clubs**, not event pages: there's a weekly schedule to find, not a listing to read. Read [`run-clubs.md`](run-clubs.md) and follow it.
   - **The Tallinna Rahvaülikool cooking listing** (`kultuur.ee/valdkond/kokandus`) is watched, not windowed: its courses sell out within days of appearing. Instead of reading the page, run [`kokandus.ts`](kokandus.ts) (`bun "${SKILLS_DIR:-$HOME/.claude/skills}/social-calendar/kokandus.ts"`). It compares every upcoming course with the previous run and prints what is NEW, where spots OPENED again, every upcoming ITALIAN course (the user's priority) and all courses that still have spots. Courses the user already bought come first, in an ALREADY BOUGHT block, and never in the other blocks: mention them as bought, never offer them. Report the NEW, OPENED and ITALIAN blocks in their own section after the list, whatever their dates; courses with spots inside the crawl window also go into the list as usual (category Кулинарные курсы).
   - Collect across ALL sources before showing anything:
     ```
     candidate = { title, date, url, source_url, location? }
     ```
   - `source_url` = the bookmark the candidate came from (needed for series bans).

4. **Filter** with [`filter.ts`](filter.ts) (see [Filtering](#filtering-what-not-to-show)).
   It drops everything already bought (the PAID calendar), added or declined and everything in
   a banned series.

5. **Present ALL survivors grouped by category**, never as one long table. The user's call
   (2026-10-13): a 184-row table was "кошмар", and a merged "театр, танец, стендап" bucket was
   "очень плохо", so keep the categories narrow. Number every candidate once, in date order,
   before grouping: the numbers then stay valid in any later view ("добавь 12, 40", "покажи ещё
   раз еду"). Then one `###` header per category with its count, in this order, skipping empty
   ones:

   | Header | What goes there |
   | ------ | --------------- |
   | Пробежки | run clubs (`Running` sources and the sörk DB) |
   | Квизы и игры | quizzes, music bingo and lotto, game nights |
   | Концерты и живая музыка | concerts, jams, live sets |
   | Вечеринки, DJ, танцы | club nights, DJ sets, karaoke, social dance nights |
   | Кино | screenings and film clubs |
   | Театр | drama, opera, musicals |
   | Современный танец | dance performances (the STF festival and the like) |
   | Стендап и комедия | stand-up, roasts, improv comedy |
   | Цирк и шоу | circus, revues, variety shows |
   | Открытая сцена | open mic, open stage |
   | Выставки, экскурсии, лекции, книги | exhibitions, tours, talks, book launches, language and book clubs |
   | Еда | dinners, chef evenings, food festivals |
   | Вино | wine tastings and wine evenings |
   | Пиво | beer releases, tap takeovers, beer tastings |
   | Кулинарные курсы | cooking classes (the kokandus listing and the like) |
   | Походы | hikes and nature trips |
   | Рынки и прочее | markets, fairs, anything else |

   One line per event, with the link hidden in the title (escape `[`, `]` and `|` inside it).
   A recurring series (one run club, one quiz series, one exhibition tour) gets a single line,
   each occurrence numbered and linked on its own:
   ```
   - `15` ср 14.10 19:00 · [Шейкер Квиз: #ОбоВсём #9](https://tallinn.shakerquiz.ru/#2026-10-14) · Kitchen Rõõm
   - Kopli Sörk, старт Kopli 25a: `2` [ср 14.10 07:10](…/koplisork/#2026-10-14-0710) · `10` [ср 14.10 18:30](…/koplisork/#2026-10-14-1830)
   ```

   **NEVER bold, star or highlight individual lines.** Every candidate gets identical plain
   formatting: no `**`, no ⭐/🔥, no "(recommended)", no reordering to float favourites to the
   top. The user found this confusing: emphasis with no stated criterion looks like it means
   something official when it is really just the model's own hunch. Caveats (sold out, last
   spots, an uncertain schedule) go in short notes under the list, by number, not as
   formatting inside it.

   Then **report what was filtered** (never drop silently):
   > Скрыл 5: 1 уже куплен, 2 уже добавлены, 1 ранее отклонён, 1 из забаненной серии «Open Mic».

   Criteria for now: **show everything** (no taste filtering yet). This will be refined over time.

### B) Put an event on the calendar

**Two entry points, one pipeline:**

- **B1 (from the crawl list):** "добавь 1, 3, 5" → you already have the candidate's URL from step A.
- **B2 (from a bare link):** "добавь в личный календарь `<URL>`" (any event link: Facebook, Instagram, tiks.me, Fienta, …). No crawl needed, no `state.json` filtering: the user already decided. Go straight to step 1.

Both paths run the **same 8 steps** below. Never shortcut B2 just because it's a one-off.

#### The six mandatory fields

An event is **not** ready to create until all six are filled. None of them may be silently left blank:

| Field | Rule if you can't find it |
| ----- | ------------------------- |
| **Date + time** | Never guess the year (see step 0). If only a start time is given, assume **2 hours** and say so in your report. |
| **Location** | Dig: FB events put the venue in a separate block, not in the body text. Online event → `Online`. **Distributed events** (yard-sale days, city-wide festivals, tours across a district) legitimately have no single address: use the district as given (`Nõmme, Tallinn, Estonia`) and keep any route/map link in the description rather than forcing a fake street address. |
| **Price** | Look hard (see step 3), then **default to `0€`. Never ask the user about price**; just note in your report that it wasn't stated. |
| **Language** | Language the event is actually held in. If not stated, infer from the description text. Bilingual → `EE / ENG`. |
| **Booking** | Does *attending* require booking ahead? See step 3c. Default when nothing indicates it: **no booking**. |
| **Full description** | Complete original text, never summarized or translated. |

#### Steps

**0. Get today's date first.** It avoids year errors on "15 сентября" with no year:
```bash
date +"%Y-%m-%d %A %Z"
```

**1. Normalize the URL.** Share links (`facebook.com/share/…`, `?rdid=…`, `&mibextid=…`, `/events/s/…`) are redirect wrappers. Open the link, then take the **canonical** URL from the address bar (for Facebook that's `https://www.facebook.com/events/<id>/`). Store and display the canonical one; the wrapper rots and is unreadable.

**Two link shapes that are NOT wrappers, so never strip them:**
- **FB recurring events** use `facebook.com/events/<series_id>/<occurrence_id>/`. The second id *is* the date the user picked. Dropping it lands on the series and silently changes which occurrence you add. Keep both segments. (The page shows the sibling dates as a row of chips, useful for confirming which one is live.)
- **Fienta series** live at `fienta.com/[ru/]s/<slug>` and list several dates, each its own page at `fienta.com/[ru/]<slug>-<id>`. A series link is **not** an event: open it, pick the date, and check availability: sold-out dates are marked (`Распродано` / `Sold out`), and a sold-out one is never added without asking (step 3d). If several dates are open and the user didn't say which, add the nearest available one and tell them the others exist.

**2. Extract full content with playwright-cli.** Open the page in the browser, dismiss cookie/login walls, read the snapshot.
- **Facebook: always click "See more"** before extracting, because FB truncates the body by default.
- **Facebook mangles links inside the description, twice.** The visible text is cut with `…` (`https://open.spotify.com/artist/4fJ6…`) and the `href` is a `l.facebook.com/l.php?u=<percent-encoded>&fbclid=…` redirect. Neither is usable. Pull the real URL from each `<a>` and decode it:
  ```js
  [...node.querySelectorAll('a')].map(a => {
    const u = new URL(a.href);
    const real = u.hostname.endsWith('facebook.com') && u.searchParams.get('u')
      ? new URL(decodeURIComponent(u.searchParams.get('u'))) : new URL(a.href);
    ['fbclid','__cft__[0]','__tn__','si','utm_id'].forEach(p => real.searchParams.delete(p));
    return { shown: a.innerText.trim(), real: real.href };
  })
  ```
  Substitute the decoded URLs back into the description text. This is restoring what the author wrote, not editing it.
- **Facebook draws emoji as images** (`<img alt="🎟">`), and `innerText` drops them: `🎟 Tickets` comes out as ` Tickets`. Clone the description node, replace every `img` in the clone with a text node holding its `alt`, attach the clone off-screen and read its `innerText`.
- **Content policy:** do **not** summarize, do **not** translate, keep original line breaks, emphasis and emojis (incl. math-bold like `𝐌𝐔𝐔𝐒𝐈𝐊𝐀`). This is a private calendar: the full original text is the whole point.
- Drop only FB's own UI chrome that lands in `innerText`: the trailing `See less` and the city tag link after it.
- **Quoting:** write the assembled description to a temp file and let `jq --rawfile` read it into the event (step 6). Inlining multi-line text with emoji into the shell mangles it.

**3. Find the price.** Check, in this order:
   1. the ticket/price block FB and ticketing sites render **outside** the description text;
   2. the body text: `10€`, `10 EUR`, `tasuta`, `free`, `vaba sissepääs`, `annetus` / donation, `at the door`, `eelmüük`;
   3. the ticket-vendor link (Fienta / tiks.me / Piletilevi); open it if the price isn't on the event page itself.

   Then normalize to a **numeric-first** form:
   - Paid → `15€`.
   - **Choice-based tiers** (anyone may pick: pay-what-you-want, early bird vs door) → keep the range: `1–10€`, `12€ / 15€ kohapeal`.
   - **Eligibility-based tiers** (student, child, pensioner) → use the **regular adult price only**: a tour at `18€ regular / 12€ student / 0€ kids` is `18€`, never `0–18€`. The user pays the adult price; folding in discounts they can't claim makes the number a lie.
   - **Quantity bundles** (`Двойной билет 18€`, group of 4) → also the single-ticket price: `10€`, not `10–18€`. A bundle is more tickets, not a cheaper option, and the user is usually going alone.
   - Free (`tasuta`, `vaba sissepääs`, `free entry`) → **`0€`**.
   - Donation-based → `annetus`.
   - **Nothing found after all three → `0€`.** Do NOT ask the user about price, ever: most of what they add is free-entry anyway. Just say in your report that the page didn't state it, so they can spot a wrong guess.

**3b. Determine the language.** What language the event is actually held in; this matters most for talks, screenings and discussions. If the page states it, use that; otherwise infer from the description text. Short codes: `EE`, `RU`, `ENG`. Bilingual/multilingual → `EE / ENG`. When you inferred rather than read it, say so in your report.

> ⚠️ **Do not trust Fienta's `inLanguage` field.** It reflects the *page locale* (from the `/et/`, `/ru/` URL segment), not the language the event is held in. A Russian-language stand-up club listed at `fienta.com/et/…` reports `inLanguage: "et"` while its whole description (and its audience) is Russian. Always cross-check against the description text and the organizer's own profile; the description wins.

**3c. Decide whether booking is required.** The question is strictly: **must the user do something in advance in order to attend?** If yes → the title gets a trailing `[BOOK]`. If no → nothing is added.

Signals that it IS required:
- a ticket / registration CTA on the event itself (`Get Tickets`, `Register`, `Osta pilet`), or a link to Fienta / Piletilevi / Eventbrite / Luma / a registration form;
- the body says `registreeru`, `eelregistreerimine`, `kohtade arv on piiratud`, `limited seats`, `RSVP`, `sign up`, `регистрация`, `запись обязательна`.

**Three false positives that show up constantly; none of them means `[BOOK]`:**
1. **Vendor / performer booking.** Markets and fairs routinely say `Müügikoha broneerimine` (booking a *stall*), `Kui soovid tulla kodukohvikut pidama, kirjuta…`, `apply to play`. That's for people who want to *sell or perform*, not to visit. Visitors walk in freely.
2. **Host-page ticket buttons.** In FB's "Meet your hosts" block, each host Page can carry its own `Get tickets` CTA. That belongs to the Page, not to this event. Only a ticket/registration element attached to the event itself counts.
3. **Registration for a sub-activity.** A free fair can contain one thing that needs signing up: a kids' fun run, a workshop slot, a tournament. `Registreerimine on vajalik` scoped to that sub-activity does not make the event itself booked; the user can still just walk in.

When in doubt, ask yourself who the instruction is addressed to: the audience, or the people running a table. Only the former counts. Default is **no booking**.

**3d. Check that tickets or places are still available. Sold out → stop and ask.** Read the
status on the ticket page itself, not in an announcement (those go stale): Fienta's ticket block
or its API `sale_status` (`soldOut`); `Sold out` / `Välja müüdud` / `Распродано` on Piletilevi,
Piletikeskus, ticketshop and gateme; `KOHAD TÄIS` on a kultuur.ee course; `Мест нет` or
reserve-only on a quiz site. Only the cheapest tier being gone (early bird) is not sold out.

**If a pick is sold out, stop immediately and ask the user** before creating it: name it, say
what is sold out and offer to skip it or add it anyway (resale, a waitlist). In a batch, check
every pick first and ask before creating any of them, so nothing half-runs. The user's call,
2026-10-13, after two sold-out picks had to be deleted again.

**4. Resolve the location** to a full street address:
```bash
bun "${SKILLS_DIR:-$HOME/.claude/skills}/node_modules/skills-kit/src/places.ts" "Venue Name, Tallinn"
```
Use the `address` field. Sanity-check the `name` in the result actually matches the venue: Places happily returns a plausible wrong bar. Also glance at `business_status`: `CLOSED_PERMANENTLY` on a venue hosting a future event means you resolved the wrong place.

**5. Check for duplicates** before creating, in **both** calendars (`events list` takes one
calendar id at a time):
```bash
for cal in "$SOCIAL_CALENDAR_ID" "$SOCIAL_CALENDAR_PAID_ID"; do
  bun "${SKILLS_DIR:-$HOME/.claude/skills}/node_modules/skills-kit/src/gws.ts" calendar events list --page-all --params "$(jq -n --arg cal "$cal" \
    '{calendarId: $cal, timeMin: "2026-09-01T00:00:00+03:00", timeMax: "2026-09-02T00:00:00+03:00", singleEvents: true, orderBy: "startTime"}')" \
    | jq -c '.items[] | {id, summary, start: (.start.dateTime // .start.date), url: .source.url}'
done
```
Compare start time (few-minutes tolerance) + title. Also check the URL against `state.json` `added`. If it's a duplicate → report it and **stop**, don't create a second copy.

`timeMin` and `timeMax` need an offset: Tallinn is `+03:00` in summer time and `+02:00` in winter. `singleEvents: true` lists each occurrence of a recurring event on its own.

> ⚠️ **`events list` returns one page at a time** (up to 250 events) plus a `nextPageToken`, so the missing events are invisible unless you look for it. A busy range silently truncates, so a duplicate check can report "nothing there" while the duplicate sits on page 2. Always pass **`--page-all`**: it fetches every page and prints one JSON object per page (hence `.items[]`). Treat any listing without it as unreliable.

**6. Create the event.**

**Title format:** `Event Title · <price>` plus a trailing ` [BOOK]` only when booking is required.

```
PLURRR · 0€                      ← free, just show up
Kontsert · 10–15€                ← paid, no booking
Keelekohvik · 0€ [BOOK]          ← free but you must register
Workshop · 25€ [BOOK]            ← paid and booked
```

Always a middot `·`, never an em dash; always a numeric price, never the word `tasuta`. `[BOOK]` is uppercase, in square brackets, always last, and **absent entirely** when booking isn't needed (no `[NO BOOK]`, no empty brackets).

Once the user says they bought the ticket or registered, the event becomes `[PAID]` and moves to
the PAID calendar. Move it, then swap `[BOOK]` for `[PAID]` and clear its color there; the event
id survives the move, and you get it from the `events list` output (`id`). Never create a second event:
```bash
bun "${SKILLS_DIR:-$HOME/.claude/skills}/node_modules/skills-kit/src/gws.ts" calendar events move --params "$(jq -n --arg id "<eventId>" \
  '{calendarId: $ENV.SOCIAL_CALENDAR_ID, eventId: $id, destination: $ENV.SOCIAL_CALENDAR_PAID_ID}')"
E="${TMPDIR:-/tmp}/event.json"
bun "${SKILLS_DIR:-$HOME/.claude/skills}/node_modules/skills-kit/src/gws.ts" calendar events get --params "$(jq -n --arg id "<eventId>" \
  '{calendarId: $ENV.SOCIAL_CALENDAR_PAID_ID, eventId: $id}')" | jq '.summary = "… · 60€ [PAID]" | del(.colorId)' > "$E"
bun "${SKILLS_DIR:-$HOME/.claude/skills}/node_modules/skills-kit/src/gws.ts" calendar events update --params "$(jq -n --arg id "<eventId>" \
  '{calendarId: $ENV.SOCIAL_CALENDAR_PAID_ID, eventId: $id}')" --json "$(cat "$E")"
```
Clearing the color matters: every pick carries an explicit Tangerine `colorId`, which would
override the PAID calendar's own color. A `patch` can't clear a field (gws rejects
`"colorId": null`), so `update` writes the whole event back without it. When the user hands over
a link to something already bought ("купил билет, добавь"), create the event straight in
`$SOCIAL_CALENDAR_PAID_ID` with `[PAID]` and without `colorId`.

**Description format:** three header lines, then a blank line, then the full original text:

```
<LANGUAGE>      ← line 1: EE / RU / ENG / EE / ENG
<PRICE>         ← line 2: 0€ / 15€ / annetus
<CANONICAL_URL> ← line 3
                ← blank
<FULL ORIGINAL DESCRIPTION>
```

Write that description to a temp file (step 2), build the event with `jq`, then insert it:
```bash
D="${TMPDIR:-/tmp}/description.txt"
E="${TMPDIR:-/tmp}/event.json"
jq -n --rawfile description "$D" \
  --arg summary "Event Title · 15€" \
  --arg start "YYYY-MM-DDTHH:MM:SS" --arg end "YYYY-MM-DDTHH:MM:SS" \
  --arg location "Telliskivi tn 62, 10412 Tallinn, Estonia" \
  --arg url "<CANONICAL_EVENT_URL>" '{
    summary: $summary,
    start: {dateTime: $start, timeZone: $ENV.SOCIAL_CALENDAR_TIMEZONE},
    end: {dateTime: $end, timeZone: $ENV.SOCIAL_CALENDAR_TIMEZONE},
    location: $location,
    colorId: $ENV.SOCIAL_CALENDAR_EVENT_COLOR,
    source: {url: $url},
    description: ($description | rtrimstr("\n"))
  }' > "$E"
bun "${SKILLS_DIR:-$HOME/.claude/skills}/node_modules/skills-kit/src/gws.ts" calendar events insert \
  --params "$(jq -n '{calendarId: $ENV.SOCIAL_CALENDAR_ID}')" --json "$(cat "$E")"
```
- Times: local `YYYY-MM-DDTHH:MM:SS` + `timeZone` (Google applies DST correctly). For all-day: `start: {date: "YYYY-MM-DD"}, end: {date: "YYYY-MM-DD"}` (end = next day) and no `timeZone`.
- `location` takes the **resolved address** from step 4.
- Add `--dry-run` to inspect the exact request (method, URL, body) before writing anything; nothing is sent. gws also checks the body against the API schema and exits with code 3 and an `error` object when it doesn't fit.
- gws prints the created event itself: read `.htmlLink` and `.id` at the top level. Its stdout is plain JSON (the `Using keyring backend` line goes to stderr), so it pipes straight into `jq`.

**7. Record it** in `state.json` `added`, for B2 links too, otherwise the crawler will re-suggest the event next week. (Schema below.)

**8. Report back**: title, date/time, resolved address, price, and the event's `htmlLink`. Flag any assumption you made (guessed 2h duration, ambiguous venue match, price taken from the ticket vendor rather than the event page).

**Never mention time overlaps**, not here and not in crawl notes: neither with events already in
the user's calendar nor between their picks. They add overlapping options on purpose and decide
on the day, so pointing it out is patronising (their call, 2026-09-26: "I'm not five"). This is
separate from step 5: a *duplicate* (the same event twice) is still caught and reported.

#### The user's own entries (no event link): write them in English

When the user asks for something that isn't an event from a link or the crawl, write the title
and description **in English**, whatever language they asked in. That covers a reminder to buy
tickets or a plan of their own. The six mandatory fields, the `· <price>` title and `state.json`
don't apply here. Use a short timed slot with
`reminders: {useDefault: false, overrides: [{method: "popup", minutes: 0}]}` and
`transparency: "transparent"` in the event, so it pings them without blocking the time. Real
events keep their own language: never translate an event (step 2).

### C) "Not interested in 2, 4" / "Ban series 6" → remember the skip

- **Single event** ("не интересно", "skip"): append to `declined`.
- **Whole series** ("забань серию", "больше не предлагай такое"): append to `banned_series`. The match key is the event's title run through `filter.ts normalize`, scoped to its `source_url`. The user can also give a custom phrase ("забань всё с 'карнавал осьминогов'"); normalize that phrase instead.
- After editing, confirm in one line what will now be hidden.

> ⚠️ **Silence is NOT a decline here.** Only the events the user explicitly names get recorded.
> Never diff the presented batch against their picks and dump the remainder into `declined`, and
> never offer to "tidy up" the leftovers. They review this list about once a week and their plans
> change between runs: seeing the same gig again is the point, not a drain (their call,
> 2026-09-06, overturning the opposite instruction they gave on 2026-08-27).
>
> The sibling **`events-crawl`** skill is deliberately the opposite: there, everything presented
> and not picked *does* go to `declined`. That asymmetry is intentional (work vs. leisure). Do
> not harmonise the two.

---

## Filtering: what NOT to show

`state.json` remembers what not to show again, the PAID calendar what is already bought, and
[`filter.ts`](filter.ts) applies both. Write the crawled candidates to a temp JSON array of
`{title, date, url, source_url, location}`, then run:

```bash
bun "${SKILLS_DIR:-$HOME/.claude/skills}/social-calendar/filter.ts" "${TMPDIR:-/tmp}/candidates.json"
```

It prints `SHOW n / HIDE m` with the count per reason (for the report in step A5), one line per
hidden candidate, then the survivors as JSON. A candidate is hidden when it is already bought
(an event in the PAID calendar with the same URL, or on the same date with one title inside the
other), when its `url` is in `added` or `declined`, or when a `banned_series` entry's `match`
occurs in its normalized title and the entry's `source` is `"*"` or the candidate's
`source_url`. A `WARNING` line before `SHOW` means the PAID calendar couldn't be read and
nothing was checked for being bought: see [Already bought?](#already-bought-check-before-every-answer).

A ban's `match` has to be normalized the same way (lowercase, numbers and punctuation dropped),
so make it with the script: `filter.ts normalize "Open Mic #12"` prints `open mic`.

---

## `state.json` schema

```jsonc
{
  "added":    [ { "url": "...", "title": "...", "date": "2026-06-29", "price": "0€", "lang": "EE", "book": false, "added_at": "2026-06-27" } ],
  "declined": [ { "url": "...", "title": "...", "declined_at": "2026-06-27" } ],
  "banned_series": [
    {
      "match":  "open mic",                          // normalized phrase to match in titles
      "label":  "Open Mic @ Erinevate Tubade Klubi", // human-readable, for reports
      "source": "https://www.facebook.com/erinevatetubadeklubi/", // bookmark scope, or "*" for global
      "banned_at": "2026-06-27"
    }
  ]
}
```

Use `date +%F` for the `*_at` stamps. Edit the file directly (read → modify JSON → write); keep it valid JSON.

---

## Before you report

A last pass over the rules above:

- **Bought:** before anything was shown or recommended, what's already bought was checked
  (`bought.ts`, or the same check inside `filter.ts` and `kokandus.ts`); nothing bought was
  offered as available, and a `WARNING` was reported, not ignored.
- **Crawl:** `sync_sources.ts` ran and its diff was reported; every source was crawled, none
  skipped for "enough candidates" (the cooking listing through `kokandus.ts`, with its ALREADY
  BOUGHT, NEW, OPENED and ITALIAN blocks reported); every candidate is inside the 14-day window and has a URL; what was hidden was reported.
- **List:** grouped by category in the set order, one numbering for the whole crawl, a series
  on one line, plain lines only (no bold, stars or reordering), and no word about time overlaps.
- **Each event:** availability checked, and a sold-out pick asked about before anything was
  created; canonical URL, date and time with `timeZone`, resolved address, a
  `· <price>` title (`[BOOK]` only when attending needs booking), the language / price / URL
  header and the full untranslated description; the user is never asked about the price.
- **Paid:** every `[PAID]` event sits in the PAID calendar with no color of its own (it shows in
  the calendar's color), and none is left in the picks calendar.
- **The user's own entries** are in English; real events keep their language.
- **State:** adds, declines and bans are in `state.json`, and the report gives `htmlLink` and
  every assumption made.
