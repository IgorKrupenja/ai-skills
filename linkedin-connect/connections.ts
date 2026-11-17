#!/usr/bin/env bun
/**
 * Count the user's LinkedIn connections and keep the counts as a history.
 *
 * linkedin-connect and linkedin-grow run this before they send any invite. It reads the count off
 * LinkedIn's connections page in a background tab of the ai-skills browser (skills-kit's tab.ts),
 * prints it with the change since the previous count, and appends a line to connections.ndjson
 * next to this script: the time, the skill about to run and the count. The file is personal, so
 * it's git-ignored.
 *
 *     bun connections.ts linkedin-connect            # count, print, and append to connections.ndjson
 *     bun connections.ts linkedin-connect --dry-run  # count and print, but don't write
 */

import { appendFile } from "node:fs/promises"; // Bun.write can't append
import { parseArgs } from "node:util";
import type { Page } from "playwright-core";

const HISTORY = `${import.meta.dir}/connections.ndjson`;
const TAB = `${import.meta.dir}/../node_modules/skills-kit/src/tab.ts`;
const PAGE = "https://www.linkedin.com/mynetwork/invite-connect/connections/";
const SKILLS = ["linkedin-connect", "linkedin-grow"];

/** A line of connections.ndjson. */
type Entry = { ts: string; skill: string; connections: number };
/** What readLine returns. */
type Read = { line: string | null; url: string };

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

/**
 * Runs in the tab, sent as source text, so it must stay self-contained: the page's
 * "1,481 connections" line, which takes a few seconds to render, or null after 20 s.
 */
async function readLine(p: Page): Promise<Read> {
  for (let i = 0; i < 20; i++) {
    const text = await p.locator("body").innerText().catch(() => "");
    const line = text.split("\n").map(l => l.trim()).find(l => /^\d[\d,.\s]*connections?$/i.test(l));
    if (line) return { line, url: p.url() };
    await p.waitForTimeout(1000);
  }
  return { line: null, url: p.url() };
}

/** The connection count, read in a tab opened for this call only. Throws when it can't be read. */
async function readCount(): Promise<number> {
  const tag = `li-count-${Math.random().toString(36).slice(2, 8)}`;
  const opened = await Bun.$`${process.execPath} ${TAB} open ${tag} ${PAGE}`.quiet().nothrow();
  if (opened.exitCode !== 0) throw new Error(`couldn't open LinkedIn in the ai-skills browser: ${opened.stderr.toString().trim()}`);
  try {
    const ran = await Bun.$`${process.execPath} ${TAB} run ${tag} < ${new Response(readLine.toString())}`.quiet().nothrow();
    if (ran.exitCode !== 0) throw new Error(`reading the connections page failed: ${ran.stderr.toString().trim()}`);
    const { line, url } = JSON.parse(ran.stdout.toString()) as Read;
    if (line) return Number(line.replace(/\D/g, ""));
    throw new Error(/login|authwall|checkpoint|signup/.test(url)
      ? `LinkedIn asks to sign in (${url}): have the user sign in to LinkedIn in the ai-skills browser window, then run this again.`
      : `no "<number> connections" line on ${url}: LinkedIn may have changed the page.`);
  } finally {
    await Bun.$`${process.execPath} ${TAB} close ${tag}`.quiet().nothrow();
  }
}

/** connections.ndjson's last entry, or null before the first. */
async function lastEntry(): Promise<Entry | null> {
  const file = Bun.file(HISTORY);
  if (!(await file.exists())) return null;
  const last = (await file.text()).split("\n").filter(l => l.trim()).at(-1);
  return last ? (JSON.parse(last) as Entry) : null;
}

const fmt = (n: number) => n.toLocaleString("en-US");
/** An ISO timestamp as local date and time, like 2026-11-17 19:30. */
const when = (ts: string) => new Date(ts).toLocaleString("sv-SE").slice(0, 16);

/** The line for the user: the count and the change since the previous entry. */
function report(now: Entry, before: Entry | null): string {
  const head = `${fmt(now.connections)} connections`;
  if (!before) return `${head} (the first count in the history)`;
  const diff = now.connections - before.connections;
  const change = diff === 0 ? "no change" : `${diff > 0 ? "+" : "-"}${fmt(Math.abs(diff))}`;
  return `${head}, ${change} since ${when(before.ts)} (before ${before.skill})`;
}

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: { "dry-run": { type: "boolean" } },
  allowPositionals: true,
});
const skill = positionals[0];
if (!skill || !SKILLS.includes(skill)) die(`usage: bun connections.ts <${SKILLS.join(" | ")}> [--dry-run]`);

const before = await lastEntry();
let connections: number;
try {
  connections = await readCount();
} catch (e) {
  die(e instanceof Error ? e.message : String(e));
}
const entry: Entry = { ts: new Date().toISOString(), skill, connections };
if (!values["dry-run"]) await appendFile(HISTORY, `${JSON.stringify(entry)}\n`);
console.log(report(entry, before) + (values["dry-run"] ? " (dry run, not saved)" : ""));
