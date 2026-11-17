#!/usr/bin/env bun
/**
 * Scan a shop's catalogue for a fashion-hunt search and list the candidates, so a shop agent reads
 * one short list instead of paging through the shop. USAGE below lists the shops and options.
 *
 * Shopify shops and Yaga answer plain requests. Vestiaire Collective, JoliCloset, Farfetch and
 * eBay.de refuse scripts, so their scans run inside a tab of the ai-skills browser (scripts/tab.ts),
 * through the same JSON and pages the shop's own site loads.
 */

import { parseArgs } from "node:util";
import { EU, budgetLeft, codeTokens, countryCode, key, lastVerdicts, learnedCodes, longSide, spendBudget } from "./common.ts";

const USAGE = `Scan a shop's catalogue for a fashion-hunt search and list the candidates.

    scan.ts shopify    --brand <name> [--shops <domain>,...] [--match <regex>] [--full] [--tag <tab tag>]
                       [--out <file>]
    scan.ts shopify    --profile [--shops <domain>,...] [--full] [--tag <tab tag>]
    scan.ts vestiaire  --tag <tab tag> --brand <name> [--model <name>]... [--query <text>]
                       [--filters <json>] [--match <regex>] [--out <file>]
    scan.ts jolicloset --tag <tab tag> (--category <path>... | --query <text>) [--match <regex>]
                       [--out <file>]
    scan.ts yaga       --brand <name> [--query <text>] [--match <regex>] [--out <file>]
    scan.ts vinted     --tag <tab tag> [--query <text>]... [--filters <query string>] [--brand <name>]...
                       [--match <regex>] [--pause <ms>] [--out <file>]
    scan.ts collectorsquare --query <text>... [--brand <name>]... [--match <regex>] [--out <file>]
    scan.ts aretrotale --brand <name>... [--query <text>] [--match <regex>] [--out <file>]
    scan.ts resee      --brand <name>... [--query <text>] [--match <regex>] [--out <file>]
    scan.ts farfetch   --tag <tab tag> (--category <path>... | --query <text>...) [--brand <name>]...
                       [--match <regex>] [--pause <ms>] [--out <file>]
    scan.ts ebay       --tag <tab tag> [--query <text>]... [--match <regex>] [--details]
                       [--ids <id>,...] [--pause <ms>] [--out <file>]

--brand        a brand as the shop names it; repeat it for aliases (--brand "Louis Vuitton" --brand LV)
--match        keep only items whose title (and description, where the list has one) matches this
               case-insensitive regex, such as "marel" for Marelle, Marellini and misspellings.
               Vestiaire, JoliCloset and Vinted list what their searches found but --match left
               out at the end, apart, to skim for the item under another name (at most 300)
--side         with --match: keep what it left out after all when the longer side of its
               measurements is in this range of cm, such as 9-10.5 (Vestiaire gives measurements)
--out          where to save every candidate as JSON (default: a file in $TMPDIR, printed at the end)
--tag          the tab tag of the agent running the scan, as for tab.ts: the scan opens the tab if
               it isn't open, and leaves it open

shopify     the products of each shop's whole catalogue or, where it keeps thousands of sold
            products or passes the 25,000 Shopify serves, of the collection holding all the shop
            has in stock (SHOPIFY below names it; --full reads the whole catalogue anyway). For a
            shop not in SHOPIFY, its collection of the brand (such as /collections/louis-vuitton)
            where it has one. Kept when the vendor, title or tags name the brand. Prices are the
            shop's own euro prices. --shops takes domains (default: the bookmarked Shopify shops,
            listed in SHOPIFY below). A shop that answers 403 from outside the browser, as all nine
            did after a day of scans, is read in a tab instead when --tag gives one. --profile
            prints what each shop carries instead: products in stock, vendors and product types;
            with --full as well, it checks that each collection still holds all that's in stock.
vestiaire   the search the catalog page loads, unsold items only, 200 a call, in slices by category,
            condition and colour past the 1,200 listings one search pages through: --brand picks the
            designer and its collaborations ("Louis Vuitton x Yayoi Kusama"), --model the model
            filter (repeat it for several, such as Marelle and Marellini), plus a text search for
            each model name, which finds listings whose seller set no model; --query adds a text
            search of its own, --filters adds raw filters such as '{"color.id":["1"]}'. Each
            candidate is then checked with the product API: material, colour, condition,
            measurements, buyer fee, whether it's for sale now, whether authentication is
            included, any crossed-out earlier price, packaging, and the seller's kind and sales.
jolicloset  the result pages of a designer category (such as
            designers-women/louis-vuitton/womens-bags) or of a text search in both the women's and
            men's sections, read from the list data each page embeds, 60 a page; then each
            candidate's product page: condition, fabric, colours, dimensions and seller.
yaga        the search API for the brand (and text), then each product's details.
vinted      vinted.ee's catalogue pages for each --query (search text), with --filters added to
            their URL as is, such as 'brand_ids[]=417' (Louis Vuitton), one page a --pause apart
            (default 1500 ms); --brand keeps cards whose brand label is that brand. Each card's
            label gives title, brand, Vinted's model field, size, condition and price.
collectorsquare
            Collector Square's search pages for each --query, from the data its cards carry:
            name, price, its model id, material and condition, 120 cards a page; --brand keeps
            cards whose name starts with the brand.
aretrotale  A Retro Tale's search service (Searchspring) for the brand, 100 items a call, with
            price, condition, colour and description; prices include delivery to Estonia.
resee       ReSee's search service (Algolia) for the brand's name (and text), with Estonia's
            price, condition, colour, material and size, for sale and not on hold.
farfetch    the result pages of each text search in the women's and men's sections, with the
            --brand's name added to the query and up to the first page with nothing of the brand
            that --match takes, or of a designer listing (such as women/louis-vuitton-pre-owned,
            20 pages and more for a big brand), from the item list each page embeds, 96 a page;
            --brand keeps that designer's items; then the first 6 candidates' product pages:
            colour, composition, measurements and condition. One page at a time, --pause ms apart
            (default 1500), since Farfetch answers a burst with 429 (about 7 product pages in a
            row in November 2026, then one every 45 seconds); when it blocks anyway, the scan
            stops at once and reports what it read: the block lasted about 15 minutes, once an
            hour. Prices are Farfetch Estonia's euros, import duties included.
ebay        eBay.de's search cards for each --query, Buy It Now only and up to the count in the
            results heading, auctions left out. A card says only Gebraucht, so each used card's
            grade (Hervorragend, Gut or Akzeptabel) comes from the same search again under eBay's
            grade filters, about two more page loads a query. --details also reads every
            candidate's item page (item specifics such as material, colour and measurements,
            where it ships from, returns), and --ids reads the item pages of those listings
            alone. Pages are read signed out, --pause ms apart (default 2000). eBay answers 403
            after about 15 item pages, whether 1.5 or 4 seconds apart, or about 20 searches in
            five minutes, and lifts the block within about ten minutes, so read item pages for a
            few cards only.

Prints one line per candidate: id | price | condition | ships from | title | details | model
code, then the same for what --match left out. A model code is a token of letters and digits in the title or description, such as Louis
Vuitton's M80689 or a style number, that several candidates share or an earlier search saved; the
lines start with one per code: how many candidates have it, what an earlier search saved it as
and two of their titles. Agents save their picks by id, or a whole code at once, with
scripts/listings.ts add --scan <out file>, which also remembers what each code was saved as (in
the skill's data/codes.json), so they don't retype fields.
`;

const TAB = `${import.meta.dir}/tab.ts`;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36";

/**
 * The bookmarked shops on Shopify, with the country they ship from. The scan reads a shop's whole
 * /products.json, except where `catalogue` names a collection holding all it has in stock: there
 * the whole feed keeps thousands of sold products, or stops at 25,000, short of Labellov's 45,000
 * (newest first). Brand collections can't be trusted (some are empty or miss items, others keep
 * sold ones), and Collector's Cage's `shop` collection misses some. Checked on 17 November 2026:
 * `scan.ts shopify --profile` counts the same items in stock with and without `--full`, bar
 * services, gift cards and care kits (and Labellov, whose whole feed is cut).
 */
const SHOPIFY: Record<string, { name: string; country: string; catalogue?: string }> = {
  "curatedbynoar.eu": { name: "Curated by NOAR", country: "Estonia" },
  "affordableluxurys.com": { name: "Affordable Luxury", country: "Sweden" },
  "queenstation.fi": { name: "Queen Station", country: "Finland", catalogue: "all-products-in-stock" },
  "www.reluxeroom.com": { name: "ReLuxe Room", country: "Bulgaria", catalogue: "all-designers" },
  "www.designerexchange.ie": { name: "Designer Exchange", country: "Ireland" },
  "luxuryhelsinki.fi": { name: "Luxury Helsinki", country: "Finland", catalogue: "all-products" },
  "labellov.com": { name: "Labellov", country: "Belgium", catalogue: "shop-by-designer" },
  "bamluxurystore.com": { name: "Bam Luxury Store", country: "Spain", catalogue: "available" },
  "collectorscage.com": { name: "Collector's Cage", country: "Denmark" },
};

const COUNTRY = new Intl.DisplayNames(["en"], { type: "region" });

export type Candidate = {
  id: string;
  shop: string;
  url: string;
  title: string;
  brand?: string;
  price_eur?: number;
  /** A price in another currency, for the main chat to convert */
  price?: number;
  currency?: string;
  condition?: string;
  size?: string;
  color?: string;
  material?: string;
  ships_from?: string;
  non_eu?: boolean;
  /** Whether the platform checks this listing's authenticity before delivery: eBay's guarantee, or Vestiaire's check in the price (else optional at checkout) */
  auth?: boolean;
  photo?: string;
  description?: string;
  seller?: string;
  listed?: string;
  /** Anything that changes whether or how it can be bought: a buyer fee, reserved, not for sale */
  note?: string;
  /** The brand's model code in its title or description, such as M80689, and what the code table says it is */
  code?: string;
  model?: string;
  /** When listings with the code were saved as different items: how many as model, and as what else */
  saves?: string;
  /** What the last run of the search (--known) decided about it, if it judged it */
  known?: "match" | "near" | "out";
  /** For a candidate without a code that others resemble: its material, colour and width, such as LEATHER/WHITE/25CM */
  traits?: string;
};

/** loose: what the shop's searches found but --match left out, listed apart to skim */
export type ScanFile = { shop: string; scanned_at: string; searched: string[]; candidates: Candidate[]; loose?: Candidate[] };

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
const words = (s: string) => new RegExp(`(^|[^a-z0-9])${norm(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`);
const stripHtml = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const clip = (s: string | undefined, n = 300) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);
/** Measurements in a description, such as "40 x 30 x 6 cm" or "Width: 40 cm", in the shops' languages */
const SIZES = /(?:[A-Za-z]{1,2}\s*[:.]?\s*)?\d{1,3}(?:[.,]\d)?\s*(?:cm)?\s*[x×]\s*(?:[A-Za-z]{1,2}\s*[:.]?\s*)?\d{1,3}(?:[.,]\d)?(?:\s*(?:cm)?\s*[x×]\s*(?:[A-Za-z]{1,2}\s*[:.]?\s*)?\d{1,3}(?:[.,]\d)?)?\s*cm|\b(?:width|height|depth|length|breite|höhe|tiefe|länge|largeur|hauteur|profondeur|longueur|larghezza|altezza|profondità|lunghezza)\s*[:.]?\s*\d{1,3}(?:[.,]\d)?\s*cm/gi;
/**
 * About 300 characters of a description: around the first hit of re where it has one, else its
 * start, plus up to three measurements from the rest, which sellers often paste at the end.
 */
function snippet(text: string | null | undefined, re: RegExp | null, n = 300): string | undefined {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  const at = re ? flat.search(re) : -1;
  const start = at < 0 || flat.length <= n ? 0 : Math.max(0, at - 100);
  const part = start ? `…${flat.slice(start, start + n - 1)}…` : clip(flat, n);
  const sizes = [...new Set((flat.match(SIZES) ?? []).map(s => s.trim().replace(/^[a-z](?=[A-Z])/, "")))].filter(s => !part?.includes(s)).slice(0, 3);
  return sizes.length ? `${part} [sizes in the text: ${sizes.join("; ")}]` : part;
}
/** The country an ISO code names, and whether it's outside the EU. */
function place(iso: string | undefined): { ships_from: string; non_eu?: boolean } {
  if (!iso) return { ships_from: "not stated" };
  const code = iso.toUpperCase();
  return { ships_from: COUNTRY.of(code) ?? code, ...(EU.has(code) ? {} : { non_eu: true }) };
}

let nextSlot = 0;
/** Wait for the next free slot, so requests from all scans in this process start `gap` ms apart. */
async function pace(gap: number): Promise<void> {
  const at = Math.max(Date.now(), nextSlot);
  nextSlot = at + gap;
  await Bun.sleep(at - Date.now());
}

/**
 * GET JSON through curl, spaced out, and try again after a pause when the shop answers 429 (too
 * many requests) or fails. Shopify refuses Bun's own fetch after a burst of requests while it
 * still answers curl, hence curl. Requests start `gap` ms apart, 500 by default for Shopify.
 */
async function getJson(url: string, gap = 500): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    await pace(gap);
    const res = await Bun.$`curl -sS -g --compressed --max-time 30 -A ${UA} -H ${"accept: application/json"} -w ${"\n%{http_code}"} ${url}`.quiet().nothrow();
    const out = res.stdout.toString();
    const cut = out.lastIndexOf("\n");
    const status = Number(out.slice(cut + 1));
    if (res.exitCode === 0 && status === 200) {
      try {
        return JSON.parse(out.slice(0, cut));
      } catch {
        if (attempt >= 3) throw new Error(`not JSON from ${url}: ${out.slice(0, 120)}`);
      }
    } else if (attempt >= (status === 429 ? 5 : 2) || status === 404) {
      throw new Error(`${status || res.stderr.toString().trim()} from ${url}`);
    }
    await Bun.sleep(status === 429 ? 5000 * 2 ** attempt : 2000);
  }
}

/**
 * Run fn(args) inside the page of a tab of the ai-skills browser that is on origin. A failure ends
 * the scan, or with throws set, throws for the caller to report.
 */
async function inTab<A, R>(tag: string, origin: string, fn: (args: A) => Promise<R>, args: A, throws = false): Promise<R> {
  const fail = (message: string): never => {
    if (throws) throw new Error(message);
    return die(message);
  };
  const code = `async (p) => {
    if (!p.url().startsWith(${JSON.stringify(origin)})) await p.goto(${JSON.stringify(`${origin}/`)}, { waitUntil: "domcontentloaded" });
    return JSON.stringify(await p.evaluate(${fn.toString()}, ${JSON.stringify(args)}));
  }`;
  const run = () => Bun.$`bun ${TAB} run --timeout 400 ${tag} < ${new Response(code)}`.quiet().nothrow();
  let ran = await run();
  if (ran.exitCode !== 0 && /no tab for tag|is gone/.test(ran.stderr.toString())) {
    const opened = await Bun.$`bun ${TAB} open ${tag} ${`${origin}/`}`.quiet().nothrow();
    if (opened.exitCode !== 0) fail(`couldn't open a tab for ${origin}: ${opened.stderr.toString().trim()}`);
    ran = await run();
  }
  if (ran.exitCode !== 0) fail(`the scan failed in the browser: ${ran.stderr.toString().trim().slice(0, 1500)}`);
  return JSON.parse(ran.stdout.toString()) as R;
}

/** Map over items, at most `width` at a time. */
async function pool<T, R>(items: T[], width: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, worker));
  return out;
}

// --- Shopify -----------------------------------------------------------------------------------

type ShopifyProduct = {
  title: string;
  handle: string;
  vendor: string;
  product_type: string;
  tags: string[] | string;
  body_html: string | null;
  published_at: string;
  images: { src: string }[];
  variants: { price: string; available: boolean; title: string }[];
};

/**
 * A shop's products: those of the first of the given collections that has any (the shop's in-stock
 * catalogue, or a brand collection), or else its whole catalogue, sold products included.
 */
async function shopifyCatalogue(domain: string, collections: string[]): Promise<{ products: ShopifyProduct[]; currency: string; source: string }> {
  let base = `https://${domain}/products.json`;
  let source = "whole catalogue";
  let first: ShopifyProduct[] | null = null;
  for (const handle of collections) {
    const data = (await getJson(`https://${domain}/collections/${handle}/products.json?limit=250&page=1`).catch(() => null)) as { products?: ShopifyProduct[] } | null;
    if (data?.products?.length) {
      base = `https://${domain}/collections/${handle}/products.json`;
      source = `collection ${handle}`;
      first = data.products;
      break;
    }
  }
  const products: ShopifyProduct[] = [];
  for (let page = 1; page <= 100; page++) {
    const batch = page === 1 && first ? first : ((await getJson(`${base}?limit=250&page=${page}`)) as { products: ShopifyProduct[] }).products;
    products.push(...batch);
    if (batch.length < 250) break;
    // Shopify serves no page past 100
    if (page === 100) source += ", only its first 25,000 products (Shopify serves no more)";
  }
  const cart = (await getJson(`https://${domain}/cart.js`).catch(() => ({}))) as { currency?: string };
  return { products, currency: cart.currency ?? "EUR", source };
}

/* eslint-disable @typescript-eslint/no-explicit-any -- the shops' own JSON, read in their pages */
/**
 * The same catalogue, read inside a tab on the shop, for a shop that answers 403 to requests from
 * outside the browser; only the brand's products come back (by vendor, title or tags), and each
 * listed product's euro price where the shop's own currency isn't the euro.
 */
async function inShopify(A: { collections: string[]; brands: string[]; compact?: boolean }): Promise<{ products: ShopifyProduct[]; currency: string; source: string; eur: Record<string, number> }> {
  const get = async (path: string): Promise<any> => {
    const res = await fetch(path, { credentials: "include" });
    if (!res.ok) throw new Error(`${res.status} from ${location.origin}${path}`);
    return res.json();
  };
  let base = "/products.json";
  let source = "whole catalogue, read in the browser";
  let first: any[] | null = null;
  for (const handle of A.collections) {
    const data = await get(`/collections/${handle}/products.json?limit=250&page=1`).catch(() => null);
    if (data?.products?.length) {
      base = `/collections/${handle}/products.json`;
      source = `collection ${handle}, read in the browser`;
      first = data.products;
      break;
    }
  }
  const brands = A.brands.map(b => b.toLowerCase());
  const products: any[] = [];
  for (let page = 1; page <= 100; page++) {
    const batch: any[] = page === 1 && first ? first : (await get(`${base}?limit=250&page=${page}`)).products;
    for (const p of batch) {
      // For the profile, every product, with only what it counts
      if (A.compact) {
        products.push({ title: "", handle: p.handle, vendor: p.vendor, product_type: p.product_type, tags: [], body_html: null, published_at: "", images: [], variants: (p.variants ?? []).map((v: any) => ({ price: v.price, available: v.available, title: "" })) });
        continue;
      }
      const named = `${p.vendor} | ${p.title} | ${[p.tags].flat().join(" ")}`.toLowerCase();
      if (brands.some(b => named.includes(b))) products.push({ title: p.title, handle: p.handle, vendor: p.vendor, product_type: p.product_type, tags: p.tags, body_html: p.body_html, published_at: p.published_at, images: (p.images ?? []).slice(0, 1).map((i: any) => ({ src: i.src })), variants: (p.variants ?? []).map((v: any) => ({ price: v.price, available: v.available, title: v.title })) });
    }
    if (batch.length < 250) break;
    if (page === 100) source += ", only its first 25,000 products (Shopify serves no more)";
  }
  const currency = (await get("/cart.js").catch(() => ({})))?.currency ?? "EUR";
  const eur: Record<string, number> = {};
  if (currency !== "EUR" && !A.compact) {
    const inStock = products.filter(p => p.variants.some((v: any) => v.available)).map(p => p.handle);
    for (let i = 0; i < inStock.length; i += 8) {
      await Promise.all(inStock.slice(i, i + 8).map(async handle => {
        const shown = await get(`/products/${handle}.js?currency=EUR`).catch(() => null);
        if (shown?.price) eur[handle] = shown.price / 100;
      }));
    }
  }
  return { products, currency, source, eur };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The handle Shopify gives a collection named after the brand, such as louis-vuitton. */
const handleOf = (brand: string) => norm(brand).replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const tagList = (p: ShopifyProduct) => (Array.isArray(p.tags) ? p.tags : p.tags.split(/,\s*/));

async function shopify(domains: string[], brands: string[], match: RegExp | null, full: boolean, tag: string | undefined): Promise<ScanFile> {
  const brandRes = brands.map(words);
  const searched: string[] = [];
  const candidates: Candidate[] = [];
  // A known shop's in-stock catalogue, or its whole one when it has none; for another shop, its brand collection, if it has one
  const brandHandles = [...new Set(brands.map(handleOf).filter(h => h.length > 2))];
  const listsOf = (domain: string) => {
    const shop = SHOPIFY[domain];
    if (full || (shop && !shop.catalogue)) return [];
    return shop?.catalogue ? [shop.catalogue] : brandHandles;
  };
  type Result = { domain: string; products: ShopifyProduct[]; currency: string; source: string; eur?: Record<string, number> } | { domain: string; error: string };
  const results: Result[] = await Promise.all(
    domains.map(domain => shopifyCatalogue(domain, listsOf(domain)).then(r => ({ domain, ...r }), (e: unknown) => ({ domain, error: String(e) }))),
  );
  // Shops that refuse requests from outside the browser (403, often after many scans): read them in a tab, one after another
  for (const [i, r] of results.entries()) {
    if (!("error" in r) || !/\b403\b/.test(r.error)) continue;
    if (!tag) {
      results[i] = { domain: r.domain, error: `${r.error}; give --tag to read it in the browser instead` };
      continue;
    }
    try {
      results[i] = { domain: r.domain, ...(await inTab(tag, `https://${r.domain}`, inShopify, { collections: listsOf(r.domain), brands }, true)) };
    } catch (e) {
      results[i] = { domain: r.domain, error: `${r.error}, and in the browser: ${e}` };
    }
  }
  for (const r of results) {
    const info = SHOPIFY[r.domain] ?? { name: r.domain, country: "not stated" };
    if ("error" in r) {
      searched.push(`${info.name}: not searched, ${r.error}`);
      continue;
    }
    let ofBrand = 0;
    let kept = 0;
    for (const p of r.products) {
      const named = norm(`${p.vendor} | ${p.title} | ${tagList(p).join(" ")}`);
      if (!brandRes.some(re => re.test(named))) continue;
      ofBrand++;
      const available = p.variants.filter(v => v.available);
      if (!available.length) continue;
      const text = stripHtml(p.body_html ?? "");
      if (match && !match.test(`${p.title} ${p.product_type} ${tagList(p).join(" ")} ${text}`)) continue;
      kept++;
      let price = Math.min(...available.map(v => Number(v.price)));
      let currency = r.currency;
      if (r.eur?.[p.handle]) {
        price = r.eur[p.handle]!;
        currency = "EUR";
      } else if (currency !== "EUR" && !r.eur) {
        // The catalogue gives the shop's own currency; the product's .js gives the price the shop
        // shows in euros, when it sells in euros at all
        const shown = (await getJson(`https://${r.domain}/products/${p.handle}.js?currency=EUR`).catch(() => null)) as { price?: number } | null;
        if (shown?.price && shown.price !== Math.round(price * 100)) {
          price = shown.price / 100;
          currency = "EUR";
        }
      }
      const condition = text.match(/\bcondition\s*(?:rating|grade)?\s*[:-]?\s*([A-Za-z][A-Za-z ()/+-]{2,40}?)(?=[.,;]|\s{2}|\s(?:Size|Dimensions|Measurements|Material|Colou?r|Comes|Includes|Accessories|Serial|Date)\b|$)/i)?.[1]?.trim()
        ?? tagList(p).find(t => /condition/i.test(t));
      const size = text.match(/\d+(?:[.,]\d+)?\s*(?:x|×)\s*\d+(?:[.,]\d+)?(?:\s*(?:x|×)\s*\d+(?:[.,]\d+)?)?\s*cm/i)?.[0];
      candidates.push({
        id: `${r.domain}/${p.handle}`,
        shop: info.name,
        url: `https://${r.domain}/products/${p.handle}`,
        title: p.title,
        brand: p.vendor,
        ...(currency === "EUR" ? { price_eur: price } : { price, currency }),
        ...(condition ? { condition } : {}),
        ...(size ? { size } : {}),
        ships_from: info.country,
        ...(p.images[0] ? { photo: p.images[0].src } : {}),
        description: snippet(text, match),
        listed: p.published_at?.slice(0, 10),
      });
    }
    searched.push(`${info.name}: ${r.source}, ${r.products.length} products in ${r.currency}, ${ofBrand} of the brand, ${kept} in stock${match ? " and matching" : ""}`);
  }
  return { shop: "shopify", scanned_at: new Date().toISOString(), searched, candidates };
}

async function shopifyProfile(domains: string[], tag: string | undefined, full: boolean): Promise<void> {
  const lists = (d: string) => (!full && SHOPIFY[d]?.catalogue ? [SHOPIFY[d]!.catalogue!] : []);
  type Profile = { d: string; products: ShopifyProduct[]; currency: string; source: string } | { d: string; error: string };
  const results: Profile[] = await Promise.all(domains.map(d => shopifyCatalogue(d, lists(d)).then(r => ({ d, ...r }), (e: unknown) => ({ d, error: String(e) }))));
  // A shop that refuses requests from outside the browser, read in a tab as the scan does
  for (const [i, r] of results.entries()) {
    if (!("error" in r) || !/\b403\b/.test(r.error) || !tag) continue;
    try {
      results[i] = { d: r.d, ...(await inTab(tag, `https://${r.d}`, inShopify, { collections: lists(r.d), brands: [], compact: true }, true)) };
    } catch (e) {
      results[i] = { d: r.d, error: `${r.error}, and in the browser: ${e}` };
    }
  }
  for (const r of results) {
    const name = SHOPIFY[r.d]?.name ?? r.d;
    if ("error" in r) {
      console.log(`${name}: ${r.error}`);
      continue;
    }
    const inStock = r.products.filter(p => p.variants.some(v => v.available));
    const top = (key: (p: ShopifyProduct) => string, n: number) => {
      const counts = new Map<string, number>();
      for (const p of inStock) counts.set(key(p) || "(none)", (counts.get(key(p) || "(none)") ?? 0) + 1);
      return [...counts].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${v}`).join(", ");
    };
    console.log(`${name} (${r.d}, ${r.currency}, ${r.source}): ${r.products.length} products, ${inStock.length} in stock`);
    console.log(`  vendors: ${top(p => p.vendor.trim(), 25)}`);
    console.log(`  types: ${top(p => p.product_type.trim(), 12)}`);
  }
}

// --- Vestiaire Collective (runs in the page) ---------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any -- the shops' own JSON, read in their pages */

type VestiaireArgs = { brand: string; models: string[]; query: string | null; filters: Record<string, string[]>; match: string | null };
type VestiaireItem = {
  id: string; url: string; title: string; brand: string; model: string; price: number; currency: string; condition: string;
  country: string; colors: string; photo: string; description: string; seller: string; listed: string;
  material?: string; color?: string; measurements?: string; available?: boolean; reserved?: boolean; fee?: number; duties?: number; vacation?: boolean;
  /** Whether Vestiaire's authentication is in the price (else it's optional at checkout), and the crossed-out earlier price */
  auth?: boolean; was?: number; packaging?: string[];
  /** The seller: an official store, a professional (else an individual), sales so far and badge, such as "expert seller" */
  official?: boolean; pro?: boolean; sales?: number; badge?: string;
};
type VestiaireResult = { error?: string; searched: string[]; items: VestiaireItem[]; loose?: VestiaireItem[] };

async function inVestiaire(A: VestiaireArgs): Promise<VestiaireResult> {
  const searched: string[] = [];
  const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  const fields = ["name", "description", "brand", "model", "country", "price", "link", "sold", "pictures", "colors", "size", "condition", "seller", "createdAt"];
  // Vestiaire's services sometimes refuse a request with a bare network error ("Failed to fetch")
  // that a retry gets past
  async function retried(url: string, init: RequestInit): Promise<Response> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fetch(url, init);
      } catch (e) {
        if (attempt === 8) throw e;
        // eslint-disable-next-line bun/prefer-builtin-sleep -- this runs in the shop's page, so no Bun globals
        await new Promise(resolve => setTimeout(resolve, 400 * attempt));
      }
    }
  }
  async function search(q: string | null, filters: Record<string, string[]>, offset: number, limit: number, facets: string[]): Promise<any> {
    const res = await retried("https://search.vestiairecollective.com/v1/product/search", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ pagination: { offset, limit }, fields, facets: { fields: facets, stats: [] }, q, sortBy: "relevance", filters, locale: { country: "EE", currency: "EUR", language: "en", sizeType: "EU" }, mySizes: null, options: {} }),
    });
    if (!res.ok) throw new Error(`the search answered ${res.status}`);
    return res.json();
  }
  // The designer and its collaborations, which Vestiaire files as designers of their own
  // ("Louis Vuitton x Yayoi Kusama")
  const brands = (await search(A.brand, {}, 0, 1, ["brand"])).facets?.fields?.brand ?? [];
  const mine = brands.filter((b: any) => norm(b.name) === norm(A.brand) || norm(b.name).startsWith(`${norm(A.brand)} x `));
  if (!mine.some((b: any) => norm(b.name) === norm(A.brand))) return { error: `no designer named "${A.brand}"; that search finds: ${brands.slice(0, 10).map((b: any) => b.name).join(", ")}`, searched, items: [] };
  const base: Record<string, string[]> = { sold: ["0"], ...A.filters, "brand.id": mine.map((b: any) => b.id) };
  searched.push(`designers ${mine.map((b: any) => `${b.name} (id ${b.id})`).join(", ")}`);
  // Passes, merged: the model filter, and the shop's text search for each model name, which also
  // finds listings whose seller set no model (often titled just "Leather handbag")
  const passes: { label: string; q: string | null; filters: Record<string, string[]> }[] = [];
  if (A.models.length) {
    const ids: string[] = [];
    for (const name of A.models) {
      const models = (await search(name, base, 0, 1, ["model"])).facets?.fields?.model ?? [];
      const hits = models.filter((m: any) => norm(m.name) === norm(name));
      if (!hits.length) return { error: `${A.brand} has no model named "${name}"; that search finds: ${models.slice(0, 12).map((m: any) => m.name).join(", ")}`, searched, items: [] };
      for (const m of hits) {
        ids.push(m.id);
        searched.push(`model ${m.name} (id ${m.id}, ${m.count} listed)`);
      }
      passes.push({ label: `text "${name}"`, q: name, filters: base });
    }
    passes.unshift({ label: "model filter", q: null, filters: { ...base, "model.id": ids } });
  }
  if (A.query) passes.push({ label: `text "${A.query}"`, q: A.query, filters: base });
  if (!passes.length) passes.push({ label: "every listing of the designer", q: null, filters: base });
  const items: VestiaireItem[] = [];
  const seen = new Set<string>();
  // The search pages up to an offset of 1,000 (since November 2026), so 1,200 listings a search:
  // a bigger one is read in slices, by category, then condition, then colour
  const MAX_OFFSET = 1000;
  const SLICES = ["categoryLvl1", "categoryLvl2", "condition", "color"];
  let added = 0;
  const take = (page: any) => {
    for (const it of page.items ?? []) {
      if (seen.has(String(it.id))) continue;
      seen.add(String(it.id));
      added++;
      items.push({
        id: String(it.id),
        url: `https://www.vestiairecollective.com${it.link}`,
        title: it.name,
        brand: it.brand?.name ?? "",
        model: it.model?.name ?? "",
        price: (it.price?.cents ?? 0) / 100,
        currency: it.price?.currency ?? "EUR",
        condition: it.condition?.label ?? "",
        country: it.country ?? "",
        colors: (it.colors?.all ?? []).map((c: any) => c.name).join(", "),
        photo: it.pictures?.[0] ? `https://images.vestiairecollective.com/images/resized/w=768,q=75,f=auto,${it.pictures[0]}` : "",
        description: it.description ?? "",
        seller: it.seller?.firstname ?? "",
        official: !!it.seller?.isOfficialStore,
        listed: it.createdAt ? new Date(it.createdAt * 1000).toISOString().slice(0, 10) : "",
      });
    }
    return (page.items ?? []).length;
  };
  async function readAll(q: string | null, filters: Record<string, string[]>, depth: number): Promise<{ total: number; read: number }> {
    const first = await search(q, filters, 0, 200, []);
    const total = first.paginationStats?.totalHits ?? 0;
    if (total > MAX_OFFSET + 200 && depth < SLICES.length) {
      const facet = SLICES[depth]!;
      const values = ((await search(q, filters, 0, 1, [facet])).facets?.fields?.[facet] ?? []) as any[];
      if (values.length < 2) return readAll(q, filters, depth + 1);
      let read = 0;
      for (const value of values) read += (await readAll(q, { ...filters, [`${facet}.id`]: [String(value.id)] }, depth + 1)).read;
      return { total, read };
    }
    let read = take(first);
    for (let offset = 200; offset < Math.min(total, MAX_OFFSET + 200); offset += 200) read += take(await search(q, filters, offset, 200, []));
    return { total, read };
  }
  for (const pass of passes) {
    const before = added;
    const { total, read } = await readAll(pass.q, pass.filters, 0);
    const missed = total - read;
    searched.push(`${pass.label}: ${total} unsold listings, ${added - before} not found by an earlier pass${missed > 0 ? ` (${missed} out of reach even in slices: narrow the search)` : ""}`);
  }
  const re = A.match ? new RegExp(A.match, "i") : null;
  const kept = re ? items.filter(i => re.test(`${i.title} ${i.model} ${i.description}`)) : items;
  const keptIds = new Set(kept.map(i => i.id));
  const loose = re ? items.filter(i => !keptIds.has(i.id)) : [];
  if (re) searched.push(`${kept.length} matching /${A.match}/`);
  // The product API: what the listing page shows, 20 at a time, for the candidates and for what
  // --match left out when there are few enough to skim
  const checked = [...kept, ...(loose.length <= 600 ? loose : [])];
  for (let i = 0; i < checked.length; i += 20) {
    await Promise.all(checked.slice(i, i + 20).map(async item => {
      try {
        const res = await retried(`https://apiv2.vestiairecollective.com/products/${item.id}?isoCountry=EE&x-siteid=13&x-language=en&x-currency=EUR`, { headers: { accept: "application/json" } });
        const d = ((await res.json()) as any).data;
        item.material = d.material?.name;
        item.color = d.color?.name;
        item.condition = d.condition?.description ?? item.condition;
        item.measurements = d.measurementFormatted;
        item.available = d.available !== false && !d.sold;
        item.reserved = !!d.reserved;
        item.vacation = !!d.seller?.vacation?.active;
        item.fee = (d.buyerFees ?? []).reduce((sum: number, f: any) => sum + (f.cost?.cents ?? 0), 0) / 100;
        item.duties = (d.dutyAndTax?.cents ?? 0) / 100;
        item.description = d.localizedDescription ?? item.description;
        // What a judge would otherwise open the listing for: authentication, an earlier price,
        // what comes with it, and who sells it
        item.auth = d.pricingBreakdown?.buyerFees?.includesAuthenticationFees;
        const was = (d.regularPrice?.cents ?? 0) / 100;
        if (was > item.price) item.was = was;
        item.packaging = (d.packagings ?? []).map((p: any) => p.localizedName ?? p.name).filter(Boolean);
        if (d.seller?.segment) item.pro = d.seller.segment === "B2C";
        item.sales = d.seller?.statistics?.productsSold;
        item.badge = (d.seller?.badges ?? []).find((b: string) => b.endsWith("-seller"))?.replace("-", " ");
      } catch { /* keep what the search gave */ }
    }));
  }
  return { searched, items: kept, loose };
}

async function vestiaire(tag: string, args: VestiaireArgs): Promise<ScanFile> {
  // What the description snippet centres on
  const re = args.match ? new RegExp(args.match, "i") : args.models.length ? new RegExp(args.models.map(m => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i") : null;
  const r = await inTab(tag, "https://www.vestiairecollective.com", inVestiaire, args);
  if (r.error) die(r.error);
  let gone = 0;
  const forSale = (items: VestiaireItem[]) => items.filter(i => {
    const out = i.available === false || !!i.vacation;
    if (out) gone++;
    return !out;
  });
  const candidate = (i: VestiaireItem): Candidate => {
    const notes = [
      i.reserved ? "reserved" : "",
      i.was ? `was €${i.was}` : "",
      i.auth === true ? "authentication included" : i.auth === false ? "authentication optional at checkout" : "",
      i.fee ? `buyer fee €${i.fee}` : "",
      i.duties ? `duties and taxes €${i.duties}` : "",
      i.packaging?.length ? `comes with: ${i.packaging.join(", ").toLowerCase()}` : "",
    ].filter(Boolean);
    const seller = [
      i.official ? "official store" : i.pro ? "professional" : i.pro === false ? "individual" : "",
      i.sales === 0 ? "no sales yet" : i.sales ? `${i.sales} sales` : "",
      i.badge ?? "",
    ].filter(Boolean);
    return {
      id: i.id,
      shop: "Vestiaire Collective",
      url: i.url,
      title: i.title,
      brand: i.brand,
      ...(i.currency === "EUR" ? { price_eur: i.price } : { price: i.price, currency: i.currency }),
      condition: i.condition,
      ...(i.measurements ? { size: i.measurements } : {}),
      ...(typeof i.auth === "boolean" ? { auth: i.auth } : {}),
      color: i.color ?? i.colors,
      ...(i.material ? { material: i.material } : {}),
      ...place(i.country),
      photo: i.photo,
      description: snippet(i.description, re),
      seller: seller.length ? `${i.seller} (${seller.join(", ")})` : i.seller,
      listed: i.listed,
      ...(notes.length ? { note: notes.join("; ") } : {}),
    };
  };
  const candidates = forSale(r.items).map(candidate);
  const loose = forSale(r.loose ?? []).map(candidate);
  if (gone) r.searched.push(`${gone} not for sale now (sold, reserved for checkout or the seller is away), left out`);
  return { shop: "vestiaire", scanned_at: new Date().toISOString(), searched: r.searched, candidates, loose };
}

// --- JoliCloset (runs in the page) -------------------------------------------------------------

type JoliArgs = { pages: string[]; match: string | null };
type JoliItem = {
  id: string; url: string; title: string; brand: string; price: number; currency: string; inStock: boolean; photo: string;
  condition?: string; chars?: Record<string, string>; seller?: string; description?: string; delivery?: string;
};
type JoliResult = { searched: string[]; items: JoliItem[]; loose?: JoliItem[] };

async function inJoli(A: JoliArgs): Promise<JoliResult> {
  const searched: string[] = [];
  const all = new Map<string, JoliItem>();
  const listOf = (html: string) => {
    const count = Number((html.match(/class="jc-list-count">([\d,.\s]+)/)?.[1] ?? "0").replace(/\D/g, ""));
    const items: JoliItem[] = [];
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      let data: any;
      try { data = JSON.parse(m[1]!); } catch { continue; }
      if (data?.["@type"] !== "ItemList") continue;
      for (const e of data.itemListElement ?? []) {
        const it = e.item ?? {};
        items.push({
          id: String(it.sku ?? it.url).replace(/^JC/, ""),
          url: it.url,
          title: it.name,
          brand: it.brand?.name ?? "",
          price: Number(it.offers?.price ?? 0),
          currency: it.offers?.priceCurrency ?? "EUR",
          inStock: /InStock/.test(it.offers?.availability ?? ""),
          photo: (Array.isArray(it.image) ? it.image[0] : it.image) ?? "",
        });
      }
    }
    return { count, items };
  };
  for (const base of A.pages) {
    const first = listOf(await (await fetch(base)).text());
    const offsets: number[] = [];
    for (let o = 60; o < Math.min(first.count, 60000); o += 60) offsets.push(o);
    const sep = base.includes("?") ? "&" : "?";
    const pages = [first];
    for (let i = 0; i < offsets.length; i += 8) {
      pages.push(...await Promise.all(offsets.slice(i, i + 8).map(o => fetch(`${base}${sep}offset=${o}`).then(r => r.text()).then(listOf))));
    }
    let n = 0;
    for (const page of pages) for (const it of page.items) { n++; all.set(it.url, it); }
    searched.push(`${base.replace("https://www.jolicloset.com", "")}: ${first.count} items, ${n} read`);
  }
  const re = A.match ? new RegExp(A.match, "i") : null;
  const kept = [...all.values()].filter(i => i.inStock && (!re || re.test(i.title)));
  // What --match left out, with only what the list gives, to skim
  const loose = re ? [...all.values()].filter(i => i.inStock && !re.test(i.title)) : [];
  if (re) searched.push(`${kept.length} in stock and matching /${A.match}/`);
  // Each candidate's product page, 8 at a time
  const text = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, "\"").replace(/\s+/g, " ").trim();
  for (let i = 0; i < kept.length; i += 8) {
    await Promise.all(kept.slice(i, i + 8).map(async item => {
      try {
        const html = await (await fetch(item.url)).text();
        item.condition = text(html.match(/class="cond-toggle"[^>]*>([^<]+)/)?.[1] ?? "");
        item.chars = {};
        for (const m of html.matchAll(/class="char-label">([^<]+)<\/span>\s*<span class="char-value">([^<]*)</g)) item.chars[text(m[1]!)] = text(m[2]!);
        const seller = html.match(/Sold by ([^<]+)<\/span>\s*(<span class="pro-badge">PRO)?/);
        item.seller = seller ? `${text(seller[1]!)}${seller[2] ? " (pro)" : ""}` : "";
        item.delivery = html.match(/Average delivery time: ([^<]+)</)?.[1]?.trim() ?? "";
        for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
          try {
            const d = JSON.parse(m[1]!);
            if (d?.["@type"] !== "Product") continue;
            item.description = d.description ?? "";
            item.inStock = /InStock/.test(d.offers?.availability ?? "");
            item.price = Number(d.offers?.price ?? item.price);
          } catch { /* not this one */ }
        }
      } catch { /* keep what the list gave */ }
    }));
  }
  return { searched, items: kept, loose };
}

async function jolicloset(tag: string, categories: string[], query: string | null, match: string | null): Promise<ScanFile> {
  const site = "https://www.jolicloset.com";
  const pages = categories.length
    ? categories.map(c => `${site}/en/${c.replace(/^\/?(en\/)?/, "")}`)
    : ["fashion-women", "fashion-men"].map(s => `${site}/en/${s}?query=${encodeURIComponent(query ?? "")}`);
  const r = await inTab(tag, site, inJoli, { pages, match });
  const candidate = (i: JoliItem): Candidate => {
    const chars = i.chars ?? {};
    return {
      id: i.id,
      shop: "JoliCloset",
      url: i.url,
      title: i.title,
      brand: i.brand,
      ...(i.currency === "EUR" ? { price_eur: i.price } : { price: i.price, currency: i.currency }),
      ...(i.condition ? { condition: i.condition } : {}),
      ...(chars.Dimensions || chars.Size ? { size: chars.Dimensions ?? chars.Size } : {}),
      ...(chars.Colors ? { color: chars.Colors } : {}),
      ...(chars.Fabrics ? { material: chars.Fabrics } : {}),
      ships_from: "not stated (via Paris, where JoliCloset checks it)",
      photo: i.photo,
      description: snippet(i.description, match ? new RegExp(match, "i") : null),
      ...(i.seller ? { seller: i.seller } : {}),
      ...(i.delivery ? { note: `average delivery ${i.delivery}` } : {}),
    };
  };
  const candidates = r.items.filter(i => i.inStock).map(candidate);
  const loose = (r.loose ?? []).map(candidate);
  return { shop: "jolicloset", scanned_at: new Date().toISOString(), searched: r.searched, candidates, loose };
}

// --- Farfetch (runs in the page) ---------------------------------------------------------------

// The page globals that the scanners below use in a shop's page, which the scripts' types (no DOM) lack
declare const DOMParser: new () => { parseFromString(html: string, type: string): any };
declare const location: { origin: string };

/** The country whose Farfetch site the scan reads, which sets the prices: euros with import duties. */
const FARFETCH_COUNTRY = "ee";
/** How many product pages the scan reads in a row, under the 7 or so Farfetch took before a 429 */
const FARFETCH_BURST = 6;

type FarfetchItem = {
  id: string; url: string; title: string; brand: string; price: number; currency: string; inStock: boolean; photo: string;
  description?: string; color?: string; material?: string; size?: string; condition?: string;
  /** Its product page was fetched (tried), and had the product's data (read) */
  tried?: boolean; read?: boolean;
};
/** Read the lists (pages of results), or else the product pages of items, one request at a time. */
type FarfetchArgs = { lists: string[]; brands: string[]; match: string | null; items: FarfetchItem[]; pause: number };
type FarfetchResult = { searched: string[]; items: FarfetchItem[]; blocked?: string };

async function inFarfetch(A: FarfetchArgs): Promise<FarfetchResult> {
  const searched: string[] = [];
  // eslint-disable-next-line bun/prefer-builtin-sleep -- this runs in the shop's page, so no Bun globals
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  let last = 0;
  let blocked = "";
  // One request at a time, A.pause ms apart. Farfetch answers a burst with 429 for an hour and
  // more, so a block isn't waited out: the scan stops and reports what it read
  async function read(url: string): Promise<string | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const wait = last + A.pause - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      try {
        const res = await fetch(url, { credentials: "include" });
        if (res.ok) return await res.text();
        if (res.status === 404) return null;
        if (res.status === 429) break;
      } catch { /* try again */ }
      await sleep(2000);
    }
    blocked = `${url.replace(location.origin, "")} didn't load (Farfetch answers too many requests with 429; the block lasted about 15 minutes in November 2026, once an hour)`;
    return null;
  }
  // The JSON-LD nodes of a page, with those of an @graph
  const nodes = (doc: any): any[] => [...doc.querySelectorAll('script[type="application/ld+json"]')].flatMap(s => {
    try {
      const data = JSON.parse(s.textContent ?? "");
      return data?.["@graph"] ?? [data];
    } catch {
      return [];
    }
  });

  if (A.items.length) {
    // Each item's product page: description, colour, composition, measurements and condition
    const ORDER = ["Width", "Height", "Depth", "Length", "Diameter", "Handle drop"];
    for (const item of A.items) {
      const html = await read(item.url);
      // A page refused for too many requests is tried again later, not counted as failed
      if (blocked) break;
      item.tried = true;
      if (!html) continue;
      const doc = new DOMParser().parseFromString(html, "text/html");
      const product = nodes(doc).find(n => n?.["@type"] === "ProductGroup" || n?.["@type"] === "Product");
      if (!product) continue;
      item.read = true;
      const description = String(product.description ?? "");
      item.description = description;
      // The description starts with the colour, such as "white, calf leather, textured finish"
      item.color = description.split(",")[0]!.trim().slice(0, 40) || product.color || "";
      item.material = (product.additionalProperty ?? []).filter((p: any) => /composition/i.test(`${p.name} ${p.propertyID}`)).map((p: any) => p.value).join("; ");
      const offer = (product.hasVariant ?? [product]).map((v: any) => v.offers).find(Boolean);
      if (offer) {
        item.inStock = /InStock/.test(offer.availability ?? "");
        item.price = Number(offer.priceSpecification?.[0]?.price ?? offer.price ?? item.price);
      }
      const sizes = [...doc.querySelectorAll("p")].map(p => String(p.textContent ?? "").trim()).filter(t => new RegExp(`^(${ORDER.join("|")}):`).test(t));
      item.size = sizes.sort((a, b) => ORDER.findIndex(o => a.startsWith(o)) - ORDER.findIndex(o => b.startsWith(o))).map(t => t.replace(/\s*\([^)]*\)\s*$/, "")).join(", ");
      item.condition = description.match(/Condition:\s*([A-Z][A-Z ]*[A-Z])/)?.[1] ?? "";
    }
    return { searched, items: A.items, ...(blocked ? { blocked } : {}) };
  }

  const all = new Map<string, FarfetchItem>();
  const listOf = (html: string): FarfetchItem[] => {
    const list = nodes(new DOMParser().parseFromString(html, "text/html")).find(n => n?.["@type"] === "ItemList");
    return (list?.itemListElement ?? []).flatMap((it: any) => {
      const url = new URL(it.offers?.url ?? it.url ?? "", location.origin).href.split("?")[0]!;
      const id = url.match(/item-(\d+)\.aspx/)?.[1];
      if (!id) return [];
      return [{
        id, url, title: it.name ?? "", brand: it.brand?.name ?? "", price: Number(it.offers?.price ?? 0),
        currency: it.offers?.priceCurrency ?? "EUR", inStock: /InStock/.test(it.offers?.availability ?? ""),
        photo: (Array.isArray(it.image) ? it.image[0] : it.image) ?? "",
      }];
    });
  };
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const brandRe = A.brands.length ? new RegExp(A.brands.map(escape).join("|"), "i") : null;
  const re = A.match ? new RegExp(A.match, "i") : null;
  for (const base of A.lists) {
    if (blocked) break;
    const sep = base.includes("?") ? "&" : "?";
    let items = 0;
    let page = 1;
    // 96 a page, until a page comes back short or with nothing new, or, as a search sorts by
    // relevance, with nothing of the brand that --match takes: the rest is other items
    for (; page <= 60; page++) {
      const html = await read(page === 1 ? base : `${base}${sep}page=${page}`);
      if (html === null) break;
      const list = listOf(html);
      let fresh = 0;
      for (const it of list) {
        items++;
        if (!all.has(it.id)) {
          all.set(it.id, it);
          fresh++;
        }
      }
      const useful = list.filter(i => (!brandRe || brandRe.test(i.brand)) && (!re || re.test(i.title))).length;
      if (list.length < 96 || !fresh || (base.includes("?q=") && (brandRe || re) && !useful)) break;
    }
    searched.push(`${base.replace(location.origin, "")}: ${items} items on ${page} pages`);
  }
  const kept = [...all.values()].filter(i => i.inStock && (!brandRe || brandRe.test(i.brand)) && (!re || re.test(i.title)));
  searched.push(`${kept.length} in stock${brandRe ? ` by ${A.brands.join(" or ")}` : ""}${re ? `, titles matching /${A.match}/` : ""}`);
  return { searched, items: kept, ...(blocked ? { blocked } : {}) };
}

async function farfetch(tag: string, categories: string[], queries: string[], brands: string[], match: string | null, pause: number): Promise<ScanFile> {
  const site = "https://www.farfetch.com";
  const root = `${site}/${FARFETCH_COUNTRY}/shopping`;
  // A search with the brand's name in it: Farfetch's search is loose, and "porte documents voyage"
  // alone gave about 2,000 items of every brand over 21 pages, enough to get it blocking
  const withBrand = (q: string) => (brands[0] && !q.toLowerCase().includes(brands[0].toLowerCase()) ? `${brands[0]} ${q}` : q);
  const lists = categories.length
    ? categories.map(c => `${root}/${c.replace(/^\/+|\/+$/g, "").replace(/\/items\.aspx$/, "")}/items.aspx`)
    : queries.flatMap(q => ["women", "men"].map(section => `${root}/${section}/search/items.aspx?q=${encodeURIComponent(withBrand(q))}`));
  const listed = await inTab(tag, site, inFarfetch, { lists, brands, match, items: [], pause });
  const searched = listed.searched;
  if (listed.blocked) searched.push(`lists stopped early: ${listed.blocked}`);
  // Only the first product pages: Farfetch took about 7 in a row in November 2026, then about one
  // every 45 seconds, so the rest are left to the agent, to read at that pace
  const items: FarfetchItem[] = [];
  const failed: FarfetchItem[] = [];
  let todo = listed.items;
  if (todo.length && !listed.blocked) {
    const r = await inTab(tag, site, inFarfetch, { lists: [], brands, match, items: todo.slice(0, FARFETCH_BURST), pause });
    items.push(...r.items.filter(i => i.read));
    failed.push(...r.items.filter(i => i.tried && !i.read));
    todo = [...r.items.filter(i => !i.tried), ...todo.slice(FARFETCH_BURST)];
    if (r.blocked) searched.push(`product pages stopped: ${r.blocked}`);
  }
  const unread = [...failed, ...todo];
  if (unread.length) {
    searched.push(`${items.length} product pages read; ${unread.length} left with only the list's title and price: open those that matter about one every 45 seconds, as Farfetch blocks a quicker run`);
  }
  const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\p{L}/gu, c => c.toUpperCase());
  const candidates: Candidate[] = [...items, ...unread].filter(i => i.inStock).map(i => ({
    id: i.id,
    shop: "Farfetch",
    url: i.url,
    title: i.title,
    brand: i.brand,
    ...(i.currency === "EUR" ? { price_eur: i.price } : { price: i.price, currency: i.currency }),
    ...(i.condition ? { condition: titleCase(i.condition) } : {}),
    ...(i.size ? { size: i.size } : {}),
    ...(i.color ? { color: i.color } : {}),
    ...(i.material ? { material: i.material } : {}),
    ships_from: "not stated",
    photo: i.photo,
    description: snippet(i.description, match ? new RegExp(match, "i") : null),
    ...(i.read ? {} : { note: "product page not read" }),
  }));
  searched.push("prices include import duties to Estonia; returns are free within 30 days; Farfetch gives no ships-from");
  return { shop: "farfetch", scanned_at: new Date().toISOString(), searched, candidates };
}

// --- eBay.de (runs in the page) -----------------------------------------------------------------

type EbayCard = { id: string; title: string; lines: string[]; photo: string };
type EbayItem = {
  id: string; status: number; title?: string; priceText?: string; approxText?: string; condition?: string;
  specifics?: Record<string, string>; descUrl?: string; descSize?: string; sellerNote?: string; seller?: string; location?: string; returns?: string;
  buyNow?: boolean; bids?: boolean; offer?: boolean; ended?: boolean; photo?: string;
};

/**
 * The cards of eBay's search results for each query, Buy It Now only, 240 a page, up to the count
 * in the heading: later cards match only some of the words. Signed out (credentials omitted), since
 * eBay blocks the signed-in browser first; a pause between pages keeps it from seeing a burst.
 * Then, as a card says only Neu or Gebraucht, the same search under each condition grade's filter
 * in A.grades: a card found there has that grade. A query whose cards an earlier query's grade
 * searches covered needs none of its own.
 */
async function inEbaySearch(A: { queries: string[]; pause: number; grades: [string, string][] }): Promise<{ searched: string[]; cards: EbayCard[]; blocked?: string; graded: Record<string, string>; gradesBlocked?: string; loads: number }> {
  const searched: string[] = [];
  const cards = new Map<string, EbayCard>();
  const text = (e: any) => String(e?.textContent ?? "").replace(/\s+/g, " ").trim();
  const count = (doc: any) => Number(text(doc.querySelector(".srp-controls__count-heading")).match(/^([\d.]+)/)?.[1]?.replace(/\./g, "") ?? 0);
  // Every page load, which eBay counts towards a block as it does item pages
  let loads = 0;
  let first = true;
  // Each query's cards, for the grade searches
  const found: string[][] = [];
  for (const q of A.queries) {
    const ids: string[] = [];
    found.push(ids);
    let wanted = Infinity;
    let seen = 0;
    for (let page = 1; seen < wanted && page <= 20; page++) {
      // eslint-disable-next-line bun/prefer-builtin-sleep -- this runs in the shop's page, so no Bun globals
      if (!first) await new Promise(resolve => setTimeout(resolve, A.pause));
      first = false;
      const url = `https://www.ebay.de/sch/i.html?_nkw=${encodeURIComponent(q).replace(/%20/g, "+")}&LH_BIN=1&_ipg=240&_pgn=${page}`;
      const res = await fetch(url, { credentials: "omit", headers: { "Accept-Language": "de-DE,de;q=0.9" } });
      loads++;
      if (res.status !== 200) return { searched, cards: [...cards.values()], blocked: `search page ${page} for "${q}" answered ${res.status}`, graded: {}, loads };
      const doc = new DOMParser().parseFromString(await res.text(), "text/html");
      if (page === 1) {
        const heading = text(doc.querySelector(".srp-controls__count-heading"));
        wanted = count(doc);
        searched.push(`"${q}": ${heading || "no results heading"}`);
      }
      const lis = [...doc.querySelectorAll("ul.srp-results > li.s-card")];
      if (!lis.length) break;
      for (const li of lis) {
        if (seen >= wanted) break;
        seen++;
        const id = li.getAttribute("data-listingid") ?? "";
        // Skip the "Shop on eBay" ad cards
        if (!id || id === "123456") continue;
        const opens = /Wird in neuem Fenster oder Tab geöffnet|Opens in a new window or tab/g;
        const lines = [...li.querySelectorAll("span")].filter(s => !s.children.length).map(s => text(s).replace(opens, "").trim()).filter(s => s && s !== "egieznA" && s !== "dercosnopS");
        const title = (text(li.querySelector(".s-card__title")) || lines[0] || "").replace(opens, "").replace(/^(Neues Angebot|New listing)\s*/i, "").trim();
        const img = li.querySelector("img.s-card__image") ?? li.querySelector("img");
        cards.set(id, { id, title, lines, photo: img?.getAttribute("data-defer-load") || img?.getAttribute("src") || "" });
        ids.push(id);
      }
    }
  }

  const graded: Record<string, string> = {};
  const covered = new Set<string>();
  for (const [i, q] of A.queries.entries()) {
    if (found[i]!.every(id => covered.has(id))) continue;
    for (const [code, label] of A.grades) {
      let wanted = Infinity;
      let seen = 0;
      for (let page = 1; seen < wanted && page <= 5; page++) {
        // eslint-disable-next-line bun/prefer-builtin-sleep -- this runs in the shop's page, so no Bun globals
        await new Promise(resolve => setTimeout(resolve, A.pause));
        const url = `https://www.ebay.de/sch/i.html?_nkw=${encodeURIComponent(q).replace(/%20/g, "+")}&LH_BIN=1&_ipg=240&LH_ItemCondition=${code}&_pgn=${page}`;
        const res = await fetch(url, { credentials: "omit", headers: { "Accept-Language": "de-DE,de;q=0.9" } });
        loads++;
        if (res.status !== 200) return { searched, cards: [...cards.values()], graded, gradesBlocked: `the ${label} search for "${q}" answered ${res.status}`, loads };
        const doc = new DOMParser().parseFromString(await res.text(), "text/html");
        if (page === 1) wanted = count(doc);
        const lis = [...doc.querySelectorAll("ul.srp-results > li.s-card")];
        if (!lis.length) break;
        for (const li of lis) {
          if (seen >= wanted) break;
          seen++;
          const id = li.getAttribute("data-listingid") ?? "";
          if (cards.has(id)) graded[id] = label;
        }
      }
    }
    for (const id of found[i]!) covered.add(id);
  }
  return { searched, cards: [...cards.values()], graded, loads };
}

/**
 * Item pages one at a time, signed out and with a pause between them; stops at the first 403.
 * Where the item specifics give no size, also the seller's description, a frame of its own, for
 * the measurements sellers write there.
 */
async function inEbayItems(A: { ids: string[]; pause: number }): Promise<{ items: EbayItem[]; blocked?: string; loads: number }> {
  const items: EbayItem[] = [];
  const text = (e: any) => String(e?.textContent ?? "").replace(/\s+/g, " ").trim();
  let loads = 0;
  for (const [n, id] of A.ids.entries()) {
    // eslint-disable-next-line bun/prefer-builtin-sleep -- this runs in the shop's page, so no Bun globals
    if (n) await new Promise(resolve => setTimeout(resolve, A.pause));
    let res: Response;
    try {
      res = await fetch(`https://www.ebay.de/itm/${id}`, { credentials: "omit", headers: { "Accept-Language": "de-DE,de;q=0.9" } });
      loads++;
    } catch {
      items.push({ id, status: 0 });
      continue;
    }
    if (res.status === 403) return { items, blocked: `item page ${id} answered 403 after ${n} pages`, loads };
    const html = await res.text();
    if (res.status !== 200) {
      items.push({ id, status: res.status });
      continue;
    }
    const doc = new DOMParser().parseFromString(html, "text/html");
    const specifics: Record<string, string> = {};
    doc.querySelectorAll(".ux-layout-section--features .ux-layout-section-evo__col").forEach((col: any) => {
      const k = text(col.querySelector("dt"));
      const v = text(col.querySelector("dd"));
      if (k && v && !(k in specifics)) specifics[k] = v.slice(0, 300);
    });
    const grade = specifics["Artikelzustand"] ?? "";
    const named = grade.match(/^(Neu mit Etikett|Neu ohne Etikett|Neu mit (Fehlern|Mängeln)|Neu \(Sonstige\)|Neuwertig|Neu|Gebraucht - (Hervorragend|Sehr gut|Gut|Akzeptabel)|Gebraucht|Generalüberholt|Defekt|Vorführmodell)/)?.[0] ?? grade.slice(0, 40);
    // A plain Gebraucht is eBay's used condition 3000, the one graded listings call Gebraucht - Gut
    const condition = named === "Gebraucht" ? "Gebraucht - Gut" : named;
    // The seller's description, where the specifics give no size: a frame on another site, which
    // inEbayDescs reads from a tab of its own
    const frame = doc.querySelector("iframe#desc_ifr")?.getAttribute("src");
    const descUrl = frame && !["Taschenbreite", "Taschenhöhe", "Abmessungen", "Maße"].some(k => specifics[k]) ? frame : "";
    const sellerNote = specifics["Hinweise des Verkäufers"];
    delete specifics["Artikelzustand"];
    delete specifics["Hinweise des Verkäufers"];
    const shipping = text(doc.querySelector(".ux-layout-section--shipping"));
    const body = text(doc.body).slice(0, 300000);
    items.push({
      id,
      status: 200,
      title: (text(doc.querySelector("h1.x-item-title__mainTitle")) || text(doc.querySelector("h1"))).replace(/\s*-$/, ""),
      priceText: text(doc.querySelector(".x-price-primary")),
      approxText: text(doc.querySelector(".x-price-approx")),
      condition,
      specifics,
      ...(descUrl ? { descUrl } : {}),
      ...(sellerNote ? { sellerNote: sellerNote.replace(/Mehr zum Thema.*$/, "").slice(0, 300) } : {}),
      seller: text(doc.querySelector(".x-sellercard-atf__info")).replace(/Mehr Artikel des Verkäufers.*$/, "").slice(0, 140),
      location: shipping.match(/Standort:\s*(.+?)(?=Lieferung|Bei Kombiversand|Rücknahme|Zahlung|Einfuhr|$)/)?.[1]?.trim() ?? "",
      returns: text(doc.querySelector(".ux-labels-values--returns")).replace(/^Rücknahme:\s*/, "").split(". ")[0]?.slice(0, 120) ?? "",
      buyNow: !!doc.querySelector(".x-bin-action"),
      bids: !!doc.querySelector(".x-bid-action"),
      offer: /Preisvorschlag/.test(body),
      ended: /Dieses Angebot wurde beendet|Angebot beendet|nicht mehr verfügbar|wurde vom Verkäufer beendet/.test(body) && !doc.querySelector(".x-bin-action"),
      photo: doc.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? "",
    });
  }
  return { items, loads };
}

/**
 * The measurements in sellers' descriptions, such as "W 37 x H 27 x D 5 cm" or "Breite: 40 cm", up
 * to three each, read in a tab on itm.ebaydesc.com, where the description frames live: from an
 * ebay.de page the browser refuses to read them.
 */
async function inEbayDescs(A: { urls: string[]; pause: number }): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [n, url] of A.urls.entries()) {
    // eslint-disable-next-line bun/prefer-builtin-sleep -- this runs in the shop's page, so no Bun globals
    if (n) await new Promise(resolve => setTimeout(resolve, A.pause));
    try {
      const res = await fetch(url, { credentials: "omit" });
      if (!res.ok) continue;
      const words = String(new DOMParser().parseFromString(await res.text(), "text/html").body?.textContent ?? "").replace(/\s+/g, " ");
      const sizes = words.match(/(?:[A-Za-z]{1,2}\s*[:.]?\s*)?\d{1,3}(?:[.,]\d)?\s*(?:cm)?\s*[x×]\s*(?:[A-Za-z]{1,2}\s*[:.]?\s*)?\d{1,3}(?:[.,]\d)?(?:\s*(?:cm)?\s*[x×]\s*(?:[A-Za-z]{1,2}\s*[:.]?\s*)?\d{1,3}(?:[.,]\d)?)?\s*cm|\b(?:breite|höhe|tiefe|länge|width|height|depth|length|[BHTWLD])\s*[:.]?\s*(?:ca\.?\s*)?\d{1,3}(?:[.,]\d)?\s*cm/gi) ?? [];
      // A stray letter from the text before it, as "nW37cm" after a broken line, is dropped
      const found = [...new Set(sizes.map(s => s.trim().replace(/^[a-z](?=[A-Z])/, "")))].slice(0, 3).join(", ");
      if (found) out[url] = found;
    } catch {
      // No description: the specifics stand
    }
  }
  return out;
}

/** An amount such as "EUR 1.590,00" or "ca. EUR 1.590,00", in euros. */
function euros(s: string | undefined): number | undefined {
  const m = (s ?? "").match(/(?:EUR|€)\s*(\d[\d.,]*)|(\d[\d.,]*)\s*(?:EUR|€)/);
  const amount = m?.[1] ?? m?.[2];
  if (!amount) return undefined;
  // The separator before the last two digits marks the cents; any other groups thousands
  const cents = amount.match(/[.,](\d{2})$/);
  const whole = (cents ? amount.slice(0, -3) : amount).replace(/[.,]/g, "");
  const n = Number(cents ? `${whole}.${cents[1]}` : whole);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * eBay.de's condition grades for used fashion, by the code its search filters them with
 * (LH_ItemCondition), named as its item pages name them. A search card says only "Gebraucht", so
 * the scan searches again under each grade's filter; a used card under neither has the middle
 * grade, EBAY_REST, which the filter for it (3000) can't single out, as it lists every used item.
 */
const EBAY_GRADES: [string, string][] = [["2990", "Gebraucht - Hervorragend"], ["3010", "Gebraucht - Akzeptabel"]];
const EBAY_REST = "Gebraucht - Gut";

/** A search card's condition: its label, with a used card's grade from eBay's filters, or the middle grade once they were all read. */
function cardCondition(lines: string[], grade: string | undefined, gradesRead: boolean): string | undefined {
  const label = lines.find(l => /^(Neu|Brandneu|Neuwertig|Gebraucht|Generalüberholt|Defekt)/.test(l))?.replace(/\s*\|$/, "");
  if (label !== "Gebraucht") return label;
  return grade ?? (gradesRead ? EBAY_REST : label);
}

/** A search card's lines in eBay.de's English layout, which it serves now and then, read as the German ones */
const EBAY_ENGLISH: [RegExp, string][] = [
  [/^Brand New\b.*/, "Neu"], [/^New \(Other\)/i, "Neu (Sonstige)"], [/^New with tags/i, "Neu mit Etikett"], [/^New without tags/i, "Neu ohne Etikett"],
  [/^Pre-?Owned\b.*/i, "Gebraucht"], [/^Used\b.*/i, "Gebraucht"], [/^Open box/i, "Neu (Sonstige)"], [/^(Refurbished|Certified - Refurbished)/i, "Generalüberholt"], [/^For parts/i, "Defekt"],
  [/^or Best Offer$/i, "oder Preisvorschlag"], [/^Authenticity Guarantee$/i, "Mit Echtheitsprüfung"],
  [/^(Private|Private seller)$/i, "Privat"], [/^(Business|Business seller)$/i, "Gewerblich"],
];
function germanLine(line: string): string {
  for (const [re, german] of EBAY_ENGLISH) if (re.test(line)) return german;
  const from = line.match(/^(?:from|Located in) (.+)$/i);
  if (from) return `aus ${from[1]}`;
  const bids = line.match(/^(\d+) bids?\b/i);
  if (bids) return `${bids[1]} Gebote`;
  return line;
}

async function ebay(tag: string, queries: string[], ids: string[], match: RegExp | null, details: boolean, pause: number): Promise<ScanFile> {
  const site = "https://www.ebay.de";
  const searched: string[] = [];
  let cards: EbayCard[] = [];
  // The cards --match left out, to skim for the item under another name
  let others: EbayCard[] = [];
  // Each used card's condition grade, from eBay's search filters
  let graded: Record<string, string> = {};
  let gradesRead = false;
  if (queries.length) {
    const r = await inTab(tag, site, inEbaySearch, { queries, pause, grades: EBAY_GRADES });
    // Searches count towards eBay's block as item pages do
    await spendBudget("ebay.de pages", r.loads);
    searched.push(...r.searched);
    if (r.blocked) searched.push(`stopped early: ${r.blocked}; eBay lifts a block within about ten minutes`);
    graded = r.graded;
    gradesRead = !r.blocked && !r.gradesBlocked;
    const tally = EBAY_GRADES.map(([, label]) => `${Object.values(graded).filter(g => g === label).length} ${label}`).join(", ");
    if (r.gradesBlocked) searched.push(`condition grades only partly read, as ${r.gradesBlocked}: ${tally}; the other used cards keep a bare Gebraucht`);
    else if (!r.blocked) searched.push(`condition grades from eBay's filters: ${tally}, the other used cards ${EBAY_REST}`);
    // Auctions don't count, even with a Buy It Now price
    for (const card of r.cards) card.lines = card.lines.map(germanLine);
    const auctions = r.cards.filter(c => c.lines.some(l => /^\d+ Gebote?\b/.test(l))).length;
    const buyNow = r.cards.filter(c => !c.lines.some(l => /^\d+ Gebote?\b/.test(l)));
    cards = buyNow.filter(c => !match || match.test(c.title));
    others = match ? buyNow.filter(c => !match.test(c.title)) : [];
    searched.push(`${r.cards.length} cards${auctions ? `, ${auctions} auctions left out` : ""}${match ? `, ${cards.length} with titles matching ${match}` : ""}`);
    searched.push(`${r.loads} search pages read, which count towards eBay's block`);
  }
  const wanted = [...new Set([...ids, ...(details ? cards.map(c => c.id) : [])])];
  const items = new Map<string, EbayItem>();
  // Only as many item pages as eBay takes before it blocks, counting what other runs read lately
  const { left, freeAt } = await budgetLeft("ebay.de pages");
  const now = wanted.slice(0, left);
  if (now.length) {
    const r = await inTab(tag, site, inEbayItems, { ids: now, pause });
    for (const item of r.items) items.set(item.id, item);
    await spendBudget("ebay.de pages", r.loads);
    if (r.blocked) searched.push(`item pages stopped: ${r.blocked}`);
    // The sellers' descriptions of those whose specifics give no size, for the measurements in them
    const descs = r.items.filter(i => i.descUrl);
    if (descs.length) {
      const sizes = await inTab(tag, "https://itm.ebaydesc.com", inEbayDescs, { urls: descs.map(i => i.descUrl!), pause });
      for (const i of descs) if (sizes[i.descUrl!]) i.descSize = sizes[i.descUrl!];
      searched.push(`${descs.length} sellers' descriptions read for sizes, ${Object.keys(sizes).length} giving some`);
    }
  }
  const later = wanted.filter(id => !items.has(id));
  if (later.length) {
    const at = (await budgetLeft("ebay.de pages")).freeAt;
    searched.push(`${later.length} item pages not read: eBay blocks after about 15 in ten minutes, so read them from ${(left ? at : freeAt).toTimeString().slice(0, 5)} on with --ids ${later.join(",")}`);
  }
  if (wanted.length) searched.push(`${items.size} item pages read`);

  const byId = new Map([...cards, ...others].map(c => [c.id, c]));
  const candidates: Candidate[] = [];
  const loose: Candidate[] = [];
  let gone = 0;
  const skim = new Set(others.map(c => c.id));
  for (const id of new Set([...cards.map(c => c.id), ...ids, ...skim])) {
    const card = byId.get(id);
    const item = items.get(id);
    if (!card && !item) continue;
    if (item && (item.ended || [404, 410].includes(item.status) || (item.status === 200 && !item.buyNow) || item.bids)) {
      gone++;
      continue;
    }
    const lines = card?.lines ?? [];
    const s = item?.specifics ?? {};
    const german = lines.some(l => /Lieferung|Versand|^Privat$|^Gewerblich$|^Gebraucht|^Neu\b/.test(l));
    const from = item?.location || lines.find(l => /^aus /.test(l))?.slice(4) || (card && german ? "Germany" : "");
    const code = from ? countryCode(from) : null;
    const priceLine = lines.find(l => /^(EUR|€)\s?\d|^\d[\d.,]*\s?(EUR|€)$/.test(l));
    const price = euros(item?.approxText) ?? euros(item?.priceText) ?? euros(priceLine);
    // A price in another currency stays in the note, for the agent to convert
    const foreign = price === undefined ? lines.find(l => /^(US \$|C \$|AU \$|\$|£|GBP|USD|CAD)\s?\d/.test(l)) : undefined;
    const specified = [["Taschenbreite", "W"], ["Taschenhöhe", "H"], ["Taschentiefe", "D"]].filter(([k]) => s[k!]).map(([k, l]) => `${l} ${s[k!]}`);
    const dims = specified.length ? specified : item?.descSize ? [`${item.descSize} (from the description)`] : [];
    const sellerType = lines.find(l => /^(Privat|Gewerblich)$/.test(l)) ?? item?.seller?.match(/Gewerblich|Privat/)?.[0];
    // Such as "luxuryfindsitalia(37)PrivatAngemeldet als ...": the name, ratings and kind of seller
    const sellerName = item?.seller?.match(/^(.*?)\((\d[\d.]*)\)/);
    const seller = sellerName ? `${sellerName[1]!.trim()} (${sellerName[2]} ratings)${sellerType ? `, ${sellerType}` : ""}` : sellerType;
    const original = item?.priceText?.replace(/oder Preisvorschlag.*$/, "").trim();
    const shipping = lines.find(l => /Lieferung|Versand|delivery|shipping|postage/i.test(l));
    const photo = [card?.photo, item?.photo].find(p => p && !/stockimage|\.gif$/.test(p));
    // Only the search card says whether eBay checks this listing: every item page mentions the check
    const auth = lines.includes("Mit Echtheitsprüfung");
    const model = [s["Produktlinie"], s["Modell"], s["Muster"]].filter(Boolean).join(", ");
    (skim.has(id) && !ids.includes(id) ? loose : candidates).push({
      id,
      shop: "eBay.de",
      url: `${site}/itm/${id}`,
      title: (card?.title || item?.title || "").replace(/\s*-$/, ""),
      brand: s["Marke"] ?? lines.find(l => /vuitton/i.test(l) && l.length < 40),
      ...(price !== undefined ? { price_eur: price } : {}),
      condition: item?.condition || cardCondition(lines, graded[id], gradesRead),
      ...(dims.length ? { size: dims.join(" × ") } : {}),
      ...(s["Außenfarbe"] || s["Farbe"] ? { color: s["Außenfarbe"] ?? s["Farbe"] } : {}),
      ...(s["Außenmaterial"] || s["Material"] ? { material: s["Außenmaterial"] ?? s["Material"] } : {}),
      ships_from: code ? (COUNTRY.of(code) ?? from) : from || "not stated",
      ...(code && !EU.has(code) ? { non_eu: true } : {}),
      ...(photo ? { photo } : {}),
      ...(card ? { auth } : {}),
      ...(model || item?.sellerNote ? { description: clip([model && `model: ${model}`, item?.sellerNote].filter(Boolean).join("; ")) } : {}),
      ...(seller ? { seller } : {}),
      note: [
        card && !item ? "from the search card" : "",
        foreign ? `price shown as ${foreign}, not converted` : "",
        item?.approxText && original && !/EUR/.test(original) ? `priced ${original}, converted by eBay` : "",
        lines.includes("oder Preisvorschlag") || item?.offer ? "best offer" : "",
        auth ? "eBay checks authenticity" : "",
        shipping ?? "",
        item?.returns ? `returns: ${item.returns}` : "",
      ].filter(Boolean).join("; "),
    });
  }
  if (gone) searched.push(`${gone} ended, sold or auctions, left out`);
  return { shop: "ebay", scanned_at: new Date().toISOString(), searched, candidates, ...(loose.length ? { loose } : {}) };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// --- Yaga ---------------------------------------------------------------------------------------

type YagaListItem = { slug: string; price: number; images?: { thumbnail?: string }[]; shop?: { activeSlug?: string }; listedAt?: string };
type YagaProduct = {
  name: string | null; description: string | null; price: number; currency?: string; status: string; reservedUntil?: string | null;
  condition?: { namesMultilang?: { en?: string } }; size?: { name?: string } | null; colors?: { name?: string }[] | null;
  materials?: { name?: string }[] | null; location?: string | null; shop?: { activeSlug?: string; name?: string };
  images?: { url?: string; thumbnail?: string }[];
};

async function yaga(brands: string[], query: string | null, match: RegExp | null): Promise<ScanFile> {
  const site = "https://www.yaga.ee";
  const all = (await getJson(`${site}/api/brand`)) as { data?: { id: number; name: string }[] } | { id: number; name: string }[];
  const list = Array.isArray(all) ? all : (all.data ?? []);
  const ids = list.filter(b => brands.some(name => norm(b.name) === norm(name))).map(b => b.id);
  if (!ids.length) die(`Yaga has no brand named ${brands.join(" or ")}`);
  const searched = [`brands ${list.filter(b => ids.includes(b.id)).map(b => `${b.name} (id ${b.id})`).join(", ")}`];
  const found: YagaListItem[] = [];
  for (let offset = 0; offset < 5000; offset += 60) {
    const q = query ? `&query=${encodeURIComponent(query)}` : "";
    const page = (await getJson(`${site}/api/product/search/?brands=[${ids.join(",")}]${q}&offset=${offset}&limit=60`)) as { data: { list: YagaListItem[] } };
    found.push(...page.data.list);
    // Its total isn't a real count: a short page is the last one
    if (page.data.list.length < 60) break;
  }
  searched.push(`${found.length} listings${query ? ` for "${query}"` : ""}`);
  const details = await pool(found, 8, item => getJson(`${site}/api/product/${item.slug}`, 100).then(d => ((d as { data?: YagaProduct }).data ?? d) as YagaProduct, () => null));
  const failed = found.filter((_, i) => !details[i]).map(item => item.slug);
  if (failed.length) searched.push(`${failed.length} listings whose details didn't load, so they're left out: ${failed.join(", ")}`);
  const candidates: Candidate[] = [];
  found.forEach((item, i) => {
    const d = details[i];
    if (!d || d.status !== "published" || (d.reservedUntil && new Date(d.reservedUntil) > new Date())) return;
    if (match && !match.test(`${d.name} ${d.description ?? ""}`)) return;
    const shop = d.shop?.activeSlug ?? item.shop?.activeSlug;
    candidates.push({
      id: item.slug,
      shop: "Yaga",
      url: `${site}/${shop}/toode/${item.slug}`,
      // Yaga listings rarely have a title: the description stands in for one
      title: d.name ?? clip((d.description ?? "").replace(/\s+/g, " "), 70) ?? "",
      price_eur: d.price,
      ...(d.condition?.namesMultilang?.en ? { condition: d.condition.namesMultilang.en } : {}),
      ...(d.size?.name ? { size: d.size.name } : {}),
      ...(d.colors?.length ? { color: d.colors.map(c => c.name).join(", ") } : {}),
      ...(d.materials?.length ? { material: d.materials.map(m => m.name).join(", ") } : {}),
      ships_from: d.location ? `${d.location}, Estonia` : "Estonia",
      photo: (item.images?.[0]?.thumbnail ?? "").replace(/\?s=\d+$/, ""),
      description: snippet(d.description, match),
      ...(d.shop?.name ? { seller: d.shop.name } : {}),
      ...(item.listedAt ? { listed: item.listedAt.slice(0, 10) } : {}),
    });
  });
  if (match) searched.push(`${candidates.length} for sale and matching /${match.source}/`);
  return { shop: "yaga", scanned_at: new Date().toISOString(), searched, candidates };
}

// --- Vinted (runs in the page) -----------------------------------------------------------------

type VintedCard = { id: string; url: string; label: string; photo: string };

/** The cards of Vinted's catalogue pages for each search, one page a second, until a page brings nothing new. */
async function inVinted(A: { searches: string[]; pause: number }): Promise<{ searched: string[]; cards: VintedCard[] }> {
  const searched: string[] = [];
  const cards = new Map<string, VintedCard>();
  // eslint-disable-next-line bun/prefer-builtin-sleep -- this runs in the shop's page, so no Bun globals
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  for (const search of A.searches) {
    let read = 0;
    let page = 1;
    for (; page <= 30; page++) {
      if (page > 1 || cards.size) await sleep(A.pause);
      const res = await fetch(`${location.origin}/catalog?${search}&page=${page}`, { credentials: "include" });
      if (!res.ok) {
        searched.push(`${search}: page ${page} answered ${res.status}, so the rest wasn't read`);
        break;
      }
      const doc = new DOMParser().parseFromString(await res.text(), "text/html");
      const links = [...doc.querySelectorAll('a[data-testid$="--overlay-link"]')];
      let fresh = 0;
      for (const a of links) {
        const id = String(a.getAttribute("data-testid") ?? "").match(/product-item-id-(\d+)/)?.[1];
        if (!id || cards.has(id)) continue;
        const img = doc.querySelector(`[data-testid="product-item-id-${id}--image--img"]`);
        cards.set(id, { id, url: new URL(String(a.getAttribute("href")).split("?")[0]!, location.origin).href, label: a.getAttribute("title") ?? "", photo: img?.getAttribute("src") ?? "" });
        fresh++;
      }
      read += links.length;
      if (!fresh) break;
    }
    searched.push(`${search}: ${read} cards on ${page} pages`);
  }
  return { searched, cards: [...cards.values()] };
}

/**
 * Vinted's catalogue for each --query, with --filters added to the URL as they are (such as
 * brand_ids[]=417 for Louis Vuitton), read from its cards: a card's label gives the title, brand,
 * model, size, condition and price.
 */
async function vinted(tag: string, queries: string[], filters: string | null, brands: string[], match: RegExp | null, pause: number): Promise<ScanFile> {
  const site = "https://www.vinted.ee";
  const searches = (queries.length ? queries : [""]).map(q => [q ? `search_text=${encodeURIComponent(q)}` : "", filters ?? ""].filter(Boolean).join("&"));
  const r = await inTab(tag, site, inVinted, { searches, pause });
  // A label reads "<title>, Kaubamärk: Louis Vuitton, Mudel: Marelle, Seisukord: Väga hea, 1620.63 €, 1702.36 €"
  const LABELS: Record<string, string> = { kaubamärk: "brand", brand: "brand", mudel: "model", model: "model", suurus: "size", size: "size", seisukord: "condition", condition: "condition" };
  const candidates: Candidate[] = [];
  const loose: Candidate[] = [];
  for (const card of r.cards) {
    const parts = card.label.split(", ");
    const prices = parts.filter(p => /^[\d.]+\s*€$/.test(p)).map(p => Number(p.replace(/[^\d.]/g, "")));
    const fields: Record<string, string> = {};
    const title: string[] = [];
    for (const part of parts) {
      const m = part.match(/^([^:]{2,20}):\s*(.+)$/);
      const field = m ? LABELS[m[1]!.toLowerCase()] : undefined;
      if (field) fields[field] = m![2]!;
      else if (!/^[\d.]+\s*€$/.test(part) && !Object.keys(fields).length) title.push(part);
    }
    if (brands.length && !brands.some(b => norm(fields.brand ?? "") === norm(b))) continue;
    const text = `${title.join(", ")} ${fields.model ?? ""}`;
    (match && !match.test(text) ? loose : candidates).push({
      id: card.id,
      shop: "Vinted",
      url: card.url,
      title: `${title.join(", ")}${fields.model ? ` (model ${fields.model})` : ""}`,
      ...(fields.brand ? { brand: fields.brand } : {}),
      ...(prices[0] !== undefined ? { price_eur: prices[0] } : {}),
      ...(fields.condition ? { condition: fields.condition } : {}),
      ...(fields.size ? { size: fields.size } : {}),
      ships_from: "not stated",
      photo: card.photo,
      ...(prices[1] !== undefined ? { note: `€${prices[1]} with buyer protection, shipping on top` } : {}),
    });
  }
  const searched = [...r.searched, `${candidates.length} cards${brands.length ? ` by ${brands.join(" or ")}` : ""}${match ? ` matching ${match}` : ""}`];
  return { shop: "vinted", scanned_at: new Date().toISOString(), searched, candidates, loose };
}

// --- A Retro Tale (Searchspring) and ReSee (Algolia) -------------------------------------------

/** A Retro Tale's site id on Searchspring, the search service its pages call. */
const ARETROTALE_SITE = "ws4kxb";

/* eslint-disable @typescript-eslint/no-explicit-any -- the search services' own JSON */
async function aretrotale(brands: string[], query: string | null, match: RegExp | null): Promise<ScanFile> {
  const searched: string[] = [];
  const all = new Map<string, any>();
  for (const brand of brands.length ? brands : [""]) {
    for (let page = 1; page <= 100; page++) {
      const params = new URLSearchParams({ siteId: ARETROTALE_SITE, resultsFormat: "native", resultsPerPage: "100", page: String(page) });
      if (query) params.set("q", query);
      if (brand) params.set("filter.brand", brand);
      const d = (await getJson(`https://${ARETROTALE_SITE}.a.searchspring.io/api/search/search.json?${params}`)) as any;
      for (const r of d.results ?? []) all.set(String(r.uid ?? r.id), r);
      if (page === 1) searched.push(`${brand || "the whole shop"}${query ? `, "${query}"` : ""}: ${d.pagination?.totalResults ?? 0} items`);
      if (page >= (d.pagination?.totalPages ?? 1)) break;
    }
  }
  const items = [...all.values()].filter(r => Number(r.stock ?? 1) > 0 && (!match || match.test(`${r.name} ${r.description ?? ""}`)));
  if (match) searched.push(`${items.length} in stock matching ${match}`);
  const candidates: Candidate[] = items.map(r => ({
    id: String(r.uid ?? r.id),
    shop: "A Retro Tale",
    url: `https://aretrotale.com/en/product/${r.url}`,
    title: r.name,
    brand: r.brand,
    price_eur: Number(r.price),
    ...(r.general_condition ? { condition: r.general_condition } : {}),
    ...(r.color_label_hex ? { color: String(r.color_label_hex).split(":")[1] } : {}),
    ships_from: "Sweden",
    photo: r.imageUrl,
    description: snippet(r.description, match),
  }));
  searched.push("prices are in euros with delivery and duties to Estonia included; A Retro Tale checks authenticity itself");
  return { shop: "aretrotale", scanned_at: new Date().toISOString(), searched, candidates };
}

/**
 * ReSee's product index on Algolia, with the search-only key its own pages use, read from its
 * script bundle so that a new key doesn't break the scan.
 */
async function reseeIndex(): Promise<{ url: string; headers: Record<string, string> }> {
  const site = "https://www.resee.com";
  const page = await fetch(`${site}/en/`, { headers: { "user-agent": UA } }).then(r => r.text());
  const bundle = page.match(/https:\/\/media\.resee\.com\/build\/shop\/app\.[0-9a-f]+\.js/)?.[0];
  const env = page.match(/data-search-env="([^"]+)"/)?.[1];
  if (!bundle || !env) die("ReSee's page no longer names its search bundle: search it in the browser");
  const js = await fetch(bundle, { headers: { "user-agent": UA } }).then(r => r.text());
  const keys = js.match(/dataset\.searchEnv,[^}]*?"([A-Z0-9]{10})",\w="([0-9a-f]{32})"/);
  if (!keys) die("ReSee's bundle no longer holds its search key where the scan looks: search it in the browser");
  return {
    url: `https://${keys[1]}-dsn.algolia.net/1/indexes/${env}product/query`,
    headers: { "x-algolia-application-id": keys[1]!, "x-algolia-api-key": keys[2]!, "content-type": "application/json" },
  };
}

async function resee(brands: string[], query: string | null, match: RegExp | null): Promise<ScanFile> {
  const index = await reseeIndex();
  const searched: string[] = [];
  const all = new Map<string, any>();
  for (const brand of brands.length ? brands : [""]) {
    const text = [brand, query].filter(Boolean).join(" ");
    for (let page = 0; page < 50; page++) {
      await pace(500);
      const d = (await fetch(index.url, { method: "POST", headers: index.headers, body: JSON.stringify({ query: text, hitsPerPage: 1000, page }) }).then(r => r.json())) as any;
      for (const h of d.hits ?? []) if (!brand || norm(h.brand_en ?? "") === norm(brand)) all.set(String(h.objectID), h);
      if (page === 0) searched.push(`"${text}": ${d.nbHits ?? 0} items`);
      if (page + 1 >= (d.nbPages ?? 1)) break;
    }
  }
  const items = [...all.values()].filter(h => !h.sold && !h.on_hold && (!match || match.test(`${h.title_en} ${stripHtml(h.content_en ?? "")}`)));
  searched.push(`${items.length} for sale${brands.length ? ` by ${brands.join(" or ")}` : ""}${match ? ` matching ${match}` : ""}`);
  const candidates: Candidate[] = items.map(h => {
    // Prices differ by zone: Estonia's, else the EU's
    const zone = h.prices?.zee?.EUR?.en ?? h.prices?.UE?.EUR?.en ?? h.prices?.zfr?.EUR?.en;
    return {
      id: String(h.objectID),
      shop: "ReSee",
      url: `https://www.resee.com${h.url_en}`,
      title: h.title_en,
      brand: h.brand_en,
      ...(zone ? { price_eur: zone.price_number / 100 } : {}),
      ...(h.condition_en ? { condition: h.condition_en } : {}),
      ...(h.sizes?.length ? { size: h.sizes.map((z: any) => (typeof z === "object" ? (z.label_en ?? z.label ?? z.name ?? z.value ?? Object.values(z).find(v => typeof v === "string")) : z)).filter(Boolean).join(", ") } : {}),
      ...(h.color_en ? { color: [h.color_en].flat().join(", ") } : {}),
      ...(h.material_en ? { material: [h.material_en].flat().join(", ") } : {}),
      ...(h.location === "EU" ? { ships_from: "France" } : h.location ? { ships_from: h.location } : {}),
      photo: h.image_urls?.[0],
      description: snippet(stripHtml(h.content_en ?? ""), match),
    };
  });
  return { shop: "resee", scanned_at: new Date().toISOString(), searched, candidates };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// --- Collector Square (its search pages) --------------------------------------------------------

/** Collector Square's condition codes, such as 3vgod, by their letters. */
const CS_CONDITIONS: Record<string, string> = { new: "New", likn: "Like new", exce: "Excellent", vgod: "Very good", good: "Good", used: "Used", fair: "Fair" };

/**
 * Collector Square's search for each --query, read from the data each card carries (name, price,
 * model, material, condition), 120 cards a page; --brand keeps the cards whose name starts with it.
 */
async function collectorsquare(queries: string[], brands: string[], match: RegExp | null): Promise<ScanFile> {
  const site = "https://www.collectorsquare.com";
  const searched: string[] = [];
  const cards = new Map<string, Record<string, string>>();
  for (const q of queries) {
    let read = 0;
    let page = 1;
    for (; page <= 30; page++) {
      await pace(1000);
      const url = `${site}/en/search?search%5Bkeywords%5D=${encodeURIComponent(q)}&limit=120&page=${page}`;
      const res = await Bun.$`curl -sSL --compressed --max-time 30 -A ${UA} ${url}`.quiet().nothrow();
      if (res.exitCode !== 0) {
        searched.push(`"${q}": page ${page} didn't load, so the rest wasn't read`);
        break;
      }
      const html = res.stdout.toString();
      let fresh = 0;
      for (const card of html.split('<li class="product ').slice(1)) {
        const data = Object.fromEntries([...card.slice(0, 3000).matchAll(/data-product-([a-z]+)="([^"]*)"/g)].map(m => [m[1]!, m[2]!]));
        if (!data.code || cards.has(data.code)) continue;
        data.url = card.match(/<meta itemprop="url" content="([^"]+)"/)?.[1] ?? "";
        data.photo = card.match(/<meta itemprop="image" content="([^"]+)"/)?.[1] ?? "";
        cards.set(data.code, data);
        fresh++;
      }
      read += fresh;
      if (!fresh) break;
    }
    searched.push(`"${q}": ${read} cards`);
  }
  const html = (s: string) => s.replace(/&#039;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
  const candidates: Candidate[] = [];
  for (const d of cards.values()) {
    const name = html(d.name ?? "").replace(/\s+/g, " ").trim();
    if (brands.length && !brands.some(b => norm(name).startsWith(norm(b)))) continue;
    if (match && !match.test(`${name} ${d.model ?? ""}`)) continue;
    candidates.push({
      id: d.code!,
      shop: "Collector Square",
      url: d.url || `${site}/en/search?search%5Bkeywords%5D=${d.code}`,
      title: name,
      ...(Number(d.price) ? { price_eur: Number(d.price) } : {}),
      ...(d.condition ? { condition: CS_CONDITIONS[d.condition.replace(/^\d/, "")] ?? d.condition } : {}),
      ...(d.material ? { material: d.material } : {}),
      ships_from: "France",
      ...(d.photo ? { photo: d.photo } : {}),
      ...(d.model ? { description: `model ${d.model}` } : {}),
    });
  }
  searched.push(`${candidates.length} cards${brands.length ? ` by ${brands.join(" or ")}` : ""}${match ? ` matching ${match}` : ""}; Collector Square checks authenticity itself`);
  return { shop: "collectorsquare", scanned_at: new Date().toISOString(), searched, candidates };
}

// --- Model codes --------------------------------------------------------------------------------

/**
 * Mark each candidate with its model code: a code-like token in its title or description (letters
 * and digits, such as Louis Vuitton's M80689 or a style number) that other candidates share or an
 * earlier search saved, so an agent can judge a whole code at once. What an earlier search saved
 * the code as goes in model.
 */
export async function markCodes(candidates: Candidate[]): Promise<void> {
  const learned = await learnedCodes();
  const titles = candidates.map(c => codeTokens(c.title));
  const tokens = candidates.map((c, i) => [...new Set([...titles[i]!, ...codeTokens(c.description ?? "")])]);
  const inTitles = new Set(titles.flat());
  const count = new Map<string, number>();
  for (const list of tokens) for (const t of list) count.set(t, (count.get(t) ?? 0) + 1);
  // Descriptions hold serial numbers and measurements too, so a code is one an earlier search
  // saved, or one that is in a title and that several candidates share
  const isCode = (t: string) => !!learned[t] || (inTitles.has(t) && count.get(t)! > 1);
  candidates.forEach((c, i) => {
    // A code an earlier search saved first, then the one most candidates share
    const code = tokens[i]!
      .filter(isCode)
      .sort((a, b) => Number(!!learned[b]) - Number(!!learned[a]) || count.get(b)! - count.get(a)!)[0];
    if (!code) return;
    c.code = code;
    const saved = learned[code];
    if (!saved) return;
    // Where listings with the code were saved as different items, say how many were saved as each
    const votes = Object.entries(saved.votes ?? {}).sort((a, b) => b[1] - a[1]);
    const total = votes.reduce((sum, [, n]) => sum + n, 0);
    c.model = saved.item;
    if (votes.length > 1) c.saves = `${votes[0]![1]} of ${total} saves; else ${votes.slice(1, 3).map(([item, n]) => `"${item}" ${n}×`).join(", ")}`;
  });
}

/**
 * Group the candidates without a code by their material, colour and longer side, such as
 * LEATHER/WHITE/25CM, where the scan gives them, so an agent can judge alike ones at once too.
 */
export function markTraits(candidates: Candidate[]): void {
  const first = (s: unknown) => String((Array.isArray(s) ? s[0] : s) ?? "").split(/[,;]/)[0]!.trim().toUpperCase();
  const byTraits = new Map<string, Candidate[]>();
  for (const c of candidates) {
    if (c.code) continue;
    // Without a size, material and colour alone lump wallets with bags
    const width = longSide(c.size);
    const parts = [first(c.material), first(c.color), width ? `${width}CM` : ""];
    if (!width || parts.filter(Boolean).length < 2) continue;
    const traits = parts.map(p => p || "?").join("/");
    byTraits.set(traits, [...(byTraits.get(traits) ?? []), c]);
  }
  for (const [traits, cs] of byTraits) if (cs.length > 1) for (const c of cs) c.traits = traits;
}

/**
 * One line per code: how many candidates have it, what it was saved as before and two of their
 * titles; then the same for groups of alike candidates without a code.
 */
export function codeSummary(candidates: Candidate[]): string[] {
  const lines: string[] = [];
  for (const field of ["code", "traits"] as const) {
    const groups = new Map<string, Candidate[]>();
    for (const c of candidates) if (c[field]) groups.set(c[field]!, [...(groups.get(c[field]!) ?? []), c]);
    if (!groups.size) continue;
    if (field === "traits") lines.push("alike without a code (material/colour/width):");
    for (const [name, cs] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
      const titles = [...new Set(cs.map(c => c.title))].sort((a, b) => a.length - b.length).slice(0, 2).map(t => `"${clip(t, 80)}"`);
      const saved = cs[0]!.model ? `saved before as "${cs[0]!.model}"${cs[0]!.saves ? ` (${cs[0]!.saves})` : ""}; ` : "";
      lines.push(`${name} ×${cs.length}: ${saved}${titles.join(", ")}`);
    }
  }
  if (!lines.length) return [];
  return [...lines, `neither ×${candidates.filter(c => !c.code && !c.traits).length}`];
}

// --- Output -------------------------------------------------------------------------------------

/** The most that --match may leave out and still be listed to skim */
const LOOSE_MAX = 300;

function line(c: Candidate): string {
  const price = c.price_eur !== undefined ? `€${c.price_eur}` : c.price !== undefined ? `${c.price} ${c.currency}` : "price?";
  const ships = c.ships_from === "not stated" ? "?" : (c.ships_from ?? "?").replace(/ \(.*\)$/, "");
  const details = [c.material, c.color, c.size, c.note, c.seller && `seller ${c.seller}`].filter(Boolean).join("; ");
  const code = c.code ? ` | ${c.code}${c.model ? `: ${c.model}` : ""}` : "";
  return `${c.id} | ${price} | ${c.condition ?? "?"} | ${ships}${c.non_eu ? " (non-EU)" : ""} | ${c.title}${details ? ` | ${details}` : ""}${code}`;
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      brand: { type: "string", multiple: true, default: [] },
      model: { type: "string", multiple: true, default: [] },
      category: { type: "string", multiple: true, default: [] },
      query: { type: "string", multiple: true, default: [] },
      ids: { type: "string" },
      details: { type: "boolean" },
      pause: { type: "string" },
      known: { type: "string" },
      match: { type: "string" },
      side: { type: "string" },
      filters: { type: "string" },
      shops: { type: "string" },
      tag: { type: "string" },
      out: { type: "string" },
      profile: { type: "boolean" },
      full: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });
  const [shop] = positionals;
  if (values.help || !shop || positionals.length > 1) {
    console.log(USAGE);
    return values.help ? 0 : 2;
  }
  let match: RegExp | null = null;
  try {
    match = values.match ? new RegExp(values.match, "i") : null;
  } catch (e) {
    die(`--match isn't a valid regex: ${e}`);
  }
  const brands = values.brand;
  // One --query, except for eBay, Farfetch and Vinted, which take several
  if (!["ebay", "farfetch", "vinted", "collectorsquare"].includes(shop!) && values.query.length > 1) die(`${shop} takes one --query`);
  const pause = Number(values.pause ?? (shop === "ebay" ? 2000 : 1500));
  if (!Number.isFinite(pause) || pause < 0) die("--pause takes milliseconds");
  const query = values.query[0] ?? null;
  const needTag = () => values.tag ?? die(`${shop} runs in the ai-skills browser: give your tab tag with --tag`);
  let result: ScanFile;
  if (shop === "shopify") {
    const domains = values.shops ? values.shops.split(",").map(d => d.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "")) : Object.keys(SHOPIFY);
    if (values.profile) {
      await shopifyProfile(domains, values.tag, Boolean(values.full));
      return 0;
    }
    if (!brands.length) die("give the brand with --brand");
    result = await shopify(domains, brands, match, !!values.full, values.tag);
  } else if (shop === "vestiaire") {
    if (brands.length !== 1) die("give exactly one --brand, as Vestiaire names the designer (scan each brand separately)");
    let filters: Record<string, string[]> = {};
    try {
      filters = values.filters ? JSON.parse(values.filters) : {};
    } catch (e) {
      die(`--filters isn't valid JSON: ${e}`);
    }
    result = await vestiaire(needTag(), { brand: brands[0]!, models: values.model, query, filters, match: values.match ?? null });
  } else if (shop === "jolicloset") {
    if (!values.category.length && !query) die("give a --category or a --query");
    result = await jolicloset(needTag(), values.category, query, values.match ?? null);
  } else if (shop === "yaga") {
    if (!brands.length) die("give the brand with --brand");
    result = await yaga(brands, query, match);
  } else if (shop === "vinted") {
    result = await vinted(needTag(), values.query, values.filters ?? null, brands, match, pause);
  } else if (shop === "collectorsquare") {
    if (!values.query.length) die("give a --query");
    result = await collectorsquare(values.query, brands, match);
  } else if (shop === "aretrotale" || shop === "resee") {
    if (!brands.length) die("give the brand with --brand");
    result = await (shop === "aretrotale" ? aretrotale : resee)(brands, query, match);
  } else if (shop === "farfetch") {
    if (!values.category.length && !query) die("give a --category or a --query");
    result = await farfetch(needTag(), values.category, values.query, brands, values.match ?? null, pause);
  } else if (shop === "ebay") {
    const ids = (values.ids ?? "").split(/[\s,]+/).filter(id => /^\d+$/.test(id));
    if (!values.query.length && !ids.length) die("give a --query or --ids");
    result = await ebay(needTag(), values.query, ids, match, !!values.details, pause);
  } else {
    die(`no scanner for ${shop}: the shops are shopify, vestiaire, jolicloset, yaga, vinted, collectorsquare, aretrotale, resee, farfetch and ebay`);
  }
  // What --match left out: a candidate after all when --side says its size fits, else listed
  // apart to skim
  let loose = result.loose ?? [];
  if (values.side) {
    const m = values.side.match(/^(\d+(?:[.,]\d+)?)\s*[-,]\s*(\d+(?:[.,]\d+)?)$/);
    if (!m) die(`--side takes a range of the longer side in cm, such as 9-10.5: ${values.side}`);
    const [lo, hi] = [Number(m[1]!.replace(",", ".")), Number(m[2]!.replace(",", "."))];
    const fits = loose.filter(c => {
      const side = longSide(c.size);
      return side !== undefined && side >= lo && side <= hi;
    });
    for (const c of fits) c.note = [c.note, "--match left it out, kept by its size"].filter(Boolean).join("; ");
    result.candidates.push(...fits);
    loose = loose.filter(c => !fits.includes(c));
    result.searched.push(`${fits.length} that --match left out kept by their size, ${lo} to ${hi} cm`);
  }
  await markCodes([...result.candidates, ...loose]);
  markTraits(result.candidates);
  // A repeat run lists only the candidates the last run didn't judge; merge carries over the rest
  let shown = result.candidates;
  if (values.known) {
    const verdicts = await lastVerdicts(values.known);
    for (const c of [...result.candidates, ...loose]) c.known = verdicts.get(key(c.url))?.kind;
    shown = result.candidates.filter(c => !c.known);
    const n = (kind: string) => result.candidates.filter(c => c.known === kind).length;
    result.searched.push(verdicts.size
      ? `${result.candidates.length - shown.length} judged in the last run of ${values.known} (${n("match")} matches, ${n("near")} near, ${n("out")} out), which listings.ts merge --known carries over: only the ${shown.length} new ones are listed`
      : `no verdicts saved for ${values.known} yet, so every candidate is listed`);
  }
  let skim = loose.filter(c => !c.known);
  if (skim.length > LOOSE_MAX) {
    result.searched.push(`--match left out ${skim.length} more, too many to skim: loosen --match or narrow the search to see them`);
    loose = skim = [];
  }
  if (loose.length) result.loose = loose;
  else delete result.loose;
  const out = values.out ?? `${(Bun.env.TMPDIR ?? "/tmp").replace(/\/$/, "")}/fashion-hunt/scan-${shop}-${Date.now()}.json`;
  await Bun.write(out, JSON.stringify(result, null, 1));
  for (const s of result.searched) console.log(`# ${s}`);
  const codes = codeSummary(shown);
  if (codes.length) console.log(`# groups to judge at once, by model code:\n${codes.map(l => `#   ${l}`).join("\n")}`);
  console.log(`# ${shown.length} candidates below, sorted by price; all ${result.candidates.length}, with every field, saved in ${out}`);
  const price = (c: Candidate) => c.price_eur ?? c.price ?? Infinity;
  for (const c of [...shown].sort((a, b) => price(a) - price(b))) console.log(line(c));
  if (skim.length) {
    console.log(`# ${skim.length} more below that the searches found but --match left out: skim them for the item under another name, and save a match by id (sheet.ts --ids shows their photos); --rest out marks the rest`);
    for (const c of [...skim].sort((a, b) => price(a) - price(b))) console.log(line(c));
  }
  return 0;
}

if (import.meta.main) process.exit(await main());
