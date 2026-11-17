# The smaller shops without a scan

- **A Retro Tale (aretrotale.com, Stockholm):** pick "Europe / EUR" in the first-visit popup. A
  brand's items are at `/en/category/<brand>/<category>` (such as `/en/category/louis-vuitton/bags`),
  48 a page; text search is `/en/search?q=<query>`, which finds fewer than the category pages. The
  site's search runs on a Searchspring API that answers JSON for the whole index, which is quicker
  to read than the pages. Delivery to Estonia is free with duties included, it checks authenticity
  itself (a third-party certificate costs €40 more), and a return costs €20.
- **Care of Carl (careofcarl.com):** pick Estonia in the delivery-country dialog first. Besides new
  items it has a pre-owned section, with Louis Vuitton at `/en/louis-vuitton-pre-owned`. It refuses
  scripts outside the browser.
- **Collector Square (collectorsquare.com):** search with
  `/en/search?search%5Bkeywords%5D=<query>`; "belt" also finds clutch and belt bags.
- **Eppli (eppli.com, Stuttgart):** an auction house with an online shop: search only the shop, not
  auction lots. A brand's bags are at `/en/brands/<brand>/bags/`, and text search is
  `/index.php?lang=1&cl=search&searchparam=<query>`; item names are often German (Tasche,
  Aktentasche, Geldbörse, Gürtel). Delivery to Estonia costs €15.90, and it checks authenticity
  itself. It shows a Cloudflare check to scripts outside the browser.
- **Farfetch (farfetch.com):** new items from boutiques, plus pre-owned ones from resellers: Louis
  Vuitton only as the designer "Louis Vuitton Pre-Owned" (about 2,000 items in November 2026), and
  most of it in the women's section, though the bookmark opens the men's. Read the search results
  from the item list in the page's data, 96 a page, which is complete where the scrolled page isn't
  and stays the same between loads. Product pages give measurements; the seller's address is only
  in the "Seller details" dialog (a Dubai reseller in November 2026), and there's no ships-from
  field. Prices include import duties, and returns are free for 30 days. It refuses scripts
  outside the browser.
- **Relove (relove.fi):** the online store is about 50 products, mostly bags, at
  `/category/2/online-store`; search with `/search?q=<query>`.
- **ReSee (resee.com):** filter a designer page with
  `?refinementList[sub_categories_flat_en][0]=Accessories > Belts` (or the category you need). A
  location dialog can cover the photos; read the description text for color instead. Its pages
  load an Algolia product index, which answers text queries over the whole shop in one call.
- **YOOX (yoox.com):** a text-search parameter is dropped, so use the category with the Designer
  filter (men's HUGO belts add `brand[0]=HUGO BOSS-202 > HUGO-22874`). Cards show no color; the
  item page title does, as in "HUGO Black Men's Leather Belt".
