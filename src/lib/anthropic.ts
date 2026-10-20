// One shared API client. It reads ANTHROPIC_API_KEY from the environment.
//
// Every model call opts into server-side fallback: if a model declines a
// request for policy reasons (rare, but security-flavoured engineering posts
// can trip a classifier), Anthropic retries it on a suitable substitute model
// instead of returning nothing.

import Anthropic from "@anthropic-ai/sdk";

export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | undefined;

export function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}
