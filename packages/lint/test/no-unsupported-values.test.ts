import rule from "../src/rules/no-unsupported-values.js";
import { asRule, tester, undetectedTester } from "./helpers.js";

tester().run("no-unsupported-values", asRule(rule), {
  valid: [
    `const a = <box position="relative" />`,
    `const a = <box position="absolute" top={0} left={0} />`,
    `const a = <box minWidth={12} maxWidth="50%" />`,
    `const a = <box width={40} height={10} />`,
    // margin: "auto" really works — it centers. Only min/max reject "auto".
    `const a = <box marginLeft="auto" />`,
    `const a = <box width="auto" height="auto" />`,
    `const a = <box alignItems="center" />`,
    `const a = <box justifyContent="space-between" />`,
    `const a = <box minWidth={tokens.density.paddingX} />`,
  ],
  invalid: [
    {
      code: `const a = <box position="static" />`,
      errors: [
        {
          message:
            /accepted by the types and ignored by the runtime.*coerces it to "relative".*returns early/s,
        },
      ],
    },
    {
      code: `const a = <box minWidth="auto" />`,
      errors: [{ message: /isSizeType rejects "auto".*no constraint is applied at all/s }],
    },
    {
      code: `const a = <box maxHeight="auto" />`,
      errors: [{ message: /maxHeight="auto"/ }],
    },
    {
      // Typed as valid AlignString, and genuinely surprising.
      code: `const a = <box alignItems="space-between" />`,
      errors: [{ message: /indistinguishable from "flex-end"/ }],
    },
    {
      code: `const a = <box width={-1} />`,
      errors: [{ message: /Invalid width for Renderable <id>: -1.*ErrorBoundary catches it/s }],
    },
    {
      // The style-object path, including a hoisted const.
      code: `const s = { position: "static", minWidth: "auto" }
             const a = <box style={s} />`,
      errors: 2,
    },
  ],
});

undetectedTester().run("no-unsupported-values (not an OpenTUI file)", asRule(rule), {
  valid: [`export const Page = () => <div style={{ position: "static" }} />`],
  invalid: [],
});
