import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { addUsage, describeUsage, fromApiUsage, millions, totalTokens, ZERO_USAGE } from "../src/lib/usage.js";

describe("fromApiUsage", () => {
  it("flattens the API usage block and treats missing fields as zero", () => {
    const usage = {
      input_tokens: 10,
      output_tokens: 5,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: 3,
      server_tool_use: { web_search_requests: 2, web_fetch_requests: 1 },
    } as unknown as Anthropic.Usage;
    expect(fromApiUsage(usage)).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      cacheWriteTokens: 0,
      cacheReadTokens: 3,
      webSearches: 2,
      webFetches: 1,
    });
  });
});

describe("addUsage and totalTokens", () => {
  it("sums every field, and counts all four token buckets as billed tokens", () => {
    const one = { ...ZERO_USAGE, inputTokens: 1, outputTokens: 2, cacheWriteTokens: 3, cacheReadTokens: 4, webSearches: 1 };
    const two = addUsage(one, one);
    expect(two).toEqual({ ...ZERO_USAGE, inputTokens: 2, outputTokens: 4, cacheWriteTokens: 6, cacheReadTokens: 8, webSearches: 2 });
    expect(totalTokens(two)).toBe(20);
  });
});

describe("describeUsage", () => {
  it("reads as one line, in millions of tokens", () => {
    expect(millions(1_234_567)).toBe("1.23M");
    const usage = { ...ZERO_USAGE, inputTokens: 1_000_000, cacheReadTokens: 240_000, outputTokens: 60_000, webSearches: 23, webFetches: 18 };
    expect(describeUsage(usage)).toBe("1.24M in (0.24M cached) · 0.06M out · 23 searches · 18 fetches");
  });
});
