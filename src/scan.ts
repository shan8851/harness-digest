// A scan: the whole find-and-judge pipeline, run Monday and Thursday.
//
//   seed sweep → explore → for each candidate: fetch → freshness → summarise → judge → verify
//   then: memory, the week's pool and the run log (all under generated/; see PATHS)
//
// No email: the weekly issue (src/weekly.ts) picks from the pool on Sunday.
//
//   pnpm scan

import { MODELS, PATHS, RUN_LIMITS, SCAN } from "../config/settings.js";
import { loadSeen, pruneSeen, saveSeen, type SeenEntry } from "./lib/dedupe.js";
import { appendPool, fromExplore, isoWeek, loadPool, weakestTheme } from "./lib/pool.js";
import { finishRun, lookbackFrom, newRunLog, readRunLogs, recordPhase, writeRunLog, type ScanCounts } from "./lib/runLog.js";
import { loadSeeds } from "./lib/sources.js";
import { addUsage, describeUsage, totalTokens, ZERO_USAGE } from "./lib/usage.js";
import { runExplore } from "./phases/explore.js";
import { mapLimited, processItem, type ItemResult } from "./phases/item.js";
import { sweepSeeds, type Candidate } from "./phases/seedSweep.js";

const SEEN_PATH = PATHS.memory;
const POOL_DIR = PATHS.pool;
const RUNS_DIR = PATHS.runs;

const now = new Date();
const logs = await readRunLogs(RUNS_DIR);
const log = newRunLog("scan", now);
const since = lookbackFrom(logs, now);
log.lookbackFrom = since.toISOString();

const seen = pruneSeen(await loadSeen(SEEN_PATH), now);
const week = isoWeek(now);
const pool = await loadPool(POOL_DIR, week);
const weakest = weakestTheme(pool);
const previousScan = logs.filter((l) => l.kind === "scan").at(-1);
const { seeds, seedSources } = await loadSeeds();
console.log(`Scan ${log.id}: looking back to ${log.lookbackFrom} · ${seen.length} links in memory · weakest theme this week: ${weakest}\n`);

// 1. Seed sweep: free.
let started = new Date();
const sweep = await sweepSeeds(seeds, { since, seen });
const failedSeeds = sweep.reports.filter((r) => r.error);
for (const r of failedSeeds) log.warnings.push(`seed "${r.name}" failed: ${r.error}`);
recordPhase(log, { name: "seed sweep", model: null, startedAt: started, notes: [`${sweep.candidates.length} candidates from ${seeds.length - failedSeeds.length}/${seeds.length} seeds`] }, new Date());
console.log(`seed sweep: ${sweep.candidates.length} candidates`);

// 2. Explore: the forced wider search. If it fails outright, the scan
// carries on with the seed candidates and the log says so.
started = new Date();
let exploreCandidates: Candidate[] = [];
try {
  const explore = await runExplore({
    since,
    seen: [...seen, ...sweep.candidates],
    seedSources,
    weakestTheme: weakest,
    previousQueries: previousScan?.explore?.queriesByTheme ?? {},
  });
  exploreCandidates = explore.candidates;
  log.quotas = explore.quotas;
  log.explore = { queriesByTheme: explore.searchesByTheme, retries: explore.retries, weakestTheme: weakest };
  recordPhase(
    log,
    { name: "explore", model: MODELS.explore, startedAt: started, usage: explore.usage, notes: [`${explore.retries} retries`, ...explore.runs.flatMap((r) => r.notes.map((n) => `${r.theme}: ${n}`))] },
    new Date(),
  );
  console.log(`explore: ${exploreCandidates.length} candidates · quotas ${explore.quotas.met ? "met" : "short: " + explore.quotas.shortfalls.join("; ")}`);
} catch (error) {
  log.errors.push({ phase: "explore", message: (error as Error).message.split("\n")[0]!.slice(0, 200) });
  console.log(`explore failed: ${(error as Error).message}`);
}

// 3. Each candidate through fetch → freshness → summarise → judge → verify.
// The token guard is checked before starting each item, so a runaway run
// stops spending but keeps everything already done.
const candidates = [...sweep.candidates, ...exploreCandidates];
let tokensSoFar = totalTokens(log.totals);
let skippedForLimit = 0;
started = new Date();
const results = await mapLimited(candidates, SCAN.concurrency, async (candidate): Promise<[Candidate, ItemResult | null]> => {
  if (tokensSoFar >= RUN_LIMITS.maxTokensPerRun) {
    skippedForLimit++;
    return [candidate, null];
  }
  const result = await processItem(candidate.url, { now, checkAge: true, title: candidate.title });
  tokensSoFar += totalTokens(result.summariseUsage) + totalTokens(result.judgeUsage);
  // Save each pass straight away: the cards are the expensive part.
  if (result.item) {
    await appendPool(POOL_DIR, week, [{ ...result.item, key: candidate.key, foundBy: candidate.foundBy, source: candidate.source, scannedAt: now.toISOString() }]);
  }
  const mark = { kept: "✓", rejected: "✗", unfetchable: "–", stale: "–", error: "!" }[result.status];
  console.log(`${mark} ${candidate.url}\n    ${result.status}: ${result.reason}`);
  return [candidate, result];
});
const finished = new Date();
if (skippedForLimit) log.warnings.push(`token limit reached: ${skippedForLimit} candidates skipped (they'll be found again next scan)`);

const done = results.flatMap(([c, r]) => (r ? [[c, r] as const] : []));
const sum = (pick: (r: ItemResult) => typeof ZERO_USAGE) => done.reduce((total, [, r]) => addUsage(total, pick(r)), ZERO_USAGE);
// Summarise and judge run interleaved per item, so both phases show the item stage's wall time.
recordPhase(log, { name: "summarise", model: MODELS.summarise, startedAt: started, usage: sum((r) => r.summariseUsage), notes: done.flatMap(([c, r]) => r.notes.map((n) => `${c.url}: ${n}`)) }, finished);
recordPhase(log, { name: "judge", model: MODELS.judge, startedAt: started, usage: sum((r) => r.judgeUsage) }, finished);
for (const [c, r] of done) {
  for (const w of r.warnings) log.warnings.push(`${c.url}: ${w}`);
  if (r.status === "error") log.warnings.push(`${c.url}: item error, will retry next scan: ${r.reason}`);
}

// 4. Store: memory, the week's pool, the run log.
started = new Date();
const firstSeen = now.toISOString();
const remembered: SeenEntry[] = done
  .filter(([, r]) => r.status !== "error") // errors aren't remembered, so they're retried
  .map(([c, r]) => ({ key: c.key, url: c.url, title: r.title, firstSeen, status: r.status === "kept" ? "passed" : "rejected" }));
try {
  await saveSeen(SEEN_PATH, [...seen, ...remembered]);
} catch (error) {
  // Passes are already in the pool; losing memory only means some re-judging next scan.
  log.errors.push({ phase: "store", message: `couldn't save memory: ${(error as Error).message}` });
}
const kept = done.filter(([, r]) => r.item).map(([c]) => c);

const count = (status: ItemResult["status"]) => done.filter(([, r]) => r.status === status).length;
const counts: ScanCounts = {
  fromSeeds: sweep.candidates.length,
  fromExplore: exploreCandidates.length,
  unfetchable: count("unfetchable"),
  stale: count("stale"),
  judged: count("kept") + count("rejected"),
  rejected: count("rejected"),
  kept: kept.length,
  errors: count("error"),
  skippedForLimit,
};
log.counts = counts;
recordPhase(log, { name: "store", model: null, startedAt: started, notes: [`${remembered.length} added to memory`, `${kept.length} added to the ${week} pool as they passed (${kept.filter(fromExplore).length} from explore)`] }, new Date());

finishRun(log, new Date());
const logPath = await writeRunLog(RUNS_DIR, log);
console.log(
  `\n${log.summary}\n` +
    `found ${counts.fromSeeds} from seeds + ${counts.fromExplore} from explore · ${counts.unfetchable} unfetchable · ${counts.stale} stale · ${counts.judged} judged · ${counts.kept} kept · ${counts.errors} errors\n` +
    `tokens: ${describeUsage(log.totals)}\nlog: ${logPath}`,
);
// Only a phase-level failure fails the run (and the workflow). Item errors are warnings and retry next scan.
process.exitCode = log.errors.length ? 1 : 0;
