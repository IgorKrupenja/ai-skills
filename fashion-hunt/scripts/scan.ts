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
import { EU, countryCode } from "./common.ts";

const USAGE = `Scan a shop's catalogue for a fashion-hunt search and list the candidates.

    scan.ts shopify    --brand <name> [--shops <domain>,...] [--match <regex>] [--full] [--out <file>]
    scan.ts shopify    --profile [--shops <domain>,...]
    scan.ts vestiaire  --tag <tab tag> --brand <name> [--model <name>]... [--query <text>]
                       [--filters <json>] [--match <regex>] [--out <file>]
    scan.ts jolicloset --tag <tab tag> (--category <path>... | --query <text>) [--match <regex>]
                       [--out <file>]
    scan.ts yaga       --brand <name> [--query <text>] [--match <regex>] [--out <file>]
    scan.ts farfetch   --tag <tab tag> (--category <path>... | --query <text>...) [--brand <name>]...
                       [--match <regex>] [--pause <ms>] [--out <file>]
    scan.ts ebay       --tag <tab tag> [--query <text>]... [--match <regex>] [--details]
                       [--ids <id>,...] [--pause <ms>] [--out <file>]

--brand        a brand as the shop names it; repeat it for aliases (--brand "Louis Vuitton" --brand LV)
--match        keep only items whose title (and description, where the list has one) matches this
               case-insensitive regex, such as "marel" for Marelle, Marellini and misspellings
--out          where to save every candidate as JSON (default: a file in $TMPDIR, printed at the end)
--tag          the tab tag of the agent running the scan, as for tab.ts: the scan opens the tab if
               it isn't open, and leaves it open

shopify     the products of the brand's collection (such as /collections/louis-vuitton), which
            holds the brand's products in stock, where the shop has one, or else of the whole
            catalogue (also with --full), kept when the vendor, title or tags name the brand.
            Prices are the shop's own euro prices. --shops takes domains (default: the
            bookmarked Shopify shops, listed in SHOPIFY below). --profile prints what each shop
            carries instead: products in stock, vendors and product types.
vestiaire   the search the catalog page loads, unsold items only, 200 a call: --brand picks the
            designer and its collaborations ("Louis Vuitton x Yayoi Kusama"), --model the model
            filter (repeat it for several, such as Marelle and Marellini), plus a text search for
            each model name, which finds listings whose seller set no model; --query adds a text
            search of its own, --filters adds raw filters such as '{"color.id":["1"]}'. Each
            candidate is then checked with the product API: material, colour, condition,
            measurements, buyer fee and whether it's for sale now.
jolicloset  the result pages of a designer category (such as
            designers-women/louis-vuitton/womens-bags) or of a text search in both the women's and
            men's sections, read from the list data each page embeds, 60 a page; then each
            candidate's product page: condition, fabric, colours, dimensions and seller.
yaga        the search API for the brand (and text), then each product's details.
farfetch    the result pages of each text search in the women's and men's sections, or of a
            designer listing (such as women/louis-vuitton-pre-owned, 20 pages and more for a big
            brand), from the item list each page embeds, 96 a page; --brand keeps that designer's
            items; then each candidate's product page: colour, composition, measurements and
            condition. One page at a time, --pause ms apart (default 1500), since Farfetch answers
            a burst with 429. Prices are Farfetch Estonia's euros, import duties included.
ebay        eBay.de's search cards for each --query, Buy It Now only and up to the count in the
            results heading, auctions left out; --details also reads every candidate's item page
            (condition grade, item specifics such as material, colour and measurements, where it
            ships from, returns), and --ids reads the item pages of those listings alone. Pages are
            read signed out, --pause ms apart (default 2000). eBay answers 403 after about 15 item
            pages, whether 1.5 or 4 seconds apart, and lifts the block within about ten minutes,
            so read item pages for a few cards only.

Prints one line per candidate: id | price | condition | ships from | title | details. Agents
save their picks by id with scripts/listings.ts add --scan <out file>, so they don't retype
fields.
`;

const TAB = `${import.meta.dir}/tab.ts`;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36";

/** The bookmarked shops on Shopify, with the country they ship from. */
const SHOPIFY: Record<string, { name: string; country: string }> = {
  "curatedbynoar.eu": { name: "Curated by NOAR", country: "Estonia" },
  "affordableluxurys.com": { name: "Affordable Luxury", country: "not stated" },
  "queenstation.fi": { name: "Queen Station", country: "Finland" },
  "www.reluxeroom.com": { name: "ReLuxe Room", country: "Bulgaria" },
  "www.designerexchange.ie": { name: "Designer Exchange", country: "Ireland" },
  "luxuryhelsinki.fi": { name: "Luxury Helsinki", country: "Finland" },
  "labellov.com": { name: "Labellov", country: "Belgium" },
  "bamluxurystore.com": { name: "Bam Luxury Store", country: "Spain" },
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
  photo?: string;
  description?: string;
  seller?: string;
  listed?: string;
  /** Anything that changes whether or how it can be bought: a buyer fee, reserved, not for sale */
  note?: string;
};

export type ScanFile = { shop: string; scanned_at: string; searched: string[]; candidates: Candidate[] };

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
const words = (s: string) => new RegExp(`(^|[^a-z0-9])${norm(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`);
const stripHtml = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const clip = (s: string | undefined, n = 300) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);
/** About 300 characters of a description: around the first hit of re where it has one, else its start. */
function snippet(text: string | null | undefined, re: RegExp | null, n = 300): string | undefined {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  const at = re ? flat.search(re) : -1;
  if (at < 0 || flat.length <= n) return clip(flat, n);
  const start = Math.max(0, at - 100);
  return `${start ? "…" : ""}${flat.slice(start, start + n - 1)}…`;
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

/** Run fn(args) inside the page of a tab of the ai-skills browser that is on origin. */
async function inTab<A, R>(tag: string, origin: string, fn: (args: A) => Promise<R>, args: A): Promise<R> {
  const code = `async (p) => {
    if (!p.url().startsWith(${JSON.stringify(origin)})) await p.goto(${JSON.stringify(`${origin}/`)}, { waitUntil: "domcontentloaded" });
    return JSON.stringify(await p.evaluate(${fn.toString()}, ${JSON.stringify(args)}));
  }`;
  const run = () => Bun.$`bun ${TAB} run --timeout 400 ${tag} < ${new Response(code)}`.quiet().nothrow();
  let ran = await run();
  if (ran.exitCode !== 0 && /no tab for tag|is gone/.test(ran.stderr.toString())) {
    const opened = await Bun.$`bun ${TAB} open ${tag} ${`${origin}/`}`.quiet().nothrow();
    if (opened.exitCode !== 0) die(`couldn't open a tab for ${origin}: ${opened.stderr.toString().trim()}`);
    ran = await run();
  }
  if (ran.exitCode !== 0) die(`the scan failed in the browser: ${ran.stderr.toString().trim().slice(0, 1500)}`);
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
 * A shop's products: those of the first brand collection it has (such as /collections/louis-vuitton,
 * which in the shops checked holds exactly the brand's products in stock), or else its whole
 * catalogue, sold products included.
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

/** The handle Shopify gives a collection named after the brand, such as louis-vuitton. */
const handleOf = (brand: string) => norm(brand).replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const tagList = (p: ShopifyProduct) => (Array.isArray(p.tags) ? p.tags : p.tags.split(/,\s*/));

async function shopify(domains: string[], brands: string[], match: RegExp | null, full: boolean): Promise<ScanFile> {
  const brandRes = brands.map(words);
  const searched: string[] = [];
  const candidates: Candidate[] = [];
  const handles = full ? [] : [...new Set(brands.map(handleOf).filter(h => h.length > 2))];
  const results = await Promise.all(
    domains.map(domain => shopifyCatalogue(domain, handles).then(r => ({ domain, ...r }), (e: unknown) => ({ domain, error: String(e) }))),
  );
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
      if (currency !== "EUR") {
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

async function shopifyProfile(domains: string[]): Promise<void> {
  const results = await Promise.all(domains.map(d => shopifyCatalogue(d, []).then(r => ({ d, ...r }), (e: unknown) => ({ d, error: String(e) }))));
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
    console.log(`${name} (${r.d}, ${r.currency}): ${r.products.length} products, ${inStock.length} in stock`);
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
};
type VestiaireResult = { error?: string; searched: string[]; items: VestiaireItem[] };

async function inVestiaire(A: VestiaireArgs): Promise<VestiaireResult> {
  const searched: string[] = [];
  const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  const fields = ["name", "description", "brand", "model", "country", "price", "link", "sold", "pictures", "colors", "size", "condition", "seller", "createdAt"];
  async function search(q: string | null, filters: Record<string, string[]>, offset: number, limit: number, facets: string[]): Promise<any> {
    const res = await fetch("https://search.vestiairecollective.com/v1/product/search", {
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
  for (const pass of passes) {
    let total = 0;
    let added = 0;
    for (let offset = 0; offset < 10000; offset += 200) {
      const page = await search(pass.q, pass.filters, offset, 200, []);
      total = page.paginationStats?.totalHits ?? 0;
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
          seller: `${it.seller?.firstname ?? ""}${it.seller?.isOfficialStore ? " (official store)" : ""}`,
          listed: it.createdAt ? new Date(it.createdAt * 1000).toISOString().slice(0, 10) : "",
        });
      }
      if (offset + 200 >= Math.min(total, 10000)) break;
    }
    searched.push(`${pass.label}: ${total} unsold listings, ${added} not found by an earlier pass${total >= 10000 ? " (only the first 10,000 can be read: narrow the search)" : ""}`);
  }
  const re = A.match ? new RegExp(A.match, "i") : null;
  const kept = re ? items.filter(i => re.test(`${i.title} ${i.model} ${i.description}`)) : items;
  if (re) searched.push(`${kept.length} matching /${A.match}/`);
  // The product API: what the listing page shows, 20 at a time
  for (let i = 0; i < kept.length; i += 20) {
    await Promise.all(kept.slice(i, i + 20).map(async item => {
      try {
        const res = await fetch(`https://apiv2.vestiairecollective.com/products/${item.id}?isoCountry=EE&x-siteid=13&x-language=en&x-currency=EUR`, { headers: { accept: "application/json" } });
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
      } catch { /* keep what the search gave */ }
    }));
  }
  return { searched, items: kept };
}

async function vestiaire(tag: string, args: VestiaireArgs): Promise<ScanFile> {
  // What the description snippet centres on
  const re = args.match ? new RegExp(args.match, "i") : args.models.length ? new RegExp(args.models.map(m => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i") : null;
  const r = await inTab(tag, "https://www.vestiairecollective.com", inVestiaire, args);
  if (r.error) die(r.error);
  const candidates: Candidate[] = [];
  let gone = 0;
  for (const i of r.items) {
    if (i.available === false || i.vacation) {
      gone++;
      continue;
    }
    const notes = [i.reserved ? "reserved" : "", i.fee ? `buyer fee €${i.fee}` : "", i.duties ? `duties and taxes €${i.duties}` : ""].filter(Boolean);
    candidates.push({
      id: i.id,
      shop: "Vestiaire Collective",
      url: i.url,
      title: i.title,
      brand: i.brand,
      ...(i.currency === "EUR" ? { price_eur: i.price } : { price: i.price, currency: i.currency }),
      condition: i.condition,
      ...(i.measurements ? { size: i.measurements } : {}),
      color: i.color ?? i.colors,
      ...(i.material ? { material: i.material } : {}),
      ...place(i.country),
      photo: i.photo,
      description: snippet(i.description, re),
      seller: i.seller,
      listed: i.listed,
      ...(notes.length ? { note: notes.join("; ") } : {}),
    });
  }
  if (gone) r.searched.push(`${gone} not for sale now (sold, reserved for checkout or the seller is away), left out`);
  return { shop: "vestiaire", scanned_at: new Date().toISOString(), searched: r.searched, candidates };
}

// --- JoliCloset (runs in the page) -------------------------------------------------------------

type JoliArgs = { pages: string[]; match: string | null };
type JoliItem = {
  id: string; url: string; title: string; brand: string; price: number; currency: string; inStock: boolean; photo: string;
  condition?: string; chars?: Record<string, string>; seller?: string; description?: string; delivery?: string;
};
type JoliResult = { searched: string[]; items: JoliItem[] };

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
  return { searched, items: kept };
}

async function jolicloset(tag: string, categories: string[], query: string | null, match: string | null): Promise<ScanFile> {
  const site = "https://www.jolicloset.com";
  const pages = categories.length
    ? categories.map(c => `${site}/en/${c.replace(/^\/?(en\/)?/, "")}`)
    : ["fashion-women", "fashion-men"].map(s => `${site}/en/${s}?query=${encodeURIComponent(query ?? "")}`);
  const r = await inTab(tag, site, inJoli, { pages, match });
  const candidates: Candidate[] = r.items.filter(i => i.inStock).map(i => {
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
  });
  return { shop: "jolicloset", scanned_at: new Date().toISOString(), searched: r.searched, candidates };
}

// --- Farfetch (runs in the page) ---------------------------------------------------------------

// The page globals that the scanners below use in a shop's page, which the scripts' types (no DOM) lack
declare const DOMParser: new () => { parseFromString(html: string, type: string): any };
declare const location: { origin: string };

/** The country whose Farfetch site the scan reads, which sets the prices: euros with import duties. */
const FARFETCH_COUNTRY = "ee";

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
  // One request at a time, A.pause ms apart: Farfetch answers a burst with 429 for a while
  async function read(url: string): Promise<string | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const wait = last + A.pause - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      try {
        const res = await fetch(url, { credentials: "include" });
        if (res.ok) return await res.text();
        if (res.status === 404) return null;
        if (res.status === 429) {
          await sleep(15000 * (attempt + 1));
          continue;
        }
      } catch { /* try again */ }
      await sleep(2000);
    }
    blocked = `${url.replace(location.origin, "")} still failed after three tries (Farfetch answers too many requests with 429)`;
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
  for (const base of A.lists) {
    if (blocked) break;
    const sep = base.includes("?") ? "&" : "?";
    let items = 0;
    let page = 1;
    // 96 a page, until a page comes back short or with nothing new
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
      if (list.length < 96 || !fresh) break;
    }
    searched.push(`${base.replace(location.origin, "")}: ${items} items on ${page} pages`);
  }
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const brandRe = A.brands.length ? new RegExp(A.brands.map(escape).join("|"), "i") : null;
  const re = A.match ? new RegExp(A.match, "i") : null;
  const kept = [...all.values()].filter(i => i.inStock && (!brandRe || brandRe.test(i.brand)) && (!re || re.test(i.title)));
  searched.push(`${kept.length} in stock${brandRe ? ` by ${A.brands.join(" or ")}` : ""}${re ? `, titles matching /${A.match}/` : ""}`);
  return { searched, items: kept, ...(blocked ? { blocked } : {}) };
}

async function farfetch(tag: string, categories: string[], queries: string[], brands: string[], match: string | null, pause: number): Promise<ScanFile> {
  const site = "https://www.farfetch.com";
  const root = `${site}/${FARFETCH_COUNTRY}/shopping`;
  const lists = categories.length
    ? categories.map(c => `${root}/${c.replace(/^\/+|\/+$/g, "").replace(/\/items\.aspx$/, "")}/items.aspx`)
    : queries.flatMap(q => ["women", "men"].map(section => `${root}/${section}/search/items.aspx?q=${encodeURIComponent(q)}`));
  const listed = await inTab(tag, site, inFarfetch, { lists, brands, match, items: [], pause });
  const searched = listed.searched;
  if (listed.blocked) searched.push(`lists stopped early: ${listed.blocked}`);
  // Product pages in runs of 30, each well within a tab.ts call's time limit; after a block, one
  // more try a minute later
  const items: FarfetchItem[] = [];
  const failed: FarfetchItem[] = [];
  let todo = listed.items;
  for (let waits = 0; todo.length; ) {
    const r = await inTab(tag, site, inFarfetch, { lists: [], brands, match, items: todo.slice(0, 30), pause });
    items.push(...r.items.filter(i => i.read));
    failed.push(...r.items.filter(i => i.tried && !i.read));
    todo = [...r.items.filter(i => !i.tried), ...todo.slice(30)];
    if (r.blocked) {
      if (++waits > 1) break;
      await Bun.sleep(60_000);
    }
  }
  const unread = [...failed, ...todo];
  if (unread.length) searched.push(`${unread.length} product pages didn't load, so their lines have only the list's title and price`);
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
  specifics?: Record<string, string>; sellerNote?: string; seller?: string; location?: string; returns?: string;
  buyNow?: boolean; bids?: boolean; offer?: boolean; ended?: boolean; auth?: boolean; photo?: string;
};

/**
 * The cards of eBay's search results for each query, Buy It Now only, 240 a page, up to the count
 * in the heading: later cards match only some of the words. Signed out (credentials omitted), since
 * eBay blocks the signed-in browser first; a pause between pages keeps it from seeing a burst.
 */
async function inEbaySearch(A: { queries: string[]; pause: number }): Promise<{ searched: string[]; cards: EbayCard[]; blocked?: string }> {
  const searched: string[] = [];
  const cards = new Map<string, EbayCard>();
  const text = (e: any) => String(e?.textContent ?? "").replace(/\s+/g, " ").trim();
  let first = true;
  for (const q of A.queries) {
    let wanted = Infinity;
    let seen = 0;
    for (let page = 1; seen < wanted && page <= 20; page++) {
      // eslint-disable-next-line bun/prefer-builtin-sleep -- this runs in the shop's page, so no Bun globals
      if (!first) await new Promise(resolve => setTimeout(resolve, A.pause));
      first = false;
      const url = `https://www.ebay.de/sch/i.html?_nkw=${encodeURIComponent(q).replace(/%20/g, "+")}&LH_BIN=1&_ipg=240&_pgn=${page}`;
      const res = await fetch(url, { credentials: "omit" });
      if (res.status !== 200) return { searched, cards: [...cards.values()], blocked: `search page ${page} for "${q}" answered ${res.status}` };
      const doc = new DOMParser().parseFromString(await res.text(), "text/html");
      if (page === 1) {
        const heading = text(doc.querySelector(".srp-controls__count-heading"));
        wanted = Number(heading.match(/^([\d.]+)/)?.[1]?.replace(/\./g, "") ?? 0);
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
        const lines = [...li.querySelectorAll("span")].filter(s => !s.children.length).map(s => text(s)).filter(s => s && s !== "Wird in neuem Fenster oder Tab geöffnet" && s !== "egieznA");
        const title = (text(li.querySelector(".s-card__title")) || lines[0] || "").replace(/Wird in neuem Fenster oder Tab geöffnet/g, "").replace(/^Neues Angebot\s*/, "").trim();
        const img = li.querySelector("img.s-card__image") ?? li.querySelector("img");
        cards.set(id, { id, title, lines, photo: img?.getAttribute("data-defer-load") || img?.getAttribute("src") || "" });
      }
    }
  }
  return { searched, cards: [...cards.values()] };
}

/** Item pages one at a time, signed out and with a pause between them; stops at the first 403. */
async function inEbayItems(A: { ids: string[]; pause: number }): Promise<{ items: EbayItem[]; blocked?: string }> {
  const items: EbayItem[] = [];
  const text = (e: any) => String(e?.textContent ?? "").replace(/\s+/g, " ").trim();
  for (const [n, id] of A.ids.entries()) {
    // eslint-disable-next-line bun/prefer-builtin-sleep -- this runs in the shop's page, so no Bun globals
    if (n) await new Promise(resolve => setTimeout(resolve, A.pause));
    let res: Response;
    try {
      res = await fetch(`https://www.ebay.de/itm/${id}`, { credentials: "omit" });
    } catch {
      items.push({ id, status: 0 });
      continue;
    }
    if (res.status === 403) return { items, blocked: `item page ${id} answered 403 after ${n} pages` };
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
    const condition = grade.match(/^(Neu mit Etikett|Neu ohne Etikett|Neu mit Fehlern|Neu \(Sonstige\)|Neuwertig|Neu|Gebraucht - (Hervorragend|Sehr gut|Gut|Akzeptabel)|Gebraucht|Generalüberholt|Defekt|Vorführmodell)/)?.[0] ?? grade.slice(0, 40);
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
      ...(sellerNote ? { sellerNote: sellerNote.replace(/Mehr zum Thema.*$/, "").slice(0, 300) } : {}),
      seller: text(doc.querySelector(".x-sellercard-atf__info")).replace(/Mehr Artikel des Verkäufers.*$/, "").slice(0, 140),
      location: shipping.match(/Standort:\s*(.+?)(?=Lieferung|Bei Kombiversand|Rücknahme|Zahlung|Einfuhr|$)/)?.[1]?.trim() ?? "",
      returns: text(doc.querySelector(".ux-labels-values--returns")).replace(/^Rücknahme:\s*/, "").split(". ")[0]?.slice(0, 120) ?? "",
      buyNow: !!doc.querySelector(".x-bin-action"),
      bids: !!doc.querySelector(".x-bid-action"),
      offer: /Preisvorschlag/.test(body),
      ended: /Dieses Angebot wurde beendet|Angebot beendet|nicht mehr verfügbar|wurde vom Verkäufer beendet/.test(body) && !doc.querySelector(".x-bin-action"),
      auth: /Echtheitsprüfung|Echtheitsgarantie/.test(body),
      photo: doc.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? "",
    });
  }
  return { items };
}

/** An amount such as "EUR 1.590,00" or "ca. EUR 1.590,00", in euros. */
function euros(s: string | undefined): number | undefined {
  const m = (s ?? "").match(/EUR\s*([\d.]+,\d{2}|[\d.]+)/);
  return m ? Number(m[1]!.replace(/\./g, "").replace(",", ".")) : undefined;
}

async function ebay(tag: string, queries: string[], ids: string[], match: RegExp | null, details: boolean, pause: number): Promise<ScanFile> {
  const site = "https://www.ebay.de";
  const searched: string[] = [];
  let cards: EbayCard[] = [];
  if (queries.length) {
    const r = await inTab(tag, site, inEbaySearch, { queries, pause });
    searched.push(...r.searched);
    if (r.blocked) searched.push(`stopped early: ${r.blocked}; eBay lifts a block within about ten minutes`);
    // Auctions don't count, even with a Buy It Now price
    const auctions = r.cards.filter(c => c.lines.some(l => /^\d+ Gebote?\b/.test(l))).length;
    cards = r.cards.filter(c => !c.lines.some(l => /^\d+ Gebote?\b/.test(l)) && (!match || match.test(c.title)));
    searched.push(`${r.cards.length} cards${auctions ? `, ${auctions} auctions left out` : ""}${match ? `, ${cards.length} with titles matching ${match}` : ""}`);
  }
  const wanted = [...new Set([...ids, ...(details ? cards.map(c => c.id) : [])])];
  const items = new Map<string, EbayItem>();
  // Item pages in runs of 60, each well within a tab.ts call's time limit
  for (let i = 0; i < wanted.length; i += 60) {
    const r = await inTab(tag, site, inEbayItems, { ids: wanted.slice(i, i + 60), pause });
    for (const item of r.items) items.set(item.id, item);
    if (r.blocked) {
      searched.push(`item pages stopped: ${r.blocked}; ${wanted.length - items.size} not read`);
      break;
    }
  }
  if (wanted.length) searched.push(`${items.size} item pages read`);

  const byId = new Map(cards.map(c => [c.id, c]));
  const candidates: Candidate[] = [];
  let gone = 0;
  for (const id of new Set([...cards.map(c => c.id), ...ids])) {
    const card = byId.get(id);
    const item = items.get(id);
    if (!card && !item) continue;
    if (item && (item.ended || [404, 410].includes(item.status) || (item.status === 200 && !item.buyNow) || item.bids)) {
      gone++;
      continue;
    }
    const lines = card?.lines ?? [];
    const s = item?.specifics ?? {};
    const from = item?.location || lines.find(l => /^aus /.test(l))?.slice(4) || (card ? "Germany" : "");
    const code = from ? countryCode(from) : null;
    const price = euros(item?.approxText) ?? euros(item?.priceText) ?? euros(lines.find(l => /^EUR /.test(l)));
    const dims = [["Taschenbreite", "W"], ["Taschenhöhe", "H"], ["Taschentiefe", "D"]].filter(([k]) => s[k!]).map(([k, l]) => `${l} ${s[k!]}`);
    const sellerType = lines.find(l => /^(Privat|Gewerblich)$/.test(l)) ?? item?.seller?.match(/Gewerblich|Privat/)?.[0];
    // Such as "luxuryfindsitalia(37)PrivatAngemeldet als ...": the name, ratings and kind of seller
    const sellerName = item?.seller?.match(/^(.*?)\((\d[\d.]*)\)/);
    const seller = sellerName ? `${sellerName[1]!.trim()} (${sellerName[2]} ratings)${sellerType ? `, ${sellerType}` : ""}` : sellerType;
    const original = item?.priceText?.replace(/oder Preisvorschlag.*$/, "").trim();
    const shipping = lines.find(l => /Lieferung|Versand/.test(l));
    const photo = [card?.photo, item?.photo].find(p => p && !/stockimage|\.gif$/.test(p));
    const auth = lines.includes("Mit Echtheitsprüfung") || item?.auth;
    const model = [s["Produktlinie"], s["Modell"], s["Muster"]].filter(Boolean).join(", ");
    candidates.push({
      id,
      shop: "eBay.de",
      url: `${site}/itm/${id}`,
      title: (card?.title || item?.title || "").replace(/\s*-$/, ""),
      brand: s["Marke"] ?? lines.find(l => /vuitton/i.test(l) && l.length < 40),
      ...(price !== undefined ? { price_eur: price } : {}),
      condition: item?.condition || lines.find(l => /^(Neu|Brandneu|Neuwertig|Gebraucht|Generalüberholt|Defekt)/.test(l))?.replace(/\s*\|$/, ""),
      ...(dims.length ? { size: dims.join(" × ") } : {}),
      ...(s["Außenfarbe"] || s["Farbe"] ? { color: s["Außenfarbe"] ?? s["Farbe"] } : {}),
      ...(s["Außenmaterial"] || s["Material"] ? { material: s["Außenmaterial"] ?? s["Material"] } : {}),
      ships_from: code ? (COUNTRY.of(code) ?? from) : from || "not stated",
      ...(code && !EU.has(code) ? { non_eu: true } : {}),
      ...(photo ? { photo } : {}),
      ...(model || item?.sellerNote ? { description: clip([model && `model: ${model}`, item?.sellerNote].filter(Boolean).join("; ")) } : {}),
      ...(seller ? { seller } : {}),
      note: [
        card && !item ? "from the search card" : "",
        item?.approxText && original && !/EUR/.test(original) ? `priced ${original}, converted by eBay` : "",
        lines.includes("oder Preisvorschlag") || item?.offer ? "best offer" : "",
        auth ? "eBay checks authenticity" : "",
        shipping ?? "",
        item?.returns ? `returns: ${item.returns}` : "",
      ].filter(Boolean).join("; "),
    });
  }
  if (gone) searched.push(`${gone} ended, sold or auctions, left out`);
  return { shop: "ebay", scanned_at: new Date().toISOString(), searched, candidates };
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

// --- Output -------------------------------------------------------------------------------------

function line(c: Candidate): string {
  const price = c.price_eur !== undefined ? `€${c.price_eur}` : c.price !== undefined ? `${c.price} ${c.currency}` : "price?";
  const ships = c.ships_from === "not stated" ? "?" : (c.ships_from ?? "?").replace(/ \(.*\)$/, "");
  const details = [c.material, c.color, c.size, c.note].filter(Boolean).join("; ");
  return `${c.id} | ${price} | ${c.condition ?? "?"} | ${ships}${c.non_eu ? " (non-EU)" : ""} | ${c.title}${details ? ` | ${details}` : ""}`;
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
      match: { type: "string" },
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
  // One --query, except for eBay and Farfetch, which take several
  if (shop !== "ebay" && shop !== "farfetch" && values.query.length > 1) die(`${shop} takes one --query`);
  const pause = Number(values.pause ?? (shop === "ebay" ? 2000 : 1500));
  if (!Number.isFinite(pause) || pause < 0) die("--pause takes milliseconds");
  const query = values.query[0] ?? null;
  const needTag = () => values.tag ?? die(`${shop} runs in the ai-skills browser: give your tab tag with --tag`);
  let result: ScanFile;
  if (shop === "shopify") {
    const domains = values.shops ? values.shops.split(",").map(d => d.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "")) : Object.keys(SHOPIFY);
    if (values.profile) {
      await shopifyProfile(domains);
      return 0;
    }
    if (!brands.length) die("give the brand with --brand");
    result = await shopify(domains, brands, match, !!values.full);
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
  } else if (shop === "farfetch") {
    if (!values.category.length && !query) die("give a --category or a --query");
    result = await farfetch(needTag(), values.category, values.query, brands, values.match ?? null, pause);
  } else if (shop === "ebay") {
    const ids = (values.ids ?? "").split(/[\s,]+/).filter(id => /^\d+$/.test(id));
    if (!values.query.length && !ids.length) die("give a --query or --ids");
    result = await ebay(needTag(), values.query, ids, match, !!values.details, pause);
  } else {
    die(`no scanner for ${shop}: the shops are shopify, vestiaire, jolicloset, yaga, farfetch and ebay`);
  }
  const out = values.out ?? `${(Bun.env.TMPDIR ?? "/tmp").replace(/\/$/, "")}/fashion-hunt/scan-${shop}-${Date.now()}.json`;
  await Bun.write(out, JSON.stringify(result, null, 1));
  for (const s of result.searched) console.log(`# ${s}`);
  console.log(`# ${result.candidates.length} candidates, sorted by price; all fields saved in ${out}`);
  const price = (c: Candidate) => c.price_eur ?? c.price ?? Infinity;
  for (const c of [...result.candidates].sort((a, b) => price(a) - price(b))) console.log(line(c));
  return 0;
}

if (import.meta.main) process.exit(await main());
