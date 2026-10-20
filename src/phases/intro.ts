// Phase: the weekly issue's intro. Two or three plain sentences on what this
// week's items have in common. A small Sonnet call; the cards do the real work.

import { EFFORT, MODELS } from "../../config/settings.js";
import type { IssueItem } from "../issue/render.js";
import { anthropic, FALLBACK_BETA } from "../lib/anthropic.js";
import { fromApiUsage, type UsageTotals } from "../lib/usage.js";

export async function writeIntro(items: IssueItem[]): Promise<{ intro: string; usage: UsageTotals }> {
  const list = items.map((item, i) => `${i + 1}. ${item.summary.title}: ${item.summary.idea}`).join("\n");
  const response = await anthropic().beta.messages.create({
    model: MODELS.weeklyIntro,
    max_tokens: 2_000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: EFFORT.weeklyIntro },
    system: [
      "You write the two- or three-sentence intro to a weekly digest about agentic engineering.",
      "Say what this week's items have in common, or the most useful thread running through them. Plain and specific; no hype words, no greeting, no sign-off.",
      "Write for any reader: the issue may be forwarded to strangers, so never mention a specific reader, their family, employer or projects.",
    ].join("\n"),
    messages: [{ role: "user", content: `This week's items:\n${list}` }],
  });
  const intro = response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join(" ")
    .trim();
  return { intro: intro || `${items.length} items cleared the bar this week.`, usage: fromApiUsage(response.usage) };
}
