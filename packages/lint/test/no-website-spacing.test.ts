import rule from "../src/rules/no-website-spacing.js";
import { asRule, tester, undetectedTester } from "./helpers.js";

tester().run("no-website-spacing", asRule(rule), {
  valid: [
    `const a = <box padding={1} />`,
    `const a = <box paddingX={1} gap={1} />`,
    `const a = <box padding={0} margin={0} gap={0} />`,
    // Theme-driven density is the point; only literals are budgeted.
    `const a = <box paddingX={tokens.density.paddingX} />`,
    `const a = <box border padding={1}><text>Logs</text></box>`,
    {
      code: `const a = <box padding={2} />`,
      options: [{ maxPadding: 2 }],
    },
  ],
  invalid: [
    {
      code: `const a = <box padding={4} />`,
      errors: [
        {
          message:
            /spends 4 rows and columns of empty cells inside the box.*whole terminal cells, not pixels/s,
        },
      ],
    },
    {
      code: `const a = <box marginTop={3} />`,
      errors: [{ message: /around the box/ }],
    },
    {
      code: `const a = <box gap={2} flexDirection="row" />`,
      errors: [{ message: /between every pair of children/ }],
    },
    {
      code: `const card = { padding: 4 }
             const a = <box style={card} />`,
      errors: 1,
    },
    {
      code: `const a = <box padding={6} />`,
      options: [{ message: "Use the density tokens from components/ui/theme.ts." }],
      errors: [{ message: "Use the density tokens from components/ui/theme.ts." }],
    },
  ],
});

undetectedTester().run("no-website-spacing (not an OpenTUI file)", asRule(rule), {
  valid: [`export const Page = () => <div style={{ padding: 24, gap: 16 }} />`],
  invalid: [],
});
