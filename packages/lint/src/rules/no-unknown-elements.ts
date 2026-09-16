import {
  crossFrameworkName,
  domEquivalent,
  elementsFor,
  isDomElement,
  knowsElement,
  suggestElement,
} from "../catalog/index.js"
import { elementName, isHostElement } from "../project/jsx.js"
import { defineRule } from "../project/rule.js"

/**
 * The flagship rule.
 *
 * `JSX.IntrinsicElements` in both OpenTUI bindings carries a string index
 * signature (from `ExtendedIntrinsicElements`, which exists so `extend()` can
 * add custom renderables). The side effect is that *every* lowercase tag
 * typechecks. On top of that, the React binding's interface extends
 * `React.JSX.IntrinsicElements`, so all 164 HTML element names are in scope
 * with their full DOM prop types.
 *
 * At render the reconciler looks the tag up in its catalogue and throws
 * `Unknown component type: div`. The binding wraps the tree in an
 * ErrorBoundary, so what the developer actually sees is their app replaced by
 * a red reconciler stack trace — no file, no line, no hint.
 */
export default defineRule(
  {
    type: "problem",
    docs: {
      description: "Disallow JSX elements OpenTUI cannot render.",
      url: "https://github.com/phall1/opentui-lint/blob/main/docs/rules/no-unknown-elements.md",
    },
    schema: [
      {
        type: "object",
        properties: {
          allow: {
            type: "array",
            items: { type: "string" },
            description: "Extra element names to treat as valid.",
          },
        },
        additionalProperties: false,
      },
    ],
  },
  (context) => {
    const allow = new Set<string>((context.options[0]?.allow as string[]) ?? [])

    return {
      JSXOpeningElement(node) {
        const name = elementName(node)
        if (!name || !isHostElement(name)) return
        if (allow.has(name) || context.extendedElements.has(name)) return
        if (knowsElement(context.framework, name)) return

        const other = context.framework === "react" ? "solid" : "react"

        // Ordered most-specific first: a wrong-framework spelling and an HTML
        // tag are different mistakes and deserve different instructions.
        const renamed = crossFrameworkName(context.framework, name)
        if (renamed) {
          context.report({
            node,
            message:
              `<${name}> is the @opentui/${other} spelling. ` +
              `This file renders with @opentui/${context.framework}, which calls it <${renamed}>. ` +
              `Rendering <${name}> throws "Unknown component type: ${name}".`,
          })
          return
        }

        if (isDomElement(context.framework, name)) {
          const replacement = domEquivalent(name)
          context.report({
            node,
            message:
              `<${name}> is an HTML element and OpenTUI has no renderable for it. ` +
              `It only typechecks because @opentui/react's JSX namespace extends React's DOM elements; ` +
              `at render it throws "Unknown component type: ${name}" and the ErrorBoundary replaces your app ` +
              `with a stack trace. ` +
              (replacement ? `Use <${replacement}>.` : `Use <box> for layout and <text> for content.`),
          })
          return
        }

        const suggestion = suggestElement(context.framework, name)
        const catalogue = Object.keys(elementsFor(context.framework).elements)
          .filter((element) => !elementsFor(context.framework).elements[element]!.textNode)
          .join(", ")

        context.report({
          node,
          message:
            `<${name}> is not in the @opentui/${context.framework} catalogue, so it throws ` +
            `"Unknown component type: ${name}" at render. ` +
            (suggestion
              ? `Did you mean <${suggestion}>?`
              : `Available elements: ${catalogue}. ` +
                `Register a custom renderable with extend({ ${name}: MyRenderable }) if it is your own.`),
        })
      },
    }
  },
)
