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

/** ISO codes of the EU countries. */
export const EU = new Set("AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE".split(" "));

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
 * such as W25cm, 25x15x8cm or 100ml, or a decade such as 2010s.
 */
export function codeTokens(text: string): string[] {
  const tokens = text.toUpperCase().match(/\b(?=[A-Z0-9]*\d)[A-Z0-9]{5,12}\b/g) ?? [];
  return [...new Set(tokens.filter(t => !/^[A-Z]?\d{1,3}(CM|MM|IN|ML|OZ|G|KG|X\d+)?$|^\d+(X\d+)+(CM|MM|IN)?$|^(19|20)\d\dS$/.test(t)))];
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
