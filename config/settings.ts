// Every tunable number lives here, so changing the harness's behaviour never
// means hunting through phase code. See docs/SPEC.md for the reasoning.

// Where the harness reads and writes, relative to the repo root. Everything
// under generated/ is written by runs and committed, but isn't for hand-editing.
// issues/ is the readable archive.
export const PATHS = {
  memory: "generated/memory.jsonl", // every link considered in the last 30 days
  pool: "generated/pool", // one file per ISO week of passing items
  runs: "generated/runs", // one JSON log per run
  issues: "issues", // the weekly issues, as markdown
  local: "generated/local", // smoke and explore outputs; git-ignored
} as const;

export const THEMES = [
  "harness-design",
  "verification",
  "lighter-review",
  "non-engineers",
  "real-setups",
] as const;
export type Theme = (typeof THEMES)[number];

export const CONTENT_TYPES = ["blog", "repo", "thread"] as const;
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
  explore: "medium",
  weeklyIntro: "low",
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

export const SCAN = {
  // Items fetched, summarised and judged at the same time. Keeps a scan to a
  // few minutes without hammering any one API.
  concurrency: 4,
} as const;

export const WEEKLY = {
  maxItems: 7,
  // At least this many items explore found, when any passed, so the issue
  // isn't only the seed list's usual names.
  minFromExplore: 2,
} as const;

export const EXPLORE = {
  // Hard cap on searches in any one explore call (the tool's max_uses). Each
  // search puts ~28k tokens of results in context, so this is the main cost
  // lever: the model tends to search more than it's asked to.
  maxSearchesPerCall: 5,
  // A long search turn can pause server-side; resume it at most this often.
  maxPauseResumes: 3,
  // At most this many explore candidates go on to summarise and judge per
  // scan. Bounds the expensive part even when search is generous.
  maxCandidates: 15,
} as const;

export const SEED_SWEEP = {
  // At most this many new candidates from any one seed per scan, so a busy
  // feed (or a first run with an empty memory) can't swamp the pipeline.
  maxItemsPerSeed: 10,
  fetchTimeoutMs: 20_000,
} as const;

// Sites the harness never looks at. They're excluded from web search, dropped
// before they count as candidates, and refused at fetch time.
// - X only serves content to a logged-in browser (a fetch returns a sign-in
//   wall). Revisit if X content turns out to be worth paying for.
// - Video sites: a fetch returns a JavaScript shell, not a transcript, so the
//   summariser would be writing about nothing. Searching for them wasted
//   tokens in the first real explore run.
export const BLOCKED_HOSTS = ["x.com", "twitter.com", "youtube.com", "youtu.be", "vimeo.com"] as const;

export const ITEMS = {
  // Page text is capped before it reaches a model, to bound tokens per item.
  // Long pages lose their tail; the run log notes when this happens.
  maxPageChars: 80_000,
  // Quotes longer than this fail verification (keeps us well clear of copying).
  maxQuoteWords: 25,
  // Card shape. The prompt asks for less; these are the hard limits that
  // stop a card drifting into a full summary.
  minBullets: 3,
  maxBullets: 5,
  maxBulletWords: 25,
  maxIdeaWords: 35,
  maxGoDeeperWords: 25,
  // A card that breaks the shape limits is sent back with the exact problems
  // this many times before the item is dropped.
  maxCardRevisions: 2,
  // Dated items published longer ago than this are dropped. Undated items
  // (many repos and threads) are allowed; memory stops them repeating.
  maxAgeDays: 7,
  // The judge's score must be at least this to pass, whatever it says.
  minScore: 5,
} as const;

export const MEMORY = {
  // Entries in the memory file older than this are pruned on every run, so
  // the file stays at a steady ~600-700 lines however long the harness runs.
  // Longer than maxAgeDays, so anything that ages out of memory would already
  // fail the freshness check. The issues/ archive is the permanent record.
  seenRetentionDays: 30,
  // Two titles at or above this word-overlap score count as the same story.
  titleSimilarityThreshold: 0.8,
  // A scan never looks back further than this, even after a long outage.
  maxLookbackDays: 7,
} as const;
