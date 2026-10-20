// Fetches a page and turns it into plain text. The harness does this itself,
// rather than letting the model fetch, so that the text the summariser reads
// is exactly the text the verifier checks quotes against.

import { ITEMS } from "../../config/settings.js";
import { isBlocked } from "./urls.js";

export type PageResult =
  | { ok: true; url: string; finalUrl: string; title: string; text: string; publishedDate: string | null; truncated: boolean }
  | { ok: false; url: string; reason: string };

// Phrases that mean we got a sign-in or "enable JavaScript" wall instead of the page.
const WALL_PHRASES = [/javascript is (not available|disabled)/i, /enable javascript/i, /please (log|sign) in to continue/i];

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (match, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(parseInt(code.slice(1), 10));
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Strips an HTML document down to readable text. Crude, but the model copes with leftover nav and footer text. */
export function htmlToText(html: string): string {
  const withoutNoise = html
    .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const withBreaks = withoutNoise.replace(/<\/?(p|div|section|article|li|h[1-6]|br|pre|blockquote|tr)\b[^>]*>/gi, "\n");
  // Inline tags (<em>, <a>, <code>) vanish without a space, so "with <em>care</em>." reads "with care."
  return decodeEntities(withBreaks.replace(/<[^>]+>/g, ""))
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function extractTitle(html: string): string {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const title = og ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  return decodeEntities(title).replace(/\s+/g, " ").trim();
}

/** The publication date from common metadata, as YYYY-MM-DD, or null. Trusting metadata beats asking the model. */
export function extractPublishedDate(html: string): string | null {
  const candidates = [
    html.match(/<meta[^>]+(?:property|name)=["'](?:article:published_time|og:published_time|datePublished|date)["'][^>]+content=["']([^"']+)["']/i)?.[1],
    html.match(/"datePublished"\s*:\s*"([^"]+)"/i)?.[1],
    html.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1],
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  return null;
}

export async function fetchPage(url: string, timeoutMs = 20_000): Promise<PageResult> {
  // Last line of defence: blocked sites should already have been dropped as candidates.
  if (isBlocked(url)) return { ok: false, url, reason: "blocked site (see BLOCKED_HOSTS in config/settings.ts)" };

  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "harness-digest/0.1 (+https://github.com/shan8851/harness-digest)" },
    });
  } catch (error) {
    return { ok: false, url, reason: `fetch failed: ${(error as Error).message}` };
  }
  if (!response.ok) return { ok: false, url, reason: `HTTP ${response.status}` };

  const contentType = response.headers.get("content-type") ?? "";
  if (!/text\/html|text\/plain|application\/xhtml/i.test(contentType)) {
    return { ok: false, url, reason: `unsupported content type: ${contentType || "unknown"}` };
  }

  const body = await response.text();
  const isHtml = /html/i.test(contentType);
  const fullText = isHtml ? htmlToText(body) : body;
  // A page that renders its content with JavaScript (X, many SPAs) comes back
  // nearly empty. Treat that as a failed fetch rather than summarising a shell.
  if (fullText.length < 500) return { ok: false, url, reason: `page has almost no text (${fullText.length} chars); probably needs JavaScript` };
  if (fullText.length < 5_000 && WALL_PHRASES.some((phrase) => phrase.test(fullText))) {
    return { ok: false, url, reason: "got a JavaScript or sign-in wall instead of the page" };
  }

  return {
    ok: true,
    url,
    finalUrl: response.url || url,
    title: isHtml ? extractTitle(body) : "",
    text: fullText.slice(0, ITEMS.maxPageChars),
    publishedDate: isHtml ? extractPublishedDate(body) : null,
    truncated: fullText.length > ITEMS.maxPageChars,
  };
}
