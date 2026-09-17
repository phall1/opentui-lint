import { describe, expect, test } from "bun:test";
import { CATALOG_VERSION } from "opentui-lint";
import { buildTargets } from "../src/targets.js";
import { lintTarget } from "../src/lint-target.js";
import { findingKey, loadBaseline } from "../src/baseline.js";
import { OPENTUI } from "../src/pins.js";

/**
 * The whole point of this package: opentui-lint must report *exactly* the
 * baseline on this pinned corpus — no more, no less.
 *
 * More means a rule started flagging real, working, expert-written OpenTUI
 * code, which is the false-positive regression this suite exists to catch —
 * see AGENTS.md's "never report something you cannot prove". Fewer means the
 * baseline is stale (a rule got fixed, or the corpus moved) and needs
 * re-triaging with `bun run report`, not silently left to drift from reality.
 */

test("OPENTUI_REF matches the catalog opentui-lint's rules were generated from", () => {
  // If these disagree, the corpus is being linted against a different OpenTUI
  // than the one the rules' facts (element catalogue, color names, prop
  // lists) were read from — any comparison to "real" behavior stops meaning
  // anything until the pins are realigned.
  expect(OPENTUI.ref).toBe(`v${CATALOG_VERSION}`);
});

const targets = await buildTargets();
const baseline = loadBaseline();

describe("baseline matches live findings, exactly", () => {
  for (const target of targets) {
    test(target.id, async () => {
      const { findings, toolingErrors } = await lintTarget(target);

      expect(
        toolingErrors,
        `opentui-lint should never fail to parse real corpus source:\n${toolingErrors.join("\n")}`,
      ).toEqual([]);

      const liveKeys = new Set(findings.map((f) => findingKey(target.id, f)));
      const baselineKeysForTarget = [...baseline.values()].filter(
        (entry) => entry.target === target.id,
      );

      const newFindings = findings.filter((f) => !baseline.has(findingKey(target.id, f)));
      const staleEntries = baselineKeysForTarget.filter(
        (entry) => !liveKeys.has(findingKey(target.id, entry)),
      );

      const describeNew = newFindings
        .map(
          (f) =>
            `  [NEW, UNCLASSIFIED] ${f.ruleId} ${f.file}:${f.line}:${f.column}\n      ${f.message}`,
        )
        .join("\n");
      const describeStale = staleEntries
        .map(
          (e) =>
            `  [STALE BASELINE] ${e.ruleId} ${e.file}:${e.line}:${e.column} (${e.classification})`,
        )
        .join("\n");

      expect(
        newFindings.length,
        `${newFindings.length} finding(s) on ${target.id} have no baseline entry. Either a rule regressed ` +
          `(false positive — report it, do not silence it here) or this is a genuine new true positive ` +
          `(triage it into baseline.json with \`bun run report\`):\n${describeNew}`,
      ).toBe(0);

      expect(
        staleEntries.length,
        `${staleEntries.length} baseline entry/entries on ${target.id} no longer reproduce. The corpus or a ` +
          `rule changed — re-run \`bun run report\` and update baseline.json:\n${describeStale}`,
      ).toBe(0);
    });
  }
});

test("every baseline entry names a target that still exists", () => {
  const targetIds = new Set(targets.map((t) => t.id));
  for (const entry of baseline.values()) {
    expect(
      targetIds.has(entry.target),
      `baseline.json references unknown target "${entry.target}"`,
    ).toBe(true);
  }
});

test("summary: findings by classification", async () => {
  const counts: Record<string, number> = { "true-positive": 0, "false-positive": 0, acceptable: 0 };
  for (const entry of baseline.values())
    counts[entry.classification] = (counts[entry.classification] ?? 0) + 1;
  console.log(
    `\nCorpus baseline: ${baseline.size} classified finding(s) — ${JSON.stringify(counts)}`,
  );
  // Not an assertion on the numbers themselves (those are read, not asserted,
  // elsewhere) — just makes the composition visible in test output without
  // needing to open baseline.json.
  expect(counts["true-positive"]! + counts["false-positive"]! + counts["acceptable"]!).toBe(
    baseline.size,
  );
});
