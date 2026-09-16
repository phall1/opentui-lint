import { join } from "node:path"
import rule from "../src/rules/use-theme-tokens.js"
import { asRule, tester, undetectedTester } from "./helpers.js"

const FIXTURE = join(import.meta.dir, "fixtures", "ds-app")

/**
 * `test/fixtures/ds-app/components/ui/theme.ts` is the fixture used by
 * `design-system.test.ts`: its base theme has no literal colors at all (every
 * value is `RGBA.fromIndex(…)`), and `test/fixtures/ds-app/themes/gruvbox.ts`
 * is a preset sitting alongside it with real hex — background #282828,
 * surface #3c3836, foreground #ebdbb2, border #665c54, primary #83a598. That
 * pairing is exactly the two tiers this rule reports: no color to name by
 * default, but a preset this rule can find and quote precisely once one
 * exists.
 */
const consumer = (name: string) => join(FIXTURE, "app", name)
const recipe = (name: string) => join(FIXTURE, "components", "ui", name)

tester("react").run("use-theme-tokens (react)", asRule(rule), {
  valid: [
    // A recipe legitimately sets colors from tokens, and "transparent" is a
    // structural value, not a color choice.
    {
      code: `
        export function Button() {
          const tokens = useTheme()
          return <box backgroundColor={tokens.colors.primary} style={{ borderColor: "transparent" }} />
        }
      `,
      filename: recipe("button.tsx"),
    },
    // Anything under the ui directory is design-system source, whatever
    // colors it sets — including a recipe file that isn't `button.tsx`.
    // (The theme module itself is exercised directly, without JSX, by
    // `design-system.test.ts`'s own exclusion tests; a `.ts` file cannot
    // parse JSX at all, so it is not a fixture this rule's tests can use.)
    {
      code: `export const fallback = <box backgroundColor="#ff0000" />`,
      filename: recipe("card.tsx"),
    },
    // Consumer code reading a token directly.
    {
      code: `
        const tokens = useTheme()
        export const Panel = () => <box backgroundColor={tokens.colors.primary} />
      `,
      filename: consumer("Panel.tsx"),
    },
    // A computed token — tint() — is still a token. This is the case the
    // brief calls out by name: a naive check that only recognizes a bare
    // `tokens.x.y` shape as compliant would flag this CallExpression.
    {
      code: `
        const tokens = useTheme()
        export const Panel = () => (
          <box style={{ backgroundColor: tint(tokens.colors.focus, tokens.colors.foreground, 0.3) }} />
        )
      `,
      filename: consumer("Panel.tsx"),
    },
    // A hoisted const style object built from tokens.
    {
      code: `
        const tokens = useTheme()
        const panel = { backgroundColor: tokens.colors.surface, borderColor: tokens.colors.border }
        export const Panel = () => <box style={panel} />
      `,
      filename: consumer("Panel.tsx"),
    },
    // "transparent" on consumer code too.
    {
      code: `export const Panel = () => <box backgroundColor="transparent" />`,
      filename: consumer("Panel.tsx"),
    },
    // A malformed / unparseable color is valid-colors' diagnostic, not this
    // rule's — reporting both would be shouting about the same line twice.
    {
      code: `export const Panel = () => <box backgroundColor="slate" />`,
      filename: consumer("Panel.tsx"),
    },
    {
      code: `export const Panel = () => <box backgroundColor="#GGGGGG" />`,
      filename: consumer("Panel.tsx"),
    },
    // No design system anywhere up the tree: nothing to enforce.
    {
      code: `export const Panel = () => <box backgroundColor="#ff0000" />`,
      filename: "/tmp/opentui-lint-no-design-system/app/Panel.tsx",
    },
  ],
  invalid: [
    // Tier 1: the base theme has no literal colors, so no token can be named.
    {
      code: `export const Panel = () => <box backgroundColor="#123456" />`,
      filename: consumer("Panel.tsx"),
      errors: [
        {
          message:
            /backgroundColor="#123456" is a raw color literal, but this project's theme \(.*theme\.ts\) owns colors\./,
        },
      ],
    },
    {
      // A named OpenTUI color is still a raw literal that bypasses the theme.
      code: `export const Panel = () => <box backgroundColor="red" />`,
      filename: consumer("Panel.tsx"),
      errors: [{ message: /backgroundColor="red" is a raw color literal, but this project's theme/ }],
    },
    // Tier 2: this exact hex is tokens.colors.surface in the gruvbox preset.
    {
      code: `export const Panel = () => <box backgroundColor="#3C3836" />`,
      filename: consumer("Panel.tsx"),
      errors: [
        {
          message: /backgroundColor="#3C3836" is a raw color literal, but #3C3836 is tokens\.colors\.surface under the gruvbox theme\./,
        },
      ],
    },
    // Same match through a hoisted const style object.
    {
      code: `
        const panel = { backgroundColor: "#83A598" }
        export const Panel = () => <box style={panel} />
      `,
      filename: consumer("Panel.tsx"),
      errors: [{ message: /is tokens\.colors\.primary under the gruvbox theme/ }],
    },
    // A raw fallback with no token anywhere near it is still reported.
    {
      code: `export const Panel = () => <box style={{ borderColor: "#abcdef" }} />`,
      filename: consumer("Panel.tsx"),
      errors: [{ message: /borderColor="#abcdef" is a raw color literal/ }],
    },
    // Two tokens share this value (see fixtures/ds-app/themes/duplicate.ts) —
    // the rule must name both rather than silently pick one, matching the
    // house rule `no-magic-density` already established for this exact
    // situation.
    {
      code: `export const Panel = () => <box backgroundColor="#112233" />`,
      filename: consumer("Panel.tsx"),
      errors: [
        {
          message:
            /equals more than one token — tokens\.colors\.accentA under the duplicate theme and tokens\.colors\.accentB under the duplicate theme are all #112233/,
        },
      ],
    },
  ],
})

tester("solid").run("use-theme-tokens (solid)", asRule(rule), {
  valid: [
    // Solid's accessor call — tokens() — must read the same as React's
    // tokens.colors.primary; missing this makes every themed Solid recipe a
    // false positive.
    {
      code: `
        const tokens = useTheme()
        export const Panel = () => <box backgroundColor={tokens().colors.primary} />
      `,
      filename: consumer("SolidPanel.tsx"),
    },
    // Core's theme.get() one more call away from the member access.
    {
      code: `export const Panel = () => <box backgroundColor={theme.get().colors.primary} />`,
      filename: consumer("SolidPanel.tsx"),
    },
  ],
  invalid: [
    {
      code: `export const Panel = () => <box backgroundColor="#3c3836" />`,
      filename: consumer("SolidPanel.tsx"),
      errors: [{ message: /is tokens\.colors\.surface under the gruvbox theme/ }],
    },
  ],
})

undetectedTester().run("use-theme-tokens (framework detection)", asRule(rule), {
  valid: [
    // No OpenTUI evidence in the file at all — and critically, no tsconfig
    // pointing at @opentui/react either, unlike everything under the ds-app
    // fixture. Every rule stands down before design-system discovery is even
    // reached.
    {
      code: `export const Panel = () => <box backgroundColor="#123456" />`,
      filename: "/tmp/opentui-lint-no-framework-evidence/app/Panel.tsx",
    },
  ],
  invalid: [],
})
