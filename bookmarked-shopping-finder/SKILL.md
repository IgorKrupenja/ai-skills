---
name: bookmarked-shopping-finder
description: Find live listings of a specific fashion item (mostly designer bags, wallets, belts and other accessories, sometimes clothes) in the user's bookmarked secondhand and designer shops, such as Vinted and Vestiaire Collective, and compare each with the brand's new retail price. Use whenever the user wants to find, buy or price-check a bag, wallet, accessory or piece of clothing, or asks whether a listing is a good deal (for example "find a white LV belt" or "any secondhand Hugo Boss wallets?"), even if they don't mention the shops or bookmarks.
---

# Bookmarked Shopping Finder

Find every live listing of the item the user describes in their bookmarked shops, and compare each
with what the item costs new from the brand. Most of these shops sell pre-owned designer goods, so
the point is to show what can be bought right now and whether the price is good. The item is
open-ended: use whatever brand, model, type and constraints the user gives.

## Shops to search

Start every search by running `scripts/read_vivaldi_bookmarks.py` from this skill's folder. It
prints the shops bookmarked in Vivaldi under `Clothes/Online` and `Clothes/Tallinn`, the user's
curated list. Search only those, not shops you remember or come across, unless the user names
another. If a folder is missing or empty, say so and search the rest rather than widening the
scope. If the script can't tell which Vivaldi profile is active, ask which one to use. The script
reads only bookmark titles and URLs, plus Vivaldi's `Local State` to find the active profile, never
history, cookies or passwords.

A URL the user pastes may be inspected even if its site isn't bookmarked, but that doesn't add the
site to the search. Mark results from it as coming from outside the bookmarks.

## Browser

Browse every shop with `playwright-cli` in the shared `personal` session, like the user's other
skills (its commands are in the `playwright-cli` skill), not with another browser. That persistent
profile keeps the user's shop logins, currency and cookie choices, so shops behave as they do for
the user.

Run `playwright-cli list` first. If `personal` is already open, another chat may be using it: work
in a tab of your own and close only that tab at the end, never the browser.

```bash
playwright-cli -s=personal tab-new "<url>"
playwright-cli -s=personal tab-close
```

Otherwise start it, adding the launch flags your global instructions give, if any:

```bash
playwright-cli -s=personal open "<url>" --headed --persistent
```

The browser is signed in as the user, so only look: don't favourite items, follow sellers, message
anyone, add to cart or buy.

Some shops show a Cloudflare or similar check first. Many clear on their own, so wait a few
seconds and take a fresh snapshot before calling a shop blocked. Don't click through a human check
yourself. If one stays, or a shop wants a sign-in, carry on with the other shops, then name the
blocked ones in the report and offer to search them once the user has dealt with it in the browser
window (it runs headed).

## Read the request

Break the request into the item type and its criteria: brand, audience or gender, color, material,
model, size and condition. "A or B" means search both; the other criteria apply together. "Men's
white belts from LV or Hugo Boss" is belts AND men's AND white, with Louis Vuitton OR Hugo
Boss/BOSS as the brand.

Expand each search with likely equivalents: brand aliases ("LV"), spelling variants, translations
(several shops are Estonian or Finnish) and each shop's own category and color labels. Don't add
other brands or relax a criterion to get more results. An item that misses one criterion (cream
instead of white, unisex instead of men's) is a near match, reported separately with what differs.

## Search each shop

Search every shop through its own search, category pages, filters and pagination, then open the
candidate product pages. Don't use a search engine, even as a fallback: its results are stale and
incomplete, and what matters is what the shop lists now.

- Use the shop's filters when it has them: category, audience, brand and color, plus material,
  size or condition when they match the request. If a filter takes one value at a time, run each
  requested alternative separately.
- Search each requested brand separately, combined with the other criteria.
- Go through all result pages or lazy-loaded results before saying a shop has no matches.
- Confirm each match on the product page. Filter labels aren't proof: a white filter can let
  through off-white or multicolor items.
- If a shop's search fails, try its category navigation; if the homepage is blocked, go straight to
  a category route or a pasted item URL. A shop you couldn't search is reported as not searched,
  never as having no matches.
- Never infer price or availability from URL text, cached snippets or blocked pages.

### Site notes

- **Yaga (yaga.ee):** search with `/otsi/<query>`, running brand and category terms separately when
  needed, with Estonian terms such as `kott`/`käekott` (bag/handbag), `rahakott` (wallet), `vöö`
  (belt), `meestele` (men's) and `valge` (white). Check the listing itself for the item, color,
  men's category, price, sold state and shipping. Matches can rank below the first few cards, so go
  through the results, but skip the similar-items carousels.
- **Vinted (vinted.ee):** open a pasted filtered URL with its full query string. Repeated parameters
  such as several `brand_ids[]` or `color_ids[]` are separate filters, and rebuilding the search
  from text or a single-value map drops them. Confirm the filter chips and result count, then check
  every card in the filtered grid (not sponsored, showcase or recommendation blocks) on its item
  page: title, photos, price, size, condition and availability. Color filters let through
  multicolor and off-color items, so separate true matches from near matches. Record the item price
  apart from the buyer-protection total; shipping is added at checkout. If an item page won't load,
  report only what the card shows and mark the rest unverified.
- **Vestiaire Collective (vestiairecollective.com):** use the catalog filters for audience,
  category, brand and color (men's belts, for example, are under men's accessories). The filters
  live after `#` in the URL, so open a pasted catalog URL with its query and fragment intact.
  Confirm the filter chips and result count, then scroll the whole grid: cards lazy-load even when
  pagination shows one page. If both White and Ecru are selected, White is the match and Ecru a near
  match. Show prices in EUR (footer, Language/Currency); if that fails, convert at a verified rate
  and mark it approximate. A price shown in a currency other than the seller's may include a
  conversion fee of up to 5%.

## Check each listing

On the product page, record the price and currency, condition, size, color and material, and the
country the item ships from.

- **Condition:** keep the marketplace's own label; "not stated" if there is none.
- **Ships from:** use an explicit "ships from" or item-location field. The seller's home country,
  the shop's registered address and the delivery destination don't count; "not stated" if the
  origin isn't given.
- **Availability:** keep only listings that can be bought now. Leave out sold, sold-out, reserved,
  removed and expired items entirely, near matches included. If nothing active is left, say there
  are no active matches rather than listing the unavailable ones. Category pages and search
  snippets aren't offers.

## Check the new retail price

For every search, find the exact item, or its current equivalent, on the brand's official website,
using the Estonia or EU storefront when there is one, and link the page. A reseller's price isn't
the retail price. The brand's site gives the reference price only: if the shops have no matches,
say so rather than offering the brand's own products instead.

Compare like with like and note when size, material, edition or variant differs. If the brand
doesn't list the item, write "not currently listed by manufacturer" rather than estimating. When a
listing and the retail price are in the same currency for a comparable variant, calculate the
difference and flag listings priced above new. Across currencies, calculate only with a current
verified exchange rate.

## Report

State the date checked and which shops were searched, naming any that couldn't be. Then give one
table with a row per live listing from every shop searched, sorted by EUR price, lowest first. When
the user adds a shop or URL later, the new table still covers every shop searched, not only the new
one.

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
  bolded.

Put near matches in a separate "Near matches" section after the table, each with the criterion it
misses.
