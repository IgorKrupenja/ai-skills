# Vestiaire Collective (vestiairecollective.com)

Scan it first: one command reads every unsold listing of the designer, with the model filter or a
text query, and checks each with the product API, in seconds (257 Marelle and Marellini listings
took 4 seconds, and the text passes another 2):

```bash
bun <skill dir>/scripts/scan.ts vestiaire --tag <tag> --brand "Louis Vuitton" --model Marelle --model Marellini --match marel --out <run dir>/scan/vestiaire.json
```

- `--brand` is the designer as Vestiaire names it. Boss, Hugo Boss and Boss Orange are separate
  designers, so scan each.
- `--model` is the model filter, found by name; a name can stand for several models (Marelle has
  two ids), and the scan takes them all. It also runs the shop's text search for each model name
  and merges the results, since sellers often set no model (titling the bag just "Leather
  handbag") or a variant name such as "Marelle Vintage": in November 2026 that found 96 listings
  the model filter missed. Add `--match` (a regex on title, model and description, such as
  `marel`) to drop what the text search adds by mistake.
- The scan includes the designer's collaborations, which Vestiaire files as designers of their
  own ("Louis Vuitton x Yayoi Kusama").
- Without a model, add `--query` (the shop's text search) or `--match`.
- `--filters` adds filters as JSON: `color.id` (White 1, Beige 2, Red 6, Brown 8, Blue 9, Black 14,
  Multicolour 17), `universe.id` (Women 1, Men 2), `categoryLvl0.id` (Bags 5 and Accessories 6
  for women, Bags 141 and Accessories 14 for men), `condition.id` (1 never worn with tag, 2 never
  worn, 3 very good, 4 good, 5 fair), `materialLvl0.id` (Leather 3, Cloth 16, Patent leather 14)
  and `country` (an ISO code, such as `GB`).
- A search reads at most 10,000 listings: narrow it with a model or filters when it says so.

The scan keeps only listings for sale now (not sold, not held at checkout, seller not on
vacation), and gives the price in EUR, condition, material, colour, measurements, the country it
ships from (`non_eu` set outside the EU), the photo, the buyer fee and any duties. Material and
colour are the seller's choice from a list: "Leather" on a Marelle is usually Epi, "Cloth" usually
Monogram canvas, but read the title and description (and look at the photo when it's unclear).
Some sellers stuff a description with every model name the brand has, so `--match` and the text
passes also bring trousers, hats and shoes: judge by the title and the category in the URL (such
as `/women-shoes/`), not a model name in a long list.

If the scan fails, use the catalog page: its filters live after `#` in the URL, so open a pasted
catalog URL with its query and fragment intact; confirm the filter chips and result count, then
scroll the whole grid, since cards lazy-load. Show prices in EUR: in the footer's country and
currency dialog, pick the currency before the country (picking a currency resets the country),
then Save. On a listing page the ships-from country is the "Location" line under DETAILS, and
"The seller is on vacation" means it can't be bought now.

A price shown in a currency other than the seller's may include a conversion fee of up to 5%.
