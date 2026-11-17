#!/usr/bin/env bun
/**
 * Save a fashion-hunt shop agent's listings as it verifies them, and merge every agent's into the
 * run file. USAGE below says how.
 */

import { parseArgs } from "node:util";
import { type LearnedCode, key, lastVerdicts, learnCodes, learnedCodes, longSide, outsideEU } from "./common.ts";
import type { Candidate, ScanFile } from "./scan.ts";

const USAGE = `Save a shop agent's listings as it verifies them, and merge them into the run file.

    listings.ts add <run dir> <shop slug> [--scan <scan file> [--rest out]] [file]
    listings.ts show <run dir>
    listings.ts merge <run file> [--known <search>] [--rate <CUR>=<EUR per unit>]...

add    saves listings (a JSON object or list, from file or stdin) in <run dir>/listings/<shop
       slug>.json, replacing any saved before with the same link, so whatever an agent saved
       survives if it's stopped. Each needs:
         url, item (model, material and colour), kind ("match" or "near"),
         misses (for a near match: the criterion it misses, such as "Monogram canvas, not Epi"),
         price_eur, or price and currency for another currency,
       and may give condition, size, ships_from, photo, risk (an authenticity flag with its
       reason) and note. With --scan, a listing may give the id of a candidate in that scan file
       instead of url, and takes the price, condition, size, ships from and photo from it; fields
       it gives itself win, so {"id": "73224341", "kind": "match", "item": "Marelle BB, Epi
       leather, Quartz"} is enough. A listing may give a model code instead of an id, such as
       {"code": "M80689", "kind": "match", "item": "Marelle, Epi Noir"}: it stands for every
       candidate the scan marked with that code, except those given by id, and the next scan
       shows the code as saved as that item; {"traits": "LEATHER/WHITE/25CM", ...} does the same
       for a group of alike candidates without a code. {"where": {...}, ...} saves every candidate
       a rule picks: a regex for title, description, text (all of those), material, color,
       condition, ships_from or code, and a [min, max] for side (the longer of width and height,
       in cm) or price, such as {"where": {"title": "^Porte Documents Voyage", "side": [39, 45]},
       "kind": "match", "item": "Porte-Documents Voyage GM, {material} {color}"}, where {material},
       {color}, {size}, {title} and {code} take each candidate's own. An entry by id wins over a
       group or rule, and an earlier group or rule over a later one. A country in ships_from sets non_eu, whatever it
       said. Kind "out" records a candidate judged not to match, so a repeat run doesn't judge
       it again: it needs only an id or url. --rest out saves every candidate of the scan that
       isn't saved yet (and that the last run didn't judge) as out, once the agent has saved
       the ones that count.
show   prints how many listings each shop has saved.
merge  adds every saved listing to the run file's listings: one already there by link gets the
       agent's fields (price, condition and so on) and keeps the rest (group, variant, new price).
       Those saved as out go to the run file's rejected list. --known <search> also carries over
       the last run's verdicts (saved by history.ts record) for every candidate in the run's
       scans (<run dir>/scan/*.json) that no agent saved this time: the scan's price, condition
       and photo, and the verdict's item, kind, tab, variant and new price. --rate converts
       prices in other currencies, such as --rate USD=0.8612, and notes the original price in
       price_note.
`;

type Listing = Record<string, unknown> & { url: string; item: string; kind: "match" | "near" | "out" };

/** What a shop agent sets; merge leaves the other fields of a run file's listing alone. */
const AGENT_FIELDS = ["url", "shop", "item", "kind", "misses", "price_eur", "price", "currency", "condition", "size", "ships_from", "non_eu", "photo", "risk", "note"];

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,60}$/;
const fileOf = (runDir: string, shop: string) => `${runDir.replace(/\/$/, "")}/listings/${shop}.json`;

async function readSaved(path: string): Promise<Listing[]> {
  const file = Bun.file(path);
  return (await file.exists()) ? ((await file.json()) as Listing[]) : [];
}

function check(listing: Record<string, unknown>, at: string): Listing {
  const problems: string[] = [];
  if (typeof listing.url !== "string" || !/^https?:\/\//.test(listing.url)) problems.push("url");
  // A listing judged not to match needs only its link
  if (listing.kind === "out" && !problems.length) return { item: "", ...listing } as Listing;
  if (typeof listing.item !== "string" || !listing.item) problems.push("item");
  if (listing.kind !== "match" && listing.kind !== "near") problems.push('kind ("match", "near" or "out")');
  if (listing.kind === "near" && (typeof listing.misses !== "string" || !listing.misses)) problems.push("misses (what the near match misses)");
  const eur = typeof listing.price_eur === "number";
  const other = typeof listing.price === "number" && typeof listing.currency === "string";
  if (!eur && !other && typeof listing.price_note !== "string") problems.push("price_eur, or price and currency (or a price_note saying why there's none)");
  if (problems.length) die(`${at} needs ${problems.join(", ")}: ${JSON.stringify(listing).slice(0, 300)}`);
  // A country in ships_from settles non_eu, whatever the agent said
  if (outsideEU(listing.ships_from, listing.non_eu)) listing.non_eu = true;
  else delete listing.non_eu;
  return listing as Listing;
}

/** The text fields a where rule can test with a regex, and the number fields it can test with a range. */
const WHERE_TEXT = ["title", "description", "text", "material", "color", "condition", "ships_from", "code"];
const WHERE_RANGE = ["side", "price"];

/**
 * A where rule's test, such as {"title": "^Porte Documents Voyage", "side": [39, 45]}: each text
 * field must match its case-insensitive regex (text is the title, description, material and colour
 * together), and side (the longer of width and height, in cm) and price (EUR) must fall in their
 * [min, max] range.
 */
function whereTest(where: unknown, at: string): (c: Candidate) => boolean {
  if (!where || typeof where !== "object" || Array.isArray(where)) die(`${at}: where takes an object, such as {"title": "^Porte Documents Voyage", "side": [39, 45]}`);
  const tests: ((c: Candidate) => boolean)[] = [];
  for (const [field, value] of Object.entries(where)) {
    if (WHERE_TEXT.includes(field)) {
      let re: RegExp;
      try {
        re = new RegExp(String(value), "i");
      } catch (e) {
        die(`${at}: where.${field} isn't a valid regex: ${e}`);
      }
      tests.push(c => re.test(field === "text" ? `${c.title} ${c.description ?? ""} ${c.material ?? ""} ${c.color ?? ""}` : String(c[field as keyof Candidate] ?? "")));
    } else if (WHERE_RANGE.includes(field)) {
      if (!Array.isArray(value) || value.length !== 2) die(`${at}: where.${field} takes [min, max], with null for no bound`);
      const [min, max] = value.map(v => (v === null ? null : Number(v)));
      tests.push(c => {
        const v = field === "side" ? longSide(c.size) : c.price_eur;
        return v !== undefined && (min === null || min === undefined || v >= min) && (max === null || max === undefined || v <= max);
      });
    } else {
      die(`${at}: where takes ${[...WHERE_TEXT, ...WHERE_RANGE].join(", ")}, not ${field}`);
    }
  }
  return c => tests.every(test => test(c));
}

/** An item text with a candidate's fields filled in, such as "Porte-Documents Voyage GM, {material} {color}". */
const fill = (item: string, c: Candidate) =>
  item.replace(/\{(material|color|size|title|code)\}/g, (_, field: keyof Candidate) => String(c[field] ?? "")).replace(/\s+/g, " ").replace(/\s+,/g, ",").replace(/[\s,]+$/, "").trim();

async function add(runDir: string, shop: string, scanPath: string | undefined, source: string, restOut: boolean): Promise<void> {
  if (!SLUG_RE.test(shop)) die("the shop slug may only use lowercase letters, digits and hyphens");
  if (restOut && !scanPath) die("--rest out needs the scan file, with --scan");
  let data: unknown;
  try {
    // Nothing given is fine with --rest out
    const text = source === "-" ? (restOut && process.stdin.isTTY ? "" : await Bun.stdin.text()) : await Bun.file(source).text();
    data = text.trim() || !restOut ? JSON.parse(text) : [];
  } catch (e) {
    die(`the listings aren't valid JSON: ${e}`);
  }
  const given = (Array.isArray(data) ? data : [data]) as Record<string, unknown>[];
  const scan = scanPath ? ((await Bun.file(scanPath).json()) as ScanFile) : null;
  const byId = new Map<string, Candidate>((scan?.candidates ?? []).map(c => [String(c.id), c]));
  // A model code, the traits of alike candidates or a where rule stands for every candidate it picks
  // that isn't given by id or picked by an earlier entry
  const taken = new Set(given.filter(e => e.id !== undefined).map(e => String(e.id)));
  const entries = given.flatMap((entry, i) => {
    if (entry.id !== undefined || entry.url !== undefined) return [entry];
    const at = `listing ${i + 1}`;
    let picks: (c: Candidate) => boolean;
    let what: string;
    if (entry.code !== undefined) {
      const code = String(entry.code).toUpperCase();
      [picks, what] = [c => c.code === code, `code ${code}`];
    } else if (entry.traits !== undefined) {
      const traits = String(entry.traits).toUpperCase();
      [picks, what] = [c => c.traits === traits, `traits ${traits}`];
    } else if (entry.where !== undefined) {
      [picks, what] = [whereTest(entry.where, at), `where ${JSON.stringify(entry.where)}`];
    } else return [entry];
    // Candidates the last run judged are carried over at merge, so a group leaves them alone
    const matching = (scan?.candidates ?? []).filter(c => !c.known && !taken.has(String(c.id)) && picks(c));
    if (!matching.length) die(`${at}: no candidate with ${what} in ${scanPath ?? "a scan file (give it with --scan)"}`);
    for (const c of matching) taken.add(String(c.id));
    const { code: _code, traits: _traits, where: _where, ...rest } = entry;
    return matching.map(c => ({ ...rest, id: c.id, ...(typeof rest.item === "string" ? { item: fill(rest.item, c) } : {}) }));
  });
  const listings = entries.map((entry, i) => {
    let listing = entry;
    if (entry.id !== undefined && entry.url === undefined) {
      const c = byId.get(String(entry.id));
      if (!c) die(`listing ${i + 1}: no candidate with id ${entry.id} in ${scanPath ?? "a scan file (give it with --scan)"}`);
      const { id: _id, title, description: _d, brand: _b, seller: _s, listed: _l, color: _c, material: _m, model: _model, traits: _t, known: _k, ...fields } = c;
      listing = { ...fields, item: title, ...entry };
      delete listing.id;
    }
    return check(listing, `listing ${i + 1}`);
  });
  // What each code was saved as, for the next scan to show: a code entry's item, or else the item
  // of the first listing saved with a code no search has saved before
  const known = await learnedCodes();
  const seen = new Date().toISOString().slice(0, 10);
  const learned: Record<string, LearnedCode> = {};
  for (const entry of given) {
    if (entry.code !== undefined && entry.id === undefined && entry.url === undefined && typeof entry.item === "string") {
      learned[String(entry.code).toUpperCase()] = { item: entry.item, seen };
    }
  }
  for (const l of listings) if (typeof l.code === "string" && !known[l.code] && !learned[l.code]) learned[l.code] = { item: l.item, seen };
  await learnCodes(learned);

  const path = fileOf(runDir, shop);
  const saved = new Map((await readSaved(path)).map(l => [key(l.url), l]));
  for (const l of listings) saved.set(key(l.url), l);
  // The rest of the scan's new candidates don't match
  let rest = 0;
  if (restOut) {
    for (const c of scan?.candidates ?? []) {
      if (c.known || saved.has(key(c.url))) continue;
      saved.set(key(c.url), { url: c.url, shop: c.shop, item: c.title, kind: "out" });
      rest++;
    }
  }
  await Bun.write(path, JSON.stringify([...saved.values()], null, 1));
  const kinds = [...saved.values()].map(l => l.kind);
  const n = (kind: string) => kinds.filter(k => k === kind).length;
  console.log(`saved ${listings.length}${restOut ? ` and ${rest} more as out` : ""}; ${shop} now has ${n("match")} matches, ${n("near")} near matches and ${n("out")} out`);
}

async function savedFiles(runDir: string): Promise<{ shop: string; listings: Listing[] }[]> {
  const folder = `${runDir.replace(/\/$/, "")}/listings`;
  const names = await Array.fromAsync(new Bun.Glob("*.json").scan({ cwd: folder })).catch(() => [] as string[]);
  return Promise.all(names.sort().map(async name => ({ shop: name.slice(0, -5), listings: await readSaved(`${folder}/${name}`) })));
}

async function show(runDir: string): Promise<void> {
  const files = await savedFiles(runDir);
  if (!files.length) console.log("no listings saved yet");
  for (const { shop, listings } of files) {
    const n = (kind: string) => listings.filter(l => l.kind === kind).length;
    console.log(`${shop}: ${n("match")} matches, ${n("near")} near, ${n("out")} out`);
  }
}

/** A verdict's fields that a fresh scan replaces, or that belonged to the last run's page only. */
const STALE = ["image", "change", "price_note", "price_eur", "price", "currency", "condition", "size", "ships_from", "non_eu", "photo"];

/** The last run's verdicts for this run's scan candidates that no agent saved: listings, and those that were out. */
async function carriedOver(runDir: string, search: string, savedKeys: Set<string>): Promise<Listing[]> {
  const verdicts = await lastVerdicts(search);
  if (!verdicts.size) {
    console.log(`no verdicts saved for ${search} yet, so nothing is carried over`);
    return [];
  }
  const carried = new Map<string, Listing>();
  const folder = `${runDir.replace(/\/$/, "")}/scan`;
  for await (const name of new Bun.Glob("*.json").scan({ cwd: folder })) {
    const scan = (await Bun.file(`${folder}/${name}`).json()) as ScanFile;
    for (const c of scan.candidates ?? []) {
      const k = key(c.url);
      const verdict = verdicts.get(k);
      if (!verdict || savedKeys.has(k) || carried.has(k)) continue;
      const kept = Object.fromEntries(Object.entries(verdict).filter(([field]) => !STALE.includes(field)));
      const fresh = Object.fromEntries(STALE.filter(field => c[field as keyof Candidate] !== undefined).map(field => [field, c[field as keyof Candidate]]));
      carried.set(k, check({ ...kept, ...fresh, url: c.url }, `the verdict on ${c.url}`));
    }
  }
  return [...carried.values()];
}

async function merge(runFile: string, rates: Map<string, number>, search: string | undefined): Promise<void> {
  const file = Bun.file(runFile);
  const run = ((await file.exists()) ? await file.json() : {}) as { listings?: Listing[]; rejected?: Listing[] };
  const runDir = runFile.replace(/\/[^/]*$/, "") || ".";
  const listings = run.listings ?? [];
  const rejected = new Map((run.rejected ?? []).map(l => [key(l.url), l]));
  const at = new Map(listings.map((l, i) => [key(l.url), i]));
  let added = 0;
  let updated = 0;
  const missingRates = new Set<string>();
  const saved = (await savedFiles(runDir)).flatMap(f => f.listings);
  const carried = search ? await carriedOver(runDir, search, new Set(saved.map(l => key(l.url)))) : [];
  for (const l of [...saved, ...carried]) {
    if (l.kind === "out") {
      rejected.set(key(l.url), l);
      continue;
    }
    const rate = typeof l.currency === "string" ? rates.get(l.currency.toUpperCase()) : undefined;
    if (typeof l.price === "number" && typeof l.currency === "string" && typeof l.price_eur !== "number") {
      if (rate) {
        l.price_eur = Math.round(l.price * rate);
        const original = new Intl.NumberFormat("en-IE", { style: "currency", currency: l.currency.toUpperCase(), maximumFractionDigits: 0 }).format(l.price);
        l.price_note = `about ${original}, converted at ${rate}`;
      } else missingRates.add(l.currency.toUpperCase());
    }
    const i = at.get(key(l.url));
    if (i === undefined) {
      at.set(key(l.url), listings.length);
      listings.push(l);
      added++;
    } else {
      const old = listings[i]!;
      for (const field of [...AGENT_FIELDS, "price_note"]) if (l[field] !== undefined) old[field] = l[field];
      updated++;
    }
  }
  run.listings = listings;
  if (rejected.size) run.rejected = [...rejected.values()];
  await Bun.write(runFile, JSON.stringify(run, null, 1));
  const kept = carried.filter(l => l.kind !== "out").length;
  console.log(`added ${added} and updated ${updated} listings${search ? `, ${kept} of them carried over from the last run's verdicts, as were ${carried.length - kept} judged out` : ""}; the run file has ${listings.length} listings and ${rejected.size} out`);
  if (missingRates.size) console.log(`no --rate for ${[...missingRates].join(", ")}: those listings have no price_eur yet`);
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      scan: { type: "string" },
      rest: { type: "string" },
      known: { type: "string" },
      rate: { type: "string", multiple: true, default: [] },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });
  const [command, ...rest] = positionals;
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (values.rest !== undefined && values.rest !== "out") die("--rest takes only out");
  if (command === "add" && (rest.length === 2 || rest.length === 3)) {
    await add(rest[0]!, rest[1]!, values.scan, rest[2] ?? "-", values.rest === "out");
  } else if (command === "show" && rest.length === 1) {
    await show(rest[0]!);
  } else if (command === "merge" && rest.length === 1) {
    const rates = new Map<string, number>();
    for (const r of values.rate) {
      const [cur, value] = r.split("=");
      if (!cur || !Number(value)) die(`--rate takes CUR=<EUR per unit>, such as USD=0.8612: ${r}`);
      rates.set(cur.toUpperCase(), Number(value));
    }
    await merge(rest[0]!, rates, values.known);
  } else {
    console.log(USAGE);
    return 2;
  }
  return 0;
}

if (import.meta.main) process.exit(await main());
