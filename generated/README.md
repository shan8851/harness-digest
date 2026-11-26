# generated/

Written by the harness on every run and committed by the workflows. **Don't hand-edit** unless you're deliberately fixing a bad entry.

| Path | What it is |
|---|---|
| `memory.jsonl` | Every link considered in the last 40 days, so nothing is judged or featured twice. Pruned on every run. |
| `pool/YYYY-MM.jsonl` | This month's items that passed the judge, waiting for the issue on the 1st. (`YYYY-Www.jsonl` files are from the weekly era.) |
| `verdicts/YYYY-MM.jsonl` | Every judge verdict, pass or fail, for evals and the site's "judged out" lists. |
| `runs/*.json` | One log per run: each phase's tokens, timings, quotas, warnings and errors. Each opens with a one-line `summary`. |
| `local/` | Smoke-test and explore outputs from local runs. Git-ignored. |

The issues themselves live in [`../issues/`](../issues/): that's the part meant for reading. Paths are set in `PATHS` in [`config/settings.ts`](../config/settings.ts).
