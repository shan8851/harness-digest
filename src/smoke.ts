// End-to-end smoke test: fetch → summarise → judge → verify → render → email,
// on a handful of URLs you pass in. Runs locally with keys from .env.
//
//   pnpm smoke <url> [<url> ...] [--no-email]
//
// It writes its run log to runs/local/ and its issue to issues/local/ (both
// git-ignored), prints a one-line result per URL, and emails the issue,
// including a "Judged out" section so you can see the judge's reasoning.

import { mkdir, writeFile } from "node:fs/promises";
import { ITEMS, MODELS } from "../config/settings.js";
import { renderHtml, renderMarkdown, renderText, type IssueItem } from "./issue/render.js";
import { sendEmail } from "./lib/email.js";
import { fetchPage } from "./lib/page.js";
import { finishRun, newRunLog, recordPhase, writeRunLog } from "./lib/runLog.js";
import { addUsage, describeUsage, ZERO_USAGE } from "./lib/usage.js";
import { judge } from "./phases/judge.js";
import { summarise } from "./phases/summarise.js";
import { checkCard, quoteProblems, verifyItem } from "./phases/verify.js";

const args = process.argv.slice(2);
const urls = args.filter((a) => !a.startsWith("--"));
const sendMail = !args.includes("--no-email");
if (urls.length === 0) {
  console.error("Usage: pnpm smoke <url> [<url> ...] [--no-email]");
  process.exit(1);
}

const log = newRunLog("smoke", new Date());
const accepted: IssueItem[] = [];
const rejected: { url: string; reason: string }[] = [];

// Usage and timing are pooled per phase across all URLs, so the run log has
// one line per phase rather than one per URL per phase.
const pooled = {
  fetch: { started: new Date(), notes: [] as string[] },
  summarise: { usage: ZERO_USAGE, started: new Date(), ms: 0, notes: [] as string[] },
  judge: { usage: ZERO_USAGE, started: new Date(), ms: 0 },
};

for (const url of urls) {
  const page = await fetchPage(url);
  if (!page.ok) {
    rejected.push({ url, reason: `couldn't fetch: ${page.reason}` });
    pooled.fetch.notes.push(`${url}: ${page.reason}`);
    console.log(`✗ ${url}\n    couldn't fetch: ${page.reason}`);
    continue;
  }
  if (page.truncated) pooled.fetch.notes.push(`${url}: page text truncated`);

  try {
    let t = Date.now();
    let { summary, usage: summariseUsage } = await summarise(page);
    pooled.summarise.usage = addUsage(pooled.summarise.usage, summariseUsage);

    // Tidy the card before the judge sees it: if its shape is off, send it
    // back with the exact problems. Presentation never drops an item, so
    // anything still off afterwards is kept and logged as a warning.
    for (let attempt = 0; attempt < ITEMS.maxCardRevisions; attempt++) {
      const cardProblems = checkCard(summary, page.text);
      if (cardProblems.length === 0) break;
      pooled.summarise.notes.push(`${url}: revised for ${cardProblems.join("; ")}`);
      ({ summary, usage: summariseUsage } = await summarise(page, { previous: summary, problems: cardProblems }));
      pooled.summarise.usage = addUsage(pooled.summarise.usage, summariseUsage);
    }
    const leftover = checkCard(summary, page.text);
    if (leftover.length) log.warnings.push(`${url}: kept with card issues: ${leftover.join("; ")}`);
    // A quote that's too long or not on the page is removed, never the item.
    if (quoteProblems(summary.quote, page.text).length) summary = { ...summary, quote: "" };
    pooled.summarise.ms += Date.now() - t;

    t = Date.now();
    const { verdict, usage: judgeUsage } = await judge({ url: page.finalUrl, summary, pageText: page.text });
    pooled.judge.ms += Date.now() - t;
    pooled.judge.usage = addUsage(pooled.judge.usage, judgeUsage);

    const problems = verifyItem({ summary, verdict, pageText: page.text, publishedDate: page.publishedDate }, { now: new Date(), checkAge: false });
    if (problems.length === 0) {
      accepted.push({ url: page.finalUrl, summary, verdict, publishedDate: page.publishedDate });
      console.log(`✓ ${url}\n    ${verdict.score}/10 · ${verdict.theme} · ${verdict.reason}\n    steal this: ${summary.stealThis}`);
    } else {
      rejected.push({ url, reason: problems.join("; ") });
      console.log(`✗ ${url}\n    ${verdict.score}/10 · ${problems.join("; ")}`);
    }
  } catch (error) {
    // SDK errors can carry multi-line JSON; keep the log to one readable line.
    const message = (error as Error).message.split("\n")[0]!.slice(0, 200);
    log.errors.push({ phase: "item", message: `${url}: ${message}` });
    rejected.push({ url, reason: `error: ${message}` });
    console.log(`! ${url}\n    error: ${message}`);
  }
}

const now = new Date();
const since = (ms: number) => new Date(now.getTime() - ms);
recordPhase(log, { name: "fetch", model: null, startedAt: pooled.fetch.started, notes: pooled.fetch.notes }, pooled.fetch.started);
recordPhase(log, { name: "summarise", model: MODELS.summarise, startedAt: since(pooled.summarise.ms), usage: pooled.summarise.usage, notes: pooled.summarise.notes }, now);
recordPhase(log, { name: "judge", model: MODELS.judge, startedAt: since(pooled.judge.ms), usage: pooled.judge.usage }, now);

const stamp = log.id.replace(/-smoke$/, "");
const issue = {
  title: `harness-digest · smoke test ${stamp}`,
  intro: `Smoke test on ${urls.length} hand-picked link(s): ${accepted.length} passed, ${rejected.length} judged out.`,
  items: accepted,
  rejected,
  health: `this run: ${describeUsage(log.totals)}`,
};

await mkdir("issues/local", { recursive: true });
const issuePath = `issues/local/${stamp}-smoke.md`;
const markdown = renderMarkdown(issue);
await writeFile(issuePath, markdown, "utf8");

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
const logPath = await writeRunLog("runs/local", log);
console.log(`\n${log.summary}\nissue: ${issuePath}\nlog:   ${logPath}`);
process.exitCode = log.errors.length ? 1 : 0;
