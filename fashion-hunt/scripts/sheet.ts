#!/usr/bin/env bun
/**
 * Put the photos of a scan's candidates on numbered contact sheets, so an agent can settle many
 * unclear candidates by looking at a few images. USAGE below says how.
 */

import { parseArgs } from "node:util";
import { TYPES, fetchPhoto, smaller, viaBrowser } from "./photos.ts";
import type { Candidate, ScanFile } from "./scan.ts";

const USAGE = `Put the photos of a scan's candidates on numbered contact sheets.

    sheet.ts <scan file> [--ids <id>,...] [--loose] [--code <code>] [--traits <traits>] [--out <folder>]

Takes the candidates the options pick (by default every one the last run didn't judge; with
--loose, those --match left out instead, and --ids finds those too), fetches
their photos, and puts them 24 to a sheet, each numbered, with ImageMagick's montage. Prints the
sheets' paths, to read as images, and a legend: number | id | price | title. Photos from shops that
refuse scripts are fetched in the ai-skills browser, so it must be open. Sheets go to --out, by
default sheets/ next to the scan file.
`;

const PER_SHEET = 24;
const FONT = "/System/Library/Fonts/Supplemental/Arial.ttf";

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: { ids: { type: "string" }, loose: { type: "boolean" }, code: { type: "string" }, traits: { type: "string" }, out: { type: "string" }, help: { type: "boolean", short: "h" } },
    allowPositionals: true,
  });
  const [scanPath] = positionals;
  if (values.help || !scanPath || positionals.length > 1) {
    console.log(USAGE);
    return values.help ? 0 : 2;
  }
  if (!Bun.which("magick")) die("sheet.ts needs ImageMagick (brew install imagemagick); without it, read the photos one by one");
  const scan = (await Bun.file(scanPath).json()) as ScanFile;
  const ids = new Set((values.ids ?? "").split(/[\s,]+/).filter(Boolean));
  const pool = values.loose ? (scan.loose ?? []) : ids.size ? [...scan.candidates, ...(scan.loose ?? [])] : scan.candidates;
  const picked = pool.filter(c =>
    ids.size ? ids.has(String(c.id)) : values.code ? c.code === values.code.toUpperCase() : values.traits ? c.traits === values.traits.toUpperCase() : !c.known,
  );
  if (!picked.length) die("no candidates picked");
  const withPhoto = picked.filter(c => c.photo);
  const folder = (values.out ?? `${scanPath.replace(/\/[^/]*$/, "") || "."}/sheets`).replace(/\/$/, "");
  const tmp = `${folder}/.tiles-${process.pid}`;

  // Each photo, fetched directly where the shop allows it, else in the browser
  const files = new Map<Candidate, string>();
  const refused: Candidate[] = [];
  await Promise.all(withPhoto.map(async c => {
    const photo = await fetchPhoto(smaller(c.photo!));
    if (!photo) return void refused.push(c);
    const path = `${tmp}/${c.id}.${TYPES[photo.type]}`;
    await Bun.write(path, photo.data);
    files.set(c, path);
  }));
  const origins = new Map<string, Candidate[]>();
  for (const c of refused) origins.set(new URL(c.url).origin, [...(origins.get(new URL(c.url).origin) ?? []), c]);
  for (const [origin, group] of origins) {
    const got = await viaBrowser(origin, "photo", group.map(c => smaller(c.photo!)));
    for (const c of group) {
      const photo = got?.[smaller(c.photo!)];
      if (photo && typeof photo === "object" && TYPES[photo.type]) {
        const path = `${tmp}/${c.id}.${TYPES[photo.type]}`;
        await Bun.write(path, Uint8Array.from(atob(photo.b64), ch => ch.charCodeAt(0)));
        files.set(c, path);
      }
    }
  }

  // Numbered tiles, then sheets of 24
  const shown = withPhoto.filter(c => files.has(c));
  const font = (await Bun.file(FONT).exists()) ? ["-font", FONT] : [];
  const tiles: string[] = [];
  for (const [i, c] of shown.entries()) {
    const tile = `${tmp}/tile-${String(i + 1).padStart(3, "0")}.png`;
    const label = String(i + 1);
    const made = await Bun.$`magick ${files.get(c)!} -resize 220x220 -background white -gravity center -extent 220x220 ${font} -pointsize 20 -fill red -gravity north -annotate +0+2 ${label} ${tile}`.quiet().nothrow();
    if (made.exitCode === 0) tiles.push(tile);
  }
  const sheets: string[] = [];
  for (let i = 0; i < tiles.length; i += PER_SHEET) {
    const sheet = `${folder}/sheet-${Math.floor(i / PER_SHEET) + 1}.png`;
    await Bun.$`magick montage ${tiles.slice(i, i + PER_SHEET)} -tile 6x4 -geometry +3+3 ${sheet}`.quiet();
    sheets.push(sheet);
  }
  await Bun.$`rm -rf ${tmp}`.quiet().nothrow();

  console.log(`sheets (read each as an image):\n${sheets.map(s => `  ${s}`).join("\n")}`);
  for (const [i, c] of shown.entries()) {
    const price = c.price_eur !== undefined ? `€${c.price_eur}` : c.price !== undefined ? `${c.price} ${c.currency}` : "?";
    console.log(`${i + 1} | ${c.id} | ${price} | ${c.title}`);
  }
  const missing = picked.filter(c => !files.has(c));
  if (missing.length) console.log(`no photo for: ${missing.map(c => c.id).join(", ")}`);
  return 0;
}

if (import.meta.main) process.exit(await main());
