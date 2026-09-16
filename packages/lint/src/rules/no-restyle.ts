import { isColorProp, SPACING_PROPS } from "../catalog/index.js"
import { compileContracts, ContractConfigError, type ContractInput, type RestyleCategory } from "../project/contracts.js"
import { designSystemFor, designSystemImports, isDesignSystemSource } from "../project/design-system.js"
import { attributeName, objectEntries, resolveObjectExpression } from "../project/jsx.js"
import { defineRule } from "../project/rule.js"
import type { Node } from "../project/types.js"

/**
 * The flagship design-system rule, and the OpenTUI analogue of `@shadcn/lint`'s
 * `no-restyle`: a component from the project's own `components/ui` owns its
 * colors, border, typography, padding and internal layout; a call site may
 * place it, not restyle it.
 *
 * Get the framing right, because it is easy to get backwards. tuiparts
 * *deliberately* permits instance overrides — most recipes spread `{...props}`
 * after their themed defaults, and the Badge recipe's own README says so:
 * "Native root properties … are applied after those defaults, so applications
 * can customize an instance." Nothing this rule reports is a bug. It is a
 * house policy a project opts into, which is exactly why it lives in `strict`
 * and never in `recommended` — see `plugin.ts`.
 *
 * The provably true cost, and the one the message leads with: a recipe reads
 * its colors from `theme.subscribe`, so a value pinned at the call site does
 * not move when `theme.setActive(...)` runs. That is the concrete thing lost,
 * stated as a fact rather than implied as a defect.
 */

/**
 * Structural, not colored, border props. `borderColor`, `focusedBorderColor`
 * and every other *Color prop land in `color` via `isColorProp` instead —
 * the catalog's generated list is the source of truth for which prop names
 * carry a color, and duplicating that split by hand here would drift.
 */
const BORDER_PROPS = new Set(["border", "borderStyle", "customBorderChars"])

/**
 * OpenTUI's typed prop surface has no font-weight/italic axis to speak of;
 * `font` (which ascii typeface renders) and `showUnderline` are what actually
 * exists. A sparse category beats an invented one.
 */
const TYPOGRAPHY_PROPS = new Set(["font", "showUnderline"])

/**
 * `padding*` is the design system's box model; `margin*` is the call site's
 * placement and is never reported (see `categoryOf`). Derived from the
 * generated list rather than a hand-written prefix check, so a new padding
 * prop upstream is picked up automatically and a same-prefixed unrelated prop
 * never is.
 */
const SPACING_PROPS_OWNED = new Set<string>(SPACING_PROPS.filter((prop) => prop.startsWith("padding")))

/**
 * Flex/gap props that shape how a component arranges *its own* children.
 * `gap`/`rowGap`/`columnGap` come from the generated spacing list;
 * `flexDirection`/`alignItems`/`justifyContent`/`flexWrap` have no generated
 * list of their own (they are Yoga's flex-container axis, present on every
 * layout-capable element) so they are named directly.
 */
const INTERNAL_LAYOUT_PROPS = new Set<string>([
  ...SPACING_PROPS.filter((prop) => prop === "gap" || prop === "rowGap" || prop === "columnGap"),
  "flexDirection",
  "alignItems",
  "justifyContent",
  "flexWrap",
])

/**
 * Which of the five owned categories a prop falls in, or `undefined` for
 * everything else — placement (`marginTop`, `width`, `position`, `zIndex`,
 * `alignSelf`, `min*`/`max*`, …) and behaviour (`onPress`, `content`, `value`,
 * `focused`, `id`, `ref`, `children`, …) alike. Both of those are always the
 * call site's to set, so they are simply never classified and never reported
 * — there is no need to enumerate them.
 */
function categoryOf(prop: string): RestyleCategory | undefined {
  if (isColorProp(prop)) return "color"
  if (BORDER_PROPS.has(prop)) return "border"
  if (TYPOGRAPHY_PROPS.has(prop)) return "typography"
  if (SPACING_PROPS_OWNED.has(prop)) return "spacing"
  if (INTERNAL_LAYOUT_PROPS.has(prop)) return "internalLayout"
  return undefined
}

function defaultMessage(component: string, prop: string, category: RestyleCategory): string {
  return (
    `${prop} sets ${component}'s ${category}, which it otherwise re-reads from the theme on every ` +
    `\`theme.subscribe\` update — pin it here and \`theme.setActive(...)\` stops reaching this instance. ` +
    `${component} applies its own props after its themed defaults on purpose (that is how every tuiparts ` +
    `recipe lets you override an instance), so nothing here is broken — this is a stricter house policy on ` +
    `top of that. Prefer ${component}'s own variant, size, or intent prop if it exposes one, or allow ` +
    `"${category}" for ${component} in this rule's \`contracts\` option.`
  )
}

/**
 * Resolves a JSX name node to its dotted spelling.
 *
 * Written when `elementName` in `project/jsx.ts` mishandled this case — its
 * member-expression branch recursed with a bare identifier and produced
 * `"?.Content"`. That bug is fixed and pinned now, so this could call
 * `elementName` instead; it stays because the rule only ever has a name node in
 * hand and this is the narrower thing to say.
 */
function jsxName(nameNode: Node | undefined): string | undefined {
  if (!nameNode) return undefined
  if (nameNode.type === "JSXIdentifier") return nameNode.name as string
  if (nameNode.type === "JSXMemberExpression") {
    const object = jsxName(nameNode.object)
    return object ? `${object}.${nameNode.property.name}` : undefined
  }
  return undefined
}

/** `<Dialog.Content>` → "DialogContent", so one contract entry covers both spellings. */
function flatten(name: string): string {
  return name.replace(/\./g, "")
}

/** Whether the JSX name starts with an uppercase letter — a component, never a host element. */
function isCapitalized(name: string): boolean {
  const first = name[0]
  return first !== undefined && first === first.toUpperCase() && first !== first.toLowerCase()
}

// Matches `defineRule`'s own (unexported) `Handlers` type structurally, so the
// early `return {}` below and the full handlers object at the end type-check
// against the same shape instead of TypeScript inferring a union of the two.
type Handlers = Record<string, (node: Node) => void>

export default defineRule(
  {
    type: "suggestion",
    docs: {
      description:
        "A design-system component owns its color, border, typography, spacing and internal layout; a call site may only place it.",
      url: "https://github.com/phall1/opentui-lint/blob/main/docs/rules/no-restyle.md",
    },
    schema: [
      {
        type: "object",
        properties: {
          contracts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                pattern: { type: "string" },
                allow: { type: "array", items: { type: "string" } },
                deny: { type: "array", items: { type: "string" } },
                message: { type: "string" },
              },
              required: ["pattern"],
              additionalProperties: false,
            },
          },
          message: { type: "string", description: "Fallback message for a contract that does not set its own." },
        },
        additionalProperties: false,
      },
    ],
  },
  (context): Handlers => {
    // No project model, or this file *is* the design system: nothing to check.
    // Linting a recipe against its own rule would report every recipe in the
    // project, and there is nothing to compare an unconfigured project to.
    const system = designSystemFor(context)
    if (!system || isDesignSystemSource(context, system)) return {}

    const options = (context.options[0] ?? {}) as { contracts?: ContractInput[]; message?: string }
    const fallbackMessage = options.message

    let contracts: ReturnType<typeof compileContracts> | undefined
    let configError: string | undefined
    try {
      contracts = compileContracts(options.contracts)
    } catch (error) {
      if (!(error instanceof ContractConfigError)) throw error
      configError = error.message
    }

    let owned = new Set<string>()

    function check(component: string, prop: string, reportNode: Node): void {
      const category = categoryOf(prop)
      if (!category || !contracts) return
      const verdict = contracts.decide(component, category)
      if (verdict.allowed) return
      context.report({
        node: reportNode,
        message: verdict.message ?? fallbackMessage ?? defaultMessage(component, prop, category),
      })
    }

    return {
      Program(node) {
        // `Node` is deliberately loose (an index signature, not a `body`
        // property), which is exactly what `designSystemImports` also expects
        // structurally — TypeScript's "weak type" check just cannot see that
        // through an index signature, so this is a real Program node, not an
        // unsafe cast.
        owned = designSystemImports(node as unknown as { body?: unknown[] }, system.uiDir)
        // A misconfigured policy is reported once, at the top of the file, and
        // nothing else fires for it — `check` above bails whenever `contracts`
        // is unset, so this is the only diagnostic the file can produce.
        if (configError) context.report({ node, message: configError })
      },

      JSXOpeningElement(node) {
        const name = jsxName(node.name)
        if (!name || !isCapitalized(name)) return

        // Scope is decided by the import, not the spelling: a `Button` that
        // did not come from the ui directory — `<For>` from solid-js, the
        // user's own unrelated `<Card>` — is never in scope, however familiar
        // the name looks. This misses a design-system component re-exported
        // through a barrel the import scan cannot see through, which is the
        // same limitation `designSystemImports` documents.
        const owner = name.split(".")[0]!
        if (!owned.has(owner)) return

        const component = flatten(name)

        for (const attribute of (node.attributes ?? []) as Node[]) {
          const attrName = attributeName(attribute)
          if (!attrName) continue // a spread attribute names no single prop

          if (attrName === "style") {
            const expression =
              attribute.value?.type === "JSXExpressionContainer" ? attribute.value.expression : undefined
            const object = resolveObjectExpression(context, expression)
            if (!object) continue
            for (const entry of objectEntries(object)) check(component, entry.key, entry.node)
            continue
          }

          check(component, attrName, attribute)
        }
      },
    }
  },
)
