#!/usr/bin/env bun
/**
 * `bun run fetch` — clones/materializes the pinned corpus and prints how many
 * files landed in each target, without linting anything. Run this once ahead
 * of `bun test` to warm the cache (CI does this as its own step so a cache
 * hit/miss is visible separately from the lint run itself).
 */

import { buildTargets } from "./targets.js";

const targets = await buildTargets();

console.log("Corpus fetched. Files per target:\n");
let total = 0;
for (const target of targets) {
  console.log(
    `  ${target.id.padEnd(28)} ${String(target.files.length).padStart(4)} files  — ${target.description}`,
  );
  total += target.files.length;
}
console.log(`\n  ${"total".padEnd(28)} ${String(total).padStart(4)} files`);
