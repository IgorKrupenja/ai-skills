#!/usr/bin/env python3
"""What the user has already bought: the upcoming events in the PAID calendar (social-calendar skill).

  bought.py    print every upcoming bought event: date, time, title, URL

filter.py and kokandus.py import it and set bought events apart on their own. Anything else
shown or recommended (an ad-hoc list, a single pick, a pasted link) is checked against this
output by hand: see SKILL.md, "Already bought?". The PAID calendar is the record of what was
bought; state.json `added` holds picks and purchases alike.

A failed calendar read raises Unknown: "couldn't check" must never pass for "nothing bought".
"""
import datetime
import json
import os
import re
import subprocess
import sys
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
DAYS_AHEAD = 400


class Unknown(Exception):
    """The PAID calendar could not be read, so what is bought is unknown."""


def canon(url):
    """The URL without scheme, `www.` or trailing slash: the key bought events are matched by."""
    p = urllib.parse.urlsplit((url or "").strip())
    host = re.sub(r"^www\.", "", p.netloc.lower())
    return host + p.path.rstrip("/") + (f"?{p.query}" if p.query else "") + (f"#{p.fragment}" if p.fragment else "")


def calendar_id():
    """SOCIAL_CALENDAR_PAID_ID from the environment, else from the skills .env (kokandus.py runs without it)."""
    if os.environ.get("SOCIAL_CALENDAR_PAID_ID"):
        return os.environ["SOCIAL_CALENDAR_PAID_ID"]
    env = os.path.join(os.environ.get("SKILLS_DIR") or os.path.dirname(HERE), ".env")
    if os.path.exists(env):
        for line in open(env, encoding="utf-8"):
            if m := re.match(r"\s*SOCIAL_CALENDAR_PAID_ID\s*=\s*(.*?)\s*$", line):
                return m.group(1).strip("\"'")
    raise Unknown("SOCIAL_CALENDAR_PAID_ID is not set")


def load():
    """Every bought event from today on, as {date, time, title, summary, url}, in date order."""
    today = datetime.date.today()
    cmd = ["gog", "calendar", "events", calendar_id(), "--from", today.isoformat(),
           "--to", (today + datetime.timedelta(days=DAYS_AHEAD)).isoformat(), "--all-pages", "--json"]
    try:
        events = json.loads(subprocess.run(cmd, capture_output=True, text=True, timeout=90, check=True).stdout)["events"]
    except subprocess.CalledProcessError as e:
        raise Unknown(f"gog failed: {(e.stderr or e.stdout).strip()[:300]}") from e
    except (OSError, subprocess.SubprocessError, ValueError, KeyError, TypeError) as e:
        raise Unknown(f"{type(e).__name__}: {e}") from e
    out = []
    for e in events:
        start = e.get("start", {})
        when = start.get("dateTime") or start.get("date") or ""
        summary = e.get("summary", "")
        lines = (e.get("description") or "").splitlines()
        url = (e.get("source") or {}).get("url") or (lines[2].strip() if len(lines) > 2 else "")
        # "Title · 60€ [PAID]" -> "Title"
        title = re.sub(r"\s+·\s+[^·]*$", "", re.sub(r"\s*\[(PAID|BOOK)\]\s*$", "", summary))
        out.append({"date": when[:10], "time": when[11:16], "title": title, "summary": summary, "url": url})
    return sorted(out, key=lambda b: (b["date"], b["time"]))


def main():
    try:
        events = load()
    except Unknown as e:
        print(f"WARNING: could not read the PAID calendar ({e}). What is bought is UNKNOWN, not empty.")
        sys.exit(1)
    print(f"bought: {len(events)} upcoming in the PAID calendar")
    for b in events:
        print(f"  {b['date']} {b['time'] or 'all day'} | {b['summary']} | {b['url'] or 'no URL'}")


if __name__ == "__main__":
    main()
