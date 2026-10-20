// Every run writes a JSON log to runs/: what each phase did, what it cost,
// whether the quotas were met, and anything that went wrong. The logs are
// committed, so the repo is its own debugging trail, and they double as the
// source of truth for budgets ("how much have we spent this month?") and for
// lookback ("when did the last scan succeed?").

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BUDGETS_USD, MEMORY, type ModelId } from "../../config/settings.js";
import { addUsage, costUsd, ZERO_USAGE, type UsageTotals } from "./cost.js";
import type { QuotaResult } from "./quotas.js";

export type RunKind = "scan" | "weekly";
export type RunStatus = "running" | "ok" | "partial" | "failed";

export interface PhaseLog {
  name: string;
  model: ModelId | null; // null for code-only phases (dedupe, verify, store)
  startedAt: string;
  durationMs: number;
  usage: UsageTotals;
  costUsd: number;
  notes: string[];
}

export interface RunLog {
  id: string; // also the filename, e.g. 2026-10-21T0200-scan
  kind: RunKind;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  lookbackFrom: string | null; // scans only: published-after cutoff
  phases: PhaseLog[];
  quotas: QuotaResult | null;
  totals: UsageTotals & { costUsd: number };
  warnings: string[];
  errors: { phase: string; message: string }[];
}

export function newRunLog(kind: RunKind, now: Date): RunLog {
  const stamp = now.toISOString().slice(0, 16).replace(":", ""); // 2026-10-21T0200
  return {
    id: `${stamp}-${kind}`,
    kind,
    status: "running",
    startedAt: now.toISOString(),
    finishedAt: null,
    lookbackFrom: null,
    phases: [],
    quotas: null,
    totals: { ...ZERO_USAGE, costUsd: 0 },
    warnings: [],
    errors: [],
  };
}

/** Records a finished phase and rolls its usage and cost into the run totals. */
export function recordPhase(
  log: RunLog,
  phase: { name: string; model: ModelId | null; startedAt: Date; usage?: UsageTotals; notes?: string[] },
  now: Date,
): void {
  const usage = phase.usage ?? ZERO_USAGE;
  const cost = phase.model ? costUsd(phase.model, usage) : 0;
  log.phases.push({
    name: phase.name,
    model: phase.model,
    startedAt: phase.startedAt.toISOString(),
    durationMs: now.getTime() - phase.startedAt.getTime(),
    usage,
    costUsd: cost,
    notes: phase.notes ?? [],
  });
  const { costUsd: totalCost, ...totalUsage } = log.totals;
  log.totals = { ...addUsage(totalUsage, usage), costUsd: totalCost + cost };
}

export function finishRun(log: RunLog, now: Date): void {
  log.finishedAt = now.toISOString();
  if (log.errors.length === 0) log.status = "ok";
  else log.status = log.phases.length > 0 ? "partial" : "failed";
}

export async function writeRunLog(dir: string, log: RunLog): Promise<string> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${log.id}.json`);
  await writeFile(path, JSON.stringify(log, null, 2) + "\n", "utf8");
  return path;
}

export async function readRunLogs(dir: string): Promise<RunLog[]> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const logs = await Promise.all(
    files.filter((f) => f.endsWith(".json")).map(async (f) => JSON.parse(await readFile(join(dir, f), "utf8")) as RunLog),
  );
  return logs.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

/** Total spend for the calendar month (UTC) that `now` falls in. */
export function monthToDateSpend(logs: RunLog[], now: Date): number {
  const month = now.toISOString().slice(0, 7); // 2026-10
  return logs.filter((l) => l.startedAt.startsWith(month)).reduce((sum, l) => sum + l.totals.costUsd, 0);
}

/**
 * Where a new scan should start looking from: the start of the last scan that
 * finished ok, so a failed run never leaves a gap. Capped at
 * MEMORY.maxLookbackDays so a long outage doesn't trigger a huge catch-up.
 */
export function lookbackFrom(logs: RunLog[], now: Date): Date {
  const floor = new Date(now.getTime() - MEMORY.maxLookbackDays * 24 * 60 * 60 * 1000);
  const lastOk = logs.filter((l) => l.kind === "scan" && l.status === "ok").at(-1);
  if (!lastOk) return floor;
  const last = new Date(lastOk.startedAt);
  return last > floor ? last : floor;
}

export function overRunBudget(log: RunLog, limit: number = BUDGETS_USD.perRun): boolean {
  return log.totals.costUsd >= limit;
}

export function overMonthlyBudget(logs: RunLog[], now: Date, limit: number = BUDGETS_USD.perMonth): boolean {
  return monthToDateSpend(logs, now) >= limit;
}
