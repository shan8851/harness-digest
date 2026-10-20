// The weekly issue, run on Sunday: picks the best of the week's pool, writes
// issues/<week>.md, emails it, and marks the picks as featured in memory.
//
//   pnpm weekly             the real thing
//   pnpm weekly --dry-run   builds the issue without side effects: no email,
//                           nothing marked featured, and the issue and run log
//                           go to generated/local/ instead of issues/ and runs/
//   pnpm weekly --dry-run --as-of 2026-10-26
//                           the same, as if it were that date (for testing carry-over)

import { mkdir, writeFile } from "node:fs/promises";
import { MODELS, PATHS } from "../config/settings.js";
import { renderHtml, renderMarkdown, renderText } from "./issue/render.js";
import { loadSeen, saveSeen } from "./lib/dedupe.js";
import { sendEmail } from "./lib/email.js";
import { issueExists } from "./lib/issues.js";
import { carryOver, isoWeek, loadPool, pickIssue } from "./lib/pool.js";
import { finishRun, newRunLog, readRunLogs, recordPhase, writeRunLog } from "./lib/runLog.js";
import { addUsage, describeUsage, ZERO_USAGE } from "./lib/usage.js";
import { writeIntro } from "./phases/intro.js";

const SEEN_PATH = PATHS.memory;
const dryRun = process.argv.includes("--dry-run");
const issuesDir = dryRun ? PATHS.local : PATHS.issues;
const runsDir = dryRun ? PATHS.local : PATHS.runs;

const asOfIndex = process.argv.indexOf("--as-of");
if (asOfIndex !== -1 && !dryRun) throw new Error("--as-of is only allowed with --dry-run");
const now = asOfIndex === -1 ? new Date() : new Date(process.argv[asOfIndex + 1]!);
// The current time on the run's own clock, so durations stay right under --as-of.
const realStart = Date.now();
const clock = () => new Date(now.getTime() + (Date.now() - realStart));
const week = isoWeek(now);
const log = newRunLog("weekly", now);

// One issue per week. If this week's has already gone out, don't send a second
// one or overwrite the archive; the week's strong passes carry over instead.
if (!dryRun && (await issueExists(PATHS.issues, week))) {
  log.warnings.push(`the ${week} issue was already sent; skipped (strong passes carry over to next week)`);
  finishRun(log, clock());
  const logPath = await writeRunLog(runsDir, log);
  console.log(`${week} issue already sent; nothing to do.\n${log.summary}\nlog: ${logPath}`);
  process.exit(0);
}

const seen = await loadSeen(SEEN_PATH);
const featured = new Set(seen.filter((e) => e.status === "featured").map((e) => e.key));
const pool = (await loadPool(PATHS.pool, week)).filter((e) => !featured.has(e.key));
// Last week's strong unpicked items get one more chance (see WEEKLY.carryOverMinScore).
const lastWeek = isoWeek(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
const carried = carryOver(await loadPool(PATHS.pool, lastWeek), featured);
const picks = pickIssue([...pool, ...carried]);

// The health line: how the week's scans went, so silence or a thin issue is explainable.
const scans = (await readRunLogs(PATHS.runs)).filter((l) => l.kind === "scan" && isoWeek(new Date(l.startedAt)) === week);
const failed = scans.filter((l) => l.status === "failed").length;
const short = scans.filter((l) => l.quotas && !l.quotas.met).length;
const weekTokens = scans.reduce((total, l) => addUsage(total, l.totals), ZERO_USAGE);
const health = `${scans.length} scans · ${failed} failed · ${short} explore shortfall(s) · ${pool.length} passed the judge · ${carried.length} carried over · ${describeUsage(weekTokens)}`;

let started = clock();
let intro = "Nothing cleared the bar this week. The scans ran, but the judge didn't pass anything worth your time.";
if (picks.length) {
  const written = await writeIntro(picks);
  intro = written.intro;
  recordPhase(log, { name: "intro", model: MODELS.weeklyIntro, startedAt: started, usage: written.usage }, clock());
}

const issue = { title: `harness-digest · ${week}`, intro, items: picks, health };
await mkdir(issuesDir, { recursive: true });
const issuePath = `${issuesDir}/${week}${dryRun ? "-dry-run" : ""}.md`;
await writeFile(issuePath, renderMarkdown(issue), "utf8");

started = clock();
if (!dryRun) {
  try {
    const id = await sendEmail({ subject: issue.title, html: renderHtml(issue), text: renderText(issue) });
    recordPhase(log, { name: "email", model: null, startedAt: started, notes: [`sent (Resend id ${id})`] }, clock());
  } catch (error) {
    log.errors.push({ phase: "email", message: (error as Error).message });
  }
}

// Mark the picks as featured, so they can't appear in a later issue.
if (!dryRun) {
  const pickedKeys = new Set(picks.map((p) => p.key));
  await saveSeen(SEEN_PATH, seen.map((e) => (pickedKeys.has(e.key) ? { ...e, status: "featured" as const } : e)));
}

finishRun(log, clock());
const logPath = await writeRunLog(runsDir, log);
console.log(`${dryRun ? "[dry run] " : ""}${issue.title}: ${picks.length} items from a pool of ${pool.length} (+${carried.length} carried over, ${picks.filter((p) => p.carriedOver).length} picked)\nissue: ${issuePath}\n${log.summary}\nlog: ${logPath}`);
process.exitCode = log.errors.length ? 1 : 0;
