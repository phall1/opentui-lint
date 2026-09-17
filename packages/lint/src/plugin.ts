import noMagicDensity from "./rules/no-magic-density.js";
import noOrphanTextNodes from "./rules/no-orphan-text-nodes.js";
import noRawStdout from "./rules/no-raw-stdout.js";
import noUnknownElements from "./rules/no-unknown-elements.js";
import noWebProps from "./rules/no-web-props.js";
import noUnsupportedValues from "./rules/no-unsupported-values.js";
import noWebsiteSpacing from "./rules/no-website-spacing.js";
import noRestyle from "./rules/no-restyle.js";
import requireRegistration from "./rules/require-registration.js";
import useThemeTokens from "./rules/use-theme-tokens.js";
import textMustBeWrapped from "./rules/text-must-be-wrapped.js";
import validColors from "./rules/valid-colors.js";

export const rules = {
  "no-magic-density": noMagicDensity,
  "no-orphan-text-nodes": noOrphanTextNodes,
  "no-raw-stdout": noRawStdout,
  "no-unknown-elements": noUnknownElements,
  "no-web-props": noWebProps,
  "no-restyle": noRestyle,
  "no-unsupported-values": noUnsupportedValues,
  "no-website-spacing": noWebsiteSpacing,
  "require-registration": requireRegistration,
  "text-must-be-wrapped": textMustBeWrapped,
  "use-theme-tokens": useThemeTokens,
  "valid-colors": validColors,
};

export type RuleName = keyof typeof rules;

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
  "opentui/no-unsupported-values": "error",
  "opentui/require-registration": "error",
  "opentui/no-raw-stdout": "error",
};

/**
 * Everything in `recommended`, plus the design-system rules.
 *
 * These are kept out of `recommended` on purpose. Each one reports code that
 * works — a literal renders exactly like the token it matches, and tuiparts
 * recipes deliberately let a call site override their themed defaults. They
 * enforce a policy about where styling decisions live, which is a choice a
 * project makes rather than a defect anyone can point at.
 *
 * The three that need a theme go quiet on their own when a project has none, so
 * enabling this preset in a project without a design system costs nothing but
 * the spacing budget.
 */
export const strict: Record<string, "error"> = {
  ...recommended,
  "opentui/no-website-spacing": "error",
  "opentui/no-restyle": "error",
  "opentui/use-theme-tokens": "error",
  "opentui/no-magic-density": "error",
};

export const plugin = {
  meta: { name: "opentui-lint" },
  rules,
};

export default plugin;
