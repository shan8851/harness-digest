// Phase: read one page and write its card. Sonnet does this; it's routine
// reading, and the judge (Opus) makes the actual call on quality afterwards.
//
// Output is schema-constrained, so the result always parses into a card.

import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CONTENT_TYPES, EFFORT, ITEMS, MODELS, THEMES } from "../../config/settings.js";
import { anthropic, FALLBACK_BETA } from "../lib/anthropic.js";
import type { PageResult } from "../lib/page.js";
import { loadRubric } from "../lib/rubric.js";
import { fromApiUsage, type UsageTotals } from "../lib/usage.js";

export const SummarySchema = z.object({
  title: z.string().describe("The item's real title, cleaned of site-name suffixes"),
  contentType: z.enum(CONTENT_TYPES),
  theme: z.enum(THEMES).describe("The single best-fitting theme"),
  idea: z.string().describe("One sentence: the problem and the answer, in your own words"),
  howItWorks: z.array(z.string()).describe("3 to 5 short bullets (about 12-15 words each) on the concrete mechanics"),
  stealThis: z.string().describe("One sentence: the specific technique plus a concrete moment to try it"),
  goDeeperIf: z.string().describe("One short line saying who should read the full piece, starting 'you're' or 'you'"),
  quote: z.string().describe("One short sentence copied exactly, character for character, from the page text"),
  minutes: z.number().int().describe("Rough time to read or watch, in minutes"),
});
export type Summary = z.infer<typeof SummarySchema>;

type SuccessfulPage = Extract<PageResult, { ok: true }>;

// The hard limits, stated as numbers so the model knows them up front. The
// verifier enforces the same numbers from config/settings.ts.
const LIMITS = [
  `Hard limits (cards that break them are sent back): idea at most ${ITEMS.maxIdeaWords} words;`,
  `${ITEMS.minBullets}-${ITEMS.maxBullets} "how it works" bullets, each at most ${ITEMS.maxBulletWords} words;`,
  `"go deeper if" at most ${ITEMS.maxGoDeeperWords} words; quote at most ${ITEMS.maxQuoteWords} words, copied exactly from the page.`,
].join(" ");

/** A previous attempt and what was wrong with it, for one revision pass. */
export interface CardFeedback {
  previous: Summary;
  problems: string[];
}

export async function summarise(page: SuccessfulPage, feedback?: CardFeedback): Promise<{ summary: Summary; usage: UsageTotals }> {
  const rubric = await loadRubric();
  const pageMessage = `URL: ${page.finalUrl}\nPage title: ${page.title || "(none)"}\n\n<page_text>\n${page.text}\n</page_text>`;
  // On a revision, the model sees its own card and the exact problems the
  // code found, and fixes those rather than starting from scratch.
  const revision: { role: "assistant" | "user"; content: string }[] = feedback
    ? [
        { role: "assistant", content: JSON.stringify(feedback.previous) },
        {
          role: "user",
          content: `That card failed these checks:\n${feedback.problems.map((p) => `- ${p}`).join("\n")}\nReturn a corrected card. Keep the substance; tighten the wording.`,
        },
      ]
    : [];

  const response = await anthropic().beta.messages.parse({
    model: MODELS.summarise,
    max_tokens: 16_000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: EFFORT.summarise, format: betaZodOutputFormat(SummarySchema) },
    system: [
      "You write cards for a weekly digest about agentic engineering. You summarise one page at a time.",
      "Follow the writing rules in the rubric below exactly. The quote must appear verbatim in the page text, or the card is thrown away.",
      LIMITS,
      "",
      rubric,
    ].join("\n"),
    messages: [{ role: "user", content: pageMessage }, ...revision],
  });

  if (response.stop_reason === "refusal") throw new Error(`summarise refused (${response.stop_details?.category ?? "no category"})`);
  if (!response.parsed_output) throw new Error(`summarise returned no parsable card (stop reason: ${response.stop_reason})`);
  return { summary: response.parsed_output, usage: fromApiUsage(response.usage) };
}
