#!/usr/bin/env bun
/**
 * Give each listing in a fashion-hunt run file a small photo for the report page. USAGE below says
 * how; photos come from the URL the shop agent reported, or else from the listing page's og:image.
 */

import { budgetLeft, photoGroups, spendBudget } from "./common.ts";

const USAGE = `Give each listing in a run file a small photo for the report page.

    photos.ts <run.json>

A listing's photo is the URL of its main photo that the shop agent reported in photo, or else
the og:image of its page, also when photo is a stand-in such as eBay's stock image. The script saves a copy about 320 pixels wide in img/ next to the run
file and sets the listing's image to its path, which report.ts shows as a thumbnail. Listings
that already have a saved image keep it. Shops that refuse scripts, such as Vestiaire Collective,
are read inside the ai-skills browser instead, so it must be open (browser.ts open).

It then prints the files to publish with the page, as the JSON list the Artifact tool's files
takes with root set to the run file's folder, and the listings that share a photo, even where each
shop saved it at another size or quality: often one bag listed twice or in several shops, or a
seller using someone else's photos. report.ts marks those on the page.
`;

const WIDTH = 320;
/** A downloaded photo larger than this is shrunk with macOS's sips. */
const MAX_BYTES = 60_000;
export const TYPES: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png", "image/avif": "avif" };
const HEADERS = { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36" };
const TAB = `${import.meta.dir}/tab.ts`;
/** Stand-ins a shop shows until a photo loads, such as eBay's stock image on search cards. */
const PLACEHOLDER = /ebaystatic\.com\/pictures\/aw\/pics\/stockimage|\/(placeholder|no[-_]?image|spacer|blank)\.(gif|png|jpe?g|svg|webp)\b/i;

type Listing = { url: string; photo?: unknown; image?: unknown };
type Photo = { type: string; data: Uint8Array };
/** What inPage returns: an og:image URL or a base64 photo for each URL, or null. */
type PageResult = Record<string, string | { type: string; b64: string } | null>;

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

/** The og:image of a listing page's HTML, resolved against the page's URL. */
function ogImage(html: string, page: string): string | null {
  const tag = html.match(/<meta[^>]+property=["']og:image["'][^>]*>/i)?.[0] ?? html.match(/<meta[^>]+content=["'][^"']+["'][^>]+property=["']og:image["'][^>]*>/i)?.[0];
  const content = tag?.match(/content=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, "&");
  if (!content) return null;
  try {
    return new URL(content, page).href;
  } catch {
    return null;
  }
}

/** The URL of a smaller copy, where the shop's image service makes one. */
export function smaller(photo: string): string {
  const url = photo.replace(/^http:/, "https:");
  if (/images\.vestiairecollective\.com\/images\/resized\//.test(url)) return url.replace(/w=\d+,q=\d+/, `w=${WIDTH},q=70`);
  if (/\/cdn\/shop\/|cdn\.shopify\.com/.test(url)) return `${url}${url.includes("?") ? "&" : "?"}width=${WIDTH}`;
  if (/i\.ebayimg\.com\//.test(url)) return url.replace(/\/s-l\d+\./, "/s-l300.");
  return url;
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: HEADERS });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

export async function fetchPhoto(url: string): Promise<Photo | null> {
  try {
    const res = await fetch(url, { headers: { ...HEADERS, accept: "image/webp,image/jpeg,image/*;q=0.8" } });
    const type = res.headers.get("content-type")?.split(";")[0] ?? "";
    return res.ok && TYPES[type] ? { type, data: new Uint8Array(await res.arrayBuffer()) } : null;
  } catch {
    return null;
  }
}

/**
 * Runs in a tab of the shop's own site, where its pages and photos load as they do for a visitor:
 * "page" returns each URL's og:image, "photo" each photo as base64. It must stay self-contained.
 */
async function inPage({ kind, urls, workers = 8, pause = 0, tries = 3 }: { kind: "page" | "photo"; urls: string[]; workers?: number; pause?: number; tries?: number }): Promise<PageResult> {
  const out: PageResult = {};
  async function read(url: string) {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(String(res.status));
    if (kind === "page") {
      const html = await res.text();
      const tag = html.match(/<meta[^>]+property=["']og:image["'][^>]*>/i)?.[0] ?? html.match(/<meta[^>]+content=["'][^"']+["'][^>]+property=["']og:image["'][^>]*>/i)?.[0];
      const content = tag?.match(/content=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, "&");
      if (!content) throw new Error("no og:image");
      return new URL(content, url).href;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    let text = "";
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { type: res.headers.get("content-type")?.split(";")[0] ?? "", b64: btoa(text) };
  }
  let next = 0;
  // A 429 means the site is limiting us: stop at once, since every further request, retries
  // included, makes the block last longer (Farfetch's photo server, November 2026)
  let limited = false;
  async function worker() {
    while (next < urls.length && !limited) {
      // eslint-disable-next-line bun/prefer-builtin-sleep -- this runs in the shop's page, so no Bun globals
      if (pause && next) await new Promise(resolve => setTimeout(resolve, pause));
      const url = urls[next++]!;
      out[url] = null;
      // More tries after a pause, for the odd request a busy shop drops
      for (let attempt = 0; attempt < tries && out[url] === null && !limited; attempt++) {
        try {
          out[url] = await read(url);
        } catch (e) {
          if (String((e as Error)?.message) === "429") limited = true;
          // eslint-disable-next-line bun/prefer-builtin-sleep -- this runs in the shop's page, so no Bun globals
          else await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
  }
  await Promise.all(Array.from({ length: workers }, worker));
  return out;
}

/** Run inPage in a tab of origin, opened for this call only. */
/** How to read a touchy site's pages: one at a time, apart, and without retries, which count too. */
const GENTLE = { workers: 1, pause: 2000, tries: 1 };

export async function viaBrowser(origin: string, kind: "page" | "photo", urls: string[], options: Partial<typeof GENTLE> = {}): Promise<PageResult | null> {
  const tag = `photos-${Math.random().toString(36).slice(2, 8)}`;
  const opened = await Bun.$`bun ${TAB} open ${tag} ${origin}`.quiet().nothrow();
  if (opened.exitCode !== 0) {
    console.warn(`couldn't open ${origin} in the ai-skills browser, so ${urls.length} photos are missing: ${opened.stderr.toString().trim()}`);
    return null;
  }
  try {
    const code = `async (p) => p.evaluate(${inPage.toString()}, ${JSON.stringify({ kind, urls, ...options })})`;
    const ran = await Bun.$`bun ${TAB} run ${tag} < ${new Response(code)}`.quiet().nothrow();
    if (ran.exitCode !== 0) {
      console.warn(`reading ${origin} in the browser failed: ${ran.stderr.toString().trim()}`);
      return null;
    }
    return JSON.parse(ran.stdout.toString());
  } finally {
    await Bun.$`bun ${TAB} close ${tag}`.quiet().nothrow();
  }
}

/**
 * Photos a shop sends only to its own pages: fetched from a tab of the shop's site, then, for those
 * still missing, from a tab of the photo's own site, since a photo server on a site of its own may
 * refuse a script on the shop's (Farfetch's cdn-images, November 2026). Keyed by photo URL.
 */
export async function photosViaBrowser(items: { page: string; photo: string }[]): Promise<Map<string, { type: string; b64: string }>> {
  const out = new Map<string, { type: string; b64: string }>();
  for (const site of ["page", "photo"] as const) {
    const groups = new Map<string, string[]>();
    for (const it of items) {
      if (out.has(it.photo)) continue;
      const origin = new URL(it[site]).origin;
      groups.set(origin, [...(groups.get(origin) ?? []), it.photo]);
    }
    for (const [origin, urls] of groups) {
      const got = await viaBrowser(origin, "photo", [...new Set(urls)]);
      for (const url of urls) {
        const photo = got?.[url];
        if (photo && typeof photo === "object" && TYPES[photo.type]) out.set(url, photo);
      }
    }
  }
  return out;
}

/** Group listings by the origin of their page, for one browser tab per shop. */
function byOrigin(listings: Listing[]): Map<string, Listing[]> {
  const groups = new Map<string, Listing[]>();
  for (const listing of listings) {
    const origin = new URL(listing.url).origin;
    groups.set(origin, [...(groups.get(origin) ?? []), listing]);
  }
  return groups;
}

/** Shrink a large photo to a JPEG WIDTH pixels wide with sips, and return its new path. */
async function shrink(path: string): Promise<string> {
  if (!Bun.which("sips")) return path;
  const out = path.replace(/\.[a-z]+$/, ".jpg");
  const done = await Bun.$`sips -s format jpeg -s formatOptions 70 -Z ${WIDTH} ${path} --out ${out}`.quiet().nothrow();
  if (done.exitCode !== 0) return path;
  if (out !== path) await Bun.file(path).delete();
  return out;
}

async function main(args: string[]): Promise<number> {
  const [source] = args;
  if (args.length !== 1 || !source) {
    console.log(USAGE);
    return 2;
  }
  const run = await Bun.file(source).json();
  if (!Array.isArray(run.listings)) die("the run needs a 'listings' list");
  const listings = run.listings as Listing[];
  const folder = source.includes("/") ? source.slice(0, source.lastIndexOf("/")) : ".";

  const todo: Listing[] = [];
  for (const listing of listings) {
    // A stand-in isn't the listing's photo, so look for the real one on its page
    if (typeof listing.photo === "string" && PLACEHOLDER.test(listing.photo)) {
      delete listing.photo;
      delete listing.image;
    }
    const saved = typeof listing.image === "string" && (await Bun.file(`${folder}/${listing.image}`).exists());
    if (!saved && typeof listing.url === "string") todo.push(listing);
  }

  // The photo's URL: the agent's, or the page's og:image, read in the browser where a shop refuses scripts
  const photoUrl = new Map<Listing, string>();
  const refused: Listing[] = [];
  await Promise.all(todo.map(async listing => {
    if (typeof listing.photo === "string" && listing.photo) return photoUrl.set(listing, listing.photo);
    const html = await fetchPage(listing.url);
    const og = html ? ogImage(html, listing.url) : null;
    if (og) photoUrl.set(listing, og);
    else refused.push(listing);
  }));
  for (const [origin, all] of byOrigin(refused)) {
    // eBay blocks after about 15 item pages, so read only what its budget allows now, gently
    let group = all;
    const ebay = /ebay\.de$/.test(new URL(origin).hostname);
    if (ebay) {
      const { left, freeAt } = await budgetLeft("ebay.de pages");
      group = all.slice(0, left);
      if (group.length < all.length) console.warn(`${all.length - group.length} eBay item pages left for later: eBay blocks after about 15 in ten minutes, so run photos.ts again from ${freeAt.toTimeString().slice(0, 5)} on`);
      await spendBudget("ebay.de pages", group.length);
    }
    if (!group.length) continue;
    const found = await viaBrowser(origin, "page", group.map(listing => listing.url), ebay ? GENTLE : {});
    for (const listing of group) {
      const og = found?.[listing.url];
      if (typeof og === "string") photoUrl.set(listing, og);
    }
  }

  // The photo itself, the same way
  const photos = new Map<Listing, Photo>();
  const blocked: Listing[] = [];
  await Promise.all([...photoUrl].map(async ([listing, url]) => {
    const photo = await fetchPhoto(smaller(url));
    if (photo) photos.set(listing, photo);
    else blocked.push(listing);
  }));
  const got = await photosViaBrowser(blocked.map(listing => ({ page: listing.url, photo: smaller(photoUrl.get(listing)!) })));
  for (const listing of blocked) {
    const photo = got.get(smaller(photoUrl.get(listing)!));
    if (photo) photos.set(listing, { type: photo.type, data: Uint8Array.from(atob(photo.b64), c => c.charCodeAt(0)) });
  }

  for (const [listing, photo] of photos) {
    let path = `img/${Bun.hash(listing.url).toString(36)}.${TYPES[photo.type]}`;
    await Bun.write(`${folder}/${path}`, photo.data);
    if (photo.data.length > MAX_BYTES) path = (await shrink(`${folder}/${path}`)).slice(folder.length + 1);
    listing.image = path;
  }
  await Bun.write(source, JSON.stringify(run, null, 1));

  const missing = todo.filter(listing => !photos.has(listing));
  console.log(`photos: ${photos.size} new, ${listings.length - todo.length} kept, ${missing.length} missing`);
  for (const listing of missing) console.log(`  no photo: ${listing.url}`);

  // The files to publish, and the listings with the same photo, as report.ts will mark them
  let bytes = 0;
  const files: { path: string; contentType: string }[] = [];
  for (const listing of listings) {
    if (typeof listing.image !== "string") continue;
    const file = Bun.file(`${folder}/${listing.image}`);
    if (!(await file.exists())) continue;
    bytes += file.size;
    const ext = listing.image.split(".").pop();
    files.push({ path: listing.image, contentType: Object.keys(TYPES).find(type => TYPES[type] === ext) ?? "image/jpeg" });
  }
  const groups = await photoGroups(listings.map(listing => (typeof listing.image === "string" ? `${folder}/${listing.image}` : null)));
  for (const group of groups) console.log(`same photo: ${group.map(i => listings[i]!.url).join(" ")}`);
  if (files.length > 250) console.log(`${files.length} photos are more than one publish takes (255 files): build the page with report.ts --inline and publish it alone`);
  console.log(`files (${(bytes / 1024 / 1024).toFixed(1)} MB, publish with root ${folder}):`);
  console.log(JSON.stringify(files));
  return 0;
}

if (import.meta.main) process.exit(await main(Bun.argv.slice(2)));
