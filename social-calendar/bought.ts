#!/usr/bin/env bun
/**
 * What the user has already bought: the upcoming events in the PAID calendar (social-calendar skill).
 *
 *   bought.ts    print every upcoming bought event: date, time, title, URL
 *
 * filter.ts and kokandus.ts import it and set bought events apart on their own. Anything else
 * shown or recommended (an ad-hoc list, a single pick, a pasted link) is checked against this
 * output by hand: see SKILL.md, "Already bought?". The PAID calendar is the record of what was
 * bought; state.json `added` holds picks and purchases alike.
 *
 * A failed calendar read throws Unknown: "couldn't check" must never pass for "nothing bought".
 */

import { gwsItems } from "skills-kit/gws.ts";

const DAYS_AHEAD = 400;
/** Every line break a description can hold, Unicode ones included. */
const LINE_BREAK = /\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/;

/** The PAID calendar could not be read, so what is bought is unknown. */
export class Unknown extends Error {}

/** An event in the PAID calendar. `title` is its summary without the price and the [PAID] or [BOOK] tag. */
export type Bought = { date: string; time: string; title: string; summary: string; url: string };

/** The fields of a Calendar API event read here. */
type CalendarEvent = {
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  source?: { url?: string };
};

/** The URL without scheme, `www.` or trailing slash: the key bought events are matched by. */
export function canon(url: string | null | undefined): string {
  // [scheme:][//host][path][?query][#fragment], taken as written: nothing is decoded or resolved.
  // Tabs and newlines inside the URL are dropped, as browsers do.
  const text = (url ?? "").trim().replace(/[\t\n\r]/g, "");
  const [, host = "", path = "", query = "", fragment = ""] =
    /^(?:[A-Za-z][A-Za-z0-9+.-]*:)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/s.exec(text)!;
  return (
    host.toLowerCase().replace(/^www\./, "") +
    path.replace(/\/+$/, "") +
    (query && `?${query}`) +
    (fragment && `#${fragment}`)
  );
}

/** SOCIAL_CALENDAR_PAID_ID from the environment, else from the skills .env (kokandus.ts runs without it). */
async function calendarId(): Promise<string> {
  if (Bun.env.SOCIAL_CALENDAR_PAID_ID) return Bun.env.SOCIAL_CALENDAR_PAID_ID;
  const env = Bun.file(`${Bun.env.SKILLS_DIR || `${import.meta.dir}/..`}/.env`);
  if (await env.exists()) {
    for (const line of (await env.text()).split("\n")) {
      // A quoted value, or a bare one up to the first space or `#` comment
      const m = /^\s*SOCIAL_CALENDAR_PAID_ID\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s#]*))/.exec(line);
      if (m) return m[1] ?? m[2] ?? m[3] ?? "";
    }
  }
  throw new Unknown("SOCIAL_CALENDAR_PAID_ID is not set");
}

/** Midnight at the start of the local day `days` days from today, as an RFC 3339 timestamp. */
function midnight(days: number): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days).toISOString();
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Every bought event from today on, as {date, time, title, summary, url}, in date order. */
export async function load(): Promise<Bought[]> {
  const calendar = await calendarId();
  let events: CalendarEvent[];
  try {
    // Local midnight today through the end of the last of the DAYS_AHEAD days, with each
    // occurrence of a recurring event on its own.
    const params = {
      calendarId: calendar,
      timeMin: midnight(0),
      timeMax: midnight(DAYS_AHEAD + 1),
      singleEvents: true,
      orderBy: "startTime",
    };
    events = await gwsItems<CalendarEvent>(["calendar", "events", "list", "--params", JSON.stringify(params)]);
  } catch (e) {
    throw new Unknown((e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300));
  }
  const out = events.map((e): Bought => {
    const when = e.start?.dateTime || e.start?.date || "";
    const summary = e.summary ?? "";
    const lines = (e.description ?? "").split(LINE_BREAK);
    // "Title · 60€ [PAID]" -> "Title"
    const title = summary.replace(/\s*\[(PAID|BOOK)\]\s*$/, "").replace(/\s+·\s+[^·]*$/, "");
    const url = e.source?.url || lines[2]?.trim() || "";
    return { date: when.slice(0, 10), time: when.slice(11, 16), title, summary, url };
  });
  return out.sort((a, b) => compare(a.date, b.date) || compare(a.time, b.time));
}

async function main(): Promise<number> {
  let events: Bought[];
  try {
    events = await load();
  } catch (e) {
    if (!(e instanceof Unknown)) throw e;
    console.log(`WARNING: could not read the PAID calendar (${e.message}). What is bought is UNKNOWN, not empty.`);
    return 1;
  }
  console.log(`bought: ${events.length} upcoming in the PAID calendar`);
  for (const b of events) console.log(`  ${b.date} ${b.time || "all day"} | ${b.summary} | ${b.url || "no URL"}`);
  return 0;
}

if (import.meta.main) process.exit(await main());
