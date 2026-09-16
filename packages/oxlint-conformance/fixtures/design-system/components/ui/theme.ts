import type { ColorInput } from "@opentui/core"

/** Trimmed from a real `shadcn add @tuiparts/react/theme`. */
export interface Tokens {
  colors: { background: ColorInput; surface: ColorInput; primary: ColorInput }
  glyphs: { check: string }
  borders: { style: "single" | "rounded" | "double" | "heavy" }
  density: { paddingX: number; comfortablePaddingX: number }
}

export declare function createThemeStore(config: { base: Tokens }): unknown

/**
 * Unlike the stock theme this one carries literal colors, so the second tier of
 * use-theme-tokens — the one that can name a token — has something to match.
 */
export const terminal: Tokens = {
  colors: { background: "#101418", surface: "#1e293b", primary: "#22c55e" },
  glyphs: { check: "✓" },
  borders: { style: "single" },
  density: { paddingX: 1, comfortablePaddingX: 2 },
}

export const theme = createThemeStore({ base: terminal })
