// Prints the one-line summary of the newest run log of a kind, for the
// workflows' commit messages: `node scripts/last-run-summary.mjs scan`
//   -> "scan · ok · 3m 2s · 6 kept of 31 found · 0.912M in · ..."

import { readdirSync, readFileSync } from "node:fs";

const kind = process.argv[2] ?? "scan";
const dir = "generated/runs";
const newest = readdirSync(dir)
  .filter((f) => f.endsWith(`-${kind}.json`))
  .sort()
  .at(-1);
console.log(newest ? JSON.parse(readFileSync(`${dir}/${newest}`, "utf8")).summary : `${kind} · no run log found`);
