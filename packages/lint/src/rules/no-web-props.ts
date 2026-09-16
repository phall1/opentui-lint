import { CSS_ONLY_PROPS, PROP_RENAME, WEB_ONLY_PROPS, elementsFor, knowsElement } from "../catalog/index.js"
import { removeAttribute, renameAttribute } from "../project/fixes.js"
import {
  attributeName,
  elementName,
  isHostElement,
  objectEntries,
  resolveObjectExpression,
} from "../project/jsx.js"
import { defineRule } from "../project/rule.js"
import type { Fixer, Node } from "../project/types.js"

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
    fixable: "code",
    hasSuggestions: true,
  },
  (context) => {
    const options = context.options[0] ?? {}
    const allow = new Set<string>((options.allow as string[]) ?? [])
    const checkUnknownProps = options.checkUnknownProps === true

    /** Attribute-only: a key inside a style object is not removable this way. */
    function removable(node: Node) {
      return node.type === "JSXAttribute"
        ? {
            suggest: [
              {
                desc: `Remove \`${attributeName(node) ?? "it"}\``,
                fix: (fixer: Fixer) => removeAttribute(context, node, fixer),
              },
            ],
          }
        : {}
    }

    function report(name: string, node: Node, elementLabel: string, accepts?: ReadonlySet<string>): void {
      // Only rename when the target really is a prop of this element. `src`
      // becomes `source` on <image>, but on a <box> neither name means
      // anything and renaming would just move the problem.
      const rename = PROP_RENAME[name]
      if (rename && node.type === "JSXAttribute" && (!accepts || accepts.has(rename))) {
        context.report({
          node,
          message:
            `\`${name}\` does nothing on ${elementLabel}. OpenTUI assigns unknown props straight onto the ` +
            `renderable, so there is no error at runtime — the value is simply never read. ` +
            `The OpenTUI name is \`${rename}\`.`,
          fix: (fixer) => renameAttribute(node, rename, fixer),
        })
        return
      }

      const advice = advise(name)
      if (advice) {
        context.report({
          node,
          message:
            `\`${name}\` does nothing on ${elementLabel}. OpenTUI assigns unknown props straight onto the ` +
            `renderable, so there is no error at runtime — the value is simply never read. ${advice}`,
          ...removable(node),
        })
        return
      }

      context.report({
        node,
        message:
          `\`${name}\` is not a prop of ${elementLabel}. OpenTUI assigns it to the renderable and never reads ` +
          `it, so this silently does nothing. Remove it, or register a renderable that accepts it with extend().`,
        ...removable(node),
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
              ...removable(attribute),
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

          // An element's own catalogue wins over the advice table. `title` is
          // real on <box> and <scrollbox> — it sets the border title, which
          // this rule's own advice text says — and reporting it as dead was
          // the single largest source of false positives when the rules were
          // first run over OpenTUI's own examples.
          if (valid?.has(name)) continue

          if (PROP_RENAME[name] || advise(name) || (checkUnknownProps && valid && !valid.has(name))) {
            report(name, attribute, label, valid)
          }
        }
      },
    }
  },
)
