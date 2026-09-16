import type { Framework } from "../catalog/index.js"
import { isTextNodeElement } from "../catalog/index.js"
import { elementName, isDefinitelyText } from "./jsx.js"
import type { Fixer, Node, RuleContext } from "./types.js"

/**
 * Renames a host element, both tags.
 *
 * `<div>x</div>` → `<box>x</box>`. Self-closing elements have no closing tag,
 * and the opening tag's name node is replaced rather than the whole tag so
 * attributes and formatting survive untouched.
 */
export function renameElement(element: Node, next: string, fixer: Fixer): unknown[] {
  const fixes: unknown[] = []
  const opening = element.openingElement ?? element
  if (opening?.name) fixes.push(fixer.replaceText(opening.name, next))
  if (element.closingElement?.name) fixes.push(fixer.replaceText(element.closingElement.name, next))
  return fixes
}

/** Renames a JSX attribute, leaving its value alone. */
export function renameAttribute(attribute: Node, next: string, fixer: Fixer): unknown {
  return fixer.replaceText(attribute.name, next)
}

/** Replaces a string attribute value, preserving the expression-vs-literal form. */
export function replaceStringValue(valueNode: Node, next: string, fixer: Fixer): unknown {
  if (valueNode.type === "Literal") return fixer.replaceText(valueNode, JSON.stringify(next))
  if (valueNode.type === "JSXExpressionContainer") {
    return fixer.replaceText(valueNode, `{${JSON.stringify(next)}}`)
  }
  return fixer.replaceText(valueNode, JSON.stringify(next))
}

/**
 * An extra source of proof that a child renders as text.
 *
 * Supplied by `text-must-be-wrapped` when `checkTypes` is on, so an expression
 * the type checker proved is text counts here too. Without this the type-aware
 * tier could report `<box>{label}</box>` but never fix it — and the cases only
 * types can see are exactly the ones hardest to fix by hand.
 */
export type ExtraTextProof = (child: Node) => boolean

/** True when a child becomes a text node rather than a renderable. */
function isTextish(child: Node, framework: Framework, proven?: ExtraTextProof): boolean {
  if (child.type === "JSXText") return String(child.value ?? "").trim() !== ""
  if (child.type === "JSXExpressionContainer") {
    return isDefinitelyText(child.expression) || proven?.(child) === true
  }
  if (child.type === "JSXElement") {
    const name = elementName(child.openingElement)
    return name !== undefined && isTextNodeElement(framework, name)
  }
  return false
}

/** Whitespace between two text children is meaningful and stays inside the run. */
function isInterstitialWhitespace(child: Node): boolean {
  return child.type === "JSXText" && String(child.value ?? "").trim() === ""
}

export interface TextRun {
  /** Children in the run, in source order. */
  nodes: Node[]
  first: Node
  last: Node
  /**
   * True when an expression we cannot type sits directly against this run.
   *
   * `<box>{count.length} items</box>` is the shape that matters: " items" is
   * provably text, `{count.length}` is not. Wrapping only the half we are sure
   * about would split one rendered line into two renderables and leave the
   * other half still crashing — so the caller must offer that fix rather than
   * apply it, and let a person decide where the `<text>` really goes.
   */
  ambiguousNeighbor: boolean
}

/**
 * Groups an element's children into maximal runs of text.
 *
 * Grouping is the whole reason this exists. Wrapping each stray child on its
 * own turns `<box>Total: <b>7</b></box>` into two sibling `<text>` renderables,
 * and since a box lays out as a column by default, that silently moves "7" onto
 * its own line. Wrapping the run as a unit keeps it one line, which is what the
 * author wrote.
 */
/**
 * An expression whose runtime type cannot be pinned down.
 *
 * With `checkTypes` on, an expression the checker resolved is no longer
 * ambiguous — which is what lets `<box>{count.length} items</box>` become a
 * real fix instead of a suggestion.
 */
function isAmbiguousExpression(child: Node | undefined, proven?: ExtraTextProof): boolean {
  if (child?.type !== "JSXExpressionContainer") return false
  return !isDefinitelyText(child.expression) && proven?.(child) !== true
}

export function textRuns(element: Node, framework: Framework, proven?: ExtraTextProof): TextRun[] {
  const children = (element.children ?? []) as Node[]
  const collected: Array<{ nodes: Node[]; start: number; end: number }> = []
  let current: Node[] = []
  let start = -1
  let end = -1
  let pendingWhitespace: Node[] = []

  const flush = () => {
    if (current.length > 0) collected.push({ nodes: current, start, end })
    current = []
    start = -1
    end = -1
    pendingWhitespace = []
  }

  children.forEach((child, index) => {
    if (isTextish(child, framework, proven)) {
      // Whitespace only joins a run once there is text on both sides of it.
      if (current.length > 0) current.push(...pendingWhitespace)
      pendingWhitespace = []
      if (current.length === 0) start = index
      current.push(child)
      end = index
      return
    }
    if (isInterstitialWhitespace(child)) {
      pendingWhitespace.push(child)
      return
    }
    flush()
  })
  flush()

  /** Whitespace between a run and its neighbour does not separate them. */
  const neighbour = (from: number, step: number): Node | undefined => {
    for (let i = from; i >= 0 && i < children.length; i += step) {
      const child = children[i]!
      if (!isInterstitialWhitespace(child)) return child
    }
    return undefined
  }

  return collected.map((run) => ({
    nodes: run.nodes,
    first: run.nodes[0]!,
    last: run.nodes[run.nodes.length - 1]!,
    ambiguousNeighbor:
      isAmbiguousExpression(neighbour(run.start - 1, -1), proven) ||
      isAmbiguousExpression(neighbour(run.end + 1, 1), proven),
  }))
}

/** The run containing `child`, if any. */
export function runContaining(runs: TextRun[], child: Node): TextRun | undefined {
  return runs.find((run) => run.nodes.includes(child))
}

/**
 * Wraps a run in `<text>…</text>`.
 *
 * Only ever produced for the run's first offending child, so two rules firing
 * on the same run cannot emit two overlapping fixes for it.
 */
export function wrapRun(context: RuleContext, run: TextRun, fixer: Fixer): unknown {
  let start = run.first.range?.[0]
  let end = run.last.range?.[1]
  if (start === undefined || end === undefined) return null

  // A JSXText child carries the newline and indentation around it. Leaving
  // those inside the wrapper yields `<text> label\n      </text>`, so the range
  // is tightened onto the visible characters first.
  const source = context.sourceCode.getText()
  while (start < end && /\s/.test(source[start]!)) start += 1
  while (end > start && /\s/.test(source[end - 1]!)) end -= 1
  if (start >= end) return null

  return fixer.replaceTextRange([start, end], `<text>${source.slice(start, end)}</text>`)
}

/**
 * Removes a JSX attribute along with the whitespace that preceded it.
 *
 * Without swallowing that whitespace, deleting a prop leaves a double space in
 * the tag, and a fix that reformats the code around it is a fix people stop
 * trusting.
 */
export function removeAttribute(context: RuleContext, attribute: Node, fixer: Fixer): unknown {
  const range = attribute.range as [number, number] | undefined
  if (!range) return null
  const source = context.sourceCode.getText()
  let start = range[0]
  while (start > 0 && /\s/.test(source[start - 1]!)) start -= 1
  return fixer.replaceTextRange([start, range[1]], "")
}
