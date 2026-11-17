# JoliCloset (jolicloset.com, Paris)

A marketplace of mostly professional sellers in Europe and Japan. Every sold item goes to Paris to
be checked before it ships, so report authentication as included, and ships from as "via Paris"
(item pages don't give the seller's country). Delivery to Estonia is about €15 for a small item and
more for an expensive one; private sellers' items can't be returned.

Scan it first. Its result pages embed the listings as data, 60 a page, and the scan reads them all
in parallel (the 41,000 Louis Vuitton women's bags took about 30 seconds), keeps those whose title
matches, then reads each match's product page for condition, fabric, colours, dimensions and
seller:

```bash
bun <skill dir>/scripts/scan.ts jolicloset --tag <tag> --category designers-women/louis-vuitton/womens-bags --category designers-men/louis-vuitton/mens-bags --match marel --out <run dir>/scan/jolicloset.json
```

- Prefer a designer's category with a loose `--match` over text search: titles misspell models
  ("Epi Marel Tote"), and text search found 66 Marelle listings where the category scan found 75.
  Category paths are the designer page's links, such as `designers-women/<brand>/womens-bags`;
  open the designer page once to find others (accessories, clothing).
- `--query <text>` runs the shop's own search in both the women's and men's sections instead.
