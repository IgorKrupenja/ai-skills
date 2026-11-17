#!/usr/bin/env bun
/**
 * Build the fashion-hunt report page from a run file: one self-contained HTML page with every
 * listing, a tab for the matches, one per kind of near match and one with all of them, a filter
 * pill per column (shop, condition, size or a bag's width, price, new price, the difference from it
 * and ships from) with counts and ranges, listings at or above the brand's new price and repeats of
 * one photo hidden at first, and a table that sorts by its shop, condition, size, price, new price,
 * difference and ships-from columns. The page is a React app in ../page. USAGE below lists the
 * fields.
 */

import { parseArgs } from "node:util";
import type { Dims, Report } from "../page/types.ts";
import { countryCode, countryName, isCountry, outsideEU } from "./common.ts";

const USAGE = `Build the fashion-hunt report page from a run file.

    report.ts [--inline] <run.json> <page.html>

--inline puts each photo into the page itself, so the page publishes as one file: use it when a
run has more photos than one publish takes (255 files). The photos go in as photos.ts saved
them when they fit in the Artifact's 16 MB page; otherwise as smaller AVIF copies, made with
macOS's sips, only as much smaller as they need to be.

The run file is the one scripts/history.ts takes, with more fields for the page. Each listing
has url, shop, item, price_eur and kind as history.ts describes, plus any of:

    group           its tab: an id from page.groups ("match" for matches and "near" for the
                    rest when page.groups is left out)
    condition       the shop's own label. The page puts the usual Vinted, Vestiaire, Yaga, eBay.de,
                    JoliCloset, Care of Carl and Collector's Cage labels, French ones and its own
                    names on one scale (new with tags, new, like new, very good, good, fair, and
                    used for eBay's ungraded "Gebraucht"), shows only the scale's name, in its
                    language, with the shop's label on hover, and filters by it. A note in
                    brackets doesn't count, so put any other label on the scale yourself as its
                    name with the shop's words in brackets, such as "Fair (Correct condition)":
                    the build lists the labels it can't place, which show as other
    size            as listed; the size filter works out buckets from it (XS to XL+ from letter,
                    FR, IT, UK and US sizes, or a bare number such as a belt's 90), and sizes,
                    such as ["M"], overrides them. A bag's measurements, such as "Width 40 cm,
                    Height 30 cm", "40 x 31 x 6 cm" or "Ш24 × В12 × Г3 см", show in one format,
                    longest side first, since sellers swap width and height, and the size filter
                    goes by that width: as a range, or by the named sizes in page.sizes
    price_note      shown under the price, such as "approx., from 950 PLN"
    ships_from      a country, "not stated" or "in store, <city>". The page names a country in
                    its own language whatever language it's given in, bolds one outside the EU and
                    hides it with the EU filter; non_eu: true does the same for a ships_from that
                    names no country, and the script lists those it can't place
    new_price_eur, new_url, new_note
                    the brand's closest new item, and how it differs ("no fur"), or only a
                    new_note such as "not currently listed by manufacturer"
    risk            why its authenticity is in doubt: the listing gets a warning, and the risk
                    filter hides it
    change          from the history, such as "new since 2026-11-15" or "price cut from €420"
    note            anything else worth knowing about the listing
    variant         such as "Damier Ebene": the page draws a card per variant with its count,
                    lowest and median price, and clicking cards filters the table to those
                    variants, one or several at once
    image           a photo of the listing, as a path published next to the page such as
                    "img/123.jpg": the page shows it as a thumbnail that opens the listing.
                    Listings whose photos are the same file get a note linking each other (often
                    one item listed by several shops), a filter (on by default) that shows only
                    the cheapest of them, and a risk when they ship from different countries

and the run has one page object:

    {"lang": "ru", "title": "...", "eyebrow": "...", "lede": "...", "hero": "...",
     "new_label": "...", "css": "...", "fonts": "https://fonts.googleapis.com/css2?family=...",
     "variants": [{"name": "Damier Ebene", "swatch": "<svg ...>", "hint": "..."}],
     "sizes": [{"name": "PM", "width": [35, 38]}, {"name": "GM", "width": [39, 43]}],
     "facts": [{"title": "...", "html": "..."}],
     "groups": [{"id": "match", "label": "...", "hint": "..."}],
     "notes": [{"title": "...", "html": "..."}],
     "unverified": {"title": "...", "hint": "...", "items": [{"url": "...", "label": "..."}]}}

All of it is optional: title falls back to the request. lang is "en" (the default) or "ru" and
sets the language of the page's controls; write the rest in the same language. new_label renames
the new-price column. eyebrow is a short line above the title. css comes after the page's
own styles, so it can set the color and font tokens (--bg, --surface, --fg, --muted, --line,
--accent, --accent-soft, --link, --warn, --warn-soft, --chip, --display, --body) for light and
dark and restyle anything else; fonts is the Google Fonts stylesheet it needs. variants orders
the variant cards and gives each a swatch and a hint. sizes is a bag model's size chart, each
size with the widths in cm that count as it: the size filter then offers those sizes, a size
named in a listing's size or its width placing it, and "other" and "not stated" for the rest.
lede, hero, the swatches, the facts and
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
  image?: unknown;
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
  sizes?: { name: string; width: [number, number] }[];
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

/** The condition labels of Vinted (in Estonian and English), Vestiaire Collective, Yaga, eBay.de, JoliCloset, French shops and others, on one scale. */
const CONDITIONS: Record<string, string> = {
  "uus koos hinnasildiga": "newTags", "new with tags": "newTags", "new with tag": "newTags", "never worn, with tag": "newTags",
  "uus ilma hinnasildita": "new", "new without tags": "new", "never worn": "new", "uus": "new", new: "new",
  "like new": "likeNew", "nagu uus": "likeNew",
  "väga hea": "veryGood", "very good": "veryGood", "very good condition": "veryGood",
  hea: "good", good: "good", "good condition": "good",
  rahuldav: "fair", satisfactory: "fair", fair: "fair", "fair condition": "fair",
  // Pre-owned shops such as Care of Carl and Collector's Cage
  excellent: "likeNew", "excellent condition": "likeNew", pristine: "likeNew", "very nice": "veryGood",
  // eBay.de's grades, and the bare "Gebraucht" its search cards show, which has no grade
  "neu mit etikett": "newTags", "neu ohne etikett": "new", neu: "new", neuwertig: "likeNew",
  "gebraucht - hervorragend": "likeNew", "gebraucht - sehr gut": "veryGood", "gebraucht - gut": "good",
  "gebraucht - akzeptabel": "fair", gebraucht: "used",
  hervorragend: "likeNew", "sehr gut": "veryGood", gut: "good", akzeptabel: "fair",
  // French labels, and JoliCloset's English ones ("Correct condition" is état correct)
  "neuf avec étiquette": "newTags", "neuf avec étiquettes": "newTags", neuf: "new", "jamais porté": "new",
  "excellent état": "likeNew", "très bon état": "veryGood", "bon état": "good", "état correct": "fair",
  "correct condition": "fair", correct: "fair",
  "never worn with tags": "newTags", "never worn no tags": "new", "never worn without tags": "new",
  // Used with no grade
  used: "used", "pre-owned": "used",
  // The page's own Russian names, for labels already translated
  "новое с биркой": "newTags", "новое": "new", "как новое": "likeNew", "очень хорошее": "veryGood", "хорошее": "good",
  "удовлетворительное": "fair", "б/у": "used", "б/у, без оценки": "used",
};
/** The scale from best to worst, then used with no grade, labels it doesn't know and listings without one. */
const CONDITION_ORDER = ["newTags", "new", "likeNew", "veryGood", "good", "fair", "used", "other", "none"];
const CONDITION_NAMES: Record<"en" | "ru", Record<string, string>> = {
  en: { newTags: "New with tags", new: "New", likeNew: "Like new", veryGood: "Very good", good: "Good", fair: "Fair", used: "Used", other: "Other", none: "Not stated" },
  ru: { newTags: "Новое с биркой", new: "Новое", likeNew: "Как новое", veryGood: "Очень хорошее", good: "Хорошее", fair: "Удовлетворительное", used: "Б/у", other: "Другое", none: "Не указано" },
};

/**
 * A shop's condition label on the scale: the key the condition filter uses, and the scale's name
 * for it in the page's language. The page shows only that name, so the column never mixes
 * languages, and the shop's own label on hover. A note in brackets and eBay's explanation after a
 * colon ("Gebraucht - Gut: Dieser Artikel ...") don't count. A label the scale doesn't know is other.
 */
function condition(label: string, lang: "en" | "ru"): { key: string; text: string } {
  const head = label.split(/[(:]/)[0]!.trim().toLowerCase().replace(/\s*[-\u2013\u2014]\s*/g, " - ").replace(/\s+/g, " ");
  const key = CONDITIONS[head] ?? (label.trim() ? "other" : "none");
  return { key, text: key === "none" ? "" : (CONDITION_NAMES[lang][key] ?? label) };
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

/** The numbers in a bag's measurements, if the text gives two or three of them in cm or as A x B */
function dimensions(text: string): Dims | null {
  const lower = text.toLowerCase();
  // A range such as a belt's "85-90 cm" isn't a bag
  if (/\d\s*[-\u2013]\s*\d/.test(lower) || !/cm|см|\d\s*[x×х]\s*[a-zа-я]?\s*\d|\b(width|height|depth)\b/.test(lower)) return null;
  const numbers = [...lower.matchAll(/\d+(?:[.,]\d+)?/g)].map(match => Number(match[0].replace(",", ".")));
  if (numbers.length < 2 || numbers.length > 3) return null;
  const [w, h = null, d = null] = numbers.sort((a, b) => b - a);
  return { w: w!, h, d };
}

/**
 * A bag's measurements from its listed size, such as "Width 40 cm, Height 30 cm", "40 x 31 x 6 cm
 * (W x H x D)" or "Ш24 × В12 × Г3 см", longest side first: sellers swap width and height, so the
 * longest side counts as the width. A note in brackets or after ";" only counts when the size
 * itself has no measurements, as in "Medium (30 x 20 cm)". Null for anything else, such as a
 * clothes size or a belt's 90.
 */
function measurements(size: string): Dims | null {
  const head = size.split(";")[0]!;
  return dimensions(head.split("(")[0]!) ?? dimensions(head);
}

/** Letter sizes in order, then numbers from small to large, then anything else. */
function sizeOrder(buckets: Set<string>): string[] {
  const letters = LETTERS.filter(bucket => buckets.has(bucket));
  const rest = [...buckets].filter(bucket => !LETTERS.includes(bucket));
  const numbers = rest.filter(bucket => /^\d+$/.test(bucket)).sort((a, b) => Number(a) - Number(b));
  const others = rest.filter(bucket => !/^\d+$/.test(bucket)).sort();
  return [...letters, ...numbers, ...others];
}

/** The Artifact tool's limit for a page, embedded photos included, less a margin. */
const PAGE_LIMIT = 15_500_000;
/** The AVIF copies --inline tries when the photos as saved don't fit, best first. */
const SMALLER: { quality: number; width?: number }[] = [{ quality: 70 }, { quality: 55 }, { quality: 55, width: 240 }, { quality: 45, width: 180 }];
const MIME: Record<string, string> = { webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", avif: "image/avif", gif: "image/gif" };

const dataUri = (type: string, bytes: Uint8Array) => `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
const totalLength = (uris: Map<string, string>) => [...uris.values()].reduce((sum, uri) => sum + uri.length, 0);

/**
 * Each photo as a data URI, for a page that carries its photos itself: as photos.ts saved them
 * when they fit in room bytes, or else as AVIF copies, smaller each step until they fit.
 */
async function inlinePhotos(paths: string[], folder: string, room: number): Promise<{ uris: Map<string, string>; how: string }> {
  const saved = new Map<string, string>();
  for (const path of paths) {
    const file = Bun.file(`${folder}/${path}`);
    const type = MIME[path.split(".").pop()!.toLowerCase()];
    if (type && (await file.exists())) saved.set(path, dataUri(type, await file.bytes()));
    else console.warn(`no photo file ${path}, so the page shows none for it`);
  }
  if (totalLength(saved) <= room || !Bun.which("sips")) return { uris: saved, how: "as saved" };
  const tmp = `${(Bun.env.TMPDIR ?? "/tmp").replace(/\/$/, "")}/fashion-hunt-inline-${process.pid}`;
  let result = { uris: saved, how: "as saved" };
  try {
    for (const { quality, width } of SMALLER) {
      const uris = new Map<string, string>();
      const todo = [...saved.keys()];
      let next = 0;
      async function worker() {
        while (next < todo.length) {
          const path = todo[next++]!;
          const copy = `${tmp}/${Bun.hash(path).toString(36)}-${quality}-${width ?? 0}.avif`;
          const resize = width ? ["-Z", String(width)] : [];
          const done = await Bun.$`mkdir -p ${tmp} && sips -s format avif -s formatOptions ${quality} ${resize} ${`${folder}/${path}`} --out ${copy}`.quiet().nothrow();
          uris.set(path, done.exitCode === 0 ? dataUri("image/avif", await Bun.file(copy).bytes()) : saved.get(path)!);
        }
      }
      await Promise.all(Array.from({ length: 8 }, worker));
      result = { uris, how: `AVIF at quality ${quality}${width ? `, ${width} px` : ""}` };
      if (totalLength(uris) <= room) break;
    }
  } finally {
    await Bun.$`rm -rf ${tmp}`.quiet().nothrow();
  }
  return result;
}

/**
 * The page's source: index.html around the styles in style.css and a React app from main.tsx,
 * which pageScript() bundles, React included, into one script that the page carries itself.
 */
const PAGE = `${import.meta.dir}/../page`;

async function pageScript(): Promise<string> {
  const build = await Bun.build({
    entrypoints: [`${PAGE}/main.tsx`],
    target: "browser",
    format: "iife",
    minify: true,
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  });
  const [script] = build.outputs;
  if (!build.success || !script) die(`the page's script didn't build:\n${build.logs.join("\n")}`);
  // A script can't hold "</script", so it becomes "<\/script", which means the same in a string or a regex
  return (await script.text()).replace(/<\/script/gi, "<\\/script");
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals: args } = parseArgs({ args: argv, options: { inline: { type: "boolean" } }, allowPositionals: true });
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

  // A country in the page's language, whatever language the agent gave it in; other text as given
  const unplaced = new Map<string, number>();
  const ships = (from: string) => {
    if (!from) return ru ? "не указано" : "not stated";
    const code = countryCode(from);
    if (!code && !/^(not stated|не указано|unknown|in store\b)/i.test(from)) unplaced.set(from, (unplaced.get(from) ?? 0) + 1);
    return code && isCountry(from) ? countryName(code, lang) : from;
  };
  if (!Array.isArray(run.listings)) die("the run needs a 'listings' list");
  const seen = new Set<string>();
  // Condition labels the scale doesn't know, with their shops, for a warning after the build
  const offScale = new Map<string, number>();
  const rows = (run.listings as Listing[]).map((listing, index) => {
    if (typeof listing?.url !== "string" || !listing.url || (listing.kind !== "match" && listing.kind !== "near")) {
      die(`listing ${index + 1} needs a url and kind 'match' or 'near': ${JSON.stringify(listing)}`);
    }
    if (seen.has(listing.url)) console.warn(`listed twice: ${listing.url}`);
    seen.add(listing.url);
    const group = text(listing.group) || (listing.kind === "match" ? "match" : "near");
    if (!groupIds.has(group)) die(`listing ${index + 1} is in group '${group}', which page.groups doesn't have`);
    const state = condition(text(listing.condition), lang);
    const shop = text(listing.shop) || new URL(listing.url).hostname.replace(/^www\./, "");
    const offKey = `${shop} "${text(listing.condition)}"`;
    if (state.key === "other") offScale.set(offKey, (offScale.get(offKey) ?? 0) + 1);
    return {
      url: listing.url,
      shop,
      item: text(listing.item),
      condition: state.text,
      shopCondition: text(listing.condition),
      cond: state.key,
      size: text(listing.size),
      // Worked out below, once it's clear whether the run is of bags
      sizes: [] as string[],
      dims: measurements(text(listing.size)),
      price: price(listing.price_eur),
      priceNote: text(listing.price_note),
      ships: ships(text(listing.ships_from)),
      nonEU: outsideEU(listing.ships_from, listing.non_eu),
      newPrice: price(listing.new_price_eur),
      newUrl: text(listing.new_url),
      newNote: text(listing.new_note),
      risk: text(listing.risk),
      change: text(listing.change),
      note: text(listing.note),
      variant: text(listing.variant),
      image: text(listing.image),
      same: [] as { url: string; shop: string; price: number | null }[],
      // The same number on listings that share a photo, for the filter that hides repeats
      dup: 0,
      group,
    };
  });

  // The size filter. Bags give measurements: with the model's size chart (page.sizes) each goes
  // under a named size, by a name in its size or by its width, and without one the page filters
  // them by width. Anything else goes in letter or number buckets, unless the listing gives its own
  const listings = run.listings as Listing[];
  const chart = (Array.isArray(page.sizes) ? page.sizes : [])
    .filter(size => typeof size?.name === "string" && size.name !== "" && Array.isArray(size.width) && size.width.length === 2 && size.width.every(n => typeof n === "number"))
    .sort((a, b) => a.width[0] - b.width[0]);
  // An empty list of sizes only keeps that listing out of the buckets
  const explicit = listings.some(listing => Array.isArray(listing.sizes) && listing.sizes.length > 0);
  const measured = rows.filter(row => row.dims).length;
  const sizeMode = !chart.length && !explicit && measured > 0 && measured >= rows.filter(row => row.size).length / 2 ? "width" : "buckets";
  const named = (row: (typeof rows)[number]) => {
    const word = (name: string) => new RegExp(`(^|[^\\p{L}])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "iu");
    // Only a name with a letter in it, since a number such as Speedy's 30 can be any measurement
    const byName = chart.find(size => /\p{L}/u.test(size.name) && word(size.name).test(row.size));
    if (byName) return byName.name;
    if (row.dims) return chart.find(size => row.dims!.w >= size.width[0] && row.dims!.w <= size.width[1])?.name ?? "other";
    return row.size ? "other" : "none";
  };
  for (const [index, row] of rows.entries()) {
    const own = listings[index]!.sizes;
    if (Array.isArray(own) && own.length) row.sizes = own.filter(size => typeof size === "string");
    else if (chart.length) row.sizes = [named(row)];
    else if (sizeMode === "buckets" && !Array.isArray(own)) row.sizes = sizeBuckets(row.size);
  }
  const presentSizes = new Set(rows.flatMap(row => row.sizes));
  const chartNames = chart.map(size => size.name);
  const sizeIds = chart.length
    ? [...chartNames, ...sizeOrder(new Set([...presentSizes].filter(id => !chartNames.includes(id) && id !== "other" && id !== "none"))), "other", "none"].filter(id => presentSizes.has(id))
    : sizeOrder(presentSizes);
  const sizeLabels: Record<string, string> = {};
  for (const { name, width: [from, to] } of chart) sizeLabels[name] = `${name}, ${ru ? `от ${from} до ${to} см` : `${from} to ${to} cm`}`;
  if (chart.length) Object.assign(sizeLabels, ru ? { other: "Другой размер", none: "Не указан" } : { other: "Other size", none: "Not stated" });

  // Listings whose photos are the same file, often one item listed by several shops or a seller
  // using someone else's photos: each links the others, and a group shipping from different
  // countries gets a risk
  const folder = source.includes("/") ? source.replace(/\/[^/]*$/, "") : ".";
  const byPhoto = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.image) continue;
    const file = Bun.file(`${folder}/${row.image}`);
    const photo = row.image.startsWith("data:") ? row.image : (await file.exists()) ? await file.bytes() : null;
    if (!photo) continue;
    const hash = Bun.hash(photo).toString(36);
    byPhoto.set(hash, [...(byPhoto.get(hash) ?? []), row]);
  }
  const shared = [...byPhoto.values()].filter(group => group.length > 1);
  for (const [index, group] of shared.entries()) {
    for (const row of group) row.dup = index + 1;
    const countries = new Set(group.map(row => countryCode(row.ships)).filter(Boolean));
    for (const row of group) {
      row.same = group.filter(other => other !== row).map(({ url, shop, price }) => ({ url, shop, price }));
      if (countries.size > 1 && !row.risk) row.risk = ru ? "то же фото у объявлений из разных стран" : "the same photo is on listings shipping from different countries";
    }
  }

  const data: Report = {
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
    sizeOrder: sizeIds,
    sizeMode,
    sizeLabels,
    conditionOrder: CONDITION_ORDER.filter(key => rows.some(row => row.cond === key)),
    conditionNames: CONDITION_NAMES[lang],
  };
  const [shell, style, script] = await Promise.all([Bun.file(`${PAGE}/index.html`).text(), Bun.file(`${PAGE}/style.css`).text(), pageScript()]);
  const fontLink = fonts ? `<link rel="stylesheet" href="${escapeHtml(fonts)}">` : "";
  // In one pass, so nothing put in the page is read again as a placeholder
  const render = () => {
    const parts: Record<string, string> = {
      TITLE: escapeHtml(title),
      FONTS: fontLink,
      STYLE: style,
      THEME: css,
      // "<" escaped, so no listing text can close the script tag
      REPORT: JSON.stringify(data).replace(/</g, "\\u003c"),
      SCRIPT: script,
    };
    return shell.replace(/\{\{(\w+)\}\}/g, (placeholder, name: string) => parts[name] ?? placeholder);
  };

  if (values.inline) {
    const paths = [...new Set(rows.map(row => row.image).filter(image => image && !image.startsWith("data:")))];
    const room = PAGE_LIMIT - Buffer.byteLength(render());
    const { uris, how } = await inlinePhotos(paths, folder, room);
    for (const row of rows) if (uris.has(row.image)) row.image = uris.get(row.image)!;
    console.log(`inlined ${uris.size} photos ${how}, ${(totalLength(uris) / 1e6).toFixed(1)} MB`);
  }
  const html = render();
  await Bun.write(out, html);
  const size = Buffer.byteLength(html);
  if (size > 16_000_000) console.warn(`the page is ${(size / 1e6).toFixed(1)} MB, more than an Artifact takes (16 MB)`);

  if (shared.length) console.log(`same photo: ${shared.flat().length} listings in ${shared.length} groups, marked on the page`);
  if (unplaced.size) {
    console.warn(`ships_from names no country, so the EU filter keeps these unless non_eu is set: ${[...unplaced].map(([from, n]) => `"${from}" (${n})`).join(", ")}`);
  }
  if (offScale.size) {
    console.warn(`conditions off the scale, shown as ${CONDITION_NAMES[lang].other}: ${[...offScale].map(([label, n]) => `${label} (${n})`).join(", ")}. Give each the scale's name with the shop's words in brackets, such as "Fair (Correct condition)"`);
  }

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
  if (sizeMode === "width") console.log(`sizes: by width, from the measurements of ${measured} of ${rows.length} listings`);
  else if (sizeIds.length) {
    const counts = sizeIds.map(id => `${id} ${rows.filter(row => row.sizes.includes(id)).length}`);
    console.log(`sizes: ${counts.join(", ")}`);
  }
  console.log(`wrote ${out}`);
  return 0;
}

process.exit(await main(Bun.argv.slice(2)));
