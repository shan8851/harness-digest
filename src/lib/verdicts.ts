// Every judge verdict, pass or fail, one JSONL file per ISO week under
// PATHS.verdicts. The pool only keeps passes and memory only keeps a status,
// so without this a rejected item's score and reason were lost. Evals need
// both sides: you can't tell whether the judge is too strict from passes alone.

import { appendFile, mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Verdict } from "../phases/judge.js";

export interface VerdictRecord {
  key: string; // canonicalUrl() of the item
  url: string;
  title: string;
  status: "kept" | "rejected"; // rejected covers a judge fail and a verification fail
  verdict: Verdict;
  problems: string[]; // verification problems; empty unless verification failed it
  scannedAt: string; // ISO date of the scan
}

/** Appends to the week's file: a true append, like the pool, so parallel workers and a late crash lose nothing. */
export async function appendVerdicts(dir: string, week: string, records: VerdictRecord[]): Promise<void> {
  if (records.length === 0) return;
  await mkdir(dir, { recursive: true });
  await appendFile(join(dir, `${week}.jsonl`), records.map((r) => JSON.stringify(r) + "\n").join(""), "utf8");
}

/** Every record from every .jsonl file in `dir`, oldest file first. Missing directory means none yet. */
export async function loadVerdicts(dir: string): Promise<VerdictRecord[]> {
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".jsonl")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const records: VerdictRecord[] = [];
  for (const file of files) {
    const text = await readFile(join(dir, file), "utf8");
    records.push(...text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as VerdictRecord));
  }
  return records;
}
