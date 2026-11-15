#!/usr/bin/env bun
/**
 * Watch the Tallinna Rahvaülikool cooking courses (kultuur.ee/valdkond/kokandus), social-calendar skill.
 *
 * These courses fill up within days of appearing, so a crawl looks at every upcoming course, not
 * just the crawl window. On each run it:
 *   - fetches the whole listing,
 *   - compares it with kokandus.json, the snapshot from the previous run,
 *   - prints the courses the user has ALREADY BOUGHT (the PAID calendar, through bought.ts) and
 *     leaves them out of every other block, so a bought course is never offered again,
 *   - prints the NEW courses, the courses whose spots OPENED again (they were full), every upcoming
 *     ITALIAN course, and all upcoming courses that still have spots,
 *   - saves the new snapshot.
 * The page of each course seen for the first time is read for its time, price, language and menu
 * (the menu is where most Italian dishes show up). The first run only saves a baseline.
 */

import { canon, load as loadBought, Unknown } from "./bought.ts";

const SNAPSHOT = `${import.meta.dir}/kokandus.json`;
const LISTING = "https://kultuur.ee/valdkond/kokandus/";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/128 Safari/537.36",
};
const MONTHS = ["jaanuar", "veebruar", "märts", "aprill", "mai", "juuni", "juuli", "august",
  "september", "oktoober", "november", "detsember"];
// "pasta" alone also means a spice paste in Estonian ("püha kolmainsuse pasta"), so it only counts in a title
const ITALIAN = new RegExp(
  "itaalia|italian|pastaro|pitsa|pizza|focacc|foccac|tiramis|gnocch|risott|lasagn|carbonar|" +
    "bruschet|pesto|mozzarell|parma|prosciut|panna cotta|antipast|ciabatt|polent|biscott|cannol|rooma",
  "giu",
);
/** "pasta" at the start of a word. */
const PASTA = /(?<![\p{L}\p{N}_])pasta/giu;
/** A course card on the listing: its URL and its inner HTML. */
const CARD = /<a\s+href="(https:\/\/kultuur\.ee\/koolitus\/[^"]+)"\s+class="post-item"\s*>(.*?)<\/a>/gs;

/** A course as kokandus.json keeps it. The details come from its own page, `first_seen` is a date. */
type Course = {
  title: string;
  date: string;
  status: string;
  time?: string;
  price?: string;
  lang?: string;
  italian?: string;
  first_seen?: string;
};
type Details = Required<Pick<Course, "time" | "price" | "lang" | "italian">>;

/** The local date `days` days from today, as YYYY-MM-DD. */
function localDate(days = 0): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const TODAY = localDate();

async function get(url: string): Promise<string> {
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

/** The Latin-1 references, for U+00A0 to U+00FF in order. */
const LATIN1 = (
  "nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn " +
  "sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute " +
  "Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde " +
  "Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave " +
  "aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth " +
  "ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml"
).split(" ");
/** Named references this decoder knows, as code points: the common ones, not all of HTML5's. */
const NAMED = new Map<string, number>([
  ["amp", 0x26], ["lt", 0x3c], ["gt", 0x3e], ["quot", 0x22], ["AMP", 0x26], ["LT", 0x3c],
  ["GT", 0x3e], ["QUOT", 0x22], ["COPY", 0xa9], ["REG", 0xae], ["apos", 0x27],
  ["OElig", 0x152], ["oelig", 0x153], ["Scaron", 0x160], ["scaron", 0x161], ["Yuml", 0x178],
  ["Zcaron", 0x17d], ["zcaron", 0x17e], ["fnof", 0x192], ["circ", 0x2c6], ["tilde", 0x2dc],
  ["ensp", 0x2002], ["emsp", 0x2003], ["thinsp", 0x2009], ["zwnj", 0x200c], ["zwj", 0x200d],
  ["lrm", 0x200e], ["rlm", 0x200f], ["ndash", 0x2013], ["mdash", 0x2014], ["lsquo", 0x2018],
  ["rsquo", 0x2019], ["sbquo", 0x201a], ["ldquo", 0x201c], ["rdquo", 0x201d], ["bdquo", 0x201e],
  ["dagger", 0x2020], ["Dagger", 0x2021], ["bull", 0x2022], ["hellip", 0x2026], ["permil", 0x2030],
  ["prime", 0x2032], ["Prime", 0x2033], ["lsaquo", 0x2039], ["rsaquo", 0x203a], ["oline", 0x203e],
  ["frasl", 0x2044], ["euro", 0x20ac], ["trade", 0x2122], ["larr", 0x2190], ["uarr", 0x2191],
  ["rarr", 0x2192], ["darr", 0x2193], ["harr", 0x2194], ["minus", 0x2212], ["check", 0x2713],
  ...LATIN1.map((name, i): [string, number] => [name, 0xa0 + i]),
]);
/** The old names that also count without the `;`. */
const LEGACY = new Set(["amp", "lt", "gt", "quot", "AMP", "LT", "GT", "QUOT", "COPY", "REG", ...LATIN1]);
/** Numeric references 0x80 to 0x9F stand for these Windows-1252 characters, as in browsers. */
const WINDOWS_1252 = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
];

/** The character a numeric reference (`#8211`, `#x20AC;`) stands for, by the HTML5 rules. */
function numericRef(ref: string): string {
  const code = /^#[xX]/.test(ref) ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
  if (code === 0) return "\uFFFD";
  if (code === 0x0d) return "\r";
  if (code >= 0x80 && code <= 0x9f) return String.fromCodePoint(WINDOWS_1252[code - 0x80]!);
  if ((code >= 0xd800 && code <= 0xdfff) || code > 0x10ffff) return "\uFFFD";
  // Control characters and noncharacters are dropped.
  const dropped =
    (code >= 0x01 && code <= 0x08) || code === 0x0b || (code >= 0x0e && code <= 0x1f) || code === 0x7f ||
    (code >= 0xfdd0 && code <= 0xfdef) || (code & 0xfffe) === 0xfffe;
  return dropped ? "" : String.fromCodePoint(code);
}

/** The text a named reference (`amp;`, `nbsp`, `copy=2`) stands for, by the HTML5 rules. */
function namedRef(ref: string): string {
  if (ref.endsWith(";")) {
    const code = NAMED.get(ref.slice(0, -1));
    return code === undefined ? `&${ref}` : String.fromCodePoint(code);
  }
  // Without the `;`, the longest old name at the start counts, and the rest stays as it is.
  for (let end = ref.length; end > 1; end--) {
    const name = ref.slice(0, end);
    if (LEGACY.has(name)) return String.fromCodePoint(NAMED.get(name)!) + ref.slice(end);
  }
  return `&${ref}`;
}

/** Decode the character references in HTML text. Names NAMED doesn't know stay as written. */
function unescapeHtml(text: string): string {
  return text.replace(/&(#[0-9]+;?|#[xX][0-9a-fA-F]+;?|[^\t\n\f <&#;]{1,32};?)/g, (_, ref: string) =>
    ref.startsWith("#") ? numericRef(ref) : namedRef(ref),
  );
}

/** The text of an HTML fragment: tags dropped, references decoded, whitespace collapsed. */
function flat(fragment: string): string {
  return unescapeHtml(fragment.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** The text of the card's element with this class, up to the first `</div>`, or "" when it has none. */
function field(card: string, cls: string): string {
  const m = new RegExp(`class="${cls}"[^>]*>(.*?)</div>`, "s").exec(card);
  return m ? flat(m[1]!) : "";
}

/** A card's date, "18. november 2026", as 2026-11-18; "" when it has none. */
function cardDate(text: string): string {
  const m = /(\d{1,2})\. ([\p{L}\p{N}_]+) (\d{4})/u.exec(text);
  if (!m) return "";
  const [day, monthName, year] = [m[1]!, m[2]!, m[3]!];
  const month = MONTHS.indexOf(monthName.toLowerCase()) + 1;
  if (!month) throw new Error(`not a month: ${monthName}`);
  return `${year}-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/** Every course card as {url: {title, date, status}}; later pages repeat page 1, so stop when nothing new. */
async function listing(): Promise<Map<string, Course>> {
  const courses = new Map<string, Course>();
  for (let n = 1; n < 10; n++) {
    const page = await get(n === 1 ? LISTING : `${LISTING}page/${n}/`);
    const before = courses.size;
    for (const m of page.matchAll(CARD)) {
      const [url, card] = [m[1]!, m[2]!];
      if (courses.has(url)) continue;
      const spots = field(card, "free_spots");
      const left = /(\d+) vaba koh/.exec(spots);
      courses.set(url, {
        title: flat(/<h3[^>]*>(.*?)<\/h3>/s.exec(card)![1]!),
        date: cardDate(field(card, "date")),
        status: spots.toUpperCase().includes("TÄIS") ? "full" : left ? `${left[1]} left` : "open",
      });
    }
    if (courses.size === before) break;
  }
  return courses;
}

/** Time, price, language note and an Italian check of the title and menu, from the course page. */
async function details(url: string, title: string): Promise<Details> {
  let txt = (await get(url)).replace(/<(script|style|nav|header|footer).*?<\/\1>/gis, " ");
  txt = unescapeHtml(txt.replace(/<[^>]+>/g, " | ")).replace(/\s+/g, " ").replace(/(\s*\|\s*)+/g, " | ");
  const info = txt.lastIndexOf("Rohkem infot");
  const head = txt.slice(Math.max(0, info - 700), info);
  const tail = txt.slice(info);
  const body = tail.slice(tail.indexOf("Tutvu õppekorralduse alustega"), tail.indexOf("Valdkonnad:"));
  const time = /kell ([\d.]+[–-][\d.]+)/.exec(head);
  const price = /Hind: \| ([^|]+)/.exec(tail);
  const lang = /NB! Kursus on ([\p{L}\p{N}_]+) keeles/u.exec(tail);
  const matches = [...`${title} ${body}`.matchAll(ITALIAN), ...title.matchAll(PASTA)];
  const italian = new Set(matches.map(m => m[0].toLowerCase()));
  return {
    time: time ? time[1]! : "",
    price: price ? price[1]!.trim() : "",
    lang: lang ? lang[1]! : "",
    italian: [...italian].sort().join(", "),
  };
}

/** `fn` over every item, at most `limit` at a time; the results come in the items' order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** One course as a line of the report. */
function line(url: string, c: Course): string {
  const extra = [c.time ?? "", c.price ?? "", c.lang ? `${c.lang} keeles` : ""].filter(Boolean).join(" | ");
  const italian = c.italian ? ` | italian: ${c.italian}` : "";
  return `  ${c.date} | ${c.status.padEnd(7)} | ${c.title}` + (extra ? ` | ${extra}` : "") + italian + ` | ${url}`;
}

/** The entries of `courses` that pass the test, in the same order. */
function pick(courses: Map<string, Course>, test: (url: string, c: Course) => boolean): Map<string, Course> {
  return new Map([...courses].filter(([url, c]) => test(url, c)));
}

async function main(): Promise<void> {
  const snapshot = Bun.file(SNAPSHOT);
  const old: Map<string, Course> | null = (await snapshot.exists())
    ? new Map(Object.entries((await snapshot.json()).courses))
    : null;
  const current = await listing();
  // Courses seen for the first time, or saved without their details
  const need = [...current.keys()].filter(u => !old?.has(u) || !("time" in old.get(u)!));
  const infos = await mapLimit(need, 6, u => details(u, current.get(u)!.title));
  need.forEach((url, i) => Object.assign(current.get(url)!, infos[i]));
  for (const [url, c] of current) {
    const prev = old?.get(url);
    if (prev && !need.includes(url)) {
      for (const k of ["time", "price", "lang", "italian", "first_seen"] as const) if (k in prev) c[k] = prev[k];
    }
    c.first_seen ??= TODAY;
  }

  const upcoming = pick(current, (_, c) => c.date >= TODAY);
  let paid = new Set<string>();
  let warning = "";
  try {
    paid = new Set((await loadBought()).map(b => canon(b.url)));
  } catch (e) {
    if (!(e instanceof Unknown)) throw e;
    warning =
      `WARNING: could not read the PAID calendar (${e.message}). ` +
      "Check by hand what is already bought before offering any course.";
  }
  const have = pick(upcoming, url => paid.has(canon(url)));
  const offer = pick(upcoming, url => !have.has(url));
  const fresh = pick(offer, url => old !== null && !old.has(url));
  const opened = pick(offer, (url, c) => old?.get(url)?.status === "full" && c.status !== "full");
  const italian = pick(offer, (_, c) => Boolean(c.italian));
  const hasSpots = pick(offer, (_, c) => c.status !== "full");

  // keep past courses for a while so a course that reappears is not reported as new
  const cutoff = localDate(-60);
  const kept = [...(old ?? [])].filter(([url, c]) => !current.has(url) && (c.date ?? "") >= cutoff);
  const courses = Object.fromEntries([...kept, ...current]);
  await Bun.write(SNAPSHOT, JSON.stringify({ updated: TODAY, courses }, null, 1));

  const full = [...upcoming.values()].filter(c => c.status === "full").length;
  const news = old === null ? "first run, baseline saved" : `new: ${fresh.size} | spots opened: ${opened.size}`;
  console.log(`kokandus: ${upcoming.size} upcoming, ${full} full, ${have.size} already bought | ${news}`);
  if (warning) console.log(warning);
  const groups: [string, Map<string, Course>][] = [
    ["ALREADY BOUGHT (never offer these)", have],
    ["NEW", fresh],
    ["SPOTS OPENED (were full)", opened],
    ["ITALIAN AHEAD", italian],
    ["UPCOMING WITH SPOTS", hasSpots],
  ];
  for (const [name, group] of groups) {
    if (old === null && (name === "NEW" || name === "SPOTS OPENED (were full)")) continue;
    console.log(`${name}: ${group.size || "none"}`);
    const byDate = [...group].sort(([, a], [, b]) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    for (const [url, c] of byDate) console.log(line(url, c));
  }
}

if (import.meta.main) await main();
