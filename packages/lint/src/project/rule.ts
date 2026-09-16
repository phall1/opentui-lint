import type { Framework } from "../catalog/index.js"
import { detectFramework, readSettings } from "./framework.js"
import type { Node, ReportDescriptor, RuleContext, RuleModule } from "./types.js"

export interface OpenTuiRuleContext extends RuleContext {
  framework: Framework
  /** Element names the project registered with `extend()`. */
  extendedElements: ReadonlySet<string>
}

type Handlers = Record<string, (node: Node) => void>

/**
 * Wraps a rule so it only ever runs on files that render to a terminal, and so
 * every diagnostic can carry the project's own note.
 *
 * Rules receive a resolved `framework` instead of detecting it themselves,
 * which keeps the "should this file be linted at all" decision in exactly one
 * place — see `framework.ts` for why that matters.
 */
export function defineRule(
  meta: RuleModule["meta"],
  create: (context: OpenTuiRuleContext) => Handlers,
): RuleModule {
  return {
    meta,
    create(context) {
      let framework: Framework | null = null
      const extendedElements = new Set<string>()
      const note = readSettings(context).note

      // Delegation rather than a Proxy: ESLint hands rules a frozen context
      // with non-configurable properties, which a Proxy `get` trap is not
      // allowed to reinterpret. Inheriting from it keeps every original
      // property readable while letting us add our own on top.
      const ruleContext: OpenTuiRuleContext = Object.create(context, {
        framework: { get: () => framework, enumerable: true },
        extendedElements: { get: () => extendedElements, enumerable: true },
        report: {
          value: (descriptor: ReportDescriptor) => {
            context.report(note ? { ...descriptor, message: `${descriptor.message} ${note}` } : descriptor)
          },
          enumerable: true,
        },
      })

      const handlers = create(ruleContext)
      const gated: Handlers = {}

      for (const [selector, handler] of Object.entries(handlers)) {
        gated[selector] = (node) => {
          if (framework === null) return
          handler(node)
        }
      }

      // Runs before any gated handler, so `framework` is resolved by the time
      // the first JSX node is visited.
      const userProgram = handlers["Program"]
      gated["Program"] = (node) => {
        framework = detectFramework(context, node)
        for (const name of readSettings(context).extendedElements ?? []) extendedElements.add(name)
        collectExtendCalls(node, extendedElements)
        if (framework !== null) userProgram?.(node)
      }

      return gated
    },
  }
}

/**
 * Finds element names the project added to the runtime catalogue.
 *
 * `extend({ sparkline: SparklineRenderable })` makes `<sparkline>` a perfectly
 * valid tag, and a linter that does not read those calls would report every
 * custom renderable in the project as unknown.
 */
function collectExtendCalls(program: Node, into: Set<string>): void {
  const visit = (node: Node | undefined): void => {
    if (!node || typeof node.type !== "string") return

    if (
      node.type === "CallExpression" &&
      ((node.callee?.type === "Identifier" && node.callee.name === "extend") ||
        (node.callee?.type === "MemberExpression" && node.callee.property?.name === "extend"))
    ) {
      const argument = node.arguments?.[0]
      if (argument?.type === "ObjectExpression") {
        for (const property of argument.properties as Node[]) {
          if (property.type !== "Property" || property.computed) continue
          const key =
            property.key?.type === "Identifier"
              ? property.key.name
              : property.key?.type === "Literal"
                ? property.key.value
                : undefined
          if (typeof key === "string") into.add(key)
        }
      }
    }

    for (const key of Object.keys(node)) {
      if (key === "parent") continue
      const child = node[key]
      if (Array.isArray(child)) child.forEach((c) => visit(c as Node))
      else if (child && typeof child === "object" && typeof (child as Node).type === "string") visit(child as Node)
    }
  }
  visit(program)
}
