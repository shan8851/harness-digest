import { describe, expect, it } from "vitest";
import { CONTENT_TYPES, THEMES, type Theme } from "../config/settings.js";
import { checkExploreQuotas, gapMessage, type ExploreReport } from "../src/lib/quotas.js";

const quotas = {
  minSearches: 6,
  minNewCandidates: 4,
  minNewSources: 3,
  minSearchesPerTheme: 1,
  minSearchesWeakestTheme: 2,
  requiredTypes: CONTENT_TYPES,
  maxRetries: 2,
};

function searches(perTheme: number, extraForWeakest = 0, weakest: Theme = "non-engineers") {
  return Object.fromEntries(
    THEMES.map((theme) => {
      const count = perTheme + (theme === weakest ? extraForWeakest : 0);
      return [theme, Array.from({ length: count }, (_, i) => `${theme} query ${i}`)];
    }),
  ) as Record<Theme, string[]>;
}

const goodCandidates: ExploreReport["newCandidates"] = [
  { source: "a.com", type: "blog" },
  { source: "b.com", type: "blog" },
  { source: "github.com/someone", type: "repo" },
  { source: "reddit.com/r/claudeai", type: "thread" },
];

describe("checkExploreQuotas", () => {
  it("passes when every minimum is met", () => {
    const report: ExploreReport = { searchesByTheme: searches(1, 1), newCandidates: goodCandidates };
    const result = checkExploreQuotas(report, new Set(), "non-engineers", quotas);
    expect(result).toEqual({ met: true, shortfalls: [] });
  });

  it("counts repeated queries once, so the model can't pad its total", () => {
    const report: ExploreReport = {
      searchesByTheme: { ...searches(1, 1), "harness-design": ["same query", "Same Query ", "same query"] },
      newCandidates: goodCandidates,
    };
    const result = checkExploreQuotas(report, new Set(), "harness-design", quotas);
    expect(result.shortfalls).toContain('theme "harness-design" has 1 searches, need 2');
  });

  it("does not count seed sources towards new sources", () => {
    const seeds = new Set(["a.com", "github.com/someone"]);
    const report: ExploreReport = { searchesByTheme: searches(1, 1), newCandidates: goodCandidates };
    const result = checkExploreQuotas(report, seeds, "non-engineers", quotas);
    expect(result.shortfalls).toContain("2 new sources outside the seed list, need 3");
  });

  it("names every gap, so a retry knows exactly what to fix", () => {
    const report: ExploreReport = { searchesByTheme: searches(1), newCandidates: [{ source: "a.com", type: "blog" }] };
    const result = checkExploreQuotas(report, new Set(), "non-engineers", quotas);
    expect(result.met).toBe(false);
    expect(result.shortfalls).toEqual([
      "5 distinct searches, need 6",
      'theme "non-engineers" has 1 searches, need 2',
      "1 new candidates, need 4",
      "1 new sources outside the seed list, need 3",
      "no new repo, thread found",
    ]);
    expect(gapMessage(result)).toContain("- no new repo, thread found");
  });
});
