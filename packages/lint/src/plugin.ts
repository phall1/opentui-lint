import noOrphanTextNodes from "./rules/no-orphan-text-nodes.js"
import noUnknownElements from "./rules/no-unknown-elements.js"
import noWebProps from "./rules/no-web-props.js"
import noWebsiteSpacing from "./rules/no-website-spacing.js"
import textMustBeWrapped from "./rules/text-must-be-wrapped.js"
import validColors from "./rules/valid-colors.js"

export const rules = {
  "no-orphan-text-nodes": noOrphanTextNodes,
  "no-unknown-elements": noUnknownElements,
  "no-web-props": noWebProps,
  "no-website-spacing": noWebsiteSpacing,
  "text-must-be-wrapped": textMustBeWrapped,
  "valid-colors": validColors,
}

export type RuleName = keyof typeof rules

/**
 * Crashes and silently-wrong renders only. Every rule here reports something
 * that a typecheck cannot see and that a person would call a bug, so these are
 * errors and there is nothing stylistic to argue about.
 */
export const recommended: Record<string, "error"> = {
  "opentui/no-unknown-elements": "error",
  "opentui/text-must-be-wrapped": "error",
  "opentui/no-orphan-text-nodes": "error",
  "opentui/valid-colors": "error",
  "opentui/no-web-props": "error",
}

/** Everything in `recommended`, plus the terminal design-system rules. */
export const strict: Record<string, "error"> = {
  ...recommended,
  "opentui/no-website-spacing": "error",
}

export const plugin = {
  meta: { name: "opentui-lint" },
  rules,
}

export default plugin
