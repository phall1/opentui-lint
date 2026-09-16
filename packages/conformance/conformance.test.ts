import { describe, expect, test } from "bun:test"
import { RGBA, parseColor } from "@opentui/core"
import { testRender } from "@opentui/react/test-utils"
import { Linter } from "eslint"
import tsParser from "@typescript-eslint/parser"
import { plugin, recommended } from "opentui-lint"
import { cases } from "./cases.js"

/**
 * The linter's credibility rests on its claims being true of the OpenTUI people
 * actually install, so every case is checked twice: once through the rules, and
 * once through a real renderer.
 *
 * A rule that stops matching reality — because OpenTUI started validating
 * colors, say, or gave `<div>` a meaning — fails here rather than quietly
 * misleading someone.
 */

const MAGENTA = RGBA.fromValues(1, 0, 1, 1)

const linter = new Linter()

function lint(source: string): Linter.LintMessage[] {
  return linter.verify(
    source,
    {
      files: ["**/*.tsx"],
      languageOptions: {
        parser: tsParser as never,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      plugins: { opentui: plugin as never },
      settings: { opentui: { framework: "react" } },
      rules: recommended,
    } as never,
    "App.tsx",
  )
}

/** Renders once and returns everything on screen, error boundary included. */
async function renderToText(element: Parameters<typeof testRender>[0]): Promise<{
  frame: string
  find: (id: string) => any
}> {
  const setup = await testRender(element, { width: 80, height: 24 })
  await setup.renderOnce()
  const frame = setup.captureCharFrame()
  const find = (id: string) => setup.renderer.root.findDescendantById(id)
  return { frame, find }
}

describe("every diagnostic describes something OpenTUI really does", () => {
  for (const testCase of cases) {
    describe(`${testCase.rule}: ${testCase.name}`, () => {
      test("the rule reports it", () => {
        const messages = lint(testCase.source)
        const reported = messages.filter((m) => m.ruleId === `opentui/${testCase.rule}`)
        expect(
          reported.length,
          `expected opentui/${testCase.rule} to report on:\n${testCase.source}\n` +
            `got: ${JSON.stringify(messages.map((m) => m.ruleId))}`,
        ).toBeGreaterThan(0)
      })

      test("OpenTUI behaves as the message claims", async () => {
        const { outcome } = testCase

        if (outcome.kind === "magenta") {
          // parseColor is the whole mechanism: no throw, no type error, just
          // the wrong color.
          expect(parseColor(outcome.value).equals(MAGENTA)).toBe(true)
          return
        }

        const { frame, find } = await renderToText(testCase.element)

        if (outcome.kind === "error-boundary") {
          // The binding catches the reconciler's throw and paints the stack
          // where the app should be — this is what the developer sees.
          expect(frame).toContain(outcome.contains)
          return
        }

        const instance = find(testCase.element ? (testCase.element as any).props.id : "")
        expect(instance, "the renderable should have mounted").toBeTruthy()
        // The prop survives as a dead field: assigned, never read, no error.
        expect(outcome.prop in instance || instance[outcome.prop] !== undefined).toBe(true)
      })
    })
  }
})

describe("the catalog matches the installed OpenTUI", () => {
  test("recognized color names round-trip through parseColor", async () => {
    const { NAMED_COLORS } = await import("opentui-lint")
    for (const name of NAMED_COLORS) {
      if (name === "magenta" || name === "fuchsia") continue // genuinely #FF00FF
      expect(parseColor(name).equals(MAGENTA), `${name} should be a real color`).toBe(false)
    }
  })

  test("names the catalog rejects really do fall back to magenta", () => {
    for (const name of ["slate", "indigo", "pink", "lightgray", "rebeccapurple"]) {
      expect(parseColor(name).equals(MAGENTA), `${name} should fall back`).toBe(true)
    }
  })
})
