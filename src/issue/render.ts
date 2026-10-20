// Turns verified items into an issue: markdown for the repo archive, and HTML
// plus plain text for the email. The layout lives here in code; the models
// only ever supply the words inside each card.

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

function meta(item: IssueItem): string {
  return `${item.summary.contentType} · ${item.summary.minutes} min · ${THEME_LABELS[item.verdict.theme]}`;
}

function footerLine(item: IssueItem): string {
  return [item.publishedDate ? `published ${item.publishedDate}` : null, `score ${item.verdict.score}/10`].filter(Boolean).join(" · ");
}

export function renderMarkdown(issue: IssueInput): string {
  const cards = issue.items.map((item) =>
    [
      `### [${item.summary.title}](${item.url})`,
      `*${meta(item)}*`,
      "",
      item.summary.technique,
      "",
      `**Steal this:** ${item.summary.stealThis}`,
      "",
      `> "${item.summary.quote}"`,
      "",
      footerLine(item),
    ].join("\n"),
  );
  const rejected = issue.rejected?.length
    ? ["", "## Judged out", "", ...issue.rejected.map((r) => `- ${r.url}: ${r.reason}`)]
    : [];
  return [`# ${issue.title}`, "", issue.intro, "", ...cards.flatMap((c) => [c, "", "---", ""]), ...rejected, "", `*${issue.health}*`, ""].join("\n");
}

/** Plain text for the email's text part: what notifications, previews and text-only clients show. */
export function renderText(issue: IssueInput): string {
  const cards = issue.items.map((item, i) =>
    [
      `${i + 1}. ${item.summary.title}`,
      `   ${meta(item)}`,
      "",
      `   ${item.summary.technique}`,
      "",
      `   Steal this: ${item.summary.stealThis}`,
      "",
      `   "${item.summary.quote}"`,
      "",
      `   ${item.url}`,
      `   ${footerLine(item)}`,
    ].join("\n"),
  );
  const rejected = issue.rejected?.length ? ["Judged out", "", ...issue.rejected.map((r) => `- ${r.url}\n  ${r.reason}`), ""] : [];
  return [issue.title, "", issue.intro, "", ...cards.flatMap((c) => [c, ""]), ...rejected, issue.health, ""].join("\n");
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderHtml(issue: IssueInput): string {
  const card = (item: IssueItem) => `
    <div style="margin:0 0 28px">
      <h3 style="margin:0 0 4px;font-size:17px"><a href="${escapeHtml(item.url)}" style="color:#1a56db;text-decoration:none">${escapeHtml(item.summary.title)}</a></h3>
      <div style="color:#6b7280;font-size:13px;margin:0 0 10px">${escapeHtml(meta(item))}</div>
      <p style="margin:0 0 10px">${escapeHtml(item.summary.technique)}</p>
      <p style="margin:0 0 10px"><strong>Steal this:</strong> ${escapeHtml(item.summary.stealThis)}</p>
      <blockquote style="margin:0 0 10px;padding-left:12px;border-left:3px solid #d1d5db;color:#4b5563">&ldquo;${escapeHtml(item.summary.quote)}&rdquo;</blockquote>
      <div style="color:#9ca3af;font-size:12px">${escapeHtml(footerLine(item))}</div>
    </div>`;
  const rejected = issue.rejected?.length
    ? `<h2 style="font-size:15px;margin:32px 0 8px">Judged out</h2><ul style="padding-left:18px;color:#4b5563;font-size:14px">${issue.rejected
        .map((r) => `<li style="margin:0 0 6px"><a href="${escapeHtml(r.url)}">${escapeHtml(r.url)}</a>: ${escapeHtml(r.reason)}</li>`)
        .join("")}</ul>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:24px 16px;background:#ffffff">
  <div style="max-width:600px;margin:0 auto;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#111827">
    <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(issue.title)}</h1>
    <p style="margin:0 0 28px;color:#374151">${escapeHtml(issue.intro)}</p>
    ${issue.items.map(card).join("\n")}
    ${rejected}
    <p style="margin:32px 0 0;color:#9ca3af;font-size:12px">${escapeHtml(issue.health)} · <a href="https://github.com/shan8851/harness-digest" style="color:#9ca3af">harness-digest</a></p>
  </div></body></html>`;
}
