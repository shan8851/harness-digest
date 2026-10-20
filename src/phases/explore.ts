// Phase: explore, the forced wider search. Sonnet searches the web, one call
// per theme, and the code checks its work against EXPLORE_QUOTAS.
//
// Why it's built this way:
// - Basic web search (web_search_20250305), not the newer dynamic-filtering
//   version. The newer one runs searches inside a code sandbox, so the
//   queries and result URLs may never appear in the response. With the basic
//   version every search and every result is visible, which is what lets us
//   count real searches and reject URLs no search returned.
// - Picks come back through a strict `submit_candidates` tool rather than
//   structured output, which can't be combined with the citations web search
//   produces. If the model never submits, every real search result is used,
//   so a run never comes back empty.
// - Content type comes from the URL (contentTypeOf), so the "one of each
//   type" quota can't be met by labelling.

import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { BLOCKED_HOSTS, EFFORT, EXPLORE, EXPLORE_QUOTAS, MODELS, THEMES, type Theme } from "../../config/settings.js";
import { anthropic, FALLBACK_BETA } from "../lib/anthropic.js";
import { splitUnseen } from "../lib/dedupe.js";
import { checkExploreQuotas, gapMessage, type QuotaResult } from "../lib/quotas.js";
import { loadRubric } from "../lib/rubric.js";
import { canonicalUrl, contentTypeOf, isBlocked, sourceOf } from "../lib/urls.js";
import { addUsage, fromApiUsage, ZERO_USAGE, type UsageTotals } from "../lib/usage.js";
import type { Candidate } from "./seedSweep.js";

type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type Message = Anthropic.Beta.Messages.BetaMessage;
export type CallModel = (params: Params) => Promise<Message>;

const defaultCallModel: CallModel = (params) => anthropic().beta.messages.create(params);

const SUBMIT_TOOL = {
  name: "submit_candidates",
  description: "Submit the URLs from your search results that look most likely to pass the rubric. Call this once, when you've finished searching.",
  strict: true,
  input_schema: {
    type: "object" as const,
    properties: {
      candidates: {
        type: "array",
        items: {
          type: "object",
          properties: { url: { type: "string" }, why: { type: "string" } },
          required: ["url", "why"],
          additionalProperties: false,
        },
      },
    },
    required: ["candidates"],
    additionalProperties: false,
  },
};
const SubmissionSchema = z.object({ candidates: z.array(z.object({ url: z.string(), why: z.string() })) });

const THEME_FOCUS: Record<Theme, string> = {
  "harness-design": "harness design: skills and instruction files, context and memory, tool design, subagents, hooks, loop structure",
  verification: "verification and proof of work: tests, evals, self-checks, screenshots, CI gates, agents showing evidence their work is right",
  "lighter-review": "lighter code review: specs first, small diffs, review agents, guardrails that make agent output cheaper to check",
  "non-engineers": "harnesses for non-engineers: agent workflows for marketing, design, ops and other teams",
  "real-setups": "real setups: people walking through their actual working agent harness, what broke and what they changed",
};

export interface ThemeRun {
  theme: Theme;
  queries: string[]; // every search actually run, from the response
  results: { url: string; title: string }[]; // every result actually returned
  picks: { url: string; title: string; why: string }[]; // submitted and verified against results
  usage: UsageTotals;
  notes: string[];
}

export interface ThemeRequest {
  theme: Theme;
  minSearches: number;
  since: Date;
  previousQueries: string[]; // don't repeat these
  avoidSources: string[]; // prefer sources outside these
  gap?: string; // what a retry needs to fix
}

function prompt(request: ThemeRequest): string {
  return [
    `Theme for this search: ${THEME_FOCUS[request.theme]}.`,
    `Find instructive material on this theme published since ${request.since.toISOString().slice(0, 10)} (roughly the last week).`,
    `Run at least ${request.minSearches} web searches with clearly different wording. Look for different kinds of written content: blog posts, GitHub repos and forum threads. Skip videos.`,
    request.previousQueries.length ? `Don't repeat these recent queries:\n${request.previousQueries.map((q) => `- ${q}`).join("\n")}` : "",
    request.avoidSources.length ? `Prefer sources other than these, which are already covered: ${request.avoidSources.join(", ")}.` : "",
    request.gap ?? "",
    "When you've finished searching, call submit_candidates with every result URL that could plausibly pass the rubric (aim for 6-10), each with one line on why. Only submit URLs that appeared in your search results.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Runs one theme's search call and harvests what really happened from the response. */
export async function exploreTheme(request: ThemeRequest, callModel: CallModel = defaultCallModel): Promise<ThemeRun> {
  const rubric = await loadRubric();
  const messages: Params["messages"] = [{ role: "user", content: prompt(request) }];
  const run: ThemeRun = { theme: request.theme, queries: [], results: [], picks: [], usage: ZERO_USAGE, notes: [] };
  let submitted: z.infer<typeof SubmissionSchema> | null = null;

  for (let turn = 0; turn <= EXPLORE.maxPauseResumes; turn++) {
    const response = await callModel({
      model: MODELS.explore,
      max_tokens: 16_000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: EFFORT.explore },
      system: ["You search the web for a weekly digest about agentic engineering. Judge what's worth submitting with the rubric below.", "", rubric].join("\n"),
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: EXPLORE.maxSearchesPerCall, blocked_domains: [...BLOCKED_HOSTS] },
        SUBMIT_TOOL,
      ],
      messages,
    });
    run.usage = addUsage(run.usage, fromApiUsage(response.usage));

    for (const block of response.content) {
      if (block.type === "server_tool_use" && block.name === "web_search") {
        const query = (block.input as { query?: unknown }).query;
        if (typeof query === "string") run.queries.push(query);
      } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const result of block.content) run.results.push({ url: result.url, title: result.title });
      } else if (block.type === "tool_use" && block.name === "submit_candidates") {
        const parsed = SubmissionSchema.safeParse(block.input);
        if (parsed.success) submitted = parsed.data;
      }
    }

    if (response.stop_reason === "refusal") run.notes.push(`refused (${response.stop_details?.category ?? "no category"})`);
    // A long server-side search turn pauses; send it back as-is to resume.
    if (response.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: response.content });
  }

  // Only accept picks that real searches returned. Anything else is invented.
  const resultsByKey = new Map(run.results.map((r) => [canonicalUrl(r.url), r]));
  if (submitted) {
    for (const pick of submitted.candidates) {
      const result = resultsByKey.get(canonicalUrl(pick.url));
      if (result) run.picks.push({ url: result.url, title: result.title, why: pick.why });
    }
    const discarded = submitted.candidates.length - run.picks.length;
    if (discarded) run.notes.push(`${discarded} submitted URL(s) weren't in any search result; discarded`);
  } else {
    run.notes.push("no submission; using every search result");
    run.picks = [...resultsByKey.values()].map((r) => ({ ...r, why: "(from search results)" }));
  }
  return run;
}

export interface ExploreInput {
  since: Date;
  seen: { key: string; title: string }[]; // memory plus everything the seed sweep found
  seedSources: Set<string>;
  weakestTheme: Theme;
  previousQueries: Partial<Record<Theme, string[]>>;
}

export interface ExploreOutcome {
  candidates: Candidate[];
  quotas: QuotaResult;
  searchesByTheme: Record<Theme, string[]>;
  runs: ThemeRun[];
  usage: UsageTotals;
  retries: number;
}

function toCandidates(runs: ThemeRun[]): (Candidate & { theme: Theme })[] {
  return runs.flatMap((run) =>
    run.picks.flatMap((pick) => {
      const key = canonicalUrl(pick.url);
      const source = sourceOf(pick.url);
      if (!key || !source || isBlocked(pick.url)) return [];
      return [{ url: pick.url, key, title: pick.title, source, foundBy: `explore: ${run.theme}`, published: null, theme: run.theme }];
    }),
  );
}

/** Takes up to `limit` candidates, alternating between themes so no theme crowds out the rest. */
export function roundRobin<T extends { theme: Theme }>(items: T[], limit: number): T[] {
  const queues = THEMES.map((theme) => items.filter((i) => i.theme === theme));
  const picked: T[] = [];
  while (picked.length < limit && queues.some((q) => q.length)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next && picked.length < limit) picked.push(next);
    }
  }
  return picked;
}

/** Runs all five themes, checks the quotas in code, and retries only the gaps. */
export async function runExplore(input: ExploreInput, callModel: CallModel = defaultCallModel): Promise<ExploreOutcome> {
  // Quotas are floors; each theme is asked for more, so the per-theme asks add
  // up to the overall minimum (4 x 5 themes, +1 for the weakest = 21 >= 20)
  // and a normal scan meets every quota first time. Retries are for real gaps.
  const quotaMin = (theme: Theme) =>
    theme === input.weakestTheme ? EXPLORE_QUOTAS.minSearchesWeakestTheme : EXPLORE_QUOTAS.minSearchesPerTheme;
  const target = (theme: Theme) =>
    Math.min(
      EXPLORE.maxSearchesPerCall,
      Math.ceil(EXPLORE_QUOTAS.minSearches / THEMES.length) +
        (theme === input.weakestTheme ? EXPLORE_QUOTAS.minSearchesWeakestTheme - EXPLORE_QUOTAS.minSearchesPerTheme : 0),
    );
  const avoid = [...input.seedSources];

  const runs = await Promise.all(
    THEMES.map((theme) =>
      exploreTheme({ theme, minSearches: target(theme), since: input.since, previousQueries: input.previousQueries[theme] ?? [], avoidSources: avoid }, callModel),
    ),
  );

  const evaluate = () => {
    const searchesByTheme = Object.fromEntries(THEMES.map((t) => [t, runs.filter((r) => r.theme === t).flatMap((r) => r.queries)])) as Record<Theme, string[]>;
    const { fresh } = splitUnseen(toCandidates(runs), input.seen);
    const quotas = checkExploreQuotas(
      { searchesByTheme, newCandidates: fresh.map((c) => ({ source: c.source, type: contentTypeOf(c.url) })) },
      input.seedSources,
      input.weakestTheme,
    );
    return { searchesByTheme, fresh, quotas };
  };

  let state = evaluate();
  let retries = 0;
  while (!state.quotas.met && retries < EXPLORE_QUOTAS.maxRetries) {
    retries++;
    // Retry the themes that are short on searches; if the gap is elsewhere
    // (candidates, sources, types), push the weakest theme harder.
    const shortThemes = THEMES.filter((t) => new Set(state.searchesByTheme[t].map((q) => q.toLowerCase().trim())).size < quotaMin(t));
    const retryThemes = shortThemes.length ? shortThemes : [input.weakestTheme];
    const foundSources = [...new Set(state.fresh.map((c) => c.source))];
    const extra = await Promise.all(
      retryThemes.map((theme) =>
        exploreTheme(
          {
            theme,
            minSearches: target(theme),
            since: input.since,
            previousQueries: [...(input.previousQueries[theme] ?? []), ...state.searchesByTheme[theme]],
            avoidSources: [...avoid, ...foundSources],
            gap: gapMessage(state.quotas),
          },
          callModel,
        ),
      ),
    );
    runs.push(...extra);
    state = evaluate();
  }

  const usage = runs.reduce((total, run) => addUsage(total, run.usage), ZERO_USAGE);
  const candidates = roundRobin(state.fresh, EXPLORE.maxCandidates).map(({ theme: _theme, ...candidate }) => candidate);
  return { candidates, quotas: state.quotas, searchesByTheme: state.searchesByTheme, runs, usage, retries };
}
