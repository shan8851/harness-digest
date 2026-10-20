// Phase: the judge. Opus decides whether an item passes the teaching-moment
// test, using the rubric in config/themes.md. This is the one call where model
// quality matters most, so it's the one place we pay for Opus.
//
// The judge reads the card and the whole page text. An earlier version only
// showed it an excerpt to save tokens, and it wrongly failed good items whose
// technique appeared further down the page. Judging is the product; it gets
// the full context.

import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { EFFORT, MODELS, THEMES } from "../../config/settings.js";
import { anthropic, FALLBACK_BETA } from "../lib/anthropic.js";
import { loadRubric } from "../lib/rubric.js";
import { fromApiUsage, type UsageTotals } from "../lib/usage.js";
import type { Summary } from "./summarise.js";

export const VerdictSchema = z.object({
  pass: z.boolean().describe("Does the item pass the teaching-moment test?"),
  score: z.number().int().min(1).max(10),
  theme: z.enum(THEMES).describe("The best-fitting theme; correct the card if it got this wrong"),
  reason: z.string().describe("One sentence explaining the verdict, naming the technique or what's missing"),
});
export type Verdict = z.infer<typeof VerdictSchema>;

export async function judge(input: { url: string; summary: Summary; pageText: string }): Promise<{ verdict: Verdict; usage: UsageTotals }> {
  const rubric = await loadRubric();
  const response = await anthropic().beta.messages.parse({
    model: MODELS.judge,
    max_tokens: 16_000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: EFFORT.judge, format: betaZodOutputFormat(VerdictSchema) },
    system: [
      "You are the judge for a weekly digest about agentic engineering. Apply the rubric below strictly.",
      "Most of the internet fails this test. Pass an item only if a working engineer would come away with a specific technique to try this week.",
      "Check the card against the page text: if the card claims a technique the page doesn't actually teach, fail it. Quotes are checked separately in code, so don't judge the quote.",
      "",
      rubric,
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: [
          `URL: ${input.url}`,
          `<card>\n${JSON.stringify(input.summary, null, 2)}\n</card>`,
          `<page_text>\n${input.pageText}\n</page_text>`,
        ].join("\n\n"),
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new Error(`judge refused (${response.stop_details?.category ?? "no category"})`);
  if (!response.parsed_output) throw new Error(`judge returned no parsable verdict (stop reason: ${response.stop_reason})`);
  return { verdict: response.parsed_output, usage: fromApiUsage(response.usage) };
}
