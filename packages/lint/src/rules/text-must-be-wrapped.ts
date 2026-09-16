import { isDefinitelyText, textContext } from "../project/jsx.js"
import { defineRule } from "../project/rule.js"

/**
 * `<box>Hello</box>` is the single most common way an OpenTUI app dies.
 *
 * Every binding's `createTextInstance` throws "Text must be created inside of a
 * text node" unless the host context is a `<text>` subtree. TypeScript cannot
 * help: `BoxProps["children"]` is `React.ReactNode`, which includes `string`.
 *
 * The rule only reports text it can prove statically — a literal, a template
 * literal, a concatenation. `{label}` could be a string or an element, and
 * guessing there would make the rule untrustworthy.
 */
export default defineRule(
  {
    type: "problem",
    docs: {
      description: "Require string and number children to sit inside <text>.",
      url: "https://github.com/phall1/opentui-lint/blob/main/docs/rules/text-must-be-wrapped.md",
    },
    schema: [],
    hasSuggestions: true,
  },
  (context) => {
    const report = (
      node: { [key: string]: any; type: string },
      label: string,
      source: string,
      parent: string | undefined,
    ) => {
      const where = parent ? `<${parent}>` : "a non-text element"
      context.report({
        node,
        message:
          `${label} renders as a text node, and OpenTUI throws ` +
          `"Text must be created inside of a text node" when one is created outside <text>. ` +
          `TypeScript allows it because children are typed as ReactNode. ` +
          `Wrap it: ${where} → <text>${source}</text>.`,
        suggest: [
          {
            desc: "Wrap in <text>",
            fix: (fixer) => fixer.replaceText(node, `<text>${context.sourceCode.getText(node)}</text>`),
          },
        ],
      })
    }

    return {
      JSXText(node) {
        // JSX drops whitespace-only text between elements, so only real content
        // reaches the reconciler.
        const content = String(node.value ?? "")
        if (content.trim() === "") return

        const enclosing = textContext(node, context.framework)
        if (enclosing.inside || enclosing.crossedComponent) return

        const trimmed = content.trim()
        report(node, JSON.stringify(trimmed), trimmed, enclosing.boundary)
      },

      JSXExpressionContainer(node) {
        if (node.parent?.type !== "JSXElement" && node.parent?.type !== "JSXFragment") return
        if (!isDefinitelyText(node.expression)) return

        const enclosing = textContext(node, context.framework)
        if (enclosing.inside || enclosing.crossedComponent) return

        const source = context.sourceCode.getText(node)
        report(node, source, source, enclosing.boundary)
      },
    }
  },
)
