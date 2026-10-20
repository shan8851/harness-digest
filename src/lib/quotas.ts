// The "force the wider search" rule, as code. The explore phase reports what
// it did (real searches from the API response, plus the candidates it found);
// this checks the result against EXPLORE_QUOTAS and, if anything is short,
// writes the exact gap so the retry knows what to fix.
//
// The model never grades its own homework: these numbers come from tool calls
// and URLs, not from anything the model says about itself.

import { EXPLORE_QUOTAS, THEMES, type ContentType, type ExploreQuotas, type Theme } from "../../config/settings.js";

export interface ExploreReport {
  /** Search queries actually executed, grouped by the theme they were run for. */
  searchesByTheme: Record<Theme, string[]>;
  /** Candidates that survived dedupe (never seen before). */
  newCandidates: { source: string; type: ContentType }[];
}

export interface QuotaResult {
  met: boolean;
  shortfalls: string[];
}

export function checkExploreQuotas(
  report: ExploreReport,
  seedSources: Set<string>,
  weakestTheme: Theme,
  quotas: ExploreQuotas = EXPLORE_QUOTAS,
): QuotaResult {
  const shortfalls: string[] = [];

  // Count distinct queries, so running the same search twice doesn't pad the total.
  const allQueries = new Set(
    THEMES.flatMap((theme) => report.searchesByTheme[theme].map((q) => q.trim().toLowerCase())),
  );
  if (allQueries.size < quotas.minSearches) {
    shortfalls.push(`${allQueries.size} distinct searches, need ${quotas.minSearches}`);
  }

  for (const theme of THEMES) {
    const need = theme === weakestTheme ? quotas.minSearchesWeakestTheme : quotas.minSearchesPerTheme;
    const have = new Set(report.searchesByTheme[theme].map((q) => q.trim().toLowerCase())).size;
    if (have < need) shortfalls.push(`theme "${theme}" has ${have} searches, need ${need}`);
  }

  if (report.newCandidates.length < quotas.minNewCandidates) {
    shortfalls.push(`${report.newCandidates.length} new candidates, need ${quotas.minNewCandidates}`);
  }

  const newSources = new Set(report.newCandidates.map((c) => c.source).filter((s) => !seedSources.has(s)));
  if (newSources.size < quotas.minNewSources) {
    shortfalls.push(`${newSources.size} new sources outside the seed list, need ${quotas.minNewSources}`);
  }

  const typesFound = new Set(report.newCandidates.map((c) => c.type));
  const missingTypes = quotas.requiredTypes.filter((type) => !typesFound.has(type));
  if (missingTypes.length) shortfalls.push(`no new ${missingTypes.join(", ")} found`);

  return { met: shortfalls.length === 0, shortfalls };
}

/** The message sent back to the explore phase on a retry. */
export function gapMessage(result: QuotaResult): string {
  return [
    "Your search fell short of the minimums. Keep searching, avoiding sources you've already used, until these are fixed:",
    ...result.shortfalls.map((s) => `- ${s}`),
  ].join("\n");
}
