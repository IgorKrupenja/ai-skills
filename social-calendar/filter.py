#!/usr/bin/env python3
"""Hide crawl candidates that state.json says not to show again (social-calendar skill).

  filter.py <candidates.json>   filter a JSON array of {title, date, url, source_url, location}
  filter.py normalize <text>    print the normalized text: the `match` key for a banned series

A candidate is hidden when its url is in `added` or `declined`, or when a `banned_series`
entry's `match` occurs in its normalized title and the entry's `source` is "*" or the
candidate's `source_url`. Prints `SHOW n / HIDE m` with the count per reason, one line per
hidden candidate, then the candidates to show as JSON.
"""
import json
import os
import re
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
STATE_PATH = os.path.join(HERE, "state.json")


def normalize(text):
    """Lowercase; drop numbers (vol 12, years, dates), punctuation and emoji; keep RU/ET/EN words."""
    t = (text or "").lower()
    t = re.sub(r"[#№]", " ", t)
    t = re.sub(r"\d+", " ", t)
    t = re.sub(r"[^\w\s]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def load_state():
    if not os.path.exists(STATE_PATH):
        return {}
    return json.load(open(STATE_PATH, encoding="utf-8"))


def main(argv):
    if len(argv) >= 2 and argv[0] == "normalize":
        print(normalize(" ".join(argv[1:])))
        return
    if len(argv) != 1:
        sys.exit(__doc__)
    state = load_state()
    added = {e["url"] for e in state.get("added", [])}
    declined = {e["url"] for e in state.get("declined", [])}
    bans = [b for b in state.get("banned_series", []) if b.get("match")]
    show, hidden = [], []
    for c in json.load(open(argv[0], encoding="utf-8")):
        title = normalize(c.get("title"))
        ban = next((b for b in bans if b["source"] in ("*", c.get("source_url")) and b["match"] in title), None)
        if c["url"] in added:
            hidden.append((c, "already added", "already added"))
        elif c["url"] in declined:
            hidden.append((c, "declined", "declined"))
        elif ban:
            hidden.append((c, "banned series", f"banned series «{ban['label']}»"))
        else:
            show.append(c)
    counts = Counter(reason for _, reason, _ in hidden)
    summary = ", ".join(f"{reason} {n}" for reason, n in counts.items())
    print(f"SHOW {len(show)} / HIDE {len(hidden)}" + (f" ({summary})" if summary else ""))
    for c, _, why in hidden:
        print(f"  hidden: {c.get('title')} ({why})")
    print(json.dumps(show, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main(sys.argv[1:])
