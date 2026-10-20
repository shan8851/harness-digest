// Turns the `usage` block on every API response into dollars, so each phase
// and each run knows exactly what it cost. Prices live in config/settings.ts.

import type Anthropic from "@anthropic-ai/sdk";
import {
  CACHE_WRITE_MULTIPLIER,
  PRICES,
  WEB_SEARCH_USD_PER_REQUEST,
  type ModelId,
} from "../../config/settings.js";

/** Our flattened, summable view of the API's usage block. */
export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  webSearches: number;
  webFetches: number;
}

export const ZERO_USAGE: UsageTotals = {
  inputTokens: 0,
  outputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  webSearches: 0,
  webFetches: 0,
};

export function fromApiUsage(usage: Anthropic.Usage): UsageTotals {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    webSearches: usage.server_tool_use?.web_search_requests ?? 0,
    webFetches: usage.server_tool_use?.web_fetch_requests ?? 0,
  };
}

export function addUsage(a: UsageTotals, b: UsageTotals): UsageTotals {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    webSearches: a.webSearches + b.webSearches,
    webFetches: a.webFetches + b.webFetches,
  };
}

/** Cost in USD. `input_tokens` excludes cached tokens, so the three input buckets don't overlap. */
export function costUsd(model: ModelId, usage: UsageTotals): number {
  const price = PRICES[model];
  const perToken = (perMillion: number) => perMillion / 1_000_000;
  return (
    usage.inputTokens * perToken(price.input) +
    usage.cacheWriteTokens * perToken(price.input * CACHE_WRITE_MULTIPLIER) +
    usage.cacheReadTokens * perToken(price.cacheRead) +
    usage.outputTokens * perToken(price.output) +
    usage.webSearches * WEB_SEARCH_USD_PER_REQUEST
  );
}
