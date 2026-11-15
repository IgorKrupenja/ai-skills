#!/usr/bin/env bun
/**
 * Sync sources.yaml with the bookmarks folder (social-calendar skill).
 *
 * Bookmarks are the inbox: the user adds and deletes sources there while browsing.
 * sources.yaml is the copy kept next to the skill, with a free-text `notes` field per source.
 * On every run:
 *   - bookmarks missing from the file are added (the subfolder path becomes `category`),
 *   - sources whose bookmark was deleted are removed,
 *   - `name` and `category` follow the bookmark, `notes` are kept,
 *   - when a bookmark's URL changed but its name didn't, its notes move over.
 * Prints the diff, then the synced list as TSV: category, name, url, notes.
 *
 * No YAML library is used, so the YAML is a fixed subset: one mapping per source, every value a
 * double-quoted string on a single line.
 */

const YAML_PATH = `${import.meta.dir}/sources.yaml`;
const KEYS = ["name", "category", "url", "notes"] as const;
const HEADER = `# Sources for the social-calendar crawl, synced from the bookmarks folder by sync_sources.ts
# on every crawl: new bookmarks are added, deleted ones are removed, \`notes\` are kept.
# Edit \`notes\` freely, but keep every value a double-quoted string on a single line.`;

type Source = Record<(typeof KEYS)[number], string>;
/** A node of the Chromium bookmarks JSON: a folder with children, or a bookmark with a URL. */
type BookmarkNode = { type?: string; name?: string; url?: string; children?: BookmarkNode[] };

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function env(name: string): string {
  return Bun.env[name] ?? fail(`${name} is not set: load the skills .env first`);
}

function findFolder(node: BookmarkNode, name: string): BookmarkNode | undefined {
  if (node.type === "folder" && node.name === name) return node;
  for (const child of node.children ?? []) {
    const hit = findFolder(child, name);
    if (hit) return hit;
  }
}

async function bookmarkSources(): Promise<Omit<Source, "notes">[]> {
  const folder = env("SOCIAL_CALENDAR_BOOKMARKS_FOLDER");
  const path = folder.split("/");
  const { roots } = await Bun.file(env("BOOKMARKS_FILE")).json();
  const top = Object.values(roots as Record<string, unknown>)
    .filter((root): root is BookmarkNode => typeof root === "object" && root !== null && !Array.isArray(root))
    .map(root => findFolder(root, path[0]!))
    .find(Boolean);
  const base = top && findFolder(top, path.at(-1)!);
  if (!base) fail(`bookmarks folder not found: ${folder}`);
  const out: Omit<Source, "notes">[] = [];

  function walk(node: BookmarkNode, category: string): void {
    for (const child of node.children ?? []) {
      if (child.type === "folder") walk(child, category ? `${category}/${child.name}` : child.name!);
      else if (child.type === "url") out.push({ name: child.name!, category, url: child.url! });
    }
  }

  walk(base, "");
  return out;
}

async function load(): Promise<Partial<Source>[]> {
  const file = Bun.file(YAML_PATH);
  if (!(await file.exists())) return [];
  const items: Record<string, string>[] = [];
  const lines = (await file.text()).split(/\r\n|\r|\n/);
  for (const [i, s] of lines.entries()) {
    if (!s.trim() || s.trimStart().startsWith("#") || s.trim() === "sources:") continue;
    const m = /^\s*(-\s+)?([a-z_]+):\s*(.*)$/s.exec(s);
    if (!m || (!m[1] && !items.length)) fail(`sources.yaml line ${i + 1}: cannot parse: ${s}`);
    if (m[1]) items.push({});
    const value = m[3]!.trim();
    items.at(-1)![m[2]!] = value.startsWith('"') ? JSON.parse(value) : value;
  }
  return items;
}

async function dump(items: Source[]): Promise<void> {
  const lines = [HEADER, "sources:"];
  for (const item of items) {
    KEYS.forEach((key, i) => lines.push(`${i === 0 ? "  - " : "    "}${key}: ${JSON.stringify(item[key] ?? "")}`));
  }
  await Bun.write(YAML_PATH, lines.join("\n") + "\n");
}

/**
 * A name quoted as in the diff line: 'name', or "name" when it holds a '. Backslashes, that quote
 * and invisible characters are escaped.
 */
function quote(text: string): string {
  const mark = text.includes("'") && !text.includes('"') ? '"' : "'";
  const escaped = [...text].map(ch => {
    if (ch === mark || ch === "\\") return `\\${ch}`;
    if (ch === "\n") return "\\n";
    if (ch === "\r") return "\\r";
    if (ch === "\t") return "\\t";
    // Other invisible characters (controls, formatting, spaces other than " ") as hex escapes.
    if (ch !== " " && /[\p{C}\p{Z}]/u.test(ch)) {
      const code = ch.codePointAt(0)!;
      const [prefix, width] = code < 0x100 ? ["x", 2] : code < 0x10000 ? ["u", 4] : ["U", 8];
      return `\\${prefix}${code.toString(16).padStart(width, "0")}`;
    }
    return ch;
  });
  return mark + escaped.join("") + mark;
}

/** ['a', 'b'] for a non-empty list of names, else "-". */
const list = (names: string[]) => (names.length ? `[${names.map(quote).join(", ")}]` : "-");

async function main(): Promise<void> {
  const old = await load();
  const bookmarks = await bookmarkSources();
  const byUrl = new Map(old.map(s => [s.url, s]));
  const liveUrls = new Set(bookmarks.map(b => b.url));
  const removed = old.filter(s => !liveUrls.has(s.url!));
  const removedByName = new Map(removed.map(s => [s.name, s]));
  const merged: Source[] = [];
  const added: string[] = [];
  const moved: string[] = [];
  for (const b of bookmarks) {
    let prev = byUrl.get(b.url);
    if (prev === undefined && removedByName.has(b.name)) {
      prev = removedByName.get(b.name)!;
      removedByName.delete(b.name);
      removed.splice(removed.indexOf(prev), 1);
      moved.push(b.name);
    } else if (prev === undefined) {
      added.push(b.name);
    }
    merged.push({ ...b, notes: prev?.notes ?? "" });
  }
  await dump(merged);
  const diff = [`added: ${list(added)}`, `removed: ${list(removed.map(s => s.name!))}`, `url changed: ${list(moved)}`];
  console.log(`sources: ${merged.length} | ${diff.join(" | ")}`);
  for (const s of merged) console.log([s.category || "-", s.name, s.url, s.notes].join("\t"));
}

if (import.meta.main) await main();
