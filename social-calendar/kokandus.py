#!/usr/bin/env python3
"""Watch the Tallinna Rahvaülikool cooking courses (kultuur.ee/valdkond/kokandus), social-calendar skill.

These courses fill up within days of appearing, so a crawl looks at every upcoming course, not
just the crawl window. On each run it:
  - fetches the whole listing,
  - compares it with kokandus.json, the snapshot from the previous run,
  - prints the NEW courses, the courses whose spots OPENED again (they were full), every upcoming
    ITALIAN course, and all upcoming courses that still have spots,
  - saves the new snapshot.
The page of each course seen for the first time is read for its time, price, language and menu
(the menu is where most Italian dishes show up). The first run only saves a baseline.
"""
import datetime
import html
import json
import os
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
SNAPSHOT = os.path.join(HERE, "kokandus.json")
LISTING = "https://kultuur.ee/valdkond/kokandus/"
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/128 Safari/537.36"}
MONTHS = ["jaanuar", "veebruar", "märts", "aprill", "mai", "juuni", "juuli", "august",
          "september", "oktoober", "november", "detsember"]
# "pasta" alone also means a spice paste in Estonian ("püha kolmainsuse pasta"), so it only counts in a title
ITALIAN = re.compile(r"itaalia|italian|pastaro|pitsa|pizza|focacc|foccac|tiramis|gnocch|risott|lasagn|carbonar|"
                     r"bruschet|pesto|mozzarell|parma|prosciut|panna cotta|antipast|ciabatt|polent|biscott|cannol|rooma",
                     re.I)
TODAY = datetime.date.today().isoformat()


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read().decode("utf-8", "replace")


def flat(fragment):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def listing():
    """Every course card as {url: {title, date, status}}; later pages repeat page 1, so stop when nothing new."""
    courses = {}
    for n in range(1, 10):
        page = get(LISTING if n == 1 else f"{LISTING}page/{n}/")
        before = len(courses)
        for m in re.finditer(r'<a\s+href="(https://kultuur\.ee/koolitus/[^"]+)"\s+class="post-item"\s*>(.*?)</a>', page, re.S):
            url, card = m.groups()
            if url in courses:
                continue
            field = lambda cls: flat(f.group(1)) if (f := re.search(rf'class="{cls}"[^>]*>(.*?)</div>', card, re.S)) else ""
            d = re.search(r"(\d{1,2})\. (\w+) (\d{4})", field("date"))
            spots = field("free_spots")
            left = re.search(r"(\d+) vaba koh", spots)
            courses[url] = {
                "title": flat(re.search(r"<h3[^>]*>(.*?)</h3>", card, re.S).group(1)),
                "date": datetime.date(int(d.group(3)), MONTHS.index(d.group(2).lower()) + 1, int(d.group(1))).isoformat() if d else "",
                "status": "full" if "TÄIS" in spots.upper() else f"{left.group(1)} left" if left else "open",
            }
        if len(courses) == before:
            break
    return courses


def details(url, title):
    """Time, price, language note and an Italian check of the title and menu, from the course page."""
    txt = re.sub(r"(?is)<(script|style|nav|header|footer).*?</\1>", " ", get(url))
    txt = re.sub(r"(\s*\|\s*)+", " | ", re.sub(r"\s+", " ", html.unescape(re.sub(r"(?s)<[^>]+>", " | ", txt))))
    info = txt.rfind("Rohkem infot")
    head, tail = txt[max(0, info - 700):info], txt[info:]
    body = tail[tail.find("Tutvu õppekorralduse alustega"):tail.find("Valdkonnad:")]
    time_m = re.search(r"kell ([\d.]+[–-][\d.]+)", head)
    price_m = re.search(r"Hind: \| ([^|]+)", tail)
    lang_m = re.search(r"NB! Kursus on (\w+) keeles", tail)
    italian = {m.group(0).lower() for m in ITALIAN.finditer(title + " " + body)}
    italian = sorted(italian | {m.group(0).lower() for m in re.finditer(r"\bpasta", title, re.I)})
    return {"time": time_m.group(1) if time_m else "", "price": price_m.group(1).strip() if price_m else "",
            "lang": lang_m.group(1) if lang_m else "", "italian": ", ".join(italian)}


def line(url, c):
    extra = " | ".join(x for x in (c.get("time", ""), c.get("price", ""), f"{c['lang']} keeles" if c.get("lang") else "") if x)
    italian = f" | italian: {c['italian']}" if c.get("italian") else ""
    return f"  {c['date']} | {c['status']:<7} | {c['title']}" + (f" | {extra}" if extra else "") + italian + f" | {url}"


def main():
    old = json.load(open(SNAPSHOT, encoding="utf-8"))["courses"] if os.path.exists(SNAPSHOT) else None
    current = listing()
    need = [u for u in current if old is None or u not in old or "time" not in old[u]]
    with ThreadPoolExecutor(6) as pool:
        for url, info in zip(need, pool.map(lambda u: details(u, current[u]["title"]), need)):
            current[url].update(info)
    for url, c in current.items():
        if url not in need and old and url in old:
            c.update({k: old[url][k] for k in ("time", "price", "lang", "italian", "first_seen") if k in old[url]})
        c.setdefault("first_seen", TODAY)

    upcoming = {u: c for u, c in current.items() if c["date"] >= TODAY}
    new = {u: c for u, c in upcoming.items() if old is not None and u not in old}
    opened = {u: c for u, c in upcoming.items() if old and u in old and old[u]["status"] == "full" and c["status"] != "full"}
    italian = {u: c for u, c in upcoming.items() if c.get("italian")}
    has_spots = {u: c for u, c in upcoming.items() if c["status"] != "full"}

    # keep past courses for a while so a course that reappears is not reported as new
    cutoff = (datetime.date.today() - datetime.timedelta(days=60)).isoformat()
    kept = {u: c for u, c in (old or {}).items() if u not in current and c.get("date", "") >= cutoff}
    json.dump({"updated": TODAY, "courses": {**kept, **current}}, open(SNAPSHOT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    full = sum(c["status"] == "full" for c in upcoming.values())
    head = f"kokandus: {len(upcoming)} upcoming, {full} full"
    print(head + (" | first run, baseline saved" if old is None else f" | new: {len(new)} | spots opened: {len(opened)}"))
    for name, group in (("NEW", new), ("SPOTS OPENED (were full)", opened), ("ITALIAN AHEAD", italian), ("UPCOMING WITH SPOTS", has_spots)):
        if name in ("NEW", "SPOTS OPENED (were full)") and old is None:
            continue
        print(f"{name}: {len(group) or 'none'}")
        for url, c in sorted(group.items(), key=lambda kv: kv[1]["date"]):
            print(line(url, c))


if __name__ == "__main__":
    main()
