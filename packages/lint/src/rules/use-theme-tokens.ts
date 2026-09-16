import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { basename, dirname, join, relative, resolve } from "node:path"
import { checkColor, isColorProp } from "../catalog/index.js"
import {
  type DesignSystem,
  designSystemFor,
  isDesignSystemSource,
  readThemeTokens,
} from "../project/design-system.js"
import { attributeName, objectEntries, resolveObjectExpression, staticStrings } from "../project/jsx.js"
import { defineRule } from "../project/rule.js"
import type { Node, RuleContext } from "../project/types.js"

/**
 * A raw color literal on a color prop, in a project where a theme owns colors.
 *
 * The hard problem this rule has to work around: tuiparts' default theme is
 * built entirely from `RGBA.fromIndex(8)` and `RGBA.defaultBackground()`, so
 * `designSystemFor(context).tokens.colors` comes back `{}` on a normal
 * install (see `project/design-system.ts`). Reverse-matching a hex literal to
 * a token name is therefore usually impossible, and even when a project ships
 * a preset with real hex in it, that hex belongs to whichever theme happens to
 * be `setActive()` at runtime — this rule has no way to know that.
 *
 * So there are two tiers, reported differently on purpose:
 *
 * - Tier 1 (always available): the theme owns colors here, full stop. No
 *   token name is claimed because none can be proven.
 * - Tier 2 (only when a literal color really is spelled out somewhere): the
 *   exact matching token, named precisely, including which file it came from
 *   when that is a preset rather than the active theme. Exact string match
 *   only — no nearest-color guessing, because with half the default palette
 *   resolved from the terminal's own ANSI colors, a "close" match would be a
 *   confidently wrong diagnostic dressed up as a helpful one.
 */

/**
 * The theme's own section names, verified against tuiparts' `theme.ts`:
 * `Tokens` has exactly `colors`, `density`, `glyphs` and `borders`, and
 * `readThemeTokens` reads sections by these same names. A `MemberExpression`
 * that reaches into one of them — `tokens.colors.primary`,
 * `tokens().colors.primary`, `theme.get().colors.primary` — is a token read,
 * whatever the receiver is called.
 */
const TOKEN_SECTIONS = new Set(["colors", "density", "glyphs", "borders"])

function memberPropertyName(node: Node): string | undefined {
  if (node.computed) {
    return node.property?.type === "Literal" && typeof node.property.value === "string"
      ? node.property.value
      : undefined
  }
  return node.property?.type === "Identifier" ? (node.property.name as string) : undefined
}

/**
 * Whether any node in `node`'s subtree reads a theme token.
 *
 * Deliberately whole-subtree, not "is the top-level shape a token read":
 * `tint(tokens.colors.focus, tokens.colors.foreground, 0.3)` computes its
 * result from tokens but is itself a `CallExpression`, and `theme.get()` is
 * one more call away from the member access that matters. Treating the whole
 * expression as compliant the moment a token shows up anywhere in it is the
 * conservative call: a mixed expression that combines a token with a raw
 * fallback (`tokens.colors.primary ?? "#3366ff"`) is not proof that the
 * fallback is wrong, so it is left alone rather than reported.
 */
function containsTokenReference(node: Node | undefined | null): boolean {
  if (!node || typeof node.type !== "string") return false
  if (node.type === "MemberExpression" && TOKEN_SECTIONS.has(memberPropertyName(node) ?? "")) return true

  for (const key of Object.keys(node)) {
    if (key === "parent") continue
    const child = node[key]
    if (Array.isArray(child)) {
      for (const entry of child) if (containsTokenReference(entry as Node)) return true
    } else if (child && typeof child === "object" && typeof (child as Node).type === "string") {
      if (containsTokenReference(child as Node)) return true
    }
  }
  return false
}

/**
 * Preset theme files found under a sibling `themes/` directory.
 *
 * `readThemeTokens` only ever sees the one theme module `designSystemFor`
 * resolved — the base theme, or whatever `settings.opentui.theme` points at.
 * The rest of a project's real hex lives in preset files such as
 * `themes/gruvbox.ts`, registered with `theme.register()` and switched on
 * with `theme.setActive()` — evidence this rule can read but cannot confirm
 * is actually the active theme at runtime. Tier 2 says so precisely ("under
 * the gruvbox theme") rather than implying it is the live palette.
 *
 * The walk mirrors `discoverFrom` in `design-system.ts`: nearest ancestor
 * wins, because the three conventional ui-dir depths
 * (`components/ui`, `src/components/ui`, `app/components/ui`) do not share a
 * fixed number of path segments, so there is no way to compute "project root"
 * from `uiDir` without walking for it.
 */
const presetFileCache = new Map<string, string[]>()

function findPresetThemeFiles(system: DesignSystem): string[] {
  const start = system.uiDir ?? dirname(system.themeFile)
  const cached = presetFileCache.get(start)
  if (cached) return cached

  let dir = start
  let found: string[] = []
  for (;;) {
    const candidate = join(dir, "themes")
    if (existsSync(candidate) && statSync(candidate).isDirectory()) {
      found = readdirSync(candidate)
        .filter((name) => /\.tsx?$/.test(name))
        .map((name) => join(candidate, name))
        .toSorted()
      break
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  presetFileCache.set(start, found)
  return found
}

interface TokenMatch {
  tokenName: string
  /** Set only when the match came from a preset rather than the active theme. */
  presetLabel?: string
}

/**
 * Every exact (case-insensitive) match, not just the first.
 *
 * `no-magic-density` — the sibling rule this one completes — already
 * established the house rule for this: two tokens can share a value (a
 * `primaryForeground` and a `warningForeground` both landing on white is
 * completely ordinary), and picking one to report would be exactly the kind
 * of unproven guess this plugin refuses to make. All of them are named
 * instead.
 */
function matchTokens(system: DesignSystem, value: string): TokenMatch[] {
  const normalized = value.trim().toLowerCase()
  const hits: TokenMatch[] = []

  for (const [name, tokenValue] of Object.entries(system.tokens.colors)) {
    if (tokenValue === normalized) hits.push({ tokenName: name })
  }

  for (const presetFile of findPresetThemeFiles(system)) {
    if (resolve(presetFile) === resolve(system.themeFile)) continue // already checked above
    const presetTokens = readThemeTokens(readFileSync(presetFile, "utf8"))
    const presetLabel = basename(presetFile).replace(/\.tsx?$/, "")
    for (const [name, tokenValue] of Object.entries(presetTokens.colors)) {
      if (tokenValue === normalized) hits.push({ tokenName: name, presetLabel })
    }
  }
  return hits
}

function describeMatch(match: TokenMatch, themePath: string): string {
  return match.presetLabel
    ? `tokens.colors.${match.tokenName} under the ${match.presetLabel} theme`
    : `tokens.colors.${match.tokenName} in ${themePath}`
}

/** A theme-file path worth putting in a message, relative to the file being linted. */
function relativeToFile(context: RuleContext, target: string): string {
  const rel = relative(dirname(resolve(context.filename)), target)
  return rel.startsWith(".") ? rel : `./${rel}`
}

export default defineRule(
  {
    type: "suggestion",
    docs: {
      description: "Disallow raw color literals on props a design system's theme owns.",
      url: "https://github.com/phall1/opentui-lint/blob/main/docs/rules/use-theme-tokens.md",
    },
    schema: [],
  },
  (context) => {
    let system: DesignSystem | null = null
    let skip = true

    function report(propName: string, value: string, node: Node): void {
      if (!system) return

      // Not our business: an unparseable value renders magenta and that is
      // `valid-colors`' diagnostic, not "bypasses the theme".
      if (checkColor(value).kind !== "ok") return
      // Structural, not a color choice — recipes use it to mean "nothing here".
      if (value.trim().toLowerCase() === "transparent") return

      const themePath = relativeToFile(context, system.themeFile)
      const typecheckBlind =
        "ColorInput is just `string | RGBA`, so a literal typechecks exactly like a token read " +
        "and nothing catches the difference."
      const pinned =
        "The theme re-reads its colors through `theme.subscribe` on every change; a literal here " +
        "pins this instance so a theme switch never reaches it."

      const matches = matchTokens(system, value)
      if (matches.length === 1) {
        const match = matches[0]!
        context.report({
          node,
          message:
            `${propName}="${value}" is a raw color literal, but ${value} is ${describeMatch(match, themePath)}. ` +
            `${typecheckBlind} ${pinned} Use \`colors.${match.tokenName}\` from the theme instead of the literal.`,
        })
        return
      }
      if (matches.length > 1) {
        const names = matches.map((match) => describeMatch(match, themePath)).join(" and ")
        context.report({
          node,
          message:
            `${propName}="${value}" is a raw color literal that equals more than one token — ${names} are ` +
            `all ${value}, and a literal does not distinguish which one was meant. ${typecheckBlind} ${pinned} ` +
            `Use whichever token matches this instance's role, instead of the literal.`,
        })
        return
      }

      context.report({
        node,
        message:
          `${propName}="${value}" is a raw color literal, but this project's theme (${themePath}) owns colors. ` +
          `${typecheckBlind} ${pinned} Read the color from a token in the theme instead.`,
      })
    }

    function checkValue(propName: string, valueNode: Node | undefined | null): void {
      if (!valueNode || containsTokenReference(valueNode)) return
      for (const site of staticStrings(valueNode)) report(propName, site.value, site.node)
    }

    function checkStyleObject(expression: Node | undefined): void {
      const object = resolveObjectExpression(context, expression)
      if (!object) return
      for (const entry of objectEntries(object)) {
        if (!isColorProp(entry.key)) continue
        checkValue(entry.key, entry.valueNode)
      }
    }

    return {
      Program() {
        system = designSystemFor(context)
        // No design system: nothing to enforce. Design-system source (a
        // recipe, the theme module itself): the code that legitimately reads
        // and assigns raw colors, so it must never be linted by this rule.
        skip = !system || isDesignSystemSource(context, system)
      },
      JSXAttribute(node) {
        if (skip) return
        const name = attributeName(node)
        if (!name) return

        if (name === "style") {
          const expression =
            node.value?.type === "JSXExpressionContainer" ? node.value.expression : undefined
          checkStyleObject(expression)
          return
        }

        if (!isColorProp(name)) return
        checkValue(name, node.value)
      },
    }
  },
)
