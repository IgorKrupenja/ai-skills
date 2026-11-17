/** Helpers that several fashion-hunt scripts share. */

/** Normalise a listing URL so the same listing matches across runs and agents. */
export function key(url: string): string {
  const bare = url.split(/[#?]/)[0]!.replace(/\/+$/, "").replace(/^https?:\/\/(www\.)?/, "");
  // A Vinted item is its domain and id, whatever title follows in the URL, and so is a Vestiaire
  // one, whose path also changes with the listing's category and colour.
  const vestiaire = bare.match(/^(vestiairecollective\.[a-z.]+)\/.*-(\d+)\.shtml$/);
  if (vestiaire) return `${vestiaire[1]}/${vestiaire[2]}`;
  return bare.match(/^vinted\.[a-z.]+\/items\/\d+/)?.[0] ?? bare;
}

/** ISO codes of the EU countries. */
export const EU = new Set("AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE".split(" "));

const REGION = new Intl.DisplayNames(["en"], { type: "region" });
/** Every country's English name, lowercased, with its ISO code. */
const CODES = new Map<string, string>();
for (let a = 65; a <= 90; a++) {
  for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a, b);
    try {
      const name = REGION.of(code);
      if (name && name !== code) CODES.set(name.toLowerCase(), code);
    } catch { /* not a region */ }
  }
}
for (const [alias, code] of [["uk", "GB"], ["usa", "US"], ["us", "US"], ["england", "GB"], ["korea", "KR"], ["czech republic", "CZ"]] as const) CODES.set(alias, code);

/** The ISO code of the country a ships-from text starts with, such as "Japan" or "Paris, France". */
export function countryCode(shipsFrom: string): string | null {
  const parts = shipsFrom.toLowerCase().split(/[,(;]/).map(s => s.replace(/^(in store|via)\s+/, "").trim());
  for (const part of [parts.at(-1) ?? "", ...parts]) if (CODES.has(part)) return CODES.get(part)!;
  return null;
}
