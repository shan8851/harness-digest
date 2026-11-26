// The month's pool: every item that passed the judge and verification in that
// month's scans, waiting for the issue on the 1st to pick the best. One JSONL
// file per month under PATHS.pool (e.g. 2026-11.jsonl), committed with the rest
// of generated/. Files named by ISO week (2026-W45.jsonl) are from the weekly era.

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ISSUE, ITEMS, MEMORY, THEMES, type Theme } from "../../config/settings.js";
import type { IssueItem } from "../issue/render.js";
import { titleSimilarity } from "./dedupe.js";

export interface PoolEntry extends IssueItem {
  key: string;
  foundBy: string; // seed name, or "explore: <theme>"
  source: string;
  scannedAt: string;
}

export const fromExplore = (entry: { foundBy: string }) => entry.foundBy.startsWith("explore");

export const isPodcast = (entry: IssueItem) => entry.summary.contentType === "podcast";

/**
 * The judge's score with its readability nudge (-1 to +1) applied, so a
 * readable 7 can outrank an 8 that's a wall of text. It only reorders passes:
 * it never drops one below the pass mark or above 10. Podcasts are listened
 * to, so readability doesn't apply to them.
 */
export function adjustedScore(item: IssueItem): number {
  if (isPodcast(item)) return item.verdict.score;
  const nudged = item.verdict.score + (item.verdict.readability ?? 0);
  return Math.min(10, Math.max(ITEMS.minScore, nudged));
}

const poolFile = (dir: string, month: string) => join(dir, `${month}.jsonl`);

export async function loadPool(dir: string, month: string): Promise<PoolEntry[]> {
  try {
    const text = await readFile(poolFile(dir, month), "utf8");
    return text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as PoolEntry);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/**
 * Appends to the month's file. A true append (never read-modify-write), so the
 * scan can save each item the moment it passes, from parallel workers, and a
 * crash later in the run can't lose cards that were already paid for.
 */
export async function appendPool(dir: string, month: string, entries: PoolEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await mkdir(dir, { recursive: true });
  await appendFile(poolFile(dir, month), entries.map((e) => JSON.stringify(e) + "\n").join(""), "utf8");
}

// When themes tie on passes, push the one that's hardest to find first.
const TIE_ORDER: Theme[] = ["non-engineers", "real-setups", "lighter-review", "verification", "harness-design"];

/** Highest adjusted score first, newest first on a tie. */
export function rankPool(pool: PoolEntry[]): PoolEntry[] {
  return [...pool].sort(
    (a, b) => adjustedScore(b) - adjustedScore(a) || (b.publishedDate ?? b.scannedAt).localeCompare(a.publishedDate ?? a.scannedAt),
  );
}

/** The bonus listen: the best podcasts at or above the bonus bar. Most months, none. */
export function pickBonus(pool: PoolEntry[], options: { minScore?: number; maxItems?: number } = {}): PoolEntry[] {
  const minScore = options.minScore ?? ISSUE.bonusMinScore;
  return rankPool(pool.filter((e) => isPodcast(e) && adjustedScore(e) >= minScore)).slice(0, options.maxItems ?? ISSUE.maxBonus);
}

/**
 * Drops all but the best of each same-idea group. `groups` are lists of keys
 * from the model; code decides which to keep (the highest-ranked), so a bad
 * grouping can only ever remove a weaker duplicate, never the best item.
 * Unknown keys and one-item groups are ignored. So is a group that mixes
 * content types (a post and a repo are different resources) or overlaps one
 * already used: chained groups could otherwise drop every item in the chain
 * (seen on W44). A missed duplicate is the cheaper mistake.
 */
export function dropSameIdea(pool: PoolEntry[], groups: string[][]): { kept: PoolEntry[]; dropped: { key: string; keptInstead: string }[] } {
  const ranked = rankPool(pool);
  const position = new Map(ranked.map((e, i) => [e.key, i]));
  const dropped: { key: string; keptInstead: string }[] = [];
  const byKey = new Map(pool.map((e) => [e.key, e]));
  const drop = new Set<string>();
  const grouped = new Set<string>();
  for (const group of groups) {
    const members = [...new Set(group)].filter((k) => position.has(k));
    if (members.length < 2 || members.some((k) => grouped.has(k))) continue;
    if (new Set(members.map((k) => byKey.get(k)!.summary.contentType)).size > 1) continue;
    for (const key of members) grouped.add(key);
    members.sort((a, b) => position.get(a)! - position.get(b)!);
    const [best, ...rest] = members;
    for (const key of rest) {
      drop.add(key);
      dropped.push({ key, keptInstead: best! });
    }
  }
  return { kept: pool.filter((e) => !drop.has(e.key)), dropped };
}

/** The theme with the fewest passes so far this month; explore pushes it hardest. */
export function weakestTheme(pool: PoolEntry[]): Theme {
  const counts = new Map(THEMES.map((t) => [t, 0]));
  for (const entry of pool) counts.set(entry.verdict.theme, (counts.get(entry.verdict.theme) ?? 0) + 1);
  return [...TIE_ORDER].sort((a, b) => counts.get(a)! - counts.get(b)!)[0]!;
}

/** The site an item counts against for ISSUE.siteCaps: the URL's host, without www. */
export const siteOf = (entry: { url: string }) => new URL(entry.url).hostname.replace(/^www\./, "");

/**
 * Picks the issue from the month's pool: highest judge score first (newest on
 * ties), one card per story, no more than ISSUE.siteCaps allows from one site,
 * and at least ISSUE.minFromExplore items that explore found, when any passed,
 * so the issue isn't just the usual names.
 */
export function pickIssue(
  pool: PoolEntry[],
  options: { maxItems?: number; minFromExplore?: number; siteCaps?: Record<string, number> } = {},
): PoolEntry[] {
  const maxItems = options.maxItems ?? ISSUE.maxItems;
  const minFromExplore = options.minFromExplore ?? ISSUE.minFromExplore;
  const siteCaps = options.siteCaps ?? ISSUE.siteCaps;
  // Podcasts never go in the main list; see pickBonus.
  const ranked = rankPool(pool.filter((e) => !isPodcast(e)));
  const fits = (list: PoolEntry[], entry: PoolEntry) => {
    const cap = siteCaps[siteOf(entry)];
    return cap === undefined || list.filter((e) => siteOf(e) === siteOf(entry)).length < cap;
  };

  // One card per story: drop anything too similar to a higher-ranked item.
  const distinct: PoolEntry[] = [];
  for (const entry of ranked) {
    if (distinct.some((d) => d.key === entry.key || titleSimilarity(d.summary.title, entry.summary.title) >= MEMORY.titleSimilarityThreshold)) continue;
    distinct.push(entry);
  }

  const picked: PoolEntry[] = [];
  const spare: PoolEntry[] = [];
  for (const entry of distinct) {
    if (picked.length < maxItems && fits(picked, entry)) picked.push(entry);
    else if (fromExplore(entry)) spare.push(entry);
  }
  // Swap the lowest-ranked seed items for the best spare explore items until
  // the minimum is met, skipping any spare that would break a site cap.
  while (picked.filter(fromExplore).length < minFromExplore) {
    const lowestSeed = picked.map((e, i) => [e, i] as const).reverse().find(([e]) => !fromExplore(e));
    if (!lowestSeed) break;
    const rest = picked.filter((_, i) => i !== lowestSeed[1]);
    const next = spare.findIndex((e) => fits(rest, e));
    if (next === -1) break;
    picked.splice(0, picked.length, ...rest, ...spare.splice(next, 1));
  }
  return rankPool(picked);
}
