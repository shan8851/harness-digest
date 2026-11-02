import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { latestByKey, parseLabels, pickSample, renderLabelSheet, scoreEval } from "../src/lib/judgeEval.js";
import { appendVerdicts, loadVerdicts, type VerdictRecord } from "../src/lib/verdicts.js";

let n = 0;
function record(status: "kept" | "rejected", score: number, key?: string): VerdictRecord {
  n++;
  return {
    key: key ?? `example.com/${n}`,
    url: `https://example.com/${n}`,
    title: `Post ${n}`,
    status,
    verdict: { pass: status === "kept", score, theme: "verification", reason: `Reason ${n}.` },
    problems: [],
    scannedAt: "2026-11-02T02:00:00.000Z",
  };
}

const strata = [
  { status: "rejected", minScore: 1, maxScore: 4, take: 2 },
  { status: "kept", minScore: 5, maxScore: 10, take: 2 },
] as const;

describe("verdict records", () => {
  it("append and load across weeks, so nothing judged is lost", async () => {
    const dir = await mkdtemp(join(tmpdir(), "verdicts-"));
    try {
      await appendVerdicts(dir, "2026-W45", [record("kept", 7)]);
      await appendVerdicts(dir, "2026-W45", [record("rejected", 3)]);
      await appendVerdicts(dir, "2026-W46", [record("kept", 8)]);
      expect((await loadVerdicts(dir)).map((r) => r.verdict.score)).toEqual([7, 3, 8]);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it("load as empty before the first scan has written any", async () => {
    expect(await loadVerdicts(join(tmpdir(), "no-such-verdicts-dir"))).toEqual([]);
  });

  it("keep only the newest verdict for a link judged twice", () => {
    const old = record("rejected", 4, "same");
    const newer = record("kept", 6, "same");
    expect(latestByKey([old, newer])).toEqual([newer]);
  });
});

describe("pickSample", () => {
  const pool = [record("rejected", 2), record("rejected", 3), record("rejected", 4), record("kept", 6), record("kept", 8), record("kept", 9)];

  it("takes the asked-for number from each band", () => {
    const { sample, shortfalls } = pickSample(pool, strata, 1);
    expect(sample.filter((r) => r.status === "rejected")).toHaveLength(2);
    expect(sample.filter((r) => r.status === "kept")).toHaveLength(2);
    expect(shortfalls).toEqual([]);
  });

  it("gives the same sample for the same seed", () => {
    expect(pickSample(pool, strata, 7).sample).toEqual(pickSample(pool, strata, 7).sample);
  });

  it("reports a band that's short rather than failing", () => {
    const { sample, shortfalls } = pickSample([record("kept", 6)], strata, 1);
    expect(sample).toHaveLength(1);
    expect(shortfalls).toHaveLength(2);
  });
});

describe("the label sheet", () => {
  it("never shows the judge's score, verdict or reason", () => {
    const r = record("kept", 9);
    const sheet = renderLabelSheet([r], "2026-11-02");
    expect(sheet).toContain(r.url);
    expect(sheet).not.toContain("9/10");
    expect(sheet).not.toContain(r.verdict.reason);
    expect(sheet).not.toMatch(/kept|rejected/);
  });

  it("reads back labels, treating anything but pass or fail as unlabelled", () => {
    const sheet = renderLabelSheet([record("kept", 7), record("rejected", 3), record("kept", 8)], "2026-11-02")
      .replace("- label:", "- label: Pass")
      .replace("- why:", "- why: clear technique")
      .replace(/- label:$/m, "- label: maybe");
    expect(parseLabels(sheet)).toEqual([
      { n: 1, label: "pass", why: "clear technique" },
      { n: 2, label: null, why: "" },
      { n: 3, label: null, why: "" },
    ]);
  });
});

describe("scoreEval", () => {
  it("counts agreement and lists each disagreement with the side that differed", () => {
    const sample = [record("kept", 7), record("rejected", 3), record("kept", 6), record("rejected", 4)];
    const labels = [
      { n: 1, label: "pass" as const, why: "" },
      { n: 2, label: "fail" as const, why: "" },
      { n: 3, label: "fail" as const, why: "just a launch post" },
      { n: 4, label: null, why: "" },
    ];
    const report = scoreEval(sample, labels);
    expect(report).toMatchObject({ labelled: 3, unlabelled: 1, agree: 2, confusion: { passPass: 1, passFail: 0, failPass: 1, failFail: 1 } });
    expect(report.disagreements.map((d) => [d.n, d.human, d.why])).toEqual([[3, "fail", "just a launch post"]]);
  });
});
