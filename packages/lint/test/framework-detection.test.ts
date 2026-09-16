import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import rule from "../src/rules/no-unknown-elements.js"
import { asRule, undetectedTester } from "./helpers.js"

const FIXTURES = join(import.meta.dir, "fixtures")
const file = (app: string) => join(FIXTURES, app, "src", "App.tsx")

/**
 * Detection is the plugin's safety boundary: a repo that ships an OpenTUI CLI
 * next to a web dashboard must get terminal rules on one and silence on the
 * other, with no configuration.
 */
undetectedTester().run("framework detection", asRule(rule), {
  valid: [
    // No OpenTUI evidence anywhere.
    { code: `export const Page = () => <div />`, filename: file("web-app") },
    // A tsconfig that points at React proper, not @opentui/react.
    { code: `export const Page = () => <section><p>hi</p></section>`, filename: file("web-app") },
  ],
  invalid: [
    {
      // The per-file pragma.
      code: `/** @jsxImportSource @opentui/react */
             export const App = () => <div />`,
      output: `/** @jsxImportSource @opentui/react */
             export const App = () => <box />`,
      errors: [{ message: /<div> is an HTML element/ }],
    },
    {
      // An import of the binding.
      code: `import { useKeyboard } from "@opentui/react"
             export const App = () => <div />`,
      output: `import { useKeyboard } from "@opentui/react"
             export const App = () => <box />`,
      errors: [{ message: /<div> is an HTML element/ }],
    },
    {
      // A subpath import still identifies the runtime.
      code: `import { testRender } from "@opentui/react/test-utils"
             export const App = () => <div />`,
      output: `import { testRender } from "@opentui/react/test-utils"
             export const App = () => <box />`,
      errors: 1,
    },
    {
      // Inherited from the nearest tsconfig.
      code: `export const App = () => <div />`,
      output: `export const App = () => <box />`,
      filename: file("react-app"),
      errors: [{ message: /<div> is an HTML element/ }],
    },
    {
      // Regression: a workspace package with a package.json but no tsconfig of
      // its own inherits the repo root's. Stopping the walk at the package
      // boundary silenced every rule across a whole package — a clean run that
      // means nothing.
      code: `export const App = () => <ascii-font text="hi" />`,
      output: `export const App = () => <ascii_font text="hi" />`,
      filename: join(FIXTURES, "monorepo", "packages", "tui", "src", "Row.tsx"),
      errors: [{ message: /is the @opentui\/react spelling/ }],
    },
    {
      // Resolved through `extends`, as monorepos usually wire it.
      code: `export const App = () => <ascii-font text="hi" />`,
      output: `export const App = () => <ascii_font text="hi" />`,
      filename: file("solid-app"),
      errors: [{ message: /is the @opentui\/react spelling/ }],
    },
  ],
})

describe("settings", () => {
  test("an explicit framework overrides every other signal", async () => {
    const { Linter } = await import("eslint")
    const tsParser = (await import("@typescript-eslint/parser")).default
    const linter = new Linter()
    const messages = linter.verify(
      `export const App = () => <ascii-font text="hi" />`,
      {
        files: ["**/*.tsx"],
        languageOptions: { parser: tsParser as any, parserOptions: { ecmaFeatures: { jsx: true } } },
        plugins: { opentui: { rules: { "no-unknown-elements": asRule(rule) } } },
        settings: { opentui: { framework: "solid" } },
        rules: { "opentui/no-unknown-elements": "error" },
      } as any,
      file("web-app"),
    )
    expect(messages).toHaveLength(1)
    expect(messages[0]!.message).toMatch(/@opentui\/react spelling/)
  })
})
