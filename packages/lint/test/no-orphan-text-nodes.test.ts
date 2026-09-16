import rule from "../src/rules/no-orphan-text-nodes.js"
import { asRule, tester, undetectedTester } from "./helpers.js"

tester().run("no-orphan-text-nodes", asRule(rule), {
  valid: [
    "const a = <text><b>Total</b></text>",
    "const a = <text>Hi <span fg=\"gray\">there</span></text>",
    "const a = <text><b><i>nested</i></b></text>",
    "const a = <box><text><u>x</u></text></box>",
    `const a = <text><a href="https://example.com">docs</a></text>`,
    "const a = <text>line<br />break</text>",
    // Not decidable past a component boundary, so the rule stands down.
    "const Label = () => <b>bold</b>",
  ],
  invalid: [
    {
      // Regression: the arrow must not suppress the report.
      code: "const App = () => <box><b>Total</b></box>",
      output: "const App = () => <box><text><b>Total</b></text></box>",
      errors: 1,
    },
    {
      code: "const a = <box><b>Total</b></box>",
      output: "const a = <box><text><b>Total</b></text></box>",
      errors: [{ message: /<b> is a text modifier.*directly inside <box>.*must be created inside of a text node/s }],
    },
    {
      code: "const a = <box><span>hi</span></box>",
      output: "const a = <box><text><span>hi</span></text></box>",
      errors: [{ message: /<span> is a text modifier/ }],
    },
    {
      code: `const a = <scrollbox><a href="x">link</a></scrollbox>`,
      output: `const a = <scrollbox><text><a href="x">link</a></text></scrollbox>`,
      errors: 1,
    },
    {
      // Adjacent modifiers are one run, so they end up in one <text> on one
      // line rather than stacked.
      code: "const a = <box><b>A</b><i>B</i></box>",
      output: "const a = <box><text><b>A</b><i>B</i></text></box>",
      errors: 2,
    },
  ],
})

undetectedTester().run("no-orphan-text-nodes (not an OpenTUI file)", asRule(rule), {
  valid: [`export const Page = () => <div><span>hi</span><b>x</b></div>`],
  invalid: [],
})

tester("solid").run("no-orphan-text-nodes (solid)", asRule(rule), {
  valid: ["const a = <text><b>Total</b></text>"],
  invalid: [
    {
      code: "const a = <box><b>Total</b></box>",
      output: "const a = <box><text><b>Total</b></text></box>",
      errors: [{ message: /Orphan text error.*must have a <text> as a parent/s }],
    },
  ],
})
