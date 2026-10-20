// Parses RSS 2.0 and Atom feeds into a flat list of items. Plain code, no
// model: feeds are the cheapest, most reliable way to hear about new posts.
//
// Deliberately small: it handles the fields we need (title, link, date) and
// the common variations (CDATA, Atom rel="alternate" links, dc:date), not the
// whole of either spec.

import { decodeEntities } from "./page.js";

export interface FeedItem {
  title: string;
  link: string;
  published: string | null; // ISO timestamp
  categories: string[]; // RSS <category> text or Atom category terms
}

function tagText(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  if (!match) return null;
  const raw = match[1]!.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
  return decodeEntities(raw.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function toIso(raw: string | null): string | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function categories(block: string, isAtom: boolean): string[] {
  if (isAtom) return [...block.matchAll(/<category\b[^>]*term=["']([^"']+)["']/gi)].map((m) => decodeEntities(m[1]!).trim());
  return [...block.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi)].map((m) =>
    decodeEntities(m[1]!.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1")).trim(),
  );
}

function atomLink(entry: string): string | null {
  const links = [...entry.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const pick = links.find((l) => /rel=["']alternate["']/i.test(l)) ?? links.find((l) => !/rel=/i.test(l)) ?? links[0];
  return pick?.match(/href=["']([^"']+)["']/i)?.[1] ?? null;
}

/** Returns the feed's items in feed order (usually newest first). Relative links resolve against `feedUrl`. */
export function parseFeed(xml: string, feedUrl: string): FeedItem[] {
  const isAtom = /<feed[\s>]/i.test(xml);
  const blocks = [...xml.matchAll(isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi)].map((m) => m[0]);

  const items: FeedItem[] = [];
  for (const block of blocks) {
    const rawLink = isAtom ? atomLink(block) : (tagText(block, "link") ?? tagText(block, "guid"));
    if (!rawLink) continue;
    let link: string;
    try {
      link = new URL(decodeEntities(rawLink), feedUrl).toString();
    } catch {
      continue;
    }
    const published = isAtom
      ? toIso(tagText(block, "published") ?? tagText(block, "updated"))
      : toIso(tagText(block, "pubDate") ?? tagText(block, "dc:date"));
    items.push({ title: tagText(block, "title") ?? "", link, published, categories: categories(block, isAtom) });
  }
  return items;
}
