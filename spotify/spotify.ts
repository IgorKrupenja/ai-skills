#!/usr/bin/env bun
/**
 * Spotify Web API helper — token management + common playlist operations.
 *
 * Run with Bun (no build step): `bun spotify.ts <command>`. Auto-loads .env, so
 * you can just run e.g. `bun spotify.ts me` without exporting anything first.
 *
 * Env vars (from .env, see SKILL.md):
 *   SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET   (required)
 *   SPOTIFY_REDIRECT_URI   (default http://127.0.0.1:8888/callback; MUST be registered on the app)
 *   SPOTIFY_PLAYLIST_ID    (optional default playlist for playlist/add-* commands)
 *   SPOTIFY_REFRESH_TOKEN  (optional; with it set the script never needs the browser)
 *   SPOTIFY_SCOPES         (optional; default is the full user-facing Web API scope set)
 *
 * The user token is cached in .spotify_token.json next to this file and refreshed
 * automatically. The FIRST run (no refresh token anywhere) needs interactive
 * authorization: it prints `AUTH_URL <url>` and waits on the local callback server
 * — open that URL in a browser logged into the right Spotify account.
 *
 * Commands:
 *   auth                                          (re)authorize and cache a token
 *   token [--force]                               print a valid access token
 *   me                                            print the current user
 *   playlist [PLAYLIST_ID]                        print playlist name / owner / track total
 *   search "QUERY" [--type album|track] [--limit N]
 *   album-tracks ALBUM                            list a release's tracks
 *   add-album  ALBUM [ALBUM ...] [--playlist ID] [--allow-dupes]
 *   add-tracks TRACK [TRACK ...] [--playlist ID] [--allow-dupes]
 *
 * ALBUM/TRACK accept a raw id, a spotify:album:/spotify:track: URI, or an
 * open.spotify.com/... URL. add-* skip tracks already in the playlist unless
 * --allow-dupes, and append in the given order.
 */
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";

const HERE = import.meta.dir;
const TOKEN_FILE = join(HERE, ".spotify_token.json");
const API = "https://api.spotify.com/v1";
const ACCOUNTS = "https://accounts.spotify.com";

// ---------------------------------------------------------------- env / config
/** Load .env (skill-dir parent or $SKILLS_DIR). Real env vars win over .env. */
function loadDotenv(): void {
  const home = process.env.HOME ?? "";
  const candidates = [
    join(HERE, "..", ".env"),
    join(process.env.SKILLS_DIR ?? join(home, ".claude/skills"), ".env"),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    for (const raw of readFileSync(path, "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const eq = line.indexOf("=");
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
      if (process.env[key] === undefined) process.env[key] = val;
    }
    break;
  }
}
loadDotenv();

function reqEnv(name: string): string {
  const v = process.env[name];
  if (!v) die(`Missing required env var ${name} — copy .env.example to .env and fill it in.`);
  return v;
}
function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const CLIENT_ID = reqEnv("SPOTIFY_CLIENT_ID");
const CLIENT_SECRET = reqEnv("SPOTIFY_CLIENT_SECRET");
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI ?? "http://127.0.0.1:8888/callback";
const DEFAULT_PLAYLIST = process.env.SPOTIFY_PLAYLIST_ID;
// Named playlists: every SPOTIFY_PLAYLIST_<NAME> env var (except _ID) becomes the alias
// <name> (lowercased), usable as `--playlist <name>`. SPOTIFY_PLAYLIST_ID is the default
// target and also answers to the alias "main".
const PLAYLIST_ALIASES: Record<string, string> = {};
for (const [k, v] of Object.entries(process.env)) {
  const m = /^SPOTIFY_PLAYLIST_(.+)$/.exec(k);
  if (m && v && m[1].toUpperCase() !== "ID") PLAYLIST_ALIASES[m[1].toLowerCase()] = v;
}
if (DEFAULT_PLAYLIST) PLAYLIST_ALIASES.main ??= DEFAULT_PLAYLIST;
const PLAYLIST_SYNONYMS: Record<string, string> = { running: "sport", run: "sport", todo: "main" };
// Default: full set of user-facing Web API scopes, so a missing scope is never the
// blocker. Editing playlists only strictly needs playlist-modify-*.
const SCOPES =
  process.env.SPOTIFY_SCOPES ??
  [
    "ugc-image-upload", "user-read-playback-state", "user-modify-playback-state",
    "user-read-currently-playing", "app-remote-control", "streaming",
    "playlist-read-private", "playlist-read-collaborative",
    "playlist-modify-private", "playlist-modify-public",
    "user-follow-modify", "user-follow-read", "user-read-playback-position",
    "user-top-read", "user-read-recently-played", "user-library-modify",
    "user-library-read", "user-read-email", "user-read-private",
  ].join(" ");

// ---------------------------------------------------------------- token types
interface RawToken {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}
interface Token extends RawToken {
  expires_at: number; // unix seconds
}

// ---------------------------------------------------------------- auth / token
function basicAuth(): string {
  return Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
}

async function postToken(form: Record<string, string>): Promise<RawToken> {
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form).toString(),
  });
  if (!res.ok) throw new Error(`token endpoint ${res.status}: ${await res.text()}`);
  return (await res.json()) as RawToken;
}

function saveToken(tok: RawToken): Token {
  const out: Token = { ...tok, expires_at: Date.now() / 1000 + (tok.expires_in ?? 3600) - 60 };
  if (!out.refresh_token && existsSync(TOKEN_FILE)) {
    try {
      out.refresh_token = (JSON.parse(readFileSync(TOKEN_FILE, "utf8")) as Token).refresh_token;
    } catch {
      /* ignore unreadable cache */
    }
  }
  writeFileSync(TOKEN_FILE, JSON.stringify(out));
  chmodSync(TOKEN_FILE, 0o600);
  return out;
}

/** Browser consent flow — one-time bootstrap to mint a refresh token. */
function interactiveAuth(): Promise<Token> {
  const { hostname, port } = new URL(REDIRECT_URI);
  const authUrl =
    `${ACCOUNTS}/authorize?` +
    new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      show_dialog: "false",
    }).toString();

  return new Promise<Token>((resolve, reject) => {
    const html = (msg: string) =>
      new Response(`<html><body style="font-family:sans-serif;padding:3em"><h2>${msg}</h2></body></html>`, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    const server = Bun.serve({
      hostname,
      port: Number(port) || 8888,
      async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname !== "/callback") return new Response("not found", { status: 404 });
        const code = url.searchParams.get("code");
        const err = url.searchParams.get("error");
        setTimeout(() => server.stop(true), 250); // let this response flush, then shut down
        if (err || !code) {
          reject(new Error(`authorization failed: ${err ?? "no code returned"}`));
          return html("Authorization failed. You can close this tab.");
        }
        try {
          const tok = saveToken(
            await postToken({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI }),
          );
          console.log(`TOKEN_OK scopes=${tok.scope ?? ""}`);
          if (tok.refresh_token) {
            console.log(`REFRESH_TOKEN ${tok.refresh_token}`);
            console.log("-> Save this as SPOTIFY_REFRESH_TOKEN in .env to skip the browser everywhere.");
          }
          resolve(tok);
          return html("Authorized. Return to the terminal.");
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
          return html("Token exchange failed. Check the terminal.");
        }
      },
    });
    console.log(`AUTH_URL ${authUrl}`);
    console.log(`Waiting for authorization on ${REDIRECT_URI} ...`);
  });
}

async function refresh(refreshToken: string): Promise<RawToken> {
  const tok = await postToken({ grant_type: "refresh_token", refresh_token: refreshToken });
  tok.refresh_token ??= refreshToken; // Spotify omits it on refresh — keep ours
  return tok;
}

/** valid cached access token -> refresh (env SPOTIFY_REFRESH_TOKEN, else cached) -> browser. */
async function getToken(force = false): Promise<Token> {
  let cached: Token | null = null;
  if (!force && existsSync(TOKEN_FILE)) {
    try {
      cached = JSON.parse(readFileSync(TOKEN_FILE, "utf8")) as Token;
    } catch {
      cached = null;
    }
    if (cached?.access_token && (cached.expires_at ?? 0) > Date.now() / 1000) return cached;
  }
  if (!force) {
    const rt = process.env.SPOTIFY_REFRESH_TOKEN || cached?.refresh_token;
    if (rt) {
      try {
        return saveToken(await refresh(rt));
      } catch (e) {
        console.error(`Token refresh failed; re-authorizing... (${e})`);
      }
    }
  }
  return interactiveAuth();
}

// ---------------------------------------------------------------- api helpers
type Params = Record<string, string | number>;

async function api(method: string, path: string, params?: Params, body?: unknown): Promise<any> {
  const token = (await getToken()).access_token;
  let url = API + path;
  if (params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
    url += `?${qs}`;
  }
  while (true) {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) {
      const wait = (Number(res.headers.get("Retry-After") ?? "2") + 1) * 1000;
      console.error(`  rate limited, waiting ${wait}ms`);
      await Bun.sleep(wait);
      continue;
    }
    if (!res.ok) die(`API ${res.status} on ${method} ${path}: ${await res.text()}`);
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }
}

function spotifyId(s: string, kind: string): string {
  const m = s.trim().match(new RegExp(`(?:spotify:${kind}:|/${kind}/)([A-Za-z0-9]+)`));
  return m ? m[1]! : s.trim();
}

async function paginate(path: string, params: Params, limit: number): Promise<any[]> {
  const out: any[] = [];
  let offset = 0;
  while (true) {
    const page = await api("GET", path, { ...params, limit, offset });
    out.push(...(page.items ?? []));
    if (!page.next) return out;
    offset += limit;
  }
}

/** Resolve a playlist arg: a named alias (sport/classics/main/...), or a raw id/URI/URL. */
function needPlaylist(arg?: string): string {
  const raw = arg ?? DEFAULT_PLAYLIST;
  if (!raw) die("No playlist — pass an id/name/URL or set SPOTIFY_PLAYLIST_ID in .env.");
  const key = raw.toLowerCase();
  const resolved = PLAYLIST_ALIASES[PLAYLIST_SYNONYMS[key] ?? key] ?? raw;
  return spotifyId(resolved, "playlist");
}

async function existingUris(pid: string): Promise<Set<string>> {
  const items = await paginate(`/playlists/${pid}/tracks`, { fields: "items(track(uri)),next" }, 100);
  return new Set(items.filter((it) => it.track?.uri).map((it) => it.track.uri as string));
}

async function addUris(pid: string, uris: string[]): Promise<void> {
  for (let i = 0; i < uris.length; i += 100) {
    await api("POST", `/playlists/${pid}/tracks`, undefined, { uris: uris.slice(i, i + 100) });
  }
}

const pad = (s: unknown, n: number) => String(s).padStart(n);

// ---------------------------------------------------------------- commands
interface Flags {
  playlist?: string;
  type?: string;
  limit?: string;
  "allow-dupes"?: boolean;
  force?: boolean;
}

const commands: Record<string, (pos: string[], flags: Flags) => Promise<void> | void> = {
  auth: async () => {
    await interactiveAuth();
  },

  token: async (_pos, flags) => {
    console.log((await getToken(Boolean(flags.force))).access_token);
  },

  me: async () => {
    const me = await api("GET", "/me");
    console.log(JSON.stringify({ display_name: me.display_name, id: me.id, country: me.country, product: me.product }));
  },

  playlist: async (pos, flags) => {
    const pid = needPlaylist(flags.playlist ?? pos[0]);
    const pl = await api("GET", `/playlists/${pid}`, {
      fields: "name,public,collaborative,owner(display_name,id),tracks(total)",
    });
    console.log(JSON.stringify(pl, null, 2));
  },

  playlists: async () => {
    const entries = Object.entries(PLAYLIST_ALIASES);
    if (!entries.length) return console.log("No named playlists. Add SPOTIFY_PLAYLIST_<NAME> to .env.");
    for (const [name, id] of entries) {
      const pl = await api("GET", `/playlists/${id}`, { fields: "name,tracks(total)" });
      console.log(`${name.padEnd(10)} ${id}  ${pl.name} (${pl.tracks.total})`);
    }
  },

  search: async (pos, flags) => {
    const type = flags.type ?? "album";
    const res = await api("GET", "/search", { q: pos[0] ?? "", type, limit: Number(flags.limit ?? 12) });
    for (const it of res[`${type}s`]?.items ?? []) {
      const arts = (it.artists ?? []).map((a: { name: string }) => a.name).join(", ");
      if (type === "album") {
        console.log(`${it.id} | ${String(it.album_type).padEnd(6)} | tracks=${pad(it.total_tracks, 2)} | ${String(it.release_date ?? "?").padEnd(10)} | ${it.name}  —  [${arts}]`);
      } else {
        console.log(`${it.id} | ${it.name}  —  [${arts}]  (${it.album?.name})`);
      }
    }
  },

  "album-tracks": async (pos) => {
    const aid = spotifyId(pos[0] ?? "", "album");
    for (const t of await paginate(`/albums/${aid}/tracks`, {}, 50)) {
      console.log(`${pad(t.track_number, 2)}. ${t.name}  [${t.uri}]`);
    }
  },

  "add-album": async (pos, flags) => {
    const pid = needPlaylist(flags.playlist);
    const have = flags["allow-dupes"] ? new Set<string>() : await existingUris(pid);
    const toAdd: string[] = [];
    let skipped = 0;
    for (const raw of pos) {
      const aid = spotifyId(raw, "album");
      const tracks = await paginate(`/albums/${aid}/tracks`, {}, 50);
      console.log(`\nAlbum ${aid}: ${tracks.length} tracks`);
      for (const t of tracks) {
        if (have.has(t.uri)) {
          skipped++;
          console.log(`   = already present: ${pad(t.track_number, 2)}. ${t.name}`);
        } else {
          toAdd.push(t.uri);
          have.add(t.uri);
          console.log(`   + ${pad(t.track_number, 2)}. ${t.name}`);
        }
      }
    }
    await addUris(pid, toAdd);
    const pl = await api("GET", `/playlists/${pid}`, { fields: "tracks(total),name" });
    console.log(`\nAdded ${toAdd.length} tracks (${skipped} skipped as already present). '${pl.name}' now has ${pl.tracks.total}.`);
  },

  "add-tracks": async (pos, flags) => {
    const pid = needPlaylist(flags.playlist);
    const have = flags["allow-dupes"] ? new Set<string>() : await existingUris(pid);
    const toAdd: string[] = [];
    let skipped = 0;
    for (const raw of pos) {
      const uri = `spotify:track:${spotifyId(raw, "track")}`;
      if (have.has(uri)) skipped++;
      else {
        toAdd.push(uri);
        have.add(uri);
      }
    }
    await addUris(pid, toAdd);
    const pl = await api("GET", `/playlists/${pid}`, { fields: "tracks(total),name" });
    console.log(`Added ${toAdd.length} tracks (${skipped} skipped). '${pl.name}' now has ${pl.tracks.total}.`);
  },
};

// ---------------------------------------------------------------- arg parsing
const BOOL_FLAGS = new Set(["allow-dupes", "force"]);

function parseArgs(args: string[]): { positionals: string[]; flags: Flags } {
  const positionals: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("--")) {
      const name = a.slice(2);
      if (BOOL_FLAGS.has(name)) (flags as Record<string, unknown>)[name] = true;
      else (flags as Record<string, unknown>)[name] = args[++i];
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}

const [cmd, ...rest] = Bun.argv.slice(2);
const handler = cmd ? commands[cmd] : undefined;
if (!handler) {
  die(`Unknown command: ${cmd ?? "(none)"}\nCommands: ${Object.keys(commands).join(", ")}`);
}
const { positionals, flags } = parseArgs(rest);
await handler(positionals, flags);
