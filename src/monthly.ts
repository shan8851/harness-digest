// The monthly issue, run on the 1st: picks the best of last month's pool,
// writes issues/<YYYY-MM>.md, emails it, and marks the picks as featured in memory.
//
//   pnpm monthly             the real thing
//   pnpm monthly --dry-run   builds the issue without side effects: no email,
//                            nothing marked featured, and the issue and run log
//                            go to generated/local/ instead of issues/ and runs/
//   pnpm monthly --dry-run --as-of 2026-12-01
//                            the same, as if it were that date (any day in a
//                            month builds the issue for the month before)

import { mkdir, writeFile } from "node:fs/promises";
import { ISSUE, MODELS, PATHS } from "../config/settings.js";
import { renderHtml, renderMarkdown, renderText } from "./issue/render.js";
import { loadSeen, saveSeen } from "./lib/dedupe.js";
import { sendEmail } from "./lib/email.js";
import { issueExists } from "./lib/issues.js";
import { monthKey, monthName, previousMonth } from "./lib/months.js";
import { dropSameIdea, isPodcast, loadPool, pickBonus, pickIssue, rankPool } from "./lib/pool.js";
import { finishRun, newRunLog, readRunLogs, recordPhase, writeRunLog } from "./lib/runLog.js";
import { addUsage, describeUsage, ZERO_USAGE } from "./lib/usage.js";
import { writeIntro } from "./phases/intro.js";
import { groupSameIdea } from "./phases/sameIdea.js";

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
// Sent on the 1st, so it covers the month that just ended.
const month = previousMonth(now);
const log = newRunLog("monthly", now);

// One issue per month. If this month's has already gone out, don't send a
// second one or overwrite the archive.
if (!dryRun && (await issueExists(PATHS.issues, month))) {
  log.warnings.push(`the ${month} issue was already sent; skipped`);
  finishRun(log, clock());
  const logPath = await writeRunLog(runsDir, log);
  console.log(`${month} issue already sent; nothing to do.\n${log.summary}\nlog: ${logPath}`);
  process.exit(0);
}

const seen = await loadSeen(SEEN_PATH);
const featured = new Set(seen.filter((e) => e.status === "featured").map((e) => e.key));
const pool = (await loadPool(PATHS.pool, month)).filter((e) => !featured.has(e.key));

// One card per idea: the top of the ranking goes to a small model that groups
// near-duplicates, and code keeps the best of each group. If the check fails,
// the issue goes out without it (title matching in pickIssue still applies).
let candidates = pool;
let started = clock();
try {
  const top = rankPool(candidates.filter((e) => !isPodcast(e))).slice(0, ISSUE.sameIdeaWindow);
  const { groups, reasons, usage } = await groupSameIdea(top);
  const { kept, dropped } = dropSameIdea(candidates, groups);
  if (ISSUE.sameIdeaMode === "drop") candidates = kept;
  const verb = ISSUE.sameIdeaMode === "drop" ? "dropped" : "would drop (log mode)";
  recordPhase(
    log,
    { name: "same idea", model: MODELS.sameIdea, startedAt: started, usage, notes: [...reasons.map((r) => `group: ${r}`), ...dropped.map((d) => `${verb} ${d.key} (same idea as ${d.keptInstead})`)] },
    clock(),
  );
} catch (error) {
  log.warnings.push(`same-idea check failed, skipped: ${(error as Error).message.split("\n")[0]!.slice(0, 200)}`);
}
const picks = pickIssue(candidates);
const bonus = pickBonus(candidates);

// The health line: how the month's scans went, so silence or a thin issue is explainable.
const logs = await readRunLogs(PATHS.runs);
// November 2026 started weekly: its early scans fed weekly issues and were
// counted there, so only scans after the last weekly issue count here.
const lastWeekly = logs.filter((l) => l.kind === "weekly").at(-1)?.startedAt ?? "";
const scans = logs.filter((l) => l.kind === "scan" && monthKey(new Date(l.startedAt)) === month && l.startedAt > lastWeekly);
const failed = scans.filter((l) => l.status === "failed").length;
const short = scans.filter((l) => l.quotas && !l.quotas.met).length;
const monthTokens = scans.reduce((total, l) => addUsage(total, l.totals), ZERO_USAGE);
const health = `${scans.length} scans · ${failed} failed · ${short} explore shortfall(s) · ${pool.length} passed the judge · ${describeUsage(monthTokens)}`;

started = clock();
let intro = "Nothing cleared the bar this month. The scans ran, but the judge didn't pass anything worth your time.";
if (picks.length) {
  const written = await writeIntro(picks);
  intro = written.intro;
  recordPhase(log, { name: "intro", model: MODELS.issueIntro, startedAt: started, usage: written.usage }, clock());
}

const issue = { title: `harness-digest · ${monthName(month)}`, intro, items: picks, bonus, health };
await mkdir(issuesDir, { recursive: true });
const issuePath = `${issuesDir}/${month}${dryRun ? "-dry-run" : ""}.md`;
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
  const pickedKeys = new Set([...picks, ...bonus].map((p) => p.key));
  await saveSeen(SEEN_PATH, seen.map((e) => (pickedKeys.has(e.key) ? { ...e, status: "featured" as const } : e)));
}

finishRun(log, clock());
const logPath = await writeRunLog(runsDir, log);
console.log(`${dryRun ? "[dry run] " : ""}${issue.title}: ${picks.length} items${bonus.length ? ` + ${bonus.length} bonus` : ""} from a pool of ${pool.length}\nissue: ${issuePath}\n${log.summary}\nlog: ${logPath}`);
process.exitCode = log.errors.length ? 1 : 0;
