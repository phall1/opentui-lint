import type { Framework } from "../catalog/index.js"
import { isTextNodeElement } from "../catalog/index.js"
import type { Node, RuleContext, Scope } from "./types.js"

/** `<box>` → "box", `<ascii-font>` → "ascii-font", `<Foo.Bar>` → "Foo.Bar". */
export function elementName(node: Node): string | undefined {
  const name = node.type === "JSXOpeningElement" || node.type === "JSXElement" ? (node.name ?? node.openingElement?.name) : node.name
  if (!name) return undefined
  if (name.type === "JSXIdentifier") return name.name as string
  if (name.type === "JSXNamespacedName") return `${name.namespace.name}:${name.name.name}`
  if (name.type === "JSXMemberExpression") return `${elementName(name.object) ?? "?"}.${name.property.name}`
  return undefined
}

/**
 * True for a host element rather than a component.
 *
 * JSX treats a lowercase tag as a string passed straight to the reconciler;
 * a capitalized tag is a value the module resolves itself. Only the former can
 * be checked against OpenTUI's element catalogue.
 */
export function isHostElement(name: string): boolean {
  const first = name[0]
  return first !== undefined && first === first.toLowerCase() && first !== first.toUpperCase()
}

/** The JSX element that encloses `node`, if any. */
export function parentElement(node: Node): Node | undefined {
  let current: Node | undefined = node.parent
  while (current) {
    if (current.type === "JSXElement") return current
    // A component boundary ends the chain: we cannot see through
    // `<box>{renderRow()}</box>` to whatever `renderRow` returns.
    if (
      current.type === "FunctionDeclaration" ||
      current.type === "FunctionExpression" ||
      current.type === "ArrowFunctionExpression"
    ) {
      return undefined
    }
    current = current.parent
  }
  return undefined
}

export type TextContext =
  | { inside: true; via: string }
  | { inside: false; boundary: string | undefined; crossedComponent: boolean }

/**
 * Walks outward looking for the `<text>` subtree the reconciler requires.
 *
 * `createTextInstance` throws unless its host context is inside a text node, so
 * this answers the question that decides whether a string child renders or
 * takes the whole app down. A component boundary makes the answer unknowable,
 * and the caller must treat that as "do not report".
 */
export function textContext(node: Node, framework: Framework): TextContext {
  let current: Node | undefined = node.parent

  while (current) {
    // The nearest enclosing element *is* the runtime parent, so it settles the
    // question on its own — an outer `<text>` cannot re-establish text context
    // through a `<box>` in between.
    if (current.type === "JSXElement") {
      const name = elementName(current.openingElement)
      if (name && (name === "text" || isTextNodeElement(framework, name))) {
        return { inside: true, via: name }
      }
      return { inside: false, boundary: name, crossedComponent: false }
    }

    // Fragments are transparent: they contribute no renderable of their own.
    if (current.type === "JSXFragment") {
      current = current.parent
      continue
    }

    // Reaching a function without having found an element means this JSX is a
    // component's return value, and where that component gets mounted decides
    // the answer. Unknowable, so the caller must stay quiet.
    if (
      current.type === "FunctionDeclaration" ||
      current.type === "FunctionExpression" ||
      current.type === "ArrowFunctionExpression" ||
      current.type === "Program"
    ) {
      return { inside: false, boundary: undefined, crossedComponent: true }
    }

    current = current.parent
  }
  return { inside: false, boundary: undefined, crossedComponent: true }
}

/**
 * Whether an expression definitely evaluates to text the reconciler will turn
 * into a text instance.
 *
 * Kept deliberately narrow. Without type information `{label}` could be a
 * string or an element, and a linter that guesses wrong on that is a linter
 * people turn off — so only statically evident text counts.
 */
export function isDefinitelyText(node: Node | undefined | null): boolean {
  if (!node) return false
  switch (node.type) {
    case "Literal":
      return typeof node.value === "string" || typeof node.value === "number"
    case "TemplateLiteral":
      return true
    case "BinaryExpression":
      // String concatenation; `1 + 2` is also text once rendered.
      return node.operator === "+" && (isDefinitelyText(node.left) || isDefinitelyText(node.right))
    case "ConditionalExpression":
      return isDefinitelyText(node.consequent) && isDefinitelyText(node.alternate)
    case "LogicalExpression":
      // `{flag && "on"}` renders "on" when truthy and nothing otherwise.
      return (node.operator === "&&" || node.operator === "??") && isDefinitelyText(node.right)
    case "CallExpression": {
      const callee = node.callee
      if (callee?.type === "Identifier" && callee.name === "String") return true
      if (callee?.type === "MemberExpression" && callee.property?.type === "Identifier") {
        return ["toString", "toFixed", "join", "padStart", "padEnd", "trim", "toUpperCase", "toLowerCase"].includes(
          callee.property.name,
        )
      }
      return false
    }
    case "TSAsExpression":
    case "TSNonNullExpression":
      return isDefinitelyText(node.expression)
    default:
      return false
  }
}

/** The static string behind an attribute value, when there is one. */
export function staticString(value: Node | undefined | null): string | undefined {
  if (!value) return undefined
  if (value.type === "Literal") return typeof value.value === "string" ? value.value : undefined
  if (value.type === "JSXExpressionContainer") return staticString(value.expression)
  if (value.type === "TemplateLiteral" && value.expressions?.length === 0) {
    return value.quasis?.[0]?.value?.cooked as string | undefined
  }
  if (value.type === "TSAsExpression") return staticString(value.expression)
  return undefined
}

/**
 * Every statically-known string an attribute value can take.
 *
 * `bg={active ? "indigo" : "transparent"}` is the normal way to write a
 * conditional style, and checking only whole-expression literals would miss
 * both branches of it.
 */
export function staticStrings(value: Node | undefined | null): string[] {
  if (!value) return []
  if (value.type === "JSXExpressionContainer") return staticStrings(value.expression)
  if (value.type === "TSAsExpression") return staticStrings(value.expression)
  if (value.type === "ConditionalExpression") {
    return [...staticStrings(value.consequent), ...staticStrings(value.alternate)]
  }
  if (value.type === "LogicalExpression") {
    return [...staticStrings(value.left), ...staticStrings(value.right)]
  }
  const single = staticString(value)
  return single === undefined ? [] : [single]
}

/** The static number behind an attribute value, when there is one. */
export function staticNumber(value: Node | undefined | null): number | undefined {
  if (!value) return undefined
  if (value.type === "Literal") return typeof value.value === "number" ? value.value : undefined
  if (value.type === "JSXExpressionContainer") return staticNumber(value.expression)
  if (value.type === "UnaryExpression" && value.operator === "-") {
    const inner = staticNumber(value.argument)
    return inner === undefined ? undefined : -inner
  }
  if (value.type === "TSAsExpression") return staticNumber(value.expression)
  return undefined
}

export function attributeName(attribute: Node): string | undefined {
  if (attribute.type !== "JSXAttribute") return undefined
  const name = attribute.name
  if (name?.type === "JSXIdentifier") return name.name as string
  if (name?.type === "JSXNamespacedName") return `${name.namespace.name}:${name.name.name}`
  return undefined
}

/**
 * Follows an identifier back to the object literal it was declared with.
 *
 * The type checker loses excess-property checking the moment a style object is
 * hoisted into a `const`, which is exactly how shared styles get written — so
 * the rules that inspect style objects have to make that hop themselves.
 */
export function resolveObjectExpression(context: RuleContext, node: Node | undefined): Node | undefined {
  if (!node) return undefined
  if (node.type === "ObjectExpression") return node
  if (node.type === "TSAsExpression") return resolveObjectExpression(context, node.expression)
  if (node.type !== "Identifier") return undefined

  let scope: Scope | undefined | null = context.sourceCode.getScope?.(node)
  while (scope) {
    for (const reference of scope.references) {
      if (reference.identifier !== node || !reference.resolved) continue
      for (const def of reference.resolved.defs) {
        if (def.type !== "Variable") continue
        const init = def.node?.init
        // Only `const` is safe to follow; a `let` may be reassigned.
        if (def.node?.parent?.kind !== "const") continue
        const resolved = resolveObjectExpression(context, init)
        if (resolved) return resolved
      }
    }
    scope = scope.upper
  }
  return undefined
}

/** Static `key: value` pairs of an object literal, ignoring spreads. */
export function objectEntries(object: Node): Array<{ key: string; valueNode: Node; node: Node }> {
  const entries: Array<{ key: string; valueNode: Node; node: Node }> = []
  for (const property of (object.properties ?? []) as Node[]) {
    if (property.type !== "Property" || property.computed) continue
    const key =
      property.key?.type === "Identifier"
        ? (property.key.name as string)
        : property.key?.type === "Literal" && typeof property.key.value === "string"
          ? property.key.value
          : undefined
    if (key) entries.push({ key, valueNode: property.value, node: property })
  }
  return entries
}
