import { describe, expect, it } from "vitest";
import type { Verdict } from "../src/phases/judge.js";
import type { Summary } from "../src/phases/summarise.js";
import { normaliseForMatch, verifyItem } from "../src/phases/verify.js";

const summary: Summary = {
  title: "Review agents in practice",
  contentType: "blog",
  theme: "lighter-review",
  technique: "Run a second agent whose only job is to review the first agent's diff against the spec.",
  stealThis: "Before your next big refactor, add a review-only agent that checks each diff against the ticket.",
  quote: "The reviewer never writes code; it only says what's wrong.",
  minutes: 8,
};
const verdict: Verdict = { pass: true, score: 8, theme: "lighter-review", reason: "Clear, copyable review-agent setup." };
const pageText = "Intro.\nThe reviewer never writes code;  it only says what’s wrong.\nMore text.";
const options = { now: new Date("2026-10-20T00:00:00Z"), checkAge: true };

describe("verifyItem", () => {
  it("passes a good item whose quote is on the page", () => {
    expect(verifyItem({ summary, verdict, pageText, publishedDate: "2026-10-15" }, options)).toEqual([]);
  });

  it("matches quotes despite curly apostrophes and extra spaces", () => {
    expect(normaliseForMatch("what’s  wrong")).toBe(normaliseForMatch("what's wrong"));
  });

  it("rejects a quote the page doesn't contain", () => {
    const problems = verifyItem({ summary: { ...summary, quote: "Agents are the future." }, verdict, pageText, publishedDate: "2026-10-15" }, options);
    expect(problems).toContain("quote not found in page text");
  });

  it("rejects quotes over the word limit", () => {
    const long = Array.from({ length: 30 }, () => "word").join(" ");
    const problems = verifyItem({ summary: { ...summary, quote: long }, verdict, pageText: long, publishedDate: "2026-10-15" }, options);
    expect(problems).toEqual(["quote is 30 words, max 25"]);
  });

  it("rejects what the judge failed, and low scores the judge passed anyway", () => {
    expect(verifyItem({ summary, verdict: { ...verdict, pass: false, reason: "launch news" }, pageText, publishedDate: "2026-10-15" }, options)).toEqual([
      "judge failed it: launch news",
    ]);
    expect(verifyItem({ summary, verdict: { ...verdict, score: 3 }, pageText, publishedDate: "2026-10-15" }, options)).toEqual([
      "judge passed it but scored 3, below 5",
    ]);
  });

  it("rejects old or undated items, unless the age check is off", () => {
    expect(verifyItem({ summary, verdict, pageText, publishedDate: "2026-09-01" }, options)).toEqual(["published 49 days ago, max 14"]);
    expect(verifyItem({ summary, verdict, pageText, publishedDate: null }, options)).toEqual(["no published date found"]);
    expect(verifyItem({ summary, verdict, pageText, publishedDate: null }, { ...options, checkAge: false })).toEqual([]);
  });
});
