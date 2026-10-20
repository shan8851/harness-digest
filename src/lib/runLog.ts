// Every run writes a JSON log to runs/: what each phase did, how many tokens
// it used, whether the quotas were met, and anything that went wrong. The
// logs are committed, so the repo is its own debugging trail. They also tell
// the next scan where to start looking ("when did the last scan succeed?").
//
// Each log and each phase opens with a one-line `summary`, so you can read a
// run at a glance and only dig into the numbers when something looks off.

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MEMORY, RUN_LIMITS, type ModelId } from "../../config/settings.js";
import { addUsage, describeUsage, totalTokens, ZERO_USAGE, type UsageTotals } from "./usage.js";
import type { QuotaResult } from "./quotas.js";

export type RunKind = "scan" | "weekly" | "smoke";
export type RunStatus = "running" | "ok" | "partial" | "failed";

export interface PhaseLog {
  summary: string; // e.g. "explore · sonnet-5-5 · 1m 14s · 0.410M in · 0.020M out · 22 searches · 0 fetches"
  name: string;
  model: ModelId | null; // null for code-only phases (dedupe, verify, store)
  startedAt: string;
  durationSeconds: number;
  usage: UsageTotals;
  notes: string[];
}

export interface RunLog {
  summary: string; // e.g. "scan · ok · 4m 12s · 1.240M in · 0.060M out · 23 searches · 18 fetches · quotas met"
  id: string; // also the filename, e.g. 2026-10-21T0200-scan
  kind: RunKind;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  lookbackFrom: string | null; // scans only: look for things published after this
  quotas: QuotaResult | null;
  totals: UsageTotals;
  warnings: string[];
  errors: { phase: string; message: string }[];
  phases: PhaseLog[];
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function shortModel(model: ModelId): string {
  return model.replace(/^claude-/, "");
}

export function newRunLog(kind: RunKind, now: Date): RunLog {
  const stamp = now.toISOString().slice(0, 16).replace(":", ""); // 2026-10-21T0200
  return {
    summary: `${kind} · running`,
    id: `${stamp}-${kind}`,
    kind,
    status: "running",
    startedAt: now.toISOString(),
    finishedAt: null,
    lookbackFrom: null,
    quotas: null,
    totals: { ...ZERO_USAGE },
    warnings: [],
    errors: [],
    phases: [],
  };
}

/** Records a finished phase and rolls its usage into the run totals. */
export function recordPhase(
  log: RunLog,
  phase: { name: string; model: ModelId | null; startedAt: Date; usage?: UsageTotals; notes?: string[] },
  now: Date,
): void {
  const usage = phase.usage ?? ZERO_USAGE;
  const durationSeconds = Math.round((now.getTime() - phase.startedAt.getTime()) / 100) / 10;
  const parts = [phase.name, phase.model ? shortModel(phase.model) : "code", formatDuration(durationSeconds)];
  if (phase.model) parts.push(describeUsage(usage));

  log.phases.push({
    summary: parts.join(" · "),
    name: phase.name,
    model: phase.model,
    startedAt: phase.startedAt.toISOString(),
    durationSeconds,
    usage,
    notes: phase.notes ?? [],
  });
  log.totals = addUsage(log.totals, usage);
}

export function finishRun(log: RunLog, now: Date): void {
  log.finishedAt = now.toISOString();
  if (log.errors.length === 0) log.status = "ok";
  else log.status = log.phases.length > 0 ? "partial" : "failed";

  const seconds = (now.getTime() - Date.parse(log.startedAt)) / 1000;
  const parts = [log.kind, log.status, formatDuration(seconds), describeUsage(log.totals)];
  if (log.quotas) parts.push(log.quotas.met ? "quotas met" : `quotas short (${log.quotas.shortfalls.length})`);
  if (log.warnings.length) parts.push(`${log.warnings.length} warning(s)`);
  if (log.errors.length) parts.push(`${log.errors.length} error(s)`);
  log.summary = parts.join(" · ");
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

/** True once a run has used enough tokens that something has probably gone wrong. */
export function overTokenLimit(log: RunLog, limit: number = RUN_LIMITS.maxTokensPerRun): boolean {
  return totalTokens(log.totals) >= limit;
}
