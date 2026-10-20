// Loads config/sources.json: the seeds the sweep checks, and the "sources"
// (publishers) they represent, which explore must look beyond.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Seed } from "../phases/seedSweep.js";
import { sourceOf } from "./urls.js";

const SOURCES_PATH = fileURLToPath(new URL("../../config/sources.json", import.meta.url));

export async function loadSeeds(): Promise<{ seeds: Seed[]; seedSources: Set<string> }> {
  const { seeds } = JSON.parse(await readFile(SOURCES_PATH, "utf8")) as { seeds: Seed[] };
  const seedSources = new Set(seeds.map((s) => sourceOf(s.url)).filter((s): s is string => Boolean(s)));
  return { seeds, seedSources };
}
