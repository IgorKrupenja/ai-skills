#!/usr/bin/env bun
// Hide crawl candidates the user already bought or that state.json says not to show again
// (social-calendar skill). USAGE is the full description; a wrong call prints it.

import { canon, load as loadBought, Unknown, type Bought } from "./bought.ts";

const USAGE = `Hide crawl candidates the user already bought or that state.json says not to show again (social-calendar skill).

  filter.ts <candidates.json>   filter a JSON array of {title, date, url, source_url, location}
  filter.ts normalize <text>    print the normalized text: the \`match\` key for a banned series

A candidate is hidden when it is already bought (an event in the PAID calendar, read through
bought.ts, with the same URL, or on the same date with one title inside the other), when its
url is in \`added\` or \`declined\`, or when a \`banned_series\` entry's \`match\` occurs in its
normalized title and the entry's \`source\` is "*" or the candidate's \`source_url\`. Prints
\`SHOW n / HIDE m\` with the count per reason, one line per hidden candidate, then the
candidates to show as JSON. When the PAID calendar can't be read, a WARNING line comes first.
`;

const STATE_PATH = `${import.meta.dir}/state.json`;

type Candidate = { title?: string; date?: string; url: string; source_url?: string; location?: string };
type Ban = { match?: string; label?: string; source?: string };
type State = { added?: { url: string }[]; declined?: { url: string }[]; banned_series?: Ban[] };

/** Lowercase; drop numbers (vol 12, years, dates), punctuation and emoji; keep RU/ET/EN words. */
export function normalize(text: string | null | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/[#№]/g, " ")
    .replace(/\p{Nd}+/gu, " ")
    .replace(/[^\p{L}\p{N}_\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Length in characters, so a letter outside the BMP (math bold 𝐌) counts once. */
const length = (text: string) => [...text].length;

async function loadState(): Promise<State> {
  const file = Bun.file(STATE_PATH);
  return (await file.exists()) ? await file.json() : {};
}

/** The bought event this candidate is: the same URL, or the same date with one title inside the other. */
function boughtMatch(c: Candidate, paid: Bought[]): Bought | undefined {
  const title = normalize(c.title);
  return paid.find(b => {
    if (canon(c.url) === canon(b.url)) return true;
    const other = normalize(b.title);
    const [short, long] = length(title) <= length(other) ? [title, other] : [other, title];
    return c.date === b.date && length(short) >= 8 && long.includes(short);
  });
}

async function main(argv: string[]): Promise<number> {
  if (argv.length >= 2 && argv[0] === "normalize") {
    console.log(normalize(argv.slice(1).join(" ")));
    return 0;
  }
  if (argv.length !== 1) {
    console.error(USAGE);
    return 1;
  }
  const state = await loadState();
  const added = new Set(state.added?.map(e => e.url));
  const declined = new Set(state.declined?.map(e => e.url));
  const bans = (state.banned_series ?? []).filter(b => b.match);
  let paid: Bought[] = [];
  try {
    paid = await loadBought();
  } catch (e) {
    if (!(e instanceof Unknown)) throw e;
    console.log(`WARNING: could not read the PAID calendar (${e.message}). Nothing was checked for being bought.`);
  }
  const show: Candidate[] = [];
  const hidden: { c: Candidate; reason: string; why: string }[] = [];
  const candidates: Candidate[] = await Bun.file(argv[0]!).json();
  for (const c of candidates) {
    const title = normalize(c.title);
    const ban = bans.find(b => (b.source === "*" || b.source === c.source_url) && title.includes(b.match!));
    const have = boughtMatch(c, paid);
    if (have) hidden.push({ c, reason: "already bought", why: `already bought: ${have.summary}, ${have.date}` });
    else if (added.has(c.url)) hidden.push({ c, reason: "already added", why: "already added" });
    else if (declined.has(c.url)) hidden.push({ c, reason: "declined", why: "declined" });
    else if (ban) hidden.push({ c, reason: "banned series", why: `banned series «${ban.label}»` });
    else show.push(c);
  }
  const counts = new Map<string, number>();
  for (const { reason } of hidden) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  const summary = [...counts].map(([reason, n]) => `${reason} ${n}`).join(", ");
  console.log(`SHOW ${show.length} / HIDE ${hidden.length}` + (summary ? ` (${summary})` : ""));
  for (const { c, why } of hidden) console.log(`  hidden: ${c.title} (${why})`);
  console.log(JSON.stringify(show, null, 2));
  return 0;
}

if (import.meta.main) process.exit(await main(Bun.argv.slice(2)));
