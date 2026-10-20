# harness-digest: design spec

Status: draft for review, 2026-10-20. Nothing is built yet.

## What it is

A small, public harness that runs three times a week, finds instructive material on **agentic engineering** (how people shape AI agents to produce reliable, verified work), and sends me one skimmable digest a week, with links to the originals.

It's also the practice project: the harness itself uses the patterns it reads about (fixed phases, quotas checked in code, a judge, a verifier, memory, cost tracking).

## Principles

1. **Code enforces, prompts suggest.** Anything that must happen (wider search, dedupe, link checks, budgets) is checked by the script, never left to the model's good intentions.
2. **Proof of work comes from the log, not the model's word.** We count real tool calls from the API response, and verify quotes against the fetched page.
3. **Readable over clever.** Small modules, one per phase, with comments that explain *why*. Someone should be able to read the repo top to bottom in an evening.
4. **Failure is visible.** A weak or failed run says so in the run log and in the weekly email. Nothing fails silently.
5. **Cheap and bounded.** Hard budget guards at three levels (run, month, Console workspace).

## Topic and rubric

Five themes, defined in [`config/themes.md`](../config/themes.md), which is also the judge's rubric:

1. Harness design
2. Verification and proof of work
3. Lighter code review
4. Harnesses for non-engineers
5. Real setups

**Teaching-moment test:** an item only passes if it contains a concrete, transferable technique I could copy this week.

## Models (routing)

| Phase | Model | Why |
|---|---|---|
| Seed sweep, explore, read and summarise | `claude-sonnet-5-5` | Token-heavy searching and reading; Sonnet is half the price and good at it. |
| Judge | `claude-opus-5-5` | The teaching-moment call *is* the product. Opus judges the summary plus an excerpt, not the whole page, which keeps it cheap. |
| Weekly intro line | `claude-sonnet-5-5` | Three sentences; doesn't need Opus. |

Models are set per phase in config, so swapping one is a one-line change.

## The scan (Monday, Wednesday, Friday)

Three runs a week instead of nightly: this niche doesn't move fast enough to need daily checks, and fewer, deeper runs get more room each (bigger quotas, no tight per-run cap). Each run looks back to the last *successful* run, so a failed run never leaves a gap.

```
seed sweep ──► explore ──► dedupe + quota check ──► read & summarise ──► judge ──► verify ──► store
 (Sonnet)     (Sonnet)        (code)    │              (Sonnet)          (Opus)    (code)    (code)
                                        └── quota missed? retry explore with the gap (max 2)
```

1. **Seed sweep:** check every source in `config/sources.json` for anything published since the last successful run (capped at 7 days).
2. **Explore:** open search beyond the seed list. Quotas below.
3. **Dedupe and quota check (code):** canonicalise URLs, drop anything already seen, then count what's left against the quotas. If explore falls short, send it back with the specific gap (for example, "3 new sources, need 10; theme 4 has no searches"), up to 2 retries. If it still falls short, record the shortfall and carry on.
4. **Read and summarise:** for each new candidate, fetch the page and produce: technique (2 lines), "steal this" (1 line), theme, content type, time to read or watch, published date, and one short quote.
5. **Judge (Opus):** apply the teaching-moment test with the rubric. Output: pass or fail, score from 1 to 10, theme, one-line reason. Structured output, so the result always parses.
6. **Verify (code):** link resolves; the quote actually appears in the fetched page text; the quote is 25 words or fewer; the published date is within 14 days; all fields are present and valid.
7. **Store (code):** passing items go into this week's pool; everything considered goes into `state/seen.jsonl`; source stats are updated; the run log is written.

### Explore quotas (enforced in code)

Per run, counted from real tool calls and **new** (unseen) candidates only:

- at least 20 distinct web searches
- at least 20 new candidates from at least 10 sources outside the seed list (a *source* is a site, or an author on a shared platform: `github.com/owner`, `reddit.com/r/sub`, one Substack)
- at least 2 searches per theme, and 4 for the theme with the fewest passes so far this week
- at least one each of: video, repo, forum or discussion thread, blog post

Because only *unseen* candidates count, a run where explore keeps finding the same old links automatically triggers a retry. Dedupe and the wider-search guarantee reinforce each other.

Freshness: search queries rotate from a bank for each theme, searches are limited to the last 7 days, and explore is given a list of domains it used in the last 14 days, to avoid.

## The weekly issue (Sunday morning)

1. Take this week's pool and pick the top 5 to 7 by judge score, with **at least 2 from outside the seed list** (or the issue says why not).
2. Group items covering the same story and keep the best source.
3. Sonnet writes a three-line intro.
4. Write `issues/YYYY-Www.md`, commit it, and email it to me via Resend.
5. The email footer has a health line: runs this week, failures, explore shortfalls, spend this month.

### Item card

```
### Title  (blog · 12 min)  [harness design]
The technique, in two lines.
**Steal this:** the one thing to try.
> "One short quote from the source."
link · published 2026-10-18 · score 8/10
```

## Dedupe without months of maintenance

- **Canonical URL key:** lowercase host, strip `www.`, tracking parameters (`utm_*`, `ref`, `fbclid`...), fragments and trailing slashes. YouTube links reduce to the video ID; GitHub links reduce to `owner/repo`, except issues, pull requests and discussions, which stay distinct. `twitter.com` and `x.com` are treated as one.
- **`state/seen.jsonl`:** one line per URL ever considered: `{key, url, title, firstSeen, status}` where `status` is `featured`, `passed`, or `rejected`.
- **Self-pruning:** each run drops `passed` and `rejected` lines older than 90 days. `featured` lines are kept forever (about 300 a year, trivial). The file stays bounded with zero manual upkeep.
- **Same story, different URL:** a cheap title-similarity check in code catches obvious duplicates, and the weekly grouping step catches the rest.

## Sources

`config/sources.json` holds the seed list and each source's stats.

- **Promotion:** a non-seed domain with 3 judge passes in 6 weeks is promoted to the seed list.
- **Demotion:** a seed source with no passes for 6 weeks is demoted.
- Changes are committed by the run, so the history of the list is visible in git.

Discovery hubs (curated lists, Hacker News, r/ClaudeAI, GitHub and YouTube search) are starting points for explore, not seeds.

## Observability

- **Run log:** `runs/YYYY-MM-DD.json` for every run: per phase, the model, duration, tokens (input, output, cache), web searches and fetches, cost in USD, quota results, retries and errors. It's committed, so the debugging trail is public and browsable.
- **Cost:** computed from each response's `usage` multiplied by a price table in `config/settings.ts`, plus web search fees. One place to update if prices change.
- **Errors:** caught per phase and recorded in the run log. Any failed phase makes the run exit non-zero, so GitHub's failed-workflow email lands in my inbox.
- **Local dry run:** `pnpm scan --dry` runs the whole pipeline on fixtures with no API calls. Deterministic parts (URLs, dedupe, quotas, cost, verify) have vitest tests.

## Budget guards

| Level | Limit | What happens |
|---|---|---|
| Per run | $10 | Runaway guard only (a loop bug, a retry storm), set well above normal spend so it never trips on a healthy run. If it does: stop starting new phases, keep and store what's done, log a warning. |
| Per month (sum of run logs) | $75 | Skip explore, seed sweep only; flagged in the weekly email. |
| Console workspace | $85 | Hard stop from Anthropic. Auto-recharge off. |

Rough estimate: $2–4 a run (mostly Sonnet reading pages), so about $25–50 a month across 13 runs. Measure in week one and adjust.

## Repo layout

```
harness-digest/
  README.md
  docs/SPEC.md             this file
  config/
    themes.md              rubric and teaching-moment test (the judge reads this)
    sources.json           seed list, discovery hubs, per-source stats
    settings.ts            quotas, models per phase, budgets, prices
  src/
    scan.ts                entry point: runs the phases in order
    weekly.ts              builds the issue, sends the email
    phases/                seedSweep, explore, summarise, judge, verify, store
    lib/                   urls, dedupe, quotas, cost, runLog, anthropic client
  state/
    seen.jsonl             dedupe memory (self-pruning)
    pool/YYYY-Www.jsonl    this week's passing items
  issues/YYYY-Www.md       the archive
  runs/YYYY-MM-DD.json     run logs
  tests/
  .github/workflows/       scan.yml, weekly.yml
```

## Running it

- GitHub Actions, triggered on schedule and on manual runs only. **Never on pull requests**, so forks can't reach the secrets.
- Scan at 02:00 UTC on Monday, Wednesday and Friday; weekly issue at 06:30 UTC on Sunday.
- The workflow commits `state/`, `runs/` and `issues/` back to `main`.
- Secrets: `ANTHROPIC_API_KEY` (a key from the credit-funded Console workspace), `RESEND_API_KEY`, `DIGEST_EMAIL_TO` (comma-separated recipients, kept secret so no addresses are in a public repo).
- Stack: TypeScript, pnpm, vitest, `@anthropic-ai/sdk` with server-side `web_search` and `web_fetch`. No agent framework: the phases *are* the harness.


## Public-repo hygiene

- Summaries are in the harness's own words, with at most one short quote per item, length-checked by the verifier.
- No personal data in the repo; recipient addresses live in secrets.
- **Written for any reader.** Issues never mention me, my family, my work or any personal context. They should be safe to forward, and the recipient list may grow later (`DIGEST_EMAIL_TO` takes a comma-separated list). "Steal this" lines use generic framings: at work, for your team, for a side project, at home.
- Run logs contain costs and counts, never keys.

## Build order

1. `lib/` (URLs, dedupe, quotas, cost, run log) with tests. No API calls.
2. Read and summarise, plus judge, run locally on 3 hand-picked URLs. Check output quality and cost.
3. Seed sweep and explore with quota enforcement; full dry run.
4. Verify and store, then the scan workflow on GitHub.
5. Weekly issue and email.
6. Watch for a week; tune the rubric, quotas and budgets.

## Later, not v1

- Thumbs up or down feedback from the email, feeding source scores.
- Render `issues/` on shan8851.com.
- Port it to Managed Agents' scheduled deployments and write up the comparison.
- Other topics using the same harness.

## Success test (4 weeks after the first issue)

I've opened at least 3 of the 4 issues and tried at least one "steal this" in my own harness or at work. If not, change the format once, then kill it.
