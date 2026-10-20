import { describe, expect, it } from "vitest";
import type { Verdict } from "../src/phases/judge.js";
import type { Summary } from "../src/phases/summarise.js";
import { checkCard, normaliseForMatch, quoteProblems, verifyItem } from "../src/phases/verify.js";

const summary: Summary = {
  title: "Review agents in practice",
  contentType: "blog",
  theme: "lighter-review",
  idea: "A second agent that only reviews catches what the author agent misses.",
  howItWorks: ["The author agent writes code and attaches test output", "A review-only agent checks each diff against the ticket", "Findings need a file and line, or they're dropped"],
  stealThis: "Before your next big refactor, add a review-only agent that checks each diff against the ticket.",
  goDeeperIf: "you review more agent code than you write.",
  quote: "The reviewer never writes code; it only says what's wrong.",
  minutes: 8,
};
const verdict: Verdict = { pass: true, score: 8, theme: "lighter-review", reason: "Clear, copyable review-agent setup." };
const pageText = "Intro.\nThe reviewer never writes code;  it only says what’s wrong.\nMore text.";
const options = { now: new Date("2026-10-20T00:00:00Z"), checkAge: true };
const wordy = (n: number) => Array.from({ length: n }, () => "word").join(" ");

describe("verifyItem (does the item make the issue?)", () => {
  it("keeps a good, recent item", () => {
    expect(verifyItem({ summary, verdict, pageText, publishedDate: "2026-10-15" }, options)).toEqual([]);
  });

  it("drops what the judge failed, and low scores the judge passed anyway", () => {
    expect(verifyItem({ summary, verdict: { ...verdict, pass: false, reason: "launch news" }, pageText, publishedDate: "2026-10-15" }, options)).toEqual([
      "judge failed it: launch news",
    ]);
    expect(verifyItem({ summary, verdict: { ...verdict, score: 3 }, pageText, publishedDate: "2026-10-15" }, options)).toEqual([
      "judge passed it but scored 3, below 5",
    ]);
  });

  it("never drops an item for presentation: long bullets or a bad quote don't count", () => {
    const messy = { ...summary, howItWorks: [wordy(40), wordy(40), wordy(40)], idea: wordy(60), quote: "Not on the page at all." };
    expect(verifyItem({ summary: messy, verdict, pageText, publishedDate: "2026-10-15" }, options)).toEqual([]);
  });

  it("drops a card too empty to show", () => {
    expect(verifyItem({ summary: { ...summary, idea: " ", howItWorks: [] }, verdict, pageText, publishedDate: "2026-10-15" }, options)).toEqual([
      "card has no idea",
      'card has no "how it works" bullets',
    ]);
  });

  it("drops old or undated items, unless the age check is off", () => {
    expect(verifyItem({ summary, verdict, pageText, publishedDate: "2026-09-01" }, options)).toEqual(["published 49 days ago, max 14"]);
    expect(verifyItem({ summary, verdict, pageText, publishedDate: null }, options)).toEqual(["no published date found"]);
    expect(verifyItem({ summary, verdict, pageText, publishedDate: null }, { ...options, checkAge: false })).toEqual([]);
  });
});

describe("checkCard (presentation, used to ask for a tidy-up)", () => {
  it("passes a well-shaped card", () => {
    expect(checkCard(summary, pageText)).toEqual([]);
  });

  it("names every shape problem, so a revision knows exactly what to fix", () => {
    const messy = { ...summary, howItWorks: [wordy(26), "short", "short"], idea: wordy(36), goDeeperIf: wordy(26) };
    expect(checkCard(messy, pageText)).toEqual(["1 bullet(s) over 25 words", "idea is 36 words, max 35", '"go deeper if" is 26 words, max 25']);
    expect(checkCard({ ...summary, howItWorks: ["one", "two"] }, pageText)).toEqual(['2 "how it works" bullets, need 3-5']);
  });
});

describe("quoteProblems", () => {
  it("matches quotes despite curly apostrophes and extra spaces", () => {
    expect(normaliseForMatch("what’s  wrong")).toBe(normaliseForMatch("what's wrong"));
    expect(quoteProblems(summary.quote, pageText)).toEqual([]);
  });

  it("flags quotes that are too long or not on the page", () => {
    expect(quoteProblems("Agents are the future.", pageText)).toEqual(["quote not found in page text"]);
    expect(quoteProblems(wordy(30), wordy(30))).toEqual(["quote is 30 words, max 25"]);
  });
});
