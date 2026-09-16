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
      // rgb() has exactly one correct hex, so it is applied.
      code: `const a = <box backgroundColor="rgb(34, 197, 94)" />`,
      output: `const a = <box backgroundColor="#22c55e" />`,
      errors: [{ message: /does not support CSS color functions.*is exactly #22c55e/s }],
    },
    {
      code: `const a = <box backgroundColor="rgba(34, 197, 94, 0.5)" />`,
      output: `const a = <box backgroundColor="#22c55e80" />`,
      errors: 1,
    },
    {
      code: `const a = <box backgroundColor="hsl(142, 71%, 45%)" />`,
      output: `const a = <box backgroundColor="#21c45d" />`,
      errors: 1,
    },
    {
      // A real CSS color name has one exact value too.
      code: `const a = <text fg="indigo">x</text>`,
      output: `const a = <text fg="#4b0082">x</text>`,
      errors: [{ message: /CSS "indigo" is exactly #4b0082/ }],
    },
    {
      code: `const a = <box borderColor="rebeccapurple" />`,
      output: `const a = <box borderColor="#663399" />`,
      errors: 1,
    },
    {
      // Tailwind names are a guess about shade, so they are offered only.
      code: `const a = <box backgroundColor="slate" />`,
      output: null,
      errors: [
        {
          message: /Tailwind palette name, not a color. #64748b is its 500 shade/,
          suggestions: [
            { desc: `Replace with "#64748b" (slate-500)`, output: `const a = <box backgroundColor="#64748b" />` },
          ],
        },
      ],
    },
    {
      code: `const a = <box backgroundColor="emerald" />`,
      output: null,
      errors: [
        {
          message: /Tailwind palette name/,
          suggestions: [
            { desc: `Replace with "#10b981" (emerald-500)`, output: `const a = <box backgroundColor="#10b981" />` },
          ],
        },
      ],
    },
    {
      // Regression: textColor is the main color prop on <input>/<textarea>,
      // and the hand-written prop list used to miss it entirely.
      code: `const a = <input textColor="slate" />`,
      output: null,
      errors: [
        {
          message: /Tailwind palette name/,
          suggestions: [{ desc: `Replace with "#64748b" (slate-500)`, output: `const a = <input textColor="#64748b" />` }],
        },
      ],
    },
    {
      code: `const a = <textarea placeholderColor="rgb(1, 2, 3)" />`,
      output: `const a = <textarea placeholderColor="#010203" />`,
      errors: 1,
    },
    {
      code: `const a = <diff addedBg="emerald" />`,
      output: null,
      errors: [
        {
          message: /Tailwind palette name/,
          suggestions: [{ desc: `Replace with "#10b981" (emerald-500)`, output: `const a = <diff addedBg="#10b981" />` }],
        },
      ],
    },
    {
      code: `const a = <box borderColor="var(--accent)" />`,
      output: null,
      errors: [{ message: /CSS color functions/ }],
    },
    {
      code: `const a = <text fg="#GGGGGG">x</text>`,
      output: null,
      errors: [{ message: /not a valid hex color/ }],
    },
    {
      code: `const a = <box backgroundColor="gray1" />`,
      output: null,
      errors: [
        {
          message: /Did you mean "gray"\?/,
          suggestions: [{ desc: `Replace with "gray"`, output: `const a = <box backgroundColor="gray" />` }],
        },
      ],
    },
    {
      // Excess-property checking stops at a hoisted object, so tsc is blind here.
      code: `const panel = { backgroundColor: "indigo" }
             const a = <box style={panel} />`,
      output: `const panel = { backgroundColor: "#4b0082" }
             const a = <box style={panel} />`,
      errors: 1,
    },
    {
      code: `const a = <box style={{ borderColor: "pink" }} />`,
      output: `const a = <box style={{ borderColor: "#ffc0cb" }} />`,
      errors: 1,
    },
    {
      // A conditional style is the normal way to write selection state, and
      // both branches have to be checked.
      code: `const a = <box backgroundColor={active ? "indigo" : "transparent"} />`,
      output: `const a = <box backgroundColor={active ? "#4b0082" : "transparent"} />`,
      errors: [{ message: /CSS "indigo" is exactly #4b0082/ }],
    },
  ],
})

undetectedTester().run("valid-colors (not an OpenTUI file)", asRule(rule), {
  valid: [`export const Page = () => <div style={{ backgroundColor: "slate" }} />`],
  invalid: [],
})
