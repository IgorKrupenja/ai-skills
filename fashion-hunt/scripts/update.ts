#!/usr/bin/env bun
/**
 * Rebuild a fashion-hunt run's report page from what its agents have saved so far, to publish it
 * again while the search is still going. USAGE below says how.
 */

import { parseArgs } from "node:util";

const USAGE = `Rebuild the report page from what the agents have saved so far.

    update.ts <run file> --out <page.html> [--known <search>] [--rate <CUR>=<EUR per unit>]...

Merges the agents' saved listings into the run file (listings.ts merge, with --known and --rate
passed on), gives them variants and new prices (compare.ts, once the brand agent has saved items
or <run dir>/compare.json exists), fetches photos for new listings (photos.ts), puts the design
agent's <run dir>/hero.svg in page.hero once it's there, and builds the page with report.ts
--inline, whose progress panel shows the shops still being searched. Prints how far the search
has got and the page's path, to publish.
`;

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

/** Run one of the skill's scripts, keeping its output to itself unless it fails */
async function step(name: string, args: string[]): Promise<string> {
  const done = await Bun.$`bun ${`${import.meta.dir}/${name}`} ${args}`.quiet().nothrow();
  const out = `${done.stdout.toString()}${done.stderr.toString()}`;
  if (done.exitCode !== 0) die(`${name} failed:\n${out.trim().split("\n").slice(-15).join("\n")}`);
  return out;
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      out: { type: "string" },
      known: { type: "string" },
      rate: { type: "string", multiple: true, default: [] },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });
  const [runFile] = positionals;
  if (values.help || !runFile || positionals.length !== 1 || !values.out) {
    console.log(USAGE);
    return values.help ? 0 : 2;
  }
  const dir = runFile.replace(/\/[^/]*$/, "") || ".";
  await step("listings.ts", ["merge", runFile, ...(values.known ? ["--known", values.known] : []), ...values.rate.flatMap(r => ["--rate", r])]);
  let brandItems = false;
  try {
    for await (const _ of new Bun.Glob("*.json").scan(`${dir}/brand`)) brandItems = true;
  } catch {
    // no brand items saved yet
  }
  const spec = `${dir}/compare.json`;
  const hasSpec = await Bun.file(spec).exists();
  if (brandItems || hasSpec) await step("compare.ts", [runFile, ...(hasSpec ? ["--spec", spec] : [])]);
  await step("photos.ts", [runFile]);
  // The design agent's illustration of the item, once it has saved one
  const hero = Bun.file(`${dir}/hero.svg`);
  if (await hero.exists()) {
    const run = await Bun.file(runFile).json();
    if (!run.page?.hero) {
      run.page = { ...run.page, hero: (await hero.text()).trim() };
      await Bun.write(runFile, JSON.stringify(run, null, 1));
    }
  }
  const built = await step("report.ts", ["--inline", runFile, values.out]);
  const run = await Bun.file(runFile).json();
  const progress = built.match(/^progress: .*$/m)?.[0] ?? "progress: every shop is in";
  console.log(`${progress}; ${run.listings?.length ?? 0} listings; page ${values.out}`);
  return 0;
}

if (import.meta.main) process.exit(await main());
