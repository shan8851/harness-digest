# Judge eval

Does the Opus judge agree with a human about what passes? It's the one call the digest's quality rests on, so it gets checked against hand labels rather than trusted.

- `pnpm eval:judge sample` picks a stratified sample of past verdicts (weighted towards the 4/5 pass line, see `EVALS` in `config/settings.ts`) and writes a dated folder: `labels.md`, a blind sheet with only titles and links, and `sample.jsonl`, the answer key.
- Label every item `pass` or `fail` without looking at the key.
- `pnpm eval:judge score evals/judge/<date>` writes `report.md`: agreement, which way the judge leans (too strict or too lenient), and every disagreement next to the judge's reason.

No model calls, no cost. Verdicts come from `generated/verdicts/` (every scan saves every verdict, pass or fail, from November 2026) plus `backfill-2026-11-02.jsonl`, which holds earlier verdicts recovered from the scan logs and the pool. Rejects from the very first scan (20 Oct) ran locally and weren't logged, so they're missing.

The same set is the check to run before changing the judge (a cheaper effort level, a rubric edit): re-judge the sample, compare.
