---
name: fashion-hunt
description: Find live listings of a specific fashion item (mostly designer bags, wallets, belts and other accessories, sometimes clothes) in the user's bookmarked secondhand and designer shops, such as Vinted and Vestiaire Collective, and compare each with the brand's new retail price. Use whenever the user wants to find, buy or price-check a bag, wallet, accessory or piece of clothing, or asks whether a listing is a good deal (for example "find a white LV belt" or "any secondhand Hugo Boss wallets?"), even if they don't mention the shops or bookmarks.
---

# Fashion Hunt

Find every live listing of the item the user describes in their bookmarked shops, and compare each
with what the item costs new from the brand. Most of these shops sell pre-owned designer goods, so
the point is to show what can be bought right now and whether the price is good. The item is
open-ended: use whatever brand, model, type and constraints the user gives.

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

## Browser

Browse every shop with `playwright-cli` in the shared `personal` session, like the user's other
skills (its commands are in the `playwright-cli` skill), not with another browser. That persistent
profile keeps the user's shop logins, currency and cookie choices, so shops behave as they do for
the user.

Run `playwright-cli list` first. If `personal` is already open, another chat may be using it: open
a tab of your own, and at the end close only that tab, never the browser.

```bash
playwright-cli -s=personal tab-new "<url>"
```

Otherwise start it, adding the launch flags your global instructions give, if any:

```bash
playwright-cli -s=personal open "<url>" --headed --persistent
```

Another chat can start using the browser at any time, even one you opened yourself. Plain commands
such as `goto`, `click`, `fill`, `eval`, `snapshot` and `tab-close` act on whichever tab is current,
and that chat's `tab-new` or `tab-select` changes it without warning, so they can land in its tab,
which may be showing a sign-in or two-factor prompt. So drive your tab through `run-code` from the
start: find your own page by the URL you last left it on (check `tab-list` that no other tab shares
it) and act on that page instead of `page`. Read it there too, with `mine.evaluate(...)` or
`mine.locator('body').ariaSnapshot()`, and close it with `await mine.close()`.

```bash
playwright-cli -s=personal run-code "async page => {
  const mine = page.context().pages().find(p => p.url().includes('vinted.ee'));
  await mine.goto('https://www.vinted.ee/catalog?catalog[]=96');
  return mine.url();
}"
```

Never type into, click in or navigate a tab you didn't open.

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
  through the results, but skip the similar-items carousels. The search cards show no titles, so
  the site's own JSON, which `/otsi/` loads, is quicker: from a yaga.ee page,
  `fetch('/api/product/search/?query=<q>&offset=0&limit=60')` lists the slugs (page with
  `offset`), and `/api/product/<slug>` gives the description, category path, colors, condition,
  status, reservation, location and buyer fees. Check the photos when the seller set no color.
- **Vinted (vinted.ee):** open a pasted filtered URL with its full query string. Repeated parameters
  such as several `brand_ids[]` or `color_ids[]` are separate filters, and rebuilding the search
  from text or a single-value map drops them. Confirm the filter chips and result count, then check
  every card in the filtered grid (not sponsored, showcase or recommendation blocks) on its item
  page: title, photos, price, size, condition and availability. Color filters let through
  multicolor and off-color items, so separate true matches from near matches. Record the item price
  apart from the buyer-protection total; shipping is added at checkout. If an item page won't load,
  report only what the card shows and mark the rest unverified. Men's belts are `catalog[]=96`,
  white is `color_ids[]=12` and cream `color_ids[]=20`. A brand can have several entries (Hugo Boss
  has Hugo Boss, BOSS Hugo Boss, HUGO Hugo Boss, Boss, Boss Orange and BOSS Green), so tick each in
  the brand filter's search and take the ids from the URL. Item pages have no ships-from field, and
  a description that says SOLD means sold even while Buy now still shows.
- **Vestiaire Collective (vestiairecollective.com):** use the catalog filters for audience,
  category, brand and color (men's belts, for example, are under men's accessories). The filters
  live after `#` in the URL, so open a pasted catalog URL with its query and fragment intact.
  Confirm the filter chips and result count, then scroll the whole grid: cards lazy-load even when
  pagination shows one page. If both White and Ecru are selected, White is the match and Ecru a near
  match. Show prices in EUR (footer, Language/Currency); if that fails, convert at a verified rate
  and mark it approximate. A price shown in a currency other than the seller's may include a
  conversion fee of up to 5%. In that dialog, pick the currency before the country (picking a
  currency resets the country), then Save. A color added to the URL fragment by hand may not apply,
  so click the Colour filter and check its chip. Boss, Hugo Boss and Boss Orange are separate
  designers. The item's ships-from country is the "Location" line under DETAILS, and "The seller is
  on vacation" means it can't be bought now.
- **Queen Station (queenstation.fi):** search results stop at about 240 products, so filter a brand
  collection instead: `/collections/louis-vuitton?filter.p.product_type=Belts&filter.v.availability=1`
  lists only the belts in stock.
- **YOOX (yoox.com):** a text-search parameter is dropped, so use the category with the Designer
  filter (men's HUGO belts add `brand[0]=HUGO BOSS-202 > HUGO-22874`). Cards show no color; the
  item page title does, as in "HUGO Black Men's Leather Belt".
- **Care of Carl (careofcarl.com):** pick Estonia in the delivery-country dialog first. Besides new
  items it has a pre-owned section, with Louis Vuitton at `/en/louis-vuitton-pre-owned`.

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
using the Estonia or EU storefront when there is one, and link the page. When neither shows prices,
use another of the brand's EUR stores, in English if there is one, and say which. A reseller's
price isn't the retail price. The brand's site gives the reference price only: if the shops have no
matches, say so rather than offering the brand's own products instead.

- **Louis Vuitton:** there is no Estonian store, and the EU-wide site (`eu.louisvuitton.com/eng-e1`)
  shows no prices. Use the Netherlands store in English, `https://en.louisvuitton.com/eng-nl/`,
  which prices in EUR and uses the same product paths. The product page gives the color and
  materials, such as "White/Black, canvas strap, leather reverse".
- **Hugo Boss:** there is no Estonian store (`hugoboss.com/ee` is a 404). Use the Finland store in
  English, `https://www.hugoboss.com/fi/en/`, which prices in EUR; men's belts, for example, are at
  `/fi/en/men-belts/`. Under FILTER & SORT, Color lists how many products come in each color, so a
  color missing there isn't sold new. In the cookie dialog, Save services with only Necessary on
  declines the rest.

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
  bolded. For a shop from a city folder, write "in store, <city>".

Put near matches in a separate "Near matches" section after the table, each with the criterion it
misses.
