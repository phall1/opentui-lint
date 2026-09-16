import type { Framework } from "../catalog/index.js"
import { knowsElement } from "../catalog/index.js"
import { failureText, failureVisible } from "../catalog/runtime.js"
import { elementName, isHostElement } from "../project/jsx.js"
import { defineRule } from "../project/rule.js"
import type { Node } from "../project/types.js"

/**
 * Elements that exist only after a registration call.
 *
 * `@opentui/qrcode` ships a renderable but does not add it to the catalogue on
 * import — you have to call `registerQRCode()`. Verified: importing the module
 * alone leaves `getComponentCatalogue()` without the key, and rendering the tag
 * throws `Unknown component type: qr-code`, which the React binding's
 * ErrorBoundary turns into a full-screen stack trace.
 *
 * The failure is identical to an unknown element, but the fix is completely
 * different — an import and a call, not a different tag — so it gets its own
 * rule and its own message rather than being lumped in with typos.
 *
 * A sweep of every `register*` export in the OpenTUI workspace found this is
 * the only package with the pattern: `@opentui/keymap`'s many `register*`
 * functions add keybindings rather than elements, `@opentui/three` has no JSX
 * surface at all, and `time-to-first-draw` self-registers on import.
 */

interface Registrable {
  /** Element name per binding. */
  element: Record<Framework, string>
  fn: string
  module: Record<Framework, string>
}

const REGISTRABLE: Registrable[] = [
  {
    element: { react: "qr-code", solid: "qr_code" },
    fn: "registerQRCode",
    module: { react: "@opentui/qrcode/react", solid: "@opentui/qrcode/solid" },
  },
]

export default defineRule(
  {
    type: "problem",
    docs: {
      description: "Require the registration call for elements that are not in the default catalogue.",
      url: "https://github.com/phall1/opentui-lint/blob/main/docs/rules/require-registration.md",
    },
    schema: [
      {
        type: "object",
        properties: {
          registered: {
            type: "array",
            items: { type: "string" },
            description: "Element names registered somewhere this file cannot see.",
          },
        },
        additionalProperties: false,
      },
    ],
  },
  (context) => {
    const preRegistered = new Set<string>((context.options[0]?.registered as string[]) ?? [])
    /** Registration functions this module calls. */
    const called = new Set<string>()
    const pending: Array<{ node: Node; entry: Registrable; name: string }> = []

    return {
      // The call usually sits at module top level, above the component — but
      // it can equally sit below it, so nothing is reported until the whole
      // file has been walked.
      CallExpression(node) {
        const callee = node.callee
        const name =
          callee?.type === "Identifier"
            ? callee.name
            : callee?.type === "MemberExpression" && callee.property?.type === "Identifier"
              ? callee.property.name
              : undefined
        if (typeof name === "string") called.add(name)
      },

      JSXOpeningElement(node) {
        const name = elementName(node)
        if (!name || !isHostElement(name)) return
        if (knowsElement(context.framework, name) || context.extendedElements.has(name)) return
        if (preRegistered.has(name)) return

        const entry = REGISTRABLE.find((candidate) => candidate.element[context.framework] === name)
        if (entry) pending.push({ node, entry, name })
      },

      "Program:exit"() {
        for (const { node, entry, name } of pending) {
          if (called.has(entry.fn)) continue
          const framework = context.framework
          context.report({
            node,
            message:
              `<${name}> is not in the default catalogue until ${entry.fn}() runs. ` +
              `Importing ${entry.module[framework]} is not enough — the call is what adds the element. ` +
              `Without it, rendering throws "${failureText(framework, "unknownElement", name)}" and ` +
              `${failureVisible(framework, "unknownElement")}. ` +
              `Add: import { ${entry.fn} } from "${entry.module[framework]}"  and call ${entry.fn}() once at startup.`,
          })
        }
      },
    }
  },
)
