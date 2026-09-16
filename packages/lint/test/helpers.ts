import { RuleTester } from "eslint"
import tsParser from "@typescript-eslint/parser"
import type { RuleModule } from "../src/project/types.js"

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
