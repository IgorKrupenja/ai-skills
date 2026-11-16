---
name: fashion-hunt
description: Find live listings of a specific fashion item (mostly designer bags, wallets, belts and other accessories, sometimes clothes) in the user's bookmarked secondhand and designer shops, such as Vinted and Vestiaire Collective, and compare each with the brand's new retail price. Use whenever the user wants to find, buy or price-check a bag, wallet, accessory or piece of clothing, or asks whether a listing is a good deal (for example "find a white LV belt" or "any secondhand Hugo Boss wallets?"), even if they don't mention the shops or bookmarks.
---

# Fashion Hunt

Find every live listing of the item the user describes in their bookmarked shops, and compare each
with what the item costs new from the brand. Most of these shops sell pre-owned designer goods, so
the point is to show what can be bought right now and whether the price is good. The item is
open-ended: use whatever brand, model, type and constraints the user gives.

The search runs in parallel, with one subagent per shop and one per brand, each in a browser tab of
its own, so a full search takes about as long as the slowest shop rather than all of them in turn.

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
2. Pick a run id of four random lowercase letters, such as `qkzv`. Each agent's tab tag is the run
   id plus its shop or brand, such as `qkzv-vinted`.
3. In a single message, start one subagent per shop the script printed and per URL the user pasted,
   plus one per requested brand for the new price: in Claude Code, the Agent tool with the
   general-purpose type. The big marketplaces, Vinted and Vestiaire Collective, take the longest,
   so when the request names several brands, start one agent per brand there instead (tab tag
   `<run id>-<shop slug>-<brand slug>`). Fill in the briefs below, giving this skill's folder as an
   absolute path, since an agent may start in another folder. Tell the user in one line how many
   agents are searching, then wait for all of them to report, without browsing yourself.
4. If an agent fails or its report is unusable, start a fresh one for that shop once; if that fails
   too, report the shop as not searched. Set a background timer for 15 minutes when you start
   them. At that point, message every agent still running to stop, close its tab and report what it
   has verified so far; stop any that hasn't reported 3 minutes later and list its shop as not
   searched (timed out), so one slow shop doesn't hold up the rest.
5. When all have reported, run `bun scripts/tab.ts cleanup <run id>` to close any tab an agent left
   open.
6. Compare with the last run: write the merged matches and near matches as JSON to a run file
   (format in `scripts/history.ts`) and run `bun scripts/history.ts diff <slug> <file>`. Keep the
   file in the session's scratchpad folder or another temporary one, never in this skill's folder:
   the repo is public. The diff prints what is new, gone or repriced since the last run of the same
   search. Open the page of each gone match in a tab of your own (`bun scripts/tab.ts`, used as
   `references/shop-agent.md` shows): if it's still for sale, this run missed it, so add it back to
   the file and say so; otherwise note it as sold or removed. Then write the report (below), and
   once its page is published, save the run with `bun scripts/history.ts record <slug> <file>`.

Where subagents aren't available, search the shops one at a time yourself, following
`references/shop-agent.md` and then `references/brand-agent.md`.

Shop brief:

```
Search <shop name> (<shop url>) for <the request in one line>.
Criteria: <item type>; brand <brands and aliases, or the one brand of a split agent>; <audience>;
<color>; <other constraints>.
A near match misses exactly one criterion, such as cream instead of white (rules in your file).
Today is <date>. Your tab tag is <run id>-<shop slug>. Skill folder: <skill dir>.
First read <skill dir>/references/shop-agent.md and follow it.
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

The report is a page with every listing, published as an Artifact, plus a short summary in chat.
When a run has five listings or fewer in all, skip the page and give them as a table in chat (see
the end of this section). Write both in the user's language.

### The page

Add the page fields `scripts/report.ts` lists to the run file, then build the page next to it:

```bash
bun scripts/report.ts <run file> <run file's folder>/<slug>.html
```

- **Rows:** one per live listing from every shop searched, merged from all the agents' reports; the
  page sorts them by EUR price. When the user adds a shop or URL later, rebuild the page with every
  shop searched, not only the new one.
- **Tabs:** the first, `match`, holds the matches. Give each kind of near match a tab of its own,
  named by the criterion it misses (such as "listed as women's", "cream or light beige", "Damier
  Azur"), with a one-line hint on what's in it.
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
- **Ships from:** set `non_eu` for a country outside the EU, since import VAT and duties come on
  top. EU countries are Austria, Belgium, Bulgaria, Croatia, Cyprus, Czechia, Denmark, Estonia,
  Finland, France, Germany, Greece, Hungary, Ireland, Italy, Latvia, Lithuania, Luxembourg, Malta,
  the Netherlands, Poland, Portugal, Romania, Slovakia, Slovenia, Spain and Sweden. "not stated"
  isn't outside the EU. For a shop from a city folder, write "in store, <city>".

Publish the page with the Artifact tool, with a one-word icon for the item type (bag, belt, jacket,
wallet) and a one-sentence description. If `bun scripts/history.ts list` shows a page for this
search, update that one instead, so its link stays the same: read it with the Artifact tool, then
publish the new file with its URL. Without an Artifact tool, open the file with `open`. Put the
page's link in the run file as `page_url` before recording the run.

### In chat

Keep the reply short:

- the page's link;
- the date checked and the shops searched; name any that were blocked or couldn't be searched, and
  offer to search them again once the user has dealt with the check or sign-in in the browser
  window (it runs headed);
- three to five picks worth a look first, each linked with its price and size and why it stands
  out, and the brand's new price to compare;
- what changed since the last run: matches that sold, and any this run had missed.

If no shop has a live match, say so instead.

### Five listings or fewer

Give one table in chat instead of the page, sorted by EUR price, lowest first, with the same rules
for each field:

| Source website | Item / variant | Condition | Size | Listing price | New at manufacturer | Difference | Ships from |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |

Bold a country outside the EU and a new item from the brand's own store. Put near matches after
the table, grouped by the criterion they miss and each linked, then short notes: which platforms
check authenticity, what changed since the last run, and fees, shipping and duties.
