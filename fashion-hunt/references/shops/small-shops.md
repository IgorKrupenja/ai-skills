# The smaller shops without a scan

- **A Retro Tale (aretrotale.com, Stockholm):** pick "Europe / EUR" in the first-visit popup. A
  brand's items are at `/en/category/<brand>/<category>` (such as `/en/category/louis-vuitton/bags`),
  48 a page; text search is `/en/search?q=<query>`, which finds fewer than the category pages.
  Scan it instead, which reads the brand's whole stock from the site's search service
  (Searchspring) in seconds: `bun <skill dir>/scripts/scan.ts aretrotale --brand "Louis Vuitton"
  --match marel --out <run dir>/scan/aretrotale.json`. Delivery to Estonia is free with duties
  included, it checks authenticity itself (a third-party certificate costs €40 more), and a
  return costs €20.
- **Care of Carl (careofcarl.com):** new menswear and accessories, umbrellas included
  (`/en/accessories/umbrellas`), and a pre-owned section, with Louis Vuitton at
  `/en/louis-vuitton-pre-owned`. Category pages end "show N of N" and have a Brand filter, and
  `/en/<brand-slug>` is a 404 for a brand it doesn't carry. Its `/en` home page renders a 404 body,
  so start from a category. Plain requests got full pages in November 2026, but the browser is
  safer.
- **Collector Square (collectorsquare.com):** scan it: `bun <skill dir>/scripts/scan.ts
  collectorsquare --query "louis vuitton marelle" --brand "Louis Vuitton" --match marel --out
  <run dir>/scan/collectorsquare.json` reads its search pages, 120 cards a page, from the data
  each card carries (name, price, model id, material, condition). In the browser, search with
  `/en/search?search%5Bkeywords%5D=<query>`; "belt" also finds clutch and belt bags, and its
  search is fuzzy ("marelle" also finds Malle trunks). It checks authenticity itself.
- **Eppli (eppli.com, Stuttgart):** an auction house with an online shop: search only the shop, not
  auction lots. A brand's bags are at `/en/brands/<brand>/bags/`, and text search is
  `/index.php?lang=1&cl=search&searchparam=<query>`; item names are often German (Tasche,
  Aktentasche, Geldbörse, Gürtel). Delivery to Estonia costs €15.90, and it checks authenticity
  itself. It shows a Cloudflare check to scripts outside the browser.
- **Relove (relove.fi):** the online store is about 50 products, mostly bags, at
  `/category/2/online-store`; search with `/search?q=<query>`.
- **ReSee (resee.com):** filter a designer page with
  `?refinementList[sub_categories_flat_en][0]=Accessories > Belts` (or the category you need). A
  location dialog can cover the photos; read the description text for color instead. Scan it
  instead, which reads the brand's stock from the site's search service (Algolia) with
  Estonia's prices: `bun <skill dir>/scripts/scan.ts resee --brand "Louis Vuitton" --match
  <regex> --out <run dir>/scan/resee.json`. It sells mostly clothing; items not in Paris say
  where they are.
- **YOOX (yoox.com):** new off-season stock. Check the brand first in its designer index
  (`/ee/designerindex/women`, `/men`, `/kids`); a text-search parameter is dropped, so use the
  category with the Designer filter (men's HUGO belts add `brand[0]=HUGO BOSS-202 > HUGO-22874`). Cards show no color; the
  item page title does, as in "HUGO Black Men's Leather Belt".
