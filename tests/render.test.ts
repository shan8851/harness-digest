import { describe, expect, it } from "vitest";
import { metaLine, renderHtml, renderMarkdown, renderText, type IssueInput, type IssueItem } from "../src/issue/render.js";

const item = (n: number): IssueItem => ({
  url: `https://example.com/review-${n}`,
  publishedDate: "2026-10-15",
  summary: {
    title: n === 1 ? "Review agents <in practice>" : `Another post ${n}`,
    contentType: "blog",
    theme: "lighter-review",
    idea: "Most review happens before a human looks.",
    howItWorks: ["Agents attach test output as proof", "A fresh-context subagent reviews the diff", "Humans see only what's left"],
    stealThis: "Before your next refactor, add a review-only agent.",
    goDeeperIf: "you're the bottleneck on reviewing agent output.",
    quote: "The reviewer never writes code.",
    minutes: 14,
  },
  verdict: { pass: true, score: 9, theme: "lighter-review", reason: "Clear setup." },
});

const issue: IssueInput = {
  title: "harness-digest · 2026-W43",
  intro: "Two good ones this week.",
  items: [item(1), item(2)],
  health: "3 runs · 0 failures · 3.100M in · 0.150M out",
};

describe("metaLine", () => {
  it("puts type, length, theme, score and date on one line", () => {
    expect(metaLine(item(1))).toBe("blog · 14 min · lighter review · 9/10 · 15 Oct");
  });
});

describe("renderMarkdown (the archive)", () => {
  it("renders contents, then each card in the locked format, with the quote kept for the record", () => {
    const md = renderMarkdown(issue);
    expect(md).toContain("## This week\n\n1. **Review agents <in practice>**: Most review happens before a human looks.");
    expect(md).toContain("### 1. [Review agents <in practice>](https://example.com/review-1)");
    expect(md).toContain("**How it works**\n- Agents attach test output as proof\n- A fresh-context subagent reviews the diff");
    expect(md).toContain("**Steal this:** Before your next refactor, add a review-only agent.");
    expect(md).toContain("**Go deeper if:** you're the bottleneck on reviewing agent output.");
    expect(md).toContain('> "The reviewer never writes code."');
  });

  it("skips the contents list for a single item, and lists judged-out items only when there are some", () => {
    const single = renderMarkdown({ ...issue, items: [item(1)] });
    expect(single).not.toContain("## This week");
    expect(single).not.toContain("Judged out");
    expect(renderMarkdown({ ...issue, rejected: [{ url: "https://hype.example", reason: "launch news" }] })).toContain(
      "- https://hype.example: launch news",
    );
  });
});

describe("renderText (the email's text part)", () => {
  it("reads as plain text, without markdown syntax or the quote", () => {
    const text = renderText({ ...issue, rejected: [{ url: "https://hype.example", reason: "launch news" }] });
    expect(text).toContain("THIS WEEK\n\n1. Review agents <in practice>\n   Most review happens before a human looks.");
    expect(text).toContain("   How it works\n   • Agents attach test output as proof");
    expect(text).toContain("   Steal this: Before your next refactor, add a review-only agent.");
    expect(text).toContain("   Go deeper if: you're the bottleneck on reviewing agent output.");
    expect(text).toContain("- https://hype.example\n  launch news");
    expect(text).not.toMatch(/\*\*|###|\]\(/);
    expect(text).not.toContain("The reviewer never writes code.");
  });
});

describe("renderHtml (the email)", () => {
  it("escapes model-written text so it can't break the email", () => {
    const html = renderHtml(issue);
    expect(html).toContain("Review agents &lt;in practice&gt;");
    expect(html).not.toContain("<in practice>");
  });

  it("includes the contents box and every card section, but not the quote", () => {
    const html = renderHtml(issue);
    expect(html).toContain("This week");
    expect(html).toContain("How it works");
    expect(html).toContain("<strong>Go deeper if:</strong>");
    expect(html).not.toContain("The reviewer never writes code.");
  });
});
