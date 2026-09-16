import { isTextNodeElement } from "../catalog/index.js"
import { failureText, failureVisible } from "../catalog/runtime.js"
import { elementName, textContext } from "../project/jsx.js"
import { defineRule } from "../project/rule.js"

/**
 * `<b>`, `<span>` and friends are text *nodes*, not renderables.
 *
 * They construct a `TextNodeRenderable` that only a `TextRenderable` knows how
 * to lay out, so the reconciler refuses them anywhere else:
 * `Component of type "b" must be created inside of a text node`.
 *
 * The names overlap with HTML, which is exactly the trap — an agent that writes
 * `<span className="badge">` gets a type error on the prop and no warning at
 * all about the placement, and a `<b>Total</b>` on its own typechecks cleanly
 * and then takes down the render.
 *
 * Unlike the string case this is fully decidable: element names are static.
 */
export default defineRule(
  {
    type: "problem",
    docs: {
      description: "Require text modifier elements to sit inside <text>.",
      url: "https://github.com/phall1/opentui-lint/blob/main/docs/rules/no-orphan-text-nodes.md",
    },
    schema: [],
  },
  (context) => ({
    JSXOpeningElement(node) {
      const name = elementName(node)
      if (!name || !isTextNodeElement(context.framework, name)) return

      // Start the walk above this element: an element is not its own context,
      // and every text modifier would otherwise satisfy the check itself.
      const enclosing = textContext(node.parent ?? node, context.framework)
      if (enclosing.inside) return
      // Through a component boundary we cannot see the `<text>` that may well
      // be wrapping this, so stay quiet rather than guess.
      if (enclosing.crossedComponent) return

      const where = enclosing.boundary ? `directly inside <${enclosing.boundary}>` : "at the top of the tree"
      context.report({
        node,
        message:
          `<${name}> is a text modifier, not a renderable, and it is ${where}. ` +
          `@opentui/${context.framework} throws ` +
          `"${failureText(context.framework, "textNodeOutsideText", name)}" and ` +
          `${failureVisible(context.framework, "textNodeOutsideText")}. ` +
          `Put it inside <text>: <text><${name}>…</${name}></text>.`,
      })
    },
  }),
)
