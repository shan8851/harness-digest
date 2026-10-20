// The harness's memory: every link considered in the last
// MEMORY.seenRetentionDays, so nothing is judged or featured twice. Stored as
// state/seen.jsonl (one JSON object per line) because it diffs cleanly in git.
//
// It's a rolling window: new links are added, old ones pruned on every run,
// so the file stays the same size forever. Code reads it; no model ever does.
// The odd undated item may resurface after the window. That's accepted.

import { readFile, writeFile } from "node:fs/promises";
import { MEMORY } from "../../config/settings.js";

export type SeenStatus = "featured" | "passed" | "rejected";

export interface SeenEntry {
  key: string; // canonicalUrl() of the item
  url: string;
  title: string;
  firstSeen: string; // ISO date
  status: SeenStatus;
}

export async function loadSeen(path: string): Promise<SeenEntry[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    // First run: no memory yet.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as SeenEntry);
}

export async function saveSeen(path: string, entries: SeenEntry[]): Promise<void> {
  await writeFile(path, entries.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
}

/** Drops entries first seen longer ago than the retention window. */
export function pruneSeen(entries: SeenEntry[], now: Date, retentionDays: number = MEMORY.seenRetentionDays): SeenEntry[] {
  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  return entries.filter((e) => Date.parse(e.firstSeen) >= cutoff);
}

const STOPWORDS = new Set([
  "a", "an", "and", "the", "of", "to", "in", "on", "for", "with", "how", "i", "my",
  "your", "you", "we", "is", "are", "it", "this", "that", "from", "at", "by", "or",
]);

/** The meaningful words of a title, lowercased, without punctuation or filler. */
export function titleWords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w && !STOPWORDS.has(w)),
  );
}

/** Word overlap between two titles, from 0 (nothing shared) to 1 (same words). */
export function titleSimilarity(a: string, b: string): number {
  const wa = titleWords(a);
  const wb = titleWords(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let shared = 0;
  for (const word of wa) if (wb.has(word)) shared++;
  return shared / (wa.size + wb.size - shared);
}

/**
 * Splits candidates into ones we've never seen and ones we have. A candidate
 * counts as seen if its URL key matches, or its title is near-identical to
 * something seen (the same story republished elsewhere). Also removes
 * duplicates within the batch itself.
 */
export function splitUnseen<T extends { key: string; title: string }>(
  candidates: T[],
  seen: SeenEntry[],
  threshold: number = MEMORY.titleSimilarityThreshold,
): { fresh: T[]; duplicates: T[] } {
  const seenKeys = new Set(seen.map((e) => e.key));
  const knownTitles = seen.map((e) => e.title);
  const fresh: T[] = [];
  const duplicates: T[] = [];

  for (const candidate of candidates) {
    const isDuplicate =
      seenKeys.has(candidate.key) ||
      knownTitles.some((title) => titleSimilarity(title, candidate.title) >= threshold);
    if (isDuplicate) {
      duplicates.push(candidate);
    } else {
      fresh.push(candidate);
      seenKeys.add(candidate.key);
      knownTitles.push(candidate.title);
    }
  }
  return { fresh, duplicates };
}
