# The Shopify shops

Curated by NOAR (Tallinn), Affordable Luxury, Queen Station, ReLuxe Room (Sofia), Designer Exchange
(Dublin), Luxury Helsinki, Labellov (Antwerp), Bam Luxury Store (Barcelona) and Collector's Cage
(Copenhagen) all run on Shopify, so one scan covers them in about 20 seconds:

```bash
bun <skill dir>/scripts/scan.ts shopify --brand "Louis Vuitton" --brand LV --match marel --tag <tag> --out <run dir>/scan/shopify.json
```

After a day of scans, all nine shops answered 403 to requests from outside the browser, while the
same JSON loaded in a tab: with `--tag`, the scan reads any shop that answers 403 in a tab instead.

It reads each shop's brand collection (such as `/collections/louis-vuitton`, which holds the
brand's products in stock), or the whole catalogue where there's none, keeps products in stock
whose vendor, title or tags name a `--brand`, and prices them as the shop shows them in euros.
Without `--match` it lists every in-stock product of the brand, so add one whenever the request
names a model or type. The scan covers these shops: don't repeat it with their text search or
browse their other products, unless the request is wider than a brand. If it fails with 403 or
429, Cloudflare is limiting this machine after many scans: wait a few minutes, or read
`/collections/<brand>/products.json` with `fetch` from a page of the shop in your tab. Then check
each candidate's page for what the scan lacks: condition,
measurements, colour and material, and whether the title is right (Collector's Cage once listed a
Pochette Florentine as a "Pochette Marelle", and Bam an Easy Pouch On Strap). A product's JSON is
at `/products/<handle>.js`, and its page's description usually gives condition and measurements.

- **Own stock:** ReLuxe Room, Designer Exchange, Luxury Helsinki, Labellov, Bam, Queen Station and
  Collector's Cage sell their own stock, so each item ships from the shop's country, and each
  checks authenticity itself: report it as included. Delivery to Estonia: ReLuxe Room free from
  €130, Designer Exchange free, Luxury Helsinki €30 (free from €1,000), Labellov €39 by DHL
  Express, Bam €25 (free from €2,000). Bam's sales are final, and its paths start with `/en-eu`.
- **Affordable Luxury** prices in SEK and shows EUR to Estonia (the scan gives EUR); it looks
  Swedish (Sweden is its default delivery country, and it has a showroom), but check where it ships
  from before saying so.
- **Queen Station:** its text search stops at about 240 products, so if you browse, filter a brand
  collection: `/collections/louis-vuitton?filter.p.product_type=Belts&filter.v.availability=1`, plus
  `&filter.p.m.custom.colors=White` for a colour. Men's items are tagged "mens" or "miesten".
- **Collector's Cage:** bags and a few accessories; a "belt" search finds belt bags. It has no brand
  collections, so the scan reads all 4,000 products (about a minute).
- **Curated by NOAR, Affordable Luxury:** a text search with no hits still lists other products, so
  count only results that match the brand and item.
- Text search, if you need it: `/search?type=product&q=<query>`.
