import { describe, expect, test } from "bun:test"
import { parseColor, RGBA } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { Linter } from "eslint"
import tsParser from "@typescript-eslint/parser"
import { plugin, recommended } from "opentui-lint"

/**
 * The Solid half of conformance.
 *
 * Solid is not React with different spelling. Its reconciler has no
 * text-context check, no ErrorBoundary, and its own error strings — so the
 * diagnostics for a Solid file quote different text and describe a different
 * outcome. Those differences are asserted here against a real render, because
 * a message that quotes an error the codebase does not contain is worse than
 * no message.
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
      settings: { opentui: { framework: "solid" } },
      rules: recommended,
    } as never,
    "App.tsx",
  )
}

/** Renders and returns the thrown message, or null when it rendered clean. */
async function renderError(component: () => any): Promise<string | null> {
  try {
    const setup = await testRender(component, { width: 60, height: 8 })
    await setup.renderOnce()
    setup.renderer.destroy()
    return null
  } catch (error) {
    return (error as Error).message
  }
}

interface SolidCase {
  name: string
  rule: string
  source: string
  component: () => any
  /** Substring the real Solid runtime error must contain. */
  throws: string
}

const cases: SolidCase[] = [
  {
    name: "an HTML element",
    rule: "no-unknown-elements",
    source: `const App = () => <div><text>hi</text></div>`,
    component: () => (
      <div>
        <text>hi</text>
      </div>
    ),
    throws: "[Reconciler] Unknown component type: div",
  },
  {
    name: "the React spelling of a compound element",
    rule: "no-unknown-elements",
    source: `const App = () => <ascii-font text="HI" />`,
    component: () => <ascii-font text="HI" />,
    throws: "[Reconciler] Unknown component type: ascii-font",
  },
  {
    name: "a string child outside <text>",
    rule: "text-must-be-wrapped",
    source: `const App = () => <box>Hello</box>`,
    component: () => <box>Hello</box>,
    throws: "must have a <text> as a parent",
  },
  {
    name: "an interpolated number outside <text>",
    rule: "text-must-be-wrapped",
    source: "const App = () => <box>{3}</box>",
    component: () => <box>{3}</box>,
    throws: "must have a <text> as a parent",
  },
  {
    name: "a text modifier outside <text>",
    rule: "no-orphan-text-nodes",
    source: `const App = () => <box><b>Total</b></box>`,
    component: () => (
      <box>
        <b>Total</b>
      </box>
    ),
    throws: "must have a <text> as a parent",
  },
]

describe("every Solid diagnostic describes something @opentui/solid really does", () => {
  for (const testCase of cases) {
    describe(`${testCase.rule}: ${testCase.name}`, () => {
      test("the rule reports it", () => {
        const messages = lint(testCase.source)
        const reported = messages.filter((m) => m.ruleId === `opentui/${testCase.rule}`)
        expect(
          reported.length,
          `expected opentui/${testCase.rule} on:\n${testCase.source}\n` +
            `got: ${JSON.stringify(messages.map((m) => m.ruleId))}`,
        ).toBeGreaterThan(0)
      })

      test("the message quotes the error Solid actually throws", async () => {
        const thrown = await renderError(testCase.component)
        expect(thrown, "Solid should have thrown").toBeTruthy()
        expect(thrown).toContain(testCase.throws)

        // The diagnostic has to quote the real thing, not React's wording.
        const message = lint(testCase.source).find((m) => m.ruleId === `opentui/${testCase.rule}`)!.message
        const quoted = testCase.throws.includes("Unknown component type")
          ? testCase.throws
          : "must have a <text> as a parent"
        expect(message).toContain(quoted)
        expect(message).not.toContain("ErrorBoundary")
      })
    })
  }
})

describe("Solid shares the value-level failures with React", () => {
  test("an unknown color name still falls back to magenta", () => {
    expect(parseColor("slate").equals(MAGENTA)).toBe(true)
  })

  test("a web prop is stored on the renderable and never read", async () => {
    const captured: { node?: any } = {}
    const setup = await testRender(
      () => <box ref={(node: any) => (captured.node = node)} {...({ className: "row" } as any)} />,
      { width: 20, height: 3 },
    )
    await setup.renderOnce()
    // Assigned onto the renderable, never read by anything.
    expect(captured.node.className).toBe("row")
    setup.renderer.destroy()
  })

  test("`on:` bindings are real, so the rule must leave them alone", () => {
    const messages = lint(`const App = () => <box on:click={() => {}} />`)
    expect(messages.filter((m) => m.ruleId === "opentui/no-web-props")).toHaveLength(0)
  })
})
