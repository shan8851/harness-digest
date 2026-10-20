// Turns the `usage` block on every API response into totals we can add up
// per phase and per run. Tokens and request counts only: dollars live on the
// Console dashboard, where prices are always current.

import type Anthropic from "@anthropic-ai/sdk";

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

/** Every token billed, in or out. `input_tokens` excludes cached tokens, so nothing is counted twice. */
export function totalTokens(usage: UsageTotals): number {
  return usage.inputTokens + usage.cacheWriteTokens + usage.cacheReadTokens + usage.outputTokens;
}

/** 1_234_567 → "1.23M". Easy to multiply by a per-million price in your head. */
export function millions(tokens: number): string {
  return `${(tokens / 1_000_000).toFixed(2)}M`;
}

/** One readable line, e.g. "1.24M in · 0.06M out · 23 searches · 18 fetches". */
export function describeUsage(usage: UsageTotals): string {
  const input = usage.inputTokens + usage.cacheWriteTokens + usage.cacheReadTokens;
  const cached = usage.cacheReadTokens ? ` (${millions(usage.cacheReadTokens)} cached)` : "";
  return `${millions(input)} in${cached} · ${millions(usage.outputTokens)} out · ${usage.webSearches} searches · ${usage.webFetches} fetches`;
}
