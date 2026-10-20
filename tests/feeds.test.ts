import { describe, expect, it } from "vitest";
import { parseFeed } from "../src/lib/feeds.js";

const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Blog</title>
  <item><title><![CDATA[Evals for agents & you]]></title><link>https://example.com/evals</link><category><![CDATA[Engineering]]></category><pubDate>Mon, 19 Oct 2026 08:00:00 GMT</pubDate></item>
  <item><title>Relative link</title><link>/posts/relative</link></item>
</channel></rss>`;

const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Blog</title>
  <entry><title type="html">Harness &lt;design&gt;</title>
    <link rel="self" href="https://example.com/self"/><link rel="alternate" href="https://example.com/harness"/>
    <category term="agents"/><updated>2026-10-18T10:00:00Z</updated><published>2026-10-17T09:00:00Z</published></entry>
  <entry><title>Only updated</title><link href="https://example.com/updated"/><updated>2026-10-16T00:00:00Z</updated></entry>
</feed>`;

describe("parseFeed", () => {
  it("reads RSS items, unwrapping CDATA and resolving relative links", () => {
    expect(parseFeed(rss, "https://example.com/feed.xml")).toEqual([
      { title: "Evals for agents & you", link: "https://example.com/evals", published: "2026-10-19T08:00:00.000Z", categories: ["Engineering"] },
      { title: "Relative link", link: "https://example.com/posts/relative", published: null, categories: [] },
    ]);
  });

  it("reads Atom entries, preferring the alternate link and the published date", () => {
    expect(parseFeed(atom, "https://example.com/atom")).toEqual([
      { title: "Harness <design>", link: "https://example.com/harness", published: "2026-10-17T09:00:00.000Z", categories: ["agents"] },
      { title: "Only updated", link: "https://example.com/updated", published: "2026-10-16T00:00:00.000Z", categories: [] },
    ]);
  });

  it("returns nothing for something that isn't a feed", () => {
    expect(parseFeed("<html><body>hello</body></html>", "https://example.com")).toEqual([]);
  });
});
