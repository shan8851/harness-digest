// Runs the explore phase on its own and prints what it found. Read-only: it
// doesn't write memory. It runs the (free) seed sweep first so explore skips
// what the seeds already found, exactly as a real scan will.
//
// Costs real tokens and web searches (roughly 50 cents).
//
//   pnpm explore

import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { Theme } from "../config/settings.js";
import { loadSeen } from "./lib/dedupe.js";
import { lookbackFrom, newRunLog, readRunLogs } from "./lib/runLog.js";
import { sourceOf } from "./lib/urls.js";
import { describeUsage } from "./lib/usage.js";
import { runExplore } from "./phases/explore.js";
import { sweepSeeds, type Seed } from "./phases/seedSweep.js";

const { seeds } = JSON.parse(await readFile("config/sources.json", "utf8")) as { seeds: Seed[] };
const now = new Date();
const since = lookbackFrom(await readRunLogs("runs"), now);
const seen = await loadSeen("state/seen.jsonl");
const seedSources = new Set(seeds.map((s) => sourceOf(s.url)).filter((s): s is string => Boolean(s)));
// Until the scan tracks passes per theme, treat the theme seeds cover least as the weakest.
const weakestTheme: Theme = "non-engineers";

const sweep = await sweepSeeds(seeds, { since, seen });
console.log(`Seed sweep: ${sweep.candidates.length} candidates (excluded from explore)\n`);

const started = Date.now();
const outcome = await runExplore({ since, seen: [...seen, ...sweep.candidates], seedSources, weakestTheme, previousQueries: {} });

for (const run of outcome.runs) {
  console.log(`${run.theme}: ${run.queries.length} searches, ${run.results.length} results, ${run.picks.length} picks`);
  for (const q of run.queries) console.log(`    search: ${q}`);
  for (const n of run.notes) console.log(`    note: ${n}`);
}
console.log(`\nQuotas: ${outcome.quotas.met ? "met" : outcome.quotas.shortfalls.join("; ")} (after ${outcome.retries} retr${outcome.retries === 1 ? "y" : "ies"})`);
console.log(`${outcome.candidates.length} candidates for summarise and judge:`);
for (const c of outcome.candidates) console.log(`  [${c.foundBy.replace("explore: ", "")}] ${c.title.slice(0, 70)}\n      ${c.url}`);
console.log(`\nexplore · ${Math.round((Date.now() - started) / 1000)}s · ${describeUsage(outcome.usage)}`);

await mkdir("runs/local", { recursive: true });
const path = `runs/local/${newRunLog("scan", now).id.replace(/-scan$/, "")}-explore.json`;
await writeFile(path, JSON.stringify(outcome, null, 2) + "\n", "utf8");
console.log(`full outcome: ${path}`);
