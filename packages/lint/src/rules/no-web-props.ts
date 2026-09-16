import { CSS_ONLY_PROPS, WEB_ONLY_PROPS, elementsFor, knowsElement } from "../catalog/index.js"
import {
  attributeName,
  elementName,
  isHostElement,
  objectEntries,
  resolveObjectExpression,
} from "../project/jsx.js"
import { defineRule } from "../project/rule.js"
import type { Node } from "../project/types.js"

function advise(name: string): string | undefined {
  return WEB_ONLY_PROPS[name] ?? CSS_ONLY_PROPS[name]
}

/** `data-testid` and friends: harmless in HTML, inert here. */
function isWebNamespaced(name: string): boolean {
  return name.startsWith("data-") || name.startsWith("aria-")
}

/**
 * An unrecognized prop on an OpenTUI element does not throw and does not warn.
 *
 * The reconciler's fallback branch is a bare `instance[propKey] = propValue`,
 * so `className="flex-1"` sets a dead field on a renderable and the layout
 * quietly stays wrong. `onClick` is worse: the handler is stored, never wired
 * to an event, and the button simply does nothing forever.
 *
 * TypeScript catches these when they are written directly on the element. It
 * stops catching them the moment the props go through a `style` object held in
 * a variable, which is how shared styles are normally written — excess-property
 * checking only applies to fresh object literals. This rule covers both, and
 * replaces "Property 'className' does not exist" with the prop to use instead.
 */
export default defineRule(
  {
    type: "problem",
    docs: {
      description: "Disallow web and CSS props that OpenTUI silently ignores.",
      url: "https://github.com/phall1/opentui-lint/blob/main/docs/rules/no-web-props.md",
    },
    schema: [
      {
        type: "object",
        properties: {
          allow: {
            type: "array",
            items: { type: "string" },
            description: "Prop names to permit, for custom renderables that really use them.",
          },
          checkUnknownProps: {
            type: "boolean",
            description:
              "Also report props absent from the element's own type. Off by default: " +
              "a custom renderable added with extend() can legitimately accept anything.",
          },
        },
        additionalProperties: false,
      },
    ],
  },
  (context) => {
    const options = context.options[0] ?? {}
    const allow = new Set<string>((options.allow as string[]) ?? [])
    const checkUnknownProps = options.checkUnknownProps === true

    function report(name: string, node: Node, elementLabel: string): void {
      const advice = advise(name)
      if (advice) {
        context.report({
          node,
          message:
            `\`${name}\` does nothing on ${elementLabel}. OpenTUI assigns unknown props straight onto the ` +
            `renderable, so there is no error at runtime — the value is simply never read. ${advice}`,
        })
        return
      }

      context.report({
        node,
        message:
          `\`${name}\` is not a prop of ${elementLabel}. OpenTUI assigns it to the renderable and never reads ` +
          `it, so this silently does nothing. Remove it, or register a renderable that accepts it with extend().`,
      })
    }

    function knownProps(element: string): ReadonlySet<string> | undefined {
      const facts = elementsFor(context.framework).elements[element]
      // An element the runtime has but the types do not carries no prop list,
      // so there is nothing to check it against.
      if (!facts || facts.props.length === 0) return undefined
      return new Set(facts.props)
    }

    return {
      JSXOpeningElement(node) {
        const element = elementName(node)
        if (!element || !isHostElement(element)) return
        if (!knowsElement(context.framework, element)) return // no-unknown-elements owns this
        if (context.extendedElements.has(element)) return

        const label = `<${element}>`
        const valid = knownProps(element)

        for (const attribute of (node.attributes ?? []) as Node[]) {
          const name = attributeName(attribute)
          if (!name || allow.has(name)) continue

          // Solid's sanctioned event syntax: `setProperty` routes any `on:x`
          // straight to `node.on("x", …)` on the renderable's emitter.
          if (context.framework === "solid" && name.startsWith("on:")) continue

          if (isWebNamespaced(name)) {
            context.report({
              node: attribute,
              message:
                `\`${name}\` does nothing on ${label}. Terminal cells carry no attributes; ` +
                `OpenTUI stores the value on the renderable and never reads it.`,
            })
            continue
          }

          if (name === "style") {
            const expression =
              attribute.value?.type === "JSXExpressionContainer" ? attribute.value.expression : undefined
            const object = resolveObjectExpression(context, expression)
            if (!object) continue
            for (const entry of objectEntries(object)) {
              if (allow.has(entry.key)) continue
              if (advise(entry.key) || (checkUnknownProps && valid && !valid.has(entry.key))) {
                report(entry.key, entry.node, `${label}'s style`)
              }
            }
            continue
          }

          if (advise(name) || (checkUnknownProps && valid && !valid.has(name))) {
            report(name, attribute, label)
          }
        }
      },
    }
  },
)
