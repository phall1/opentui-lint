import { join } from "node:path";
import { clearDesignSystemCache } from "../src/project/design-system.js";
import rule from "../src/rules/no-magic-density.js";
import { asRule, tester } from "./helpers.js";

const FIXTURE = join(import.meta.dir, "fixtures", "ds-app");
// Files don't need to exist on disk: RuleTester parses `code` directly, and
// discovery only ever stats `components/ui/theme.{ts,tsx}` on the way up.
const app = (name: string) => join(FIXTURE, "app", name);
const ambiguousApp = (name: string) => join(FIXTURE, "ambiguous", "app", name);
const button = join(FIXTURE, "components", "ui", "button.tsx");
// Outside the fixture tree entirely, so the upward walk never finds a theme.
const NO_DESIGN_SYSTEM = join("/tmp", "opentui-lint-no-design-system", "App.tsx");

clearDesignSystemCache();

tester("react").run("no-magic-density (react)", asRule(rule), {
  valid: [
    // No theme anywhere above this file: nothing to compare the literal to.
    { code: `export const App = () => <box paddingX={1} />`, filename: NO_DESIGN_SYSTEM },
    // A value already read from the theme, in each of the three shapes an
    // OpenTUI project actually writes it. None of these are static literals,
    // so `staticNumber`/`staticString` never resolve them to a value.
    {
      code: `export const App = () => <box paddingX={tokens.density.paddingX} />`,
      filename: app("A.tsx"),
    },
    {
      code: `export const App = () => <box paddingX={tokens().density.paddingX} />`,
      filename: app("A.tsx"),
    },
    {
      code: `export const App = () => <box paddingX={theme.get().density.paddingX} />`,
      filename: app("A.tsx"),
    },
    // The design system's own recipe: legitimately raw.
    {
      code: `export function Button() { return <box paddingX={1} borderStyle="single"><text content="✓" /></box> }`,
      filename: button,
    },
    // No token has this value at all.
    { code: `export const App = () => <box paddingX={5} />`, filename: app("A.tsx") },
    { code: `export const App = () => <box borderStyle="rounded" />`, filename: app("A.tsx") },
    { code: `export const App = () => <text content="x" />`, filename: app("A.tsx") },
    // `0` is the universal "none", even though the ambiguous theme names a
    // token `0` (`density.none`).
    { code: `export const App = () => <box paddingX={0} />`, filename: ambiguousApp("A.tsx") },
    // A non-spacing numeric prop is never compared to density tokens, even
    // though its value happens to equal one.
    { code: `export const App = () => <box flexGrow={1} />`, filename: app("A.tsx") },
    // A category turned off via options.
    {
      code: `export const App = () => <box paddingX={1} />`,
      filename: app("A.tsx"),
      options: [{ check: ["borders", "glyphs"] }],
    },
    {
      code: `export const App = () => <box borderStyle="single" />`,
      filename: app("A.tsx"),
      options: [{ check: ["density", "glyphs"] }],
    },
  ],
  invalid: [
    {
      code: `export const App = () => <box paddingX={1} />`,
      filename: app("A.tsx"),
      errors: [{ message: /tokens\.density\.paddingX/ }],
    },
    {
      code: `export const App = () => <box paddingX={2} />`,
      filename: app("A.tsx"),
      errors: [{ message: /tokens\.density\.comfortablePaddingX/ }],
    },
    // A style object, top-level.
    {
      code: `export const App = () => <box style={{ paddingX: 1 }} />`,
      filename: app("A.tsx"),
      errors: [{ message: /tokens\.density\.paddingX/ }],
    },
    // A style object hoisted into a const — the hop `resolveObjectExpression` exists for.
    {
      code: `const card = { paddingX: 1 }\nexport const App = () => <box style={card} />`,
      filename: app("A.tsx"),
      errors: [{ message: /tokens\.density\.paddingX/ }],
    },
    {
      code: `export const App = () => <box borderStyle="single" />`,
      filename: app("A.tsx"),
      errors: [{ message: /tokens\.borders\.style/ }],
    },
    {
      code: `export const App = () => <text content="✓" />`,
      filename: app("A.tsx"),
      errors: [{ message: /tokens\.glyphs\.check/ }],
    },
    // Two density tokens share the value: both are named, neither is picked.
    {
      code: `export const App = () => <box paddingX={1} />`,
      filename: ambiguousApp("A.tsx"),
      errors: [{ message: /tokens\.density\.paddingX and tokens\.density\.gutter/ }],
    },
    // Two glyphs share the value: same treatment.
    {
      code: `export const App = () => <text content="✓" />`,
      filename: ambiguousApp("A.tsx"),
      errors: [{ message: /tokens\.glyphs\.check and tokens\.glyphs\.radioFilled/ }],
    },
  ],
});

tester("solid").run("no-magic-density (solid)", asRule(rule), {
  valid: [
    // The Solid accessor spelling is also compliant — it is not a literal.
    {
      code: `export const App = () => <box paddingX={tokens().density.paddingX} />`,
      filename: app("A.tsx"),
    },
  ],
  invalid: [
    {
      code: `export const App = () => <box paddingX={1} />`,
      filename: app("A.tsx"),
      // The fix Solid needs to write is spelled with the accessor call.
      errors: [{ message: /tokens\(\)\.density\.paddingX/ }],
    },
    {
      code: `export const App = () => <text content="✓" />`,
      filename: app("A.tsx"),
      errors: [{ message: /tokens\(\)\.glyphs\.check/ }],
    },
  ],
});
