import { CATALOG_VERSION, FRAMEWORKS, NAMED_COLORS, COLOR_PROPS, SPACING_PROPS } from "./generated.js"
import type { ElementFacts, FrameworkFacts } from "./generated.js"

export { CATALOG_VERSION, FRAMEWORKS, NAMED_COLORS, COLOR_PROPS, SPACING_PROPS }
export type { ElementFacts, FrameworkFacts }

export type Framework = "react" | "solid"

const NAMED_COLOR_SET = new Set<string>(NAMED_COLORS.map((name) => name.toLowerCase()))
const COLOR_PROP_SET = new Set<string>(COLOR_PROPS)
const SPACING_PROP_SET = new Set<string>(SPACING_PROPS)

export function isColorProp(name: string): boolean {
  return COLOR_PROP_SET.has(name)
}

export function isSpacingProp(name: string): boolean {
  return SPACING_PROP_SET.has(name)
}

export function elementsFor(framework: Framework): FrameworkFacts {
  return FRAMEWORKS[framework]
}

export function knowsElement(framework: Framework, name: string): boolean {
  return name in FRAMEWORKS[framework].elements
}

export function isTextNodeElement(framework: Framework, name: string): boolean {
  return FRAMEWORKS[framework].elements[name]?.textNode === true
}

/**
 * Every HTML element name, taken from React's DOM types.
 *
 * Used for both bindings, not just React. Solid's `JSX.IntrinsicElements` does
 * not inherit the DOM elements, so its `domLeaks` list is empty — but its
 * string index signature lets `<div>` through the checker all the same, and an
 * agent reaching for `<div>` in a Solid file has made exactly the same mistake
 * and needs exactly the same answer.
 */
const HTML_ELEMENTS = new Set<string>(FRAMEWORKS.react.domLeaks)

export function isDomElement(name: string): boolean {
  return HTML_ELEMENTS.has(name)
}

/** True when JSX accepts the name only because of the DOM types it inherits. */
export function isInheritedDomElement(framework: Framework, name: string): boolean {
  return FRAMEWORKS[framework].domLeaks.includes(name)
}

/**
 * What a web developer reaches for, and what OpenTUI actually renders.
 *
 * These pairings are advisory text in diagnostics, so an agent that wrote
 * `<div>` is told to write `<box>` instead of being left to guess.
 */
const DOM_EQUIVALENTS: Record<string, string> = {
  div: "box",
  section: "box",
  article: "box",
  aside: "box",
  main: "box",
  header: "box",
  footer: "box",
  nav: "box",
  form: "box",
  fieldset: "box",
  figure: "box",
  p: "text",
  h1: "text (or ascii-font for a banner)",
  h2: "text",
  h3: "text",
  h4: "text",
  h5: "text",
  h6: "text",
  label: "text",
  li: "text",
  td: "text",
  th: "text",
  pre: "code",
  button: "box with onMouseDown, or a Button recipe",
  ul: "box",
  ol: "box",
  table: "box",
  tr: "box",
  img: "image",
  picture: "image",
  video: "image",
  hr: "box with border",
  small: "text",
  blockquote: "text",
  code: "code",
  textarea: "textarea",
  select: "select",
  option: "an option object on <select>",
  canvas: "a FrameBuffer renderable",
  iframe: "box",
}

export function domEquivalent(name: string): string | undefined {
  return DOM_EQUIVALENTS[name]
}

/** The same element under the other framework's naming convention, if any. */
export function crossFrameworkName(framework: Framework, name: string): string | undefined {
  const other: Framework = framework === "react" ? "solid" : "react"
  // React hyphenates compound names (`ascii-font`); Solid uses underscores.
  const translated = framework === "react" ? name.replace(/_/g, "-") : name.replace(/-/g, "_")
  if (translated === name) return undefined
  if (!knowsElement(framework, translated)) return undefined
  return knowsElement(other, name) ? translated : undefined
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0
  const rows = a.length + 1
  const cols = b.length + 1
  let previous = Array.from({ length: cols }, (_, i) => i)
  for (let i = 1; i < rows; i++) {
    const current = [i, ...Array<number>(cols - 1).fill(0)]
    for (let j = 1; j < cols; j++) {
      const substitution = previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, substitution)
    }
    previous = current
  }
  return previous[cols - 1]!
}

/** Closest match from `candidates`, or undefined when nothing is close enough. */
export function closest(value: string, candidates: Iterable<string>): string | undefined {
  const needle = value.toLowerCase()
  let best: string | undefined
  let bestDistance = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    const distance = editDistance(needle, candidate.toLowerCase())
    if (distance < bestDistance) {
      bestDistance = distance
      best = candidate
    }
  }
  // Allow roughly one edit per three characters before calling it a typo.
  return bestDistance <= Math.max(1, Math.floor(needle.length / 3)) ? best : undefined
}

export function suggestElement(framework: Framework, name: string): string | undefined {
  return closest(name, Object.keys(FRAMEWORKS[framework].elements))
}

export function suggestColor(value: string): string | undefined {
  return closest(value, NAMED_COLORS)
}

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

export type ColorVerdict =
  | { kind: "ok" }
  | { kind: "malformed-hex" }
  | { kind: "css-function"; fn: string }
  | { kind: "unknown-name" }

/**
 * Mirrors `parseColor()`'s accept/reject decision for a literal string.
 *
 * OpenTUI does not throw on a color it cannot read: it logs a warning and
 * returns opaque magenta, so the only signal at runtime is a wrong color on
 * screen. `ColorInput` is `string | RGBA`, so the type checker never looks.
 */
export function checkColor(value: string): ColorVerdict {
  const normalized = value.trim()
  if (normalized.toLowerCase() === "transparent") return { kind: "ok" }
  if (NAMED_COLOR_SET.has(normalized.toLowerCase())) return { kind: "ok" }
  if (normalized.startsWith("#")) return HEX.test(normalized) ? { kind: "ok" } : { kind: "malformed-hex" }
  const fn = /^([a-z]+)\s*\(/i.exec(normalized)
  if (fn) return { kind: "css-function", fn: fn[1]! }
  return { kind: "unknown-name" }
}

/** Web-only props that survive into a renderable and then do nothing at all. */
export const WEB_ONLY_PROPS: Record<string, string> = {
  className: "OpenTUI has no class names. Set the layout and color props directly.",
  class: "OpenTUI has no class names. Set the layout and color props directly.",
  htmlFor: "There are no form labels to associate in a terminal.",
  tabIndex: "Use `focused` and the focus APIs instead.",
  role: "Terminals have no accessibility tree.",
  onClick: "Use `onMouseDown`, or `onSelect` on an interactive element.",
  onDoubleClick: "Use `onMouseDown` and track clicks yourself.",
  onMouseEnter: "Use `onMouseOver`.",
  onMouseLeave: "Use `onMouseOut`.",
  onMouseWheel: "Use `onMouseScroll`.",
  onFocus: "Use the `focused` prop, or the `useFocus` hook.",
  onBlur: "Use the `focused` prop, or the `useBlur` hook.",
  src: "Use `source` on <image>.",
  alt: "Terminals have no alt text.",
  title: "On <box> this sets the border title; elsewhere it does nothing.",
  hidden: "Use `visible={false}`.",
  disabled: "Not a core renderable prop; recipes implement it themselves.",
}

/**
 * CSS properties with no OpenTUI equivalent. A terminal cell grid has no
 * sub-cell geometry, so these are silently assigned and silently ignored.
 */
export const CSS_ONLY_PROPS: Record<string, string> = {
  display: "Layout is always flex. Use `flexDirection`, or `visible={false}` to hide.",
  borderRadius: "Border corners come from `borderStyle` (\"rounded\" is available).",
  boxShadow: "Cells cannot cast shadows.",
  textShadow: "Cells cannot cast shadows.",
  fontSize: "Every cell is one character.",
  fontFamily: "The terminal owns the font.",
  fontWeight: "Use `<b>` inside <text>, or the `attributes` prop.",
  fontStyle: "Use `<i>` inside <text>, or the `attributes` prop.",
  textTransform: "Transform the string before rendering it.",
  letterSpacing: "Cells are a fixed grid.",
  lineHeight: "One line is one row.",
  cursor: "The terminal owns the cursor shape.",
  transition: "Use a timeline from `useTimeline` instead.",
  transform: "Not supported. Position with `top`/`left` and `position=\"absolute\"`.",
  boxSizing: "Padding and borders always sit inside the box.",
  outline: "Use `border` and `focusedBorderColor`.",
  float: "Layout is always flex.",
  gridTemplateColumns: "There is no grid layout. Nest boxes with `flexDirection`.",
  gridTemplateRows: "There is no grid layout. Nest boxes with `flexDirection`.",
  whiteSpace: "Use `wrapMode` on <text>.",
  textOverflow: "Truncate the string, or set `overflow: \"hidden\"`.",
  verticalAlign: "Use `alignItems` on the parent.",
}
