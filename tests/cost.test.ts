import { describe, expect, it } from "vitest";
import { addUsage, costUsd, fromApiUsage, ZERO_USAGE } from "../src/lib/cost.js";
import type Anthropic from "@anthropic-ai/sdk";

describe("costUsd", () => {
  it("prices each token bucket and web searches separately", () => {
    const usage = {
      inputTokens: 1_000_000, // $2.00 on Sonnet
      outputTokens: 100_000, // $1.00
      cacheWriteTokens: 1_000_000, // $2.50 (1.25x input)
      cacheReadTokens: 1_000_000, // $0.20
      webSearches: 20, // $0.20
      webFetches: 10, // free beyond the tokens they add
    };
    expect(costUsd("claude-sonnet-5-5", usage)).toBeCloseTo(5.9, 6);
  });

  it("charges Opus at its own rates", () => {
    expect(costUsd("claude-opus-5-5", { ...ZERO_USAGE, inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(24, 6);
  });
});

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

describe("addUsage", () => {
  it("sums every field", () => {
    const one = { ...ZERO_USAGE, inputTokens: 1, webSearches: 1 };
    expect(addUsage(one, one)).toEqual({ ...ZERO_USAGE, inputTokens: 2, webSearches: 2 });
  });
});
