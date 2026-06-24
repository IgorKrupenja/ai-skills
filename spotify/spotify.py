#!/usr/bin/env python3
"""Spotify Web API helper — token management + common playlist operations.

Pure Python 3 standard library — no pip installs, no build step, runs anywhere
python3 exists (macOS + the cloud sandbox both ship it):

    python3 spotify.py <command>

Auto-loads .env, so you can run it without exporting anything first.

Env vars (from .env, see .env.example):
  SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET   (required)
  SPOTIFY_REDIRECT_URI    (default http://127.0.0.1:8888/callback; MUST be registered on the app)
  SPOTIFY_PLAYLIST_ID     (default playlist for playlist/add-* commands)
  SPOTIFY_PLAYLIST_<NAME> (named playlists, each usable as --playlist <name>)
  SPOTIFY_REFRESH_TOKEN   (optional; with it set the script never needs the browser)
  SPOTIFY_SCOPES          (optional; default is the full user-facing Web API scope set)

The user token is cached in .spotify_token.json next to this file and refreshed
automatically. The FIRST run (no refresh token anywhere) needs interactive
authorization: it prints `AUTH_URL <url>` and waits on the local callback server —
open that URL in a browser logged into the right Spotify account.

Commands:
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
open.spotify.com/... URL.
"""
import argparse
import base64
import http.server
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
TOKEN_FILE = os.path.join(HERE, ".spotify_token.json")
API = "https://api.spotify.com/v1"
ACCOUNTS = "https://accounts.spotify.com"


def die(msg):
    print(msg, file=sys.stderr)
    sys.exit(1)


def load_dotenv():
    """Load .env (skill-dir parent or $SKILLS_DIR). Real env vars win over .env."""
    candidates = [
        os.path.join(os.path.dirname(HERE), ".env"),
        os.path.join(os.environ.get("SKILLS_DIR", os.path.expanduser("~/.claude/skills")), ".env"),
    ]
    for path in candidates:
        if not os.path.exists(path):
            continue
        with open(path) as f:
            for raw in f:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, val = line.split("=", 1)
                key, val = key.strip(), val.strip()
                if (val[:1], val[-1:]) in (('"', '"'), ("'", "'")):
                    val = val[1:-1]
                os.environ.setdefault(key, val)
        break


def env(name, default=None, required=False):
    v = os.environ.get(name, default)
    if required and not v:
        die(f"Missing required env var {name} — copy .env.example to .env and fill it in.")
    return v


load_dotenv()
CLIENT_ID = env("SPOTIFY_CLIENT_ID", required=True)
CLIENT_SECRET = env("SPOTIFY_CLIENT_SECRET", required=True)
REDIRECT_URI = env("SPOTIFY_REDIRECT_URI", "http://127.0.0.1:8888/callback")
DEFAULT_PLAYLIST = env("SPOTIFY_PLAYLIST_ID")
# Default: full set of user-facing Web API scopes, so a missing scope is never the
# blocker. Editing playlists only strictly needs playlist-modify-*.
SCOPES = env("SPOTIFY_SCOPES",
             "ugc-image-upload user-read-playback-state user-modify-playback-state "
             "user-read-currently-playing app-remote-control streaming "
             "playlist-read-private playlist-read-collaborative "
             "playlist-modify-private playlist-modify-public "
             "user-follow-modify user-follow-read user-read-playback-position "
             "user-top-read user-read-recently-played user-library-modify "
             "user-library-read user-read-email user-read-private")

# Named playlists: every SPOTIFY_PLAYLIST_<NAME> env var (except _ID) becomes the alias
# <name> (lowercased), usable as `--playlist <name>`. SPOTIFY_PLAYLIST_ID is the default
# target and also answers to the alias "main".
PLAYLIST_ALIASES = {}
for _k, _v in os.environ.items():
    _m = re.match(r"^SPOTIFY_PLAYLIST_(.+)$", _k)
    if _m and _v and _m.group(1).upper() != "ID":
        PLAYLIST_ALIASES[_m.group(1).lower()] = _v
if DEFAULT_PLAYLIST:
    PLAYLIST_ALIASES.setdefault("main", DEFAULT_PLAYLIST)
PLAYLIST_SYNONYMS = {"running": "sport", "run": "sport", "todo": "main"}


# --- auth / token ---
def _basic():
    return base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()


def _post_token(form):
    req = urllib.request.Request(
        ACCOUNTS + "/api/token", data=urllib.parse.urlencode(form).encode(),
        headers={"Authorization": "Basic " + _basic(),
                 "Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def save_token(tok):
    out = dict(tok)
    out["expires_at"] = time.time() + out.get("expires_in", 3600) - 60
    if not out.get("refresh_token") and os.path.exists(TOKEN_FILE):
        try:  # refresh responses omit the refresh_token — keep the existing one
            out["refresh_token"] = json.load(open(TOKEN_FILE)).get("refresh_token")
        except Exception:
            pass
    with open(TOKEN_FILE, "w") as f:
        json.dump(out, f)
    os.chmod(TOKEN_FILE, 0o600)  # restrict the refresh-token file to the owner
    return out


def interactive_auth():
    u = urllib.parse.urlparse(REDIRECT_URI)
    host, port = (u.hostname or "127.0.0.1"), (u.port or 8888)
    auth_url = ACCOUNTS + "/authorize?" + urllib.parse.urlencode({
        "client_id": CLIENT_ID, "response_type": "code",
        "redirect_uri": REDIRECT_URI, "scope": SCOPES, "show_dialog": "false"})
    got = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _html(self, msg):
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(("<html><body style='font-family:sans-serif;padding:3em'>"
                              f"<h2>{msg}</h2></body></html>").encode())

        def do_GET(self):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            if "code" in q:
                got["code"] = q["code"][0]
                self._html("Authorized. Return to the terminal.")
            else:
                got["error"] = q.get("error", ["unknown"])[0]
                self._html("Authorization failed. You can close this tab.")
            threading.Thread(target=self.server.shutdown).start()

    srv = http.server.HTTPServer((host, port), Handler)
    print("AUTH_URL " + auth_url, flush=True)
    print(f"Waiting for authorization on {REDIRECT_URI} ...", flush=True)
    srv.serve_forever()
    if "code" not in got:
        die("Authorization failed: " + got.get("error", "no code returned"))
    tok = save_token(_post_token({"grant_type": "authorization_code",
                                  "code": got["code"], "redirect_uri": REDIRECT_URI}))
    print("TOKEN_OK scopes=" + tok.get("scope", ""), flush=True)
    if tok.get("refresh_token"):
        print("REFRESH_TOKEN " + tok["refresh_token"], flush=True)
        print("-> Save this as SPOTIFY_REFRESH_TOKEN in .env to skip the browser everywhere.", flush=True)
    return tok


def _refresh(refresh_token):
    tok = _post_token({"grant_type": "refresh_token", "refresh_token": refresh_token})
    tok.setdefault("refresh_token", refresh_token)
    return tok


def get_token(force=False):
    """valid cached access token -> refresh (env SPOTIFY_REFRESH_TOKEN, else cached) -> browser."""
    cached = None
    if not force and os.path.exists(TOKEN_FILE):
        try:
            cached = json.load(open(TOKEN_FILE))
        except Exception:
            cached = None
        if cached and cached.get("access_token") and cached.get("expires_at", 0) > time.time():
            return cached
    if not force:
        rt = os.environ.get("SPOTIFY_REFRESH_TOKEN") or (cached.get("refresh_token") if cached else None)
        if rt:
            try:
                return save_token(_refresh(rt))
            except urllib.error.HTTPError as e:
                print(f"Token refresh failed ({e.code}); re-authorizing...", file=sys.stderr)
    return interactive_auth()


# --- api ---
def api(method, path, params=None, body=None):
    token = get_token()["access_token"]
    url = API + path + ("?" + urllib.parse.urlencode(params) if params else "")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Authorization": "Bearer " + token,
                                          "Content-Type": "application/json"})
    while True:
        try:
            with urllib.request.urlopen(req) as r:
                txt = r.read().decode()
                return json.loads(txt) if txt else {}
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = int(e.headers.get("Retry-After", "2")) + 1
                print(f"  rate limited, waiting {wait}s", file=sys.stderr)
                time.sleep(wait)
                continue
            die(f"API {e.code} on {method} {path}: {e.read().decode()}")


def spotify_id(s, kind):
    m = re.search(r"(?:spotify:%s:|/%s/)([A-Za-z0-9]+)" % (kind, kind), s.strip())
    return m.group(1) if m else s.strip()


def paginate(path, params, limit):
    out, off, params = [], 0, dict(params)
    params["limit"] = limit
    while True:
        params["offset"] = off
        page = api("GET", path, params)
        out.extend(page.get("items", []))
        if not page.get("next"):
            return out
        off += limit


def need_playlist(arg):
    """Resolve a playlist arg: a named alias (sport/classics/main/...), or a raw id/URI/URL."""
    raw = arg or DEFAULT_PLAYLIST
    if not raw:
        die("No playlist — pass an id/name/URL or set SPOTIFY_PLAYLIST_ID in .env.")
    key = raw.lower()
    resolved = PLAYLIST_ALIASES.get(PLAYLIST_SYNONYMS.get(key, key), raw)
    return spotify_id(resolved, "playlist")


def existing_uris(pid):
    items = paginate(f"/playlists/{pid}/tracks", {"fields": "items(track(uri)),next"}, 100)
    return {it["track"]["uri"] for it in items if it.get("track") and it["track"].get("uri")}


def add_uris(pid, uris):
    for i in range(0, len(uris), 100):
        api("POST", f"/playlists/{pid}/tracks", body={"uris": uris[i:i + 100]})


def remove_uris(pid, uris):
    for i in range(0, len(uris), 100):
        api("DELETE", f"/playlists/{pid}/tracks",
            body={"tracks": [{"uri": u} for u in uris[i:i + 100]]})


# --- commands ---
def cmd_auth(a):
    interactive_auth()


def cmd_token(a):
    print(get_token(force=a.force)["access_token"])


def cmd_me(a):
    me = api("GET", "/me")
    print(json.dumps({k: me.get(k) for k in ("display_name", "id", "country", "product")},
                     ensure_ascii=False))


def cmd_playlist(a):
    pid = need_playlist(a.playlist)
    pl = api("GET", f"/playlists/{pid}",
             {"fields": "name,public,collaborative,owner(display_name,id),tracks(total)"})
    print(json.dumps(pl, ensure_ascii=False, indent=2))


def cmd_playlists(a):
    if not PLAYLIST_ALIASES:
        print("No named playlists. Add SPOTIFY_PLAYLIST_<NAME> to .env.")
        return
    for name, pid in PLAYLIST_ALIASES.items():
        pl = api("GET", f"/playlists/{pid}", {"fields": "name,tracks(total)"})
        print(f"{name:10} {pid}  {pl['name']} ({pl['tracks']['total']})")


def cmd_search(a):
    res = api("GET", "/search", {"q": a.query, "type": a.type, "limit": a.limit})
    for it in res.get(a.type + "s", {}).get("items", []):
        arts = ", ".join(x["name"] for x in it.get("artists", []))
        if a.type == "album":
            print(f"{it['id']} | {it['album_type']:6} | tracks={it['total_tracks']:2} | "
                  f"{it.get('release_date', '?'):10} | {it['name']}  —  [{arts}]")
        else:
            print(f"{it['id']} | {it['name']}  —  [{arts}]  ({it['album']['name']})")


def cmd_album_tracks(a):
    for t in paginate(f"/albums/{spotify_id(a.album, 'album')}/tracks", {}, 50):
        print(f"{t['track_number']:2}. {t['name']}  [{t['uri']}]")


def cmd_add_album(a):
    pid = need_playlist(a.playlist)
    have = set() if a.allow_dupes else existing_uris(pid)
    to_add, skipped = [], 0
    for raw in a.album:
        aid = spotify_id(raw, "album")
        tracks = paginate(f"/albums/{aid}/tracks", {}, 50)
        print(f"\nAlbum {aid}: {len(tracks)} tracks")
        for t in tracks:
            if t["uri"] in have:
                skipped += 1
                print(f"   = already present: {t['track_number']:2}. {t['name']}")
            else:
                to_add.append(t["uri"])
                have.add(t["uri"])
                print(f"   + {t['track_number']:2}. {t['name']}")
    add_uris(pid, to_add)
    pl = api("GET", f"/playlists/{pid}", {"fields": "tracks(total),name"})
    print(f"\nAdded {len(to_add)} tracks ({skipped} skipped as already present). "
          f"'{pl['name']}' now has {pl['tracks']['total']}.")


def cmd_add_tracks(a):
    pid = need_playlist(a.playlist)
    have = set() if a.allow_dupes else existing_uris(pid)
    to_add, skipped = [], 0
    for raw in a.track:
        uri = "spotify:track:" + spotify_id(raw, "track")
        if uri in have:
            skipped += 1
        else:
            to_add.append(uri)
            have.add(uri)
    add_uris(pid, to_add)
    pl = api("GET", f"/playlists/{pid}", {"fields": "tracks(total),name"})
    print(f"Added {len(to_add)} tracks ({skipped} skipped). '{pl['name']}' now has {pl['tracks']['total']}.")


def cmd_remove_tracks(a):
    pid = need_playlist(a.playlist)
    uris = ["spotify:track:" + spotify_id(raw, "track") for raw in a.track]
    remove_uris(pid, uris)
    pl = api("GET", f"/playlists/{pid}", {"fields": "tracks(total),name"})
    print(f"Removed {len(uris)} track(s). '{pl['name']}' now has {pl['tracks']['total']}.")


def cmd_move(a):
    src = need_playlist(a.src)
    dst = need_playlist(a.dst)
    uris = ["spotify:track:" + spotify_id(raw, "track") for raw in a.track]
    have = set() if a.allow_dupes else existing_uris(dst)
    to_add = [u for u in uris if u not in have]
    add_uris(dst, to_add)       # destination first, so nothing is lost if it fails
    remove_uris(src, uris)
    s = api("GET", f"/playlists/{src}", {"fields": "tracks(total),name"})
    d = api("GET", f"/playlists/{dst}", {"fields": "tracks(total),name"})
    print(f"Moved {len(uris)} track(s): '{s['name']}' ({s['tracks']['total']}) -> "
          f"'{d['name']}' ({d['tracks']['total']}); {len(to_add)} added, "
          f"{len(uris) - len(to_add)} already in dest.")


def main():
    p = argparse.ArgumentParser(description="Spotify Web API helper")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("auth").set_defaults(fn=cmd_auth)
    sp = sub.add_parser("token"); sp.add_argument("--force", action="store_true"); sp.set_defaults(fn=cmd_token)
    sub.add_parser("me").set_defaults(fn=cmd_me)
    sp = sub.add_parser("playlist"); sp.add_argument("playlist", nargs="?"); sp.set_defaults(fn=cmd_playlist)
    sub.add_parser("playlists").set_defaults(fn=cmd_playlists)
    sp = sub.add_parser("search"); sp.add_argument("query")
    sp.add_argument("--type", default="album", choices=["album", "track"])
    sp.add_argument("--limit", type=int, default=12); sp.set_defaults(fn=cmd_search)
    sp = sub.add_parser("album-tracks"); sp.add_argument("album"); sp.set_defaults(fn=cmd_album_tracks)
    sp = sub.add_parser("add-album"); sp.add_argument("album", nargs="+")
    sp.add_argument("--playlist"); sp.add_argument("--allow-dupes", action="store_true")
    sp.set_defaults(fn=cmd_add_album)
    sp = sub.add_parser("add-tracks"); sp.add_argument("track", nargs="+")
    sp.add_argument("--playlist"); sp.add_argument("--allow-dupes", action="store_true")
    sp.set_defaults(fn=cmd_add_tracks)
    sp = sub.add_parser("remove-tracks"); sp.add_argument("track", nargs="+")
    sp.add_argument("--playlist"); sp.set_defaults(fn=cmd_remove_tracks)
    sp = sub.add_parser("move"); sp.add_argument("track", nargs="+")
    sp.add_argument("--from", dest="src", required=True)
    sp.add_argument("--to", dest="dst", required=True)
    sp.add_argument("--allow-dupes", action="store_true"); sp.set_defaults(fn=cmd_move)
    a = p.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
