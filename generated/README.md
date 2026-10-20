# generated/

Written by the harness on every run and committed by the workflows. **Don't hand-edit** unless you're deliberately fixing a bad entry.

| Path | What it is |
|---|---|
| `memory.jsonl` | Every link considered in the last 30 days, so nothing is judged or featured twice. Pruned on every run. |
| `pool/YYYY-Www.jsonl` | This week's items that passed the judge, waiting for Sunday's issue. |
| `runs/*.json` | One log per run: each phase's tokens, timings, quotas, warnings and errors. Each opens with a one-line `summary`. |
| `local/` | Smoke-test and explore outputs from local runs. Git-ignored. |

The weekly issues themselves live in [`../issues/`](../issues/): that's the part meant for reading. Paths are set in `PATHS` in [`config/settings.ts`](../config/settings.ts).
