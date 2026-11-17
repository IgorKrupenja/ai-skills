# The smaller shops without a scan

- **A Retro Tale (aretrotale.com, Stockholm):** pick "Europe / EUR" in the first-visit popup. A
  brand's items are at `/en/category/<brand>/<category>` (such as `/en/category/louis-vuitton/bags`),
  48 a page; text search is `/en/search?q=<query>`, which finds fewer than the category pages.
  Delivery to Estonia is free with duties included, it checks authenticity itself (a third-party
  certificate costs €40 more), and a return costs €20.
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
- **Farfetch (farfetch.com):** new items from boutiques; the bookmark opens the men's section. It
  refuses scripts outside the browser.
- **Relove (relove.fi):** the online store is about 50 products, mostly bags, at
  `/category/2/online-store`; search with `/search?q=<query>`.
- **ReSee (resee.com):** filter a designer page with
  `?refinementList[sub_categories_flat_en][0]=Accessories > Belts` (or the category you need). A
  location dialog can cover the photos; read the description text for color instead.
- **YOOX (yoox.com):** a text-search parameter is dropped, so use the category with the Designer
  filter (men's HUGO belts add `brand[0]=HUGO BOSS-202 > HUGO-22874`). Cards show no color; the
  item page title does, as in "HUGO Black Men's Leather Belt".
