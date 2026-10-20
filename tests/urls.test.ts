import { describe, expect, it } from "vitest";
import { canonicalUrl, sourceOf } from "../src/lib/urls.js";

describe("canonicalUrl", () => {
  it("strips tracking parameters, www, fragments and trailing slashes", () => {
    expect(canonicalUrl("https://www.Example.com/post/?utm_source=x&utm_medium=email#comments")).toBe("example.com/post");
  });

  it("keeps meaningful parameters, in a stable order", () => {
    expect(canonicalUrl("https://example.com/search?q=agents&page=2&ref=hn")).toBe("example.com/search?page=2&q=agents");
  });

  it("ignores protocol, so http and https match", () => {
    expect(canonicalUrl("http://example.com/a")).toBe(canonicalUrl("https://example.com/a"));
  });

  it("reduces every YouTube URL shape to the video ID", () => {
    const expected = "youtube.com/watch?v=abc123";
    expect(canonicalUrl("https://www.youtube.com/watch?v=abc123&t=42s&si=xyz")).toBe(expected);
    expect(canonicalUrl("https://youtu.be/abc123?si=xyz")).toBe(expected);
    expect(canonicalUrl("https://m.youtube.com/watch?v=abc123")).toBe(expected);
    expect(canonicalUrl("https://youtube.com/shorts/abc123")).toBe(expected);
  });

  it("reduces GitHub repo pages to the repo, but keeps issues and discussions distinct", () => {
    expect(canonicalUrl("https://github.com/MattPocock/Skills")).toBe("github.com/mattpocock/skills");
    expect(canonicalUrl("https://github.com/mattpocock/skills/tree/main/prd")).toBe("github.com/mattpocock/skills");
    expect(canonicalUrl("https://github.com/mattpocock/skills.git")).toBe("github.com/mattpocock/skills");
    expect(canonicalUrl("https://github.com/mattpocock/skills/discussions/12")).toBe("github.com/mattpocock/skills/discussions/12");
  });

  it("treats twitter.com and x.com as the same, and drops their share parameters", () => {
    expect(canonicalUrl("https://twitter.com/someone/status/1?s=20&t=abc")).toBe("x.com/someone/status/1");
  });

  it("returns null for anything that isn't a web URL", () => {
    expect(canonicalUrl("not a url")).toBeNull();
    expect(canonicalUrl("mailto:me@example.com")).toBeNull();
  });
});

describe("sourceOf", () => {
  it("uses the host for ordinary sites", () => {
    expect(sourceOf("https://www.simonwillison.net/2026/Oct/18/thing/")).toBe("simonwillison.net");
  });

  it("treats each Substack subdomain as its own source", () => {
    expect(sourceOf("https://alice.substack.com/p/x")).not.toBe(sourceOf("https://bob.substack.com/p/y"));
  });

  it("uses the author on platforms where they come first in the path", () => {
    expect(sourceOf("https://github.com/mattpocock/skills")).toBe("github.com/mattpocock");
    expect(sourceOf("https://medium.com/@someone/post-123")).toBe("medium.com/@someone");
  });

  it("uses the subreddit for Reddit", () => {
    expect(sourceOf("https://www.reddit.com/r/ClaudeAI/comments/abc/title/")).toBe("reddit.com/r/claudeai");
  });

  it("groups YouTube videos together unless the link is to a channel", () => {
    expect(sourceOf("https://www.youtube.com/watch?v=abc")).toBe("youtube.com");
    expect(sourceOf("https://www.youtube.com/@SomeChannel")).toBe("youtube.com/@somechannel");
  });
});
