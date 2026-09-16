/**
 * The checked-in baseline: every finding this package has ever seen on the
 * pinned corpus, with a human classification and a one-line reason. See
 * `README.md` for what each classification means and how to update this file.
 *
 * The key is target + rule + file + position, not a hash of the message text:
 * a rule's wording is allowed to improve without silently orphaning a
 * classified finding, but a *new* location or rule always needs a fresh
 * triage decision.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Finding } from "./lint-target.js"

export type Classification = "true-positive" | "false-positive" | "acceptable"

export interface BaselineEntry {
  target: string
  ruleId: string
  file: string
  line: number
  column: number
  classification: Classification
  /** One line: why this finding is classified this way. */
  reason: string
}

const BASELINE_FILE = join(import.meta.dir, "..", "baseline.json")

export function findingKey(targetId: string, finding: Pick<Finding, "ruleId" | "file" | "line" | "column">): string {
  return `${targetId}::${finding.ruleId}::${finding.file}::${finding.line}::${finding.column}`
}

export function loadBaseline(): Map<string, BaselineEntry> {
  const entries = JSON.parse(readFileSync(BASELINE_FILE, "utf8")) as BaselineEntry[]
  const map = new Map<string, BaselineEntry>()
  for (const entry of entries) {
    map.set(findingKey(entry.target, entry), entry)
  }
  return map
}
