// The per-item pipeline, shared by the scan and the smoke test:
//
//   fetch → freshness → summarise (+ tidy-ups) → judge → verify
//
// Cheap checks run first, so an item only costs model calls once it's been
// fetched and found fresh. Each step that can drop the item says why.

import { ITEMS } from "../../config/settings.js";
import type { IssueItem } from "../issue/render.js";
import { fetchPage } from "../lib/page.js";
import { addUsage, ZERO_USAGE, type UsageTotals } from "../lib/usage.js";
import { judge } from "./judge.js";
import { summarise } from "./summarise.js";
import { checkCard, quoteProblems, tooOld, verifyItem } from "./verify.js";

export type ItemStatus =
  | "kept" // passed the judge and verification
  | "rejected" // judged and failed, or failed verification
  | "unfetchable" // couldn't fetch, blocked, or a JavaScript/sign-in wall
  | "stale" // fetched, but dated older than ITEMS.maxAgeDays
  | "error"; // an API or unexpected error; not remembered, so it's retried next scan

export interface ItemResult {
  url: string;
  status: ItemStatus;
  reason: string;
  item: IssueItem | null; // set when kept
  title: string; // best title we have, for memory
  summariseUsage: UsageTotals;
  judgeUsage: UsageTotals;
  notes: string[]; // e.g. tidy-up passes
  warnings: string[]; // e.g. kept with card issues
}

function oneLine(error: unknown): string {
  // SDK errors can carry multi-line JSON; keep the log to one readable line.
  return (error as Error).message.split("\n")[0]!.slice(0, 200);
}

export async function processItem(url: string, options: { now: Date; checkAge: boolean; title?: string }): Promise<ItemResult> {
  const result: ItemResult = {
    url,
    status: "error",
    reason: "",
    item: null,
    title: options.title ?? url,
    summariseUsage: ZERO_USAGE,
    judgeUsage: ZERO_USAGE,
    notes: [],
    warnings: [],
  };

  const page = await fetchPage(url);
  if (!page.ok) return { ...result, status: "unfetchable", reason: page.reason };
  if (page.title) result.title = page.title;
  if (page.truncated) result.notes.push("page text truncated");

  const age = options.checkAge ? tooOld(page.publishedDate, options.now) : null;
  if (age) return { ...result, status: "stale", reason: age };

  try {
    let { summary, usage } = await summarise(page);
    result.summariseUsage = usage;

    // Tidy the card before the judge sees it. Presentation never drops an
    // item, so anything still off afterwards is kept with a warning.
    for (let attempt = 0; attempt < ITEMS.maxCardRevisions; attempt++) {
      const problems = checkCard(summary, page.text);
      if (problems.length === 0) break;
      result.notes.push(`revised for ${problems.join("; ")}`);
      ({ summary, usage } = await summarise(page, { previous: summary, problems }));
      result.summariseUsage = addUsage(result.summariseUsage, usage);
    }
    const leftover = checkCard(summary, page.text);
    if (leftover.length) result.warnings.push(`kept with card issues: ${leftover.join("; ")}`);
    // A quote that's too long or not on the page is removed, never the item.
    if (quoteProblems(summary.quote, page.text).length) summary = { ...summary, quote: "" };
    result.title = summary.title;

    const { verdict, usage: judgeUsage } = await judge({ url: page.finalUrl, summary, pageText: page.text });
    result.judgeUsage = judgeUsage;

    const problems = verifyItem({ summary, verdict, pageText: page.text, publishedDate: page.publishedDate }, options);
    if (problems.length) return { ...result, status: "rejected", reason: `${verdict.score}/10 · ${problems.join("; ")}` };
    return {
      ...result,
      status: "kept",
      reason: `${verdict.score}/10 · ${verdict.theme} · ${verdict.reason}`,
      item: { url: page.finalUrl, summary, verdict, publishedDate: page.publishedDate },
    };
  } catch (error) {
    return { ...result, status: "error", reason: oneLine(error) };
  }
}

/** Runs `fn` over `items` with at most `limit` in flight, keeping input order. */
export async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
