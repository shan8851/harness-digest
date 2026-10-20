import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { issueExists, issueFile } from "../src/lib/issues.js";

describe("issueExists", () => {
  it("is true only once that week's issue is in the archive, so a week is never sent twice", async () => {
    const dir = await mkdtemp(join(tmpdir(), "issues-"));
    try {
      expect(await issueExists(dir, "2026-W43")).toBe(false);
      await writeFile(issueFile(dir, "2026-W43"), "# harness-digest · 2026-W43\n");
      expect(await issueExists(dir, "2026-W43")).toBe(true);
      expect(await issueExists(dir, "2026-W44")).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
