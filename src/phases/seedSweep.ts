// Phase: seed sweep. Checks every seed source for anything new since the last
// successful scan. Plain HTTP and parsing, no model, so it costs no tokens.
//
// Three kinds of seed (set per seed in config/sources.json):
//   feed:  read its RSS/Atom feed; each item published since the lookback is a candidate.
//   repo:  read the repo's commits feed; any commit since the lookback makes the repo a candidate.
//   index: no feed, so read its index page and take the newest article links
//          matching `linkPattern`. These are undated until fetched; memory and the
//          freshness check after fetching weed out the old ones.
// Any seed can set `excludeTitle`, a pattern for items that are never worth
// judging (e.g. a daily news roundup), so they don't cost a model call. Feed
// seeds can set `includeCategory` to keep only items tagged with a matching
// category (e.g. just OpenAI's engineering posts from its all-news feed).

import { SEED_SWEEP } from "../../config/settings.js";
import { splitUnseen, type SeenEntry } from "../lib/dedupe.js";
import { decodeEntities } from "../lib/page.js";
import { parseFeed } from "../lib/feeds.js";
import { canonicalUrl, isBlocked, sourceOf } from "../lib/urls.js";

export interface Seed {
  name: string;
  type: "feed" | "repo" | "index";
  url: string;
  feed?: string;
  linkPattern?: string;
  excludeTitle?: string;
  includeCategory?: string;
}

export interface Candidate {
  url: string;
  key: string; // canonicalUrl()
  title: string;
  source: string; // sourceOf(), for the new-sources quota
  foundBy: string; // seed name, or "explore"
  published: string | null;
}

export interface SeedReport {
  name: string;
  found: number; // items in the window, before dedupe
  error?: string;
}

export type FetchText = (url: string) => Promise<{ ok: true; text: string } | { ok: false; reason: string }>;

export const httpFetchText: FetchText = async (url) => {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(SEED_SWEEP.fetchTimeoutMs),
      headers: { "user-agent": "harness-digest/0.1 (+https://github.com/shan8851/harness-digest)" },
    });
    if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` };
    return { ok: true, text: await response.text() };
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  }
};

type Found = { url: string; title: string; published: string | null };

/** Article links on an index page, in page order, matching the seed's pattern. */
export function indexLinks(html: string, pageUrl: string, pattern: string): Found[] {
  const host = new URL(pageUrl).host;
  const matcher = new RegExp(pattern);
  const seen = new Set<string>();
  const links: Found[] = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url: URL;
    try {
      url = new URL(match[1]!, pageUrl);
    } catch {
      continue;
    }
    if (url.host !== host || !matcher.test(url.pathname) || seen.has(url.pathname)) continue;
    seen.add(url.pathname);
    const text = decodeEntities(match[2]!.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    links.push({ url: url.toString(), title: text || url.pathname.split("/").pop()!.replace(/-/g, " "), published: null });
  }
  return links;
}

async function sweepOne(seed: Seed, since: Date, fetchText: FetchText): Promise<Found[]> {
  if (seed.type === "index") {
    if (!seed.linkPattern) throw new Error("index seed has no linkPattern");
    const page = await fetchText(seed.url);
    if (!page.ok) throw new Error(page.reason);
    return indexLinks(page.text, seed.url, seed.linkPattern);
  }

  if (!seed.feed) throw new Error(`${seed.type} seed has no feed`);
  const feed = await fetchText(seed.feed);
  if (!feed.ok) throw new Error(feed.reason);
  // Undated feed items are kept: memory stops them repeating.
  const category = seed.includeCategory ? new RegExp(seed.includeCategory, "i") : null;
  const recent = parseFeed(feed.text, seed.feed)
    .filter((item) => !category || item.categories.some((c) => category.test(c)))
    .filter((item) => !item.published || new Date(item.published) >= since);

  if (seed.type === "repo") {
    // Commits aren't articles; the repo itself is the thing to judge.
    return recent.length ? [{ url: seed.url, title: `${seed.name} (${recent.length} new commits)`, published: null }] : [];
  }
  return recent.map((item) => ({ url: item.link, title: item.title, published: item.published }));
}

/** Sweeps every seed. A failing seed is reported, never fatal: the other seeds still count. */
export async function sweepSeeds(
  seeds: Seed[],
  options: { since: Date; seen: SeenEntry[]; fetchText?: FetchText },
): Promise<{ candidates: Candidate[]; reports: SeedReport[] }> {
  const fetchText = options.fetchText ?? httpFetchText;
  const reports: SeedReport[] = [];
  const all: Candidate[] = [];

  for (const seed of seeds) {
    try {
      const exclude = seed.excludeTitle ? new RegExp(seed.excludeTitle) : null;
      const found = (await sweepOne(seed, options.since, fetchText)).filter((item) => !exclude?.test(item.title));
      reports.push({ name: seed.name, found: found.length });
      for (const item of found) {
        const key = canonicalUrl(item.url);
        const source = sourceOf(item.url);
        if (!key || !source || isBlocked(item.url)) continue;
        all.push({ ...item, key, source, foundBy: seed.name });
      }
    } catch (error) {
      reports.push({ name: seed.name, found: 0, error: (error as Error).message });
    }
  }

  // Drop anything already in memory (or repeated across seeds), then cap per seed.
  const { fresh } = splitUnseen(all, options.seen);
  const perSeed = new Map<string, number>();
  const candidates = fresh.filter((c) => {
    const count = (perSeed.get(c.foundBy) ?? 0) + 1;
    perSeed.set(c.foundBy, count);
    return count <= SEED_SWEEP.maxItemsPerSeed;
  });
  return { candidates, reports };
}
