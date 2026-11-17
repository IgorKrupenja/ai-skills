# Yaga (yaga.ee)

Scan it first: it reads every listing of the brand through Yaga's API (Louis Vuitton has about
550) and each one's details, keeping those for sale and not reserved:

```bash
bun <skill dir>/scripts/scan.ts yaga --brand "Louis Vuitton" --match "marel" --out <run dir>/scan/yaga.json
```

`--query <text>` narrows it with Yaga's own search, which is quicker for a big brand. Sellers often
set no brand, so also run a few text queries without the brand in the browser (below), with
Estonian terms such as `vöö` (belt), `kott` (bag), `rahakott` (wallet) and `valge` (white).

Its search cards show no titles, so in the browser use the JSON its `/otsi/` page loads, with
`fetch` from a yaga.ee page:
`/api/product/search/?categories=323&brands=[62,122]&colors=[13,16]&offset=0&limit=60`.
The category takes a bare id and brands and colors a bracketed list; `query=<text>` is optional
once a filter is set. Other parameter names are silently ignored, so check that the count changes.
`total` isn't a real count: keep paging until a page has fewer than 60 results. Ids: men's belts
323, women's belts 138, men's accessories 24 (with its subcategories); Louis Vuitton 62, Hugo Boss
122 (its only entry, covering BOSS and HUGO); white 13, cream 16. Look up others in
`/api/category`, `/api/brand` and `/api/color`. `/api/product/<slug>` gives the description,
category path, colors, condition, status, reservation, location and buyer fees, and the seller's
shop: give each listing's link as `https://www.yaga.ee/<shop.activeSlug>/toode/<slug>`, since
`/toode/<slug>` without the shop is a 404.
