// The judge eval: does Opus agree with a human about what passes?
//
// 1. sample: a stratified, seeded pick of past verdicts, written as a blind
//    labelling sheet (no scores, no verdicts) plus a hidden answer key.
// 2. A person opens each link and writes pass or fail.
// 3. score: agreement, a confusion table, and every disagreement with the
//    judge's reason beside it. The disagreements are the point; the
//    percentage is just the headline.
//
// Pure functions here; file handling is in src/evalJudge.ts.

import type { VerdictRecord } from "./verdicts.js";

export interface Stratum {
  status: "kept" | "rejected";
  minScore: number;
  maxScore: number;
  take: number;
}

export type Label = "pass" | "fail";

export interface LabelEntry {
  n: number; // 1-based position on the sheet
  label: Label | null; // null until labelled
  why: string;
}

/** Small seeded PRNG (mulberry32), so the same seed always gives the same sample. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], next: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** One record per key; a later record (a newer verdict) replaces an earlier one. */
export function latestByKey(records: VerdictRecord[]): VerdictRecord[] {
  return [...new Map(records.map((r) => [r.key, r])).values()];
}

/**
 * Takes up to `take` items from each band, then shuffles the lot so passes
 * and fails aren't grouped on the sheet (grouping would give the game away).
 * A band with too few items gives what it has; the shortfall is reported.
 */
export function pickSample(records: VerdictRecord[], strata: readonly Stratum[], seed: number): { sample: VerdictRecord[]; shortfalls: string[] } {
  const next = random(seed);
  const picked: VerdictRecord[] = [];
  const shortfalls: string[] = [];
  for (const s of strata) {
    const band = records.filter((r) => r.status === s.status && r.verdict.score >= s.minScore && r.verdict.score <= s.maxScore);
    const taken = shuffle(band, next).slice(0, s.take);
    if (taken.length < s.take) shortfalls.push(`${s.status} ${s.minScore}-${s.maxScore}: wanted ${s.take}, had ${taken.length}`);
    picked.push(...taken);
  }
  return { sample: shuffle(picked, next), shortfalls };
}

/** The blind sheet: titles and links only. */
export function renderLabelSheet(sample: VerdictRecord[], date: string): string {
  const header = [
    `# Judge eval: labels (${date})`,
    "",
    "Open each link and decide: would you want this in the digest? Use the same bar as the judge,",
    "the teaching-moment test in config/themes.md: a concrete technique a working engineer could copy this week.",
    "",
    "Write `pass` or `fail` after `label:`. `why:` is optional; fill it in when you're unsure or think the judge will disagree.",
    "Don't look at the answer key (sample.jsonl) or the logs until you've finished. Then run `pnpm eval:judge score <this folder>`.",
    "",
  ];
  const items = sample.map((r, i) => [`## ${String(i + 1).padStart(2, "0")}. ${r.title}`, "", r.url, "", "- label:", "- why:", ""].join("\n"));
  return [...header, ...items].join("\n");
}

/** Reads the sheet back. Anything other than pass/fail (including blank) counts as unlabelled. */
export function parseLabels(sheet: string): LabelEntry[] {
  const entries: LabelEntry[] = [];
  for (const block of sheet.split(/^## /m).slice(1)) {
    const n = Number(block.match(/^(\d+)\./)?.[1]);
    if (!Number.isFinite(n)) continue;
    const raw = block.match(/^- label:[ \t]*(.*)$/m)?.[1]?.trim().toLowerCase() ?? "";
    const why = block.match(/^- why:[ \t]*(.*)$/m)?.[1]?.trim() ?? "";
    entries.push({ n, label: raw === "pass" || raw === "fail" ? raw : null, why });
  }
  return entries;
}

export interface Disagreement {
  n: number;
  record: VerdictRecord;
  human: Label;
  why: string;
}

export interface EvalReport {
  labelled: number;
  unlabelled: number;
  agree: number;
  // Rows are the human's call, columns the judge's.
  confusion: { passPass: number; passFail: number; failPass: number; failFail: number };
  disagreements: Disagreement[];
}

export function scoreEval(sample: VerdictRecord[], labels: LabelEntry[]): EvalReport {
  const report: EvalReport = { labelled: 0, unlabelled: 0, agree: 0, confusion: { passPass: 0, passFail: 0, failPass: 0, failFail: 0 }, disagreements: [] };
  sample.forEach((record, i) => {
    const entry = labels.find((l) => l.n === i + 1);
    if (!entry?.label) {
      report.unlabelled++;
      return;
    }
    report.labelled++;
    const judgePassed = record.status === "kept";
    const humanPassed = entry.label === "pass";
    if (humanPassed && judgePassed) report.confusion.passPass++;
    if (humanPassed && !judgePassed) report.confusion.passFail++;
    if (!humanPassed && judgePassed) report.confusion.failPass++;
    if (!humanPassed && !judgePassed) report.confusion.failFail++;
    if (humanPassed === judgePassed) report.agree++;
    else report.disagreements.push({ n: i + 1, record, human: entry.label, why: entry.why });
  });
  return report;
}

export function renderReport(report: EvalReport, date: string): string {
  const pct = report.labelled ? Math.round((report.agree / report.labelled) * 100) : 0;
  const { passPass, passFail, failPass, failFail } = report.confusion;
  const lines = [
    `# Judge eval: report (${date})`,
    "",
    `**Agreement:** ${report.agree}/${report.labelled} (${pct}%)${report.unlabelled ? ` · ${report.unlabelled} not labelled yet` : ""}`,
    "",
    "| | Judge passed | Judge failed |",
    "|---|---|---|",
    `| **I passed** | ${passPass} | ${passFail} (judge too strict) |`,
    `| **I failed** | ${failPass} (judge too lenient) | ${failFail} |`,
    "",
    "## Disagreements",
    "",
  ];
  if (report.disagreements.length === 0) lines.push("None.");
  for (const d of report.disagreements) {
    lines.push(
      `**${String(d.n).padStart(2, "0")}. ${d.record.title}** (${d.record.url})`,
      `- Me: ${d.human}${d.why ? `: ${d.why}` : ""}`,
      `- Judge: ${d.record.status === "kept" ? "pass" : "fail"}, ${d.record.verdict.score}/10: ${d.record.verdict.reason || d.record.problems.join("; ")}`,
      "",
    );
  }
  return lines.join("\n");
}
