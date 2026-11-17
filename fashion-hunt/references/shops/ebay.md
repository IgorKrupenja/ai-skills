# eBay.de (ebay.de)

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
`i.ebayimg.com` image as the photo, since `scripts/photos.ts` can't open eBay item pages.

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
