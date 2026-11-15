#!/usr/bin/env bun
/**
 * Print the shops bookmarked under Fashion/Online and Fashion/Tallinn in BOOKMARKS_FILE.
 *
 * Pass --city <name> (repeatable) to also read another city's folder, such as Fashion/Helsinki.
 * BOOKMARKS_FILE comes from the skills .env, so load that first.
 */

import { parseArgs } from "node:util";

const PARENT_FOLDER = "Fashion";
const DEFAULT_FOLDERS = ["Online", "Tallinn"];

const USAGE = "usage: read_vivaldi_bookmarks.ts [-h] [--city NAME]";
// The help as Python's argparse printed it
const HELP = `${USAGE}

Print the shops bookmarked under Fashion/Online and Fashion/Tallinn in
BOOKMARKS_FILE.

optional arguments:
  -h, --help   show this help message and exit
  --city NAME  also read ${PARENT_FOLDER}/NAME, for a city the user asks about
               (repeatable)`;

/** A bookmark or a folder of them, as Vivaldi and other Chromium browsers save them. */
type BookmarkNode = { type?: unknown; name?: unknown; url?: unknown; children?: unknown };
type Store = { folder: string; path: string; title: string; url: string };

/** A JSON object, such as a bookmark node. */
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const childrenOf = (node: BookmarkNode): BookmarkNode[] =>
  Array.isArray(node.children) ? node.children.filter(isObject) : [];

/** Python's str.casefold(), near enough for comparing folder names: "Straße" matches "STRASSE". */
const fold = (name: string) => name.toUpperCase().toLowerCase();

function parseCities(args: string[]): string[] {
  let values;
  try {
    ({ values } = parseArgs({
      args,
      options: {
        city: { type: "string", multiple: true, default: [] },
        help: { type: "boolean", short: "h" },
      },
    }));
  } catch (error) {
    // Exit like argparse did on bad arguments: usage and status 2
    console.error(`${USAGE}\nread_vivaldi_bookmarks.ts: error: ${(error as Error).message}`);
    process.exit(2);
  }
  if (values.help) {
    console.log(HELP);
    process.exit(0);
  }
  return values.city;
}

async function findBookmarksFile(): Promise<string> {
  const value = Bun.env.BOOKMARKS_FILE;
  if (!value) throw new Error("BOOKMARKS_FILE is not set: load the skills .env first");
  const path = value.replace(/^~(?=\/|$)/, Bun.env.HOME ?? "~");
  if (!(await Bun.file(path).exists())) throw new Error(`BOOKMARKS_FILE is not a file: ${path}`);
  return path;
}

function walkFolder(node: BookmarkNode, path: string[], folder: string, output: Store[]): void {
  for (const child of childrenOf(node)) {
    const name = String(child.name ?? "");
    const childPath = name ? [...path, name] : path;
    if (child.type === "url") {
      const url = child.url;
      if (typeof url === "string" && /^https?:\/\//.test(url)) {
        output.push({ folder, path: childPath.join("/"), title: name, url });
      }
    } else {
      walkFolder(child, childPath, folder, output);
    }
  }
}

/**
 * Return the wanted folders found (keyed by casefolded name), all folders under Fashion, and the
 * shops in the wanted ones.
 */
function collectTargets(bookmarks: unknown, wanted: string[]) {
  const wantedKeys = new Set(wanted.map(fold));
  const found = new Map<string, string>();
  const available = new Set<string>();
  const entries: Store[] = [];

  const visit = (node: BookmarkNode, path: string[]): void => {
    const name = String(node.name ?? "");
    const current = name ? [...path, name] : path;
    if (node.type === "folder" && current.length >= 2 && current.at(-2) === PARENT_FOLDER) {
      const folder = current.at(-1)!;
      available.add(folder);
      if (wantedKeys.has(fold(folder))) {
        found.set(fold(folder), folder);
        walkFolder(node, current, folder, entries);
      }
      return;
    }
    for (const child of childrenOf(node)) visit(child, current);
  };

  const roots = isObject(bookmarks) && isObject(bookmarks.roots) ? bookmarks.roots : {};
  for (const [rootKey, rootNode] of Object.entries(roots)) {
    if (["deleted", "trash"].includes(fold(rootKey)) || !isObject(rootNode)) continue;
    visit(rootNode, []);
  }

  // A shop bookmarked twice is listed once, where it first appears
  const seen = new Set<string>();
  const stores = entries.filter(entry => {
    if (seen.has(entry.url)) return false;
    seen.add(entry.url);
    return true;
  });
  return { found, available, stores };
}

async function main(): Promise<number> {
  const wanted: string[] = [];
  for (const name of [...DEFAULT_FOLDERS, ...parseCities(Bun.argv.slice(2))]) {
    if (!wanted.some(w => fold(w) === fold(name))) wanted.push(name);
  }

  let bookmarksPath: string;
  let bookmarks: unknown;
  try {
    bookmarksPath = await findBookmarksFile();
    bookmarks = JSON.parse(await Bun.file(bookmarksPath).text());
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }
  const { found, available, stores } = collectTargets(bookmarks, wanted);

  const searched = wanted.filter(name => found.has(fold(name))).map(name => found.get(fold(name))!);
  const folderCounts = Object.fromEntries(
    searched.map(name => [name, stores.filter(store => store.folder === name).length]),
  );
  const result = {
    bookmarks_file: bookmarksPath,
    folders_found: searched,
    folders_missing: wanted.filter(name => !found.has(fold(name))),
    folder_counts: folderCounts,
    folders_empty: searched.filter(name => folderCounts[name] === 0),
    // City folders not read this time; read one with --city only when the user asks about it
    other_folders: [...available].filter(name => !searched.includes(name)).sort(),
    stores,
  };
  console.log(JSON.stringify(result, null, 2));
  return 0;
}

process.exit(await main());
