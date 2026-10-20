// The issues archive: one markdown file per ISO week, e.g. issues/2026-W43.md.

import { access } from "node:fs/promises";
import { join } from "node:path";

export const issueFile = (dir: string, week: string) => join(dir, `${week}.md`);

/** True if this week's issue is already in the archive, i.e. it has already been sent. */
export async function issueExists(dir: string, week: string): Promise<boolean> {
  try {
    await access(issueFile(dir, week));
    return true;
  } catch {
    return false;
  }
}
