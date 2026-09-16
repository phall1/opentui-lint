import { describe, it } from "bun:test"
import { RuleTester } from "eslint"
import tsParser from "@typescript-eslint/parser"
import type { RuleModule } from "../src/project/types.js"

/**
 * Hand RuleTester the runner's hooks explicitly.
 *
 * It otherwise looks for `describe`/`it` on `globalThis`, and Bun exposes them
 * as imports from `bun:test` rather than as globals. Without this it silently
 * falls back to running every case inline — which still *fails* correctly, but
 * reports "Ran 0 tests", so a green suite would mean nothing.
 */
RuleTester.describe = describe as never
RuleTester.it = it as never

/**
 * A tester wired the way an OpenTUI project is: TypeScript parser, JSX on, and
 * the framework stated explicitly so the detection logic is exercised
 * separately rather than accidentally.
 */
export function tester(framework: "react" | "solid" = "react"): RuleTester {
  return new RuleTester({
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { opentui: { framework } },
  })
}

/** A tester with no framework hint at all, to prove the rules stand down. */
export function undetectedTester(): RuleTester {
  return new RuleTester({
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  })
}

export function asRule(rule: RuleModule): any {
  return rule as any
}
