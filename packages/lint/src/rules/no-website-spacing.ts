import { isSpacingProp } from "../catalog/index.js"
import {
  attributeName,
  elementName,
  isHostElement,
  objectEntries,
  resolveObjectExpression,
  staticNumber,
} from "../project/jsx.js"
import { defineRule } from "../project/rule.js"
import type { Node } from "../project/types.js"

/**
 * A spacing rule, because in a terminal spacing is not cosmetic.
 *
 * OpenTUI's own agent skill opens with this instruction:
 *
 *   > Design for a terminal app, not a browser. Do not use gaps between
 *   > adjacent UI panels. Do not add unnecessary margins or padding. Prefer
 *   > compact, information-dense layouts over website-style card spacing.
 *
 * Models trained on web UI do not follow it. `padding={4}` reads as a
 * comfortable 16px in Tailwind muscle memory; here it is four whole rows and
 * four whole columns. On the 80x24 terminal that is still the safe assumption,
 * one such box spends a third of the vertical space on nothing.
 *
 * Nothing about this is a runtime error, which is exactly why it needs a
 * linter: the app works, it just looks like a web page that wandered into a
 * terminal, and the reviewer notices long after the agent has moved on.
 */

interface Budget {
  padding: number
  margin: number
  gap: number
}

const DEFAULT_BUDGET: Budget = { padding: 1, margin: 1, gap: 1 }

function categoryOf(prop: string): keyof Budget | undefined {
  if (prop.startsWith("padding")) return "padding"
  if (prop.startsWith("margin")) return "margin"
  if (prop === "gap" || prop === "rowGap" || prop === "columnGap") return "gap"
  return undefined
}

const AXIS_HINT: Record<keyof Budget, string> = {
  padding: "rows and columns of empty cells inside the box",
  margin: "rows and columns of empty cells around the box",
  gap: "empty cells between every pair of children",
}

export default defineRule(
  {
    type: "suggestion",
    docs: {
      description: "Keep padding, margin and gap within a terminal-sized budget.",
      url: "https://github.com/phall1/opentui-lint/blob/main/docs/rules/no-website-spacing.md",
    },
    schema: [
      {
        type: "object",
        properties: {
          maxPadding: { type: "number", minimum: 0 },
          maxMargin: { type: "number", minimum: 0 },
          maxGap: { type: "number", minimum: 0 },
          message: { type: "string", description: "Replaces the built-in explanation." },
        },
        additionalProperties: false,
      },
    ],
  },
  (context) => {
    const options = context.options[0] ?? {}
    const budget: Budget = {
      padding: options.maxPadding ?? DEFAULT_BUDGET.padding,
      margin: options.maxMargin ?? DEFAULT_BUDGET.margin,
      gap: options.maxGap ?? DEFAULT_BUDGET.gap,
    }
    const custom = options.message as string | undefined

    function check(prop: string, valueNode: Node, reportNode: Node, element: string): void {
      const category = categoryOf(prop)
      if (category === undefined || !isSpacingProp(prop)) return

      const value = staticNumber(valueNode)
      if (value === undefined || value <= budget[category]) return

      if (custom) {
        context.report({ node: reportNode, message: custom })
        return
      }

      context.report({
        node: reportNode,
        message:
          `${prop}={${value}} on <${element}> spends ${value} ${AXIS_HINT[category]}. ` +
          `OpenTUI measures in whole terminal cells, not pixels — on an 80x24 terminal that is ` +
          `${Math.round((value / 24) * 100)}% of the height. ` +
          `Terminal UIs are information-dense; keep ${category} at ${budget[category]} or less, ` +
          `and separate panels with a border rather than empty space.`,
      })
    }

    return {
      JSXOpeningElement(node) {
        const element = elementName(node)
        if (!element || !isHostElement(element)) return

        for (const attribute of (node.attributes ?? []) as Node[]) {
          const name = attributeName(attribute)
          if (!name) continue

          if (name === "style") {
            const expression =
              attribute.value?.type === "JSXExpressionContainer" ? attribute.value.expression : undefined
            const object = resolveObjectExpression(context, expression)
            if (!object) continue
            for (const entry of objectEntries(object)) {
              check(entry.key, entry.valueNode, entry.node, element)
            }
            continue
          }

          if (attribute.value) check(name, attribute.value, attribute, element)
        }
      },
    }
  },
)
