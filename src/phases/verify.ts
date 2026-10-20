// Phase: verify, in plain code. The models have had their say; this checks
// the parts that can be checked mechanically, and anything that fails is
// dropped however good the judge thought it was.

import { ITEMS } from "../../config/settings.js";
import type { Verdict } from "./judge.js";
import type { Summary } from "./summarise.js";

export interface VerifyInput {
  summary: Summary;
  verdict: Verdict;
  pageText: string;
  publishedDate: string | null;
}

export interface VerifyOptions {
  now: Date;
  /** Smoke tests use older, known-good links, so they skip the age check. */
  checkAge: boolean;
}

/** Lowercase, straight quotes, plain dashes, single spaces: so formatting differences don't hide a real match. */
export function normaliseForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Returns every problem found; an empty list means the item is verified. */
export function verifyItem(input: VerifyInput, options: VerifyOptions): string[] {
  const { summary, verdict } = input;
  const problems: string[] = [];

  if (!verdict.pass) problems.push(`judge failed it: ${verdict.reason}`);
  else if (verdict.score < ITEMS.minScore) problems.push(`judge passed it but scored ${verdict.score}, below ${ITEMS.minScore}`);

  for (const field of ["title", "technique", "stealThis", "quote"] as const) {
    if (!summary[field].trim()) problems.push(`empty ${field}`);
  }

  const words = wordCount(summary.quote);
  if (words > ITEMS.maxQuoteWords) problems.push(`quote is ${words} words, max ${ITEMS.maxQuoteWords}`);
  if (summary.quote.trim() && !normaliseForMatch(input.pageText).includes(normaliseForMatch(summary.quote))) {
    problems.push("quote not found in page text");
  }

  if (options.checkAge) {
    if (!input.publishedDate) {
      problems.push("no published date found");
    } else {
      const ageDays = (options.now.getTime() - Date.parse(input.publishedDate)) / (24 * 60 * 60 * 1000);
      if (ageDays > ITEMS.maxAgeDays) problems.push(`published ${Math.floor(ageDays)} days ago, max ${ITEMS.maxAgeDays}`);
    }
  }

  return problems;
}
