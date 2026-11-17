#!/usr/bin/env bun
/**
 * Give each listing of a fashion-hunt run its variant and the brand's new price, from the items
 * the brand agent saved and a short spec, instead of a script per search. USAGE below says how.
 */

import { parseArgs } from "node:util";

const USAGE = `Give each listing its variant and the brand's new price.

    compare.ts brand <run dir> <brand slug> [file]
    compare.ts <run file> [--spec <file>] [--dry]

brand  saves the brand's items (a JSON list, from file or stdin) in <run dir>/brand/<brand
       slug>.json, replacing any saved before with the same link. Each item:
         {"item": "Magnetic Card Holder", "variant": "Monogram Eclipse", "color": "Black",
          "code": "M12602", "price_eur": 340, "url": "https://...", "orderable": true}
       variant is the brand's name for what sets the item apart from the others of its model:
       the canvas, leather or colour line, such as Monogram Eclipse, Damier Graphite or Epi.
       Add "near": true to a nearest equivalent that isn't the requested model or size (a PM
       when the search is for the GM): only a listing that names its code gets its price.

The second form sets variant, new_price_eur, new_url and new_note on every listing of the run
file from the items in <run dir>/brand/. The spec, a JSON file, adds variants the brand doesn't
sell now and words that pick a variant:

    {"variants": [
       {"name": "Monogram Macassar", "match": ["safran", "pondichery", "black leather"]},
       {"name": "LV x Murakami", "match": ["murakami"], "new_note": "not sold by LV now",
        "swatch": "<svg ...>", "hint": "..."},
       {"name": "Monogram, coloured trim", "match": ["monogram"], "price_of": "M28319",
        "new_note": "colour not sold now; LV's current Monogram one is pink"}],
     "rest": {"name": "Canvas not stated"},
     "not_listed": "not currently listed by Louis Vuitton"}

A listing whose item or code names an item's code gets that item. Otherwise its variant is the
one whose name or match words its item or code contains, the words the fewest listings have
winning (so "Monogram Eclipse" beats "Monogram", and "Nigo" beats "black leather"), and never
one whose not words it has, such as {"name": "Monogram Macassar", ..., "not": ["heritage"]}. It
gets the price of that variant's item whose colour it names, or else of its cheapest item, and
a new_note saying how it differs. A variant's price_of (a code) prices it by that item instead.
A variant without items gets its new_note, or not_listed. Listings no variant fits go to rest
when the spec has one; the rest are printed with the words they share most, to add to the spec
before running it again. So are the listings picked by words though their item names another
variant, to check.

page.variants gets the variants found: in spec order, then the brand's, then rest, each with the
spec's swatch and hint, or those page.variants had, or a hint with the lowest new price.
--dry prints what it would do without saving.
`;

type BrandItem = {
  item: string; url: string; variant?: string; color?: string; material?: string; code?: string;
  price_eur?: number; orderable?: boolean; near?: boolean;
};
type SpecVariant = { name: string; match?: string[]; not?: string[]; new_note?: string; price_of?: string; swatch?: string; hint?: string };
type Spec = { variants?: SpecVariant[]; rest?: SpecVariant; not_listed?: string };
type Listing = Record<string, unknown> & { url: string; item: string };
type PageVariant = { name: string; swatch?: string; hint?: string };
/** A variant with the words that pick it and the brand's items in it */
type Variant = SpecVariant & { words: string[]; items: BrandItem[] };

/** What the script writes in a listing's new_note and a variant's hint, in the page's language */
const PHRASES = {
  en: {
    same: (code: string) => `same item, ${code}`,
    sameVariant: "same variant",
    sameColor: (color: string) => `same variant and colour (${color})`,
    closest: (color: string) => `closest colour at the brand: ${color}`,
    soldOut: "sold out at the brand",
    notListed: "not currently listed by the brand",
    from: (price: number) => `from €${price} new`,
  },
  ru: {
    same: (code: string) => `та же модель, ${code}`,
    sameVariant: "тот же вариант",
    sameColor: (color: string) => `тот же вариант и цвет (${color})`,
    closest: (color: string) => `ближайший цвет у бренда: ${color}`,
    soldOut: "у бренда распродано",
    notListed: "бренд сейчас не продаёт",
    from: (price: number) => `новая от ${price} €`,
  },
};

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

/** Lower case without accents, words separated by single spaces, with a space at each end */
const norm = (s: unknown) =>
  ` ${String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
/** Whether normalised text has the words of phrase in a row */
const has = (text: string, phrase: string) => norm(phrase).trim() !== "" && text.includes(norm(phrase));

async function readJson(source: string): Promise<unknown> {
  const text = source === "-" ? await Bun.stdin.text() : await Bun.file(source).text();
  try {
    return JSON.parse(text);
  } catch (e) {
    die(`not valid JSON: ${(e as Error).message}`);
  }
}

async function saveBrand(dir: string, slug: string, source: string): Promise<void> {
  if (!/^[a-z0-9-]+$/.test(slug)) die(`the brand slug takes lowercase letters, digits and hyphens, such as louis-vuitton: ${slug}`);
  const input = await readJson(source);
  const list = (Array.isArray(input) ? input : [input]) as BrandItem[];
  for (const [i, it] of list.entries()) {
    if (typeof it?.item !== "string" || typeof it.url !== "string") die(`item ${i + 1} needs item and url`);
    if (it.price_eur !== undefined && typeof it.price_eur !== "number") die(`item ${i + 1}: price_eur is a number of euros`);
  }
  const file = `${dir}/brand/${slug}.json`;
  const saved: BrandItem[] = (await Bun.file(file).exists()) ? await Bun.file(file).json() : [];
  const urls = new Set(list.map(it => it.url));
  const all = [...saved.filter(it => !urls.has(it.url)), ...list];
  await Bun.write(file, JSON.stringify(all, null, 1));
  console.log(`saved ${list.length}; ${slug} has ${all.length} items (${all.filter(it => it.near).length} near)`);
}

async function brandItems(dir: string): Promise<BrandItem[]> {
  const items: BrandItem[] = [];
  try {
    for await (const f of new Bun.Glob("*.json").scan(`${dir}/brand`)) items.push(...((await Bun.file(`${dir}/brand/${f}`).json()) as BrandItem[]));
  } catch {
    // no brand folder: the spec's variants only
  }
  return items;
}

/** The variants: the spec's first, then the brand's in the order its items came */
function variantsOf(items: BrandItem[], spec: Spec): Variant[] {
  const variants = new Map<string, Variant>();
  for (const v of spec.variants ?? []) variants.set(v.name, { ...v, words: [v.name, ...(v.match ?? [])], items: [] });
  for (const it of items) {
    if (it.near) continue;
    const name = it.variant || it.item;
    const v = variants.get(name) ?? { name, words: [name], items: [] };
    v.items.push(it);
    variants.set(name, v);
  }
  return [...variants.values()];
}

/** The variant of the most telling words the text has: those the fewest listings have (so
 * "Monogram Eclipse" beats "Monogram", and "Nigo" beats "black leather"), then the longest, then
 * the earlier variant. A variant is out for a text that has one of its not words. Also says
 * which other variants the text names, by a name most listings don't have. */
function pick(text: string, variants: Variant[], seen: (phrase: string) => number, all: number): { v?: Variant; by?: string; over: string[] } {
  let best: { v: Variant; w: string; n: number; len: number } | undefined;
  const named: Variant[] = [];
  for (const v of variants) {
    if ((v.not ?? []).some(w => has(text, w))) continue;
    if (has(text, v.name) && seen(v.name) <= all / 2) named.push(v);
    for (const w of v.words) {
      if (!has(text, w)) continue;
      const n = seen(w);
      const len = norm(w).trim().length;
      if (!best || n < best.n || (n === best.n && len > best.len)) best = { v, w, n, len };
    }
  }
  return { v: best?.v, by: best?.w, over: named.filter(v => v !== best?.v).map(v => v.name) };
}

/** The item of a variant whose colour words the text has most of, else its cheapest; the same
 * colour only when the text has all of them, and oneColor when the item's colour is just the
 * variant's name */
function closest(text: string, v: Variant): { item: BrandItem; sameColor: boolean; oneColor: boolean } {
  const nameWords = new Set(norm(v.name).trim().split(" "));
  const colorWords = (it: BrandItem) => norm(it.color).trim().split(" ").filter(w => w.length > 2 && !nameWords.has(w));
  const score = (it: BrandItem) => colorWords(it).filter(w => text.includes(` ${w} `)).length;
  const cheap = (a: BrandItem, b: BrandItem) => (a.price_eur ?? Infinity) - (b.price_eur ?? Infinity);
  const ranked = [...v.items].sort((a, b) => score(b) - score(a) || Number(b.orderable !== false) - Number(a.orderable !== false) || cheap(a, b));
  const item = ranked[0]!;
  const words = colorWords(item).length;
  return { item, sameColor: words > 0 && score(item) === words, oneColor: words === 0 };
}

/** The words (one or two) most often found in the given texts and in few of the others */
function sharedWords(texts: string[], all: string[]): string[] {
  const counts = new Map<string, number>();
  for (const t of texts) {
    const w = t.trim().split(" ");
    const grams = new Set([...w.filter(x => x.length > 2), ...w.slice(1).map((x, i) => `${w[i]} ${x}`)]);
    for (const g of grams) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  // Leave out what most listings say, such as the model's name
  const common = (g: string) => all.filter(t => t.includes(` ${g} `)).length > all.length / 2;
  return [...counts].filter(([g, n]) => n > 1 && !common(g)).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([g, n]) => `"${g}" ×${n}`);
}

async function compare(runFile: string, specFile: string | undefined, dry: boolean): Promise<void> {
  const run = (await Bun.file(runFile).json()) as { listings: Listing[]; page?: Record<string, unknown> & { lang?: string; variants?: PageVariant[] } };
  const dir = runFile.replace(/\/[^/]*$/, "") || ".";
  const spec = (specFile ? await readJson(specFile) : {}) as Spec;
  const items = await brandItems(dir);
  const variants = variantsOf(items, spec);
  const rest: Variant | undefined = spec.rest ? { ...spec.rest, words: [], items: [] } : undefined;
  const P = PHRASES[run.page?.lang === "ru" ? "ru" : "en"];
  const byCode = new Map(items.filter(it => it.code).map(it => [norm(it.code).trim(), it]));
  const codeOf = (code: string | undefined) => (code ? byCode.get(norm(code).trim()) : undefined);
  const counts = { code: 0, words: 0, rest: 0, none: 0 };
  const unmatched: Listing[] = [];
  const texts = run.listings.map(l => norm(`${l.item} ${l.code ?? ""}`));
  const seenCache = new Map<string, number>();
  const seen = (phrase: string) => {
    const p = norm(phrase);
    if (!seenCache.has(p)) seenCache.set(p, texts.filter(t => t.includes(p)).length);
    return seenCache.get(p)!;
  };
  const doubts: string[] = [];
  const pickIn = (text: string, l: Listing) => {
    const p = pick(text, variants, seen, texts.length);
    if (p.v && p.over.length) doubts.push(`  ${p.v.name} by "${p.by}", though it names ${p.over.join(", ")} | ${l.item}`);
    return p.v;
  };

  for (const [i, l] of run.listings.entries()) {
    const text = texts[i]!;
    delete l.variant;
    delete l.new_price_eur;
    delete l.new_url;
    delete l.new_note;
    const named = text.trim().split(" ").map(w => byCode.get(w)).find(Boolean);
    let v: Variant | undefined;
    let item: BrandItem | undefined;
    let note: string | undefined;
    if (named) {
      item = named;
      v = variants.find(x => x.name === (named.variant || named.item)) ?? pickIn(text, l);
      note = P.same(named.code!);
      counts.code++;
    } else {
      v = pickIn(text, l);
      if (v) counts.words++;
      else if (rest) {
        v = rest;
        counts.rest++;
      } else {
        counts.none++;
        unmatched.push(l);
        continue;
      }
      const priced = codeOf(v.price_of);
      if (priced) {
        item = priced;
        note = v.new_note;
      } else if (v.items.length) {
        const c = closest(text, v);
        item = c.item;
        note = c.sameColor ? P.sameColor(c.item.color!) : c.oneColor ? P.sameVariant : P.closest(c.item.color!);
      } else note = v.new_note ?? spec.not_listed ?? P.notListed;
    }
    if (v) l.variant = v.name;
    if (item?.price_eur !== undefined) {
      l.new_price_eur = item.price_eur;
      l.new_url = item.url;
    }
    const notes = [note, item && item.orderable === false ? P.soldOut : ""].filter(Boolean);
    if (notes.length) l.new_note = notes.join("; ");
  }

  // The page's variant cards, in the order above, each with a swatch and hint
  const present = new Map<string, number>();
  for (const l of run.listings) if (typeof l.variant === "string") present.set(l.variant, (present.get(l.variant) ?? 0) + 1);
  const before = new Map((run.page?.variants ?? []).map(v => [v.name, v]));
  const own = rest && !variants.some(v => v.name === rest.name) ? [rest] : [];
  const cards: PageVariant[] = [...variants, ...own].filter(v => present.has(v.name)).map(v => {
    const prices = v.items.map(it => it.price_eur).filter((p): p is number => p !== undefined);
    const pricedBy = codeOf(v.price_of)?.price_eur;
    const hint = v.hint ?? before.get(v.name)?.hint ?? (prices.length ? P.from(Math.min(...prices)) : pricedBy !== undefined ? P.from(pricedBy) : v.new_note ?? spec.not_listed ?? P.notListed);
    const swatch = v.swatch ?? before.get(v.name)?.swatch;
    return { name: v.name, ...(swatch ? { swatch } : {}), hint };
  });
  run.page = { ...run.page, variants: cards };

  console.log(`${run.listings.length} listings: ${counts.code} by a brand code, ${counts.words} by words${rest ? `, ${counts.rest} in ${rest.name}` : ""}, ${counts.none} with no variant`);
  console.log(`variants: ${cards.map(c => `${c.name} ${present.get(c.name)} (${c.hint})`).join("; ")}`);
  if (doubts.length) {
    console.log(`picked by words, though the item names another variant: check these, and give a variant not words where it's wrong`);
    for (const d of doubts.slice(0, 30)) console.log(d);
    if (doubts.length > 30) console.log(`  and ${doubts.length - 30} more`);
  }
  if (unmatched.length) {
    console.log("no variant fits these: add a variant or words to the spec, or a rest, and run again");
    for (const l of unmatched) console.log(`  ${l.url} | ${l.item}`);
    const words = sharedWords(unmatched.map(l => norm(l.item)), run.listings.map(l => norm(l.item)));
    if (words.length) console.log(`  words they share: ${words.join(", ")}`);
  }
  if (!items.length) console.log(`no brand items in ${dir}/brand/: new prices come only from the spec`);
  if (dry) console.log("--dry: nothing saved");
  else await Bun.write(runFile, JSON.stringify(run, null, 1));
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      spec: { type: "string" },
      dry: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  const [first, ...rest] = positionals;
  if (first === "brand" && (rest.length === 2 || rest.length === 3)) await saveBrand(rest[0]!, rest[1]!, rest[2] ?? "-");
  else if (first && first !== "brand" && !rest.length) await compare(first, values.spec, !!values.dry);
  else {
    console.log(USAGE);
    return 2;
  }
  return 0;
}

if (import.meta.main) process.exit(await main());
