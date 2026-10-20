import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Theme } from "../config/settings.js";
import { appendPool, isoWeek, loadPool, pickIssue, weakestTheme, type PoolEntry } from "../src/lib/pool.js";
import { mapLimited } from "../src/phases/item.js";

let n = 0;
function entry(score: number, opts: { theme?: Theme; explore?: boolean; title?: string } = {}): PoolEntry {
  n++;
  return {
    url: `https://example.com/${n}`,
    key: `example.com/${n}`,
    foundBy: opts.explore ? "explore: verification" : "Simon Willison",
    source: "example.com",
    scannedAt: "2026-10-21T02:00:00.000Z",
    publishedDate: "2026-10-20",
    summary: {
      title: opts.title ?? `Post number ${n} about ${n * 7} distinct things`,
      contentType: "blog",
      theme: opts.theme ?? "verification",
      idea: "An idea.",
      howItWorks: ["a", "b", "c"],
      stealThis: "Steal it.",
      goDeeperIf: "you want more.",
      quote: "",
      minutes: 5,
    },
    verdict: { pass: true, score, theme: opts.theme ?? "verification", reason: "Good." },
  };
}

describe("isoWeek", () => {
  it("runs Monday to Sunday, so Sunday's issue covers that week's scans", () => {
    expect(isoWeek(new Date("2026-10-19T02:00:00Z"))).toBe("2026-W43"); // Monday
    expect(isoWeek(new Date("2026-10-25T06:30:00Z"))).toBe("2026-W43"); // Sunday
    expect(isoWeek(new Date("2026-10-26T02:00:00Z"))).toBe("2026-W44"); // next Monday
  });

  it("handles the year boundary the ISO way", () => {
    expect(isoWeek(new Date("2027-01-01T00:00:00Z"))).toBe("2026-W53");
  });
});

describe("weakestTheme", () => {
  it("picks the theme with the fewest passes, breaking ties towards the hardest to find", () => {
    expect(weakestTheme([])).toBe("non-engineers");
    const pool = [entry(8, { theme: "non-engineers" }), entry(8, { theme: "real-setups" }), entry(8, { theme: "lighter-review" }), entry(8, { theme: "verification" })];
    expect(weakestTheme(pool)).toBe("harness-design");
  });
});

describe("pickIssue", () => {
  it("takes the highest scores, up to the limit", () => {
    const pool = [entry(6), entry(9), entry(7), entry(8)];
    expect(pickIssue(pool, { maxItems: 2, minFromExplore: 0 }).map((p) => p.verdict.score)).toEqual([9, 8]);
  });

  it("shows one card per story", () => {
    const pool = [entry(9, { title: "Verification loops for coding agents" }), entry(8, { title: "Verification Loops For Coding Agents!" }), entry(7)];
    expect(pickIssue(pool, { maxItems: 5, minFromExplore: 0 })).toHaveLength(2);
  });

  it("swaps in explore finds when the top picks are all seeds", () => {
    const pool = [entry(9), entry(9), entry(8), entry(6, { explore: true }), entry(5, { explore: true })];
    const picks = pickIssue(pool, { maxItems: 3, minFromExplore: 2 });
    expect(picks.map((p) => [p.verdict.score, p.foundBy.startsWith("explore")])).toEqual([
      [9, false],
      [6, true],
      [5, true],
    ]);
  });

  it("returns an empty issue for an empty week", () => {
    expect(pickIssue([])).toEqual([]);
  });
});

describe("appendPool and loadPool", () => {
  it("appends to the week's file, and treats a missing week as empty", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pool-"));
    try {
      expect(await loadPool(dir, "2026-W43")).toEqual([]);
      const [a, b] = [entry(8), entry(7)];
      await appendPool(dir, "2026-W43", [a]);
      await appendPool(dir, "2026-W43", [b]);
      expect((await loadPool(dir, "2026-W43")).map((e) => e.key)).toEqual([a.key, b.key]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("mapLimited", () => {
  it("never runs more than the limit at once, and keeps input order", async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await mapLimited([5, 1, 4, 2, 3], 2, async (x) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, x));
      inFlight--;
      return x * 10;
    });
    expect(results).toEqual([50, 10, 40, 20, 30]);
    expect(peak).toBe(2);
  });
});
