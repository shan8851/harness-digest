// The issues archive: one markdown file per month, e.g. issues/2026-12.md.
// The earlier weekly issues (issues/2026-W43.md and so on) stay as they are.

import { access } from "node:fs/promises";
import { join } from "node:path";

export const issueFile = (dir: string, period: string) => join(dir, `${period}.md`);

/** True if this month's issue is already in the archive, i.e. it has already been sent. */
export async function issueExists(dir: string, period: string): Promise<boolean> {
  try {
    await access(issueFile(dir, period));
    return true;
  } catch {
    return false;
  }
}
