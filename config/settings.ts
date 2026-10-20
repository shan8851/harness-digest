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

// How hard each model thinks. Judging is the product, so it gets "high";
// summarising is routine reading, so "medium" is plenty.
export const EFFORT = {
  summarise: "medium",
  judge: "high",
} as const;

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

// Money is capped by the Console workspace spend limit and visible on the
// Console dashboard, so the harness only tracks tokens. This is a runaway
// guard (a loop bug, a retry storm), set several times above a normal run so
// a healthy run never hits it.
export const RUN_LIMITS = {
  maxTokensPerRun: 5_000_000,
} as const;

// Sites the harness never looks at. X only serves content to a logged-in
// browser, so fetching it returns a sign-in wall. These are excluded from web
// search, dropped before they count as candidates, and refused at fetch time.
// Revisit if X content turns out to be worth paying for.
export const BLOCKED_HOSTS = ["x.com", "twitter.com"] as const;

export const ITEMS = {
  // Page text is capped before it reaches a model, to bound tokens per item.
  // Long pages lose their tail; the run log notes when this happens.
  maxPageChars: 80_000,
  // Quotes longer than this fail verification (keeps us well clear of copying).
  maxQuoteWords: 25,
  // Items published longer ago than this fail verification.
  maxAgeDays: 14,
  // The judge's score must be at least this to pass, whatever it says.
  minScore: 5,
} as const;

export const MEMORY = {
  // `passed` and `rejected` entries in state/seen.jsonl older than this are
  // pruned; `featured` entries are kept forever.
  seenRetentionDays: 90,
  // Two titles at or above this word-overlap score count as the same story.
  titleSimilarityThreshold: 0.8,
  // A scan never looks back further than this, even after a long outage.
  maxLookbackDays: 7,
} as const;
