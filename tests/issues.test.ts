import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { issueExists, issueFile } from "../src/lib/issues.js";

describe("issueExists", () => {
  it("is true only once that month's issue is in the archive, so a month is never sent twice", async () => {
    const dir = await mkdtemp(join(tmpdir(), "issues-"));
    try {
      expect(await issueExists(dir, "2026-12")).toBe(false);
      await writeFile(issueFile(dir, "2026-12"), "# harness-digest · December 2026\n");
      expect(await issueExists(dir, "2026-12")).toBe(true);
      expect(await issueExists(dir, "2027-01")).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
