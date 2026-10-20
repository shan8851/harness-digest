import { describe, expect, it } from "vitest";
import { renderHtml, renderMarkdown, renderText, type IssueInput } from "../src/issue/render.js";

const issue: IssueInput = {
  title: "harness-digest · 2026-W43",
  intro: "Three good ones this week.",
  items: [
    {
      url: "https://example.com/review",
      publishedDate: "2026-10-15",
      summary: {
        title: "Review agents <in practice>",
        contentType: "blog",
        theme: "lighter-review",
        technique: "A second agent reviews diffs against the spec.",
        stealThis: "Before your next refactor, add a review-only agent.",
        quote: "The reviewer never writes code.",
        minutes: 8,
      },
      verdict: { pass: true, score: 8, theme: "lighter-review", reason: "Clear setup." },
    },
  ],
  health: "3 runs · 0 failures · 3.10M in · 0.15M out",
};

describe("renderMarkdown", () => {
  it("renders each card in the fixed layout", () => {
    const md = renderMarkdown(issue);
    expect(md).toContain("### [Review agents <in practice>](https://example.com/review)");
    expect(md).toContain("*blog · 8 min · lighter review*");
    expect(md).toContain("**Steal this:** Before your next refactor, add a review-only agent.");
    expect(md).toContain('> "The reviewer never writes code."');
    expect(md).toContain("published 2026-10-15 · score 8/10");
    expect(md).not.toContain("Judged out");
  });

  it("lists judged-out items only when there are some", () => {
    expect(renderMarkdown({ ...issue, rejected: [{ url: "https://hype.example", reason: "launch news" }] })).toContain(
      "- https://hype.example: launch news",
    );
  });
});

describe("renderHtml", () => {
  it("escapes model-written text so it can't break the email", () => {
    const html = renderHtml(issue);
    expect(html).toContain("Review agents &lt;in practice&gt;");
    expect(html).not.toContain("<in practice>");
  });
});

describe("renderText", () => {
  it("reads as plain text, with no markdown syntax", () => {
    const text = renderText({ ...issue, rejected: [{ url: "https://hype.example", reason: "launch news" }] });
    expect(text).toContain("1. Review agents <in practice>");
    expect(text).toContain("   Steal this: Before your next refactor, add a review-only agent.");
    expect(text).toContain("   https://example.com/review");
    expect(text).toContain("- https://hype.example\n  launch news");
    expect(text).not.toMatch(/\*\*|###|\]\(/);
  });
});
