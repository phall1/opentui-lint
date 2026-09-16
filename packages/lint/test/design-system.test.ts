import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { readFileSync } from "node:fs"
import {
  clearDesignSystemCache,
  designSystemFor,
  isDesignSystemSource,
  readThemeTokens,
} from "../src/project/design-system.js"
import type { RuleContext } from "../src/project/types.js"

const FIXTURE = join(import.meta.dir, "fixtures", "ds-app")

/** A rule context just real enough for the discovery path. */
function contextFor(file: string, settings: Record<string, unknown> = {}): RuleContext {
  const filename = join(FIXTURE, file)
  return {
    filename,
    settings: { opentui: settings },
    options: [],
    sourceCode: {
      getText: () => readFileSync(filename, "utf8"),
      getAllComments: () => [],
      ast: { type: "Program" },
    },
    report() {},
  } as unknown as RuleContext
}

describe("reading a theme module", () => {
  const source = readFileSync(join(FIXTURE, "components", "ui", "theme.ts"), "utf8")

  test("reads the values, not the interface that declares them", () => {
    // The Tokens interface appears first in the file and its members are types.
    // Reading that instead yields an empty density and a borderStyle taken from
    // the first member of a union — right by accident, wrong by mechanism.
    const tokens = readThemeTokens(source)
    expect(tokens.density).toEqual({ paddingX: 1, comfortablePaddingX: 2 })
    expect(tokens.borderStyle).toBe("single")
    expect(tokens.glyphs).toEqual({ check: "✓", radio: "●" })
  })

  test("the last entry of a single-line group is not dropped", () => {
    // `density: { paddingX: 1, comfortablePaddingX: 2 }` has nothing after the
    // final value, so requiring a trailing comma silently lost it.
    expect(readThemeTokens(source).density.comfortablePaddingX).toBe(2)
  })

  test("a default theme yields no colors at all", () => {
    // Every color is RGBA.fromIndex(…) or RGBA.defaultBackground(), whose real
    // value depends on the user's terminal palette. Inventing one would produce
    // a confidently wrong diagnostic, so none are recorded.
    expect(readThemeTokens(source).colors).toEqual({})
  })

  test("a preset theme yields its literal colors, lowercased", () => {
    const preset = readThemeTokens(readFileSync(join(FIXTURE, "themes", "gruvbox.ts"), "utf8"))
    expect(preset.colors.surface).toBe("#3c3836")
    expect(Object.keys(preset.colors)).toHaveLength(5)
  })

  test("a file that is not a theme yields nothing rather than guessing", () => {
    expect(readThemeTokens("export const x = 1")).toEqual({ density: {}, glyphs: {}, colors: {} })
  })
})

describe("discovery", () => {
  test("finds components/ui/theme.ts by walking up from the file", () => {
    clearDesignSystemCache()
    const system = designSystemFor(contextFor(join("app", "Dashboard.tsx")))
    expect(system).toBeTruthy()
    expect(system!.themeFile).toBe(join(FIXTURE, "components", "ui", "theme.ts"))
    expect(system!.tokens.density.paddingX).toBe(1)
  })

  test("an explicitly configured theme wins", () => {
    clearDesignSystemCache()
    const system = designSystemFor(
      contextFor(join("app", "Dashboard.tsx"), { theme: join(FIXTURE, "themes", "gruvbox.ts") }),
    )
    expect(system!.tokens.colors.surface).toBe("#3c3836")
  })

  test("a configured path that does not exist yields null rather than a wrong theme", () => {
    clearDesignSystemCache()
    expect(designSystemFor(contextFor(join("app", "Dashboard.tsx"), { theme: "/nope/theme.ts" }))).toBeNull()
  })

  test("a project with no design system yields null", () => {
    clearDesignSystemCache()
    const outside = {
      filename: "/tmp/somewhere-else/app.tsx",
      settings: { opentui: {} },
      options: [],
      sourceCode: { getText: () => "", getAllComments: () => [], ast: { type: "Program" } },
      report() {},
    } as unknown as RuleContext
    expect(designSystemFor(outside)).toBeNull()
  })
})

describe("excluding the design system's own source", () => {
  test("a recipe under components/ui is excluded", () => {
    clearDesignSystemCache()
    const context = contextFor(join("components", "ui", "button.tsx"))
    expect(isDesignSystemSource(context, designSystemFor(context))).toBe(true)
  })

  test("the theme module itself is excluded", () => {
    clearDesignSystemCache()
    const context = contextFor(join("components", "ui", "theme.ts"))
    expect(isDesignSystemSource(context, designSystemFor(context))).toBe(true)
  })

  test("consumer code is not excluded", () => {
    clearDesignSystemCache()
    const context = contextFor(join("app", "Dashboard.tsx"))
    expect(isDesignSystemSource(context, designSystemFor(context))).toBe(false)
  })

  test("a recipe nested deeper than the ui root is still excluded, via its theme import", () => {
    // A consumer who moves button.tsx to components/ui/forms/ still imports
    // "./theme" relatively, which is the signature of a recipe.
    clearDesignSystemCache()
    const context = {
      filename: "/elsewhere/forms/button.tsx",
      settings: { opentui: {} },
      options: [],
      sourceCode: {
        getText: () => `import { useTheme } from "../use-theme"\nimport { tint } from "./theme"`,
        getAllComments: () => [],
        ast: { type: "Program" },
      },
      report() {},
    } as unknown as RuleContext
    expect(isDesignSystemSource(context, null)).toBe(true)
  })
})
