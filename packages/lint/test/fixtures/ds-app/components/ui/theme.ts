import { type ColorInput, RGBA, parseColor } from "@opentui/core"

/** Semantic token contract shared by every installed recipe. Extend freely. */
export interface Tokens {
  colors: {
    background: ColorInput
    surface: ColorInput
    foreground: ColorInput
    border: ColorInput
    primary: ColorInput
  }
  glyphs: { check: string; radio: string }
  borders: { style: "single" | "rounded" | "double" | "heavy" }
  density: { paddingX: number; comfortablePaddingX: number }
}

export declare function createThemeStore(config: { base: Tokens }): unknown

/**
 * Default theme built from ANSI-indexed colors, so recipes inherit whatever
 * palette the terminal user configured. Note there is no hex here at all.
 */
export const terminal: Tokens = {
  colors: {
    background: RGBA.defaultBackground(),
    surface: RGBA.fromIndex(8),
    foreground: RGBA.defaultForeground(),
    border: RGBA.fromIndex(8),
    primary: RGBA.fromIndex(4),
  },
  glyphs: { check: "✓", radio: "●" },
  borders: { style: "single" },
  density: { paddingX: 1, comfortablePaddingX: 2 },
}

export const theme = createThemeStore({ base: terminal })
export { parseColor }
