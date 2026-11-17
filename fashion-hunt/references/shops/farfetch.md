# Farfetch (farfetch.com)

New items from boutiques, plus pre-owned ones from resellers: Louis Vuitton only as the designer
"Louis Vuitton Pre-Owned" (about 2,000 items in November 2026), most of it in the women's
section, though the bookmark opens the men's. Scan it first:

```bash
bun <skill dir>/scripts/scan.ts farfetch --tag <tag> --brand "Louis Vuitton" --query marelle --query marellini --match marel --out <run dir>/scan/farfetch.json
```

It reads the results of each text search in the women's and men's sections from the item list
each page embeds (96 a page, complete where the scrolled page isn't), with the brand's name added
to the query, as the search is loose ("porte documents voyage" alone gave about 2,000 items of
every brand over 21 pages; with "Louis Vuitton" in front, the same 160 came from 7). Results are
sorted by relevance, so it stops at the first page with nothing of the brand that `--match` takes.
It keeps the brand's items in stock, then reads the first 6 candidates' product pages: colour (the
description's first word, such as "white"), composition ("Calf Leather" for Epi, canvas for
Monogram), measurements and condition ("Condition: GOOD" in the description). Width tells a
Marelle (about 25 cm) from a Marellini (about 19 cm).

The rest have only the list's title and price, as Farfetch answers a burst of requests with 429,
also to the browser and to its photo server: in November 2026 it took about 7 product pages in a
row, then about one every 45 seconds, and lifted a block within about 15 minutes (once it lasted
an hour). So judge what the titles settle, and open the product pages of the rest yourself, about
45 seconds apart: a second round read 13 pages 8 to 50 seconds apart without a block. Search by
model name rather than the designer listing, which runs to 20 pages and more. Photos stop at the
first 429 too, so fetch them again once a block lifts.

Prices are in euros with import duties included, and returns are free for 30 days. There's no
ships-from field: the seller's address is only in the "Seller details" dialog (a Dubai reseller
in November 2026). Authenticity isn't stated on the product page. It refuses scripts outside the
browser.
