// Every tunable number lives here, so changing the harness's behaviour never
// means hunting through phase code. See docs/SPEC.md for the reasoning.

export const THEMES = [
  "harness-design",
  "verification",
  "lighter-review",
  "non-engineers",
  "real-setups",
] as const;
export type Theme = (typeof THEMES)[number];

export const CONTENT_TYPES = ["blog", "video", "repo", "thread"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

// Model routing: Sonnet does the token-heavy finding and reading, Opus makes
// the call that matters (does this item have a real teaching moment?).
export const MODELS = {
  seedSweep: "claude-sonnet-5-5",
  explore: "claude-sonnet-5-5",
  summarise: "claude-sonnet-5-5",
  judge: "claude-opus-5-5",
  weeklyIntro: "claude-sonnet-5-5",
} as const;
export type ModelId = (typeof MODELS)[keyof typeof MODELS];

// Minimums for the explore phase, checked in code after each attempt. Only
// candidates we haven't seen before count, so re-finding old links never
// satisfies a quota.
export interface ExploreQuotas {
  minSearches: number;
  minNewCandidates: number;
  minNewSources: number;
  minSearchesPerTheme: number;
  minSearchesWeakestTheme: number;
  requiredTypes: readonly ContentType[];
  maxRetries: number;
}

export const EXPLORE_QUOTAS: ExploreQuotas = {
  minSearches: 20,
  minNewCandidates: 20,
  minNewSources: 10, // distinct sources outside the seed list
  minSearchesPerTheme: 2,
  minSearchesWeakestTheme: 4, // the theme with the fewest passes this week
  requiredTypes: CONTENT_TYPES, // at least one new candidate of each
  maxRetries: 2,
};

export const BUDGETS_USD = {
  // Runaway guard only: well above a normal run, so a healthy run never hits it.
  perRun: 10,
  // Once month-to-date spend passes this, runs skip explore (seed sweep only).
  perMonth: 75,
} as const;

// List prices in USD per million tokens (checked 2026-10-20). Cache writes
// are 1.25x the input price; web search is billed per request; web fetch
// costs only the tokens it adds.
export const PRICES = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
} as const satisfies Record<ModelId, { input: number; output: number; cacheRead: number }>;
export const CACHE_WRITE_MULTIPLIER = 1.25;
export const WEB_SEARCH_USD_PER_REQUEST = 10 / 1000;

export const MEMORY = {
  // `passed` and `rejected` entries in state/seen.jsonl older than this are
  // pruned; `featured` entries are kept forever.
  seenRetentionDays: 90,
  // Two titles at or above this word-overlap score count as the same story.
  titleSimilarityThreshold: 0.8,
  // A scan never looks back further than this, even after a long outage.
  maxLookbackDays: 7,
} as const;
