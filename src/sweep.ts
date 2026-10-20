// Runs the seed sweep on its own and prints what it found. Read-only: it
// doesn't write memory or logs, and makes no model calls, so it's free to run
// as often as you like.
//
//   pnpm sweep

import { PATHS } from "../config/settings.js";
import { loadSeen } from "./lib/dedupe.js";
import { lookbackFrom, readRunLogs } from "./lib/runLog.js";
import { loadSeeds } from "./lib/sources.js";
import { sweepSeeds } from "./phases/seedSweep.js";

const { seeds } = await loadSeeds();
const now = new Date();
const since = lookbackFrom(await readRunLogs(PATHS.runs), now);
const seen = await loadSeen(PATHS.memory);

console.log(`Sweeping ${seeds.length} seeds for anything since ${since.toISOString()} (${seen.length} links in memory)\n`);
const { candidates, reports } = await sweepSeeds(seeds, { since, seen });

for (const report of reports) {
  const kept = candidates.filter((c) => c.foundBy === report.name).length;
  console.log(report.error ? `  ✗ ${report.name}: ${report.error}` : `  ${report.name}: ${report.found} in window, ${kept} new`);
}
console.log(`\n${candidates.length} candidates:`);
for (const c of candidates) console.log(`  ${c.published?.slice(0, 10) ?? "undated   "}  ${c.title.slice(0, 70)}\n              ${c.url}`);
