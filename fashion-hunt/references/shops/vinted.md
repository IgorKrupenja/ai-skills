# Vinted (vinted.ee)

No scan: the catalog API (`/api/v2/catalog/items`) is gone since November 2026, and the catalog
page now arrives rendered, so read its cards. `/api/v2/brands?keyword=<name>` still works from a
vinted.ee tab and gives brand ids (Louis Vuitton 417), and a specific search usually has few
results.

Open a pasted filtered URL with its full query string. Repeated parameters such as several
`brand_ids[]` or `color_ids[]` are separate filters, and rebuilding the search from text or a
single-value map drops them. Men's belts are `catalog[]=96`, white is `color_ids[]=12` and cream
`color_ids[]=20`. A brand can have several entries (Hugo Boss has Hugo Boss, BOSS Hugo Boss, HUGO
Hugo Boss, Boss, Boss Orange and BOSS Green), so tick each in the brand filter's search and take the
ids from the URL. Confirm the filter chips and result count, then check every card in the filtered
grid (not sponsored, showcase or recommendation blocks) on its item page: title, photos, price,
size, condition and availability. Color filters let through multicolor and off-color items. Record
the item price apart from the buyer-protection total; shipping is added at checkout. Item pages
have no ships-from field, and a description that says SOLD means sold even while Buy now still
shows. If an item page won't load, report only what the card shows and mark the rest unverified.
