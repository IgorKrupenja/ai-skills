---
name: fashion-hunt
description: Find live listings of a specific fashion item (mostly designer bags, wallets, belts and other accessories, sometimes clothes) in the user's bookmarked secondhand and designer shops, such as Vinted and Vestiaire Collective, and compare each with the brand's new retail price. Use whenever the user wants to find, buy or price-check a bag, wallet, accessory or piece of clothing, or asks whether a listing is a good deal (for example "find a white LV belt" or "any secondhand Hugo Boss wallets?"), even if they don't mention the shops or bookmarks.
---

# Fashion Hunt

Find every live listing of the item the user describes in their bookmarked shops, and compare each
with what the item costs new from the brand. Most of these shops sell pre-owned designer goods, so
the point is to show what can be bought right now and whether the price is good. The item is
open-ended: use whatever brand, model, type and constraints the user gives.

Scripts do the heavy reading: `scripts/scan.ts` lists the candidates of a whole shop or designer
in seconds, and lists only those an earlier run of the same search hasn't judged. Then a few
subagents judge the new candidates, search the shops without a scan and find the brand's new
price, in parallel and each in a browser tab of its own, and save what they verify with
`scripts/listings.ts`.

Run every command in this file from this skill's folder: `scripts/` is the skill's own scripts
folder (its `tab.ts` links to skills-kit's), and `../node_modules/skills-kit/` holds the skills
repo's shared helpers. The scripts run with Bun.

## Shops to search

Start every search by running this. It loads `BOOKMARKS_FILE`, the path to the user's bookmarks
file, from the skills `.env`:

```bash
set -a && source "${SKILLS_DIR:-$HOME/.claude/skills}/.env" && set +a && bun scripts/read_vivaldi_bookmarks.ts
```

It prints the shops bookmarked in Vivaldi under `Fashion/Online` and `Fashion/Tallinn`, the user's
curated list: the user lives in Tallinn, and these shops sell online or in town. The script lists
the other folders under `Fashion` in `other_folders`: cities the user sometimes visits, whose shops
don't deliver to Estonia. Search one of those only when the user asks about that city (a trip to
Helsinki, say), by adding `--city <name>`, and treat its shops as places to buy in person.

Search only the shops the script prints, not shops you remember or come across, unless the user
names another. If a folder is missing or empty, say so and search the rest rather than widening the
scope. If the script says `BOOKMARKS_FILE` is missing, ask the user to set it in the skills `.env`
rather than looking for a bookmarks file yourself. The script reads only bookmark titles and URLs,
never history, cookies or passwords.

A URL the user pastes may be inspected even if its site isn't bookmarked, but that doesn't add the
site to the search. Mark results from it as coming from outside the bookmarks.

`references/shops.md` says what each bookmarked shop carries (item types and brands) and how to
search it. Skip a shop that can't have the item, such as YOOX for Louis Vuitton or the bag shops for
a jacket, and list it in the report's notes as skipped, with why.

## Read the request

Break the request into the item type and its criteria: brand, audience or gender, color, material,
model, size and condition. "A or B" means search both; the other criteria apply together. "Men's
white belts from LV or Hugo Boss" is belts AND men's AND white, with Louis Vuitton OR Hugo
Boss/BOSS as the brand.

List each brand's aliases for the agents (LV for Louis Vuitton; BOSS and HUGO for Hugo Boss). An
item that misses exactly one criterion (cream instead of white, unisex instead of men's) is a near
match, reported separately with what differs. For color, only a neighbouring shade counts (for
white: off-white, cream, ecru, ivory, light beige), or a pattern on a mostly white ground (Damier
Azur, a print on white). Another color with trim in the requested one (navy with white edging) is
not a near match. A reversible item with one side in the requested color is a match, labelled as
white on one side only.

Name the search with a short slug for the history, such as `white-mens-belts-lv-boss`. Run
`bun scripts/history.ts list` first and reuse the slug of an earlier run of the same request.

## Run the search

The search uses the skills repo's own playwright-cli browser, session `ai-skills`, through
`../node_modules/skills-kit/src/browser.ts` and `scripts/tab.ts`. A `playwright-cli` on your PATH runs another browser,
so don't use it here.

1. Run `bun ../node_modules/skills-kit/src/browser.ts list`. If the `ai-skills` browser isn't open, start it now,
   before any agent needs it (the script adds the persistent profile and the repo's config itself):

   ```bash
   bun ../node_modules/skills-kit/src/browser.ts open "<any shop url>" --headed
   ```

   If it's already open, other chats may be using it, so leave its tabs alone.
2. Pick a run id of four random lowercase letters, such as `qkzv`, and make a run folder for it
   in the session's scratchpad folder or another temporary one, never in this skill's folder (the
   repo is public), such as `<scratchpad>/<slug>/`. Scans and the agents' listings go there. Each
   agent's tab tag is the run id plus its shops or brand, such as `qkzv-vinted`.
3. Run the scans yourself, before any agent starts: they're scripts, and together take a few
   minutes. The table in `references/shops.md` says which shops have one, and each shop's notes
   give its command: fill in the request's brand, models and a loose `--match`, and add
   `--known <slug>`, `--tag <run id>-scan-<shop slug>` where the scan needs a tab, and
   `--out <run dir>/scan/<shop slug>.json`. Run them in parallel in one background command, each
   printing to `<run dir>/scan/<shop slug>.txt`, then read only their summary lines with
   `grep -h '^#' <run dir>/scan/*.txt`: how many new candidates each found, and anything that
   stopped it. Leave the candidate lines to the agents.
4. In a single message, start the agents: in Claude Code, the Agent tool with the general-purpose
   type and `model: "sonnet"` for shop agents. Every agent pays a fixed cost to start and wakes
   you when it reports, and the Agent tool runs at most 20 at once, so start only the ones there's
   work for:
   - for each scan with new candidates, an agent that judges them from its `.txt` file, or two
     when it has more than about 200, each with half of the lines by price. A scan with no new
     candidates needs no agent, and you can judge a handful yourself and save them as an agent
     would (`references/shop-agent.md`);
   - one or two agents for the shops without a scan, three to five shops each, and for any URL the
     user pasted;
   - one agent per requested brand for the new price, on the default model.

   Fill in the briefs below, giving this skill's folder and the run folder as absolute paths,
   since an agent may start in another folder. Tell the user in one line how many agents are
   searching, then wait for all of them to report, without browsing yourself.
5. If an agent fails or its report is unusable, start a fresh one for its shops once; if that fails
   too, report them as not searched. Set a background timer for 15 minutes when you start them.
   At that point, message every agent still running to stop, close its tab and report; stop any
   that hasn't reported 3 minutes later. Agents save each listing as they verify it, so what a
   stopped agent saved is kept: list its shops as partly searched (timed out), or as not searched
   when it saved nothing.
6. An agent that lists unverified links that may be matches, because it ran out of time, gets a
   second round: start one more agent for its shop with just those links, on its own 15-minute
   timer. Only what that one can't check either goes into the page's unverified list. When all
   have reported, run `bun scripts/tab.ts cleanup <run id>` to close any tab an agent left open.
7. Merge the agents' listings into the run file, `<run dir>/run.json`, converting other currencies
   at a current verified rate:

   ```bash
   bun scripts/listings.ts merge <run dir>/run.json --known <slug> --rate USD=<EUR per dollar>
   ```

   `--known` carries over the last run's verdicts: every listing a scan found again keeps its
   item, tab, variant and new price, with today's price and condition, and the ones it judged
   not to match stay out. Then give each new listing its tab (`group`), variant and new price
   (below), with a short script rather than by retyping listings, and compare with the last run:
   `bun scripts/history.ts diff <slug> <run file>` prints what is new, gone or repriced since the
   last run of the same search.
   Open the page of each gone match in a tab of your own (`bun scripts/tab.ts`, used as
   `references/shop-agent.md` shows): if it's still for sale, this run missed it, so add it back to
   the file and say so; otherwise note it as sold or removed. Then write the report (below), and
   once its page is published, save the run with `bun scripts/history.ts record <slug> <file>`,
   which also keeps its verdicts for the next run.

Where subagents aren't available, search the shops one at a time yourself, following
`references/shop-agent.md` and then `references/brand-agent.md`.

Shop brief (for an agent that judges a scan, replace the first line with "Judge the candidates
that the <shop> scan found for <the request in one line>." and add a line "Scan output: <run
dir>/scan/<shop slug>.txt, every field in the .json next to it", with the lines it should take
when two agents share a scan):

```
Search <shop names, each with its url> for <the request in one line>.
Criteria: <item type>; brand <brands and aliases, or the one brand of a split agent>; <model and
its spellings>; <audience>; <color>; <other constraints>.
A near match misses exactly one criterion, such as cream instead of white (rules in your file).
<How to tell look-alike models apart, when you know, such as by their measurements.>
Write each listing's item, misses and note in <the user's language>.
Today is <date>. Run folder: <run dir>. Search slug: <slug>. Your tab tag is <run id>-<agent slug>.
Skill folder: <skill dir>.
First read <skill dir>/references/shop-agent.md, then your shops' notes: <notes files under
references/shops/>, and follow them.
```

Brand brief:

```
Find the new price at <brand> for <the request in one line>.
Today is <date>. Your tab tag is <run id>-<brand slug>. Skill folder: <skill dir>.
First read <skill dir>/references/brand-agent.md and follow it.
```

## Compare with the new price

Match each listing with the brand agent's closest item: same model, material and edition, and note
when size, material, edition or variant differs. If the brand doesn't list the item, write "not
currently listed by manufacturer" rather than estimating. When a listing and the retail price are in
the same currency for a comparable variant, calculate the difference and flag listings priced above
new. Across currencies, calculate only with a current verified exchange rate. The brand's price is a
reference only: if the shops have no matches, say so rather than offering the brand's own products
instead.

## Report

The report is always a page with every listing, published as an Artifact, plus a short summary in
chat, however few listings the run found. Write both in the user's language.

### The page

Add the page fields `scripts/report.ts` lists to the run file, with the photo URL each agent gave
in the listing's `photo`, then fetch the photos and build the page next to the run file:

```bash
bun scripts/photos.ts <run file>
bun scripts/report.ts <run file> <run file's folder>/<slug>.html
```

`photos.ts` saves a small copy of each listing's photo in `img/` next to the run file, finding it
on the listing's page when the agent gave none, and inside the `ai-skills` browser for shops such
as Vestiaire that refuse scripts. It prints the files to publish with the page and the listings
that share a photo: often one bag listed by several shops, or a seller using someone else's
photos. `report.ts` marks those itself: a note on each links the others, a filter (on by default)
shows only the cheapest, and a `risk` flags a group shipping from different countries. Add a `risk`
yourself where a group looks like a seller using someone else's photos. A publish takes at most
255 files, so when there are more photos than that (`photos.ts` says so), build the page with
`report.ts --inline`, which puts the photos into the page itself (as saved while they fit in its
16 MB, else as smaller AVIF copies), and publish the page alone, without `files`.

- **Rows:** one per live listing from every shop searched, merged from all the agents' reports; the
  page sorts them by EUR price. When the user adds a shop or URL later, rebuild the page with every
  shop searched, not only the new one.
- **Tabs:** the first, `match`, holds the matches, and the page adds a last one with every listing.
  Give each kind of near match a tab of its own, named by the criterion it misses (such as "listed
  as women's", "cream or light beige", "Damier Azur"), with a one-line hint on what's in it.
- **Language:** write the title, lede, facts, tab labels and notes in the user's language, and set
  `lang` to `ru` when that's Russian, so the page's controls match.
- **Title:** a short name for the search, such as "White LV and BOSS belts". **Lede:** what was
  searched, the date checked and how many shops.
- **Facts:** two to four short boxes: the brand's new prices (linked), authenticity (which
  platforms check it, and that risky listings are flagged), and fees, shipping and duties.
- **Notes:** the shops searched and which had nothing, which were blocked or only partly checked,
  how prices and differences were worked out, and any exchange rate with its date and source.
- **Unverified:** listings an agent shortlisted but couldn't open in time, so the user can look.

Each listing's fields:

- **Shop:** the shop's name; the page links it to the listing. Name a new item sold by the brand's
  own store like "Louis Vuitton (official, new)"; third-party retailers aren't labelled (call them
  retailers when useful).
- **Condition:** the shop's own label. The page puts the usual Vinted, Vestiaire, Yaga, eBay.de,
  Care of Carl and Collector's Cage labels on one scale in its language, so the column doesn't mix
  Estonian, German and English. Put any other label on that scale yourself, as its name in the page's
  language with the shop's own words in brackets (such as "Очень хорошее (minimal marks)"), so
  the condition filter sorts it too.
- **Price:** in EUR. Prefer the shop's own EUR price; otherwise convert at a current verified rate
  and give the original amount and currency in `price_note`, marked approximate. Keep duties,
  shipping and buyer fees out of it, so prices stay comparable.
- **Item:** model, colour and material, specific enough to compare with the brand's range, and
  "white on one side only" for a reversible item. Put "new since <date>" or "price cut from €X"
  from the history in `change`.
- **Risk:** an agent's authenticity flag, with its reason.
- **New price:** the brand agent's closest item with its link, and in `new_note` what differs
  (size, material, edition, variant); or only a `new_note` saying "not currently listed by
  manufacturer".
- **Ships from:** the country, in any language: `report.ts` names it in the page's language and
  works out from it whether it's outside the EU, where import VAT and duties come on top. Set
  `non_eu` yourself only on a ships-from that names no country, which `report.ts` lists. "not
  stated" isn't outside the EU. For a shop from a city folder, write "in store, <city>".

Publish the page with the Artifact tool, with `root` set to the run file's folder and `files` set
to the list `photos.ts` printed, a one-word icon for the item type (bag, belt, jacket, wallet) and
a one-sentence description. If `bun scripts/history.ts list` shows a page for this
search, update that one instead, so its link stays the same: read it with the Artifact tool, then
publish the new file with its URL. Without an Artifact tool, open the file with `open`. Put the
page's link in the run file as `page_url` before recording the run.

### Its look

The template keeps what every report needs: the listings table, a tab per group plus the one with
every listing, the filters, and conditions on one scale in the page's language. Design the rest
for this search, so each report looks like what was searched for:

- **Palette and type** (`page.css`, `page.fonts`): colors and fonts that suit the item, such as
  browns and caramel for a brown Louis Vuitton bag, or Canada Goose red for its jackets. Set the
  template's tokens (`--bg`, `--surface`, `--fg`, `--muted`, `--line`, `--accent`, `--accent-soft`,
  `--link`, `--warn`, `--warn-soft`, `--chip`, `--display`, `--body`) for light and dark alike, with
  the three selectors the template uses (`:root`, `:root:not([data-theme="light"])` inside
  `@media (prefers-color-scheme: dark)`, and `:root[data-theme="dark"]`), and restyle anything
  else you like. Keep text at least 4.5:1 against its background. Fonts come only from Google
  Fonts, through the css2 URL in `page.fonts`.
- **Variant cards** (`variant` on each listing, `page.variants`): when the listings fall into
  variants worth comparing (canvases, colors, models), name each listing's variant and give every
  variant a `swatch`, a small inline SVG that draws its pattern or color (a Damier check, a
  flower print, a color chip), with ids of its own if it defines patterns. The page draws a card
  per variant with its count, lowest and median price, and a click on a card filters the table.
- **Eyebrow and hero** (`page.eyebrow`, `page.hero`): a short line above the title, such as
  "Fashion hunt · Louis Vuitton · checked 16 Nov 2026", and optional HTML under the lede, such as
  an inline SVG of the item. No scripts, external images or brand logos.

### In chat

Keep the reply short:

- the page's link;
- the date checked and the shops searched; name any that were blocked or couldn't be searched, and
  offer to search them again once the user has dealt with the check or sign-in in the browser
  window (it runs headed);
- three to five picks worth a look first, each linked with its price and size and why it stands
  out, and the brand's new price to compare;
- what changed since the last run: matches that sold, and any this run had missed.

If no shop has a single live listing, near matches included, skip the page and say so in chat.
