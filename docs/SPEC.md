# harness-digest: design spec

Status: draft for review, 2026-10-20. Nothing is built yet.

## What it is

A small, public harness that scans twice a week, finds instructive material on **agentic engineering** (how people shape AI agents to produce reliable, verified work), and sends me one skimmable digest a week, with links to the originals.

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

## The scan (Monday and Thursday)

Two scans a week: this niche doesn't move fast enough to need more, and most of the cost is per article judged (each one only once, thanks to memory), not per scan, so extra scans mainly add explore runs. Each run looks back to the last *successful* run, so a failed run never leaves a gap.

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
7. **Store (code):** passing items go into this week's pool; everything considered goes into memory (`generated/memory.jsonl`); the run log is written. Passes are saved to the pool the moment they're kept, so a crash late in a run can't lose cards already paid for.

### Explore quotas (enforced in code)

Per run, counted from real tool calls and **new** (unseen) candidates only:

- at least 20 distinct web searches
- at least 20 new candidates from at least 10 sources outside the seed list (a *source* is a site, or an author on a shared platform: `github.com/owner`, `reddit.com/r/sub`, one Substack)
- at least 2 searches per theme, and 4 for the theme with the fewest passes so far this week
- at least one each of: repo, forum or discussion thread, blog post (videos are blocked: the pipeline can't read them)

Because only *unseen* candidates count, a run where explore keeps finding the same old links automatically triggers a retry. Dedupe and the wider-search guarantee reinforce each other.

Freshness: search queries rotate from a bank for each theme, searches are limited to the last 7 days, and explore is given a list of domains it used in the last 14 days, to avoid.

At most 15 explore candidates per scan go on to summarise and judge, taken in turn from each theme so none crowds out the rest. Rich, free feeds do most of the work; explore fills the gaps.

### Candidate volume

The judge is strict on purpose, so volume has to come from the top of the funnel. Each scan's run log records candidates found, judged, passed and verified, so the pass rate is visible. Rough target: around 90 new candidates a week (seed sweep plus explore across three scans) at a 20–30% pass rate gives 18–27 passes to pick the best 5–7 from. If weekly passes drop below about 10, raise the explore quotas before lowering the bar.

## The weekly issue (Sunday morning)

`pnpm weekly` reads this ISO week's pool (Monday to Sunday) and:

1. **Ranks** by judge score, newest first on ties, and takes up to 7.
2. **One card per story:** items with near-identical titles collapse to the highest-scoring one.
3. **Carry-over:** last week's unpicked items scoring 8 or more get one more chance, ranked a point lower so fresh items win ties, and marked "from last week" on the card. Only the previous week is read, so nothing carries over twice.
4. **At least 2 from explore** when any passed: the lowest-ranked seed items are swapped out for the best explore finds, so the issue isn't only the seed list's usual names.
5. **Intro:** Sonnet writes two or three plain sentences on what the week's items share.
6. **A thin week still sends.** If nothing passed, the email says so, so silence always means something broke.
7. Writes `issues/YYYY-Www.md`, emails it via Resend, and marks the picks as `featured` in memory so they can't appear again.
8. The footer has a health line: scans this week, failures, explore shortfalls, how many passed the judge, how many carried over, and tokens used.

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
- **`generated/memory.jsonl`:** one line per URL considered in the last 30 days: `{key, url, title, firstSeen, status}` where `status` is `featured`, `passed`, or `rejected`.
- **A rolling window:** each run adds new links and prunes anything first seen more than 30 days ago. At ~150 links a week that's a steady 600–700 lines (~130KB) forever. There's no keep-forever list; `issues/` is the permanent record.
- **Code-only:** dedupe is a lookup in TypeScript. The file is never put in a prompt, so its size costs no tokens.
- **Freshness does most of the work:** dated items older than 7 days are dropped, and the window is longer than that, so anything that ages out of memory would fail freshness anyway. Undated items (many repos and threads) are allowed; memory stops them repeating for 30 days. The odd one resurfacing after that is accepted.
- **Same story, different URL:** a cheap title-similarity check in code catches obvious duplicates, and the weekly grouping step catches the rest.

## Sources

`config/sources.json` holds the seed list and each source's stats.

- **Promotion:** a non-seed domain with 3 judge passes in 6 weeks is promoted to the seed list.
- **Demotion:** a seed source with no passes for 6 weeks is demoted.
- Changes are committed by the run, so the history of the list is visible in git.

Discovery hubs (curated lists, Hacker News, r/ClaudeAI, GitHub and YouTube search) are starting points for explore, not seeds.

**Blocked: X (x.com, twitter.com) and video sites (YouTube, Vimeo).** X only serves content to a logged-in browser; video pages return a JavaScript shell rather than a transcript, so there's nothing to summarise. Blocked sites are excluded from web search, dropped before they count as candidates, and refused at fetch time (`BLOCKED_HOSTS` in settings). Revisit X if it proves worth paying for.

## Observability

- **Run log:** `generated/runs/<date>T<time>-<kind>.json` for every run, indented JSON that opens with a one-line summary, e.g. `scan · ok · 4m 12s · 1.24M in · 0.06M out · 23 searches · 18 fetches · quotas met`. Each phase has its own summary line, then the detail: model, duration, tokens (input, output, cache), web searches and fetches, quota results, warnings and errors. It's committed, so the debugging trail is public and browsable.
- **Tokens, not dollars:** token counts are shown in millions so they're easy to price by hand; the Console dashboard has the real spend.
- **Errors:** caught per phase and recorded in the run log. Any failed phase makes the run exit non-zero, so GitHub's failed-workflow email lands in my inbox.
- **Local dry run:** `pnpm scan --dry` runs the whole pipeline on fixtures with no API calls. Deterministic parts (URLs, dedupe, quotas, usage, verify) have vitest tests.

## Limits

- **Money:** the Console workspace spend limit ($85 a month, auto-recharge off) is the only dollar cap, and the Console dashboard is where to check spend. The harness tracks tokens, not prices, so there's no price table to keep up to date.
- **Runaway guard:** a run stops starting new phases once it has used 5M tokens (several times a normal run), keeps what's done, and logs a warning. It exists for loop bugs and retry storms, not normal operation.
- If the Console cap is ever hit, runs fail loudly: the failed-workflow email arrives and the run log says why.

Measured, not guessed: the first real explore run (8 searches max per theme, videos allowed) read 1.34M tokens across 47 searches, because basic web search puts roughly 28k tokens of results into context per search. Explore is the expensive phase, so it's capped at 5 searches per theme call and videos are blocked. Expected now: roughly 0.6–0.8M tokens for explore plus summarising and judging 25–35 items (at most 15 from explore), about $3–3.50 a scan, or $40–45 a month. The seed sweep is free, so richer feeds are the cheap way to improve results. Check the Console after week one.

## Repo layout

```
harness-digest/
  README.md
  docs/SPEC.md             this file
  docs/ROADMAP.md          tuning ideas and later features
  config/
    themes.md              rubric and teaching-moment test (the judge reads this)
    sources.json           seed list, discovery hubs, per-source stats
    settings.ts            quotas, models per phase, run limits
  src/
    scan.ts                a full scan: every phase in order
    weekly.ts              picks the week's best, writes and emails the issue
    sweep.ts, explore.ts   run one phase on its own, for debugging
    smoke.ts               the item pipeline on hand-picked links
    phases/                seedSweep, explore, item (fetch, summarise, judge, verify), intro
    lib/                   urls, feeds, page, dedupe, pool, quotas, usage, runLog, email
  generated/               written by runs, committed, not for hand-editing
    memory.jsonl           dedupe memory (rolling 30 days)
    pool/YYYY-Www.jsonl    this week's passing items
    runs/*.json            run logs
    local/                 smoke and explore outputs (git-ignored)
  issues/YYYY-Www.md       the archive, meant for reading
  tests/
  .github/workflows/       scan.yml, weekly.yml
```

## Running it

- Two GitHub Actions workflows: [`scan.yml`](../.github/workflows/scan.yml) and [`weekly.yml`](../.github/workflows/weekly.yml). **Never triggered by pull requests**, so forks can't reach the secrets.
- **Manual for now** (Actions tab → Run workflow). The weekly workflow offers `dry-run` (builds and prints the issue; no email, nothing marked featured, nothing committed) or `send`.
- **Going live** means uncommenting the `schedule:` blocks: scans at 02:00 UTC on Monday and Thursday, the weekly issue at 06:30 UTC on Sunday (scheduled runs always send). One email a week.
- Secrets are referenced in the YAML (`${{ secrets.ANTHROPIC_API_KEY }}`) and exposed only to the step that needs them. Locally, the same variables come from `.env`.
- The workflows commit `generated/` (and `issues/`) back to `main` as `github-actions[bot]`, with the run's summary line as the commit message. The scan commits even if it failed, since passes are saved as they're kept and the run log explains the failure.
- Both share a concurrency group, so a scan and the weekly issue never run at the same time.
- Secrets: `ANTHROPIC_API_KEY` (a key from the credit-funded Console workspace), `RESEND_API_KEY`, `DIGEST_EMAIL_TO` (comma-separated recipients, kept secret so no addresses are in a public repo).
- Stack: TypeScript, pnpm, vitest, `@anthropic-ai/sdk` with server-side `web_search` and `web_fetch`. No agent framework: the phases *are* the harness.


## Public-repo hygiene

- Summaries are in the harness's own words, with at most one short quote per item, length-checked by the verifier.
- No personal data in the repo; recipient addresses live in secrets.
- **Written for any reader.** Issues never mention me, my family, my work or any personal context. They should be safe to forward, and the recipient list may grow later (`DIGEST_EMAIL_TO` takes a comma-separated list). "Steal this" lines use generic framings: at work, for your team, for a side project, at home.
- Run logs contain token counts, never keys.

## Build order

1. `lib/` (URLs, dedupe, quotas, usage, run log) with tests. **Done.**
2. Thin end-to-end slice: `pnpm smoke <urls>` summarises, judges, verifies and emails hand-picked links. **Done.**
3. Seed sweep (`pnpm sweep`, free). **Done.**
4. Explore (`pnpm explore`). **Done.**
5. `pnpm scan` and `pnpm weekly`: the whole pipeline, with memory, the week's pool and run logs. **Done:** first real issue sent 2026-10-20.
6. GitHub Actions: scans Monday and Thursday, the issue on Sunday, committing `generated/` and `issues/` back.
7. Let it run for a few weeks, then tune from the logs ([ROADMAP.md](ROADMAP.md)).

## Later

Tuning ideas, things to watch and later features are in [ROADMAP.md](ROADMAP.md).

## Success test (4 weeks after the first issue)

I've opened at least 3 of the 4 issues and tried at least one "steal this" in my own harness or at work. If not, change the format once, then kill it.
