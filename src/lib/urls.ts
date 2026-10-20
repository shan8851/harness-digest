// Two jobs:
// 1. canonicalUrl: one stable key per piece of content, so the same article
//    shared with different tracking codes is only ever seen once.
// 2. sourceOf: who published it, so "10 new sources" means 10 different
//    people or sites, not 10 links from one blog.

import { BLOCKED_HOSTS, type ContentType } from "../../config/settings.js";

// Query parameters that only track where a click came from.
const TRACKING_PARAMS = new Set([
  "ref", "ref_src", "ref_url", "fbclid", "gclid", "igshid",
  "mc_cid", "mc_eid", "si", "feature", "share",
]);

// Hosts where the query string never identifies the content (a post's ID is
// always in the path), so every parameter can go.
const DROP_ALL_PARAMS = new Set(["x.com"]);

// GitHub paths that point somewhere inside a repo but are still "the repo".
// Issues, pull requests and discussions are kept as their own items, since a
// single discussion thread can be the teaching moment.
const GITHUB_REPO_SUBPATHS = new Set(["tree", "blob", "commits", "releases", "wiki"]);

// Platforms where the first path segment names the author (github.com/owner,
// medium.com/@author). Elsewhere the host alone identifies the source.
const AUTHOR_IN_FIRST_SEGMENT = new Set(["github.com", "gist.github.com", "medium.com", "dev.to", "x.com"]);

function cleanHost(host: string): string {
  const cleaned = host.toLowerCase().replace(/^(www\.|m\.|mobile\.)/, "");
  return cleaned === "twitter.com" ? "x.com" : cleaned; // same posts, two domains
}

function pathSegments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

/** Returns a stable key like `simonwillison.net/2026/oct/18/agents`, or null if the URL is unusable. */
export function canonicalUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = cleanHost(url.hostname);
  const segments = pathSegments(url.pathname);

  // YouTube has four URL shapes for one video; reduce them all to the video ID.
  const videoId =
    host === "youtu.be" ? segments[0]
    : host === "youtube.com" && segments[0] === "watch" ? url.searchParams.get("v")
    : host === "youtube.com" && (segments[0] === "shorts" || segments[0] === "live") ? segments[1]
    : null;
  if (videoId) return `youtube.com/watch?v=${videoId}`;

  if (host === "github.com" && segments.length >= 2) {
    const [owner, repo, section] = segments;
    const repoKey = `github.com/${owner!.toLowerCase()}/${repo!.toLowerCase().replace(/\.git$/, "")}`;
    if (section === undefined || GITHUB_REPO_SUBPATHS.has(section)) return repoKey;
    return `${repoKey}/${segments.slice(2).join("/")}`;
  }

  const kept = DROP_ALL_PARAMS.has(host) ? [] : [...url.searchParams.entries()]
    .filter(([key]) => !key.toLowerCase().startsWith("utm_") && !TRACKING_PARAMS.has(key.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b));
  const query = kept.length ? `?${new URLSearchParams(kept).toString()}` : "";
  const path = segments.length ? `/${segments.join("/")}` : "";
  return `${host}${path}${query}`;
}

// Hosts whose pages are discussion threads.
const THREAD_HOSTS = new Set(["reddit.com", "news.ycombinator.com", "lobste.rs", "discord.com"]);

/**
 * What kind of content a URL points to, decided from the URL alone, so the
 * "at least one repo, thread and blog" quota can't be met by the model
 * just labelling things.
 */
export function contentTypeOf(raw: string): ContentType {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return "blog";
  }
  const host = cleanHost(url.hostname);
  const segments = pathSegments(url.pathname);
  if (THREAD_HOSTS.has(host) || host.startsWith("forum.") || host.startsWith("community.") || host.startsWith("discuss.")) return "thread";
  if (host === "github.com" && ["discussions", "issues"].includes(segments[2] ?? "")) return "thread";
  if (host === "github.com" || host === "gist.github.com" || host === "gitlab.com") return "repo";
  return "blog";
}

/** True for links on a site in BLOCKED_HOSTS (including subdomains), and for anything that isn't a valid URL. */
export function isBlocked(raw: string): boolean {
  let host: string;
  try {
    host = cleanHost(new URL(raw.trim()).hostname);
  } catch {
    return true;
  }
  return BLOCKED_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

/** Returns who published a URL, e.g. `simonwillison.net`, `github.com/mattpocock`, `reddit.com/r/claudeai`. */
export function sourceOf(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = cleanHost(url.hostname);
  const [first, second] = pathSegments(url.pathname).map((s) => s.toLowerCase());

  if (host === "reddit.com" && (first === "r" || first === "u" || first === "user") && second) {
    return `reddit.com/${first}/${second}`;
  }
  // A YouTube video URL doesn't say which channel it's from, so all videos
  // share one source unless the link is to a channel.
  if (host === "youtube.com" || host === "youtu.be") {
    return first?.startsWith("@") ? `youtube.com/${first}` : "youtube.com";
  }
  if (AUTHOR_IN_FIRST_SEGMENT.has(host) && first) return `${host}/${first}`;
  return host;
}
