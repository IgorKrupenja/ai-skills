#!/usr/bin/env python3
"""Drive one tab of the shared playwright-cli browser without touching anyone else's tabs.

Plain playwright-cli commands act on whichever tab is current, and other chats and agents switch
that at any moment. This helper keeps each caller in a tab of its own: it remembers the tab's
Chrome target id, which stays the same across navigations, and runs your code against that page
only.

    tab.py open <tag> <url>      open a new tab for <tag> and load <url>
    tab.py run <tag> [file]      run `async (p, env) => {...}` from file (or stdin) in the tab
    tab.py close <tag>           close the tab
    tab.py cleanup <prefix>      close every tab whose tag starts with <prefix>

In `run`, `p` is the tab's Playwright Page and `env.shots` an absolute folder for screenshots
(`.playwright-cli/` in the current folder). Return a string or any JSON value; it is printed.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

STATE_DIR = Path(tempfile.gettempdir()) / "fashion-hunt-tabs"
TAG_RE = re.compile(r"^[A-Za-z0-9._-]{1,80}$")

WRAPPER = r"""
async page => {
  const MODE = __MODE__, TAG = __TAG__, TIDS = __TIDS__, START = __START__, SHOTS = __SHOTS__;
  const ctx = page.context();
  const tidOf = async (p) => {
    const s = await ctx.newCDPSession(p);
    try { return (await s.send('Target.getTargetInfo')).targetInfo.targetId; }
    finally { await s.detach().catch(() => {}); }
  };
  const find = async (tid) => {
    for (const p of ctx.pages()) {
      try { if (await tidOf(p) === tid) return p; } catch (e) {}
    }
    return null;
  };
  if (MODE === 'cleanup') {
    let closed = 0;
    for (const tid of TIDS) { const p = await find(tid); if (p) { await p.close(); closed++; } }
    return JSON.stringify({ ok: true, closed });
  }
  let mine;
  if (MODE === 'open') {
    // ctx.newPage() opens a foreground tab, which pulls Chrome in front of the user's other apps.
    const s = await ctx.newCDPSession(page);
    const { targetId: tid } = await s.send('Target.createTarget', { url: 'about:blank', background: true });
    await s.detach().catch(() => {});
    for (let i = 0; i < 50 && !mine; i++) {
      mine = await find(tid);
      if (!mine) await new Promise(r => setTimeout(r, 100));
    }
    if (!mine) return JSON.stringify({ ok: false, error: 'the new background tab did not appear' });
    try {
      await mine.goto(START, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch (e) {
      return JSON.stringify({ ok: true, tid, url: mine.url(), warning: String(e).slice(0, 300) });
    }
    return JSON.stringify({ ok: true, tid, url: mine.url(), result: await mine.title() });
  }
  mine = await find(TIDS[0]);
  if (!mine) return JSON.stringify({ ok: false, gone: true, error: 'tab not found: it was closed' });
  if (MODE === 'close') { await mine.close(); return JSON.stringify({ ok: true, closed: 1 }); }
  const body = (
__BODY__
  );
  let result = null, error = null;
  try { result = await body(mine, { shots: SHOTS, tag: TAG }); }
  catch (e) { error = String(e && e.stack || e).split('\n').slice(0, 4).join('\n'); }
  await mine.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
  return JSON.stringify({ ok: !error, error, tid: TIDS[0], url: mine.url(), result });
}
"""


def state_path(tag: str) -> Path:
    return STATE_DIR / f"{tag}.json"


def load_state(tag: str) -> dict[str, Any] | None:
    path = state_path(tag)
    if not path.is_file():
        return None
    return json.loads(path.read_text())


def save_state(tag: str, data: dict[str, Any]) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    state_path(tag).write_text(json.dumps(data))


def run_wrapper(session: str, timeout: int, **values: Any) -> dict[str, Any]:
    cli = shutil.which("playwright-cli")
    if not cli:
        sys.exit("playwright-cli is not on PATH")
    script = WRAPPER
    body = values.pop("body", "null")
    for key, value in values.items():
        script = script.replace(f"__{key.upper()}__", json.dumps(value))
    script = script.replace("__BODY__", body)
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", suffix=".js", dir=STATE_DIR, delete=False) as handle:
        handle.write(script)
        script_path = handle.name
    try:
        proc = subprocess.run(
            [cli, f"-s={session}", "--raw", "run-code", f"--filename={script_path}"],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        sys.exit(f"timed out after {timeout}s; split the work into shorter runs")
    finally:
        os.unlink(script_path)
    out = proc.stdout.strip()
    if proc.returncode != 0 or out.startswith("###") or not out:
        detail = (out or proc.stderr.strip())[:2000]
        if "not open" in detail.lower():
            detail += f"\nThe '{session}' browser isn't open: ask the agent that started you to open it."
        sys.exit(detail)
    try:
        payload = json.loads(json.loads(out))
    except (json.JSONDecodeError, TypeError):
        sys.exit(f"unexpected output: {out[:2000]}")
    return payload


def print_result(result: Any) -> None:
    if result is None:
        return
    print(result if isinstance(result, str) else json.dumps(result, ensure_ascii=False, indent=1))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("-s", "--session", default="personal", help="playwright-cli session name")
    parser.add_argument("--timeout", type=int, default=420, help="seconds before giving up on one call")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_open = sub.add_parser("open")
    p_open.add_argument("tag")
    p_open.add_argument("url")
    p_run = sub.add_parser("run")
    p_run.add_argument("tag")
    p_run.add_argument("file", nargs="?", default="-")
    p_close = sub.add_parser("close")
    p_close.add_argument("tag")
    p_clean = sub.add_parser("cleanup")
    p_clean.add_argument("prefix")
    args = parser.parse_args()

    shots = str(Path(".playwright-cli").resolve())
    common = {"session": args.session, "timeout": args.timeout}

    if args.cmd == "cleanup":
        tags = [p.stem for p in STATE_DIR.glob("*.json") if p.stem.startswith(args.prefix)] if STATE_DIR.is_dir() else []
        states = {t: load_state(t) for t in tags}
        tids = [s["tid"] for s in states.values() if s and s.get("session") == args.session]
        if tids:
            payload = run_wrapper(**common, mode="cleanup", tag="", tids=tids, start=None, shots=shots)
            print(f"closed {payload.get('closed', 0)} of {len(tids)} tabs")
        else:
            print("no tabs to close")
        for t in tags:
            state_path(t).unlink(missing_ok=True)
        return 0

    if not TAG_RE.match(args.tag):
        sys.exit("tag may only use letters, digits, '.', '_' and '-'")

    if args.cmd == "open":
        if load_state(args.tag):
            sys.exit(f"tag '{args.tag}' already has a tab: use run, or close it first")
        payload = run_wrapper(**common, mode="open", tag=args.tag, tids=[], start=args.url, shots=shots)
        save_state(args.tag, {"tid": payload["tid"], "url": payload.get("url"), "session": args.session})
        if payload.get("warning"):
            print(f"tab opened, but loading failed: {payload['warning']}", file=sys.stderr)
        print(f"opened {payload.get('url')} ({payload.get('result', '')})")
        return 0

    state = load_state(args.tag)
    if not state:
        sys.exit(f"no tab for tag '{args.tag}': open one first")

    if args.cmd == "close":
        payload = run_wrapper(**common, mode="close", tag=args.tag, tids=[state["tid"]], start=None, shots=shots)
        state_path(args.tag).unlink(missing_ok=True)
        print("closed" if payload.get("ok") else "tab was already gone")
        return 0

    source = sys.stdin.read() if args.file == "-" else Path(args.file).read_text()
    if not source.strip():
        sys.exit("no code to run")
    Path(shots).mkdir(parents=True, exist_ok=True)
    payload = run_wrapper(
        **common, mode="run", tag=args.tag, tids=[state["tid"]], start=None, shots=shots, body=source.strip().rstrip(";")
    )
    if payload.get("gone"):
        state_path(args.tag).unlink(missing_ok=True)
        sys.exit(f"the tab for '{args.tag}' is gone: open a new one")
    state["url"] = payload.get("url")
    save_state(args.tag, state)
    print_result(payload.get("result"))
    if payload.get("error"):
        print(f"error (tab now at {payload.get('url')}):\n{payload['error']}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
