---
name: bookmarked-shopping-finder
description: Find, compare, or price-check current offers for a specific product or shopping item from the user's saved Vivaldi shops. Trigger for requests to find options, listings, deals, or prices even when the user does not mention bookmarks or Vivaldi. Search Clothes/Online and Clothes/Tallinn, then compare matches with the manufacturer's official new retail price.
---

# Bookmarked Shopping Finder

Use this skill whenever the user asks in natural language to find, compare, or price-check current offers for a product or shopping item, whether or not they mention Vivaldi, bookmarks, or online stores. For example, “find white men's belts by Louis Vuitton or Hugo Boss” is a shopping search for bookmarked listings. The product is open-ended: use whatever brand, model, item type, or constraints the user specifies.

## Source scope

At the start of every search, run the helper at scripts/read_vivaldi_bookmarks.py in this skill's folder. Use only the current account's Vivaldi bookmarks in the exact folders Clothes/Online and Clothes/Tallinn. Do not use a remembered store list or add other shops unless the user explicitly asks.

Search these bookmarked shops for active offers; do not answer with only products from manufacturer websites. Use official manufacturer pages to verify new retail prices for matching items, not as a substitute for finding offers. If there are no matching bookmarked listings, say so clearly.

The helper checks Vivaldi's Local State file only to resolve the active profile path, then reads bookmark titles and URLs from the Bookmarks JSON under the current user's home directory. It does not read browsing history, cookies, passwords, or bookmark folders in other user accounts. If a folder is missing or empty, report that and search only the folder contents that exist; do not widen the scope to compensate. If the current Vivaldi profile cannot be identified unambiguously, stop and ask which profile to use.

## Browser isolation and search completeness

Never use the user's personal browser for this skill. Do not open, inspect, attach to, or interact with Vivaldi, Chrome, Safari, or another user browser; do not use CUA or a browser extension/CDP connection. Use an ephemeral, isolated Playwright browser session for all website navigation and interaction. Do not load a persistent profile, saved cookies, or user storage. Close the Playwright session when finished. If Playwright is unavailable, explain the concrete blocker and do not silently switch to the user's browser.

For every bookmarked website, search directly on that website using its own search and filters in the isolated Playwright session, then inspect candidate product pages. Do not use search engines to search for listings or as a fallback for a website's native search. If the site's search is unavailable, try its category navigation, filters, and pagination directly; if direct searching still fails, report that site as unsearchable instead of relying on search-engine results. Search each requested brand separately and combine it with the other criteria. Use common aliases, local-language terms, and the shop's own category/color labels. Inspect relevant pagination or loaded results before concluding there are no matches. Record shops that are inaccessible or that could not be searched as such, rather than reporting them as having no matches.

A URL supplied by the user is explicit authorization to inspect that page even if its site is not among the bookmarks. It does not authorize widening the rest of the search to that site's catalog. Keep results from user-supplied non-bookmarked sites clearly identified separately from bookmarked-shop results.

### Site-specific notes

- **Yaga (yaga.ee):** Use the native product search (`/otsi/<query>`) in the isolated Playwright session. Search brand and category terms separately when needed. For belts, include Estonian terms such as `vöö` / `vööd`; for men's and white criteria, try `meestele` and `valge` as targeted variants. Inspect the listing itself for product identity, colour, men's category, price, active/sold state, and shipping information. Search results can rank matching items below the first few cards; inspect relevant result cards and continue through available results rather than relying on a domain search-engine query. Ignore recommendation/similar-item carousels unless they are part of the actual search results.
- **Vinted (vinted.ee):** When Vinted appears in the bookmark helper output, search it as a normal bookmarked shop in isolated Playwright. A user-supplied Vinted URL also authorizes inspecting that page even if Vinted is not currently bookmarked. Preserve query parameters such as category and colour filters; do not assume the search text alone encodes those filters. Inspect all relevant live result cards and verify each candidate on its own item page.


## Interpret the request

Break the request into the product category and its criteria, such as brand, audience or gender, color, material, model, size, and condition. Preserve the user's logic: “A or B” means search both alternatives; other stated criteria normally apply together.

Expand searches with a small set of likely equivalents: common brand aliases, spelling variants, translations, and the terms shops use for the same category or attribute. For example, interpret “men's white belts from LV or Hugo Boss” as belts AND men's AND white, with Louis Vuitton OR Hugo Boss/BOSS as the brand; search the full brand names as well as “LV” and relevant catalog terms. Do not broaden to different brands or relax a stated criterion just to get more results.

On each bookmarked shop, inspect the available filters and use the relevant ones when offered, especially category, audience or gender, brand, and color; also use material, size, or condition filters when they match the request. Preserve alternatives when applying filters: if a filter accepts only one brand or value at a time, search each requested alternative separately. Confirm the product page itself supports the match rather than relying on filter labels alone.

Treat explicit criteria as required for the main results. If only close alternatives are available (for example, cream instead of white, or unisex instead of men's), report them separately as near matches and state which criterion differs. Do not silently present them as exact matches.

## Find current listings

Search each bookmarked shop directly using the parsed criteria, exact terms, and targeted equivalents through that shop's own search, category navigation, filters, and pagination in the isolated Playwright session. Never use a search engine to find listings or to replace a direct shop search. For JavaScript-rendered catalogs, pagination, or lazy-loaded results, continue using isolated Playwright. Never fall back to CUA, the user's browser, or browser extension/CDP automation.

In the main results, include only currently accessible listings whose item, model, or variant matches the request. Put close alternatives in a separate “Near matches” section and state which criterion differs. Check each product page for the displayed price, currency, condition, size, color/material, and the country the item will ship from. Prefer an explicit “ships from” or item-location field. Do not substitute the seller's home country, the shop's registered address, or the delivery destination for the shipping-origin country. If origin is not stated, report “not stated.” If a shop requires sign-in or blocks access, note that and continue with the other bookmarked shops.

## Check the new retail price

For every product search, look up the exact item or current equivalent on the manufacturer's official website, using the Estonia/EU storefront when available. Record the official retail price and link to that page. Do not use a reseller's price as the manufacturer's retail price.

Compare like with like: note when size, material, edition, or variant differs. If the manufacturer does not currently list the model or price, write “not currently listed by manufacturer”; do not estimate an MSRP. When the listing and official price use the same currency and comparable variant, flag listings priced above new retail and calculate the difference. If currencies differ, keep both displayed prices and do not calculate a difference without a current verified conversion rate.

## Report

State the date checked and which bookmarked shops were searched. Give one row per distinct live listing in a concise table:

| Shop | Item / variant / condition | Listing price | New at manufacturer | Difference | Ships from | Listing |
| --- | --- | ---: | ---: | ---: | --- | --- |

Link the listing and official manufacturer price directly. Sort by listing price where prices are comparable. Bold a shipping-origin country if it is outside the European Union. EU countries are Austria, Belgium, Bulgaria, Croatia, Cyprus, Czechia, Denmark, Estonia, Finland, France, Germany, Greece, Hungary, Ireland, Italy, Latvia, Lithuania, Luxembourg, Malta, the Netherlands, Poland, Portugal, Romania, Slovakia, Slovenia, Spain, and Sweden. If origin is unknown, write “not stated” without bold.

If a shop has no matching live listings, say so briefly. Do not present category pages, sold listings, or search snippets as active offers. Do not add items to carts, contact sellers, or place orders.
