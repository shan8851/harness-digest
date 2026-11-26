import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Theme } from "../config/settings.js";
import { monthKey, monthName, previousMonth } from "../src/lib/months.js";
import { appendPool, loadPool, pickIssue, weakestTheme, type PoolEntry } from "../src/lib/pool.js";
import { mapLimited } from "../src/phases/item.js";

let n = 0;
function entry(score: number, opts: { theme?: Theme; explore?: boolean; title?: string; site?: string } = {}): PoolEntry {
  n++;
  return {
    url: `https://${opts.site ?? "example.com"}/${n}`,
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

describe("months", () => {
  it("files a scan under the UTC month it ran in", () => {
    expect(monthKey(new Date("2026-11-30T23:59:00Z"))).toBe("2026-11");
    expect(monthKey(new Date("2026-12-01T00:00:00Z"))).toBe("2026-12");
  });

  it("sends the issue on the 1st for the month just ended, across the year boundary", () => {
    expect(previousMonth(new Date("2026-12-01T06:30:00Z"))).toBe("2026-11");
    expect(previousMonth(new Date("2027-01-01T06:30:00Z"))).toBe("2026-12");
  });

  it("names a month the way the issue title shows it", () => {
    expect(monthName("2026-12")).toBe("December 2026");
    expect(monthName("2027-01")).toBe("January 2027");
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

  it("takes at most the capped number from one site, filling the rest from others", () => {
    const pool = [entry(9, { site: "dev.to" }), entry(9, { site: "dev.to" }), entry(8, { site: "dev.to" }), entry(6)];
    const picks = pickIssue(pool, { maxItems: 3, minFromExplore: 0, siteCaps: { "dev.to": 2 } });
    expect(picks.map((p) => [p.verdict.score, new URL(p.url).hostname])).toEqual([
      [9, "dev.to"],
      [9, "dev.to"],
      [6, "example.com"],
    ]);
  });

  it("won't swap in an explore find that would break a site cap", () => {
    const pool = [entry(9, { site: "dev.to" }), entry(9, { site: "dev.to" }), entry(8), entry(7, { explore: true, site: "dev.to" }), entry(5, { explore: true })];
    const picks = pickIssue(pool, { maxItems: 3, minFromExplore: 1, siteCaps: { "dev.to": 2 } });
    expect(picks.map((p) => p.verdict.score)).toEqual([9, 9, 5]);
  });

  it("returns an empty issue for an empty month", () => {
    expect(pickIssue([])).toEqual([]);
  });
});

describe("appendPool and loadPool", () => {
  it("appends to the month's file, and treats a missing month as empty", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pool-"));
    try {
      expect(await loadPool(dir, "2026-11")).toEqual([]);
      const [a, b] = [entry(8), entry(7)];
      await appendPool(dir, "2026-11", [a]);
      await appendPool(dir, "2026-11", [b]);
      expect((await loadPool(dir, "2026-11")).map((e) => e.key)).toEqual([a.key, b.key]);
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
