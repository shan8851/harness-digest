// Loads config/themes.md, the rubric and writing rules. It's read at runtime
// so editing the file changes behaviour without touching code.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const THEMES_PATH = fileURLToPath(new URL("../../config/themes.md", import.meta.url));

let cached: string | undefined;

export async function loadRubric(): Promise<string> {
  cached ??= await readFile(THEMES_PATH, "utf8");
  return cached;
}
