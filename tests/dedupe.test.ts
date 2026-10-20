import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSeen, pruneSeen, saveSeen, splitUnseen, titleSimilarity, type SeenEntry } from "../src/lib/dedupe.js";

const entry = (overrides: Partial<SeenEntry>): SeenEntry => ({
  key: "example.com/a",
  url: "https://example.com/a",
  title: "A post",
  firstSeen: "2026-10-01T00:00:00.000Z",
  status: "rejected",
  ...overrides,
});

describe("pruneSeen", () => {
  const now = new Date("2026-10-20T00:00:00Z");

  it("drops passed and rejected entries older than the retention window", () => {
    const old = entry({ firstSeen: "2026-06-01T00:00:00.000Z" });
    const recent = entry({ key: "example.com/b", firstSeen: "2026-10-10T00:00:00.000Z" });
    expect(pruneSeen([old, recent], now, 90)).toEqual([recent]);
  });

  it("keeps featured entries forever, so they can never repeat", () => {
    const ancient = entry({ status: "featured", firstSeen: "2025-01-01T00:00:00.000Z" });
    expect(pruneSeen([ancient], now, 90)).toEqual([ancient]);
  });
});

describe("titleSimilarity", () => {
  it("ignores case, punctuation and filler words", () => {
    expect(titleSimilarity("How I Built My Agent Harness!", "how i built my agent harness")).toBe(1);
  });

  it("scores unrelated titles low", () => {
    expect(titleSimilarity("Evals for coding agents", "Marketing workflows with skills")).toBeLessThan(0.2);
  });
});

describe("splitUnseen", () => {
  const seen = [entry({ key: "example.com/known", title: "Verification loops for coding agents" })];

  it("drops candidates whose URL key was already seen", () => {
    const { fresh, duplicates } = splitUnseen([{ key: "example.com/known", title: "Different title" }], seen);
    expect(fresh).toHaveLength(0);
    expect(duplicates).toHaveLength(1);
  });

  it("drops the same story republished under a different URL", () => {
    const { fresh } = splitUnseen([{ key: "other.com/x", title: "Verification Loops for Coding Agents" }], seen);
    expect(fresh).toHaveLength(0);
  });

  it("removes duplicates within the same batch", () => {
    const batch = [
      { key: "a.com/1", title: "Spec-driven development in practice" },
      { key: "a.com/1", title: "Spec-driven development in practice" },
      { key: "b.com/2", title: "Something else entirely" },
    ];
    expect(splitUnseen(batch, []).fresh.map((c) => c.key)).toEqual(["a.com/1", "b.com/2"]);
  });
});

describe("loadSeen and saveSeen", () => {
  it("round-trips entries through a JSONL file, and treats a missing file as empty", async () => {
    const dir = await mkdtemp(join(tmpdir(), "seen-"));
    const path = join(dir, "seen.jsonl");
    try {
      expect(await loadSeen(path)).toEqual([]);
      const entries = [entry({}), entry({ key: "example.com/b", status: "featured" })];
      await saveSeen(path, entries);
      expect(await loadSeen(path)).toEqual(entries);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
