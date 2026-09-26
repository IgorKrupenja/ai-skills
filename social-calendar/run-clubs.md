# Run clubs (`Running` sources)

Read this when a crawl (step A3 in [SKILL.md](SKILL.md)) reaches a source in the `Running`
category. Run clubs publish a weekly routine, not events: crawling one means finding its
**current schedule** and turning it into dated candidates.

## Instagram club profiles

Look in this order, and keep going after the first hit, because these sources often disagree:

1. **Bio in the profile header.** Most clubs keep the schedule there (`TUE ➡️ 18.30 Track @ Snelli`,
   `Igal teisipäeval. Kell 17.30.`). IG truncates it: **click `more` in the header** before
   reading, or you get half the week. The short lines after the bio link (`#9 Long Run TLN`,
   `Menüü`, `Millal ja kus?`) are story-highlight titles, not bio. Open a highlight only when its
   title promises the schedule and the bio and pinned posts left it unclear. Some bios carry no
   schedule at all (`@veerennisork`), so go straight on to the posts.
2. **Pinned posts.** Up to three sit at the start of the grid, each tile marked with
   `svg[aria-label="Pinned post icon"]`. The tile's `img[alt]` carries the caption, so you can
   triage without opening. Some are a weekly menu (Kopli Sörk's `NÄDALAMENÜÜ` lists this week's
   runs, one-off specials included); others are unrelated (Pühaste's are a partner's beer cruise).
   **A caption with no day or time does not mean there's no schedule.** If the post looks like a
   poster or announcement, the time is in the image. Open the post, screenshot the media and read
   it, stepping through every carousel slide.
3. **Latest 2–3 posts**, for this week's deviations: a cancelled run, a moved start, an extra
   session. One-off events there (a race, a party, a special run) are ordinary candidates.
4. **Registration link in the bio.** If it points to Luma (CULT, Long Run Tallinn, We Run Volta),
   open it. A Luma calendar lists each run as its own page with the exact time and start, and that
   page becomes the candidate URL. If registration is needed to attend, the run is `[BOOK]`. A
   Strava "join the club" is optional and doesn't count. When next week's run isn't on Luma
   yet, list the calendar's past events (`period=past`): they show the usual start. The event
   description often names the exact meeting point, e.g. CULT: "Meet at Linnahall Circle K".
5. **`@ TBA` in a bio means the start really rotates.** Buns' Sunday 10K has started from Kalma
   plats, Cafe Tempo, Balta Karjane, Varav (Volta) and Brick, announced a day or two ahead in a
   post and in their Instagram broadcast channel. List it as "start TBA" and don't dig for a fixed
   point that doesn't exist (checked 120 posts, 2026-09-26).

**Post dates without opening posts.** "näeme homme" is useless until you know when it was
posted, and the grid doesn't show dates. The shortcode (last URL segment) encodes the timestamp:
read it as base64url digits (`A–Z a–z 0–9 - _`) into an integer `id`; `(id >> 23) + 1314220021721`
is Unix time in ms. It matched the post's `<time>` to the second (2026-09-26). Don't bother with
IG's `web_profile_info` API: it answered 429.

**The freshest source wins:** latest post > pinned post > bio > the sörk DB below. (2026-09-26:
the DB had Rotermann on even weeks only and Hipodroomi biweekly; both bios say every Tuesday.)

## From schedule to candidates

- One candidate per run inside the crawl window: today through today + 14 days (SKILL.md, step
  A3). Title `<Club>: <run>`, e.g. `Buns Run Club: Track`, `Kopli Sörk: 10K`. Where = the start point the club
  names.
- **URL:** the run's own page when there is one (its Luma event, or a post announcing that
  particular run). Otherwise use the club's profile URL with the run's date as a fragment:
  `https://www.instagram.com/bunsrunclub/#2026-09-29`. The fragment opens the same page, but it
  gives each occurrence its own key in `state.json`. With the bare profile URL, adding one Tuesday
  would hide every future Tuesday. When a club runs twice that day, append the start time
  (`#2026-09-27-0900`, `#2026-09-27-1015`).

## The sörk club database (`eestisorgib.ee` bookmark)

`eestisorgib.ee` (= `sork.ee`) is a directory of ~80 Estonian sörk clubs, not an event page. Don't
scrape the SPA: its base44 backend is public.

```bash
F="${TMPDIR:-/tmp}/runclubs.json"
curl -s "https://base44.app/api/apps/698706c0c5103021976b4ab2/entities/RunClub?limit=1000" -o "$F"
python3 - "$F" <<'EOF'
import json, math, sys
K = (59.4440, 24.7350)  # Kalamaja
def km(lat, lon):
    la1, lo1, la2, lo2 = map(math.radians, (*K, lat, lon))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))
for c in json.load(open(sys.argv[1])):
    if c.get("latitude") is None: continue
    d = km(float(c["latitude"]), float(c["longitude"]))
    if d > 3: continue
    runs = [f'{s["day"]} {s["time"]}' for s in c.get("schedule") or [] if s.get("run_type") != "deleted"]
    print(f'{d:.1f} km | {c["name"]} | ig={c.get("instagram_url")} | strava={c.get("strava_url")} | {runs} | special={c.get("special_runs")}')
EOF
```

- **Only the centre and Põhja-Tallinn.** The user lives in Kalamaja, so for now keep clubs **within
  3 km of Kalamaja**, which is what the snippet does. A club clearly in Põhja-Tallinn but a bit
  further out (Kopli tip, Paljassaare) also counts. On 2026-09-26 this kept We Run Volta,
  Kassisaba, Rotermann, Kopli, Arteri, Hipodroomi, Veerenni and Kadrioru. The next ones out,
  Tondi and Sikupilli, are 3.5 km away and stay out.
- Skip clubs that already have their own bookmark in `Running/` (same Instagram). The bookmark
  covers them.
- A kept club's DB `schedule` is a lead, not the answer. `frequency` and `week_parity` are
  unreliable, and `run_type: "deleted"` means cancelled. Confirm on the club's Instagram exactly
  as above. `special_runs` entries are ordinary one-off candidates.
- DB social links rot: `veerenni.running.club` is dead, and the real handle is `@veerennisork`.
  When a link is dead, search Instagram by club name (logged in:
  `fetch('/web/search/topsearch/?context=blended&query=<name>', {headers: {'x-ig-app-id': '936619743392459'}})`).
  With no Instagram at all (Kassisaba, Arteri), the DB schedule plus the club's `strava_url` is
  all there is. Use the Strava page as the URL, with the same `#date` fragment.
