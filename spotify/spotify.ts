#!/usr/bin/env bun
/**
 * Spotify Web API helper: token management and common playlist operations.
 *
 * Bun and its built-ins only, so there's nothing to install and no build step:
 *
 *     bun spotify.ts <command>
 *
 * Auto-loads .env, so you can run it without exporting anything first.
 *
 * Env vars (from .env, see .env.example):
 *   SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET   (required)
 *   SPOTIFY_REDIRECT_URI    (default http://127.0.0.1:8888/callback; MUST be registered on the app)
 *   SPOTIFY_PLAYLIST_ID     (default playlist for playlist/add-* commands)
 *   SPOTIFY_PLAYLIST_<NAME> (named playlists, each usable as --playlist <name>)
 *   SPOTIFY_REFRESH_TOKEN   (optional; with it set the script never needs the browser)
 *   SPOTIFY_SCOPES          (optional; default is the full user-facing Web API scope set)
 *
 * The user token is cached in .spotify_token.json next to this file and refreshed
 * automatically. The FIRST run (no refresh token anywhere) needs interactive
 * authorization: it prints `AUTH_URL <url>` and waits on the local callback server.
 * Open that URL in a browser logged into the right Spotify account.
 *
 * The commands are listed in USAGE below, which `-h` prints.
 */

import { chmod } from "node:fs/promises";
import { parseArgs, type ParseArgsConfig, type ParseArgsOptionsConfig } from "node:util";

/** This file's folder: its real path, also when run through the ~/.claude/skills symlink. */
const HERE = import.meta.dir;
const TOKEN_FILE = `${HERE}/.spotify_token.json`;
const API = "https://api.spotify.com/v1";
const ACCOUNTS = "https://accounts.spotify.com";

const USAGE = `usage: spotify.ts <command> [args]

Spotify Web API helper

commands:
  auth                                          (re)authorize and cache a token
  token [--force]                               print a valid access token
  me                                            print the current user
  playlist [ID|NAME]                            print playlist name / owner / track total
  playlists                                     list named playlists
  search "QUERY" [--type album|track] [--limit N]
  album-tracks ALBUM                            list a release's tracks
  add-album  ALBUM [ALBUM ...] [--playlist ID|NAME] [--allow-dupes]
  add-tracks TRACK [TRACK ...] [--playlist ID|NAME] [--allow-dupes]
  remove-tracks TRACK [TRACK ...] [--playlist ID|NAME]
  move TRACK [TRACK ...] --from ID|NAME --to ID|NAME [--allow-dupes]

ALBUM/TRACK accept a raw id, a spotify:album:/spotify:track: URI, or an
open.spotify.com/... URL.`;

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

/**
 * A file's text, or null when there's no such file. Unlike Bun.file().exists(), this also reads
 * what isn't a regular file, such as /dev/null or a `<(...)` pipe.
 */
async function readIfExists(path: string): Promise<string | null> {
  try {
    return await Bun.file(path).text();
  } catch (e) {
    const { code } = e as NodeJS.ErrnoException;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw e;
  }
}

/** Load the configured or canonical repo .env. Real env vars win over .env. */
async function loadDotenv(): Promise<void> {
  const { SPOTIFY_ENV_FILE, SKILLS_DIR } = Bun.env;
  for (const path of [SPOTIFY_ENV_FILE, `${HERE}/../.env`, SKILLS_DIR && `${SKILLS_DIR}/.env`]) {
    const text = path ? await readIfExists(path) : null;
    if (text === null) continue;
    for (const raw of text.split(/\r\n|\r|\n/)) {
      const line = raw.trim();
      const eq = line.indexOf("=");
      if (!line || line.startsWith("#") || eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      const quote = value[0];
      if ((quote === '"' || quote === "'") && value.endsWith(quote)) value = value.slice(1, -1);
      Bun.env[key] ??= value;
    }
    return; // only the first .env found counts
  }
}

function requiredEnv(name: string): string {
  const value = Bun.env[name];
  if (!value) die(`Missing required env var ${name}: copy .env.example to .env and fill it in.`);
  return value;
}

await loadDotenv();
const CLIENT_ID = requiredEnv("SPOTIFY_CLIENT_ID");
const CLIENT_SECRET = requiredEnv("SPOTIFY_CLIENT_SECRET");
const REDIRECT_URI = Bun.env.SPOTIFY_REDIRECT_URI ?? "http://127.0.0.1:8888/callback";
const DEFAULT_PLAYLIST = Bun.env.SPOTIFY_PLAYLIST_ID;
// Default: full set of user-facing Web API scopes, so a missing scope is never the
// blocker. Editing playlists only strictly needs playlist-modify-*.
const SCOPES =
  Bun.env.SPOTIFY_SCOPES ??
  [
    "ugc-image-upload user-read-playback-state user-modify-playback-state",
    "user-read-currently-playing app-remote-control streaming",
    "playlist-read-private playlist-read-collaborative",
    "playlist-modify-private playlist-modify-public",
    "user-follow-modify user-follow-read user-read-playback-position",
    "user-top-read user-read-recently-played user-library-modify",
    "user-library-read user-read-email user-read-private",
  ].join(" ");

// Named playlists: every SPOTIFY_PLAYLIST_<NAME> env var (except _ID) becomes the alias
// <name> (lowercased), usable as `--playlist <name>`. SPOTIFY_PLAYLIST_ID is the default
// target and also answers to the alias "main".
const PLAYLIST_ALIASES = new Map<string, string>();
for (const [key, value] of Object.entries(Bun.env)) {
  const name = /^SPOTIFY_PLAYLIST_(.+)$/.exec(key)?.[1];
  if (name && value && name.toUpperCase() !== "ID") PLAYLIST_ALIASES.set(name.toLowerCase(), value);
}
if (DEFAULT_PLAYLIST && !PLAYLIST_ALIASES.has("main")) PLAYLIST_ALIASES.set("main", DEFAULT_PLAYLIST);
const PLAYLIST_SYNONYMS = new Map([
  ["running", "sport"],
  ["run", "sport"],
  ["todo", "main"],
]);

// --- the parts of Spotify's answers used here ---

/** What Spotify's token endpoint returns. */
interface TokenResponse {
  access_token: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  refresh_token?: string;
}

/** The token as cached in TOKEN_FILE: the response plus when it expires, in Unix seconds. */
interface Token extends TokenResponse {
  expires_at: number;
}

interface Page<T> {
  items?: T[];
  next?: string | null;
}

interface Artist {
  name: string;
}

interface AlbumTrack {
  name: string;
  uri: string;
  track_number: number;
}

interface PlaylistSummary {
  name: string;
  tracks: { total: number };
}

interface SearchResults {
  albums?: {
    items?: { id: string; name: string; album_type: string; total_tracks: number; release_date?: string; artists?: Artist[] }[];
  };
  tracks?: { items?: { id: string; name: string; artists?: Artist[]; album: { name: string } }[] };
}

// --- auth / token ---

/** An HTTP error from Spotify's token endpoint. */
class TokenError extends Error {
  status: number;

  constructor(status: number, body: string) {
    super(`Spotify's token endpoint answered ${status}: ${body}`);
    this.status = status;
  }
}

async function postToken(form: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form),
  });
  if (!res.ok) throw new TokenError(res.status, await res.text());
  return (await res.json()) as TokenResponse;
}

/** The cached token, or null when there's none or it can't be read. */
async function cachedToken(): Promise<Partial<Token> | null> {
  try {
    return (await Bun.file(TOKEN_FILE).json()) as Partial<Token>;
  } catch {
    return null;
  }
}

async function saveToken(tok: TokenResponse): Promise<Token> {
  const out: Token = { ...tok, expires_at: Date.now() / 1000 + (tok.expires_in ?? 3600) - 60 };
  if (!out.refresh_token) {
    // Refresh responses omit the refresh_token, so keep the existing one.
    const cached = await cachedToken();
    if (cached) out.refresh_token = cached.refresh_token;
  }
  await Bun.write(TOKEN_FILE, JSON.stringify(out));
  // Restrict the refresh-token file to the owner (Bun.write ignores its own mode option).
  await chmod(TOKEN_FILE, 0o600);
  return out;
}

/** The browser consent flow: the one-time bootstrap that mints a refresh token. */
async function interactiveAuth(): Promise<Token> {
  const { hostname, port } = new URL(REDIRECT_URI);
  const authUrl = `${ACCOUNTS}/authorize?${new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    show_dialog: "false",
  })}`;

  // Serve the redirect URI until Spotify sends the browser back to it.
  const { promise: callback, resolve } = Promise.withResolvers<URLSearchParams>();
  const server = Bun.serve({
    hostname: hostname.replace(/^\[(.*)\]$/, "$1") || "127.0.0.1", // an IPv6 host without its brackets
    port: Number(port) || 8888,
    fetch(req) {
      const query = new URL(req.url).searchParams;
      resolve(query);
      const message = query.get("code")
        ? "Authorized. Return to the terminal."
        : "Authorization failed. You can close this tab.";
      return new Response(`<html><body style='font-family:sans-serif;padding:3em'><h2>${message}</h2></body></html>`, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    },
  });
  console.log(`AUTH_URL ${authUrl}`);
  console.log(`Waiting for authorization on ${REDIRECT_URI} ...`);
  const query = await callback;
  await server.stop(); // lets the page above finish sending

  const code = query.get("code");
  if (!code) die(`Authorization failed: ${query.get("error") || "unknown"}`);
  const tok = await saveToken(await postToken({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI }));
  console.log(`TOKEN_OK scopes=${tok.scope ?? ""}`);
  if (tok.refresh_token) {
    console.log(`REFRESH_TOKEN ${tok.refresh_token}`);
    console.log("-> Save this as SPOTIFY_REFRESH_TOKEN in .env to skip the browser everywhere.");
  }
  return tok;
}

async function refresh(refreshToken: string): Promise<TokenResponse> {
  const tok = await postToken({ grant_type: "refresh_token", refresh_token: refreshToken });
  tok.refresh_token ??= refreshToken;
  return tok;
}

/** Valid cached access token, else refresh (env SPOTIFY_REFRESH_TOKEN, else the cached one), else the browser. */
async function getToken(force = false): Promise<Token> {
  if (!force) {
    const cached = await cachedToken();
    if (cached?.access_token && (cached.expires_at ?? 0) > Date.now() / 1000) return cached as Token;
    const refreshToken = Bun.env.SPOTIFY_REFRESH_TOKEN || cached?.refresh_token;
    if (refreshToken) {
      try {
        return await saveToken(await refresh(refreshToken));
      } catch (e) {
        if (!(e instanceof TokenError)) throw e;
        console.error(`Token refresh failed (${e.status}); re-authorizing...`);
      }
    }
  }
  return interactiveAuth();
}

// --- api ---

type Params = Record<string, string | number>;

async function api<T = unknown>(method: string, path: string, params?: Params, body?: unknown): Promise<T> {
  const token = (await getToken()).access_token;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) query.set(key, String(value));
  const url = query.size ? `${API}${path}?${query}` : API + path;
  const init: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
  while (true) {
    const res = await fetch(url, init);
    if (res.status === 429) {
      const wait = Number(res.headers.get("Retry-After") ?? 2) + 1;
      console.error(`  rate limited, waiting ${wait}s`);
      await Bun.sleep(wait * 1000);
      continue;
    }
    const text = await res.text();
    if (!res.ok) die(`API ${res.status} on ${method} ${path}: ${text}`);
    return (text ? JSON.parse(text) : {}) as T;
  }
}

function spotifyId(s: string, kind: string): string {
  const match = new RegExp(`(?:spotify:${kind}:|/${kind}/)([A-Za-z0-9]+)`).exec(s.trim());
  return match?.[1] ?? s.trim();
}

const trackUri = (raw: string) => `spotify:track:${spotifyId(raw, "track")}`;

async function paginate<T>(path: string, params: Params, limit: number): Promise<T[]> {
  const items: T[] = [];
  for (let offset = 0; ; offset += limit) {
    const page = await api<Page<T>>("GET", path, { ...params, limit, offset });
    items.push(...(page.items ?? []));
    if (!page.next) return items;
  }
}

const albumTracks = (albumId: string) => paginate<AlbumTrack>(`/albums/${albumId}/tracks`, {}, 50);

/** Resolve a playlist arg: a named alias (sport/classics/main/...), or a raw id/URI/URL. */
function needPlaylist(arg?: string): string {
  const raw = arg || DEFAULT_PLAYLIST;
  if (!raw) die("No playlist: pass an id/name/URL or set SPOTIFY_PLAYLIST_ID in .env.");
  const key = raw.toLowerCase();
  const resolved = PLAYLIST_ALIASES.get(PLAYLIST_SYNONYMS.get(key) ?? key) ?? raw;
  return spotifyId(resolved, "playlist");
}

/** A playlist's name and track total, for the line printed after an edit. */
const playlistSummary = (pid: string) =>
  api<PlaylistSummary>("GET", `/playlists/${pid}`, { fields: "tracks(total),name" });

async function existingUris(pid: string): Promise<Set<string>> {
  type Item = { track?: { uri?: string } | null };
  const items = await paginate<Item>(`/playlists/${pid}/tracks`, { fields: "items(track(uri)),next" }, 100);
  return new Set(items.flatMap(item => (item.track?.uri ? [item.track.uri] : [])));
}

async function addUris(pid: string, uris: string[]): Promise<void> {
  for (let i = 0; i < uris.length; i += 100) {
    await api("POST", `/playlists/${pid}/tracks`, undefined, { uris: uris.slice(i, i + 100) });
  }
}

async function removeUris(pid: string, uris: string[]): Promise<void> {
  for (let i = 0; i < uris.length; i += 100) {
    await api("DELETE", `/playlists/${pid}/tracks`, undefined, {
      tracks: uris.slice(i, i + 100).map(uri => ({ uri })),
    });
  }
}

/** A number right-aligned in two columns, as track numbers are printed. */
const pad2 = (n: number) => String(n).padStart(2);

// --- commands ---

async function cmdMe(): Promise<void> {
  const me = await api<Record<string, unknown>>("GET", "/me");
  // One line with a space after each ':' and ',', the layout this command has always printed.
  const fields = ["display_name", "id", "country", "product"].map(key => `"${key}": ${JSON.stringify(me[key] ?? null)}`);
  console.log(`{${fields.join(", ")}}`);
}

async function cmdPlaylist(playlist?: string): Promise<void> {
  const pid = needPlaylist(playlist);
  const pl = await api("GET", `/playlists/${pid}`, {
    fields: "name,public,collaborative,owner(display_name,id),tracks(total)",
  });
  console.log(JSON.stringify(pl, null, 2));
}

async function cmdPlaylists(): Promise<void> {
  if (!PLAYLIST_ALIASES.size) {
    console.log("No named playlists. Add SPOTIFY_PLAYLIST_<NAME> to .env.");
    return;
  }
  for (const [name, pid] of PLAYLIST_ALIASES) {
    const pl = await api<PlaylistSummary>("GET", `/playlists/${pid}`, { fields: "name,tracks(total)" });
    console.log(`${name.padEnd(10)} ${pid}  ${pl.name} (${pl.tracks.total})`);
  }
}

async function cmdSearch(query: string, type: "album" | "track", limit: number): Promise<void> {
  const res = await api<SearchResults>("GET", "/search", { q: query, type, limit });
  const names = (artists: Artist[] = []) => artists.map(artist => artist.name).join(", ");
  if (type === "album") {
    for (const it of res.albums?.items ?? []) {
      const date = (it.release_date ?? "?").padEnd(10);
      console.log(`${it.id} | ${it.album_type.padEnd(6)} | tracks=${pad2(it.total_tracks)} | ${date} | ${it.name}  [${names(it.artists)}]`);
    }
  } else {
    for (const it of res.tracks?.items ?? []) {
      console.log(`${it.id} | ${it.name}  [${names(it.artists)}]  (${it.album.name})`);
    }
  }
}

async function cmdAlbumTracks(album: string): Promise<void> {
  for (const t of await albumTracks(spotifyId(album, "album"))) {
    console.log(`${pad2(t.track_number)}. ${t.name}  [${t.uri}]`);
  }
}

async function cmdAddAlbum(albums: string[], playlist?: string, allowDupes = false): Promise<void> {
  const pid = needPlaylist(playlist);
  const have = allowDupes ? new Set<string>() : await existingUris(pid);
  const toAdd: string[] = [];
  let skipped = 0;
  for (const raw of albums) {
    const aid = spotifyId(raw, "album");
    const tracks = await albumTracks(aid);
    console.log(`\nAlbum ${aid}: ${tracks.length} tracks`);
    for (const t of tracks) {
      if (have.has(t.uri)) {
        skipped++;
        console.log(`   = already present: ${pad2(t.track_number)}. ${t.name}`);
      } else {
        toAdd.push(t.uri);
        have.add(t.uri);
        console.log(`   + ${pad2(t.track_number)}. ${t.name}`);
      }
    }
  }
  await addUris(pid, toAdd);
  const pl = await playlistSummary(pid);
  console.log(`\nAdded ${toAdd.length} tracks (${skipped} skipped as already present). '${pl.name}' now has ${pl.tracks.total}.`);
}

async function cmdAddTracks(tracks: string[], playlist?: string, allowDupes = false): Promise<void> {
  const pid = needPlaylist(playlist);
  const have = allowDupes ? new Set<string>() : await existingUris(pid);
  const toAdd: string[] = [];
  let skipped = 0;
  for (const uri of tracks.map(trackUri)) {
    if (have.has(uri)) {
      skipped++;
    } else {
      toAdd.push(uri);
      have.add(uri);
    }
  }
  await addUris(pid, toAdd);
  const pl = await playlistSummary(pid);
  console.log(`Added ${toAdd.length} tracks (${skipped} skipped). '${pl.name}' now has ${pl.tracks.total}.`);
}

async function cmdRemoveTracks(tracks: string[], playlist?: string): Promise<void> {
  const pid = needPlaylist(playlist);
  const uris = tracks.map(trackUri);
  await removeUris(pid, uris);
  const pl = await playlistSummary(pid);
  console.log(`Removed ${uris.length} track(s). '${pl.name}' now has ${pl.tracks.total}.`);
}

async function cmdMove(tracks: string[], from: string, to: string, allowDupes = false): Promise<void> {
  const src = needPlaylist(from);
  const dst = needPlaylist(to);
  const uris = tracks.map(trackUri);
  const have = allowDupes ? new Set<string>() : await existingUris(dst);
  const toAdd = uris.filter(uri => !have.has(uri));
  await addUris(dst, toAdd); // destination first, so nothing is lost if it fails
  await removeUris(src, uris);
  const s = await playlistSummary(src);
  const d = await playlistSummary(dst);
  console.log(
    `Moved ${uris.length} track(s): '${s.name}' (${s.tracks.total}) -> '${d.name}' (${d.tracks.total}); ` +
      `${toAdd.length} added, ${uris.length - toAdd.length} already in dest.`,
  );
}

// --- command line ---

/** Print a command's usage and an error to stderr, and exit 2 as argparse did. */
function usageError(usage: string, error: string): never {
  console.error(`usage: spotify.ts ${usage}\nspotify.ts: error: ${error}`);
  process.exit(2);
}

/** A command's flag values, typed from its options: booleans for boolean flags, strings for the rest. */
type Flags<O extends ParseArgsOptionsConfig> = { [K in keyof O]?: O[K]["type"] extends "boolean" ? boolean : string };

/**
 * Parse one command's arguments: `-h` prints its usage, and an unknown flag or the wrong number of
 * positional arguments is a usage error.
 */
function parse<const O extends ParseArgsOptionsConfig = {}>(
  args: string[],
  usage: string,
  [min, max]: [min: number, max: number],
  options?: O,
): { flags: Flags<O>; positionals: string[] } {
  const config: ParseArgsConfig = {
    args,
    options: { ...options, help: { type: "boolean", short: "h" } },
    allowPositionals: true,
  };
  let parsed;
  try {
    parsed = parseArgs(config);
  } catch (e) {
    usageError(usage, (e as Error).message);
  }
  const { values, positionals } = parsed;
  if (values.help) {
    console.log(`usage: spotify.ts ${usage}`);
    process.exit(0);
  }
  if (positionals.length < min) usageError(usage, "too few arguments");
  if (positionals.length > max) usageError(usage, `unrecognized arguments: ${positionals.slice(max).join(" ")}`);
  return { flags: values as Flags<O>, positionals };
}

async function main([command, ...args]: string[]): Promise<void> {
  const playlistFlags = { playlist: { type: "string" }, "allow-dupes": { type: "boolean" } } as const;
  switch (command) {
    case "auth":
      parse(args, "auth", [0, 0]);
      await interactiveAuth();
      return;
    case "token": {
      const { flags } = parse(args, "token [--force]", [0, 0], { force: { type: "boolean" } });
      console.log((await getToken(flags.force)).access_token);
      return;
    }
    case "me":
      parse(args, "me", [0, 0]);
      return cmdMe();
    case "playlist": {
      const { positionals } = parse(args, "playlist [ID|NAME]", [0, 1]);
      return cmdPlaylist(positionals[0]);
    }
    case "playlists":
      parse(args, "playlists", [0, 0]);
      return cmdPlaylists();
    case "search": {
      const usage = 'search "QUERY" [--type album|track] [--limit N]';
      const { flags, positionals } = parse(args, usage, [1, 1], {
        type: { type: "string" },
        limit: { type: "string" },
      });
      const type = flags.type ?? "album";
      const limit = flags.limit ?? "12";
      if (type !== "album" && type !== "track") {
        usageError(usage, `argument --type: invalid choice: '${type}' (choose from 'album', 'track')`);
      }
      if (!/^\s*[+-]?\d+\s*$/.test(limit)) usageError(usage, `argument --limit: invalid int value: '${limit}'`);
      return cmdSearch(positionals[0]!, type, Number(limit));
    }
    case "album-tracks": {
      const { positionals } = parse(args, "album-tracks ALBUM", [1, 1]);
      return cmdAlbumTracks(positionals[0]!);
    }
    case "add-album": {
      const usage = "add-album ALBUM [ALBUM ...] [--playlist ID|NAME] [--allow-dupes]";
      const { flags, positionals } = parse(args, usage, [1, Infinity], playlistFlags);
      return cmdAddAlbum(positionals, flags.playlist, flags["allow-dupes"]);
    }
    case "add-tracks": {
      const usage = "add-tracks TRACK [TRACK ...] [--playlist ID|NAME] [--allow-dupes]";
      const { flags, positionals } = parse(args, usage, [1, Infinity], playlistFlags);
      return cmdAddTracks(positionals, flags.playlist, flags["allow-dupes"]);
    }
    case "remove-tracks": {
      const usage = "remove-tracks TRACK [TRACK ...] [--playlist ID|NAME]";
      const { flags, positionals } = parse(args, usage, [1, Infinity], { playlist: { type: "string" } });
      return cmdRemoveTracks(positionals, flags.playlist);
    }
    case "move": {
      const usage = "move TRACK [TRACK ...] --from ID|NAME --to ID|NAME [--allow-dupes]";
      const { flags, positionals } = parse(args, usage, [1, Infinity], {
        from: { type: "string" },
        to: { type: "string" },
        "allow-dupes": { type: "boolean" },
      });
      if (flags.from === undefined || flags.to === undefined) usageError(usage, "--from and --to are required");
      return cmdMove(positionals, flags.from, flags.to, flags["allow-dupes"]);
    }
    case "-h":
    case "--help":
      console.log(USAGE);
      return;
    default:
      console.error(`${USAGE}\n\nspotify.ts: error: ${command ? `unknown command '${command}'` : "no command given"}`);
      process.exit(2);
  }
}

await main(Bun.argv.slice(2));
