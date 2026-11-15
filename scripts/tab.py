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

STATE_DIR = Path(tempfile.gettempdir()) / "playwright-cli-tabs"
TAG_RE = re.compile(r"^[A-Za-z0-9._-]{1,80}$")
TAB_JS = Path(__file__).resolve().with_name("tab.js")


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


def run_tab_js(session: str, timeout: int, body: str = "null", **args: Any) -> dict[str, Any]:
    """Run tab.js in the browser with these arguments and, in `run` mode, the caller's code."""
    cli = shutil.which("playwright-cli")
    if not cli:
        sys.exit("playwright-cli is not on PATH")
    # One pass, so placeholder-like text inside the arguments or the body stays as it is. The body
    # goes on lines of its own, so a trailing `//` comment in it can't swallow the closing bracket.
    fills = {"__ARGS__": json.dumps(args), "__BODY__": f"\n{body}\n"}
    script = re.sub("__ARGS__|__BODY__", lambda m: fills[m[0]], TAB_JS.read_text())
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
            detail += f"\nThe '{session}' browser isn't open: start it first, or ask the agent that started you to."
        sys.exit(detail)
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        sys.exit(f"unexpected output: {out[:2000]}")


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

    common = {"session": args.session, "timeout": args.timeout}

    if args.cmd == "cleanup":
        tags = [p.stem for p in STATE_DIR.glob("*.json") if p.stem.startswith(args.prefix)] if STATE_DIR.is_dir() else []
        states = {t: load_state(t) for t in tags}
        tids = [s["tid"] for s in states.values() if s and s.get("session") == args.session]
        if tids:
            payload = run_tab_js(**common, mode="close", tids=tids)
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
        payload = run_tab_js(**common, mode="open", url=args.url)
        if not payload.get("ok"):
            sys.exit(payload.get("error") or "could not open a tab")
        save_state(args.tag, {"tid": payload["tid"], "url": payload.get("url"), "session": args.session})
        if payload.get("warning"):
            print(f"tab opened, but loading failed: {payload['warning']}", file=sys.stderr)
        print(f"opened {payload.get('url')} ({payload.get('result', '')})")
        return 0

    state = load_state(args.tag)
    if not state:
        sys.exit(f"no tab for tag '{args.tag}': open one first")

    if args.cmd == "close":
        payload = run_tab_js(**common, mode="close", tids=[state["tid"]])
        state_path(args.tag).unlink(missing_ok=True)
        print("closed" if payload.get("closed") else "tab was already gone")
        return 0

    source = sys.stdin.read() if args.file == "-" else Path(args.file).read_text()
    if not source.strip():
        sys.exit("no code to run")
    shots = Path(".playwright-cli").resolve()
    shots.mkdir(parents=True, exist_ok=True)
    payload = run_tab_js(
        **common, mode="run", tid=state["tid"], tag=args.tag, shots=str(shots), body=source.strip().rstrip(";")
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
