# harness-digest

A small public agent harness: two scans a week (Monday and Thursday) find instructive agentic-engineering material, and a weekly issue on Sunday emails the best of it. The design is in [docs/SPEC.md](docs/SPEC.md); read it before changing behaviour.

## Commands

- `pnpm install`
- `pnpm check`: typecheck and tests. Run before every commit.
- `pnpm test:watch` while working on `src/lib/`.

## How the code is laid out

- `config/settings.ts`: every tunable number (models per phase, quotas, run limits, memory). Put new knobs here, not in phase code.
- `config/themes.md`: the rubric and writing rules. The judge reads it at runtime, so edits change behaviour.
- `config/sources.json`: seed sources and their stats. The scan updates it.
- `src/lib/`: deterministic, pure-ish helpers with tests (URLs, dedupe, quotas, usage, run logs).
- `src/phases/`: one file per pipeline phase. Phases are where the API is called.
- `generated/`: memory, the weekly pool and run logs, written by runs and committed. Don't hand-edit except to fix a bad entry. All paths are in `PATHS` in settings.
- `issues/`: the weekly issues, the readable archive.
- `docs/ROADMAP.md`: tuning ideas and later features. Let it run before tuning.

## Principles (from the spec)

- **Code enforces, prompts suggest.** Anything that must happen (quotas, dedupe, verification, limits) is checked in TypeScript, never left to a prompt.
- **Proof comes from the log, not the model's word.** Count real tool calls from the API response; verify quotes against fetched page text.
- **Readable over clever.** The repo is a public showcase. Small modules, comments that explain *why*, test names that read as plain-English behaviour.
- **Presentation never drops an item.** Only the judge (and freshness) decide what's in. Card shape gets tidy-up passes and warnings; a bad quote is removed, not the item.
- **Tokens, not dollars.** Track usage in tokens; spend lives on the Console dashboard. Don't add a price table.

## Conventions

- TypeScript (strict), ESM, pnpm, vitest. Plain `@anthropic-ai/sdk` with server-side web search and fetch; no agent framework.
- Models are set per phase in `MODELS`: Sonnet 5.5 finds and summarises, Opus 5.5 judges.
- Dependencies must be at least 3 days old (`minimumReleaseAge` in `pnpm-workspace.yaml`). Don't bypass it.
- LF line endings everywhere (`.gitattributes`); the workflows run on Linux.
- Commit messages: short imperative subject, a body that says why.

## Never

- Commit `.env` or put keys, email addresses or other personal details anywhere in the repo. Secrets live in GitHub Actions secrets.
- Let generated issue content mention a specific person, family, employer or project. Issues must be safe to forward to strangers.
- Reproduce source articles. Summaries in our own words, at most one quote of 25 words or fewer per item.
- Trigger workflows on `pull_request` or `pull_request_target`. Schedule and manual runs only, so forks can't reach secrets.
