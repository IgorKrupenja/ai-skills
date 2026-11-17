/** Helpers that several fashion-hunt scripts share. */

/** Normalise a listing URL so the same listing matches across runs and agents. */
export function key(url: string): string {
  const bare = url.split(/[#?]/)[0]!.replace(/\/+$/, "").replace(/^https?:\/\/(www\.)?/, "");
  // A Vinted item is its domain and id, whatever title follows in the URL, and so is a Vestiaire
  // one, whose path also changes with the listing's category and colour.
  const vestiaire = bare.match(/^(vestiairecollective\.[a-z.]+)\/.*-(\d+)\.shtml$/);
  if (vestiaire) return `${vestiaire[1]}/${vestiaire[2]}`;
  // A Farfetch item is its id, whether its link goes through the women's or the men's section
  const farfetch = bare.match(/^farfetch\.com\/.*-item-(\d+)\.aspx$/);
  if (farfetch) return `farfetch.com/item/${farfetch[1]}`;
  return bare.match(/^vinted\.[a-z.]+\/items\/\d+/)?.[0] ?? bare;
}

/**
 * ISO codes of the places a parcel comes from into the EU without import VAT or duties: the EU
 * countries, and Monaco, which is in the EU's customs and VAT area as part of France.
 */
export const EU = new Set("AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE MC".split(" "));

/** Region codes that aren't countries, such as EU for the European Union. */
const NOT_COUNTRIES = new Set(["EU", "EZ", "QO", "UN", "ZZ"]);
/** The two-letter ISO code of every country. */
const COUNTRIES = new Set<string>();
const ENGLISH = new Intl.DisplayNames(["en"], { type: "region" });
for (let a = 65; a <= 90; a++) {
  for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a, b);
    try {
      // Skip old codes that stand for a current one, such as DD for Germany
      const current = Intl.getCanonicalLocales(`und-${code}`)[0] === `und-${code}`;
      if (current && !NOT_COUNTRIES.has(code) && ENGLISH.of(code) !== code) COUNTRIES.add(code);
    } catch { /* not a region */ }
  }
}

/** A name as countryCode compares it: lowercase, without accents or a part in brackets. */
function bare(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\([^)]*\)?/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Country names with their ISO codes, in the report's languages (English and Russian) and the
 * shops' (German for eBay.de, Estonian, Finnish, French, Italian, Spanish), English first so its
 * names win a clash, plus common short forms.
 */
const CODES = new Map<string, string>();
for (const lang of ["en", "ru", "de", "et", "fi", "fr", "it", "es"]) {
  for (const style of ["long", "short"] as const) {
    const names = new Intl.DisplayNames([lang], { type: "region", style });
    for (const code of COUNTRIES) {
      const name = bare(names.of(code) ?? "");
      if (name && !CODES.has(name)) CODES.set(name, code);
    }
  }
}
const ALIASES: Record<string, string> = {
  uk: "GB", "great britain": "GB", britain: "GB", england: "GB", scotland: "GB", wales: "GB", usa: "US", us: "US",
  america: "US", china: "CN", korea: "KR", "czech republic": "CZ", holland: "NL", turkey: "TR", uae: "AE",
  сша: "US", америка: "US", англия: "GB", китай: "CN", корея: "KR", "южная корея": "KR", "чешская республика": "CZ",
  голландия: "NL", юар: "ZA", "vereinigte staaten von amerika": "US", grossbritannien: "GB", "großbritannien": "GB",
  vae: "AE", "tschechische republik": "CZ", "republic of korea": "KR",
};
for (const [alias, code] of Object.entries(ALIASES)) CODES.set(bare(alias), code);

/** The code of the longest country name a text starts with, such as China in "china mainland". */
function startsWithCountry(text: string): string | undefined {
  let found: string | undefined;
  let length = 3;
  // Names of four letters or more, so "us" in "us army" isn't the United States
  for (const [name, code] of CODES) {
    if (name.length > length && text.startsWith(`${name} `)) [found, length] = [code, name.length];
  }
  return found;
}

/**
 * The ISO code of the country in a ships-from text, such as "Japan", "Япония", "Paris, France" or
 * "JP", in any of the languages above; null when it names none, such as "not stated".
 */
export function countryCode(shipsFrom: string): string | null {
  const text = shipsFrom.trim();
  if (COUNTRIES.has(text)) return text;
  const parts = bare(text).split(/[,;:/]/).map(part => part.replace(/^(in store|via|from|через|из)\s+/, "").trim());
  // The last part first, for "Paris, France"
  for (const part of [parts.at(-1) ?? "", ...parts]) {
    const code = CODES.get(part) ?? startsWithCountry(part);
    if (code) return code;
  }
  return null;
}

/** Whether a ships-from text is only a country's name or code, with nothing else in it to keep. */
export function isCountry(shipsFrom: string): boolean {
  const text = shipsFrom.trim();
  return COUNTRIES.has(text) || (!/[(),;:/]/.test(text) && CODES.has(bare(text)));
}

/** A country's name in a language, such as Япония for JP in Russian. */
export function countryName(code: string, lang: string): string {
  return new Intl.DisplayNames([lang], { type: "region" }).of(code) ?? code;
}

/**
 * Whether a listing ships from outside the EU: a country in ships_from settles it, whatever
 * non_eu says; non_eu counts only when ships_from names no country.
 */
export function outsideEU(shipsFrom: unknown, nonEU: unknown): boolean {
  const code = typeof shipsFrom === "string" ? countryCode(shipsFrom) : null;
  return code ? !EU.has(code) : nonEU === true;
}

/** Where fashion-hunt keeps what it learns between runs (history, model codes), outside the skill's public repo. */
export const DATA_HOME = Bun.env.FASHION_HUNT_HOME || `${Bun.env.HOME}/.local/share/fashion-hunt`;

/** What an agent saved listings with a model code as, such as {"M80689": {"item": "Marelle, Epi Noir"}}. */
export type LearnedCode = { item: string; seen: string };
const CODES_FILE = `${DATA_HOME}/codes.json`;

export async function learnedCodes(): Promise<Record<string, LearnedCode>> {
  const file = Bun.file(CODES_FILE);
  return (await file.exists()) ? ((await file.json()) as Record<string, LearnedCode>) : {};
}

export async function learnCodes(codes: Record<string, LearnedCode>): Promise<void> {
  if (Object.keys(codes).length) await Bun.write(CODES_FILE, JSON.stringify({ ...(await learnedCodes()), ...codes }, null, 1));
}

/**
 * The tokens in a text that may be a brand's model code: 5 to 12 letters and digits with at least
 * one digit, such as Louis Vuitton's M80689 or a style number like 400249, but not a measurement
 * such as W25cm, 25x15x8cm or 100ml, a decade such as 2010s, or a seller's own stock number: one
 * after "Auth", "#", "No." or "SKU", or nine digits and more, as in "LV Auth 163399" or
 * "154742399 [U]", which a seller repeats across different bags.
 */
export function codeTokens(text: string): string[] {
  const own = text.replace(/\b(?:auth(?:entic)?|sku|stock|ref|item|art|id|no|nr)\.?\s*[:#.]?\s*[A-Z0-9-]+|#\s*[A-Z0-9-]+/gi, " ");
  const tokens = own.toUpperCase().match(/\b(?=[A-Z0-9]*\d)[A-Z0-9]{5,12}\b/g) ?? [];
  return [...new Set(tokens.filter(t => !/^[A-Z]?\d{1,3}(CM|MM|IN|ML|OZ|G|KG|X\d+)?$|^\d+(X\d+)+(CM|MM|IN)?$|^(19|20)\d\dS$|^\d{9,}$/.test(t)))];
}

/**
 * A bag's longer side in whole centimetres, from a size such as "Width 41 cm, Height 30 cm",
 * "W 40 x H 30 cm" or "18x26x12 cm": sellers swap width and height, so the longer of the two
 * (or of the first two numbers) is what tells a large size from a small one.
 */
export function longSide(size: unknown): number | undefined {
  const s = String(size ?? "").replace(/(\d),(\d)/g, "$1.$2");
  const w = s.match(/\b(?:width|breite|w)\s*:?\s*(\d+(?:\.\d+)?)/i)?.[1];
  const h = s.match(/\b(?:height|höhe|h)\s*:?\s*(\d+(?:\.\d+)?)/i)?.[1];
  if (w || h) return Math.round(Math.max(Number(w ?? 0), Number(h ?? 0)));
  const dims = s.match(/(\d+(?:\.\d+)?)\s*(?:cm)?\s*[x×]\s*(\d+(?:\.\d+)?)/i);
  return dims ? Math.round(Math.max(Number(dims[1]), Number(dims[2]))) : undefined;
}

/**
 * What the last run of a search decided about each listing it judged, by key(url): the listings
 * on its page (kind match or near, with their tab, variant and new price) and the ones it judged
 * not to match (kind out). history.ts record saves them, and a repeat run carries them over.
 */
export type Verdict = Record<string, unknown> & { url: string; kind: "match" | "near" | "out" };
export const verdictsFile = (search: string) => `${DATA_HOME}/${search}/verdicts.json`;

export async function lastVerdicts(search: string): Promise<Map<string, Verdict>> {
  const file = Bun.file(verdictsFile(search));
  const list = (await file.exists()) ? ((await file.json()) as Verdict[]) : [];
  return new Map(list.map(v => [key(v.url), v]));
}

/**
 * Pages that a site blocks after a run of them, with how many it took in how many minutes before it
 * blocked us (November 2026): eBay.de answered 403 after 15 or 16 item pages, whether they were 1.5
 * or 4 seconds apart, and lifted the block within about ten minutes. Scripts check the budget
 * before such pages and record each one, so that scans, photo fetches and agents stay under it
 * together.
 */
const BUDGETS: Record<string, { pages: number; minutes: number }> = {
  "ebay.de item pages": { pages: 14, minutes: 12 },
};
const budgetFile = (site: string) => `${DATA_HOME}/budgets/${site.replace(/[^a-z0-9]+/gi, "-")}.json`;

/** How many of a site's budgeted pages can be read now, and when the next one frees up. */
export async function budgetLeft(site: string): Promise<{ left: number; freeAt: Date }> {
  const budget = BUDGETS[site];
  if (!budget) return { left: Infinity, freeAt: new Date() };
  const file = Bun.file(budgetFile(site));
  const since = Date.now() - budget.minutes * 60_000;
  const recent = ((await file.exists()) ? ((await file.json()) as number[]) : []).filter(t => t > since).sort((a, b) => a - b);
  const left = Math.max(0, budget.pages - recent.length);
  return { left, freeAt: new Date(left ? Date.now() : recent[recent.length - budget.pages]! + budget.minutes * 60_000) };
}

/** Record that n of a site's budgeted pages were read just now. */
export async function spendBudget(site: string, n: number): Promise<void> {
  const budget = BUDGETS[site];
  if (!budget || n <= 0) return;
  const file = Bun.file(budgetFile(site));
  const since = Date.now() - budget.minutes * 60_000;
  const recent = ((await file.exists()) ? ((await file.json()) as number[]) : []).filter(t => t > since);
  await Bun.write(budgetFile(site), JSON.stringify([...recent, ...Array.from({ length: n }, () => Date.now())]));
}

const POPCOUNT = Uint8Array.from({ length: 256 }, (_, n) => n.toString(2).replace(/0/g, "").length);

/**
 * Group the photo files that show the same picture: the same bytes, or a 256-bit difference hash
 * (ImageMagick shrinks each photo to 17 by 16 greys) that differs in at most 12 bits, as when a
 * shop saved the photo at another size or quality. So one item listed in several shops, or twice
 * in one, groups even where each shop stores its own copy. Copies of one photo differed in at most
 * 7 bits in November 2026, and photos of different items in 25 and more, even two colours of a
 * card holder shot in one seller's studio. Without ImageMagick only the same bytes count. Returns
 * the groups of two or more, as indexes into paths; a null path or a missing file is left out.
 */
export async function photoGroups(paths: (string | null)[]): Promise<number[][]> {
  const parent = paths.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const join = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  const present: number[] = [];
  const byBytes = new Map<string, number>();
  for (const [i, path] of paths.entries()) {
    const file = path ? Bun.file(path) : null;
    if (!file || !(await file.exists())) continue;
    present.push(i);
    const hash = Bun.hash(await file.bytes()).toString(36);
    const first = byBytes.get(hash);
    if (first === undefined) byBytes.set(hash, i);
    else join(i, first);
  }
  if (Bun.which("magick")) {
    const [w, h] = [17, 16];
    const size = `${w}x${h}!`;
    const hashes = new Map<number, Uint8Array>();
    const hashOf = (px: Uint8Array, at: number) => {
      const bits = new Uint8Array(((w - 1) * h) / 8);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w - 1; x++) {
          const n = y * (w - 1) + x;
          if (px[at + y * w + x]! > px[at + y * w + x + 1]!) bits[n >> 3]! |= 1 << (n & 7);
        }
      }
      return bits;
    };
    const greys = async (batch: number[]) =>
      new Uint8Array(await Bun.$`magick ${batch.map(i => `${paths[i]}[0]`)} -resize ${size} -colorspace gray -depth 8 gray:-`.quiet().arrayBuffer());
    for (let b = 0; b < present.length; b += 50) {
      const batch = present.slice(b, b + 50);
      const px = await greys(batch).catch(() => null);
      if (px && px.length === batch.length * w * h) {
        for (const [k, i] of batch.entries()) hashes.set(i, hashOf(px, k * w * h));
        continue;
      }
      // A file ImageMagick can't read fails the whole call, so read the batch one by one
      for (const i of batch) {
        const one = await greys([i]).catch(() => null);
        if (one && one.length === w * h) hashes.set(i, hashOf(one, 0));
      }
    }
    const hashed = [...hashes.entries()];
    for (let a = 0; a < hashed.length; a++) {
      for (let b = a + 1; b < hashed.length; b++) {
        const [x, y] = [hashed[a]![1], hashed[b]![1]];
        let bits = 0;
        for (let k = 0; k < x.length && bits <= 12; k++) bits += POPCOUNT[x[k]! ^ y[k]!]!;
        if (bits <= 12) join(hashed[a]![0], hashed[b]![0]);
      }
    }
  }
  const groups = new Map<number, number[]>();
  for (const i of present) groups.set(find(i), [...(groups.get(find(i)) ?? []), i]);
  return [...groups.values()].filter(group => group.length > 1);
}
