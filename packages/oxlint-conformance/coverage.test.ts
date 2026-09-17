import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { rules } from "opentui-lint";
import { RULE_COVERAGE } from "./src/rule-fixtures.js";
import { allRulesConfig, runOxlint, withOxlintConfig } from "./src/run-oxlint.js";

/**
 * The README's whole Oxlint claim reduces to: every rule this plugin exports
 * still reports, unmodified, when a real oxlint process loads
 * packages/lint/dist/index.js as a JS plugin. This file is that claim, run.
 *
 * Every fixture carries its own `@jsxImportSource` pragma, so one oxlint
 * invocation over the whole fixture tree resolves each file's framework
 * independently — exactly like a real mixed react/solid monorepo would.
 */

const FIXTURES_DIR = join(import.meta.dir, "fixtures");
const RULE_NAMES = Object.keys(rules);

test("every plugin rule has an oxlint conformance case", () => {
  // This is the test that is supposed to fail: add a rule to src/plugin.ts
  // and forget packages/oxlint-conformance, and this is what catches it.
  const covered = Object.keys(RULE_COVERAGE).toSorted();
  expect(covered, "RULE_COVERAGE in src/rule-fixtures.ts is missing rows for these rules").toEqual(
    RULE_NAMES.toSorted(),
  );
});

describe("every rule reports under real oxlint", () => {
  for (const name of RULE_NAMES) {
    const coverage = RULE_COVERAGE[name];
    if (!coverage) continue; // reported by the drift check above, not here

    test(`opentui-lint/${name} (react)`, async () => {
      const diagnostics = await withOxlintConfig(allRulesConfig(RULE_NAMES), (configPath) =>
        runOxlint(configPath, [join(FIXTURES_DIR, coverage.react.file)]),
      );
      const own = diagnostics.filter((d) => d.code === `opentui-lint(${name})`);
      expect(
        own.length,
        `expected opentui-lint/${name} to report; got ${JSON.stringify(diagnostics)}`,
      ).toBeGreaterThan(0);
      expect(own[0]!.message).toContain(coverage.react.expect);
    });

    if (coverage.frameworkSensitive) {
      test(`opentui-lint/${name} (solid)`, async () => {
        const solid = coverage.solid;
        expect(solid, `${name} is marked frameworkSensitive but has no solid fixture`).toBeTruthy();
        const diagnostics = await withOxlintConfig(allRulesConfig(RULE_NAMES), (configPath) =>
          runOxlint(configPath, [join(FIXTURES_DIR, solid!.file)]),
        );
        const own = diagnostics.filter((d) => d.code === `opentui-lint(${name})`);
        expect(
          own.length,
          `expected opentui-lint/${name} to report; got ${JSON.stringify(diagnostics)}`,
        ).toBeGreaterThan(0);
        expect(own[0]!.message).toContain(solid!.expect);
      });
    }
  }
});
