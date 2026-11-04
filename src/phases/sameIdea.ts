// Phase: same-idea grouping, run before the weekly pick. Title matching only
// catches the same story twice; it missed two near-identical template repos
// in one issue (W44). A small Sonnet call groups items that teach
// substantially the same technique. The model only groups: code
// (dropSameIdea in src/lib/pool.ts) keeps the highest-ranked of each group,
// so a bad grouping can't remove the best item.

import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { EFFORT, MODELS } from "../../config/settings.js";
import type { PoolEntry } from "../lib/pool.js";
import { anthropic, FALLBACK_BETA } from "../lib/anthropic.js";
import { fromApiUsage, ZERO_USAGE, type UsageTotals } from "../lib/usage.js";

const GroupsSchema = z.object({
  groups: z
    .array(
      z.object({
        items: z.array(z.number().int()).describe("The numbers of two or more items that are near-duplicates of each other"),
        why: z.string().describe("One sentence: the single technique or resource they all share"),
      }),
    )
    .describe("Near-duplicate groups. Each item appears in at most one group. Most weeks have none or one."),
});

/** Groups of pool keys that teach the same idea. Items are passed in rank order. */
export async function groupSameIdea(items: PoolEntry[]): Promise<{ groups: string[][]; reasons: string[]; usage: UsageTotals }> {
  if (items.length < 2) return { groups: [], reasons: [], usage: ZERO_USAGE };
  const list = items
    .map((e, i) => `${i + 1}. ${e.summary.title} (${e.summary.contentType})\n   Idea: ${e.summary.idea}\n   Steal this: ${e.summary.stealThis}`)
    .join("\n");
  const response = await anthropic().beta.messages.parse({
    model: MODELS.sameIdea,
    max_tokens: 2_000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: EFFORT.sameIdea, format: betaZodOutputFormat(GroupsSchema) },
    system: [
      "You check a weekly reading list for near-duplicates before it's sent.",
      "Group items only when a reader who'd read one would get little new from the other: the same main point, or the same kind of resource (two starter template repos, two posts on the same review checklist).",
      "Compare each item's main point as a whole, not a technique it mentions along the way. Two items that both happen to mention handoff notes or evidence gates, but are mostly about different things, are not duplicates.",
      "Sharing a theme isn't enough. Two posts about verification that teach different techniques are not duplicates. A post and a repo are only duplicates if the repo is the same thing the post describes.",
      "Put each item in at most one group. If you can't name the one shared technique in a sentence, don't group them. When unsure, don't group: a duplicate costs the reader a minute, a wrongly dropped item costs them the item.",
    ].join("\n"),
    messages: [{ role: "user", content: `This week's candidates:\n${list}` }],
  });
  if (!response.parsed_output) throw new Error(`same-idea check returned nothing parsable (stop reason: ${response.stop_reason})`);
  const parsed = response.parsed_output.groups;
  const groups = parsed.map((g) => g.items.flatMap((n) => (items[n - 1] ? [items[n - 1]!.key] : [])));
  return { groups, reasons: parsed.map((g) => g.why), usage: fromApiUsage(response.usage) };
}
