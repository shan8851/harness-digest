import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ZERO_USAGE } from "../src/lib/usage.js";
import {
  finishRun,
  lookbackFrom,
  newRunLog,
  overTokenLimit,
  readRunLogs,
  recordPhase,
  writeRunLog,
  type RunLog,
} from "../src/lib/runLog.js";

const at = (iso: string) => new Date(iso);

function pastRun(startedAt: string, status: RunLog["status"]): RunLog {
  const log = newRunLog("scan", at(startedAt));
  log.status = status;
  return log;
}

describe("recordPhase", () => {
  it("adds each phase's usage to the run totals and writes a one-line summary", () => {
    const log = newRunLog("scan", at("2026-10-21T02:00:00Z"));
    const usage = { ...ZERO_USAGE, inputTokens: 410_000, outputTokens: 20_000, webSearches: 22 };
    recordPhase(log, { name: "explore", model: "claude-sonnet-5-5", startedAt: at("2026-10-21T02:00:00Z"), usage }, at("2026-10-21T02:01:14Z"));
    recordPhase(log, { name: "verify", model: null, startedAt: at("2026-10-21T02:01:14Z") }, at("2026-10-21T02:01:16.5Z"));

    expect(log.phases.map((p) => p.summary)).toEqual([
      "explore · sonnet-5-5 · 1m 14s · 0.41M in · 0.02M out · 22 searches · 0 fetches",
      "verify · code · 3s",
    ]);
    expect(log.phases[1]!.durationSeconds).toBe(2.5);
    expect(log.totals.inputTokens).toBe(410_000);
  });
});

describe("finishRun", () => {
  it("marks a run with errors but completed phases as partial, and says so in the summary", () => {
    const log = newRunLog("scan", at("2026-10-21T02:00:00Z"));
    recordPhase(log, { name: "seed sweep", model: null, startedAt: at("2026-10-21T02:00:00Z") }, at("2026-10-21T02:00:01Z"));
    log.quotas = { met: false, shortfalls: ["no new video found"] };
    log.errors.push({ phase: "explore", message: "timeout" });
    finishRun(log, at("2026-10-21T02:04:12Z"));
    expect(log.status).toBe("partial");
    expect(log.summary).toBe("scan · partial · 4m 12s · 0.00M in · 0.00M out · 0 searches · 0 fetches · quotas short (1) · 1 error(s)");
  });
});

describe("lookbackFrom", () => {
  const now = at("2026-10-23T02:00:00Z");

  it("starts from the last successful scan, skipping failed ones", () => {
    const logs = [pastRun("2026-10-19T02:00:00Z", "ok"), pastRun("2026-10-21T02:00:00Z", "failed")];
    expect(lookbackFrom(logs, now).toISOString()).toBe("2026-10-19T02:00:00.000Z");
  });

  it("never looks back further than the cap", () => {
    expect(lookbackFrom([pastRun("2026-09-01T02:00:00Z", "ok")], now).toISOString()).toBe("2026-10-16T02:00:00.000Z");
    expect(lookbackFrom([], now).toISOString()).toBe("2026-10-16T02:00:00.000Z");
  });
});

describe("overTokenLimit", () => {
  it("trips once a run's billed tokens reach the limit", () => {
    const log = newRunLog("scan", at("2026-10-21T02:00:00Z"));
    log.totals = { ...ZERO_USAGE, inputTokens: 4_000_000, outputTokens: 999_999 };
    expect(overTokenLimit(log, 5_000_000)).toBe(false);
    log.totals.cacheReadTokens = 1;
    expect(overTokenLimit(log, 5_000_000)).toBe(true);
  });
});

describe("writeRunLog and readRunLogs", () => {
  it("writes one indented file per run and reads them back in start order", async () => {
    const dir = await mkdtemp(join(tmpdir(), "runs-"));
    try {
      expect(await readRunLogs(join(dir, "missing"))).toEqual([]);
      const later = pastRun("2026-10-23T02:00:00Z", "ok");
      const earlier = pastRun("2026-10-21T02:00:00Z", "ok");
      await writeRunLog(dir, later);
      const path = await writeRunLog(dir, earlier);
      expect(path).toMatch(/2026-10-21T0200-scan\.json$/);
      expect((await readRunLogs(dir)).map((l) => l.id)).toEqual([earlier.id, later.id]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
