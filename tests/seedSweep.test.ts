import { describe, expect, it } from "vitest";
import type { SeenEntry } from "../src/lib/dedupe.js";
import { indexLinks, sweepSeeds, type FetchText, type Seed } from "../src/phases/seedSweep.js";

const since = new Date("2026-10-16T00:00:00Z");

const feedXml = `<rss><channel>
  <item><title>Fresh post</title><link>https://blog.example/fresh</link><pubDate>Sun, 18 Oct 2026 00:00:00 GMT</pubDate></item>
  <item><title>Old post</title><link>https://blog.example/old</link><pubDate>Thu, 01 Oct 2026 00:00:00 GMT</pubDate></item>
  <item><title>Remembered post</title><link>https://blog.example/known?utm_source=rss</link><pubDate>Sat, 17 Oct 2026 00:00:00 GMT</pubDate></item>
</channel></rss>`;

const commitsAtom = `<feed><entry><title>Add prd skill</title><link href="https://github.com/o/r/commit/1"/><updated>2026-10-19T00:00:00Z</updated></entry></feed>`;

const indexHtml = `<nav><a href="/">Home</a><a href="/engineering">All</a></nav>
  <a href="/engineering/newest-post"><h3>Newest post</h3></a>
  <a href="/engineering/older-post">Older post</a>
  <a href="/engineering/newest-post">Newest post (again)</a>
  <a href="https://elsewhere.example/engineering/x">Off-site</a>`;

const pages: Record<string, string> = {
  "https://blog.example/feed": feedXml,
  "https://github.com/o/r/commits/main.atom": commitsAtom,
  "https://site.example/engineering": indexHtml,
};
const fakeFetch: FetchText = async (url) => (url in pages ? { ok: true, text: pages[url]! } : { ok: false, reason: "HTTP 404" });

const seeds: Seed[] = [
  { name: "Blog", type: "feed", url: "https://blog.example/", feed: "https://blog.example/feed" },
  { name: "Repo", type: "repo", url: "https://github.com/o/r", feed: "https://github.com/o/r/commits/main.atom" },
  { name: "Index", type: "index", url: "https://site.example/engineering", linkPattern: "^/engineering/[^/]+$" },
  { name: "Broken", type: "feed", url: "https://broken.example/", feed: "https://broken.example/feed" },
];
const seen: SeenEntry[] = [{ key: "blog.example/known", url: "https://blog.example/known", title: "Remembered post", firstSeen: "2026-10-10T00:00:00Z", status: "rejected" }];

describe("indexLinks", () => {
  it("takes matching same-site links in page order, once each", () => {
    expect(indexLinks(indexHtml, "https://site.example/engineering", "^/engineering/[^/]+$")).toEqual([
      { url: "https://site.example/engineering/newest-post", title: "Newest post", published: null },
      { url: "https://site.example/engineering/older-post", title: "Older post", published: null },
    ]);
  });
});

describe("sweepSeeds", () => {
  it("keeps fresh feed items, turns repo activity into the repo, reads index pages, and skips what's remembered", async () => {
    const { candidates } = await sweepSeeds(seeds, { since, seen, fetchText: fakeFetch });
    expect(candidates.map((c) => [c.foundBy, c.url])).toEqual([
      ["Blog", "https://blog.example/fresh"],
      ["Repo", "https://github.com/o/r"],
      ["Index", "https://site.example/engineering/newest-post"],
      ["Index", "https://site.example/engineering/older-post"],
    ]);
    expect(candidates[1]!.source).toBe("github.com/o");
  });

  it("reports a failing seed without stopping the others", async () => {
    const { reports } = await sweepSeeds(seeds, { since, seen, fetchText: fakeFetch });
    expect(reports.find((r) => r.name === "Broken")).toEqual({ name: "Broken", found: 0, error: "HTTP 404" });
    expect(reports.find((r) => r.name === "Blog")).toEqual({ name: "Blog", found: 2 });
  });

  it("skips items whose title matches the seed's excludeTitle pattern", async () => {
    const roundupSeed: Seed = { ...seeds[0]!, excludeTitle: "^Fresh" };
    const { candidates, reports } = await sweepSeeds([roundupSeed], { since, seen, fetchText: fakeFetch });
    // "Fresh post" is excluded; the only other in-window item is already in memory.
    expect(candidates).toEqual([]);
    expect(reports).toEqual([{ name: "Blog", found: 1 }]);
  });

  it("keeps only items in a matching category when the seed sets includeCategory", async () => {
    const xml = `<rss><channel>
      <item><title>Eng post</title><link>https://co.example/eng</link><category>Engineering</category><pubDate>Sun, 18 Oct 2026 00:00:00 GMT</pubDate></item>
      <item><title>Customer story</title><link>https://co.example/story</link><category>Story</category><pubDate>Sun, 18 Oct 2026 00:00:00 GMT</pubDate></item>
    </channel></rss>`;
    const fetchText: FetchText = async () => ({ ok: true, text: xml });
    const seed: Seed = { name: "Co", type: "feed", url: "https://co.example/", feed: "https://co.example/rss", includeCategory: "^Engineering$" };
    const { candidates } = await sweepSeeds([seed], { since, seen: [], fetchText });
    expect(candidates.map((c) => c.title)).toEqual(["Eng post"]);
  });

  it("says nothing about a repo with no commits in the window", async () => {
    const { candidates } = await sweepSeeds([seeds[1]!], { since: new Date("2026-10-20T00:00:00Z"), seen: [], fetchText: fakeFetch });
    expect(candidates).toEqual([]);
  });
});
