# harness-digest

A small agent harness that reads the internet three times a week so I don't have to.

Every Monday, Wednesday and Friday it searches for instructive writing, videos and repos on **agentic engineering**: how people shape AI agents to produce solid, verified work. A Sonnet model finds and summarises; an Opus model judges whether each item has a real teaching moment; plain code checks the work. Once a week the best five to seven items land in my inbox and in [`issues/`](issues/).

The harness is also the practice: it's built from the patterns it reads about. Fixed phases, quotas enforced in code rather than in prompts, a separate judge, a verifier that checks quotes against the source, self-pruning memory, and a cost log for every run.

**Status:** building. Step 1 of 6 done (URLs, dedupe, quotas, cost, run logs). See [docs/SPEC.md](docs/SPEC.md).

## Develop

```bash
pnpm install
pnpm check   # typecheck + tests
```

## How it works

```
scan:     seed sweep → explore → dedupe + quotas → summarise → judge → verify → store
weekly:   pick the best → write the issue → email it → commit it
```

- What counts: [config/themes.md](config/themes.md)
- Where it looks: [config/sources.json](config/sources.json) (the list grows and shrinks on its own)
- What every run did and cost: [`runs/`](runs/)
