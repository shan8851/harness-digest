# Roadmap

The plan is to let it run for a few weeks before tuning anything, so changes are driven by what the run logs and issues actually show, not guesses. Everything here is a candidate, not a commitment.

## Tuning (once there are a few weeks of data)

| Lever | Where | What it changes |
|---|---|---|
| **Batch the judging** | code | The Batch API halves the cost of summarising and judging, and scans aren't time-sensitive. The biggest cost lever, about 40% off a scan. |
| **Judge strictness** | `config/themes.md`, `ITEMS.minScore` | Several vendor posts passed at 6–7 in the first scan. Penalise vendor framing harder, or raise the bar for the pool. |
| **Judge cost** | `EFFORT.judge` | "high" → "medium" for a cheaper Opus. Check it against a handful of known-good and known-bad items first (Hamel's decision-model evals post is relevant). |
| **Seed list** | `config/sources.json` | Prune seeds that only produce rejects; add ones explore keeps finding. Source promotion and demotion, once there's data. |
| **Explore** | `EXPLORE`, `EXPLORE_QUOTAS` | Searches per theme (5), the candidate cap (15), and which theme gets pushed. |
| **Carry-over** | `WEEKLY.carryOverMinScore`, `carryOverPenalty` | Built 2026-10-20 at 8+ with a 1-point handicap. In week one only 1 of 13 unpicked items qualified (most scored 7); lower to 7 if good items keep slipping through. |
| **Freshness and caps** | `ITEMS.maxAgeDays`, `SEED_SWEEP.maxItemsPerSeed` | The 7-day window and 10 candidates per seed. |

## Things to watch

- **Prompt caching.** Switched on 2026-10-22 for explore and summarise (top-level `cache_control`). The 2026-10-22 scan had zero cache reads on 1.05M input, half of it explore. Check `cacheReadTokens` in the next scan's run log; if explore's input barely moves, caching isn't landing on the web-search steps. Judge is left uncached: each page is judged once.

- **Cost per scan.** The first two full scans cost $4.30 and $4.88, with empty memory and the full 7-day lookback. Normal scans cover 3–4 days and skip what's in memory; check the Console after the first few.
- **Index seeds walk back through their archives.** Anthropic, Cursor and Google Developers (an undated feed) offer their next 10 older links each scan until memory covers them. That's free while the pages carry dates, since stale pages are dropped before any model call. Watch for undated ones reaching the summariser.
- **Structured-output parse failures.** Two items failed to parse in the crashed first scan and didn't recur. They're logged as warnings and retried next scan; look into it if they come back.
- **Pass rate.** The first scan kept 20 of 48 judged. If weekly passes drop below about 10, widen explore before lowering the bar.

## Later

- **An archive site** of everything that passed, not just what was sent: every passing card is already stored in full in `generated/pool/`. Showing rejects *with reasons* would need the judge's reason stored too (memory keeps only the title today).
- **X as a source** (costs real money, so only once the digest has proved useful). X blocks page fetches, but the pay-per-use API ($0.005 per post read) works. Design: follow a curated list of about 30 accounts, read their new original posts each scan, keep only X Articles (the API's `article` field carries the text), posts linking to outside articles or repos (fed into the normal pipeline), and long posts above an engagement threshold. Cap reads in code (150 per scan, about $10 a month at most) and use prepaid credits with auto-recharge off. Check the `article` field's shape with one test call first.
- Thumbs up or down feedback from the email, feeding source scores.
- Render `issues/` on shan8851.com.
- Port it to Managed Agents' scheduled deployments and write up the comparison.
- Other topics using the same harness.
