// The November 2026 taste changes, from the first judge eval: readability
// nudges the ranking, podcasts only appear as a bonus, and near-duplicate
// ideas are cut to the best one.

import { describe, expect, it } from "vitest";
import { renderMarkdown, renderText } from "../src/issue/render.js";
import { adjustedScore, carryOver, dropSameIdea, pickBonus, pickIssue, type PoolEntry } from "../src/lib/pool.js";

let n = 0;
function entry(score: number, opts: { readability?: number; podcast?: boolean; carriedOver?: boolean } = {}): PoolEntry {
  n++;
  return {
    url: `https://example.com/${n}`,
    key: `example.com/${n}`,
    foundBy: "explore: verification",
    source: `example${n}.com`,
    scannedAt: "2026-11-05T02:00:00.000Z",
    publishedDate: null,
    summary: {
      title: `Distinct post ${n} on topic ${n * 13}`,
      contentType: opts.podcast ? "podcast" : "blog",
      theme: "verification",
      idea: "An idea.",
      howItWorks: ["a", "b", "c"],
      stealThis: "Steal it.",
      goDeeperIf: "you want more.",
      quote: "",
      minutes: 5,
    },
    verdict: { pass: true, score, theme: "verification", reason: "Good.", ...(opts.readability === undefined ? {} : { readability: opts.readability }) },
    ...(opts.carriedOver ? { carriedOver: true } : {}),
  };
}

describe("adjustedScore", () => {
  it("lets a readable 7 outrank an 8 that's a wall of text", () => {
    const readable = entry(7, { readability: 1 });
    const wall = entry(8, { readability: -1 });
    expect(adjustedScore(readable)).toBe(8);
    expect(adjustedScore(wall)).toBe(7);
    expect(pickIssue([wall, readable]).map((e) => e.key)).toEqual([readable.key, wall.key]);
  });

  it("never pushes a pass below the pass mark or above 10", () => {
    expect(adjustedScore(entry(5, { readability: -1 }))).toBe(5);
    expect(adjustedScore(entry(10, { readability: 1 }))).toBe(10);
  });

  it("treats verdicts saved before readability existed as neutral", () => {
    expect(adjustedScore(entry(7))).toBe(7);
  });

  it("ignores readability for podcasts, which are listened to", () => {
    expect(adjustedScore(entry(8, { podcast: true, readability: -1 }))).toBe(8);
  });

  it("decides carry-over on the adjusted score", () => {
    expect(carryOver([entry(7, { readability: 1 }), entry(8, { readability: -1 })], new Set())).toHaveLength(1);
  });
});

describe("podcasts", () => {
  it("never go in the main list", () => {
    const podcast = entry(10, { podcast: true });
    expect(pickIssue([podcast, entry(6)]).map((e) => e.key)).not.toContain(podcast.key);
  });

  it("make the bonus listen only at 8 or more, best first, one at most", () => {
    const top = entry(9, { podcast: true });
    const good = entry(8, { podcast: true });
    const ordinary = entry(7, { podcast: true });
    expect(pickBonus([ordinary, good, top, entry(9)])).toEqual([top]);
    expect(pickBonus([ordinary])).toEqual([]);
  });

  it("render in their own section after the main cards", () => {
    const issue = { title: "t", intro: "i", items: [entry(7)], bonus: [entry(9, { podcast: true })], health: "h" };
    const md = renderMarkdown(issue);
    expect(md.indexOf("## Bonus listen")).toBeGreaterThan(md.indexOf("### 1."));
    expect(renderText(issue)).toContain("BONUS LISTEN");
    expect(renderMarkdown({ ...issue, bonus: [] })).not.toContain("Bonus listen");
  });
});

describe("dropSameIdea", () => {
  it("keeps the highest-ranked item of each group, whatever order the model gives", () => {
    const best = entry(8);
    const weaker = entry(6);
    const other = entry(7);
    const { kept, dropped } = dropSameIdea([weaker, best, other], [[weaker.key, best.key]]);
    expect(kept.map((e) => e.key).sort()).toEqual([best.key, other.key].sort());
    expect(dropped).toEqual([{ key: weaker.key, keptInstead: best.key }]);
  });

  it("ignores unknown keys and groups of one, so a bad grouping can't drop anything else", () => {
    const a = entry(8);
    const b = entry(7);
    const { kept } = dropSameIdea([a, b], [[a.key, "not-in-the-pool"], [b.key]]);
    expect(kept).toHaveLength(2);
  });

  it("ignores a group that overlaps one already used, so a chain can't drop every item in it", () => {
    const a = entry(9);
    const b = entry(8);
    const c = entry(7);
    const { kept, dropped } = dropSameIdea([a, b, c], [[b.key, c.key], [a.key, b.key]]);
    expect(dropped).toEqual([{ key: c.key, keptInstead: b.key }]);
    expect(kept.map((e) => e.key).sort()).toEqual([a.key, b.key].sort());
  });

  it("never groups a podcast with a post: different content types are different resources", () => {
    const post = entry(8);
    const podcast = entry(7, { podcast: true });
    expect(dropSameIdea([post, podcast], [[post.key, podcast.key]]).dropped).toEqual([]);
  });
});
