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

`references/shops.md` says what kinds of items each bookmarked shop sells, how to search it, and
how to check its brands and categories as they are now. Skip a shop only when the kinds it sells
rule the item out, such as the bag shops for a jacket, and list it in the report's notes as
skipped, with why. Never skip one for its brands from memory: the scans look the brand up, and an
agent searching a shop without a scan starts with its live brand check.

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

1. **The page first, open in the user's browser, before anything else.** The user watches the
   search on its page from the start, so as soon as you know the shops and the slug, and before
   the browser, the scans, reading shop notes or probing any site:
   - pick a run id of four random lowercase letters, such as `qkzv`, and make its run folder in
     this skill's `data/` folder, which git ignores, so every run is kept but never pushed:
     `<skill dir>/data/<slug>/runs/<YYYY-MM-DD>-<run id>/`. Scans, the agents' listings, the run
     file, the page and its photos go there; keep your own helper scripts in the scratchpad. Each
     agent's tab tag is the run id plus its shop, group or brand, such as
     `qkzv-vinted`, `qkzv-small` or `qkzv-lv`;
   - write the run file, `<run dir>/run.json`, with `listings: []`, the page fields that don't
     wait for results (the title, eyebrow, lede, css and fonts: see Report), and the plan as
     `page.progress`: every shop you'll search, with the tab tag of the agent you plan for it as
     `agent`, and each brand with its agent, such as
     `{"shops": [{"name": "Vestiaire Collective", "agent": "qkzv-vestiaire"}, ...], "brands": [{"name": "Louis Vuitton", "agent": "qkzv-lv"}]}`.
     Name each shop as its listings will;
   - build the page, publish it (Report says how) and open it with `open`:

   ```bash
   bun scripts/update.ts <run dir>/run.json --out <run dir>/<slug>.html --known <slug>
   open "<the page's URL>"
   ```
2. Run `bun ../node_modules/skills-kit/src/browser.ts list`. If the `ai-skills` browser isn't open, start it now,
   before any agent needs it (the script adds the persistent profile and the repo's config itself):

   ```bash
   bun ../node_modules/skills-kit/src/browser.ts open "<any shop url>" --headed
   ```

   If it's already open, other chats may be using it, so leave its tabs alone.
3. Run the scans yourself, all in one command that starts them together and waits for them (give
   it a 10-minute timeout; they take one to three minutes), then read only their summary lines:

   ```bash
   (bun scripts/scan.ts vestiaire ... > <run dir>/scan/vestiaire.txt 2>&1 &
    bun scripts/scan.ts ebay ... > <run dir>/scan/ebay.txt 2>&1 &
    wait); grep -h '^#' <run dir>/scan/*.txt
   ```

   The table in `references/shops.md` says which shops have a scan, and each shop's notes give its
   command: fill in the request's brand, models and a loose `--match`, plus `--side` with the range
   of the item's longer side in cm where its size tells it apart (9-10 for a MagSafe card holder),
   which keeps a listing that `--match` misses but whose measurements fit, and add
   `--known <slug>`, `--tag <run id>-scan-<shop slug>` where the scan uses a tab, and
   `--out <run dir>/scan/<shop slug>.json`. The summary lines say how many new candidates each
   found, how many lines it left to skim, and anything that stopped it. Leave the candidate lines
   to the agents.
4. Write the agents' briefs (below), with this skill's folder and the run folder as absolute
   paths, since an agent may start in another folder:
   - one judging agent for each scan with new candidates or lines to skim, or two when it has more
     than about 200, each with half of the lines by price, each with a check budget of about 10
     listing pages plus one for every 20 candidates, and 4 photo sheets. A scan with only a handful
     you can judge yourself and save as an agent would (`references/shop-agent.md`);
   - one or two for the shops without a scan, three to five shops each, and for any URL the user
     pasted;
   - one per requested brand, for the new price;
   - one on the default model that draws the page's hero, a small illustration of the item, from
     the design brief below, while the others search: `update.ts` puts it on the page once it's
     saved.

   Every agent pays a fixed cost to start, so start only the ones there's work for.

   Then bring the plan in `page.progress` up to date: a shop the scans settled gets its state
   instead of an agent (`{"name": "Vinted", "state": "nothing", "note": "no listings"}`), and a
   shop whose agent changed gets the new tag. Rebuild the page with `update.ts` and publish it
   again from the same file.
5. Run the agents as one workflow: the Workflow tool with `scriptPath` set to
   `<skill dir>/workflow/search.js` and `args` like
   `{"status": {"runDir": "<run dir>", "skillDir": "<skill dir>"}, "agents": [{"id": "qkzv-vestiaire", "label": "Vestiaire", "kind": "shop", "model": "sonnet", "brief": "..."}, {"id": "qkzv-lv", "label": "Louis Vuitton", "kind": "brand", "brief": "..."}]}`,
   each agent's `id` its tab tag: shop agents on Sonnet, brand agents on the default model. The user asked on 17 November 2026
   for this skill's searches to run this way, so running the skill is their go-ahead for the
   Workflow tool. It starts every agent at once, has each keep its own time (it reports by about
   13 minutes, with what's left as unverified), gives an agent that left links unchecked a second
   round, and returns every report once all are done, so you're woken once rather than for each
   agent. Each agent also gets the user's latest message and follows it over its brief where the
   two seem to disagree, so start the workflow only in the turn of the search request. When the
   user has written something else since (a correction, a complaint), or the Workflow tool isn't
   available, run the agents as `references/without-workflow.md` says, with the status step below
   in each brief.

   Each agent records itself as done when it ends (`listings.ts status`), so the page can fill
   in as shops report. Start the watcher with the Monitor tool, with a 30-minute timeout:
   `bun <skill dir>/scripts/watch.ts <run dir>`. It prints a line as each agent finishes: run
   `update.ts` again, with the same options, and publish the page again from the same file, so
   the user sees each shop's listings as soon as they're in. Tell the user in one line how many
   agents are searching, with the page's link, then wait without browsing yourself. If the
   watcher times out before the workflow ends, start it again.
6. In what the workflow returns, a report of null means that agent failed or was stopped: list
   its shops as partly searched when it saved listings (they're kept), or as not searched. Links
   still unverified after a second round go into the page's unverified list. Stop the watcher if
   it's still running (TaskStop), then run `bun scripts/tab.ts cleanup <run id>` to close any tab
   an agent left open.
7. Merge the agents' listings into the run file, `<run dir>/run.json`, converting other currencies
   at a current verified rate:

   ```bash
   bun scripts/listings.ts merge <run dir>/run.json --known <slug> --rate USD=<EUR per dollar>
   ```

   `--known` carries over the last run's verdicts: every listing a scan found again keeps its
   item, tab, variant and new price, with today's price and condition, and the ones it judged
   not to match stay out. Then give every listing its variant and new price with
   `scripts/compare.ts` (below), and each near match its tab (`group`), and compare with the last run:
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
when two agents share a scan, and a line "Check budget: <n> listing pages and <m> photo
sheets"):

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
Today is <date>. Run folder: <run dir>. Brand slug: <brand slug>. Your tab tag is
<run id>-<brand slug>. Skill folder: <skill dir>.
First read <skill dir>/references/brand-agent.md and follow it.
```

Design brief:

```
Draw a small, cute illustration of <the item, as it looks> for the top of its report page, and
save it as an inline SVG to <run dir>/hero.svg: flat and friendly, a few shapes, no text, logos,
brand marks, scripts or external images. Colour it only through the page's CSS tokens
(var(--accent), var(--fg), var(--surface), var(--line), var(--muted), var(--chip)), so it works in
light and dark; viewBox about 0 0 200 140 with no width or height, under 5 KB, any ids prefixed
hero-, and role="img" with an aria-label in <the user's language>. Check it on both themes in a
tab of your own (tag <run id>-design, through <skill dir>/scripts/tab.ts) and refine once or twice.
```

## Compare with the new price

The brand agent saves the brand's items in `<run dir>/brand/`, each with its variant (the canvas,
leather or colour line that sets it apart), colour, model code and price. `scripts/compare.ts`
gives every listing its variant and new price from them: the item whose code the listing names,
or else the variant whose words its item has, priced by that variant's item in the listing's
colour or its cheapest one, with a `new_note` saying how it differs. Write what the brand's items
can't settle in a spec, `<run dir>/compare.json` (the script's usage has its format):

- variants the brand doesn't sell now, such as a past collaboration or edition, with a
  `new_note` like "not currently listed by Louis Vuitton", rather than an estimated price;
- words that pick a variant, such as "safran" for Monogram Macassar, and `not` words that rule
  one out;
- `price_of` to price a variant by another item, and `rest`, a variant for the listings nothing
  else fits ("Canvas not stated");
- each variant's `swatch` and `hint` for the page.

```bash
bun scripts/compare.ts <run file> --spec <run dir>/compare.json
```

It redoes every listing each time and prints two lists to settle: listings no variant fits, with
the words they share, and listings it picked by words though their item names another variant.
Fix the spec and run it again until both are empty or right. The brand's price is a reference
only: if the shops have no matches, say so rather than offering the brand's own products
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
that share a photo, even where each shop saved it at another size or quality: often one bag
listed by several shops at different prices, or a seller using someone else's photos.
`report.ts` marks those itself: a note on each links the others, a filter (on by default) shows
only the cheapest, and a `risk` flags a group shipping from different countries. Add a `risk`
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
  JoliCloset, Care of Carl and Collector's Cage labels on one scale and shows only the scale's
  name in the page's language, with the shop's label on hover, so the column never mixes
  languages. When `report.ts` lists labels it can't place, give those listings the scale's name
  with the shop's words in brackets, such as "Fair (Correct condition)". Wear worth knowing
  (scratched hardware, darkened vachetta) goes in the note, which the page shows in full.
- **Size:** as the shop gives it. A bag's measurements, such as "Width 40 cm, Height 30 cm" or
  "40 x 31 x 6 cm", show in one format, longest side first, and the size filter goes by that
  width. For every bag search, give `page.sizes`, the size chart from the brand agent's SIZES
  line, each size with the brand's width in cm, a model in one size included, such as
  `[{"name": "PM", "width": 36.5}, {"name": "GM", "width": 41}]`: the filter then offers those
  names, with Other size for listings measured outside them and Not stated. Without it, the page
  falls back to ranges of widths, and `report.ts` says so.
- **Price:** in EUR. Prefer the shop's own EUR price; otherwise convert at a current verified rate
  and give the original amount and currency in `price_note`, marked approximate. Keep duties,
  shipping and buyer fees out of it, so prices stay comparable.
- **Item:** model, colour and material, specific enough to compare with the brand's range, and
  "white on one side only" for a reversible item. Put "new since <date>" or "price cut from €X"
  from the history in `change`. The page's colour filter reads the colour from the item (and the shop's
  colour field), so name it in plain words, such as "чёрный", "navy", "gold" or "floral print".
- **Risk:** an agent's authenticity flag, with its reason.
- **Authenticity check:** the page draws a shield by the shop when someone checks the item before
  it ships, with an Authenticity filter: `report.ts` knows which shops check everything they sell
  (`CHECKING_SHOPS`, from their notes), and on eBay.de and Vestiaire the scans give each listing's
  `auth`. Add a shop to `CHECKING_SHOPS` when its notes say it checks every item.
- **New price:** set by `compare.ts` (above): the brand's closest item with its link, and in
  `new_note` what differs (colour, variant, edition); or only a `new_note` saying the brand
  doesn't sell it now.
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

While the search runs, `update.ts` builds the page with `--inline`, so each version publishes as
the one file, from the same path each time. The page shows `page.progress` above the listings:
how many shops are searched, a bar, each shop's state, and shimmering rows until the first
listings are in. It drops it once every agent is done and the brand's prices are in, so the
final build has none.

### Its look

The page keeps what every report needs: the listings table, a tab per group plus the one with
every listing, a filter pill per column (shop, condition, size, price, new price, the difference
from it and ships from), and conditions on one scale in the page's language. Design the rest
for this search, so each report looks like what was searched for:

- **Palette and type** (`page.css`, `page.fonts`): colors and fonts that suit the item, such as
  browns and caramel for a brown Louis Vuitton bag, or Canada Goose red for its jackets. Set the
  page's tokens (`--bg`, `--surface`, `--fg`, `--muted`, `--line`, `--accent`, `--accent-soft`,
  `--link`, `--warn`, `--warn-soft`, `--chip`, `--display`, `--body`) for light and dark alike, with
  the three selectors the page uses (`:root`, `:root:not([data-theme="light"])` inside
  `@media (prefers-color-scheme: dark)`, and `:root[data-theme="dark"]`), and restyle anything
  else you like. Keep text at least 4.5:1 against its background. Fonts come only from Google
  Fonts, through the css2 URL in `page.fonts`.
- **Variant cards** (`variant` on each listing, `page.variants`): `compare.ts` names each
  listing's variant and lists the variants in `page.variants` with a hint. Give every variant a
  `swatch` in the spec, a small inline SVG that draws its pattern or color (a Damier check, a
  flower print, a color chip), with ids of its own if it defines patterns. The page draws a card
  per variant with the count, lowest and median price of its listings in the open tab under the
  other filters, and clicking cards filters the table to those variants, one or several at once.
- **Eyebrow and hero** (`page.eyebrow`, `page.hero`): a short line above the title, such as
  "Fashion hunt · Louis Vuitton · checked 16 Nov 2026", and under the lede the item's
  illustration, which the design agent draws: `update.ts` puts `<run dir>/hero.svg` in `page.hero`
  once it's there. No scripts, external images or brand logos.

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
