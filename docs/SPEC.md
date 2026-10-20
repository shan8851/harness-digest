# harness-digest: design spec

Status: draft for review, 2026-10-20. Nothing is built yet.

## What it is

A small, public harness that runs three times a week, finds instructive material on **agentic engineering** (how people shape AI agents to produce reliable, verified work), and sends me one skimmable digest a week, with links to the originals.

It's also the practice project: the harness itself uses the patterns it reads about (fixed phases, quotas checked in code, a judge, a verifier, memory, token tracking).

## Principles

1. **Code enforces, prompts suggest.** Anything that must happen (wider search, dedupe, link checks, budgets) is checked by the script, never left to the model's good intentions.
2. **Proof of work comes from the log, not the model's word.** We count real tool calls from the API response, and verify quotes against the fetched page.
3. **Readable over clever.** Small modules, one per phase, with comments that explain *why*. Someone should be able to read the repo top to bottom in an evening.
4. **Failure is visible.** A weak or failed run says so in the run log and in the weekly email. Nothing fails silently.
5. **Cheap and bounded.** A token runaway guard per run, and the Console workspace spend limit as the hard cap.

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
| Judge | `claude-opus-5-5` | The teaching-moment call *is* the product. Opus reads the card and the full page text: an excerpt-only judge wrongly failed good items in the first smoke test. |
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
4. **Read and summarise:** for each new candidate, fetch the page and produce the card: one-line idea, 3–5 "how it works" bullets, "steal this", "go deeper if", theme, content type, time to read or watch, and one short verified quote.
5. **Judge (Opus):** apply the teaching-moment test with the rubric. Output: pass or fail, score from 1 to 10, theme, one-line reason. Structured output, so the result always parses.
6. **Verify (code):** decides only whether the item makes the issue: the judge passed it with a score of at least 5, it was published within 7 days (undated items are allowed), and the card isn't empty. **Presentation never drops an item.** Card shape is tidied before judging (below), and a quote that's too long or not found on the fetched page is removed, not the item.
7. **Store (code):** passing items go into this week's pool; everything considered goes into `state/seen.jsonl`; source stats are updated; the run log is written.

### Explore quotas (enforced in code)

Per run, counted from real tool calls and **new** (unseen) candidates only:

- at least 20 distinct web searches
- at least 20 new candidates from at least 10 sources outside the seed list (a *source* is a site, or an author on a shared platform: `github.com/owner`, `reddit.com/r/sub`, one Substack)
- at least 2 searches per theme, and 4 for the theme with the fewest passes so far this week
- at least one each of: video, repo, forum or discussion thread, blog post

Because only *unseen* candidates count, a run where explore keeps finding the same old links automatically triggers a retry. Dedupe and the wider-search guarantee reinforce each other.

Freshness: search queries rotate from a bank for each theme, searches are limited to the last 7 days, and explore is given a list of domains it used in the last 14 days, to avoid.

### Candidate volume

The judge is strict on purpose, so volume has to come from the top of the funnel. Each scan's run log records candidates found, judged, passed and verified, so the pass rate is visible. Rough target: around 90 new candidates a week (seed sweep plus explore across three scans) at a 20–30% pass rate gives 18–27 passes to pick the best 5–7 from. If weekly passes drop below about 10, raise the explore quotas before lowering the bar.

## The weekly issue (Sunday morning)

1. Take this week's pool and pick the top 5 to 7 by judge score, with **at least 2 from outside the seed list** (or the issue says why not).
2. Group items covering the same story and keep the best source.
3. Sonnet writes a three-line intro.
4. Write `issues/YYYY-Www.md`, commit it, and email it to me via Resend.
5. The email footer has a health line: runs this week, failures, explore shortfalls, tokens used this week.

### Item card (format locked 2026-10-20)

The email opens with a **This week** contents list (each title plus its one-line idea), then one card per item:

```
1. How the Claude Code team does code review
blog · 14 min · lighter review · 9/10 · 15 Oct

Most review happens before a human looks: agents prove their work,
other agents check it, and humans only see what's left.

How it works
• The authoring agent must attach test output or screenshots as proof
• A fresh-context subagent reviews the diff against a per-folder REVIEW.md
• Review agents vote on findings; nits are capped, file-and-line evidence required

Steal this: Before your next agent-written PR, add a short REVIEW.md that
defines failure, caps nits and demands file-and-line evidence.

Go deeper if: you're the bottleneck on reviewing agent output.
```

Shape limits (3–5 bullets of at most 25 words, a short idea and "go deeper if") are checked straight after summarising. A card that breaks them is sent back with the exact problems, up to twice; if it's still over, it's published as it is and the run log records a warning. Quality is the judge's call alone. The verified quote is kept in the archive but left out of the email.

## Dedupe without months of maintenance

- **Canonical URL key:** lowercase host, strip `www.`, tracking parameters (`utm_*`, `ref`, `fbclid`...), fragments and trailing slashes. YouTube links reduce to the video ID; GitHub links reduce to `owner/repo`, except issues, pull requests and discussions, which stay distinct. `twitter.com` and `x.com` are treated as one.
- **`state/seen.jsonl`:** one line per URL considered in the last 30 days: `{key, url, title, firstSeen, status}` where `status` is `featured`, `passed`, or `rejected`.
- **A rolling window:** each run adds new links and prunes anything first seen more than 30 days ago. At ~150 links a week that's a steady 600–700 lines (~130KB) forever. There's no keep-forever list; `issues/` is the permanent record.
- **Code-only:** dedupe is a lookup in TypeScript. The file is never put in a prompt, so its size costs no tokens.
- **Freshness does most of the work:** dated items older than 7 days are dropped, and the window is longer than that, so anything that ages out of memory would fail freshness anyway. Undated items (many repos, threads, videos) are allowed; memory stops them repeating for 30 days. The odd one resurfacing after that is accepted.
- **Same story, different URL:** a cheap title-similarity check in code catches obvious duplicates, and the weekly grouping step catches the rest.

## Sources

`config/sources.json` holds the seed list and each source's stats.

- **Promotion:** a non-seed domain with 3 judge passes in 6 weeks is promoted to the seed list.
- **Demotion:** a seed source with no passes for 6 weeks is demoted.
- Changes are committed by the run, so the history of the list is visible in git.

Discovery hubs (curated lists, Hacker News, r/ClaudeAI, GitHub and YouTube search) are starting points for explore, not seeds.

**Blocked: X (x.com, twitter.com).** It only serves content to a logged-in browser. Blocked sites are excluded from web search, dropped before they count as candidates, and refused at fetch time (`BLOCKED_HOSTS` in settings). Revisit if X content proves worth paying for.

## Observability

- **Run log:** `runs/<date>T<time>-<kind>.json` for every run, indented JSON that opens with a one-line summary, e.g. `scan · ok · 4m 12s · 1.24M in · 0.06M out · 23 searches · 18 fetches · quotas met`. Each phase has its own summary line, then the detail: model, duration, tokens (input, output, cache), web searches and fetches, quota results, warnings and errors. It's committed, so the debugging trail is public and browsable.
- **Tokens, not dollars:** token counts are shown in millions so they're easy to price by hand; the Console dashboard has the real spend.
- **Errors:** caught per phase and recorded in the run log. Any failed phase makes the run exit non-zero, so GitHub's failed-workflow email lands in my inbox.
- **Local dry run:** `pnpm scan --dry` runs the whole pipeline on fixtures with no API calls. Deterministic parts (URLs, dedupe, quotas, usage, verify) have vitest tests.

## Limits

- **Money:** the Console workspace spend limit ($85 a month, auto-recharge off) is the only dollar cap, and the Console dashboard is where to check spend. The harness tracks tokens, not prices, so there's no price table to keep up to date.
- **Runaway guard:** a run stops starting new phases once it has used 5M tokens (several times a normal run), keeps what's done, and logs a warning. It exists for loop bugs and retry storms, not normal operation.
- If the Console cap is ever hit, runs fail loudly: the failed-workflow email arrives and the run log says why.

Rough estimate: around 1–2M tokens a run, mostly Sonnet reading pages. Check the Console after week one.

## Repo layout

```
harness-digest/
  README.md
  docs/SPEC.md             this file
  config/
    themes.md              rubric and teaching-moment test (the judge reads this)
    sources.json           seed list, discovery hubs, per-source stats
    settings.ts            quotas, models per phase, run limits
  src/
    scan.ts                entry point: runs the phases in order
    weekly.ts              builds the issue, sends the email
    phases/                seedSweep, explore, summarise, judge, verify, store
    lib/                   urls, dedupe, quotas, usage, runLog, anthropic client
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
- Run logs contain token counts, never keys.

## Build order

1. `lib/` (URLs, dedupe, quotas, usage, run log) with tests. No API calls. **Done.**
2. **Thin end-to-end slice, run locally from `.env`:** summarise and judge 2–3 hand-picked URLs, verify them, render a mini issue, and email it via Resend. It proves the keys, the model routing, the email and the run log before anything bigger is built on top.
3. Seed sweep and explore with quota enforcement; full dry run.
4. Store, and the scan workflow on GitHub.
5. The weekly issue workflow.
6. Watch for a week; tune the rubric, quotas and limits.

## Later, not v1

- **X as a source (costs real money, so only once the digest has proved useful).** X blocks page fetches, but the pay-per-use API ($0.005 per post read) works. Design: follow a curated list of about 30 accounts, read their new original posts each scan, keep only X Articles (the API's `article` field carries the text), posts linking to outside articles or repos (fed into the normal pipeline), and long posts above an engagement threshold. Cap reads in code (150 per scan, about $10 a month at most) and use prepaid credits with auto-recharge off. Check the `article` field's shape with one test call first.

- Thumbs up or down feedback from the email, feeding source scores.
- Render `issues/` on shan8851.com.
- Port it to Managed Agents' scheduled deployments and write up the comparison.
- Other topics using the same harness.

## Success test (4 weeks after the first issue)

I've opened at least 3 of the 4 issues and tried at least one "steal this" in my own harness or at work. If not, change the format once, then kill it.
