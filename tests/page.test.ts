import { describe, expect, it } from "vitest";
import { extractPublishedDate, extractTitle, fetchPage, htmlToText } from "../src/lib/page.js";

const html = `<!doctype html><html><head>
  <title>Fallback title</title>
  <meta property="og:title" content="Solving code review &amp; more">
  <meta property="article:published_time" content="2026-10-14T09:30:00Z">
  <style>body { color: red }</style>
  <script>console.log("hidden")</script>
</head><body>
  <nav><a href="/">Home</a></nav>
  <article><h1>Solving code review</h1><p>First   paragraph with <em>emphasis</em>.</p><p>It&#39;s &ldquo;fine&rdquo;&nbsp;now.</p></article>
</body></html>`;

describe("htmlToText", () => {
  it("drops scripts and styles, keeps paragraphs on their own lines, and decodes entities", () => {
    const text = htmlToText(html);
    expect(text).not.toContain("console.log");
    expect(text).not.toContain("color: red");
    expect(text).toContain("First paragraph with emphasis.");
    expect(text).toContain("It's");
  });
});

describe("extractTitle", () => {
  it("prefers the og:title over the <title> tag", () => {
    expect(extractTitle(html)).toBe("Solving code review & more");
    expect(extractTitle("<title> Just a title </title>")).toBe("Just a title");
  });
});

describe("extractPublishedDate", () => {
  it("reads the date from common metadata", () => {
    expect(extractPublishedDate(html)).toBe("2026-10-14");
    expect(extractPublishedDate(`<script type="application/ld+json">{"datePublished":"2026-10-02"}</script>`)).toBe("2026-10-02");
    expect(extractPublishedDate(`<time datetime="2026-09-30">Sep 30</time>`)).toBe("2026-09-30");
  });

  it("returns null when there's no usable date", () => {
    expect(extractPublishedDate("<p>no dates here</p>")).toBeNull();
  });
});

describe("fetchPage", () => {
  it("refuses blocked sites like X, without fetching them", async () => {
    const result = await fetchPage("https://x.com/someone/status/1");
    expect(result).toEqual({ ok: false, url: "https://x.com/someone/status/1", reason: "blocked site (see BLOCKED_HOSTS in config/settings.ts)" });
  });
});
