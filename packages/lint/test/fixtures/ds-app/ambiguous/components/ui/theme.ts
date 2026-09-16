import { RGBA } from "@opentui/core"

/**
 * A second, independent design system nested under the main `ds-app`
 * fixture, purpose-built for the cases the sibling theme can't produce:
 * two density tokens sharing a value, two glyphs sharing a value, and a
 * density token whose value is `0`.
 *
 * Discovery walks up from the linted file and stops at the *nearest*
 * `components/ui/theme.ts`, so anything under `ambiguous/` resolves to this
 * theme rather than the one at the fixture root.
 */
export interface Tokens {
  colors: { background: string }
  glyphs: { check: string; radioFilled: string }
  borders: { style: "single" | "rounded" }
  density: { paddingX: number; gutter: number; none: number }
}

export declare function createThemeStore(config: { base: Tokens }): unknown

export const terminal: Tokens = {
  colors: { background: RGBA.defaultBackground() },
  // Two names, same glyph: an app that renders "✓" for both a checkbox and a
  // filled radio button, sharing the mark.
  glyphs: { check: "✓", radioFilled: "✓" },
  borders: { style: "rounded" },
  // `gutter` and `paddingX` happen to agree at `1`; `none` is the express
  // "no spacing" token, deliberately `0`.
  density: { paddingX: 1, gutter: 1, none: 0 },
}

export const theme = createThemeStore({ base: terminal })
