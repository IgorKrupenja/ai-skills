# eBay.de (ebay.de)

Scan it first:

```bash
bun <skill dir>/scripts/scan.ts ebay --tag <tag> --query "louis vuitton marelle" --query "louis vuitton marellini" --match marel --out <run dir>/scan/ebay.json
```

It reads the search cards for each query (Buy It Now only, up to the count in the results
heading, auctions left out) and prints a line per card: id, price, condition, ships from, title
and the model code in it. Many cards carry the brand's model code (six in ten of the Louis
Vuitton cards in November 2026): save each code as a whole, then classify the rest from their
titles and save in batches. For the
cards a line can't settle, read their item pages with `--ids <id>,...`: the condition grade, item
specifics (material, colour, measurements), where it ships from and returns. eBay answers 403
after about 15 item pages, whether 1.5 or 4 seconds apart, and lifts the block within about ten
minutes, so the scan and `photos.ts` share a budget of 14 item pages in 12 minutes, counted across
runs: past it, the scan lists the ids it left and the time they can be read. Read item pages for
a handful of cards and settle the rest from their photos (`scripts/sheet.ts`). Without the scan,
search the site as below.

Search `/sch/i.html?_nkw=<query>&LH_BIN=1&_ipg=240`, which keeps Sofort-Kaufen (Buy It Now)
listings only, 240 a page, and page with `&_pgn=2` and so on. The heading "<N> Ergebnisse für
<query>" gives the real count: results past it, under "Ergebnisse für weniger Suchbegriffe", match
only some of the words, so skip them, and when eBay corrects a spelling ("passotti" to "pasotti")
the heading names the corrected query. The user doesn't want auctions, so also leave out any
listing that takes bids ("Gebot"). Results are `ul.srp-results > li.s-card` cards; skip the "Shop
on eBay" ad cards (item id 123456). A card shows the condition, a "Gewerblich" (business) or
"Privat" seller, the EUR price, "oder Preisvorschlag" (best offer), shipping, "aus <Land>" when it
ships from abroad (no such line means Germany), and "Mit Echtheitsprüfung" when eBay checks the
bag's authenticity before delivery: report that as authentication included. Give the card's
`i.ebayimg.com` image as the photo: `scripts/photos.ts` opens eBay item pages only in the browser,
and eBay blocks a burst of them. It looks up the few cards that show eBay's stock image
(`stockimage1.jpg`, before they scroll into view) on their item pages. Titles
often carry LV's model code (such as M80689), which names the model and colour more reliably than
the words around it.

A popular model can have hundreds of cards (Marelle had 414 in November 2026). Classify them from
the card and save them with `listings.ts add` in batches of 20 to 50 as you go, with a note that
they were checked from the card only, before spending time on photos or item pages: an agent that
collected all 414 first and meant to save at the end was stopped with nothing saved.

eBay blocks a burst of traffic: after a run of quick page loads it answers 403 ("Error Page") to
the signed-in browser, and `curl` or Bun's `fetch` from outside the browser always gets 403. While
the browser is blocked, `fetch(url, { credentials: 'omit' })` from an ebay.de tab, read with
`DOMParser`, still loads pages until another burst blocks that too, and the block lifts within
about ten minutes. So read the search cards first, which give everything but the exact condition
grade, the town and returns, then open item pages only for a shortlist (used, cheap or unclear
listings), one at a time with a second's pause between them, and report the rest as from the
search card. On the item page, the condition is the "Artikelzustand" grade (such as "Gebraucht -
Sehr gut"), ships from is the "Standort:" line under "Versand, Rückgabe & Zahlung", and
"Rücknahme" says whether returns are taken (private sellers often take none). A seller abroad may
price in another currency, shown as "ca. EUR": give the original amount too. eBay has more fakes
than the curated shops, so apply the authenticity risk rules strictly, above all to cheap listings
from private sellers with few ratings.
