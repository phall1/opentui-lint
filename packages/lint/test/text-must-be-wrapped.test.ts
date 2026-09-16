import rule from "../src/rules/text-must-be-wrapped.js"
import { asRule, tester, undetectedTester } from "./helpers.js"

/** Builds the invalid case for a child that should have been wrapped. */
function wrapped(before: string, child: string) {
  return {
    code: before,
    errors: [
      {
        message: /renders as a text node/,
        suggestions: [{ desc: "Wrap in <text>", output: before.replace(child, `<text>${child}</text>`) }],
      },
    ],
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
    wrapped("const a = <box>Hello</box>", "Hello"),
    wrapped("const a = <scrollbox>{`${count} items`}</scrollbox>", "{`${count} items`}"),
    wrapped(`const a = <box>{"Total: " + count}</box>`, `{"Total: " + count}`),
    wrapped("const a = <box>{count.toFixed(2)}</box>", "{count.toFixed(2)}"),
    wrapped(`const a = <box>{ready && "online"}</box>`, `{ready && "online"}`),
    // A joined array really is a string.
    wrapped(`const a = <box>{parts.join(", ")}</box>`, `{parts.join(", ")}`),
  ],
})

undetectedTester().run("text-must-be-wrapped (not an OpenTUI file)", asRule(rule), {
  valid: [`export const Page = () => <div>Hello</div>`],
  invalid: [],
})
