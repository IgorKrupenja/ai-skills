# Vinted (vinted.ee)

Scan it first:

```bash
bun <skill dir>/scripts/scan.ts vinted --tag <tag> --query marelle --query marellini --filters 'brand_ids[]=417' --out <run dir>/scan/vinted.json
```

The catalog API (`/api/v2/catalog/items`) is gone since November 2026, so the scan reads the
rendered catalogue pages from a tab, 96 cards a page and a page every 1.5 seconds. Each card's
label gives the title, brand, Vinted's model field (Mudel), size, condition and price with and
without buyer protection. A specific search has few results (two Marelle listings in November
2026); a whole brand stops at about 960 cards, so search by model name and add filters rather than
reading a brand whole. The brands API (`/api/v2/brands`) answers 403 now: find a brand's ids with the filter
search that shops.md gives for Vinted (Louis Vuitton is 417; one brand can have several) and give
them with `--filters`, or give `--brand` to keep only cards with that brand label. A brand Vinted
has no entry for can only be searched as text, and the text search is fuzzy: `--query pasotti`
filled the 960-card cap with Paciotti, Passi Italiani and the like and missed every Pasotti
umbrella, while the same query inside the umbrella categories (`--filters
'catalog[]=1851&catalog[]=2981'`) with `--match pasott` found all 5. Judge from the lines, and open the item page
or photo only for a candidate they can't settle: don't sweep through photos of unlabelled bags.

Without the scan, search the catalogue in your tab as below.

Open a pasted filtered URL with its full query string. Repeated parameters such as several
`brand_ids[]` or `color_ids[]` are separate filters, and rebuilding the search from text or a
single-value map drops them. Men's belts are `catalog[]=96`, white is `color_ids[]=12` and cream
`color_ids[]=20`. A brand can have several entries (Hugo Boss has Hugo Boss, BOSS Hugo Boss, HUGO
Hugo Boss, Boss, Boss Orange and BOSS Green), so tick each in the brand filter's search and take the
ids from the URL. Confirm the filter chips and result count, then check every card in the filtered
grid (not sponsored, showcase or recommendation blocks) on its item page: title, photos, price,
size, condition and availability. Color filters let through multicolor and off-color items. Record
the item price apart from the buyer-protection total; shipping is added at checkout. Item pages
have no ships-from field, and a description that says SOLD means sold even while Buy now still
shows. If an item page won't load, report only what the card shows and mark the rest unverified.
