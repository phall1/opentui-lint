import type { ThemeDefinition } from "../components/ui/theme"

/**
 * A preset added for `use-theme-tokens.test.ts`: two tokens deliberately
 * share one hex value, the ordinary way a "foreground on X" pair collapses to
 * the same white or black across several surfaces. Proves the rule names both
 * tokens instead of guessing which one a literal matching #112233 meant.
 */
export const duplicate: ThemeDefinition = {
  tokens: {
    colors: { accentA: "#112233", accentB: "#112233" },
  },
}
