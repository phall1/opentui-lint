import rule from "../src/rules/text-must-be-wrapped.js"
import { asRule, tester, undetectedTester } from "./helpers.js"

/** An invalid case whose autofix wraps `child` where it stands. */
function wrapped(before: string, child: string) {
  return {
    code: before,
    output: before.replace(child, `<text>${child}</text>`),
    errors: [{ message: /renders as a text node/ }],
  }
}

tester().run("text-must-be-wrapped", asRule(rule), {
  valid: [
    "const a = <text>Hello</text>",
    "const a = <box><text>Hello</text></box>",
    "const a = <text>{count}</text>",
    "const a = <text>Total: {count}</text>",
    `const a = <text><b>Bold</b> and plain</text>`,
    // Whitespace between elements is dropped by JSX and never reaches the
    // reconciler.
    `const a = (
       <box>
         <text>one</text>
         <text>two</text>
       </box>
     )`,
    // Elements, not text.
    "const a = <box>{items.map((i) => <text>{i}</text>)}</box>",
    // An identifier could be an element; reporting it would be a guess.
    "const a = <box>{label}</box>",
    // Likewise `i.label` — a property access is not provably a string, and the
    // rule reports only text it can prove. See docs/rules/text-must-be-wrapped.md.
    "const a = <box>{items.map((i) => i.label)}</box>",
    "const a = <box>{renderRow()}</box>",
    // Past a component boundary the enclosing <text> is unknowable.
    "const Row = () => 'plain string'",
    `const Row = () => <>{"hi"}</>`,
    "const a = <text><b>ok</b></text>",
  ],
  invalid: [
    // Regression: an arrow-function component must not read as an unknowable
    // component boundary — the <box> is right there.
    wrapped("const App = () => <box>Hello</box>", "Hello"),
    wrapped("export function App() { return <box>Hello</box> }", "Hello"),
    // An outer <text> does not reach through an intervening <box>.
    wrapped("const a = <text><box>Hello</box></text>", "Hello"),
    wrapped("const a = <scrollbox>{`${count} items`}</scrollbox>", "{`${count} items`}"),
    wrapped(`const a = <box>{"Total: " + count}</box>`, `{"Total: " + count}`),
    wrapped("const a = <box>{count.toFixed(2)}</box>", "{count.toFixed(2)}"),
    wrapped(`const a = <box>{ready && "online"}</box>`, `{ready && "online"}`),
    wrapped(`const a = <box>{parts.join(", ")}</box>`, `{parts.join(", ")}`),
  ],
})

/**
 * The grouping behavior, which is the whole reason the fix works on runs.
 *
 * A box lays out as a column by default, so wrapping each stray child on its
 * own would silently put every fragment on its own line.
 */
tester().run("text-must-be-wrapped (run grouping)", asRule(rule), {
  valid: [],
  invalid: [
    {
      // One run spanning text, a modifier and more text — one <text>, one line.
      code: "const a = <box>Total: <b>7</b> items</box>",
      output: "const a = <box><text>Total: <b>7</b> items</text></box>",
      errors: 2,
    },
    {
      // Two runs separated by a real renderable stay two <text> elements,
      // because that is genuinely two lines.
      code: "const a = <box>one<box /><text>mid</text>two</box>",
      output: "const a = <box><text>one</text><box /><text>mid</text><text>two</text></box>",
      errors: 2,
    },
    {
      // Interleaved text and interpolation is a single run.
      code: "const a = <box>Ready: {count.toFixed(0)} of {total.toFixed(0)}</box>",
      output: "const a = <box><text>Ready: {count.toFixed(0)} of {total.toFixed(0)}</text></box>",
      // Two text fragments plus two interpolations, all in one run.
      errors: 4,
    },
  ],
})

tester("solid").run("text-must-be-wrapped (solid)", asRule(rule), {
  valid: ["const a = <text>Hello</text>", "const a = <box><text>{count()}</text></box>"],
  invalid: [
    {
      code: "const App = () => <box>Hello</box>",
      output: "const App = () => <box><text>Hello</text></box>",
      errors: [{ message: /Orphan text error: "…" must have a <text> as a parent.*no error boundary/s }],
    },
  ],
})

undetectedTester().run("text-must-be-wrapped (not an OpenTUI file)", asRule(rule), {
  valid: [`export const Page = () => <div>Hello</div>`],
  invalid: [],
})

/**
 * `checkTypes` is opt-in and must not change anything about the default
 * (syntactic-only) behavior above — including when it is turned on but there
 * is nowhere to get type information from. `tester()` has no
 * `parserOptions.project`, so this is exactly that "no type checker" case;
 * see `test/type-aware.test.ts` for the full type-classification matrix
 * against a real tsconfig.
 */
tester().run("text-must-be-wrapped (checkTypes, no type checker available)", asRule(rule), {
  valid: [
    // Off by default: unaffected by whether a type checker exists.
    "const a = <box>{label}</box>",
    // On, but nothing to check types with — must degrade to the syntactic
    // result (not reported) rather than guess or throw.
    { code: "const a = <box>{label}</box>", options: [{ checkTypes: true }] },
  ],
  invalid: [
    // The syntactic half of the rule still fires normally with the option on.
    { ...wrapped("const a = <box>Hello</box>", "Hello"), options: [{ checkTypes: true }] },
  ],
})

/**
 * Regression: a component is not a renderable.
 *
 * Found by running the rules over OpenTUI's own examples, where
 * `<text><Show when={x}>hello</Show></text>` — ordinary, correct Solid — was
 * reported 19 times across both bindings. The walk treated the first enclosing
 * JSXElement as the runtime parent without asking whether it was a host
 * element at all.
 *
 * Framework control flow passes children through, so the walk continues past
 * it. A component someone wrote themselves could render its children anywhere,
 * so the answer there is unknowable and the rule stays quiet.
 */
tester("solid").run("text-must-be-wrapped (components are not renderables)", asRule(rule), {
  valid: [
    `const A = () => <text><Show when={x}>hello</Show></text>`,
    `const A = () => <text><For each={xs}>{(i) => "row"}</For></text>`,
    `const A = () => <text><Switch><Match when={x}>hi</Match></Switch></text>`,
    // Unknowable: KeyLabel could render its children anywhere.
    `const A = () => <text><KeyLabel>ctrl</KeyLabel></text>`,
    `const A = () => <box><KeyLabel>ctrl</KeyLabel></box>`,
  ],
  invalid: [
    {
      // Control flow is transparent in both directions: the walk passes through
      // it and finds the <box>, so this is still the crash it always was.
      code: `const A = () => <box><Show when={x}>hello</Show></box>`,
      output: `const A = () => <box><Show when={x}><text>hello</text></Show></box>`,
      errors: [{ message: /renders as a text node/ }],
    },
  ],
})
