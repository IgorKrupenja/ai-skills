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
import type { Dims, Progress, Report, ShopState } from "../page/types.ts";
import { countryCode, countryName, outsideEU, photoGroups } from "./common.ts";

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
                    goes by that width: under the named sizes in page.sizes, or else in ranges
    price_note      shown under the price, such as "approx., from 950 PLN"
    ships_from      a country, "not stated" or "in store, <city>". The page shows just the country,
                    in its own language whatever language it's given in, with any town on hover, bolds one outside the EU and
                    hides it with the EU filter; non_eu: true does the same for a ships_from that
                    names no country, and the script lists those it can't place
    new_price_eur, new_url, new_note
                    the brand's closest new item, and how it differs ("no fur"), or only a
                    new_note such as "not currently listed by manufacturer"
    risk            why its authenticity is in doubt: the listing gets a warning, and the risk
                    filter hides it
    change          from the history, such as "new since 2026-11-15" or "price cut from €420"
    note            anything else worth knowing about the listing
    variant         such as "Damier Ebene": the page draws a card per variant with the count,
                    lowest and median price of its listings in the open tab under the other
                    filters, and clicking cards filters the table to those variants, one or
                    several at once
    image           a photo of the listing, as a path published next to the page such as
                    "img/123.jpg": the page shows it as a thumbnail that opens the listing.
                    Listings with the same photo, even saved by each shop at another size or
                    quality, get a note linking each other (often one item listed by several
                    shops), a filter (on by default) that shows only
                    the cheapest of them, and a risk when they ship from different countries

and the run has one page object:

    {"lang": "ru", "title": "...", "eyebrow": "...", "lede": "...", "hero": "...",
     "new_label": "...", "css": "...", "fonts": "https://fonts.googleapis.com/css2?family=...",
     "variants": [{"name": "Damier Ebene", "swatch": "<svg ...>", "hint": "..."}],
     "sizes": [{"name": "PM", "width": 36.5}, {"name": "GM", "width": 41}],
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
size with its width in cm as the brand gives it, which counts up to halfway to the next size and
2 cm past the outer ones, or as a [from, to] range: the size filter then offers those sizes, a size
named in a listing's size or its width placing it, and "other" and "not stated" for the rest.
Without it, a run of bags gets ranges of widths instead.
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
  color?: unknown;
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
  sizes?: { name: string; width: number | [number, number] }[];
  new_label?: string;
  facts?: { title: string; html: string }[];
  groups?: Group[];
  notes?: { title?: string; html: string }[];
  unverified?: { title?: string; hint?: string; items: { url: string; label?: string }[] };
  progress?: ProgressPlan;
};
type Run = { date?: unknown; request?: unknown; listings?: unknown; page?: Page };
/**
 * The search's plan while it runs: each shop with the agent searching it (its tab tag), or with a
 * state the scans already settled, and each brand with the agent looking up its new prices. An
 * agent saves status/<agent>.json next to the run file when it's done, and <agent>-2 for its
 * second round.
 */
type ProgressPlan = {
  shops: { name: string; agent?: string; state?: ShopState; note?: string }[];
  brands?: { name: string; agent?: string }[];
};
type AgentStatus = { status?: string; unverified?: number };

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
  // eBay.de's grades in German and English, whose top used grade is no better than very good, and
  // the bare "Gebraucht" of a card whose grade the scan couldn't read
  "neu mit etikett": "newTags", "neu ohne etikett": "new", neu: "new", neuwertig: "likeNew",
  "neu mit mängeln": "likeNew", "neu mit fehlern": "likeNew", "new with defects": "likeNew",
  "gebraucht - hervorragend": "veryGood", "gebraucht - sehr gut": "veryGood", "gebraucht - gut": "good",
  "gebraucht - akzeptabel": "fair", gebraucht: "used",
  hervorragend: "veryGood", "sehr gut": "veryGood", gut: "good", akzeptabel: "fair",
  "used - excellent": "veryGood", "pre-owned - excellent": "veryGood", "used - good": "good", "pre-owned - good": "good",
  "used - fair": "fair", "pre-owned - fair": "fair",
  // French labels, and JoliCloset's English ones ("Correct condition" is état correct)
  "neuf avec étiquette": "newTags", "neuf avec étiquettes": "newTags", neuf: "new", "jamais porté": "new",
  "excellent état": "likeNew", "très bon état": "veryGood", "bon état": "good", "état correct": "fair",
  "correct condition": "fair", correct: "fair",
  "never worn with tags": "newTags", "never worn no tags": "new", "never worn without tags": "new",
  // Used with no grade
  used: "used", "pre-owned": "used",
  // The page's own Russian names, for labels already translated
  "новое с биркой": "newTags", "новое": "new", "как новое": "likeNew", "очень хорошее": "veryGood", "хорошее": "good",
  "удовлетворительное": "fair", "нормик": "fair", "б/у": "used", "б/у, без оценки": "used",
};
/** The scale from best to worst, then used with no grade, labels it doesn't know and listings without one. */
const CONDITION_ORDER = ["newTags", "new", "likeNew", "veryGood", "good", "fair", "used", "other", "none"];

/**
 * Colour families for the colour filter, in its order, each found by words in a listing's item (and
 * colour field), in the languages the agents and shops write: the page's English or Russian, and
 * German, French, Italian, Spanish and Polish titles. Navy hides blue, so a navy coat isn't both.
 */
const COLORS: { key: string; en: string; ru: string; swatch: string; re: RegExp }[] = [
  { key: "black", en: "Black", ru: "Чёрный", swatch: "#17181b", re: /\b(black|schwarz|noir|nero|negro|negra)\b|czarn|ч[её]рн/i },
  { key: "white", en: "White", ru: "Белый", swatch: "#ffffff", re: /\b(white|wei(ß|ss)e?|blanc|blanche|bianco|blanco)\b|biał|бел(ый|ая|ое|ого|ой|ые|ых|о-)/i },
  { key: "cream", en: "Cream and beige", ru: "Бежевый и кремовый", swatch: "#e8dcc4", re: /\b(beige|cream|cr[eè]me|ecru|ivory|off-?white|sand|nude|camel)\b|бежев|кремов|молочн|экрю|песочн|слонов/i },
  { key: "gold", en: "Gold and bronze", ru: "Золотой и бронзовый", swatch: "linear-gradient(135deg, #f6d77a, #b8862d)", re: /\b(gold|golden|bronze|champagne|oro|dorato)\b|золот|бронз/i },
  { key: "grey", en: "Grey", ru: "Серый", swatch: "#9aa0a6", re: /\b(gr[ae]y|grau|gris|grigio|graphite|silver|charcoal|anthracite)\b|szar|сер(ый|ая|ое|ого|ой|ые|ых|о-|ебр)|графит|антрацит/i },
  { key: "brown", en: "Brown", ru: "Коричневый", swatch: "#7a4b2a", re: /\b(brown|braun|marron|brun|marrone|marr[oó]n|cognac|caramel|chocolate|tan|taupe|ebene|ébène)\b|brąz|коричн|шоколад|карамел|коньяч/i },
  { key: "red", en: "Red", ru: "Красный", swatch: "#c8102e", re: /\b(red|rot|rouge|rosso|rojo|burgundy|bordeaux|wine|cherry|scarlet|crimson|vermill?ion)\b|czerw|красн|бордов|вишн|винн/i },
  { key: "pink", en: "Pink", ru: "Розовый", swatch: "#e889aa", re: /\b(pink|rosa|ros[eé]|fuchsia|magenta|blush)\b|różow|розов|фукси|малинов|пудров/i },
  { key: "orange", en: "Orange", ru: "Оранжевый", swatch: "#e8772e", re: /\b(orange|arancio|naranja|terracotta|rust|coral)\b|оранж|терракот|рыж|коралл/i },
  { key: "yellow", en: "Yellow", ru: "Жёлтый", swatch: "#f2c230", re: /\b(yellow|gelb|jaune|giallo|amarillo|mustard|safran|saffron|lemon)\b|żółt|ж[её]лт|горчич|лимонн/i },
  { key: "green", en: "Green", ru: "Зелёный", swatch: "#4f7a45", re: /\b(green|gr[üu]n|vert|verte|verde|khaki|kaki|olive|moss|sage|mint|emerald|military)\b|zielon|зел[её]н|хаки|олив|мятн|изумруд/i },
  { key: "blue", en: "Blue", ru: "Синий и голубой", swatch: "#3f78c8", re: /\b(blue|blau|bleu|blu|azul|azur|denim|teal|turquoise)\b|niebiesk|голуб|син(ий|яя|ее|его|ей|ие|е-)|бирюз/i },
  { key: "navy", en: "Navy", ru: "Тёмно-синий", swatch: "#1f2f52", re: /\b(navy|marine|midnight|indigo)\b|т[её]мно-?\s?син/i },
  { key: "purple", en: "Purple", ru: "Фиолетовый", swatch: "#7b4fa8", re: /\b(purple|violet|viola|lila|lilac|lavender|plum|mauve)\b|фиолет|сирен|лилов|лаванд|сливов/i },
  { key: "multi", en: "Multicolour and prints", ru: "Разноцветный и принты", swatch: "conic-gradient(#c8102e, #f2c230, #4f7a45, #3f78c8, #7b4fa8, #c8102e)", re: /\b(multi-?colou?red|multi-?colou?r|camo(uflage)?|print(ed)?|leopard|tartan|plaid|floral|flowers?|stripe[sd]?|polka|dots|chevron|jacquard|paisley|butterfl(y|ies)|peacock)\b|разноцвет|камуфляж|принт|леопард|клетк|цвет(ы|ами|ок|очн)|георгин|калл|подсолн|бабоч|горох|горош|полоск|шеврон|жаккард|павлин|пейсли/i },
];
/** A listing's colour families, or "none" when its words name no colour */
function colorsOf(...texts: string[]): string[] {
  const text = texts.join(" ");
  const keys = COLORS.filter(c => c.re.test(text)).map(c => c.key);
  const found = keys.includes("navy") ? keys.filter(k => k !== "blue") : keys;
  return found.length ? found : ["none"];
}
const CONDITION_NAMES: Record<"en" | "ru", Record<string, string>> = {
  en: { newTags: "New with tags", new: "New", likeNew: "Like new", veryGood: "Very good", good: "Good", fair: "Fair", used: "Used", other: "Other", none: "Not stated" },
  ru: { newTags: "Новое с биркой", new: "Новое", likeNew: "Как новое", veryGood: "Очень хорошее", good: "Хорошее", fair: "Нормик", used: "Б/у", other: "Другое", none: "Не указано" },
};

/**
 * A shop's condition label on the scale: the key the condition filter uses, and the scale's name
 * for it in the page's language. The page shows only that name, so the column never mixes
 * languages, and the shop's own label on hover. A note in brackets and eBay's explanation after a
 * colon ("Gebraucht - Gut: Dieser Artikel ...") don't count. A label the scale doesn't know is other.
 */
function condition(label: string, lang: "en" | "ru"): { key: string; text: string } {
  // A dash with a space beside it, or any en or em dash, parts label and grade; a hyphen inside a word, as in pre-owned, stays
  const head = label.split(/[(:]/)[0]!.trim().toLowerCase().replace(/\s*[\u2013\u2014]\s*|\s+-\s*|\s*-\s+/g, " - ").replace(/\s+/g, " ");
  const key = CONDITIONS[head] ?? (label.trim() ? "other" : "none");
  return { key, text: key === "none" ? "" : (CONDITION_NAMES[lang][key] ?? label) };
}

/** Who checks a listing's authenticity, as the filter lists it */
const AUTH_ORDER = ["shop", "listing", "optional", "none", "unknown"];
const AUTH_NAMES: Record<"en" | "ru", Record<string, string>> = {
  en: { shop: "Checked by the shop", listing: "Checked for this listing", optional: "Optional check", none: "No check", unknown: "Not stated" },
  ru: { shop: "Проверяет магазин", listing: "Проверка этого объявления", optional: "Проверка по желанию", none: "Без проверки", unknown: "Не указано" },
};
/** The shops that check the authenticity of everything they sell, as their notes in references/shops say */
const CHECKING_SHOPS = new Set(["Collector's Cage", "ReLuxe Room", "Designer Exchange", "Luxury Helsinki", "Labellov", "Bam Luxury Store", "Queen Station", "A Retro Tale", "Collector Square", "Eppli", "JoliCloset", "Care of Carl"]);

/**
 * Who checks a listing's authenticity: its key on AUTH_ORDER and the shield's tooltip. eBay and
 * Vestiaire decide listing by listing, which the scans give as auth (or older runs in the note);
 * Vinted sells a check for designer items; the shops in CHECKING_SHOPS check everything.
 */
function authOf(listing: { auth?: unknown; note?: unknown }, shop: string, lang: "en" | "ru"): { key: string; note: string } {
  const ru = lang === "ru";
  const note = text(listing.note);
  if (/^ebay/i.test(shop)) {
    const checked = listing.auth === true || (listing.auth === undefined && /eBay checks authenticity|Echtheitspr|authenticity guarantee/i.test(note));
    return checked
      ? { key: "listing", note: ru ? "eBay проверяет подлинность до доставки (Echtheitsprüfung)" : "eBay checks its authenticity before delivery (Echtheitsprüfung)" }
      : { key: "none", note: ru ? "eBay не проверяет это объявление" : "eBay doesn't check this listing" };
  }
  if (/^vestiaire/i.test(shop)) {
    if (listing.auth === true || (listing.auth === undefined && /authentication included/i.test(note))) {
      return { key: "listing", note: ru ? "Vestiaire проверяет подлинность до доставки, это входит в цену" : "Vestiaire checks its authenticity before delivery, in the price" };
    }
    if (listing.auth === false || /authentication optional/i.test(note)) {
      return { key: "optional", note: ru ? "Проверку Vestiaire можно добавить при оплате, за доплату" : "Vestiaire's check can be added at checkout, for a fee" };
    }
    return { key: "unknown", note: "" };
  }
  if (/^vinted/i.test(shop)) return { key: "optional", note: ru ? "Vinted проверяет дизайнерские вещи, если покупатель за это заплатит" : "Vinted checks designer items if the buyer pays for it" };
  if (/^yaga/i.test(shop)) return { key: "none", note: ru ? "Yaga не проверяет подлинность" : "Yaga doesn't check authenticity" };
  if (CHECKING_SHOPS.has(shop)) return { key: "shop", note: ru ? `${shop} проверяет подлинность всего, что продаёт` : `${shop} checks the authenticity of everything it sells` };
  return { key: "unknown", note: "" };
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

/**
 * Ranges of bags' widths, for a run without a size chart: the smallest round step that makes at
 * most six over all but the farthest few widths, which, with mismeasured ones, go under "other".
 */
function widthBands(widths: number[]): { step: number; lo: number; hi: number } {
  const sorted = [...widths].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.round(p * (sorted.length - 1))] ?? 0;
  const [lo, hi] = [at(0.02), at(0.98)];
  const step = [1, 2, 3, 5, 10, 20, 50].find(s => Math.floor(hi / s) - Math.floor(lo / s) < 6) ?? 100;
  return { step, lo: Math.floor(lo / step) * step, hi: (Math.floor(hi / step) + 1) * step };
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
    // Also "not stated (via Paris, ...)": the page says it in its own language
    if (!from || /^not stated\b/i.test(from)) return ru ? "не указано" : "not stated";
    const code = countryCode(from);
    if (!code && !/^(not stated|не указано|unknown|in store\b)/i.test(from)) unplaced.set(from, (unplaced.get(from) ?? 0) + 1);
    // Just the country, so the column sorts and reads alike whatever town or region a shop adds
    return code ? countryName(code, lang) : from;
  };
  // Just the country, such as Estonia for "Tartumaa, Estonia", for the ships-from filter
  const country = (from: string) => {
    const code = countryCode(from);
    return code ? countryName(code, lang) : "";
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
    const auth = authOf(listing, shop, lang);
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
      place: text(listing.ships_from),
      country: country(text(listing.ships_from)),
      nonEU: outsideEU(listing.ships_from, listing.non_eu),
      newPrice: price(listing.new_price_eur),
      newUrl: text(listing.new_url),
      newNote: text(listing.new_note),
      risk: text(listing.risk),
      change: text(listing.change),
      note: text(listing.note),
      variant: text(listing.variant),
      colors: colorsOf(text(listing.item), text(listing.color)),
      auth: auth.key,
      authNote: auth.note,
      image: text(listing.image),
      same: [] as { url: string; shop: string; price: number | null }[],
      // The same number on listings that share a photo, for the filter that hides repeats
      dup: 0,
      group,
    };
  });

  // The size filter. Bags give measurements: with the model's size chart (page.sizes) each goes
  // under a named size, by a name in its size or by its width, and without one under a range of
  // widths. Anything else goes in letter or number buckets, unless the listing gives its own
  const listings = run.listings as Listing[];
  const given = (Array.isArray(page.sizes) ? page.sizes : [])
    .filter(size => typeof size?.name === "string" && size.name !== "")
    .filter(size => typeof size.width === "number" || (Array.isArray(size.width) && size.width.length === 2 && size.width.every(n => typeof n === "number")))
    .map(size => ({ name: size.name, width: size.width, mid: typeof size.width === "number" ? size.width : (size.width[0] + size.width[1]) / 2 }))
    .sort((a, b) => a.mid - b.mid);
  // A size given by the brand's width counts up to halfway to the next one, and 2 cm past the outer ones
  const cmText = (n: number) => n.toLocaleString(ru ? "ru-RU" : "en-IE");
  const chart = given.map(({ name, width, mid }, i) => {
    if (Array.isArray(width)) return { name, from: width[0], to: width[1], label: `${name}, ${ru ? `от ${cmText(width[0])} до ${cmText(width[1])} см` : `${cmText(width[0])} to ${cmText(width[1])} cm`}` };
    const before = given[i - 1], after = given[i + 1];
    return { name, from: before ? (before.mid + mid) / 2 : mid - 2, to: after ? (mid + after.mid) / 2 : mid + 2, label: `${name}, ${cmText(mid)} ${ru ? "см" : "cm"}` };
  });
  // An empty list of sizes only keeps that listing out of the buckets
  const explicit = listings.some(listing => Array.isArray(listing.sizes) && listing.sizes.length > 0);
  const measured = rows.filter(row => row.dims).length;
  const bags = chart.length > 0 || (!explicit && measured > 0 && measured >= rows.filter(row => row.size).length / 2);
  const bands = bags && !chart.length ? widthBands(rows.flatMap(row => (row.dims ? [row.dims.w] : []))) : null;
  const band = (w: number) => {
    if (!bands || w < bands.lo || w >= bands.hi) return "other";
    const from = Math.floor(w / bands.step) * bands.step, to = from + bands.step - 1;
    if (bands.step === 1) return ru ? `${from} см` : `${from} cm`;
    return ru ? `от ${from} до ${to} см` : `${from} to ${to} cm`;
  };
  const named = (row: (typeof rows)[number]) => {
    const word = (name: string) => new RegExp(`(^|[^\\p{L}])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "iu");
    // Only a name with a letter in it, since a number such as Speedy's 30 can be any measurement
    const byName = chart.find(size => /\p{L}/u.test(size.name) && word(size.name).test(row.size));
    if (byName) return byName.name;
    if (row.dims) return chart.find(size => row.dims!.w >= size.from && row.dims!.w <= size.to)?.name ?? "other";
    return row.size ? "other" : "none";
  };
  for (const [index, row] of rows.entries()) {
    const own = listings[index]!.sizes;
    if (Array.isArray(own) && own.length) row.sizes = own.filter(size => typeof size === "string");
    else if (chart.length) row.sizes = [named(row)];
    else if (bands) row.sizes = [row.dims ? band(row.dims.w) : row.size ? "other" : "none"];
    else if (!Array.isArray(own)) row.sizes = sizeBuckets(row.size);
  }
  const presentSizes = new Set(rows.flatMap(row => row.sizes));
  const chartNames = chart.map(size => size.name);
  const rest = [...presentSizes].filter(id => !chartNames.includes(id) && id !== "other" && id !== "none");
  const firstNumber = (id: string) => Number(id.match(/\d+/)?.[0] ?? 0);
  const sizeIds = !bags
    ? sizeOrder(presentSizes)
    : [...chartNames, ...(chart.length ? sizeOrder(new Set(rest)) : rest.sort((a, b) => firstNumber(a) - firstNumber(b))), "other", "none"].filter(id => presentSizes.has(id));
  const sizeLabels: Record<string, string> = {};
  for (const { name, label } of chart) sizeLabels[name] = label;
  if (bags) Object.assign(sizeLabels, ru ? { other: "Другой размер", none: "Не указан" } : { other: "Other size", none: "Not stated" });

  // Listings with the same photo, even where each shop saved it at another size or quality: often
  // one item listed by several shops, or a seller using someone else's photos. Each links the
  // others, and a group shipping from different countries gets a risk
  const folder = source.includes("/") ? source.replace(/\/[^/]*$/, "") : ".";
  const files = rows.map(row => (row.image && !row.image.startsWith("data:") ? `${folder}/${row.image}` : null));
  const byData = new Map<string, typeof rows>();
  for (const row of rows) if (row.image?.startsWith("data:")) byData.set(row.image, [...(byData.get(row.image) ?? []), row]);
  const shared = [
    ...(await photoGroups(files)).map(group => group.map(i => rows[i]!)),
    ...[...byData.values()].filter(group => group.length > 1),
  ];
  for (const [index, group] of shared.entries()) {
    for (const row of group) row.dup = index + 1;
    const countries = new Set(group.map(row => countryCode(row.ships)).filter(Boolean));
    for (const row of group) {
      row.same = group.filter(other => other !== row).map(({ url, shop, price }) => ({ url, shop, price }));
      if (countries.size > 1 && !row.risk) row.risk = ru ? "то же фото у объявлений из разных стран" : "the same photo is on listings shipping from different countries";
    }
  }

  // How far the search has got, from the plan and the agents' status files; none once all are in
  let progress: Progress | null = null;
  const plan = page.progress;
  if (plan && Array.isArray(plan.shops) && plan.shops.length) {
    const statuses = new Map<string, AgentStatus>();
    for (const agent of new Set([...plan.shops, ...(plan.brands ?? [])].map(entry => entry.agent).filter(id => typeof id === "string" && id))) {
      for (const id of [agent!, `${agent}-2`]) {
        const file = Bun.file(`${folder}/status/${id}.json`);
        if (await file.exists()) statuses.set(id, await file.json());
      }
    }
    const shops = plan.shops.map(({ name, agent, state, note }) => {
      const count = rows.filter(row => row.shop === name).length;
      if (!agent) return { name, state: state ?? "nothing", count, note: text(note) };
      const first = statuses.get(agent), second = statuses.get(`${agent}-2`);
      if (!first) return { name, state: "searching" as ShopState, count, note: "" };
      if ((first.unverified ?? 0) > 0 && !second) return { name, state: "checking" as ShopState, count, note: "" };
      const last = text((second ?? first).status);
      const stopped = /^(blocked|not searched)/i.test(last) && !count;
      return { name, state: (stopped ? "blocked" : "done") as ShopState, count, note: stopped ? last.replace(/^(blocked|not searched):?\s*/i, "") : "" };
    });
    const brands = (plan.brands ?? []).map(({ name, agent }) => ({ name, done: !!agent && statuses.has(agent) }));
    const counted = shops.filter(shop => shop.state !== "skipped");
    const done = counted.filter(shop => shop.state !== "searching" && shop.state !== "checking").length;
    if (done < counted.length || brands.some(brand => !brand.done)) {
      const updated = new Date().toLocaleTimeString(ru ? "ru-RU" : "en-GB", { hour: "2-digit", minute: "2-digit" });
      progress = { shops, brands, done, total: counted.length, updated };
    }
  }

  const data: Report = {
    progress,
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
    bags,
    sizeLabels,
    conditionOrder: CONDITION_ORDER.filter(key => rows.some(row => row.cond === key)),
    conditionNames: CONDITION_NAMES[lang],
    colorOrder: [...COLORS.map(c => c.key), "none"].filter(key => rows.some(row => row.colors.includes(key))),
    colorNames: Object.fromEntries([...COLORS.map(c => [c.key, c[lang]]), ["none", ru ? "Не указан" : "Not stated"]]),
    colorSwatches: Object.fromEntries(COLORS.map(c => [c.key, c.swatch])),
    authOrder: AUTH_ORDER.filter(key => rows.some(row => row.auth === key)),
    authNames: AUTH_NAMES[lang],
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

  if (progress) console.log(`progress: ${progress.done} of ${progress.total} shops searched${progress.brands.some(brand => !brand.done) ? ", new prices still coming" : ""}`);
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
  if (bands) console.warn(`no page.sizes, so bags go under ranges of ${bands.step} cm of width; give the model's size chart to name them`);
  if (sizeIds.length) {
    const counts = sizeIds.map(id => `${id} ${rows.filter(row => row.sizes.includes(id)).length}`);
    console.log(`sizes: ${counts.join(", ")}`);
  }
  console.log(`wrote ${out}`);
  return 0;
}

process.exit(await main(Bun.argv.slice(2)));
