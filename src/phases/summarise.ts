// Phase: read one page and write its card. Sonnet does this; it's routine
// reading, and the judge (Opus) makes the actual call on quality afterwards.
//
// Output is schema-constrained, so the result always parses into a card.

import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CONTENT_TYPES, EFFORT, MODELS, THEMES } from "../../config/settings.js";
import { anthropic, FALLBACK_BETA } from "../lib/anthropic.js";
import type { PageResult } from "../lib/page.js";
import { loadRubric } from "../lib/rubric.js";
import { fromApiUsage, type UsageTotals } from "../lib/usage.js";

export const SummarySchema = z.object({
  title: z.string().describe("The item's real title, cleaned of site-name suffixes"),
  contentType: z.enum(CONTENT_TYPES),
  theme: z.enum(THEMES).describe("The single best-fitting theme"),
  technique: z.string().describe("The concrete technique, in at most two sentences, in your own words"),
  stealThis: z.string().describe("One sentence: the specific technique plus a concrete moment to try it"),
  quote: z.string().describe("One short sentence copied exactly, character for character, from the page text"),
  minutes: z.number().int().describe("Rough time to read or watch, in minutes"),
});
export type Summary = z.infer<typeof SummarySchema>;

type SuccessfulPage = Extract<PageResult, { ok: true }>;

export async function summarise(page: SuccessfulPage): Promise<{ summary: Summary; usage: UsageTotals }> {
  const rubric = await loadRubric();
  const response = await anthropic().beta.messages.parse({
    model: MODELS.summarise,
    max_tokens: 16_000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: EFFORT.summarise, format: betaZodOutputFormat(SummarySchema) },
    system: [
      "You write cards for a weekly digest about agentic engineering. You summarise one page at a time.",
      "Follow the writing rules in the rubric below exactly. The quote must appear verbatim in the page text, or the card is thrown away.",
      "",
      rubric,
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: `URL: ${page.finalUrl}\nPage title: ${page.title || "(none)"}\n\n<page_text>\n${page.text}\n</page_text>`,
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new Error(`summarise refused (${response.stop_details?.category ?? "no category"})`);
  if (!response.parsed_output) throw new Error(`summarise returned no parsable card (stop reason: ${response.stop_reason})`);
  return { summary: response.parsed_output, usage: fromApiUsage(response.usage) };
}
