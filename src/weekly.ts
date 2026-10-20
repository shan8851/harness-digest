// The weekly issue, run on Sunday: picks the best of the week's pool, writes
// issues/<week>.md, emails it, and marks the picks as featured in memory.
//
//   pnpm weekly [--no-email]

import { mkdir, writeFile } from "node:fs/promises";
import { MODELS, PATHS } from "../config/settings.js";
import { renderHtml, renderMarkdown, renderText } from "./issue/render.js";
import { loadSeen, saveSeen } from "./lib/dedupe.js";
import { sendEmail } from "./lib/email.js";
import { isoWeek, loadPool, pickIssue } from "./lib/pool.js";
import { finishRun, newRunLog, readRunLogs, recordPhase, writeRunLog } from "./lib/runLog.js";
import { addUsage, describeUsage, ZERO_USAGE } from "./lib/usage.js";
import { writeIntro } from "./phases/intro.js";

const SEEN_PATH = PATHS.memory;
const sendMail = !process.argv.includes("--no-email");

const now = new Date();
const week = isoWeek(now);
const log = newRunLog("weekly", now);

const seen = await loadSeen(SEEN_PATH);
const featured = new Set(seen.filter((e) => e.status === "featured").map((e) => e.key));
const pool = (await loadPool(PATHS.pool, week)).filter((e) => !featured.has(e.key));
const picks = pickIssue(pool);

// The health line: how the week's scans went, so silence or a thin issue is explainable.
const scans = (await readRunLogs(PATHS.runs)).filter((l) => l.kind === "scan" && isoWeek(new Date(l.startedAt)) === week);
const failed = scans.filter((l) => l.status === "failed").length;
const short = scans.filter((l) => l.quotas && !l.quotas.met).length;
const weekTokens = scans.reduce((total, l) => addUsage(total, l.totals), ZERO_USAGE);
const health = `${scans.length} scans · ${failed} failed · ${short} explore shortfall(s) · ${pool.length} passed the judge · ${describeUsage(weekTokens)}`;

let started = new Date();
let intro = "Nothing cleared the bar this week. The scans ran, but the judge didn't pass anything worth your time.";
if (picks.length) {
  const written = await writeIntro(picks);
  intro = written.intro;
  recordPhase(log, { name: "intro", model: MODELS.weeklyIntro, startedAt: started, usage: written.usage }, new Date());
}

const issue = { title: `harness-digest · ${week}`, intro, items: picks, health };
await mkdir(PATHS.issues, { recursive: true });
const issuePath = `${PATHS.issues}/${week}.md`;
await writeFile(issuePath, renderMarkdown(issue), "utf8");

started = new Date();
if (sendMail) {
  try {
    const id = await sendEmail({ subject: issue.title, html: renderHtml(issue), text: renderText(issue) });
    recordPhase(log, { name: "email", model: null, startedAt: started, notes: [`sent (Resend id ${id})`] }, new Date());
  } catch (error) {
    log.errors.push({ phase: "email", message: (error as Error).message });
  }
}

// Mark the picks as featured, so they can't appear in a later issue.
const pickedKeys = new Set(picks.map((p) => p.key));
await saveSeen(SEEN_PATH, seen.map((e) => (pickedKeys.has(e.key) ? { ...e, status: "featured" as const } : e)));

finishRun(log, new Date());
const logPath = await writeRunLog(PATHS.runs, log);
console.log(`${issue.title}: ${picks.length} items from a pool of ${pool.length}\nissue: ${issuePath}\n${log.summary}\nlog: ${logPath}`);
process.exitCode = log.errors.length ? 1 : 0;
