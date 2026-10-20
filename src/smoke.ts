// End-to-end smoke test on links you choose: the same per-item pipeline a
// scan uses (fetch → summarise → judge → verify), then render and email.
// Runs locally with keys from .env. The age check is off, so known-good older
// links can be used.
//
//   pnpm smoke <url> [<url> ...] [--no-email]
//
// Writes to generated/local/ (git-ignored), never to
// memory or the pool. The email includes a "Judged out" section so you can
// see the judge's reasoning.

import { mkdir, writeFile } from "node:fs/promises";
import { MODELS, PATHS } from "../config/settings.js";
import { renderHtml, renderMarkdown, renderText, type IssueItem } from "./issue/render.js";
import { sendEmail } from "./lib/email.js";
import { finishRun, newRunLog, recordPhase, writeRunLog } from "./lib/runLog.js";
import { addUsage, describeUsage, ZERO_USAGE } from "./lib/usage.js";
import { processItem } from "./phases/item.js";

const args = process.argv.slice(2);
const urls = args.filter((a) => !a.startsWith("--"));
const sendMail = !args.includes("--no-email");
if (urls.length === 0) {
  console.error("Usage: pnpm smoke <url> [<url> ...] [--no-email]");
  process.exit(1);
}

const now = new Date();
const log = newRunLog("smoke", now);
const accepted: IssueItem[] = [];
const rejected: { url: string; reason: string }[] = [];
let summariseUsage = ZERO_USAGE;
let judgeUsage = ZERO_USAGE;
const notes: string[] = [];

for (const url of urls) {
  const result = await processItem(url, { now, checkAge: false });
  summariseUsage = addUsage(summariseUsage, result.summariseUsage);
  judgeUsage = addUsage(judgeUsage, result.judgeUsage);
  notes.push(...result.notes.map((n) => `${url}: ${n}`));
  log.warnings.push(...result.warnings.map((w) => `${url}: ${w}`));
  if (result.status === "error") log.errors.push({ phase: "item", message: `${url}: ${result.reason}` });
  if (result.item) accepted.push(result.item);
  else rejected.push({ url, reason: result.reason });
  const mark = result.status === "kept" ? "✓" : result.status === "error" ? "!" : "✗";
  console.log(`${mark} ${url}\n    ${result.reason}`);
}

const finished = new Date();
recordPhase(log, { name: "summarise", model: MODELS.summarise, startedAt: now, usage: summariseUsage, notes }, finished);
recordPhase(log, { name: "judge", model: MODELS.judge, startedAt: now, usage: judgeUsage }, finished);

const stamp = log.id.replace(/-smoke$/, "");
const issue = {
  title: `harness-digest · smoke test ${stamp}`,
  intro: `Smoke test on ${urls.length} hand-picked link(s): ${accepted.length} passed, ${rejected.length} judged out.`,
  items: accepted,
  rejected,
  health: `this run: ${describeUsage(log.totals)}`,
};

await mkdir(PATHS.local, { recursive: true });
const issuePath = `${PATHS.local}/${stamp}-smoke.md`;
await writeFile(issuePath, renderMarkdown(issue), "utf8");

if (sendMail) {
  try {
    const id = await sendEmail({ subject: issue.title, html: renderHtml(issue), text: renderText(issue) });
    console.log(`\nemail sent (Resend id ${id})`);
  } catch (error) {
    log.errors.push({ phase: "email", message: (error as Error).message });
    console.log(`\nemail failed: ${(error as Error).message}`);
  }
}

finishRun(log, new Date());
const logPath = await writeRunLog(PATHS.local, log);
console.log(`\n${log.summary}\nissue: ${issuePath}\nlog:   ${logPath}`);
process.exitCode = log.errors.length ? 1 : 0;
