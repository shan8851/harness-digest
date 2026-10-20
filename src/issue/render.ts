// Turns verified items into an issue: markdown for the repo archive, and HTML
// plus plain text for the email. The layout lives here in code; the models
// only ever supply the words inside each card.
//
// Card format (locked 2026-10-20):
//   Title · type · minutes · theme · score · date
//   One-line idea
//   How it works: 3–5 bullets
//   Steal this: one sentence
//   Go deeper if: one line
// The verified quote appears in the archive only; in the email it adds noise.

import type { Verdict } from "../phases/judge.js";
import type { Summary } from "../phases/summarise.js";

export interface IssueItem {
  url: string;
  summary: Summary;
  verdict: Verdict;
  publishedDate: string | null;
}

export interface IssueInput {
  title: string; // e.g. "harness-digest · 2026-W43"
  intro: string;
  items: IssueItem[];
  health: string; // one line: runs, failures, tokens
  /** Items the judge or verifier rejected, shown only in smoke-test issues. */
  rejected?: { url: string; reason: string }[];
}

const THEME_LABELS: Record<Summary["theme"], string> = {
  "harness-design": "harness design",
  verification: "verification",
  "lighter-review": "lighter review",
  "non-engineers": "non-engineers",
  "real-setups": "real setups",
};

function shortDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** "blog · 14 min · lighter review · 9/10 · 15 Oct" */
export function metaLine(item: IssueItem): string {
  return [
    item.summary.contentType,
    `${item.summary.minutes} min`,
    THEME_LABELS[item.verdict.theme],
    `${item.verdict.score}/10`,
    item.publishedDate ? shortDate(item.publishedDate) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function bullets(item: IssueItem): string[] {
  return item.summary.howItWorks.map((b) => b.trim()).filter(Boolean);
}

// A contents list only helps when there's more than one thing to choose from.
const showContents = (issue: IssueInput) => issue.items.length >= 2;

export function renderMarkdown(issue: IssueInput): string {
  const contents = showContents(issue)
    ? ["## This week", "", ...issue.items.map((item, i) => `${i + 1}. **${item.summary.title}**: ${item.summary.idea}`), ""]
    : [];
  const cards = issue.items.map((item, i) =>
    [
      `### ${i + 1}. [${item.summary.title}](${item.url})`,
      `*${metaLine(item)}*`,
      "",
      item.summary.idea,
      "",
      "**How it works**",
      ...bullets(item).map((b) => `- ${b}`),
      "",
      `**Steal this:** ${item.summary.stealThis}`,
      "",
      `**Go deeper if:** ${item.summary.goDeeperIf}`,
      ...(item.summary.quote.trim() ? ["", `> "${item.summary.quote}"`] : []),
    ].join("\n"),
  );
  const rejected = issue.rejected?.length ? ["## Judged out", "", ...issue.rejected.map((r) => `- ${r.url}: ${r.reason}`), ""] : [];
  return [
    `# ${issue.title}`,
    "",
    issue.intro,
    "",
    ...contents,
    ...cards.flatMap((c) => [c, "", "---", ""]),
    ...rejected,
    `*${issue.health}*`,
    "",
  ].join("\n");
}

/** Plain text for the email's text part: what notifications, previews and text-only clients show. */
export function renderText(issue: IssueInput): string {
  const contents = showContents(issue)
    ? ["THIS WEEK", "", ...issue.items.map((item, i) => `${i + 1}. ${item.summary.title}\n   ${item.summary.idea}`), ""]
    : [];
  const cards = issue.items.map((item, i) =>
    [
      `${i + 1}. ${item.summary.title}`,
      `   ${metaLine(item)}`,
      "",
      `   ${item.summary.idea}`,
      "",
      "   How it works",
      ...bullets(item).map((b) => `   • ${b}`),
      "",
      `   Steal this: ${item.summary.stealThis}`,
      "",
      `   Go deeper if: ${item.summary.goDeeperIf}`,
      "",
      `   ${item.url}`,
    ].join("\n"),
  );
  const rejected = issue.rejected?.length ? ["JUDGED OUT", "", ...issue.rejected.map((r) => `- ${r.url}\n  ${r.reason}`), ""] : [];
  return [issue.title, "", issue.intro, "", ...contents, ...cards.flatMap((c) => [c, ""]), ...rejected, issue.health, ""].join("\n");
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderHtml(issue: IssueInput): string {
  const muted = "color:#6b7280";
  const contents = showContents(issue)
    ? `<div style="margin:0 0 32px;padding:16px 18px;background:#f9fafb;border-radius:8px">
        <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;${muted};margin:0 0 10px">This week</div>
        <ol style="margin:0;padding-left:20px">${issue.items
          .map((item) => `<li style="margin:0 0 8px"><strong>${escapeHtml(item.summary.title)}</strong><br><span style="${muted}">${escapeHtml(item.summary.idea)}</span></li>`)
          .join("")}</ol>
      </div>`
    : "";

  const card = (item: IssueItem, i: number) => `
    <div style="margin:0 0 32px;padding:0 0 28px;border-bottom:1px solid #e5e7eb">
      <h3 style="margin:0 0 4px;font-size:17px">${i + 1}. <a href="${escapeHtml(item.url)}" style="color:#1a56db;text-decoration:none">${escapeHtml(item.summary.title)}</a></h3>
      <div style="${muted};font-size:13px;margin:0 0 12px">${escapeHtml(metaLine(item))}</div>
      <p style="margin:0 0 12px;font-size:16px">${escapeHtml(item.summary.idea)}</p>
      <div style="font-weight:600;margin:0 0 4px">How it works</div>
      <ul style="margin:0 0 12px;padding-left:20px">${bullets(item)
        .map((b) => `<li style="margin:0 0 4px">${escapeHtml(b)}</li>`)
        .join("")}</ul>
      <p style="margin:0 0 8px"><strong>Steal this:</strong> ${escapeHtml(item.summary.stealThis)}</p>
      <p style="margin:0;${muted}"><strong>Go deeper if:</strong> ${escapeHtml(item.summary.goDeeperIf)}</p>
    </div>`;

  const rejected = issue.rejected?.length
    ? `<h2 style="font-size:15px;margin:8px 0 8px">Judged out</h2><ul style="padding-left:18px;color:#4b5563;font-size:14px">${issue.rejected
        .map((r) => `<li style="margin:0 0 6px"><a href="${escapeHtml(r.url)}">${escapeHtml(r.url)}</a>: ${escapeHtml(r.reason)}</li>`)
        .join("")}</ul>`
    : "";

  return `<!doctype html><html><body style="margin:0;padding:24px 16px;background:#ffffff">
  <div style="max-width:600px;margin:0 auto;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#111827">
    <h1 style="font-size:20px;margin:0 0 8px">${escapeHtml(issue.title)}</h1>
    <p style="margin:0 0 24px;color:#374151">${escapeHtml(issue.intro)}</p>
    ${contents}
    ${issue.items.map(card).join("\n")}
    ${rejected}
    <p style="margin:24px 0 0;color:#9ca3af;font-size:12px">${escapeHtml(issue.health)} · <a href="https://github.com/shan8851/harness-digest" style="color:#9ca3af">harness-digest</a></p>
  </div></body></html>`;
}
