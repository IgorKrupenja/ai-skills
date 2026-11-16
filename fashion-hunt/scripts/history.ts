#!/usr/bin/env bun
/**
 * Keep a history of fashion-hunt results, so each run can say what is new, gone or repriced.
 *
 * USAGE below lists the commands and the format of a run. History lives in
 * ~/.local/share/fashion-hunt (set FASHION_HUNT_HOME to change it), outside the skill's public
 * repo, and holds only listing links, titles and prices.
 */

const USAGE = `Keep a history of fashion-hunt results, so each run can say what is new, gone or repriced.

    history.ts list                      show the saved searches and their last run
    history.ts diff <search> [file]      compare a run (JSON from file or stdin) with the last
                                         saved run of <search> and print the changes
    history.ts record <search> [file]    the same, then save the run

<search> is a short slug for the request, such as \`white-mens-belts-lv-boss\`; reuse the same
slug for the same request. A run looks like:

    {"date": "2026-11-15", "request": "white men's belts by LV or Hugo Boss",
     "listings": [{"url": "...", "shop": "Vinted", "item": "...", "price_eur": 160.76,
                   "kind": "match"}]}

where \`kind\` is "match" or "near". History lives in ~/.local/share/fashion-hunt (set
FASHION_HUNT_HOME to change it), outside the skill's public repo, and holds only listing links,
titles and prices. Other fields, such as the page ones scripts/report.ts reads, are left out
when a run is saved, except \`page_url\`, the run's published report page: list shows the
latest one of each search.
`;

const HOME = Bun.env.FASHION_HUNT_HOME || `${Bun.env.HOME}/.local/share/fashion-hunt`;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;

type Listing = { url: string; kind: "match" | "near"; shop?: unknown; item?: unknown; price_eur?: unknown };
type Run = { date?: unknown; request?: unknown; page_url?: unknown; listings?: Listing[] };

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

/** Normalise a listing URL so the same listing matches across runs. */
function key(url: string): string {
  const bare = url.split(/[#?]/)[0]!.replace(/\/+$/, "").replace(/^https?:\/\/(www\.)?/, "");
  // A Vinted item is its domain and id, whatever title follows in the URL, and so is a Vestiaire
  // one, whose path also changes with the listing's category and colour.
  const vestiaire = bare.match(/^(vestiairecollective\.[a-z.]+)\/.*-(\d+)\.shtml$/);
  if (vestiaire) return `${vestiaire[1]}/${vestiaire[2]}`;
  return bare.match(/^vinted\.[a-z.]+\/items\/\d+/)?.[0] ?? bare;
}

function isListing(item: unknown): item is Listing {
  const { url, kind } = (item ?? {}) as Partial<Listing>;
  return typeof url === "string" && url !== "" && (kind === "match" || kind === "near");
}

const isDirectory = (path: string) => Bun.file(path).stat().then(stat => stat.isDirectory(), () => false);

/** The files of a search's saved runs, oldest first: their names are timestamps. */
async function runs(search: string): Promise<string[]> {
  const folder = `${HOME}/${search}`;
  if (!(await isDirectory(folder))) return [];
  return [...new Bun.Glob("*.json").scanSync(folder)].sort().map(name => `${folder}/${name}`);
}

/** A price such as €1,234.50. */
function formatPrice(value: unknown): string {
  if (typeof value !== "number") return "price unknown";
  return `€${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function describe(listing: Listing): string {
  return `${listing.shop ?? "?"} | ${listing.item ?? "?"} | ${listing.url}`;
}

/** The local time as 2026-11-15T18-23-06-822000 (older runs, saved by the Python version, have microseconds). */
function timestamp(): string {
  const now = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
  const time = `${two(now.getHours())}-${two(now.getMinutes())}-${two(now.getSeconds())}`;
  return `${date}T${time}-${String(now.getMilliseconds()).padStart(3, "0")}000`;
}

async function list(): Promise<number> {
  if (!(await isDirectory(HOME))) {
    console.log("no saved searches yet");
    return 0;
  }
  // The searches with at least one saved run
  const searches = new Set(Array.from(new Bun.Glob("*/*.json").scanSync(HOME), path => path.split("/")[0]!));
  for (const search of [...searches].sort()) {
    const saved = await runs(search);
    const last: Run = await Bun.file(saved.at(-1)!).json();
    const kinds = (last.listings ?? []).map(listing => listing.kind);
    const count = (kind: string) => kinds.filter(k => k === kind).length;
    console.log(
      `${search}: ${saved.length} run${saved.length === 1 ? "" : "s"}, last ${last.date ?? "?"} ` +
        `(${count("match")} matches, ${count("near")} near) - ${last.request ?? ""}`,
    );
    // The newest report page, which a run without one of its own leaves in place
    for (const file of saved.toReversed()) {
      const { page_url }: Run = await Bun.file(file).json();
      if (typeof page_url === "string") {
        console.log(`  page: ${page_url}`);
        break;
      }
    }
  }
  return 0;
}

async function record(search: string, source: string, save: boolean): Promise<number> {
  if (!SLUG_RE.test(search)) die("search must be a lowercase slug of letters, digits and hyphens");
  const text = source === "-" ? await Bun.stdin.text() : await Bun.file(source).text();
  const listings: unknown = JSON.parse(text)?.listings;
  if (!Array.isArray(listings)) die("the run needs a 'listings' list");
  for (const item of listings) {
    if (!isListing(item)) die(`each listing needs a url and kind 'match' or 'near': ${JSON.stringify(item)}`);
  }

  const lastFile = (await runs(search)).at(-1);
  if (lastFile) {
    const last: Run = await Bun.file(lastFile).json();
    const before = new Map((last.listings ?? []).map(listing => [key(listing.url), listing]));
    const now = new Map((listings as Listing[]).map(listing => [key(listing.url), listing]));
    console.log(`Compared with the run of ${last.date ?? "?"}:`);
    const changes: string[] = [];
    for (const [k, listing] of now) {
      const old = before.get(k);
      // A missing price and a null one are the same
      const price = listing.price_eur ?? null;
      if (!old) {
        changes.push(`NEW (${listing.kind}): ${describe(listing)} | ${formatPrice(price)}`);
      } else if ((old.price_eur ?? null) !== price && price !== null) {
        changes.push(
          `PRICE (${listing.kind}): ${describe(listing)} | from ${formatPrice(old.price_eur)} to ${formatPrice(price)}`,
        );
      } else if (old.kind !== listing.kind) {
        changes.push(`NOW ${listing.kind.toUpperCase()} (was ${old.kind}): ${describe(listing)}`);
      }
    }
    for (const [k, old] of before) {
      if (!now.has(k)) changes.push(`GONE (${old.kind}): ${describe(old)} | was ${formatPrice(old.price_eur)}`);
    }
    console.log(changes.length ? changes.join("\n") : "no changes");
  } else {
    console.log("first run of this search: nothing to compare with");
  }

  if (!save) return 0;
  const run: Run = JSON.parse(text);
  const saved = {
    date: run.date,
    request: run.request,
    ...(typeof run.page_url === "string" ? { page_url: run.page_url } : {}),
    listings: (listings as Listing[]).map(({ url, shop, item, price_eur, kind }) => ({ url, shop, item, price_eur, kind })),
  };
  const path = `${HOME}/${search}/${timestamp()}.json`;
  await Bun.write(path, JSON.stringify(saved, null, 1));
  console.log(`saved ${path}`);
  return 0;
}

async function main(args: string[]): Promise<number> {
  const [command, search, source = "-"] = args;
  if (command === "list" && args.length === 1) return list();
  if ((command === "diff" || command === "record") && search !== undefined && args.length <= 3) {
    return record(search, source, command === "record");
  }
  console.log(USAGE);
  return 2;
}

process.exit(await main(Bun.argv.slice(2)));
