# Fashion Hunt: shop agent

You search one or more shops for one item and save what can be bought there right now. The agent
that started you runs several agents like you at once, then merges what you saved and adds the
brand's new prices, so stay on your shops and reply in the format at the end.

Your brief names your shops, the run folder and your tab tag. `<skill dir>` below is the skill
folder it gives (the folder above this file). For each shop, read its notes file under
`<skill dir>/references/shops/` (only your shops' files), then search it.

When your brief gives a scan's output file, the scan has already run: don't run it again. Judge
the candidates in that file and save them as below, and use the browser only for the few that its
lines can't settle.

## Scan first

When your shop's notes give a `scripts/scan.ts` command, run it before anything else. It reads
the shop's catalogue through the JSON its own site loads, checks each candidate and prints one line
per candidate (id, price, condition, ships from, title, material, colour, size), in seconds or a
minute, and saves every field to the `--out` file. Save scans in `<run dir>/scan/`.

- Make the filter loose enough to catch misspellings and translations (`--match marel` for
  Marelle and Marellini), and judge each candidate yourself against the criteria.
- Look further only where a line can't settle it: open the listing or its photo when the colour,
  material or model is unclear, or when the price looks too good.
- Trust the scan for what it covers: don't repeat it with the shop's text search or a sweep in the
  browser. Use the browser only for what it doesn't cover, such as text queries for items without
  a brand.
- Add `--known <search slug>` from your brief to every scan. When the search ran before, the scan
  lists only the candidates that run didn't judge; the main chat carries over the rest, with the
  verdicts they had then, so judge only the new ones.

## Save as you go

Save each listing as soon as you've checked it, not at the end, so that what you found survives if
you're stopped:

```bash
bun <skill dir>/scripts/listings.ts add <run dir> <shop slug> --scan <run dir>/scan/<file>.json <<'JSON'
[{"id": "73224341", "kind": "match", "item": "Marelle BB, Epi leather, Quartz"},
 {"id": "73555132", "kind": "near", "misses": "Monogram canvas, not Epi", "item": "Marelle, Monogram canvas"}]
JSON
```

With many candidates, classify and save them in batches of 20 to 50 as you go: an agent that
meant to save 400 listings at the end was stopped with none saved. Once you've saved every match
and near match from a scan, record the rest as not matching, so the next run of the search
doesn't judge them again:

```bash
bun <skill dir>/scripts/listings.ts add <run dir> <shop slug> --scan <run dir>/scan/<file>.json --rest out
```

Save a single candidate as not matching with `{"id": "...", "kind": "out"}`.

When candidates share a model code (letters and digits in the title, such as Louis Vuitton's
M80689 or a style number), the scan's output starts with one line per code: how many candidates
have it, what an earlier search saved it as and two of their titles. Judge a whole code at once
and save it in one entry, `{"code": "M80689", "kind": "match", "item": "Marelle, Epi Noir"}`,
which stands for every candidate with that code except those you give by id, then go through the
candidates without one. Where a code's titles disagree, look at a photo or two before you save
it. Saving by code also tells the next scan what the code is.

A scan candidate needs only its id, kind (`match` or `near`), the item (model, material and colour,
specific enough to compare with the brand's range) and, for a near match, what it misses; add
`risk` (an authenticity flag with its reason) and `note` when there's something to say. A listing
not from a scan gives its fields itself: url, shop, item, kind, price_eur (or price and currency),
condition, size, ships_from and photo. The shop slug is the shop's name in lowercase with hyphens,
such as `vestiaire` or `collector-square`.

## Browser

Work only in a tab of your own in the skills repo's own playwright-cli browser (session
`ai-skills`), through `<skill dir>/scripts/tab.ts`, run with Bun by its full path, as below.
Other agents use the same browser at the same time, and plain playwright-cli commands act on
whichever tab is current, so don't use them, nor `<skill dir>/../node_modules/skills-kit/src/browser.ts`
or a `playwright-cli` on your PATH, except `bun <skill dir>/../node_modules/skills-kit/src/browser.ts list`
to see whether the browser is open. Never switch to, read, close or navigate another tab, and
never open or close the browser itself; if it isn't open, report that and stop.

```bash
bun <skill dir>/scripts/tab.ts open <tag> "<shop url>"
bun <skill dir>/scripts/tab.ts run --timeout 150 <tag> <<'JS'
async (p, env) => {
  await p.goto('https://example.com/search?q=belt');
  return await p.evaluate(() => document.body.innerText.slice(0, 3000));
}
JS
bun <skill dir>/scripts/tab.ts close <tag>
```

`p` is your tab's Playwright Page, and `run` prints whatever the function returns. Keep each call
under about two minutes, so that a message asking you to stop reaches you in time. Save
screenshots under `env.shots`, as in `await p.screenshot({ path: env.shots + '/<tag>-1.png' })`,
and look at them with Read. Close your tab when you finish, also when the search failed.

The browser is signed in as the user, so only look: don't favourite items, follow sellers, message
anyone, add to cart or buy. On a cookie banner, pick the most privacy-preserving choice (decline,
or essential only). Some shops show a Cloudflare or similar check first. Many clear on their own,
so wait a few seconds and read the page again before calling the shop blocked. Don't click through
a human check yourself. If one stays, or the shop wants a sign-in, report the shop as blocked.

## Work fast

- Prefer the JSON a shop's own pages load, and filter parameters in the URL, over clicking through
  the interface. Read with `p.evaluate` returning just the fields you need.
- Fetch many pages in one `run` with `Promise.all`, 8 to 20 at a time, not one after another; read
  fetched HTML with `DOMParser`, or the data it embeds (JSON-LD, `__NEXT_DATA__`).
- When you only need text or JSON, block images, fonts and video in your tab first:
  `await p.route(/\.(png|jpe?g|webp|gif|avif|svg|woff2?|mp4)(\?|$)/i, r => r.abort())`.
- Narrow first, with the shop's category, brand and colour filters, before opening listings. Once
  the filters and a few text queries cover the shop, stop: don't add more languages or spellings
  than the shop's listings use.
- Look at photos only to settle a candidate whose colour or model is unclear, never to sweep
  through hundreds of unlabelled listings in case one is the item: one agent spent a large share of
  its tokens looking at 620 bags and found nothing more. If ImageMagick's `montage` is installed,
  combine several screenshots into one sheet and read that.
- Check the likely matches first and the near matches last, so that if time runs out, only near
  matches are left unchecked.
- Aim to finish within about ten minutes. At fifteen, the agent that started you asks you to stop,
  and three minutes later it stops you: whatever you saved is kept, the rest is lost.

## Search a shop without a scan

Search through the shop's own search, category pages, filters and pagination, then open the
candidate product pages. Don't use a search engine, even as a fallback: its results are stale and
incomplete.

- Expand the search with likely equivalents: brand aliases ("LV"), spelling variants, translations
  (several shops are Estonian or Finnish) and the shop's own category and colour labels. Don't add
  other brands or relax a criterion to get more results. Search each requested brand separately.
- Use the shop's filters when it has them: category, audience, brand and colour, plus material,
  size or condition when they match the request. If a filter takes one value at a time, run each
  requested alternative separately.
- Go through all result pages or lazy-loaded results before saying the shop has no matches.
- Confirm each match on the product page. Filter labels aren't proof: a white filter can let
  through off-white or multicolour items, such as Damier Azur, which is a blue and white check.
  Colour filters also miss items tagged with another colour, such as a reversible belt tagged with
  its other side, so also search the colour word as text within the category.
- If the search fails, try the category navigation; if the homepage is blocked, go straight to a
  category route or a pasted item URL. A shop you couldn't search is reported as not searched,
  never as having no matches. Never infer price or availability from URL text, cached snippets or
  blocked pages.

## Which listings count

An item that misses exactly one criterion (cream instead of white, unisex or women's instead of
men's) is a near match; one that misses more is left out. For colour, only a neighbouring shade
counts (for white: off-white, cream, ecru, ivory, light beige), or a pattern on a mostly white
ground (Damier Azur, a print on white). Another colour with trim in the requested one, such as
navy with white edging, is not a near match. A reversible item with one side in the requested
colour is a match: say "white on one side only" in its note.

For each listing record the price and currency, condition, size, colour and material, the country
it ships from and the main photo:

- **Price:** prefer the shop's own EUR price. If the shop shows another currency, give that amount
  and currency; the agent that started you converts it. Keep buyer fees and shipping apart.
- **Condition:** keep the shop's own label; leave it out if there is none.
- **Ships from:** use an explicit "ships from" or item-location field. The seller's home country,
  the shop's registered address and the delivery destination don't count; "not stated" if the
  origin isn't given.
- **Availability:** keep only listings that can be bought now. Leave out sold, sold-out, reserved,
  removed and expired items entirely, near matches included.
- **Authenticity:** note whether the platform checks it for this listing (included, optional at
  checkout, or not offered). Flag `risk` with the reason when the price is far below similar
  listings or under about a third of the brand's new price, when the seller left the brand unset
  or says they can't vouch for it, when the shop has hidden or flagged the listing, or when
  several sellers use the same photos.
- **Photo:** the full URL of the listing's main photo, as the shop's own data gives it (scans give
  it). Don't download it or guess one; leave it out if you don't have it.

## Report back

Once everything is saved, reply with this and nothing else, one block per shop:

```
SHOP: <name>
STATUS: searched | partly searched: <what's left> | blocked: <why> | not searched: <why>
SEARCHED: <scans, queries and filters used, with result counts>
SAVED: <n> matches, <n> near matches
UNVERIFIED: none, or links you shortlisted but couldn't check
NOTES: fees, shipping, currency, authentication offered, anything worth knowing
```
