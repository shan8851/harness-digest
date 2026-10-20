import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ZERO_USAGE } from "../src/lib/cost.js";
import {
  finishRun,
  lookbackFrom,
  monthToDateSpend,
  newRunLog,
  overMonthlyBudget,
  overRunBudget,
  readRunLogs,
  recordPhase,
  writeRunLog,
  type RunLog,
} from "../src/lib/runLog.js";

const at = (iso: string) => new Date(iso);

function pastRun(startedAt: string, status: RunLog["status"], costUsd = 0): RunLog {
  const log = newRunLog("scan", at(startedAt));
  log.status = status;
  log.totals.costUsd = costUsd;
  return log;
}

describe("recordPhase", () => {
  it("adds each phase's usage and cost to the run totals", () => {
    const log = newRunLog("scan", at("2026-10-21T02:00:00Z"));
    const usage = { ...ZERO_USAGE, inputTokens: 1_000_000 }; // $2 on Sonnet
    recordPhase(log, { name: "explore", model: "claude-sonnet-5-5", startedAt: at("2026-10-21T02:00:00Z"), usage }, at("2026-10-21T02:01:00Z"));
    recordPhase(log, { name: "verify", model: null, startedAt: at("2026-10-21T02:01:00Z") }, at("2026-10-21T02:01:05Z"));

    expect(log.phases.map((p) => [p.name, p.durationMs, p.costUsd])).toEqual([
      ["explore", 60_000, 2],
      ["verify", 5_000, 0],
    ]);
    expect(log.totals.inputTokens).toBe(1_000_000);
    expect(log.totals.costUsd).toBeCloseTo(2, 6);
  });
});

describe("finishRun", () => {
  it("marks a run with errors but completed phases as partial", () => {
    const log = newRunLog("scan", at("2026-10-21T02:00:00Z"));
    recordPhase(log, { name: "seed sweep", model: null, startedAt: at("2026-10-21T02:00:00Z") }, at("2026-10-21T02:00:01Z"));
    log.errors.push({ phase: "explore", message: "timeout" });
    finishRun(log, at("2026-10-21T02:05:00Z"));
    expect(log.status).toBe("partial");
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

describe("budgets", () => {
  it("sums spend for the current UTC month only", () => {
    const logs = [pastRun("2026-09-30T02:00:00Z", "ok", 40), pastRun("2026-10-01T02:00:00Z", "ok", 3), pastRun("2026-10-03T02:00:00Z", "ok", 4)];
    expect(monthToDateSpend(logs, at("2026-10-20T00:00:00Z"))).toBe(7);
    expect(overMonthlyBudget(logs, at("2026-10-20T00:00:00Z"), 7)).toBe(true);
    expect(overMonthlyBudget(logs, at("2026-10-20T00:00:00Z"), 75)).toBe(false);
  });

  it("flags a run that has hit its runaway guard", () => {
    expect(overRunBudget(pastRun("2026-10-21T02:00:00Z", "running", 10), 10)).toBe(true);
  });
});

describe("writeRunLog and readRunLogs", () => {
  it("writes one file per run and reads them back in start order", async () => {
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
