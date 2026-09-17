#!/usr/bin/env bun
/**
 * `bun run report` — lints every corpus target and prints every finding, with
 * its baseline classification when one exists. This is the tool for
 * regenerating `baseline.json` after a deliberate corpus or rule change: run
 * it, triage anything new, hand-edit the JSON (there is no auto-writer,
 * because every entry needs a human-considered reason, not a rubber stamp).
 */

import { buildTargets } from "./targets.js";
import { lintTarget } from "./lint-target.js";
import { findingKey, loadBaseline } from "./baseline.js";

const baseline = loadBaseline();
const targets = await buildTargets();

let totalRecommended = 0;
let totalStrictOnly = 0;
const unclassified: string[] = [];

for (const target of targets) {
  const { findings, toolingErrors } = await lintTarget(target);
  if (toolingErrors.length > 0) {
    console.log(`\n${target.id}: ${toolingErrors.length} TOOLING ERROR(S) (not a rule finding)`);
    for (const error of toolingErrors) console.log(`  ${error}`);
  }
  if (findings.length === 0) continue;

  console.log(`\n${target.id} — ${findings.length} finding(s)`);
  for (const finding of findings) {
    const key = findingKey(target.id, finding);
    const entry = baseline.get(key);
    const preset = finding.inRecommended ? "recommended" : "strict-only";
    if (finding.inRecommended) totalRecommended += 1;
    else totalStrictOnly += 1;

    const tag = entry ? `[${entry.classification}]` : "[UNCLASSIFIED]";
    console.log(
      `  ${tag} ${preset} ${finding.ruleId} ${finding.file}:${finding.line}:${finding.column}`,
    );
    console.log(`      ${finding.message}`);
    if (entry) console.log(`      reason: ${entry.reason}`);
    else unclassified.push(key);
  }
}

console.log(`\n--- totals ---`);
console.log(`recommended:  ${totalRecommended}`);
console.log(`strict-only:  ${totalStrictOnly}`);
console.log(`total:        ${totalRecommended + totalStrictOnly}`);

if (unclassified.length > 0) {
  console.log(`\n${unclassified.length} finding(s) have no baseline entry yet:`);
  for (const key of unclassified) console.log(`  ${key}`);
}
