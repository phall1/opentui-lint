import rule from "../src/rules/valid-colors.js"
import { asRule, tester, undetectedTester } from "./helpers.js"

tester().run("valid-colors", asRule(rule), {
  valid: [
    `const a = <box backgroundColor="#101418" />`,
    `const a = <box backgroundColor="#fff" />`,
    `const a = <box backgroundColor="#22c55e80" />`,
    `const a = <text fg="brightBlack">x</text>`,
    `const a = <box borderColor="gray" />`,
    `const a = <box backgroundColor="transparent" />`,
    // Case-insensitive, like parseColor.
    `const a = <box backgroundColor="BLUE" />`,
    `const a = <box backgroundColor={active ? "lime" : "transparent"} />`,
    // Computed values are the RGBA path and out of scope for a static check.
    `const a = <box backgroundColor={tokens.colors.surface} />`,
    `const a = <box backgroundColor={parseColor(input)} />`,
    // Not a color prop.
    `const a = <box title="red" />`,
    `const a = <box style={{ backgroundColor: "#101418" }} />`,
  ],
  invalid: [
    {
      code: `const a = <box backgroundColor="slate" />`,
      errors: [{ message: /will render magenta.*not one of OpenTUI's color names/s }],
    },
    {
      code: `const a = <text fg="indigo">x</text>`,
      errors: [{ message: /will render magenta/ }],
    },
    {
      code: `const a = <box backgroundColor="rgb(34, 197, 94)" />`,
      errors: [{ message: /does not support CSS color functions.*`rgb\(…\)`/s }],
    },
    {
      code: `const a = <box borderColor="var(--accent)" />`,
      errors: [{ message: /CSS color functions/ }],
    },
    {
      code: `const a = <text fg="#GGGGGG">x</text>`,
      errors: [{ message: /not a valid hex color/ }],
    },
    {
      code: `const a = <box backgroundColor="gray1" />`,
      errors: [{ message: /Did you mean "gray"\?/ }],
    },
    {
      // Excess-property checking stops at a hoisted object, so tsc is blind here.
      code: `const panel = { backgroundColor: "slate" }
             const a = <box style={panel} />`,
      errors: [{ message: /will render magenta/ }],
    },
    {
      code: `const a = <box style={{ borderColor: "pink" }} />`,
      errors: 1,
    },
    {
      // A conditional style is the normal way to write selection state, and
      // both branches have to be checked.
      code: `const a = <box backgroundColor={active ? "indigo" : "transparent"} />`,
      errors: [{ message: /"indigo" is not one of OpenTUI's color names/ }],
    },
    {
      code: `const a = <text fg={ok ? "lime" : "crimson"}>x</text>`,
      errors: [{ message: /"crimson"/ }],
    },
  ],
})

undetectedTester().run("valid-colors (not an OpenTUI file)", asRule(rule), {
  valid: [`export const Page = () => <div style={{ backgroundColor: "slate" }} />`],
  invalid: [],
})
