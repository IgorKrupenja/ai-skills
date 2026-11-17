#!/usr/bin/env bun
/**
 * Watch a fashion-hunt run's agents finish, for the Monitor tool, which wakes the main chat at each
 * line this prints. USAGE below says how.
 */

import { parseArgs } from "node:util";

const USAGE = `Print a line as each agent of a run finishes.

    watch.ts <run dir> [--minutes <n>]

Each agent records itself as done in <run dir>/status/<agent id>.json (listings.ts status). This
prints a line for each new one, with its status, and stops once every agent in the run file's
page.progress has finished, second rounds included, or after --minutes (default 60).
`;

type Status = { status?: string; unverified?: number };

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: { minutes: { type: "string" }, help: { type: "boolean", short: "h" } },
    allowPositionals: true,
  });
  const [dir] = positionals;
  if (values.help || !dir || positionals.length !== 1) {
    console.log(USAGE);
    return values.help ? 0 : 2;
  }
  const folder = dir.replace(/\/$/, "");
  const until = Date.now() + Number(values.minutes ?? 60) * 60_000;
  const seen = new Map<string, Status>();
  while (Date.now() < until) {
    try {
      for await (const name of new Bun.Glob("*.json").scan(`${folder}/status`)) {
        const id = name.replace(/\.json$/, "");
        if (seen.has(id)) continue;
        const status = (await Bun.file(`${folder}/status/${name}`).json()) as Status;
        seen.set(id, status);
        console.log(`${id} is done: ${status.status ?? "no status"}${status.unverified ? `, ${status.unverified} links left for a second round` : ""}`);
      }
    } catch {
      // no agent is done yet
    }
    // Done once every planned agent has finished, and its second round where it left links
    const run = await Bun.file(`${folder}/run.json`).json().catch(() => null);
    const plan = run?.page?.progress;
    const agents = new Set<string>([...(plan?.shops ?? []), ...(plan?.brands ?? [])].map((entry: { agent?: string }) => entry.agent).filter((id: unknown): id is string => typeof id === "string" && id !== ""));
    const finished = [...agents].every(id => seen.has(id) && (!(seen.get(id)!.unverified ?? 0) || seen.has(`${id}-2`)));
    if (agents.size && finished) {
      console.log("every agent is done");
      return 0;
    }
    await Bun.sleep(2000);
  }
  console.log(`stopped watching after ${values.minutes ?? 60} minutes`);
  return 0;
}

if (import.meta.main) process.exit(await main());
