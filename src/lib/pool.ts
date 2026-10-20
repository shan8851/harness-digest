// The week's pool: every item that passed the judge and verification in this
// ISO week's scans (Monday to Sunday), waiting for the weekly issue to pick the
// best. One JSONL file per week under PATHS.pool, committed with the rest of generated/.

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { MEMORY, THEMES, WEEKLY, type Theme } from "../../config/settings.js";
import type { IssueItem } from "../issue/render.js";
import { titleSimilarity } from "./dedupe.js";

export interface PoolEntry extends IssueItem {
  key: string;
  foundBy: string; // seed name, or "explore: <theme>"
  source: string;
  scannedAt: string;
}

export const fromExplore = (entry: { foundBy: string }) => entry.foundBy.startsWith("explore");

/** The score used for ranking: the judge's score, minus the handicap for carried-over items. */
export const rankScore = (entry: PoolEntry) => entry.verdict.score - (entry.carriedOver ? WEEKLY.carryOverPenalty : 0);

/**
 * Last week's strong items that weren't picked, flagged for one more chance.
 * Only the previous week is ever read, so nothing carries over twice.
 */
export function carryOver(previousWeek: PoolEntry[], featured: Set<string>, minScore: number = WEEKLY.carryOverMinScore): PoolEntry[] {
  return previousWeek.filter((e) => !featured.has(e.key) && e.verdict.score >= minScore).map((e) => ({ ...e, carriedOver: true }));
}

/** ISO 8601 week, e.g. "2026-W43". Weeks run Monday to Sunday, so Sunday's issue covers that week's scans. */
export function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); // the Thursday of this week decides the year
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const poolFile = (dir: string, week: string) => join(dir, `${week}.jsonl`);

export async function loadPool(dir: string, week: string): Promise<PoolEntry[]> {
  try {
    const text = await readFile(poolFile(dir, week), "utf8");
    return text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as PoolEntry);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/**
 * Appends to the week's file. A true append (never read-modify-write), so the
 * scan can save each item the moment it passes, from parallel workers, and a
 * crash later in the run can't lose cards that were already paid for.
 */
export async function appendPool(dir: string, week: string, entries: PoolEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await mkdir(dir, { recursive: true });
  await appendFile(poolFile(dir, week), entries.map((e) => JSON.stringify(e) + "\n").join(""), "utf8");
}

// When themes tie on passes, push the one that's hardest to find first.
const TIE_ORDER: Theme[] = ["non-engineers", "real-setups", "lighter-review", "verification", "harness-design"];

/** The theme with the fewest passes so far this week; explore pushes it hardest. */
export function weakestTheme(pool: PoolEntry[]): Theme {
  const counts = new Map(THEMES.map((t) => [t, 0]));
  for (const entry of pool) counts.set(entry.verdict.theme, (counts.get(entry.verdict.theme) ?? 0) + 1);
  return [...TIE_ORDER].sort((a, b) => counts.get(a)! - counts.get(b)!)[0]!;
}

/**
 * Picks the issue from the week's pool: highest judge score first (newest on
 * ties), one card per story, and at least WEEKLY.minFromExplore items that
 * explore found, when any passed, so the issue isn't just the usual names.
 */
export function pickIssue(pool: PoolEntry[], options: { maxItems?: number; minFromExplore?: number } = {}): PoolEntry[] {
  const maxItems = options.maxItems ?? WEEKLY.maxItems;
  const minFromExplore = options.minFromExplore ?? WEEKLY.minFromExplore;
  // Highest rank score first; on a tie, fresh items beat carried-over ones, then newest first.
  const ranked = [...pool].sort(
    (a, b) =>
      rankScore(b) - rankScore(a) ||
      Number(Boolean(a.carriedOver)) - Number(Boolean(b.carriedOver)) ||
      (b.publishedDate ?? b.scannedAt).localeCompare(a.publishedDate ?? a.scannedAt),
  );

  // One card per story: drop anything too similar to a higher-ranked item.
  const distinct: PoolEntry[] = [];
  for (const entry of ranked) {
    if (distinct.some((d) => d.key === entry.key || titleSimilarity(d.summary.title, entry.summary.title) >= MEMORY.titleSimilarityThreshold)) continue;
    distinct.push(entry);
  }

  const picked = distinct.slice(0, maxItems);
  const spare = distinct.slice(maxItems).filter(fromExplore);
  // Swap the lowest-ranked seed items for the best spare explore items until the minimum is met.
  while (picked.filter(fromExplore).length < minFromExplore && spare.length) {
    const lowestSeed = picked.map((e, i) => [e, i] as const).reverse().find(([e]) => !fromExplore(e));
    if (!lowestSeed) break;
    picked.splice(lowestSeed[1], 1);
    picked.push(spare.shift()!);
  }
  return picked.sort((a, b) => rankScore(b) - rankScore(a) || Number(Boolean(a.carriedOver)) - Number(Boolean(b.carriedOver)));
}
