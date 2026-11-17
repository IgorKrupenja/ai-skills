#!/usr/bin/env bun
/**
 * Volta sales crawl, browser-free.
 *
 * Fetches each Endover Volta building's public apartment table from the ESTONIAN site (the English
 * version has had listing errors), parses it straight from the server-rendered HTML (no browser or
 * Playwright needed), classifies sold vs unsold, and prints the report (overall, per building and
 * per type, WITH and WITHOUT Volta Skai). Diffs against the previous run (aggregates, every flat
 * that changed status, and every flat number that now names a different unit) and appends a record
 * to history.ndjson, including a per-flat snapshot (`units`).
 *
 * Bun only, no dependencies. Run:
 *     bun volta.ts            # crawl, report, and append to history.ndjson
 *     bun volta.ts --dry-run  # crawl, report and diff, but do NOT write history
 */

import { appendFile } from "node:fs/promises"; // Bun.write can't append

const HISTORY = `${import.meta.dir}/history.ndjson`;
// Ask for gzip: these pages are ~2.2 MB uncompressed, and some proxies and CDNs truncate the plain
// transfer mid-stream. The gzipped body (~290 KB) arrives whole, and fetch decompresses it.
const HEADERS = { "User-Agent": "Mozilla/5.0 (volta-sales-crawl)", "Accept-Encoding": "gzip" };

interface Building {
  url: string;
  /**
   * The building's name. A combined page has none: it holds several buildings, split by the
   * "Maja" (house) column, and each row's building is "UV <house cell>" (e.g. "UV 6/1").
   */
  name?: string;
  skai?: boolean;
}

// Always the Estonian pages: the English ones (/en/houses/…) have had listing errors, e.g. UV 10/2
// PH12 listed twice (sold, plus a stray copy "for sale" at 964 900 €).
const BUILDINGS: Building[] = [
  { url: "https://endover.ee/volta/majad/uus-volta-6-1/" }, // UV 6/1, 6/2 and 6/3
  { url: "https://endover.ee/volta/majad/uus-volta-8-1/", name: "UV 8/1" },
  { url: "https://endover.ee/volta/majad/uus-volta-8-2/", name: "UV 8/2" },
  { url: "https://endover.ee/volta/majad/uus-volta-8-3/", name: "UV 8/3" },
  { url: "https://endover.ee/volta/majad/uus-volta-10-2/", name: "UV 10/2" },
  { url: "https://endover.ee/volta/majad/uus-volta-10-3/", name: "UV 10/3" },
  { url: "https://endover.ee/volta/majad/toostuse-47/", name: "Tööstuse 47 (Villa)" },
  { url: "https://endover.ee/volta/majad/mootori-2/", name: "Mootori 2 (Hub)" },
  { url: "https://voltaskai.endover.ee/maja/krulli-10/?field=price&order=desc", name: "Krulli 10 (Skai)", skai: true },
];
const DISPLAY_ORDER = ["UV 6/1", "UV 6/2", "UV 6/3", "UV 8/1", "UV 8/2", "UV 8/3",
  "UV 10/2", "UV 10/3", "Krulli 10 (Skai)", "Mootori 2 (Hub)", "Tööstuse 47 (Villa)"];
const OTHER = "Commercial/other";
const TYPE_ORDER = ["1", "2", "3", "4", "5", OTHER];
const ROOMS = /TUBE|RUUM|TOAD/; // the rooms header varies by page: Tube / Ruume / Toad

type Status = "sold" | "available" | "booked" | "request" | "other";

/** One flat as history.ndjson stores it, keys in this order. */
interface Unit {
  floor?: string;
  rooms?: number;
  m2?: number;
  balcony?: number;
  status: Status;
  price?: number;
  old_price?: number;
}

interface Apt {
  bldg: string;
  nr: string;
  roomKey: string;
  sold: boolean;
  skai: boolean;
  unit: Unit;
}

interface Count {
  sold: number;
  unsold: number;
}

interface Total extends Count {
  total: number;
}

/** {building: {flat nr: unit}} */
type Snapshot = Map<string, Map<string, Unit>>;

/** A line of history.ndjson. Records before 2026-09-26T10:08:04Z have no `units`. */
interface HistoryRecord {
  ts: string;
  overall: { withSkai: Total; withoutSkai: Total };
  byBuilding: Record<string, Count>;
  byType: Record<string, Count>;
  units?: Record<string, Record<string, Unit>>;
}

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

// ---- Parsing ----

/** A cell's text with whitespace runs collapsed to single spaces (cells wrap across lines). */
const collapse = (text: string) => text.split(/\s+/).filter(Boolean).join(" ");

// The named character references these pages use (prices end in "&nbsp;&euro;"); others stay as written.
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: "\xa0", euro: "€" };

/** Decode character references: "319 900&nbsp;&euro;" is "319 900\xa0€". */
function unescapeHtml(text: string): string {
  return text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(\w+));/gi, (ref: string, dec?: string, hex?: string, name?: string) => {
    if (name !== undefined) return ENTITIES[name] ?? ref;
    const code = dec !== undefined ? Number(dec) : parseInt(hex!, 16);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ref;
  });
}

/** Every <tr> as a list of its cells' (td/th) collapsed text. */
function tableRows(html: string): string[][] {
  const rows: string[][] = [];
  let row: string[] | null = null;
  let cell: string[] | null = null;
  let text = ""; // a text node can arrive in chunks: decode it once it's whole
  new HTMLRewriter()
    .on("tr", {
      element(tr) {
        row = [];
        tr.onEndTag(() => {
          if (row) rows.push(row);
          row = null;
        });
      },
    })
    .on("td, th", {
      element(td) {
        if (row) cell = [];
        td.onEndTag(() => {
          if (cell) row?.push(collapse(cell.join("")));
          cell = null;
        });
      },
    })
    .onDocument({
      text(chunk) {
        if (!cell) return;
        text += chunk.text;
        if (chunk.lastInTextNode) {
          cell.push(unescapeHtml(text));
          text = "";
        }
      },
    })
    .transform(html);
  return rows;
}

async function fetchRows(url: string): Promise<string[][]> {
  let html: string;
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(25_000) });
    if (!res.ok) throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
    html = await res.text();
  } catch (e) {
    die(`Failed to fetch ${url}: ${e instanceof Error ? e.message : e}`);
  }
  return tableRows(html);
}

/**
 * Hind-column text to status: sold (Müüdud), available (€ price), booked (Broneeritud), request
 * (Küsi hinda) or other (blank).
 */
function unitStatus(text: string): Status {
  if (/müüdud/iu.test(text)) return "sold"; // everything else counts as unsold
  if (text.includes("€")) return "available";
  if (/^broneeritud$/iu.test(text)) return "booked";
  if (/küsi/iu.test(text)) return "request";
  return "other";
}

/** "319 900 € 339 900 €" gives [319900, 339900]: the current price, then the struck-out old one. */
const prices = (text: string) => [...text.matchAll(/(\d[\d ]*)€/g)].map(m => Number(m[1]!.replaceAll(" ", "")));

/** "84.5", "197,1", "7,4 m2" give 84.5, 197.1, 7.4; "" or "-" give undefined. */
function num(text: string): number | undefined {
  const match = /\d+(?:[.,]\d+)?/.exec(text);
  return match ? Number(match[0].replace(",", ".")) : undefined;
}

async function parseBuilding({ url, name, skai = false }: Building): Promise<Apt[]> {
  const rows = await fetchRows(url);
  const hdr = rows.findIndex(r => {
    const up = r.map(c => c.toUpperCase());
    return up.some(c => ROOMS.test(c)) && up.some(c => c.includes("HIND"));
  });
  if (hdr < 0) die(`No apartment table (rooms + Hind header) found at ${url}`);

  const header = rows[hdr]!.map(c => c.toUpperCase());
  const col = (pattern: RegExp) => header.findIndex(c => pattern.test(c)); // first match, else -1
  const roomI = col(ROOMS), priceI = col(/HIND/), houseI = col(/MAJA/);
  const nrI = col(/^NR/), floorI = col(/KORRUS|KRS/), sizeI = col(/SUURUS/), balconyI = col(/RÕDU/);
  if (nrI < 0) die(`No Nr column in the apartment table at ${url}`);

  // Cells are already trimmed. A missing column (-1) or a short row gives "".
  const cell = (r: string[], j: number) => r[j] ?? "";

  const apts: Apt[] = [];
  for (const r of rows.slice(hdr + 1)) {
    if (!r.length) continue;
    const rooms = cell(r, roomI), priceText = cell(r, priceI);
    const roomKey = /^[0-9]+$/.test(rooms) ? rooms : OTHER;
    const status = unitStatus(priceText);
    const [price, oldPrice] = status === "available" ? prices(priceText) : [];
    apts.push({
      bldg: name ?? `UV ${cell(r, houseI)}`,
      // Some numbers carry a footnote star: "1 *", "B30 *". The space is the only whitespace a
      // collapsed cell has left.
      nr: cell(r, nrI).replace(/[ *]/g, ""),
      roomKey,
      sold: status === "sold",
      skai,
      unit: {
        floor: cell(r, floorI) || undefined,
        rooms: roomKey === OTHER ? undefined : Number(rooms),
        m2: num(cell(r, sizeI)),
        balcony: num(cell(r, balconyI)),
        status,
        price,
        old_price: oldPrice,
      },
    });
  }
  return apts;
}

// ---- Counting ----

function tally(apts: Apt[]): Count {
  const sold = apts.filter(a => a.sold).length;
  return { sold, unsold: apts.length - sold };
}

const withTotal = (t: Count): Total => ({ ...t, total: t.sold + t.unsold });

function byType(apts: Apt[]): Map<string, Count> {
  const counts = new Map(TYPE_ORDER.map(k => [k, { sold: 0, unsold: 0 }]));
  for (const a of apts) counts.get(counts.has(a.roomKey) ? a.roomKey : OTHER)![a.sold ? "sold" : "unsold"]++;
  return counts;
}

/**
 * Count a flat number listed twice in one building once. Guards against listing errors like the
 * English site's UV 10/2 PH12, listed twice: sold (114.4 m²) plus a stray "ph12-2" copy at
 * 964 900 €. Keeps the sold row (a sold flat can't also be for sale), else the first one, and
 * returns a warning line per duplicate.
 */
function dedupe(all: Apt[]): { apts: Apt[]; warnings: string[] } {
  const keep = new Map<string, Apt>();
  const warnings: string[] = [];
  for (const a of all) {
    const key = JSON.stringify([a.bldg, a.nr]);
    const first = keep.get(key);
    if (!first) {
      keep.set(key, a);
      continue;
    }
    const [kept, ignored] = a.sold && !first.sold ? [a, first] : [first, a];
    keep.set(key, kept);
    warnings.push(`⚠️ ${ignored.bldg} lists #${kept.nr} twice (site error): counted once, as `
      + `${statusLabel(kept.unit)} (${area(kept.unit)} m²); ignored the duplicate `
      + `${statusLabel(ignored.unit)} (${area(ignored.unit)} m²).`);
  }
  return { apts: [...keep.values()], warnings };
}

// ---- Formatting ----

const pct = (sold: number, total: number) => (total ? `${((100 * sold) / total).toFixed(1)}%` : "n/a");

/** Sold, unsold, total, % sold: a table row's numbers. */
const countCells = ({ sold, unsold }: Count) => [sold, unsold, sold + unsold, pct(sold, sold + unsold)];

function md(headers: string[], rows: (string | number)[][]): void {
  console.log(`| ${headers.join(" | ")} |`);
  console.log(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const row of rows) console.log(`| ${row.join(" | ")} |`);
  console.log();
}

const typeLabel = (k: string) => (k === OTHER ? OTHER : `${k}-room`);

/** Natural order for flat numbers: "9" < "10", "B4" < "B30". */
function natCompare(a: string, b: string): number {
  // Splitting on digit runs puts the numbers at odd indexes: "B30" is ["B", "30", ""].
  const pa = a.split(/(\d+)/), pb = b.split(/(\d+)/);
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    const x = pa[i]!, y = pb[i]!;
    const diff = i % 2 ? Number(x) - Number(y) : x < y ? -1 : x > y ? 1 : 0;
    if (diff) return diff;
  }
  return pa.length - pb.length;
}

/** 429900 is "429 900 €". */
const eur = (v: number) => `${String(v).replace(/\B(?=(\d{3})+$)/g, " ")} €`;

const area = (u: Unit) => (u.m2 === undefined ? "?" : String(u.m2));

function statusLabel(u: Unit): string {
  if (u.status === "available" && u.price !== undefined) return `available ${eur(u.price)}`;
  return u.status === "request" ? "price on request" : u.status;
}

/** "3-room, 84.5 m², floor 3": the flat's type, then its size and floor where known. */
function unitDesc(u: Unit): string {
  const bits = [u.rooms !== undefined ? `${u.rooms}-room` : "commercial/other"];
  if (u.m2 !== undefined) bits.push(`${u.m2} m²`);
  if (u.floor !== undefined) bits.push(`floor ${u.floor}`);
  return bits.join(", ");
}

const flatLabel = (bldg: string, nr: string, u: Unit) => `${bldg} #${nr} (${unitDesc(u)})`;

// ---- Diffing ----

const changed = (now: Count, was: Count) => now.sold !== was.sold || now.unsold !== was.unsold;

function delta(now: number, was: number): string {
  const d = now - was;
  return `${was} → ${now} (${d > 0 ? "+" : ""}${d || "±0"})`;
}

const countDelta = (now: Count, was: Count) => `sold ${delta(now.sold, was.sold)}, unsold ${delta(now.unsold, was.unsold)}`;

/**
 * Whether a flat number now names a different unit: its type or floor changed, or its size by over
 * 10%. Skai reuses numbers when it re-plans: on 2026-11-17 its commercial B4, B6, B7 and B8 became
 * new flats on floors 2 and 3, and sold #132 grew from 142.4 to 341.8 m² as sold #133 and #134 went.
 * Smaller size edits are corrections (Skai's B4 went from 430 to 436.9 m² on 2026-10-21), and so
 * are balcony sizes, which change often.
 */
function isReplaced(was: Unit, now: Unit): boolean {
  if (was.rooms !== now.rooms) return true;
  if (was.floor !== undefined && now.floor !== undefined && was.floor !== now.floor) return true;
  return was.m2 !== undefined && now.m2 !== undefined && Math.abs(now.m2 - was.m2) > 0.1 * was.m2;
}

/** Markdown bullets for every flat whose status changed, that now names a different unit, or that appeared or vanished. */
function unitChanges(wasUnits: Snapshot, nowUnits: Snapshot): string[] {
  const out: string[] = [];
  for (const [name, now] of nowUnits) {
    const was = wasUnits.get(name);
    if (!was) {
      out.push(`- ${name}: new in the crawl (${now.size} flats)`);
      continue;
    }
    for (const nr of [...new Set([...was.keys(), ...now.keys()])].sort(natCompare)) {
      const w = was.get(nr), n = now.get(nr);
      if (w && n && isReplaced(w, n)) {
        out.push(`- ${name} #${nr}: replaced by a different unit: `
          + `${unitDesc(w)}, ${statusLabel(w)} → ${unitDesc(n)}, ${statusLabel(n)}`);
      } else if (w && n && w.status !== n.status) out.push(`- ${flatLabel(name, nr, n)}: ${statusLabel(w)} → ${statusLabel(n)}`);
      else if (n && !w) out.push(`- ${flatLabel(name, nr, n)}: new in the table (${statusLabel(n)})`);
      else if (w && !n) out.push(`- ${flatLabel(name, nr, w)}: no longer listed (was ${statusLabel(w)})`);
    }
  }
  for (const name of wasUnits.keys()) if (!nowUnits.has(name)) out.push(`- ${name}: no longer crawled`);
  return out;
}

/** history.ndjson's non-blank lines, none if it doesn't exist yet. */
async function historyLines(): Promise<string[]> {
  const file = Bun.file(HISTORY);
  if (!(await file.exists())) return [];
  return (await file.text()).split("\n").filter(line => line.trim());
}

async function main(): Promise<void> {
  const dryRun = Bun.argv.slice(2).includes("--dry-run");

  const crawled: Apt[] = [];
  for (const building of BUILDINGS) crawled.push(...(await parseBuilding(building)));
  const { apts, warnings } = dedupe(crawled);
  const nonSkai = apts.filter(a => !a.skai);

  // Per-flat snapshot, {building: {flat nr: {floor, rooms, m2, balcony, status, price, old_price}}}:
  // buildings in display order (any others after, A to Z), flats in natural order.
  const groups = Map.groupBy(apts, a => a.bldg);
  const others = [...groups.keys()].filter(name => !DISPLAY_ORDER.includes(name)).sort();
  const units: Snapshot = new Map();
  for (const name of [...DISPLAY_ORDER, ...others]) {
    const flats = groups.get(name);
    if (flats) units.set(name, new Map(flats.map(a => [a.nr, a.unit] as const).sort(([x], [y]) => natCompare(x, y))));
  }

  const ovWith = withTotal(tally(apts));
  const ovWithout = withTotal(tally(nonSkai));
  const byBuilding = new Map([...groups].map(([name, flats]) => [name, tally(flats)]));
  const typeWith = byType(apts), typeWithout = byType(nonSkai);

  // ---- Report ----
  console.log("## Volta: sold vs unsold\n");
  console.log("### Overall: WITH Skai (all buildings)");
  md(["Sold", "Unsold", "Total", "% Sold"], [countCells(ovWith)]);
  console.log("### Overall: without Skai (excludes Krulli 10)");
  md(["Sold", "Unsold", "Total", "% Sold"], [countCells(ovWithout)]);

  console.log("### Per building");
  const buildingRows = DISPLAY_ORDER.flatMap(name => {
    const b = byBuilding.get(name);
    return b ? [[name, ...countCells(b)]] : [];
  });
  md(["Building", "Sold", "Unsold", "Total", "% Sold"], buildingRows);

  const typeTables = [["WITH Skai (all buildings)", typeWith], ["without Skai (excludes Krulli 10)", typeWithout]] as const;
  for (const [label, counts] of typeTables) {
    console.log(`### Per apartment type: ${label}`);
    md(["Type", "Sold", "Unsold", "Total", "% Sold"], TYPE_ORDER.map(k => [typeLabel(k), ...countCells(counts.get(k)!)]));
  }

  console.log("> _Unsold_ = available + reserved (Booked) + price-on-request + commercial/other "
    + "(everything not Sold).\n");

  // ---- Reconcile ----
  const sum = (counts: Iterable<Count>) => [...counts].reduce((n, c) => n + c.sold + c.unsold, 0);
  const bSum = sum(byBuilding.values()), tSum = sum(typeWith.values());
  const ok = bSum === ovWith.total && ovWith.total === tSum;
  console.log(`Reconciliation: per-building total ${bSum}, per-type total ${tSum}, `
    + `overall ${ovWith.total} (${ok ? "✓ match" : "✗ MISMATCH, re-check a page"}).\n`);
  for (const w of warnings) console.log(`${w}\n`);

  // ---- Diff against the previous run ----
  const lines = await historyLines();
  const prev = lines.length ? (JSON.parse(lines.at(-1)!) as HistoryRecord) : undefined;
  console.log("### Changes since last run");
  if (!prev) {
    console.log("No previous run to compare against.\n");
  } else {
    console.log(`_baseline: ${prev.ts}_\n`);
    console.log(`- Overall WITH Skai: ${countDelta(ovWith, prev.overall.withSkai)}`);
    console.log(`- Overall without Skai: ${countDelta(ovWithout, prev.overall.withoutSkai)}`);
    for (const name of DISPLAY_ORDER) {
      const now = byBuilding.get(name), was = prev.byBuilding[name];
      if (now && was && changed(now, was)) console.log(`- ${name}: ${countDelta(now, was)}`);
    }
    for (const k of TYPE_ORDER) {
      const now = typeWith.get(k)!, was = prev.byType[k];
      if (was && changed(now, was)) console.log(`- ${typeLabel(k)}: ${countDelta(now, was)}`);
    }
    const prevNames = Object.keys(prev.byBuilding);
    const added = [...byBuilding.keys()].filter(name => !prevNames.includes(name)).sort();
    const gone = prevNames.filter(name => !byBuilding.has(name)).sort();
    if (added.length || gone.length) {
      console.log(`- ⚠️ building keys changed (new: ${added.join(", ") || "none"}, vanished: ${gone.join(", ") || "none"})`);
    }
    if (!prev.units) {
      console.log("\n_Per-flat changes start from the next run: the previous run has no per-flat snapshot._");
    } else {
      const wasUnits: Snapshot = new Map(
        Object.entries(prev.units).map(([name, flats]) => [name, new Map(Object.entries(flats))]),
      );
      const changes = unitChanges(wasUnits, units);
      console.log(changes.length ? "\nFlats that changed status or unit:" : "\nNo flat changed status or unit.");
      for (const line of changes) console.log(line);
    }
    console.log();
  }

  // ---- Save the run ----
  const record = {
    ts: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    overall: { withSkai: ovWith, withoutSkai: ovWithout },
    byBuilding: new Map(DISPLAY_ORDER.filter(name => byBuilding.has(name)).map(name => [name, byBuilding.get(name)!])),
    byType: typeWith,
    units,
  };
  if (dryRun) {
    console.log("(--dry-run: not writing history)");
    return;
  }
  // The Maps (kept for their order) go into the JSON as plain objects
  const line = JSON.stringify(record, (_key, value: unknown) => (value instanceof Map ? Object.fromEntries(value) : value));
  await appendFile(HISTORY, `${line}\n`);
  console.log(`Saved run \`${record.ts}\` (${(await historyLines()).length} total records in history).`);
}

await main();
