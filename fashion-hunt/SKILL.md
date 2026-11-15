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

## Shops to search

Start every search by running `scripts/read_vivaldi_bookmarks.py` from this skill's folder. It
prints the shops bookmarked in Vivaldi under `Fashion/Online` and `Fashion/Tallinn`, the user's
curated list: the user lives in Tallinn, and these shops sell online or in town. The script lists
the other folders under `Fashion` in `other_folders`: cities the user sometimes visits, whose shops
don't deliver to Estonia. Search one of those only when the user asks about that city (a trip to
Helsinki, say), by adding `--city <name>`, and treat its shops as places to buy in person.

Search only the shops the script prints, not shops you remember or come across, unless the user
names another. If a folder is missing or empty, say so and search the rest rather than widening the
scope. If the script can't tell which Vivaldi profile is active, ask which one to use. The script
reads only bookmark titles and URLs, plus Vivaldi's `Local State` to find the active profile, never
history, cookies or passwords.

A URL the user pastes may be inspected even if its site isn't bookmarked, but that doesn't add the
site to the search. Mark results from it as coming from outside the bookmarks.

## Read the request

Break the request into the item type and its criteria: brand, audience or gender, color, material,
model, size and condition. "A or B" means search both; the other criteria apply together. "Men's
white belts from LV or Hugo Boss" is belts AND men's AND white, with Louis Vuitton OR Hugo
Boss/BOSS as the brand.

List each brand's aliases for the agents (LV for Louis Vuitton; BOSS and HUGO for Hugo Boss). An
item that misses exactly one criterion (cream instead of white, unisex instead of men's) is a near
match, reported separately with what differs.

## Run the search

1. Run `playwright-cli list`. If the shared `personal` browser isn't open, start it now, before any
   agent needs it, adding the launch flags your global instructions give, if any:

   ```bash
   playwright-cli -s=personal open "<any shop url>" --headed --persistent
   ```

   If it's already open, other chats may be using it, so leave its tabs alone.
2. Pick a run id of four random lowercase letters, such as `qkzv`. Each agent's tab tag is the run
   id plus its shop or brand, such as `qkzv-vinted`.
3. In a single message, start one subagent per shop the script printed and per URL the user pasted,
   plus one per requested brand for the new price: in Claude Code, the Agent tool with the
   general-purpose type. Fill in the briefs below. Tell the user in one line how many agents are
   searching, then wait for all of them to report, without browsing yourself.
4. If an agent fails or its report is unusable, start a fresh one for that shop once; if that fails
   too, report the shop as not searched. If an agent hasn't reported after 15 minutes, stop it and
   report its shop as not searched (timed out), so one slow shop doesn't hold up the rest.
5. When all have reported, run `python3 scripts/tab.py cleanup <run id>` from this skill's folder to
   close any tab an agent left open, then write the report.

Where subagents aren't available, search the shops one at a time yourself, following
`references/shop-agent.md` and then `references/brand-agent.md`.

Shop brief:

```
Search <shop name> (<shop url>) for <the request in one line>.
Criteria: <item type>; brand <brands and aliases>; <audience>; <color>; <other constraints>.
A near match misses exactly one criterion, such as cream instead of white.
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

State the date checked and which shops were searched. Name any that were blocked or couldn't be
searched, and offer to search them again once the user has dealt with the check or sign-in in the
browser window (it runs headed). Then give one table with a row per live listing from every shop
searched, merged from all the agents' reports and sorted by EUR price, lowest first. If no shop has
a live match, say so instead. When the user adds a shop or URL later, the new table still covers
every shop searched, not only the new one.

| Source website | Item / variant | Condition | Size | Listing price | New at manufacturer | Difference | Ships from |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |

- **Source website:** the shop's name, linked to the listing. A new item sold by the brand's own
  store is bolded and labelled, like **Louis Vuitton (official, new)**; third-party retailers
  aren't (call them retailers when useful).
- **Listing price:** in EUR. Prefer the shop's own EUR price; otherwise convert at a current
  verified rate, mark it approximate and keep the original amount and currency beside it. Give the
  rate, its date and its source in a note under the table. Mention duties, shipping and buyer fees
  separately, so listing prices stay comparable.
- **New at manufacturer:** linked to the brand's page.
- **Ships from:** bold a country outside the EU, since import VAT and duties come on top. EU
  countries are Austria, Belgium, Bulgaria, Croatia, Cyprus, Czechia, Denmark, Estonia, Finland,
  France, Germany, Greece, Hungary, Ireland, Italy, Latvia, Lithuania, Luxembourg, Malta, the
  Netherlands, Poland, Portugal, Romania, Slovakia, Slovenia, Spain and Sweden. "not stated" isn't
  bolded. For a shop from a city folder, write "in store, <city>".

Put near matches in a separate "Near matches" section after the table, each with the criterion it
misses.
