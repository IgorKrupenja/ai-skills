#!/usr/bin/env bun
/**
 * Build the fashion-hunt report page from a run file: one self-contained HTML page with every
 * listing, a tab for the matches, one per kind of near match and one with all of them, filters by
 * size, condition, shop, authenticity risk and EU, and the brand's new prices. USAGE below lists
 * the fields.
 */

const USAGE = `Build the fashion-hunt report page from a run file.

    report.ts <run.json> <page.html>

The run file is the one scripts/history.ts takes, with more fields for the page. Each listing
has url, shop, item, price_eur and kind as history.ts describes, plus any of:

    group           its tab: an id from page.groups ("match" for matches and "near" for the
                    rest when page.groups is left out)
    condition       the shop's own label; the page puts the usual Vinted, Vestiaire, Yaga, Care of
                    Carl and Collector's Cage labels, and its own Russian names, on one scale in
                    its language (new with tags, new, like new, very good, good, fair), filters by
                    it and shows the shop's label on hover. Map any other label onto that scale
                    yourself, or translate it; the condition filter lists it as other
    size            as listed; the size filter works out buckets from it (XS to XL+ from letter,
                    FR, IT, UK and US sizes, or a bare number such as a belt's 90), and sizes,
                    such as ["M"], overrides them
    price_note      shown under the price, such as "approx., from 950 PLN"
    ships_from      a country, "not stated" or "in store, <city>"; non_eu: true bolds it, and
                    the EU filter hides the listing
    new_price_eur, new_url, new_note
                    the brand's closest new item, and how it differs ("no fur"), or only a
                    new_note such as "not currently listed by manufacturer"
    risk            why its authenticity is in doubt: the listing gets a warning, and the risk
                    filter hides it
    change          from the history, such as "new since 2026-11-15" or "price cut from €420"
    note            anything else worth knowing about the listing
    variant         such as "Damier Ebene": the page draws a card per variant with its count,
                    lowest and median price, and a click on a card filters the table to it

and the run has one page object:

    {"lang": "ru", "title": "...", "eyebrow": "...", "lede": "...", "hero": "...",
     "new_label": "...", "css": "...", "fonts": "https://fonts.googleapis.com/css2?family=...",
     "variants": [{"name": "Damier Ebene", "swatch": "<svg ...>", "hint": "..."}],
     "facts": [{"title": "...", "html": "..."}],
     "groups": [{"id": "match", "label": "...", "hint": "..."}],
     "notes": [{"title": "...", "html": "..."}],
     "unverified": {"title": "...", "hint": "...", "items": [{"url": "...", "label": "..."}]}}

All of it is optional: title falls back to the request. lang is "en" (the default) or "ru" and
sets the language of the page's controls; write the rest in the same language. new_label renames
the new-price column. eyebrow is a short line above the title. css comes after the template's
own styles, so it can set the color and font tokens (--bg, --surface, --fg, --muted, --line,
--accent, --accent-soft, --link, --warn, --warn-soft, --chip, --display, --body) for light and
dark and restyle anything else; fonts is the Google Fonts stylesheet it needs. variants orders
the variant cards and gives each a swatch and a hint. lede, hero, the swatches, the facts and
notes html, and the unverified hint are HTML you write; listing fields are plain text and get
escaped.
`;

type Listing = {
  url: string;
  kind: "match" | "near";
  shop?: unknown;
  item?: unknown;
  price_eur?: unknown;
  group?: unknown;
  condition?: unknown;
  size?: unknown;
  sizes?: unknown;
  price_note?: unknown;
  ships_from?: unknown;
  non_eu?: unknown;
  new_price_eur?: unknown;
  new_url?: unknown;
  new_note?: unknown;
  risk?: unknown;
  change?: unknown;
  note?: unknown;
  variant?: unknown;
};
type Group = { id: string; label: string; hint?: string };
type Page = {
  lang?: string;
  title?: string;
  eyebrow?: string;
  lede?: string;
  hero?: string;
  css?: string;
  fonts?: string;
  variants?: { name: string; swatch?: string; hint?: string }[];
  new_label?: string;
  facts?: { title: string; html: string }[];
  groups?: Group[];
  notes?: { title?: string; html: string }[];
  unverified?: { title?: string; hint?: string; items: { url: string; label?: string }[] };
};
type Run = { date?: unknown; request?: unknown; listings?: unknown; page?: Page };

const LETTERS = ["XXS", "XS", "S", "M", "L", "XL+"];
/** The largest number in each sizing system that still counts as XXS, XS, S, M and L; above them is XL+. */
const CHARTS: Record<string, number[]> = {
  FR: [32, 34, 36, 38, 40],
  IT: [36, 38, 40, 42, 44],
  UK: [4, 6, 10, 14, 18],
  US: [0, 2, 6, 10, 14],
};

/** The condition labels of Vinted (in Estonian and English), Vestiaire Collective and Yaga, on one scale. */
const CONDITIONS: Record<string, string> = {
  "uus koos hinnasildiga": "newTags", "new with tags": "newTags", "new with tag": "newTags", "never worn, with tag": "newTags",
  "uus ilma hinnasildita": "new", "new without tags": "new", "never worn": "new", "uus": "new", new: "new",
  "like new": "likeNew", "nagu uus": "likeNew",
  "väga hea": "veryGood", "very good": "veryGood", "very good condition": "veryGood",
  hea: "good", good: "good", "good condition": "good",
  rahuldav: "fair", satisfactory: "fair", fair: "fair", "fair condition": "fair",
  // Pre-owned shops such as Care of Carl and Collector's Cage
  excellent: "likeNew", "excellent condition": "likeNew", pristine: "likeNew", "very nice": "veryGood",
  // The page's own Russian names, for labels already translated
  "новое с биркой": "newTags", "новое": "new", "как новое": "likeNew", "очень хорошее": "veryGood", "хорошее": "good",
  "удовлетворительное": "fair",
};
/** The scale from best to worst, then labels it doesn't know and listings without one. */
const CONDITION_ORDER = ["newTags", "new", "likeNew", "veryGood", "good", "fair", "other", "none"];
const CONDITION_NAMES: Record<"en" | "ru", Record<string, string>> = {
  en: { newTags: "New with tags", new: "New", likeNew: "Like new", veryGood: "Very good", good: "Good", fair: "Fair", other: "Other", none: "Not stated" },
  ru: { newTags: "Новое с биркой", new: "Новое", likeNew: "Как новое", veryGood: "Очень хорошее", good: "Хорошее", fair: "Удовлетворительное", other: "Другое", none: "Не указано" },
};

/**
 * A shop's condition label on the scale: the key the condition filter uses, and the label in the
 * page's language with any note in brackets kept. A label the scale doesn't know stays as it is.
 */
function condition(label: string, lang: "en" | "ru"): { key: string; text: string } {
  const [, head = "", rest = ""] = label.match(/^([^(]*?)\s*(\(.*)?$/) ?? [];
  const key = CONDITIONS[head.trim().toLowerCase()];
  if (key) return { key, text: [CONDITION_NAMES[lang][key], rest].filter(Boolean).join(" ") };
  return { key: label.trim() ? "other" : "none", text: label };
}

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

const text = (value: unknown) => (typeof value === "string" ? value : "");
const price = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** The size filter's buckets for a listed size, such as "S/36 (fits like M)", "34 FR" or "90". */
function sizeBuckets(size: string): string[] {
  const head = size.toUpperCase().split("(")[0]!;
  const letters = new Set<string>();
  for (const [, letter] of head.matchAll(/\b(XXXS|XXS|2XS|XS|S|M|L|XL|XXL|2XL|XXXL|3XL|4XL)\b/g)) {
    letters.add(["XXXS", "XXS", "2XS"].includes(letter!) ? "XXS" : letter!.endsWith("XL") ? "XL+" : letter!);
  }
  if (letters.size) return LETTERS.filter(bucket => letters.has(bucket));
  const system = head.match(/\b(\d{1,2})\s*(FR|IT|UK|US)\b/) ?? head.match(/\b(FR|IT|UK|US)\s*(\d{1,2})\b/);
  if (system) {
    const [number, name] = /^\d/.test(system[1]!) ? [system[1]!, system[2]!] : [system[2]!, system[1]!];
    const limits = CHARTS[name]!;
    const index = limits.findIndex(limit => Number(number) <= limit);
    return [LETTERS[index === -1 ? 5 : index]!];
  }
  const number = head.match(/\b\d{2,3}\b/);
  return number ? [number[0]] : [];
}

/** Letter sizes in order, then numbers from small to large, then anything else. */
function sizeOrder(buckets: Set<string>): string[] {
  const letters = LETTERS.filter(bucket => buckets.has(bucket));
  const rest = [...buckets].filter(bucket => !LETTERS.includes(bucket));
  const numbers = rest.filter(bucket => /^\d+$/.test(bucket)).sort((a, b) => Number(a) - Number(b));
  const others = rest.filter(bucket => !/^\d+$/.test(bucket)).sort();
  return [...letters, ...numbers, ...others];
}

async function main(args: string[]): Promise<number> {
  const [source, out] = args;
  if (args.length !== 2 || !source || !out) {
    console.log(USAGE);
    return 2;
  }
  const run: Run = await Bun.file(source).json();
  const page = run.page ?? {};
  const ru = page.lang === "ru";
  const lang = ru ? "ru" : "en";
  const title = page.title || text(run.request) || "Fashion hunt";

  const groups: Group[] = page.groups?.length
    ? page.groups
    : [
        { id: "match", label: ru ? "Подходят" : "Matches" },
        { id: "near", label: ru ? "Близкие" : "Near matches" },
      ];
  const groupIds = new Set(groups.map(group => group.id));
  if (groupIds.size !== groups.length || groups.some(group => !group.id || !group.label)) {
    die("each page group needs a label and an id of its own");
  }
  const css = text(page.css);
  if (/<\/style/i.test(css)) die("page.css can't contain </style");
  const fonts = text(page.fonts);
  if (fonts && !fonts.startsWith("https://fonts.googleapis.com/")) die("page.fonts must be a Google Fonts stylesheet URL");
  const variants = (Array.isArray(page.variants) ? page.variants : [])
    .filter(variant => typeof variant?.name === "string" && variant.name !== "")
    .map(variant => ({ name: variant.name, swatch: text(variant.swatch), hint: text(variant.hint) }));

  if (!Array.isArray(run.listings)) die("the run needs a 'listings' list");
  const seen = new Set<string>();
  const rows = (run.listings as Listing[]).map((listing, index) => {
    if (typeof listing?.url !== "string" || !listing.url || (listing.kind !== "match" && listing.kind !== "near")) {
      die(`listing ${index + 1} needs a url and kind 'match' or 'near': ${JSON.stringify(listing)}`);
    }
    if (seen.has(listing.url)) console.warn(`listed twice: ${listing.url}`);
    seen.add(listing.url);
    const group = text(listing.group) || (listing.kind === "match" ? "match" : "near");
    if (!groupIds.has(group)) die(`listing ${index + 1} is in group '${group}', which page.groups doesn't have`);
    const sizes = Array.isArray(listing.sizes) ? listing.sizes.filter(size => typeof size === "string") : sizeBuckets(text(listing.size));
    const state = condition(text(listing.condition), lang);
    return {
      url: listing.url,
      shop: text(listing.shop) || new URL(listing.url).hostname.replace(/^www\./, ""),
      item: text(listing.item),
      condition: state.text,
      shopCondition: text(listing.condition),
      cond: state.key,
      size: text(listing.size),
      sizes,
      price: price(listing.price_eur),
      priceNote: text(listing.price_note),
      ships: text(listing.ships_from) || (ru ? "не указано" : "not stated"),
      nonEU: listing.non_eu === true,
      newPrice: price(listing.new_price_eur),
      newUrl: text(listing.new_url),
      newNote: text(listing.new_note),
      risk: text(listing.risk),
      change: text(listing.change),
      note: text(listing.note),
      variant: text(listing.variant),
      group,
    };
  });

  const data = {
    lang,
    title,
    eyebrow: text(page.eyebrow),
    lede: page.lede ?? "",
    hero: text(page.hero),
    variants,
    newLabel: page.new_label ?? "",
    facts: page.facts ?? [],
    groups,
    notes: page.notes ?? [],
    unverified: page.unverified?.items?.length ? page.unverified : null,
    rows,
    sizeOrder: sizeOrder(new Set(rows.flatMap(row => row.sizes))),
    conditionOrder: CONDITION_ORDER.filter(key => rows.some(row => row.cond === key)),
    conditionNames: CONDITION_NAMES[lang],
  };
  const template = await Bun.file(`${import.meta.dir}/../assets/report.html`).text();
  // "<" escaped, so no listing text can close the script tag
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  const fontLink = fonts ? `<link rel="stylesheet" href="${escapeHtml(fonts)}">` : "";
  await Bun.write(
    out,
    template
      .replace("{{TITLE}}", () => escapeHtml(title))
      .replace("{{FONTS}}", () => fontLink)
      .replace("/*THEME*/", () => css)
      .replace("/*REPORT*/", () => json),
  );

  for (const group of groups) {
    const prices = rows.filter(row => row.group === group.id).map(row => row.price);
    const known = prices.filter(value => value !== null);
    const range = known.length ? `, €${Math.min(...known)} to €${Math.max(...known)}` : "";
    console.log(`${group.label}: ${prices.length}${range}`);
  }
  const variantCounts = new Map<string, number>();
  for (const row of rows) if (row.variant) variantCounts.set(row.variant, (variantCounts.get(row.variant) ?? 0) + 1);
  if (variantCounts.size) {
    console.log(`variants: ${[...variantCounts].map(([name, count]) => `${name} ${count}`).join(", ")}`);
    const bare = [...variantCounts.keys()].filter(name => !variants.some(variant => variant.name === name && variant.swatch));
    if (bare.length) console.warn(`variants without a swatch: ${bare.join(", ")}`);
  }
  console.log(`wrote ${out}`);
  return 0;
}

process.exit(await main(Bun.argv.slice(2)));
