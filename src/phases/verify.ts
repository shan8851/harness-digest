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

/**
 * Presentation checks on the card: shape limits and the quote. These never
 * decide whether an item is good; that's the judge's job. They run straight
 * after summarising so a messy card can be sent back for a tidy-up, and
 * anything still off afterwards is logged as a warning, not a drop.
 */
export function checkCard(summary: Summary, pageText: string): string[] {
  const problems: string[] = [];

  const bullets = summary.howItWorks.filter((b) => b.trim());
  if (bullets.length < ITEMS.minBullets || bullets.length > ITEMS.maxBullets) {
    problems.push(`${bullets.length} "how it works" bullets, need ${ITEMS.minBullets}-${ITEMS.maxBullets}`);
  }
  const longBullets = bullets.filter((b) => wordCount(b) > ITEMS.maxBulletWords).length;
  if (longBullets) problems.push(`${longBullets} bullet(s) over ${ITEMS.maxBulletWords} words`);
  if (wordCount(summary.idea) > ITEMS.maxIdeaWords) problems.push(`idea is ${wordCount(summary.idea)} words, max ${ITEMS.maxIdeaWords}`);
  if (wordCount(summary.goDeeperIf) > ITEMS.maxGoDeeperWords) {
    problems.push(`"go deeper if" is ${wordCount(summary.goDeeperIf)} words, max ${ITEMS.maxGoDeeperWords}`);
  }
  problems.push(...quoteProblems(summary.quote, pageText));
  return problems;
}

/** The quote must be short (we summarise, never copy) and really on the page. */
export function quoteProblems(quote: string, pageText: string): string[] {
  if (!quote.trim()) return [];
  const problems: string[] = [];
  const words = wordCount(quote);
  if (words > ITEMS.maxQuoteWords) problems.push(`quote is ${words} words, max ${ITEMS.maxQuoteWords}`);
  if (!normaliseForMatch(pageText).includes(normaliseForMatch(quote))) problems.push("quote not found in page text");
  return problems;
}

/**
 * Whether the item makes the issue at all. Only quality and freshness decide
 * that, plus a card too empty to show. Returns the reasons to drop it; an
 * empty list means it's in.
 */
export function verifyItem(input: VerifyInput, options: VerifyOptions): string[] {
  const { summary, verdict } = input;
  const problems: string[] = [];

  if (!verdict.pass) problems.push(`judge failed it: ${verdict.reason}`);
  else if (verdict.score < ITEMS.minScore) problems.push(`judge passed it but scored ${verdict.score}, below ${ITEMS.minScore}`);

  for (const field of ["title", "idea", "stealThis"] as const) {
    if (!summary[field].trim()) problems.push(`card has no ${field}`);
  }
  if (!summary.howItWorks.some((b) => b.trim())) problems.push('card has no "how it works" bullets');

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
