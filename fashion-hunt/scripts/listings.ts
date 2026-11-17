#!/usr/bin/env bun
/**
 * Save a fashion-hunt shop agent's listings as it verifies them, and merge every agent's into the
 * run file. USAGE below says how.
 */

import { parseArgs } from "node:util";
import { key, outsideEU } from "./common.ts";
import type { Candidate, ScanFile } from "./scan.ts";

const USAGE = `Save a shop agent's listings as it verifies them, and merge them into the run file.

    listings.ts add <run dir> <shop slug> [--scan <scan file>] [file]
    listings.ts show <run dir>
    listings.ts merge <run file> [--rate <CUR>=<EUR per unit>]...

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
       leather, Quartz"} is enough. A country in ships_from sets non_eu, whatever it said.
show   prints how many listings each shop has saved.
merge  adds every saved listing to the run file's listings: one already there by link gets the
       agent's fields (price, condition and so on) and keeps the rest (group, variant, new price).
       --rate converts prices in other currencies, such as --rate USD=0.8612, and notes the
       original price in price_note.
`;

type Listing = Record<string, unknown> & { url: string; item: string; kind: "match" | "near" };

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
  if (typeof listing.item !== "string" || !listing.item) problems.push("item");
  if (listing.kind !== "match" && listing.kind !== "near") problems.push('kind ("match" or "near")');
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

async function add(runDir: string, shop: string, scanPath: string | undefined, source: string): Promise<void> {
  if (!SLUG_RE.test(shop)) die("the shop slug may only use lowercase letters, digits and hyphens");
  let data: unknown;
  try {
    data = JSON.parse(source === "-" ? await Bun.stdin.text() : await Bun.file(source).text());
  } catch (e) {
    die(`the listings aren't valid JSON: ${e}`);
  }
  const given = (Array.isArray(data) ? data : [data]) as Record<string, unknown>[];
  const scan = scanPath ? ((await Bun.file(scanPath).json()) as ScanFile) : null;
  const byId = new Map<string, Candidate>((scan?.candidates ?? []).map(c => [String(c.id), c]));
  const listings = given.map((entry, i) => {
    let listing = entry;
    if (entry.id !== undefined && entry.url === undefined) {
      const c = byId.get(String(entry.id));
      if (!c) die(`listing ${i + 1}: no candidate with id ${entry.id} in ${scanPath ?? "a scan file (give it with --scan)"}`);
      const { id: _id, title, description: _d, brand: _b, seller: _s, listed: _l, color: _c, material: _m, ...fields } = c;
      listing = { ...fields, item: title, ...entry };
      delete listing.id;
    }
    return check(listing, `listing ${i + 1}`);
  });
  const path = fileOf(runDir, shop);
  const saved = new Map((await readSaved(path)).map(l => [key(l.url), l]));
  for (const l of listings) saved.set(key(l.url), l);
  await Bun.write(path, JSON.stringify([...saved.values()], null, 1));
  const kinds = [...saved.values()].map(l => l.kind);
  console.log(`saved ${listings.length}; ${shop} now has ${kinds.filter(k => k === "match").length} matches and ${kinds.filter(k => k === "near").length} near matches`);
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
    console.log(`${shop}: ${n("match")} matches, ${n("near")} near`);
  }
}

async function merge(runFile: string, rates: Map<string, number>): Promise<void> {
  const file = Bun.file(runFile);
  const run = ((await file.exists()) ? await file.json() : {}) as { listings?: Listing[] };
  const runDir = runFile.replace(/\/[^/]*$/, "") || ".";
  const listings = run.listings ?? [];
  const at = new Map(listings.map((l, i) => [key(l.url), i]));
  let added = 0;
  let updated = 0;
  const missingRates = new Set<string>();
  for (const { listings: saved } of await savedFiles(runDir)) {
    for (const l of saved) {
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
  }
  run.listings = listings;
  await Bun.write(runFile, JSON.stringify(run, null, 1));
  console.log(`added ${added} and updated ${updated} listings; the run file has ${listings.length}`);
  if (missingRates.size) console.log(`no --rate for ${[...missingRates].join(", ")}: those listings have no price_eur yet`);
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: { scan: { type: "string" }, rate: { type: "string", multiple: true, default: [] }, help: { type: "boolean", short: "h" } },
    allowPositionals: true,
  });
  const [command, ...rest] = positionals;
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (command === "add" && (rest.length === 2 || rest.length === 3)) {
    await add(rest[0]!, rest[1]!, values.scan, rest[2] ?? "-");
  } else if (command === "show" && rest.length === 1) {
    await show(rest[0]!);
  } else if (command === "merge" && rest.length === 1) {
    const rates = new Map<string, number>();
    for (const r of values.rate) {
      const [cur, value] = r.split("=");
      if (!cur || !Number(value)) die(`--rate takes CUR=<EUR per unit>, such as USD=0.8612: ${r}`);
      rates.set(cur.toUpperCase(), Number(value));
    }
    await merge(rest[0]!, rates);
  } else {
    console.log(USAGE);
    return 2;
  }
  return 0;
}

if (import.meta.main) process.exit(await main());
