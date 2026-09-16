/**
 * One entry per rule the plugin exports, each pointing at a real fixture file
 * under `fixtures/react` and — for rules whose logic branches on
 * `context.framework` — `fixtures/solid` too.
 *
 * `coverage.test.ts` diffs the keys of this table against `Object.keys(rules)`
 * from the built package, so adding a rule to `src/plugin.ts` without adding a
 * row here fails the suite instead of silently shipping an unverified rule.
 * That check is the point of requirement 2 in the task this package exists to
 * satisfy — see AGENTS.md's "A rule with no conformance case is a claim
 * nobody checked," which applies here exactly as it does to the ESLint
 * conformance packages.
 */

export interface RuleFixture {
  /** Relative to `fixtures/`. */
  file: string
  /** A substring the rule's message must contain for this fixture. */
  expect: string
}

export interface RuleCoverage {
  /**
   * Whether the rule's own logic reads `context.framework` (not just the
   * uniform framework *gate* every rule gets from `defineRule`, which every
   * rule has regardless). Only these need a Solid fixture: the other rules
   * report the same thing regardless of binding.
   */
  frameworkSensitive: boolean
  react: RuleFixture
  solid?: RuleFixture
}

export const RULE_COVERAGE: Record<string, RuleCoverage> = {
  "no-unknown-elements": {
    frameworkSensitive: true,
    react: { file: "react/no-unknown-elements.tsx", expect: "Unknown component type: div" },
    // Cross-binding spelling: solid's own catalogue is ascii_font, so <ascii-font>
    // hits the "this is the other binding's name" branch, not "unknown tag".
    solid: { file: "solid/no-unknown-elements.tsx", expect: "is the @opentui/react spelling" },
  },
  "text-must-be-wrapped": {
    frameworkSensitive: true,
    react: { file: "react/text-must-be-wrapped.tsx", expect: "Text must be created inside of a text node" },
    solid: { file: "solid/text-must-be-wrapped.tsx", expect: "must have a <text> as a parent" },
  },
  "no-orphan-text-nodes": {
    frameworkSensitive: true,
    react: { file: "react/no-orphan-text-nodes.tsx", expect: "is a text modifier, not a renderable" },
    solid: { file: "solid/no-orphan-text-nodes.tsx", expect: "must have a <text> as a parent" },
  },
  "valid-colors": {
    // The message text does not depend on the framework — parseColor() and
    // the fallback-to-magenta behavior are shared by both bindings.
    frameworkSensitive: false,
    react: { file: "react/valid-colors.tsx", expect: "will render magenta" },
  },
  "no-web-props": {
    frameworkSensitive: true,
    react: { file: "react/no-web-props.tsx", expect: "does nothing on <box>" },
    // Solid's on:click must stay silent while className is still flagged —
    // see solid/no-web-props.tsx and channels.test.ts's exact-count assertion.
    solid: { file: "solid/no-web-props.tsx", expect: "does nothing on <box>" },
  },
  "no-unsupported-values": {
    frameworkSensitive: true,
    react: { file: "react/no-unsupported-values.tsx", expect: "ErrorBoundary catches it" },
    solid: { file: "solid/no-unsupported-values.tsx", expect: "There is no error boundary" },
  },
  "require-registration": {
    frameworkSensitive: true,
    react: { file: "react/require-registration.tsx", expect: "registerQRCode() runs" },
    solid: { file: "solid/require-registration.tsx", expect: "@opentui/qrcode/solid" },
  },
  "no-raw-stdout": {
    // Reads context.filename, not context.framework — the check and its
    // message are identical in both bindings.
    frameworkSensitive: false,
    react: { file: "react/no-raw-stdout.tsx", expect: "corrupts the frame" },
  },
  "no-website-spacing": {
    frameworkSensitive: false,
    react: { file: "react/no-website-spacing.tsx", expect: "spends 4 rows and columns" },
  },
}
