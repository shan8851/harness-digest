// The judge eval (see src/lib/judgeEval.ts for the method). No model calls, no cost.
//
//   pnpm eval:judge sample [--seed 1]    writes evals/judge/<date>/labels.md and sample.jsonl
//   pnpm eval:judge score <folder>       reads the labels, writes <folder>/report.md
//
// Verdicts come from generated/verdicts/ (every scan from 2 Nov 2026) plus
// evals/judge/backfill-*.jsonl (earlier verdicts recovered from scan logs).

import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { EVALS, PATHS } from "../config/settings.js";
import { latestByKey, parseLabels, pickSample, renderLabelSheet, renderReport, scoreEval } from "./lib/judgeEval.js";
import { loadVerdicts, type VerdictRecord } from "./lib/verdicts.js";

const EVAL_DIR = join(PATHS.evals, "judge");
const [command, ...rest] = process.argv.slice(2);

async function readJsonl(path: string): Promise<VerdictRecord[]> {
  const text = await readFile(path, "utf8");
  return text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as VerdictRecord);
}

async function allVerdicts(): Promise<VerdictRecord[]> {
  const backfills = (await readdir(EVAL_DIR).catch(() => [] as string[])).filter((f) => f.startsWith("backfill-") && f.endsWith(".jsonl")).sort();
  const old = (await Promise.all(backfills.map((f) => readJsonl(join(EVAL_DIR, f))))).flat();
  return latestByKey([...old, ...(await loadVerdicts(PATHS.verdicts))]);
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(() => true, () => false);
}

if (command === "sample") {
  const seedAt = rest.indexOf("--seed");
  const seed = seedAt >= 0 ? Number(rest[seedAt + 1]) : 1;
  const date = new Date().toISOString().slice(0, 10);
  const dir = join(EVAL_DIR, date);
  // Never overwrite a sheet someone may already be labelling.
  if (await exists(join(dir, "labels.md"))) throw new Error(`${dir}/labels.md already exists; label that one, or delete it first`);
  const records = await allVerdicts();
  const { sample, shortfalls } = pickSample(records, EVALS.judgeStrata, seed);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "sample.jsonl"), sample.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  await writeFile(join(dir, "labels.md"), renderLabelSheet(sample, date), "utf8");
  console.log(`${sample.length} items from ${records.length} verdicts (seed ${seed}) → ${dir}/labels.md`);
  for (const s of shortfalls) console.log(`  short: ${s}`);
} else if (command === "score" && rest[0]) {
  const dir = rest[0];
  const sample = await readJsonl(join(dir, "sample.jsonl"));
  const labels = parseLabels(await readFile(join(dir, "labels.md"), "utf8"));
  const report = renderReport(scoreEval(sample, labels), dir.split("/").filter(Boolean).at(-1) ?? dir);
  await writeFile(join(dir, "report.md"), report, "utf8");
  console.log(report);
} else {
  console.log("usage: pnpm eval:judge sample [--seed N] | pnpm eval:judge score <folder>");
  process.exitCode = 1;
}
