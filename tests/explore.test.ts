import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { THEMES, type Theme } from "../config/settings.js";
import { exploreTheme, roundRobin, runExplore, type CallModel, type ThemeRequest } from "../src/phases/explore.js";

type Message = Anthropic.Beta.Messages.BetaMessage;

// Builds a response in the shape the API returns: each search is a
// server_tool_use block followed by its web_search_tool_result.
function message(opts: { searches?: { query: string; urls: string[] }[]; submit?: string[]; stop?: string }): Message {
  const content: unknown[] = [];
  (opts.searches ?? []).forEach((s, i) => {
    content.push({ type: "server_tool_use", id: `srv_${i}`, name: "web_search", input: { query: s.query } });
    content.push({
      type: "web_search_tool_result",
      tool_use_id: `srv_${i}`,
      content: s.urls.map((url) => ({ type: "web_search_result", url, title: `Title of ${url}`, encrypted_content: "", page_age: null })),
    });
  });
  if (opts.submit) content.push({ type: "tool_use", id: "tu_1", name: "submit_candidates", input: { candidates: opts.submit.map((url) => ({ url, why: "looks useful" })) } });
  return {
    content,
    stop_reason: opts.stop ?? (opts.submit ? "tool_use" : "end_turn"),
    usage: { input_tokens: 1000, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use: { web_search_requests: opts.searches?.length ?? 0, web_fetch_requests: 0 } },
  } as unknown as Message;
}

const request: ThemeRequest = { theme: "verification", minSearches: 2, since: new Date("2026-10-13T00:00:00Z"), previousQueries: [], avoidSources: [] };

describe("exploreTheme", () => {
  it("harvests the real searches and results, and only accepts picks that search actually returned", async () => {
    const call: CallModel = async () =>
      message({
        searches: [
          { query: "agent evals in CI", urls: ["https://a.example/evals", "https://github.com/o/eval-kit"] },
          { query: "proof of work coding agents", urls: ["https://b.example/proof"] },
        ],
        submit: ["https://a.example/evals?utm_source=x", "https://github.com/o/eval-kit", "https://invented.example/not-searched"],
      });
    const run = await exploreTheme(request, call);
    expect(run.queries).toEqual(["agent evals in CI", "proof of work coding agents"]);
    expect(run.results).toHaveLength(3);
    expect(run.picks.map((p) => p.url)).toEqual(["https://a.example/evals", "https://github.com/o/eval-kit"]);
    expect(run.notes).toEqual(["1 submitted URL(s) weren't in any search result; discarded"]);
    expect(run.usage.webSearches).toBe(2);
  });

  it("asks for prompt caching, so the growing search context is re-read from cache", async () => {
    let sent: Parameters<CallModel>[0] | undefined;
    await exploreTheme(request, async (params) => {
      sent = params;
      return message({});
    });
    expect(sent?.cache_control).toEqual({ type: "ephemeral" });
  });

  it("falls back to every real result if the model never submits", async () => {
    const run = await exploreTheme(request, async () => message({ searches: [{ query: "q", urls: ["https://a.example/1", "https://a.example/2"] }] }));
    expect(run.picks.map((p) => p.url)).toEqual(["https://a.example/1", "https://a.example/2"]);
    expect(run.notes).toEqual(["no submission; using every search result"]);
  });

  it("resumes a paused turn and keeps everything from both halves", async () => {
    const calls: Parameters<CallModel>[0][] = [];
    const responses = [
      message({ searches: [{ query: "first", urls: ["https://a.example/1"] }], stop: "pause_turn" }),
      message({ searches: [{ query: "second", urls: ["https://a.example/2"] }], submit: ["https://a.example/1", "https://a.example/2"] }),
    ];
    const run = await exploreTheme(request, async (params) => {
      calls.push(structuredClone(params));
      return responses[calls.length - 1]!;
    });
    expect(run.queries).toEqual(["first", "second"]);
    expect(run.picks).toHaveLength(2);
    expect(calls[1]!.messages.at(-1)!.role).toBe("assistant"); // the paused turn was sent back
  });

  it("tells the model what to avoid and what to fix on a retry", async () => {
    let sent = "";
    await exploreTheme(
      { ...request, previousQueries: ["old query"], avoidSources: ["simonwillison.net"], gap: "Fix: no new video found" },
      async (params) => {
        sent = params.messages[0]!.content as string;
        return message({});
      },
    );
    expect(sent).toContain("- old query");
    expect(sent).toContain("simonwillison.net");
    expect(sent).toContain("Fix: no new video found");
  });
});

// A fake that runs exactly as many searches as each prompt asks for, finding a
// blog post, a repo, a video and a thread per theme from distinct sources.
function obedientModel(shortchange?: Theme): CallModel {
  let call = 0;
  return async (params) => {
    call++;
    const text = params.messages[0]!.content as string;
    const theme = THEMES.find((t) => text.includes(t.split("-")[0]!)) ?? THEMES[0]!;
    const asked = Number(text.match(/at least (\d+) web searches/)![1]);
    const count = theme === shortchange && call <= THEMES.length ? 1 : asked;
    const searches = Array.from({ length: count }, (_, i) => ({
      query: `${theme} query ${call}-${i}`,
      urls: [`https://${theme}-${call}-${i}.example/post`, `https://github.com/${theme}${call}${i}/repo`, `https://www.youtube.com/watch?v=${theme}${call}${i}`, `https://www.reddit.com/r/${theme}${call}${i}/comments/x/`],
    }));
    return message({ searches, submit: searches.flatMap((s) => s.urls) });
  };
}

const exploreInput = {
  since: new Date("2026-10-13T00:00:00Z"),
  seen: [],
  seedSources: new Set(["simonwillison.net"]),
  weakestTheme: "non-engineers" as Theme,
  previousQueries: {},
};

describe("runExplore", () => {
  it("meets every quota first time when the model does what it's asked, and caps candidates", async () => {
    const outcome = await runExplore(exploreInput, obedientModel());
    expect(outcome.quotas).toEqual({ met: true, shortfalls: [] });
    expect(outcome.candidates.some((c) => c.url.includes("youtube.com"))).toBe(false); // videos are blocked
    expect(outcome.retries).toBe(0);
    expect(outcome.runs).toHaveLength(5);
    expect(outcome.searchesByTheme["non-engineers"]).toHaveLength(5); // the weakest theme is pushed harder, up to the cap
    expect(outcome.searchesByTheme["verification"]).toHaveLength(4);
    expect(outcome.candidates).toHaveLength(15); // EXPLORE.maxCandidates
  });

  it("retries only the theme that fell short, with the gap spelled out", async () => {
    const outcome = await runExplore(exploreInput, obedientModel("verification"));
    expect(outcome.retries).toBe(1);
    expect(outcome.runs.slice(5).map((r) => r.theme)).toEqual(["verification"]);
    expect(outcome.quotas.met).toBe(true);
  });

  it("drops anything the seed sweep or memory already has", async () => {
    const outcome = await runExplore(
      { ...exploreInput, seen: [{ key: "harness-1-0.example/post", title: "Title of https://harness-1-0.example/post" }] },
      obedientModel(),
    );
    expect(outcome.candidates.map((c) => c.key)).not.toContain("harness-1-0.example/post");
  });
});

describe("roundRobin", () => {
  it("alternates between themes so none crowds out the rest", () => {
    const items = [
      ...Array.from({ length: 5 }, (_, i) => ({ theme: "verification" as Theme, n: i })),
      { theme: "real-setups" as Theme, n: 99 },
    ];
    expect(roundRobin(items, 3).map((i) => i.n)).toEqual([0, 99, 1]);
  });
});
